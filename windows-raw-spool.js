const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RAW_SPOOL_POWERSHELL = String.raw`
$ErrorActionPreference = 'Stop'

$printerName = $env:POS_RAW_PRINTER
$dataPath = $env:POS_RAW_DATA_PATH
$jobName = $env:POS_RAW_JOB_NAME

if ([string]::IsNullOrWhiteSpace($jobName)) {
  $jobName = 'Otterton POS RAW Receipt'
}

if ([string]::IsNullOrWhiteSpace($dataPath) -or -not (Test-Path $dataPath)) {
  throw 'Raw spool payload file was not found.'
}

if ([string]::IsNullOrWhiteSpace($printerName)) {
  $defaultPrinter = Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name
  if ([string]::IsNullOrWhiteSpace($defaultPrinter)) {
    throw 'No default printer found for raw spool.'
  }
  $printerName = $defaultPrinter
}

if (-not ('RawPrinterHelper' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)]
    public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string printerName, byte[] bytes, string jobName, out string errorMessage) {
    IntPtr hPrinter = IntPtr.Zero;
    bool docStarted = false;
    bool pageStarted = false;
    errorMessage = string.Empty;

    try {
      if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {
        errorMessage = "OpenPrinter failed: " + Marshal.GetLastWin32Error();
        return false;
      }

      DOCINFOW di = new DOCINFOW();
      di.pDocName = string.IsNullOrWhiteSpace(jobName) ? "Otterton POS RAW Receipt" : jobName;
      di.pDataType = "RAW";

      if (StartDocPrinter(hPrinter, 1, di) == 0) {
        errorMessage = "StartDocPrinter failed: " + Marshal.GetLastWin32Error();
        return false;
      }
      docStarted = true;

      if (!StartPagePrinter(hPrinter)) {
        errorMessage = "StartPagePrinter failed: " + Marshal.GetLastWin32Error();
        return false;
      }
      pageStarted = true;

      int written;
      bool ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
      if (!ok || written != bytes.Length) {
        errorMessage = "WritePrinter failed: " + Marshal.GetLastWin32Error() + " (written=" + written + "/" + bytes.Length + ")";
        return false;
      }

      return true;
    }
    finally {
      if (pageStarted) {
        EndPagePrinter(hPrinter);
      }
      if (docStarted) {
        EndDocPrinter(hPrinter);
      }
      if (hPrinter != IntPtr.Zero) {
        ClosePrinter(hPrinter);
      }
    }
  }
}
"@
}

$bytes = [System.IO.File]::ReadAllBytes($dataPath)
$errText = ''
$ok = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes, $jobName, [ref]$errText)

if (-not $ok) {
  throw ("Raw spool failed for '" + $printerName + "'. " + $errText)
}

Write-Output ("RAW_OK:" + $printerName)
`;

function runRawSpoolPowerShell(printerName, payloadPath, jobName) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      RAW_SPOOL_POWERSHELL
    ], {
      windowsHide: true,
      env: {
        ...process.env,
        POS_RAW_PRINTER: printerName || '',
        POS_RAW_DATA_PATH: payloadPath,
        POS_RAW_JOB_NAME: jobName || 'Otterton POS RAW Receipt'
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
        return;
      }

      const match = stdout.match(/RAW_OK:(.+)/);
      const resolvedPrinterName = match ? match[1].trim() : (printerName || '');
      resolve({
        printerName: resolvedPrinterName
      });
    });
  });
}

async function sendRawToPrinterWindows({ printerName, dataBuffer, jobName }) {
  if (process.platform !== 'win32') {
    throw new Error('Windows raw spool path is only available on win32.');
  }

  if (!Buffer.isBuffer(dataBuffer) || dataBuffer.length === 0) {
    throw new Error('Expected a non-empty Buffer for raw printer payload.');
  }

  const tempFilePath = path.join(
    os.tmpdir(),
    `pos-raw-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  );

  await fs.promises.writeFile(tempFilePath, dataBuffer);

  try {
    return await runRawSpoolPowerShell(printerName, tempFilePath, jobName);
  } finally {
    await fs.promises.unlink(tempFilePath).catch(() => {});
  }
}

module.exports = {
  sendRawToPrinterWindows
};