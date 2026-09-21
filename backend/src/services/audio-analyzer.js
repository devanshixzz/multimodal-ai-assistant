import config from "../config.js";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: config.ai.geminiApiKey,
});

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Analyze an audio transcript using Gemini.
 *
 * Returns structured information:
 * - summary
 * - topics
 * - sentiment
 */
const analyzeTranscript = async (
  transcript,
  { userQuestion = null } = {}
) => {
  if (!transcript || typeof transcript !== "string") {
    const error = new Error("Transcript is required.");
    error.statusCode = 400;
    error.publicMessage =
      "A transcript is required for audio analysis.";
    throw error;
  }

  const trimmedTranscript = transcript.trim();

  if (!trimmedTranscript) {
    const error = new Error("Transcript cannot be empty.");
    error.statusCode = 400;
    error.publicMessage =
      "The audio transcript is empty.";
    throw error;
  }

  if (!config.ai.geminiApiKey) {
    const error = new Error(
      "Gemini API key is not configured."
    );
    error.statusCode = 503;
    error.publicMessage =
      "Audio analysis is not configured yet.";
    throw error;
  }

  const prompt = `
You are analyzing a transcript from an audio recording.

Return ONLY valid JSON.
Do not wrap the JSON in markdown code fences.

Use exactly this structure:

{
  "summary": "A concise summary of the recording.",
  "topics": [
    "Topic 1",
    "Topic 2"
  ],
  "sentiment": {
    "label": "positive | neutral | negative | mixed",
    "explanation": "Brief explanation of the overall sentiment."
  }
}

Rules:
- Base the analysis only on the transcript.
- Do not invent facts that are not present.
- Keep the summary concise but informative.
- Identify the main topics discussed.
- Sentiment should describe the overall tone expressed in the transcript.
- If the sentiment is mixed, explain why.

${
  userQuestion
    ? `The user also asked: "${userQuestion.trim()}"`
    : ""
}

Transcript:
"""
${trimmedTranscript}
"""
`;

  try {
    const interaction = await ai.interactions.create({
      model: DEFAULT_MODEL,
      input: [
        {
          type: "text",
          text: prompt,
        },
      ],
    });

    const outputText = interaction.output_text;

    if (!outputText || !outputText.trim()) {
      const error = new Error(
        "Gemini returned an empty audio analysis."
      );
      error.statusCode = 502;
      error.publicMessage =
        "The AI analysis service returned an empty response.";
      throw error;
    }

    return parseAnalysisResponse(outputText);
  } catch (error) {
    console.error(
      "Audio transcript analysis failed:",
      error
    );

    if (error.statusCode && error.publicMessage) {
      throw error;
    }

    const wrappedError = new Error(
      `Audio analysis failed: ${error.message}`
    );

    wrappedError.statusCode = 502;
    wrappedError.publicMessage =
      "The AI audio analysis service could not process the transcript. Please try again.";

    throw wrappedError;
  }
};

/**
 * Parse and validate Gemini's JSON response.
 */
const parseAnalysisResponse = (outputText) => {
  let parsed;

  try {
    parsed = JSON.parse(outputText.trim());
  } catch {
    // Gemini occasionally returns JSON inside
    // markdown fences despite instructions.
    const cleaned = outputText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const error = new Error(
        "Gemini returned invalid JSON."
      );
      error.statusCode = 502;
      error.publicMessage =
        "The AI returned an invalid analysis format.";
      throw error;
    }
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    const error = new Error(
      "Audio analysis response must be an object."
    );
    error.statusCode = 502;
    error.publicMessage =
      "The AI returned an invalid analysis format.";
    throw error;
  }

  const summary =
    typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : "";

  const topics = Array.isArray(parsed.topics)
    ? parsed.topics
        .filter(
          (topic) => typeof topic === "string"
        )
        .map((topic) => topic.trim())
        .filter(Boolean)
    : [];

  const sentimentLabel =
    typeof parsed.sentiment?.label === "string"
      ? parsed.sentiment.label.trim().toLowerCase()
      : "neutral";

  const allowedSentiments = [
    "positive",
    "neutral",
    "negative",
    "mixed",
  ];

  const sentiment = {
    label: allowedSentiments.includes(
      sentimentLabel
    )
      ? sentimentLabel
      : "neutral",
    explanation:
      typeof parsed.sentiment?.explanation === "string"
        ? parsed.sentiment.explanation.trim()
        : "",
  };

  if (!summary) {
    const error = new Error(
      "Audio analysis did not contain a summary."
    );
    error.statusCode = 502;
    error.publicMessage =
      "The AI analysis did not contain a usable summary.";
    throw error;
  }

  return {
    summary,
    topics,
    sentiment,
  };
};

export {
  analyzeTranscript,
  parseAnalysisResponse,
};