document.addEventListener('DOMContentLoaded', async () => {
  const printerSelect = document.getElementById('printerSelect');
  const printBtn = document.getElementById('printBtn');
  const statusDiv = document.getElementById('status');

  try {
    // Load available OS printers
    const printers = await window.electronAPI.getPrinters();
    printerSelect.innerHTML = '';
    
    // Default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.text = 'Default System Printer';
    printerSelect.appendChild(defaultOption);

    // List all printers installed on machine
    printers.forEach(printer => {
      const option = document.createElement('option');
      option.value = printer.name;
      option.text = printer.name + (printer.isDefault ? ' (Default)' : '');
      if (printer.isDefault) {
        option.selected = true;
      }
      printerSelect.appendChild(option);
    });
  } catch (err) {
    statusDiv.innerHTML = `<span style="color:red">Failed to load printers: ${err.message}</span>`;
  }

  printBtn.addEventListener('click', async () => {
    const selectedPrinter = printerSelect.value;
    printBtn.disabled = true;
    printBtn.innerText = 'Printing...';
    statusDiv.innerHTML = '';

    try {
      await window.electronAPI.printReceipt(selectedPrinter);
      statusDiv.innerHTML = '<span style="color:green">Print signal sent successfully! Check your physical printer.</span>';
    } catch (err) {
      statusDiv.innerHTML = `<span style="color:red">Print Error: ${err}</span>`;
    } finally {
      requestAnimationFrame(() => {
        printBtn.disabled = false;
        printBtn.innerText = 'Print Manual Sample';
      });
    }
  });

  // Listen for API activity logs from the main process
  const logList = document.getElementById('logList');
  window.electronAPI.onApiLog((log) => {
    const time = new Date().toLocaleTimeString();
    const logItem = document.createElement('div');
    logItem.style.marginBottom = '5px';
    logItem.style.borderBottom = '1px solid #f0f0f0';
    logItem.style.paddingBottom = '3px';
    
    const color = log.type === 'error' ? 'red' : 'green';
    logItem.innerHTML = `<span style="color:#888">[${time}]</span> <span style="color:${color}">${log.message}</span>`;
    
    // Remove the "Waiting" placeholder on first log
    if (logList.innerHTML.includes('Waiting for API activity')) {
      logList.innerHTML = '';
    }
    
    logList.prepend(logItem);
  });
});
