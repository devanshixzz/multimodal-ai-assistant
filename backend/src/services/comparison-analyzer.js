import fs from "fs/promises";

import { prepareImageForVision } from "./image-processor.js";
import {
  analyzeImages,
  analyzeImage,
} from "./vision.js";

/**
 * Compare 2+ images in a single Gemini multimodal request.
 *
 * The images are:
 * 1. Read from their stored paths
 * 2. Resized/compressed for vision
 * 3. Sent together in their original selection order
 * 4. Parsed into a predictable comparison structure
 */
const analyzeImageComparison = async (
  images,
  {
    userQuestion = null,
  } = {}
) => {
  if (
    !Array.isArray(images) ||
    images.length < 2
  ) {
    const error = new Error(
      "At least two images are required for comparison."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please select at least two images to compare.";

    throw error;
  }

  const preparedImages = [];
  const failedImages = [];

  /*
   * Prepare every image before sending anything
   * to Gemini.
   */
  for (
    let index = 0;
    index < images.length;
    index += 1
  ) {
    const image = images[index];

    if (!image?.path) {
      failedImages.push({
        image: index + 1,
        mediaId: image?.id || null,
        originalName:
          image?.original_name ||
          `Image ${index + 1}`,
        reason: "Image file path is missing.",
      });

      continue;
    }

    try {
      const imageBuffer = await fs.readFile(
        image.path
      );

      if (!imageBuffer.length) {
        throw new Error(
          "The image file is empty."
        );
      }

      /*
       * Keep payloads reasonably small while
       * preserving enough visual detail for comparison.
       */
      const prepared =
        await prepareImageForVision(
          imageBuffer,
          {
            maxWidth: 1536,
            maxHeight: 1536,
            quality: 80,
          }
        );

      if (
        !prepared ||
        !Buffer.isBuffer(prepared) ||
        prepared.length === 0
      ) {
        throw new Error(
          "Image preparation returned an empty buffer."
        );
      }

      preparedImages.push({
        buffer: prepared,
        mimeType: "image/jpeg",
        mediaId: image.id,
        originalName:
          image.original_name ||
          `Image ${index + 1}`,
        imageNumber: index + 1,
      });
    } catch (error) {
      console.warn(
        `Failed to prepare comparison image ${image.id}:`,
        error.message
      );

      failedImages.push({
        image: index + 1,
        mediaId: image.id,
        originalName:
          image.original_name ||
          `Image ${index + 1}`,
        reason: error.message,
      });
    }
  }

  /*
   * Comparison requires at least two usable images.
   */
  if (preparedImages.length < 2) {
    const failedNames = failedImages
      .map(
        (item) =>
          item.originalName ||
          `Image ${item.image}`
      )
      .join(", ");

    const error = new Error(
      `Only ${preparedImages.length} valid image(s) could be prepared.`
    );

    error.statusCode = 422;
    error.publicMessage =
      failedNames
        ? `At least two valid images are required for comparison. Could not process: ${failedNames}.`
        : "At least two valid images are required for comparison.";

    throw error;
  }

  /*
   * Build a strong multimodal comparison prompt.
   *
   * Important:
   * The model receives the images in exactly the same
   * order as this prompt describes them.
   */
  const imageLabels = preparedImages
    .map(
      (image) =>
        `Image ${image.imageNumber}: ${image.originalName}`
    )
    .join("\n");

  const prompt = `
You are an expert visual comparison assistant.

You have been given ${
    preparedImages.length
  } images in a specific order.

IMAGE ORDER:
${imageLabels}

Analyze ALL supplied images together.

The images may contain photographs, screenshots,
documents, UI designs, diagrams, charts, products,
or other visual content.

Your job is to identify what is visibly present,
compare the images carefully, and answer the user's
question if one was provided.

IMPORTANT RULES:

1. Analyze every supplied image.
2. Preserve the image numbering exactly.
3. Base factual observations only on visible information.
4. Do not invent hidden metadata, context, intentions,
   identities, or details that cannot be observed.
5. Clearly separate observable differences from
   higher-level interpretations.
6. Mention meaningful similarities, not just differences.
7. Mention meaningful differences, not trivial wording
   or formatting differences unless they matter.
8. If images show different subjects, explicitly say so.
9. If an image is difficult to interpret, say that rather
   than guessing.
10. If the user asks a specific comparison question,
    answer that question directly.
11. Do not compare image quality unless it is relevant
    to the user's question.
12. Keep the result concise but sufficiently detailed.
13. Return ONLY valid JSON.
14. Do not wrap the JSON in Markdown code fences.

Return EXACTLY this structure:

{
  "summary": "A concise overall summary of what the images have in common and how they differ.",
  "similarities": [
    "Meaningful similarity 1",
    "Meaningful similarity 2"
  ],
  "differences": [
    "Meaningful difference 1",
    "Meaningful difference 2"
  ],
  "imageObservations": [
    {
      "image": 1,
      "observation": "Important observation about Image 1."
    },
    {
      "image": 2,
      "observation": "Important observation about Image 2."
    }
  ],
  "overallInterpretation": "A concise interpretation of the comparison."
}

USER QUESTION:
${
  userQuestion &&
  typeof userQuestion === "string" &&
  userQuestion.trim()
    ? userQuestion.trim()
    : "No specific question was provided. Give a general visual comparison."
}

When answering the user's question, keep the exact
JSON structure above.
`;

  let analysis;

  try {
    analysis = await analyzeImages(
      preparedImages.map(
        ({
          buffer,
          mimeType,
        }) => ({
          buffer,
          mimeType,
        })
      ),
      prompt
    );
  } catch (error) {
    /*
     * Preserve the useful application error from
     * vision.js instead of hiding it.
     */
    console.error(
      "Image comparison Gemini request failed:",
      error
    );

    throw error;
  }

  const parsed =
    parseComparisonResponse(analysis);

  return {
    ...parsed,

    imagesCompared:
      preparedImages.map(
        (image) => ({
          image: image.imageNumber,
          mediaId: image.mediaId,
          originalName: image.originalName,
        })
      ),

    failedImages,
  };
};


/**
 * Run the same question independently against
 * multiple images.
 *
 * This is the batch Good-to-Have feature and is
 * intentionally separate from image comparison.
 */
const analyzeImageBatch = async (
  images,
  {
    userQuestion,
    onProgress = () => {},
  } = {}
) => {
  if (
    !Array.isArray(images) ||
    images.length === 0
  ) {
    const error = new Error(
      "At least one image is required for batch analysis."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please select at least one image.";

    throw error;
  }

  if (
    !userQuestion ||
    typeof userQuestion !== "string" ||
    !userQuestion.trim()
  ) {
    const error = new Error(
      "A question is required for batch analysis."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please enter a question to run across the selected images.";

    throw error;
  }

  const results = [];

  for (
    let index = 0;
    index < images.length;
    index += 1
  ) {
    const image = images[index];

    try {
      const imageBuffer = await fs.readFile(
        image.path
      );

      if (!imageBuffer.length) {
        throw new Error(
          "The image file is empty."
        );
      }

      const prepared =
        await prepareImageForVision(
          imageBuffer,
          {
            maxWidth: 1536,
            maxHeight: 1536,
            quality: 80,
          }
        );

      const answer = await analyzeImage(
        prepared,
        "image/jpeg",
        userQuestion.trim()
      );

      results.push({
        image: index + 1,
        mediaId: image.id,
        originalName:
          image.original_name ||
          `Image ${index + 1}`,
        success: true,
        answer,
      });
    } catch (error) {
      console.error(
        `Batch analysis failed for ${image.id}:`,
        error.message
      );

      results.push({
        image: index + 1,
        mediaId: image.id,
        originalName:
          image.original_name ||
          `Image ${index + 1}`,
        success: false,
        answer: null,
        error:
          error.publicMessage ||
          "This image could not be analyzed.",
      });
    }

    onProgress({
      current: index + 1,
      total: images.length,
      percentage: Math.round(
        ((index + 1) /
          images.length) *
          100
      ),
    });
  }

  return {
    question: userQuestion.trim(),
    results,
  };
};


/**
 * Parse Gemini's comparison response.
 *
 * Handles:
 * - plain JSON
 * - ```json ... ```
 * - accidental surrounding whitespace
 */
const parseComparisonResponse = (
  outputText
) => {
  if (
    !outputText ||
    typeof outputText !== "string"
  ) {
    const error = new Error(
      "Comparison AI returned an empty response."
    );

    error.statusCode = 502;
    error.publicMessage =
      "The AI service returned an empty comparison.";

    throw error;
  }

  let cleaned =
    outputText.trim();

  /*
   * Remove Markdown fences if Gemini adds them
   * despite being instructed not to.
   */
  if (
    cleaned.startsWith("```")
  ) {
    cleaned = cleaned
      .replace(
        /^```(?:json)?\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();
  }

  /*
   * If Gemini accidentally surrounds the JSON with
   * explanatory text, attempt to isolate the outer
   * JSON object.
   */
  if (
    !cleaned.startsWith("{") ||
    !cleaned.endsWith("}")
  ) {
    const firstBrace =
      cleaned.indexOf("{");
    const lastBrace =
      cleaned.lastIndexOf("}");

    if (
      firstBrace >= 0 &&
      lastBrace > firstBrace
    ) {
      cleaned = cleaned.slice(
        firstBrace,
        lastBrace + 1
      );
    }
  }

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error(
      "Failed to parse comparison JSON:",
      outputText
    );

    const wrappedError =
      new Error(
        `Invalid comparison JSON: ${error.message}`
      );

    wrappedError.statusCode = 502;
    wrappedError.publicMessage =
      "The AI service returned an invalid comparison.";

    throw wrappedError;
  }

  return {
    summary:
      typeof parsed.summary === "string"
        ? parsed.summary.trim()
        : "",

    similarities:
      Array.isArray(
        parsed.similarities
      )
        ? parsed.similarities
            .map(String)
            .map(
              (item) => item.trim()
            )
            .filter(Boolean)
        : [],

    differences:
      Array.isArray(
        parsed.differences
      )
        ? parsed.differences
            .map(String)
            .map(
              (item) => item.trim()
            )
            .filter(Boolean)
        : [],

    imageObservations:
      Array.isArray(
        parsed.imageObservations
      )
        ? parsed.imageObservations
            .filter(
              (item) =>
                item &&
                typeof item ===
                  "object"
            )
            .map((item) => ({
              image:
                Number(
                  item.image
                ) || null,

              observation:
                typeof item.observation ===
                "string"
                  ? item.observation.trim()
                  : "",
            }))
            .filter(
              (item) =>
                item.observation
            )
        : [],

    overallInterpretation:
      typeof parsed.overallInterpretation ===
      "string"
        ? parsed.overallInterpretation.trim()
        : "",
  };
};


export {
  analyzeImageComparison,
  analyzeImageBatch,
  parseComparisonResponse,
};