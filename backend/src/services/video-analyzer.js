import fs from "fs/promises";
import { prepareImageForVision } from "./image-processor.js";
import { analyzeImages } from "./vision.js";

const DEFAULT_MAX_FRAMES = 12;

const analyzeVideoFrames = async (
  frames,
  {
    userQuestion = null,
    maxFrames = DEFAULT_MAX_FRAMES,
    onProgress = () => {},
  } = {}
) => {
  if (!Array.isArray(frames) || frames.length === 0) {
    const error = new Error(
      "No video frames were provided for analysis."
    );

    error.statusCode = 400;
    error.publicMessage =
      "No extracted frames are available for video analysis.";

    throw error;
  }

  const selectedFrames = selectFrames(frames, maxFrames);
  const preparedFrames = [];

  for (let index = 0; index < selectedFrames.length; index += 1) {
    const frame = selectedFrames[index];

    try {
      const originalBuffer = await fs.readFile(frame.path);

      const optimizedBuffer = await prepareImageForVision(
        originalBuffer,
        {
          maxWidth: 1536,
          maxHeight: 1536,
          quality: 80,
        }
      );

      preparedFrames.push({
        ...frame,
        buffer: optimizedBuffer,
        mimeType: "image/jpeg",
      });

      onProgress({
        current: index + 1,
        total: selectedFrames.length,
        percentage: Math.round(
          ((index + 1) / selectedFrames.length) * 100
        ),
        timestamp: frame.timestamp ?? null,
        timestampFormatted:
          frame.timestampFormatted ?? null,
      });
    } catch (error) {
      console.error(
        `Failed to prepare frame ${frame.path}:`,
        error.message
      );
    }
  }

  if (preparedFrames.length === 0) {
    const error = new Error(
      "None of the extracted video frames could be prepared."
    );

    error.statusCode = 422;
    error.publicMessage =
      "The extracted video frames could not be processed.";

    throw error;
  }

  const frameTimeline = preparedFrames
    .map(
      (frame, index) =>
        `Image ${index + 1}: ${
          frame.timestampFormatted ?? "unknown timestamp"
        }`
    )
    .join("\n");

  const questionInstruction = userQuestion?.trim()
    ? `
The user also asked:

"${userQuestion.trim()}"

Answer this question using the entire visual sequence.
`
    : "";

  const prompt = `
You are analyzing a sequence of images extracted from a video.

The images are ordered chronologically.

${frameTimeline}

Analyze the sequence as a whole.

Provide:

## Video Summary
A concise overall description of what happens.

## Key Events
Describe important actions or events in chronological order.
Use the provided timestamps where useful.

## Visual Details
Describe important people, objects, environment, visible text,
and other relevant visual information.

## Overall Interpretation
Explain the main activity or purpose of the video based only
on what can be visually supported.

${questionInstruction}

Important:
- Treat the images as a sequence, not unrelated pictures.
- Do not invent events that are not visible.
- Do not assume what happens between two frames.
- If something is uncertain, say so.
`;

  const analysis = await analyzeImages(
    preparedFrames,
    prompt
  );

  return {
    summary: analysis,
    framesAnalyzed: preparedFrames.length,
    frames: preparedFrames.map((frame) => ({
      index: frame.index,
      timestamp: frame.timestamp ?? null,
      timestampFormatted:
        frame.timestampFormatted ?? null,
      filename: frame.filename,
    })),
  };
};

const selectFrames = (frames, maxFrames) => {
  if (!Number.isInteger(maxFrames) || maxFrames <= 0) {
    return frames;
  }

  if (frames.length <= maxFrames) {
    return frames;
  }

  const selected = [];

  for (let index = 0; index < maxFrames; index += 1) {
    const position =
      (index / (maxFrames - 1)) *
      (frames.length - 1);

    const frameIndex = Math.round(position);

    if (!selected.includes(frames[frameIndex])) {
      selected.push(frames[frameIndex]);
    }
  }

  return selected;
};

export {
  analyzeVideoFrames,
  selectFrames,
};