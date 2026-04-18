const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

let mainWindow;
const server = express();
const PORT = 3001;

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

/**
 * REUSABLE PRINT FUNCTION 
 * Handles rendering data into receipt.html and sending to physical printer
 */
async function executePrint(printerName, receiptData = null) {
  console.log(`Executing print for printer: "${printerName || 'Default'}"`);

  // 58mm POS drivers usually demand a strict ~182px active area (48mm) to avoid side-clipping
  const printWindow = new BrowserWindow({
    show: false,
    width: 250,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  return new Promise((resolve, reject) => {
    printWindow.webContents.on('did-finish-load', async () => {
      console.log("Receipt content loaded...");

      if (receiptData) {
        console.log("Injecting dynamic receipt data...");
        const injectionScript = `
          if (window.renderReceipt) {
            window.renderReceipt(${JSON.stringify(receiptData)});
          }
        `;
        await printWindow.webContents.executeJavaScript(injectionScript);
      }

      setTimeout(async () => {
        try {
          // Strictly measure the actual receipt container div, completely ignoring the invisible window's default height (which caused the 535px footer bug).
          const heightPixels = await printWindow.webContents.executeJavaScript(`document.getElementById('receiptContent').offsetHeight + 5`);
          
          // Conversion: 1 CSS pixel (96 DPI) = 264.5833 Microns
          const pageHeightMicrons = Math.ceil(heightPixels * 264.5833);
          
          console.log(`[POS Debug] Calculated HTML Height: ${heightPixels}px`);
          console.log(`[POS Debug] Passing PageSize to Driver -> Width: 58000 microns, Height: ${pageHeightMicrons} microns`);

          printWindow.webContents.print({
            silent: true,
            deviceName: printerName || '',
            margins: { marginType: 'none' },
            printBackground: true,
            pageSize: { width: 58000, height: pageHeightMicrons }
          }, (success, failureReason) => {
            if (!success) {
              console.error("Print Failed:", failureReason);
              reject(failureReason);
            } else {
              console.log("Print Success: Job queued to Windows spooler perfectly.");
              resolve(true);
            }
            printWindow.close();
          });
        } catch (err) {
          console.error("Critical error in print logic:", err);
          reject(err);
          printWindow.close();
        }
      }, 500); 
    });

    printWindow.loadFile('receipt.html').catch(reject);
  });
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
    await executePrint(printer, data);
    res.json({ success: true, message: "Print job sent successfully" });

    // Notify the UI about the API activity
    if (mainWindow) {
      mainWindow.webContents.send('api-log', {
        type: 'success',
        message: `Printed via API: ${data?.storeName || 'Receipt'}`
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
