import { GoogleGenAI } from "@google/genai";
import config from "../config.js";

if (!config.ai.geminiApiKey) {
  console.warn(
    "⚠️ GEMINI_API_KEY is not configured. Vision requests will fail until it is added."
  );
}

const ai = new GoogleGenAI({
  apiKey: config.ai.geminiApiKey,
});

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Convert an upstream Gemini error into a predictable application error.
 */
function createGeminiError(error, fallbackMessage) {
  const statusCode =
    error?.status ??
    error?.statusCode ??
    error?.response?.status;

  if (statusCode === 429) {
    const rateLimitError = new Error(
      `Gemini rate limit exceeded: ${
        error?.message || "quota exceeded"
      }`
    );

    rateLimitError.statusCode = 429;
    rateLimitError.publicMessage =
      "The AI service has reached its current rate limit. Please try again later.";

    return rateLimitError;
  }

  if (statusCode === 401 || statusCode === 403) {
    const authError = new Error(
      `Gemini authentication failed: ${
        error?.message || "invalid API key"
      }`
    );

    authError.statusCode = statusCode;
    authError.publicMessage =
      "The AI service could not authenticate your API key. Please check the Gemini API configuration.";

    return authError;
  }

  if (statusCode === 400) {
    const requestError = new Error(
      `Gemini rejected the request: ${
        error?.message || "bad request"
      }`
    );

    requestError.statusCode = 400;
    requestError.publicMessage =
      "The AI service rejected this request. Please try a different message.";

    return requestError;
  }

  const wrappedError = new Error(
    `${fallbackMessage}: ${
      error?.message || "unknown error"
    }`
  );

  wrappedError.statusCode = 502;
  wrappedError.publicMessage = fallbackMessage;

  return wrappedError;
}

/**
 * Analyze an image using Gemini.
 *
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @param {string} prompt
 * @returns {Promise<string>}
 */
