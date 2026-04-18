const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printReceipt: (printerName) => ipcRenderer.invoke('print-receipt', printerName),
  onApiLog: (callback) => ipcRenderer.on('api-log', (event, value) => callback(value))
});
