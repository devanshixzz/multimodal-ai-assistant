import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import Groq from "groq-sdk";
import config from "../config.js";

const extractAudioFromVideo = async (
  videoPath,
  outputPath,
  {
    sampleRate = 16000,
    channels = 1,
    format = "wav",
  } = {}
) => {
  if (!videoPath) {
    throw new Error("Video path is required.");
  }

  if (!outputPath) {
    throw new Error("Audio output path is required.");
  }

  await fs.mkdir(path.dirname(outputPath), {
    recursive: true,
  });

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .noVideo()
        .audioCodec("pcm_s16le")
        .audioFrequency(sampleRate)
        .audioChannels(channels)
        .format(format)
        .output(outputPath)
        .on("start", (commandLine) => {
          console.log(
            "Audio extraction FFmpeg command:",
            commandLine
          );
        })
        .on("progress", (progress) => {
          console.log(
            "Audio extraction progress:",
            progress.percent
              ? `${Math.round(progress.percent)}%`
              : progress.timemark || "processing"
          );
        })
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const stats = await fs.stat(outputPath);

    if (!stats.size) {
      throw new Error(
        "FFmpeg completed but produced an empty audio file."
      );
    }

    return {
      path: outputPath,
      format,
      sampleRate,
      channels,
      size: stats.size,
    };
  } catch (error) {
    try {
      await fs.rm(outputPath, {
        force: true,
      });
    } catch {
      // Ignore cleanup errors.
    }

    throw new Error(
      `Audio extraction failed: ${error.message}`
    );
  }
};

const getAudioMetadata = async (audioPath) => {
  if (!audioPath) {
    throw new Error("Audio path is required.");
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (error, metadata) => {
      if (error) {
        return reject(
          new Error(
            `Unable to read audio metadata: ${error.message}`
          )
        );
      }

      const audioStream = metadata.streams?.find(
        (stream) => stream.codec_type === "audio"
      );

      if (!audioStream) {
        return reject(
          new Error("No audio stream was found.")
        );
      }

      resolve({
        duration:
          Number(audioStream.duration) ||
          Number(metadata.format?.duration) ||
          0,
        codec: audioStream.codec_name || null,
        sampleRate:
          Number(audioStream.sample_rate) || null,
        channels:
          Number(audioStream.channels) || null,
        format:
          metadata.format?.format_name || null,
        size:
          Number(metadata.format?.size) || null,
      });
    });
  });
};

const transcribeAudio = async (audioPath, { language = null } = {}) => {
  if (!audioPath) {
    const error = new Error("Audio path is required.");
    error.statusCode = 400;
    error.publicMessage = "Audio file is required for transcription.";
    throw error;
  }

  const { apiKey, model } = config.ai.whisper;

  if (!apiKey) {
    const error = new Error("Whisper API key is not configured.");
    error.statusCode = 503;
    error.publicMessage =
      "Audio transcription is not configured yet. Add WHISPER_API_KEY to the backend environment.";
    throw error;
  }

  try {
    const groq = new Groq({ apiKey });

    const audioFile = await fs.readFile(audioPath);

    const blob = new Blob([audioFile], {
      type: "audio/wav",
    });

    const file = new File([blob], path.basename(audioPath), {
      type: "audio/wav",
    });

    const request = {
      file,
      model,
      response_format: "verbose_json",
    };

    if (language) {
      request.language = language;
    }

    const transcription = await groq.audio.transcriptions.create(request);

    if (!transcription?.text?.trim()) {
      const error = new Error("Whisper returned an empty transcript.");
      error.statusCode = 502;
      error.publicMessage =
        "The audio transcription service returned no transcript.";
      throw error;
    }

    return {
      text: transcription.text.trim(),
      language: transcription.language || language || null,
      duration: Number(transcription.duration) || null,
      segments: Array.isArray(transcription.segments)
        ? transcription.segments.map((segment) => ({
            start: Number(segment.start) || 0,
            end: Number(segment.end) || 0,
            text: segment.text?.trim() || "",
          }))
        : [],
    };
  } catch (error) {
    console.error("Audio transcription error:", error);

    if (error.statusCode && error.publicMessage) {
      throw error;
    }

    const wrappedError = new Error(
      `Audio transcription failed: ${error.message}`
    );
    wrappedError.statusCode = 502;
    wrappedError.publicMessage =
      "The audio transcription service could not process the file. Please try again.";

    throw wrappedError;
  }
};

export {
  extractAudioFromVideo,
  getAudioMetadata,
  transcribeAudio,
};