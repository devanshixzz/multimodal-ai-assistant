import fs from "fs/promises";
import path from "path";
import { createCanvas } from "canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;

    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const renderPdfPages = async (
  pdfPath,
  outputDirectory,
  {
    maxPages = 20,
    scale = 1.5,
    quality = 85,
    onProgress = () => {},
  } = {}
) => {
  if (!pdfPath) {
    throw new Error("PDF path is required.");
  }

  if (!outputDirectory) {
    throw new Error("PDF output directory is required.");
  }

  await fs.mkdir(outputDirectory, {
    recursive: true,
  });

  try {
    const pdfBuffer = await fs.readFile(pdfPath);

    if (!pdfBuffer.length) {
      throw new Error("PDF file is empty.");
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
    });

    const pdfDocument = await loadingTask.promise;

    const totalPages = pdfDocument.numPages;

    if (!totalPages) {
      throw new Error("The PDF contains no pages.");
    }

    const pagesToRender = Math.min(
      totalPages,
      maxPages
    );

    const canvasFactory = new NodeCanvasFactory();
    const pages = [];

    for (
      let pageNumber = 1;
      pageNumber <= pagesToRender;
      pageNumber += 1
    ) {
      const page =
        await pdfDocument.getPage(pageNumber);

      const viewport = page.getViewport({
        scale,
      });

      const canvasAndContext =
        canvasFactory.create(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height)
        );

      await page.render({
        canvasContext:
          canvasAndContext.context,
        viewport,
        canvasFactory,
      }).promise;

      const outputFilename =
        `page_${String(pageNumber).padStart(4, "0")}.jpg`;

      const outputPath = path.join(
        outputDirectory,
        outputFilename
      );

      const jpegBuffer =
        canvasAndContext.canvas.toBuffer(
          "image/jpeg",
          {
            quality: quality / 100,
          }
        );

      await fs.writeFile(
        outputPath,
        jpegBuffer
      );

      pages.push({
        pageNumber,
        filename: outputFilename,
        path: outputPath,
        width: Math.ceil(viewport.width),
        height: Math.ceil(viewport.height),
      });

      canvasFactory.destroy(
        canvasAndContext
      );

      onProgress({
        current: pageNumber,
        total: pagesToRender,
        percentage: Math.round(
          (pageNumber / pagesToRender) * 100
        ),
      });
    }

    if (
      typeof pdfDocument.destroy ===
      "function"
    ) {
      await pdfDocument.destroy();
    }

    return {
      totalPages,
      pagesRendered: pages.length,
      pages,
    };
  } catch (error) {
    try {
      const files = await fs.readdir(
        outputDirectory
      );

      await Promise.all(
        files
          .filter((file) =>
            /^page_\d{4}\.jpg$/i.test(file)
          )
          .map((file) =>
            fs.rm(
              path.join(
                outputDirectory,
                file
              ),
              { force: true }
            )
          )
          );
    } catch {
      // Ignore cleanup errors.
    }

    throw new Error(
      `PDF page rendering failed: ${error.message}`
    );
  }
};

const cleanupRenderedPages = async (
  pages = []
) => {
  await Promise.all(
    pages.map(async (page) => {
      try {
        await fs.rm(page.path, {
          force: true,
        });
      } catch (error) {
        console.error(
          `Failed to remove rendered page ${page.path}:`,
          error.message
        );
      }
    })
  );
};

export {
  renderPdfPages,
  cleanupRenderedPages,
};