const analyzeImage = async (
  imageBuffer,
  mimeType,
  prompt
) => {
  if (!config.ai.geminiApiKey) {
    const error = new Error(
      "Gemini API key is not configured."
    );

    error.statusCode = 503;
    error.publicMessage =
      "AI vision is not configured yet. Please add the Gemini API key.";

    throw error;
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    const error = new Error("Image buffer is empty.");

    error.statusCode = 400;
    error.publicMessage =
      "The image could not be processed.";

    throw error;
  }

  if (!mimeType) {
    const error = new Error(
      "Image MIME type is missing."
    );

    error.statusCode = 400;
    error.publicMessage =
      "The image type could not be determined.";

    throw error;
  }

  if (!prompt || !prompt.trim()) {
    const error = new Error(
      "Vision prompt is empty."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please enter a question about the image.";

    throw error;
  }

  try {
    const interaction = await ai.interactions.create({
      model: DEFAULT_MODEL,
      input: [
        {
          type: "text",
          text: prompt.trim(),
        },
        {
          type: "image",
          data: imageBuffer.toString("base64"),
          mime_type: mimeType,
        },
      ],
    });

    const text = interaction.output_text;

    if (!text || !text.trim()) {
      const error = new Error(
        "Gemini returned an empty response."
      );

      error.statusCode = 502;
      error.publicMessage =
        "The AI model did not return an answer. Please try again.";

      throw error;
    }

    return text.trim();
  } catch (error) {
    console.error(
      "Gemini Vision request failed:",
      error
    );

    if (error?.statusCode && error?.publicMessage) {
      throw error;
    }

    throw createGeminiError(
      error,
      "The AI vision service could not process your request. Please try again."
    );
  }
};

/**
 * Analyze multiple images in one Gemini request.
 *
 * @param {Array} images
 * @param {string} prompt
 * @returns {Promise<string>}
 */
const analyzeImages = async (
  images,
  prompt
) => {
  if (!config.ai.geminiApiKey) {
    const error = new Error(
      "Gemini API key is not configured."
    );

    error.statusCode = 503;
    error.publicMessage =
      "AI vision is not configured on the server.";

    throw error;
  }

  if (!Array.isArray(images) || images.length === 0) {
    const error = new Error(
      "At least one image is required."
    );

    error.statusCode = 400;
    error.publicMessage =
      "No images were provided for analysis.";

    throw error;
  }

  if (!prompt || !prompt.trim()) {
    const error = new Error(
      "A prompt is required for image analysis."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please provide a question or analysis prompt.";

    throw error;
  }

  try {
    const input = [
      {
        type: "text",
        text: prompt.trim(),
      },
    ];

    for (const image of images) {
      if (
        !image?.buffer ||
        image.buffer.length === 0
      ) {
        continue;
      }

      input.push({
        type: "image",
        data: image.buffer.toString("base64"),
        mime_type:
          image.mimeType || "image/jpeg",
      });
    }

    if (input.length === 1) {
      const error = new Error(
        "No valid images were provided."
      );

      error.statusCode = 400;
      error.publicMessage =
        "The selected images could not be processed.";

      throw error;
    }

    const interaction = await ai.interactions.create({
      model: DEFAULT_MODEL,
      input,
    });

    const text = interaction.output_text;

    if (!text || !text.trim()) {
      const error = new Error(
        "Gemini returned an empty response."
      );

      error.statusCode = 502;
      error.publicMessage =
        "The AI vision service returned an empty response.";

      throw error;
    }

    return text.trim();
  } catch (error) {
    console.error(
      "Gemini multi-image analysis error:",
      error
    );

    if (error?.statusCode && error?.publicMessage) {
      throw error;
    }

    throw createGeminiError(
      error,
      "The AI vision service could not process the images. Please try again."
    );
  }
};

/**
 * Generate a non-streaming text response.
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function generateText(prompt) {
  if (!config.ai.geminiApiKey) {
    const error = new Error(
      "Gemini API key is not configured."
    );

    error.statusCode = 503;
    error.publicMessage =
      "Gemini API is not configured. Please set GEMINI_API_KEY.";

    throw error;
  }

  if (
    !prompt ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    const error = new Error(
      "A prompt is required."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please enter a message.";

    throw error;
  }

  try {
    const interaction = await ai.interactions.create({
      model: DEFAULT_MODEL,
      input: [
        {
          type: "text",
          text: prompt.trim(),
        },
      ],
    });

    const text = interaction.output_text;

    if (!text || !text.trim()) {
      const error = new Error(
        "Gemini returned an empty response."
      );

      error.statusCode = 502;
      error.publicMessage =
        "The AI model did not return an answer. Please try again.";

      throw error;
    }

    return text.trim();
  } catch (error) {
    console.error(
      "Gemini text generation failed:",
      error
    );

    if (error?.statusCode && error?.publicMessage) {
      throw error;
    }

    throw createGeminiError(
      error,
      "The AI service could not generate a response. Please try again."
    );
  }
}

/**
 * Stream a text response from Gemini.
 *
 * @param {string} prompt
 * @param {(chunk: string) => void} onChunk
 * @returns {Promise<string>}
 */
/**
 * Stream a text response from Gemini.
 *
 * @param {string} prompt
 * @param {(chunk: string) => void} onChunk
 * @returns {Promise<string>}
 */
async function streamText(prompt, onChunk) {
  if (!config.ai.geminiApiKey) {
    const error = new Error(
      "Gemini API key is not configured."
    );

    error.statusCode = 503;
    error.publicMessage =
      "Gemini API is not configured. Please set GEMINI_API_KEY.";

    throw error;
  }

  if (
    !prompt ||
    typeof prompt !== "string" ||
    !prompt.trim()
  ) {
    const error = new Error(
      "A prompt is required."
    );

    error.statusCode = 400;
    error.publicMessage =
      "Please enter a message.";

    throw error;
  }

  if (typeof onChunk !== "function") {
    const error = new Error(
      "onChunk callback is required."
    );

    error.statusCode = 500;
    error.publicMessage =
      "The streaming callback is not configured correctly.";

    throw error;
  }

  let fullText = "";

  try {
    const stream = await ai.interactions.create({
      model: DEFAULT_MODEL,
      input: prompt.trim(),
      stream: true,
    });

    for await (const event of stream) {
      /*
       * Gemini may send an explicit error event during
       * a streaming request. Handle it immediately instead
       * of treating the stream as an empty successful response.
       */
      if (event?.event_type === "error") {
        const message =
          event?.error?.message ||
          event?.message ||
          "Gemini streaming request failed.";

        const errorCode =
          event?.error?.code ||
          event?.code;

        const isRateLimit =
          errorCode === "quota_exceeded" ||
          errorCode === "too_many_requests" ||
          errorCode === "rate_limit_exceeded" ||
          /rate.?limit|quota/i.test(message);

        const error = new Error(
          `Gemini streaming error: ${message}`
        );

        error.statusCode = isRateLimit ? 429 : 502;

        error.publicMessage = isRateLimit
          ? "The AI service has reached its current rate limit. Please try again later."
          : "The AI streaming service could not generate a response. Please try again.";

        throw error;
      }

      /*
       * Normal text streaming events.
       */
      if (
        event?.event_type === "step.delta" &&
        event?.delta?.type === "text" &&
        typeof event?.delta?.text === "string"
      ) {
        const delta = event.delta.text;

        if (!delta) {
          continue;
        }

        fullText += delta;
        onChunk(delta);
      }
    }

    /*
     * If text was successfully streamed, return it.
     */
    if (fullText.trim()) {
      return fullText.trim();
    }

    /*
     * Do NOT automatically make another Gemini request here.
     *
     * A second request could unnecessarily consume quota,
     * especially when the upstream service is already rate-limited.
     */
    const error = new Error(
      "Gemini streaming completed without returning text."
    );

    error.statusCode = 502;
    error.publicMessage =
      "The AI model did not return a response. Please try again.";

    throw error;
  } catch (error) {
    console.error(
      "Gemini streaming request failed:",
      error
    );

    /*
     * Preserve errors that already have a status/public message.
     * This includes our explicit 429 handling above.
     */
    if (
      error?.statusCode &&
      error?.publicMessage
    ) {
      throw error;
    }

    throw createGeminiError(
      error,
      "The AI streaming service could not generate a response. Please try again."
    );
  }
}

export {
  analyzeImage,
  analyzeImages,
  generateText,
  streamText,
};