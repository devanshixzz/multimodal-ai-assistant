import sharp from "sharp";

/**
 * Get useful metadata about an image.
 */
const getImageMetadata = async (buffer) => {
  const metadata = await sharp(buffer).metadata();

  return {
    format: metadata.format || null,
    width: metadata.width || null,
    height: metadata.height || null,
    size: buffer.length,
    hasAlpha: Boolean(metadata.hasAlpha),
  };
};

/**
 * Prepare an image for AI vision processing.
 *
 * We preserve the original upload separately and create
 * a reasonably sized JPEG for sending to the vision model.
 */
const prepareImageForVision = async (
  buffer,
  { maxWidth = 2048, maxHeight = 2048, quality = 85 } = {}
) => {
  return sharp(buffer)
    .rotate()
    .resize({
      width: maxWidth,
      height: maxHeight,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer();
};

/**
 * Create a small JPEG thumbnail for the media gallery.
 */
const createThumbnail = async (
  buffer,
  { width = 400, height = 300, quality = 80 } = {}
) => {
  return sharp(buffer)
    .rotate()
    .resize({
      width,
      height,
      fit: "cover",
      position: "centre",
    })
    .jpeg({
      quality,
      mozjpeg: true,
    })
    .toBuffer();
};

/**
 * Validate that Sharp can actually decode the image.
 */
const validateImageBuffer = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.format) {
      throw new Error("Unable to determine image format.");
    }

    return true;
  } catch {
    return false;
  }
};

export {
  getImageMetadata,
  prepareImageForVision,
  createThumbnail,
  validateImageBuffer,
};