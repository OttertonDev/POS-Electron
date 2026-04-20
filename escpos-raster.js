function clampNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function packBitmapToEscPosRaster(bitmapBuffer, width, height, threshold) {
  const widthBytes = Math.ceil(width / 8);
  const rasterBuffer = Buffer.alloc(widthBytes * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * widthBytes;
    const pixelRowOffset = y * width * 4;

    for (let x = 0; x < width; x += 1) {
      const pixelOffset = pixelRowOffset + (x * 4);
      const blue = bitmapBuffer[pixelOffset];
      const green = bitmapBuffer[pixelOffset + 1];
      const red = bitmapBuffer[pixelOffset + 2];
      const alpha = bitmapBuffer[pixelOffset + 3] / 255;

      // Composite against white first, then threshold.
      const luma = ((0.299 * red) + (0.587 * green) + (0.114 * blue));
      const compositedLuma = (luma * alpha) + (255 * (1 - alpha));
      const isBlack = compositedLuma < threshold;

      if (isBlack) {
        const byteIndex = rowOffset + (x >> 3);
        rasterBuffer[byteIndex] |= (0x80 >> (x & 7));
      }
    }
  }

  return {
    widthBytes,
    rasterBuffer
  };
}

function buildEscPosRasterFromBitmap(bitmapBuffer, width, height, options = {}) {
  if (!Buffer.isBuffer(bitmapBuffer)) {
    throw new Error('Expected bitmapBuffer to be a Node.js Buffer.');
  }

  if (!Number.isInteger(width) || width <= 0) {
    throw new Error('Bitmap width must be a positive integer.');
  }

  if (!Number.isInteger(height) || height <= 0) {
    throw new Error('Bitmap height must be a positive integer.');
  }

  const expectedLength = width * height * 4;
  if (bitmapBuffer.length !== expectedLength) {
    throw new Error(`Unexpected bitmap buffer size. Expected ${expectedLength} bytes, got ${bitmapBuffer.length}.`);
  }

  const threshold = Math.round(clampNumber(Number(options.threshold), 142, 1, 254));
  const chunkHeight = Math.round(clampNumber(Number(options.chunkHeight), 128, 1, 255));
  const endFeedLines = Math.round(clampNumber(Number(options.endFeedLines), 1, 0, 10));

  const { widthBytes, rasterBuffer } = packBitmapToEscPosRaster(bitmapBuffer, width, height, threshold);
  const commands = [
    Buffer.from([0x1b, 0x40]), // Initialize printer.
    Buffer.from([0x1b, 0x61, 0x00]) // Align left.
  ];

  for (let row = 0; row < height; row += chunkHeight) {
    const currentChunkHeight = Math.min(chunkHeight, height - row);
    const header = Buffer.from([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff,
      (widthBytes >> 8) & 0xff,
      currentChunkHeight & 0xff,
      (currentChunkHeight >> 8) & 0xff
    ]);
    const chunkData = Buffer.alloc(widthBytes * currentChunkHeight);

    rasterBuffer.copy(
      chunkData,
      0,
      row * widthBytes,
      (row + currentChunkHeight) * widthBytes
    );

    // Important: no LF between chunks to avoid chopped rows on some OEM units.
    commands.push(header);
    commands.push(chunkData);
  }

  if (endFeedLines > 0) {
    commands.push(Buffer.from([0x1b, 0x64, endFeedLines]));
  }

  return Buffer.concat(commands);
}

module.exports = {
  buildEscPosRasterFromBitmap
};