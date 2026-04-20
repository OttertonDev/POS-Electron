const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { buildEscPosRasterFromBitmap, buildEscPosBitImageFromBitmap } = require('./escpos-raster');
const { sendRawToPrinterWindows } = require('./windows-raw-spool');

let mainWindow;
const server = express();
const PORT = 3001;

const PRINT_MODE = normalizePrintMode(process.env.POS_PRINT_MODE || 'hybrid');
const RAW_RENDER_SCALE = readNumber(process.env.POS_RAW_RENDER_SCALE, 2, 1, 4);
const RAW_THRESHOLD = Math.round(readNumber(process.env.POS_RAW_THRESHOLD, 142, 1, 254));
const RAW_CHUNK_HEIGHT = Math.round(readNumber(process.env.POS_RAW_CHUNK_HEIGHT, 64, 1, 255));
const RAW_END_FEED_LINES = Math.round(readNumber(process.env.POS_RAW_END_FEED_LINES, 1, 0, 8));
const RAW_WIDTH_DOTS = Math.round(readNumber(process.env.POS_RAW_WIDTH_DOTS || process.env.OS_RAW_WIDTH_DOTS, 384, 8, 576));
const RAW_RASTER_MODE = Math.round(readNumber(process.env.POS_RAW_RASTER_MODE, 48, 0, 51));
const RAW_IMAGE_MODE = normalizeRawImageMode(process.env.POS_RAW_IMAGE_MODE || 'raster');
const RAW_CHUNK_SEPARATOR_MODE = normalizeChunkSeparatorMode(
  process.env.POS_RAW_CHUNK_SEPARATOR || process.env.POS_RAW_LF_BETWEEN_CHUNKS || 'auto'
);
const RAW_JOB_NAME = process.env.POS_RAW_JOB_NAME || 'Otterton POS RAW Receipt';

function normalizePrintMode(mode) {
  const lowered = String(mode || 'hybrid').toLowerCase();
  if (lowered === 'raw' || lowered === 'graphic' || lowered === 'hybrid') {
    return lowered;
  }
  return 'hybrid';
}

function normalizeRawImageMode(mode) {
  const lowered = String(mode || 'raster').toLowerCase();
  if (lowered === 'raster') {
    return 'raster';
  }

  if (
    lowered === 'bit-image' ||
    lowered === 'bitimage' ||
    lowered === 'esc-star' ||
    lowered === 'esc*'
  ) {
    return 'bit-image';
  }

  return 'raster';
}

function normalizeChunkSeparatorMode(mode) {
  const lowered = String(mode || 'auto').toLowerCase();
  if (lowered === '1' || lowered === 'true' || lowered === 'yes' || lowered === 'on' || lowered === 'lf') {
    return 'lf';
  }

  if (lowered === 'crlf') {
    return 'crlf';
  }

  if (lowered === '0' || lowered === 'false' || lowered === 'no' || lowered === 'off' || lowered === 'none') {
    return 'none';
  }

  return 'auto';
}

function resolveChunkSeparatorMode(printerName) {
  if (RAW_CHUNK_SEPARATOR_MODE === 'lf' || RAW_CHUNK_SEPARATOR_MODE === 'crlf' || RAW_CHUNK_SEPARATOR_MODE === 'none') {
    return RAW_CHUNK_SEPARATOR_MODE;
  }

  const printer = String(printerName || '').toLowerCase();
  if (printer.includes('vozy') || printer.includes('voxy') || printer.includes('v50')) {
    return 'crlf';
  }

  return 'none';
}

function readNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  if (parsed < min) {
    return min;
  }

  if (parsed > max) {
    return max;
  }

  return parsed;
}

// Setup Middleware
server.use(cors());
server.use(bodyParser.json());

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  mainWindow.loadFile('index.html');

  // Optional: Open DevTools for debugging
  // mainWindow.webContents.openDevTools();
}

