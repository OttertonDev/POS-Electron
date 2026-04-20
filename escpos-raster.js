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

function resolveRasterMode(modeCandidate) {
  const mode = Number(modeCandidate);
  const allowedModes = new Set([0, 1, 2, 3, 48, 49, 50, 51]);
  if (allowedModes.has(mode)) {
    return mode;
  }

  // Use ASCII "0" mode by default for better clone-firmware compatibility.
  return 48;
}

function validateBitmapInput(bitmapBuffer, width, height) {
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
}

function resolveSeparatorMode(modeCandidate, fallback = 'none') {
  const mode = String(modeCandidate || fallback).toLowerCase();
  if (mode === 'none' || mode === 'lf' || mode === 'crlf') {
    return mode;
  }
  return fallback;
}

function separatorBufferFromMode(mode) {
  if (mode === 'lf') {
    return Buffer.from([0x0a]);
  }

  if (mode === 'crlf') {
    return Buffer.from([0x0d, 0x0a]);
  }

  return null;
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
  validateBitmapInput(bitmapBuffer, width, height);

  const threshold = Math.round(clampNumber(Number(options.threshold), 142, 1, 254));
  const chunkHeight = Math.round(clampNumber(Number(options.chunkHeight), 64, 1, 255));
  const endFeedLines = Math.round(clampNumber(Number(options.endFeedLines), 1, 0, 10));
  const rasterMode = resolveRasterMode(options.rasterMode);
  const separatorMode = resolveSeparatorMode(options.chunkSeparator, 'none');
  const separatorBuffer = separatorBufferFromMode(separatorMode);

  const { widthBytes, rasterBuffer } = packBitmapToEscPosRaster(bitmapBuffer, width, height, threshold);
  const commands = [
    Buffer.from([0x1b, 0x40]), // Initialize printer.
    Buffer.from([0x1b, 0x53]), // Ensure standard mode.
    Buffer.from([0x1b, 0x61, 0x00]), // Align left.
    Buffer.from([0x1d, 0x4c, 0x00, 0x00]), // Left margin = 0.
    Buffer.from([0x1d, 0x57, width & 0xff, (width >> 8) & 0xff]), // Print area width.
    Buffer.from([0x1b, 0x24, 0x00, 0x00]) // Absolute position x=0.
  ];

  for (let row = 0; row < height; row += chunkHeight) {
    const currentChunkHeight = Math.min(chunkHeight, height - row);
    const header = Buffer.from([
      0x1d, 0x76, 0x30, rasterMode,
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

    commands.push(header);
    commands.push(chunkData);

    // Some clone firmware needs LF separators to continue consuming chunk streams.
    if (separatorBuffer) {
      commands.push(separatorBuffer);
    }
  }

  if (endFeedLines > 0) {
    commands.push(Buffer.from([0x1b, 0x64, endFeedLines]));
  }

  return Buffer.concat(commands);
}

function buildEscPosBitImageFromBitmap(bitmapBuffer, width, height, options = {}) {
  validateBitmapInput(bitmapBuffer, width, height);

  const threshold = Math.round(clampNumber(Number(options.threshold), 142, 1, 254));
  const endFeedLines = Math.round(clampNumber(Number(options.endFeedLines), 1, 0, 10));
  const density = Math.round(clampNumber(Number(options.density), 33, 0, 33));
  const rowSeparatorMode = resolveSeparatorMode(options.rowSeparator, 'lf');
  const rowSeparatorBuffer = separatorBufferFromMode(rowSeparatorMode) || Buffer.from([0x0a]);

  const { widthBytes, rasterBuffer } = packBitmapToEscPosRaster(bitmapBuffer, width, height, threshold);
  const commands = [
    Buffer.from([0x1b, 0x40]), // Initialize printer.
    Buffer.from([0x1b, 0x53]), // Ensure standard mode.
    Buffer.from([0x1b, 0x61, 0x00]), // Align left.
    Buffer.from([0x1d, 0x4c, 0x00, 0x00]), // Left margin = 0.
    Buffer.from([0x1d, 0x57, width & 0xff, (width >> 8) & 0xff]), // Print area width.
    Buffer.from([0x1b, 0x24, 0x00, 0x00]), // Absolute position x=0.
    Buffer.from([0x1b, 0x33, 24]) // Set line spacing to 24 dots.
  ];

  const nL = width & 0xff;
  const nH = (width >> 8) & 0xff;

  for (let y = 0; y < height; y += 24) {
    const header = Buffer.from([0x1b, 0x2a, density, nL, nH]);
    const lineData = Buffer.alloc(width * 3);

    for (let x = 0; x < width; x += 1) {
      for (let stripe = 0; stripe < 3; stripe += 1) {
        let value = 0;

        for (let bit = 0; bit < 8; bit += 1) {
          const currentY = y + (stripe * 8) + bit;
          if (currentY >= height) {
            continue;
          }

          const byteIndex = (currentY * widthBytes) + (x >> 3);
          const mask = 0x80 >> (x & 7);
          if (rasterBuffer[byteIndex] & mask) {
            value |= (0x80 >> bit);
          }
        }

        lineData[(x * 3) + stripe] = value;
      }
    }

    commands.push(header);
    commands.push(lineData);
    commands.push(rowSeparatorBuffer);
  }

  commands.push(Buffer.from([0x1b, 0x32])); // Restore default line spacing.

  if (endFeedLines > 0) {
    commands.push(Buffer.from([0x1b, 0x64, endFeedLines]));
  }

  return Buffer.concat(commands);
}

module.exports = {
  buildEscPosRasterFromBitmap,
  buildEscPosBitImageFromBitmap
};