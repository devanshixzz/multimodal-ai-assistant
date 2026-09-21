import fs from "fs/promises";

import { prepareImageForVision } from "./image-processor.js";
import { analyzeImages } from "./vision.js";

const DEFAULT_MAX_PAGES = 12;

const analyzeDocumentPages = async (
  pages,
  {
    userQuestion = null,
    maxPages = DEFAULT_MAX_PAGES,
    onProgress = () => {},
  } = {}
) => {
  if (!Array.isArray(pages) || pages.length === 0) {
    const error = new Error("No rendered document pages were provided.");
    error.statusCode = 400;
    error.publicMessage = "No document pages are available for analysis.";
    throw error;
  }

  if (maxPages <= 0) {
    const error = new Error("maxPages must be greater than zero.");
    error.statusCode = 400;
    error.publicMessage = "Invalid maximum page count.";
    throw error;
  }

  // Keep the full rendered document available, but limit the number
  // of pages sent to the vision model.
  const selectedPages = selectPages(pages, maxPages);

  const preparedImages = [];
  const analyzedPageNumbers = [];

  for (let index = 0; index < selectedPages.length; index += 1) {
    const page = selectedPages[index];

    try {
      const pageBuffer = await fs.readFile(page.path);

      const prepared = await prepareImageForVision(pageBuffer, {
  maxWidth: 1536,
  maxHeight: 1536,
  quality: 80,
});

preparedImages.push({
  buffer: prepared,
  mimeType: "image/jpeg",
});

      analyzedPageNumbers.push(page.pageNumber);

      onProgress({
        current: index + 1,
        total: selectedPages.length,
        percentage: Math.round(
          ((index + 1) / selectedPages.length) * 100
        ),
        pageNumber: page.pageNumber,
      });
    } catch (error) {
      console.warn(
        `Failed to prepare document page ${page.pageNumber}:`,
        error.message
      );
    }
  }

  if (preparedImages.length === 0) {
    const error = new Error(
      "None of the rendered document pages could be prepared."
    );
    error.statusCode = 422;
    error.publicMessage =
      "The document pages could not be prepared for AI analysis.";
    throw error;
  }

  const pageList = analyzedPageNumbers
    .map((pageNumber) => `Page ${pageNumber}`)
    .join(", ");

  const prompt = `
You are analyzing a document from rendered page images.

Analyze ONLY the information that is visibly present in the supplied document pages.
Do not invent, infer, or hallucinate missing values.

Return ONLY valid JSON.

Use exactly this structure:

{
  "documentType": "string",
  "summary": "string",
  "text": [
    {
      "page": 1,
      "content": "string"
    }
  ],
  "tables": [
    {
      "page": 1,
      "title": "string or null",
      "headers": ["string"],
      "rows": [
        ["string"]
      ]
    }
  ],
  "forms": [
    {
      "page": 1,
      "title": "string or null",
      "fields": [
        {
          "label": "string",
          "value": "string or null"
        }
      ]
    }
  ],
  "keyInformation": [
    {
      "label": "string",
      "value": "string",
      "page": 1
    }
  ]
}

Rules:

1. "documentType" should describe the visible document type, such as
   invoice, resume, application form, report, certificate, statement,
   contract, or other appropriate type.

2. "summary" should provide a concise summary of the document content.

3. "text" should contain important readable text from the document.
   Preserve the page number.

4. "tables" should contain detected tables.
   Preserve headers and rows as accurately as possible.
   If there are no tables, return [].

5. "forms" should contain detected forms and their visible fields.
   If there are no forms, return [].

6. "keyInformation" should contain important structured information
   such as names, dates, IDs, totals, organizations, addresses,
   percentages, amounts, or other clearly visible values.

7. If information is unreadable, use null rather than guessing.

8. Do not create information that is not visible in the supplied pages.

9. Page numbers must refer to the original document page numbers.

10. The supplied pages are:
${pageList}

${
  userQuestion
    ? `
The user also asked this question about the document:

"${userQuestion}"

Answer the question using only the supplied document pages while
still returning the exact JSON structure above.
`
    : ""
}
`;

  try {
    const analysis = await analyzeImages(preparedImages, prompt);

    const parsed = parseDocumentAnalysisResponse(analysis);

    return {
      ...parsed,
      pagesAnalyzed: analyzedPageNumbers,
      totalPagesAvailable: pages.length,
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    const wrappedError = new Error(
      `Document AI analysis failed: ${error.message}`
    );

    wrappedError.statusCode = 502;
    wrappedError.publicMessage =
      "The document could not be analyzed by the AI service.";

    throw wrappedError;
  }
};


/**
 * Select pages while keeping the beginning, middle and end
 * of larger documents represented.
 */
const selectPages = (pages, maxPages) => {
  if (pages.length <= maxPages) {
    return pages;
  }

  if (maxPages === 1) {
    return [pages[0]];
  }

  const selectedIndexes = [];
  const seen = new Set();

  for (let index = 0; index < maxPages; index += 1) {
    const ratio = index / (maxPages - 1);

    const pageIndex = Math.round(
      ratio * (pages.length - 1)
    );

    if (!seen.has(pageIndex)) {
      seen.add(pageIndex);
      selectedIndexes.push(pageIndex);
    }
  }

  return selectedIndexes
    .sort((a, b) => a - b)
    .map((index) => pages[index]);
};


/**
 * Parse and validate the JSON returned by Gemini.
 */
const parseDocumentAnalysisResponse = (outputText) => {
  if (!outputText || typeof outputText !== "string") {
    const error = new Error(
      "Document AI returned an empty response."
    );

    error.statusCode = 502;
    error.publicMessage =
      "The AI service returned an empty document analysis.";

    throw error;
  }

  let cleaned = outputText.trim();

  // Gemini may occasionally wrap JSON in markdown fences.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const wrappedError = new Error(
      `Invalid JSON returned by document AI: ${error.message}`
    );

    wrappedError.statusCode = 502;
    wrappedError.publicMessage =
      "The AI service returned an invalid document analysis.";

    throw wrappedError;
  }

  if (!parsed || typeof parsed !== "object") {
    const error = new Error(
      "Document analysis response is not an object."
    );

    error.statusCode = 502;
    error.publicMessage =
      "The AI service returned an invalid document analysis.";

    throw error;
  }

  return {
    documentType:
      typeof parsed.documentType === "string"
        ? parsed.documentType
        : "Unknown",

    summary:
      typeof parsed.summary === "string"
        ? parsed.summary
        : "",

    text: normalizeText(parsed.text),

    tables: normalizeTables(parsed.tables),

    forms: normalizeForms(parsed.forms),

    keyInformation: normalizeKeyInformation(
      parsed.keyInformation
    ),
  };
};