function createPrintWindow(windowWidth = 320) {
  return new BrowserWindow({
    show: false,
    width: Math.max(320, Math.ceil(windowWidth)),
    height: 2200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
}

async function renderReceiptInWindow(printWindow, receiptData = null, renderScale = 1) {
  await printWindow.loadFile('receipt.html');

  if (receiptData) {
    const injectionScript = [
      'if (window.renderReceipt) {',
      `  window.renderReceipt(${JSON.stringify(receiptData)});`,
      '}'
    ].join('\n');

    await printWindow.webContents.executeJavaScript(injectionScript);
  }

  await printWindow.webContents.executeJavaScript([
    '(async () => {',
    '  if (document.fonts && document.fonts.ready) {',
    '    try {',
    '      await document.fonts.ready;',
    '    } catch (fontError) {',
    '      console.warn(fontError);',
    '    }',
    '  }',
    '  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));',
    '  return true;',
    '})();'
  ].join('\n'));

  if (renderScale !== 1) {
    await printWindow.webContents.executeJavaScript([
      '(() => {',
      '  const content = document.getElementById("receiptContent");',
      '  if (!content) {',
      '    return;',
      '  }',
      '  document.body.style.margin = "0";',
      '  document.body.style.padding = "0";',
      '  content.style.margin = "0";',
      '  content.style.transformOrigin = "top left";',
      `  content.style.transform = "scale(${renderScale})";`,
      '})();'
    ].join('\n'));

    await printWindow.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
  }
}

async function measureReceipt(printWindow) {
  return printWindow.webContents.executeJavaScript([
    '(() => {',
    '  const content = document.getElementById("receiptContent");',
    '  if (!content) {',
    '    throw new Error("receiptContent element not found.");',
    '  }',
    '  const rect = content.getBoundingClientRect();',
    '  return {',
    '    x: Math.max(0, Math.floor(rect.left)),',
    '    y: Math.max(0, Math.floor(rect.top)),',
    '    width: Math.max(1, Math.ceil(rect.width)),',
    '    height: Math.max(1, Math.ceil(rect.height)),',
    '    domHeight: Math.max(1, Math.ceil(content.offsetHeight))',
    '  };',
    '})();'
  ].join('\n'));
}

async function resolvePrinterName(printerName) {
  const requestedName = String(printerName || '').trim();
  if (requestedName) {
    return requestedName;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return '';
  }

  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    const defaultPrinter = printers.find((printer) => printer.isDefault);
    return defaultPrinter ? defaultPrinter.name : '';
  } catch (error) {
    console.warn('[Print] Failed to resolve default printer:', error);
    return '';
  }
}

async function executeGraphicPrint(printerName, receiptData = null) {
  const printWindow = createPrintWindow(260);

  try {
    await renderReceiptInWindow(printWindow, receiptData, 1);
    const measurements = await measureReceipt(printWindow);
    const heightPixels = measurements.domHeight + 5;
    const pageHeightMicrons = Math.ceil(heightPixels * 264.5833);

    await new Promise((resolve, reject) => {
      printWindow.webContents.print({
        silent: true,
        deviceName: printerName || '',
        margins: { marginType: 'none' },
        printBackground: true,
        pageSize: { width: 58000, height: pageHeightMicrons }
      }, (success, failureReason) => {
        if (!success) {
          reject(new Error(failureReason || 'Graphic print failed.'));
          return;
        }
        resolve();
      });
    });

    console.log(`[Print][Graphic] Success. Height=${heightPixels}px`);
    return {
      engine: 'graphic',
      printerName: printerName || ''
    };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

async function executeRawPrint(printerName, receiptData = null) {
  if (process.platform !== 'win32') {
    throw new Error('RAW ESC/POS mode is currently implemented only for Windows.');
  }

  const rawWindowWidth = Math.max(420, Math.ceil((220 * RAW_RENDER_SCALE) + 60));
  const printWindow = createPrintWindow(rawWindowWidth);

  try {
    await renderReceiptInWindow(printWindow, receiptData, RAW_RENDER_SCALE);
    let measurements = await measureReceipt(printWindow);

    const requiredHeight = Math.max(320, Math.ceil(measurements.y + measurements.height + 20));
    printWindow.setContentSize(rawWindowWidth, requiredHeight);
    await printWindow.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));');
    measurements = await measureReceipt(printWindow);

    const image = await printWindow.webContents.capturePage({
      x: measurements.x,
      y: measurements.y,
      width: measurements.width,
      height: measurements.height
    });

    const resizedImage = image.resize({
      width: RAW_WIDTH_DOTS,
      quality: 'best'
    });
    const imageSize = resizedImage.getSize();
    const bitmap = resizedImage.toBitmap();
    const chunkSeparatorMode = resolveChunkSeparatorMode(printerName);

    const escPosBuffer = RAW_IMAGE_MODE === 'bit-image'
      ? buildEscPosBitImageFromBitmap(bitmap, imageSize.width, imageSize.height, {
          threshold: RAW_THRESHOLD,
          endFeedLines: RAW_END_FEED_LINES,
          density: 33,
          rowSeparator: chunkSeparatorMode === 'none' ? 'lf' : chunkSeparatorMode
        })
      : buildEscPosRasterFromBitmap(bitmap, imageSize.width, imageSize.height, {
          threshold: RAW_THRESHOLD,
          chunkHeight: RAW_CHUNK_HEIGHT,
          endFeedLines: RAW_END_FEED_LINES,
          rasterMode: RAW_RASTER_MODE,
          chunkSeparator: chunkSeparatorMode
        });

    const spoolResult = await sendRawToPrinterWindows({
      printerName,
      dataBuffer: escPosBuffer,
      jobName: RAW_JOB_NAME
    });

    console.log(`[Print][RAW] Success. Image=${imageSize.width}x${imageSize.height}, bytes=${escPosBuffer.length}, protocol=${RAW_IMAGE_MODE}, mode=${RAW_RASTER_MODE}, chunkSep=${chunkSeparatorMode}`);
    return {
      engine: 'raw',
      printerName: spoolResult.printerName || printerName || '',
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      bytes: escPosBuffer.length
    };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

/**
 * REUSABLE PRINT FUNCTION 
 * Handles rendering data into receipt.html and sending to physical printer
 */
async function executePrint(printerName, receiptData = null) {
  const resolvedPrinterName = await resolvePrinterName(printerName);
  console.log(`[Print] Mode=${PRINT_MODE}, printer="${resolvedPrinterName || 'Default'}"`);

  if (PRINT_MODE === 'graphic') {
    return executeGraphicPrint(resolvedPrinterName, receiptData);
  }

  if (PRINT_MODE === 'raw') {
    return executeRawPrint(resolvedPrinterName, receiptData);
  }

  try {
    return await executeRawPrint(resolvedPrinterName, receiptData);
  } catch (rawError) {
    console.warn(`[Print] RAW failed, fallback to graphic. Reason: ${rawError.message}`);
    const graphicResult = await executeGraphicPrint(resolvedPrinterName, receiptData);
    return {
      ...graphicResult,
      fallbackFrom: 'raw',
      fallbackReason: rawError.message
    };
  }
}

// --- EXPRESS API ROUTES ---

// GET: List all printers
server.get('/printers', async (req, res) => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    res.json(printers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST: Print a receipt
server.post('/print', async (req, res) => {
  const { printer, data } = req.body;
  try {
    console.log("API: Received print request.");
    const printResult = await executePrint(printer, data);
    res.json({ success: true, message: "Print job sent successfully" });

    // Notify the UI about the API activity
    if (mainWindow) {
      const engineLabel = printResult?.fallbackFrom
        ? `${printResult.engine} (fallback from ${printResult.fallbackFrom})`
        : (printResult?.engine || PRINT_MODE);
      mainWindow.webContents.send('api-log', {
        type: 'success',
        message: `Printed via API [${engineLabel}]: ${data?.storeName || 'Receipt'}`
      });
    }
  } catch (err) {
    console.error("API Print Error:", err);
    res.status(500).json({ success: false, error: err.toString() });

    if (mainWindow) {
      mainWindow.webContents.send('api-log', {
        type: 'error',
        message: `API Print Failed: ${err}`
      });
    }
  }
});

// --- ELECTRON APP LIFECYCLE ---

app.whenReady().then(() => {
  createWindow();

  // Start the API Server
  server.listen(PORT, () => {
    console.log(`POS Printing API running at http://localhost:${PORT}`);
    console.log(`[Print] Engine mode: ${PRINT_MODE}`);
    console.log(`[Print] RAW config: protocol=${RAW_IMAGE_MODE}, width=${RAW_WIDTH_DOTS}, scale=${RAW_RENDER_SCALE}, threshold=${RAW_THRESHOLD}, chunk=${RAW_CHUNK_HEIGHT}, mode=${RAW_RASTER_MODE}, chunkSep=${RAW_CHUNK_SEPARATOR_MODE}, feed=${RAW_END_FEED_LINES}`);
    // We'll notify the renderer when it's ready in a bit
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Listener to fetch available printers (for Local UI)
ipcMain.handle('get-printers', async (event) => {
  return await mainWindow.webContents.getPrintersAsync();
});

// IPC Listener to execute the print action (for Local UI)
ipcMain.handle('print-receipt', async (event, printerName) => {
  return await executePrint(printerName); // Manual print uses defaults in receipt.html
});
