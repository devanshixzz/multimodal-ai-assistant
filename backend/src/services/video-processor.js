import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";

const getVideoMetadata = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (error, metadata) => {
      if (error) {
        return reject(
          new Error(`Unable to read video metadata: ${error.message}`)
        );
      }

      const videoStream = metadata.streams?.find(
        (stream) => stream.codec_type === "video"
      );

      if (!videoStream) {
        return reject(
          new Error("No video stream was found in the uploaded file.")
        );
      }

      const duration =
        Number(metadata.format?.duration) ||
        Number(videoStream.duration) ||
        0;

      if (!duration || duration <= 0) {
        return reject(
          new Error("Unable to determine video duration.")
        );
      }

      resolve({
        duration,
        width: videoStream.width || null,
        height: videoStream.height || null,
        codec: videoStream.codec_name || null,
        format: metadata.format?.format_name || null,
        size: Number(metadata.format?.size) || null,
      });
    });
  });
};

const extractFrames = async (
  videoPath,
  outputDirectory,
  {
    intervalSeconds = 5,
    maxFrames = 120,
    frameWidth = 1280,
    quality = 2,
    onProgress = () => {},
  } = {}
) => {
  if (!videoPath) {
    throw new Error("Video path is required.");
  }

  if (!outputDirectory) {
    throw new Error("Frame output directory is required.");
  }

  if (intervalSeconds <= 0) {
    throw new Error("Frame interval must be greater than zero.");
  }

  await fs.mkdir(outputDirectory, {
    recursive: true,
  });

  const metadata = await getVideoMetadata(videoPath);

  const calculatedFrameCount =
    Math.ceil(metadata.duration / intervalSeconds);

  const totalFrames = Math.min(
    calculatedFrameCount,
    maxFrames
  );

  const timestamps = [];

  for (let index = 0; index < totalFrames; index += 1) {
    const timestamp = index * intervalSeconds;

    if (timestamp >= metadata.duration) {
      break;
    }

    timestamps.push(timestamp);
  }

  if (timestamps.length === 0) {
    throw new Error(
      "No valid frame timestamps could be generated."
    );
  }

  const generatedFrames = [];

  try {
    for (let index = 0; index < timestamps.length; index += 1) {
      const timestamp = timestamps[index];

      const frameNumber = String(index + 1).padStart(4, "0");

      const outputFilename = `frame_${frameNumber}.jpg`;

      const outputPath = path.join(
        outputDirectory,
        outputFilename
      );

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(timestamp)
          .frames(1)
          .videoFilters([
            `scale=${frameWidth}:-2`,
          ])
          .outputOptions([
            "-q:v",
            String(quality),
          ])
          .output(outputPath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      generatedFrames.push({
        index: index + 1,
        timestamp,
        timestampFormatted: formatTimestamp(timestamp),
        filename: outputFilename,
        path: outputPath,
      });

      onProgress({
        current: generatedFrames.length,
        total: timestamps.length,
        percentage: Math.round(
          (generatedFrames.length / timestamps.length) * 100
        ),
        timestamp,
        filename: outputFilename,
      });
    }

    return {
      metadata,
      intervalSeconds,
      totalFrames: generatedFrames.length,
      frames: generatedFrames,
    };
  } catch (error) {
    // If extraction fails halfway through, remove
    // all partially generated frames.
    await cleanupFrames(generatedFrames);

    throw new Error(
      `Video frame extraction failed: ${error.message}`
    );
  }
};

const detectSceneChanges = async (
  videoPath,
  outputDirectory,
  {
    threshold = 0.25,
    maxFrames = 60,
    frameWidth = 1280,
    quality = 2,
    onProgress = () => {},
  } = {}
) => {
  if (!videoPath) {
    throw new Error("Video path is required.");
  }

  if (!outputDirectory) {
    throw new Error("Scene-change output directory is required.");
  }

  if (threshold <= 0 || threshold >= 1) {
    throw new Error("Scene-change threshold must be between 0 and 1.");
  }

  await fs.mkdir(outputDirectory, { recursive: true });

  const metadata = await getVideoMetadata(videoPath);

  const frames = [];

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .videoFilters([
          `select=gt(scene\\,${threshold})`,
          `scale=${frameWidth}:-2`,
        ])
        .outputOptions([
        "-frames:v",
        String(maxFrames),
        "-q:v",
        String(quality),
        ])
        .output(path.join(outputDirectory, "scene_%04d.jpg"))
        .on("start", (commandLine) => {
          console.log("Scene detection FFmpeg command:", commandLine);
        })
        .on("progress", (progress) => {
          onProgress({
            current: frames.length,
            total: maxFrames,
            percentage: Math.min(
              99,
              Math.round((frames.length / maxFrames) * 100)
            ),
            timestamp: null,
            filename: null,
            processedTime: progress.timemark || null,
          });
        })
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const files = await fs.readdir(outputDirectory);

    const sceneFiles = files
      .filter((file) => /^scene_\d{4}\.jpg$/i.test(file))
      .sort();

    const limitedFiles = sceneFiles.slice(0, maxFrames);

    for (let index = 0; index < limitedFiles.length; index += 1) {
      const filename = limitedFiles[index];
      const framePath = path.join(outputDirectory, filename);

      frames.push({
        index: index + 1,
        filename,
        path: framePath,
      });
    }

    onProgress({
      current: frames.length,
      total: frames.length,
      percentage: 100,
      timestamp: null,
      filename: frames.length > 0 ? frames[frames.length - 1].filename : null,
      processedTime: metadata.duration,
    });

    return {
      metadata,
      threshold,
      totalFrames: frames.length,
      frames,
    };
  } catch (error) {
    await cleanupFrames(frames);

    throw new Error(
      `Scene-change detection failed: ${error.message}`
    );
  }
};

const cleanupFrames = async (frames = []) => {
  await Promise.all(
    frames.map(async (frame) => {
      try {
        await fs.rm(frame.path, {
          force: true,
        });
      } catch (error) {
        console.error(
          `Failed to remove frame ${frame.path}:`,
          error.message
        );
      }
    })
  );
};

const formatTimestamp = (seconds) => {
  const totalSeconds = Math.max(
    0,
    Math.floor(seconds)
  );

  const hours = Math.floor(
    totalSeconds / 3600
  );

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const remainingSeconds =
    totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0"),
  ].join(":");
};

export {
  getVideoMetadata,
  extractFrames,
  detectSceneChanges,
  cleanupFrames,
  formatTimestamp,
};