const normalizeText = (text) => {
  if (!Array.isArray(text)) {
    return [];
  }

  return text
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      page: Number(item.page) || null,
      content:
        typeof item.content === "string"
          ? item.content.trim()
          : "",
    }))
    .filter((item) => item.content);
};


const normalizeTables = (tables) => {
  if (!Array.isArray(tables)) {
    return [];
  }

  return tables
    .filter((table) => table && typeof table === "object")
    .map((table) => ({
      page: Number(table.page) || null,

      title:
        typeof table.title === "string"
          ? table.title.trim()
          : null,

      headers: Array.isArray(table.headers)
        ? table.headers.map((header) =>
            String(header ?? "").trim()
          )
        : [],

      rows: Array.isArray(table.rows)
        ? table.rows.map((row) =>
            Array.isArray(row)
              ? row.map((cell) =>
                  String(cell ?? "").trim()
                )
              : []
          )
        : [],
    }));
};


const normalizeForms = (forms) => {
  if (!Array.isArray(forms)) {
    return [];
  }

  return forms
    .filter((form) => form && typeof form === "object")
    .map((form) => ({
      page: Number(form.page) || null,

      title:
        typeof form.title === "string"
          ? form.title.trim()
          : null,

      fields: Array.isArray(form.fields)
        ? form.fields
            .filter(
              (field) =>
                field && typeof field === "object"
            )
            .map((field) => ({
              label:
                typeof field.label === "string"
                  ? field.label.trim()
                  : "",

              value:
                field.value === null ||
                field.value === undefined
                  ? null
                  : String(field.value).trim(),
            }))
            .filter((field) => field.label)
        : [],
    }));
};


const normalizeKeyInformation = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label:
        typeof item.label === "string"
          ? item.label.trim()
          : "",

      value:
        item.value === null ||
        item.value === undefined
          ? ""
          : String(item.value).trim(),

      page: Number(item.page) || null,
    }))
    .filter((item) => item.label && item.value);
};


export {
  analyzeDocumentPages,
  selectPages,
  parseDocumentAnalysisResponse,
};