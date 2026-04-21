const path = require("path");
const { spawn } = require("child_process");
const { ServiceError } = require("../errors");

const helperScript = path.join(__dirname, "windows-raw-spool.ps1");

function printRawWindows({ printerName, jobName, dataBuffer }) {
  return new Promise((resolve, reject) => {
    if (!printerName) {
      reject(new ServiceError("PRINTER_NOT_CONFIGURED", "PRINT_PRINTER_NAME is not configured.", 500));
      return;
    }

    const child = spawn(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        helperScript,
        "-PrinterName",
        printerName,
        "-JobName",
        jobName,
        "-PayloadBase64",
        dataBuffer.toString("base64")
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({
          printerName,
          output: stdout.trim()
        });
        return;
      }

      reject(new ServiceError(
        "PRINT_TRANSPORT_FAILED",
        stderr.trim() || stdout.trim() || `Raw print exited with code ${code}.`,
        500
      ));
    });
  });
}

module.exports = {
  printRawWindows
};
