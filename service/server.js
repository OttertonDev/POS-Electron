const http = require("http");
const { loadConfig } = require("./config");
const { buildReceiptBuffer, buildTestPrintBuffer } = require("./encoder");
const { validatePrintPayload } = require("./validate");
const { ServiceError } = require("./errors");
const { printRawWindows } = require("./transport/windows-raw-printer");

const config = loadConfig();

function logEvent(type, message, extra = null) {
  const timestamp = new Date().toISOString();
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[${timestamp}] [${type}] ${message}${suffix}`);
}

function isOriginAllowed(origin) {
  if (!origin) {
    return true;
  }

  return config.allowedOrigins.includes(origin);
}

function writeJson(res, statusCode, payload, origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8"
  };

  if (origin && isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new ServiceError("PAYLOAD_INVALID", "Request body must be valid JSON.", 400));
      }
    });
    req.on("error", reject);
  });
}

function buildHealthPayload() {
  const ready = Boolean(config.printerName);

  return {
    success: ready,
    code: ready ? "OK" : "PRINTER_NOT_CONFIGURED",
    message: ready
      ? "Silent print service is ready."
      : "Silent print service is running, but PRINT_PRINTER_NAME is not configured.",
    printerName: config.printerName || "",
    host: config.host,
    port: config.port
  };
}

async function handlePrintJob(buffer, jobName) {
  if (!config.printerName) {
    throw new ServiceError("PRINTER_NOT_CONFIGURED", "PRINT_PRINTER_NAME is not configured.", 500);
  }

  return printRawWindows({
    printerName: config.printerName,
    jobName,
    dataBuffer: buffer
  });
}

async function requestHandler(req, res) {
  const origin = req.headers.origin || "";

  if (req.method === "OPTIONS") {
    if (origin && !isOriginAllowed(origin)) {
      writeJson(res, 403, {
        success: false,
        code: "ORIGIN_NOT_ALLOWED",
        message: "Origin not allowed."
      }, origin);
      return;
    }

    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin || "null",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    });
    res.end();
    return;
  }

  if (origin && !isOriginAllowed(origin)) {
    writeJson(res, 403, {
      success: false,
      code: "ORIGIN_NOT_ALLOWED",
      message: "Origin not allowed."
    }, origin);
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      writeJson(res, 200, buildHealthPayload(), origin);
      return;
    }

    if (req.method === "POST" && req.url === "/print") {
      const payload = validatePrintPayload(await parseBody(req));
      const buffer = buildReceiptBuffer(payload);
      await handlePrintJob(buffer, payload.receiptId || "POS Receipt");

      logEvent("PRINT_OK", "Printed receipt.", {
        receiptId: payload.receiptId || "",
        printerName: config.printerName
      });

      writeJson(res, 200, {
        success: true,
        code: "OK",
        message: "Receipt sent to printer."
      }, origin);
      return;
    }

    if (req.method === "POST" && req.url === "/test-print") {
      const buffer = buildTestPrintBuffer();
      await handlePrintJob(buffer, "Vozy P50 Thai Test");

      logEvent("TEST_PRINT_OK", "Printed Thai test receipt.", {
        printerName: config.printerName
      });

      writeJson(res, 200, {
        success: true,
        code: "OK",
        message: "Thai test receipt sent to printer."
      }, origin);
      return;
    }

    writeJson(res, 404, {
      success: false,
      code: "NOT_FOUND",
      message: "Route not found."
    }, origin);
  } catch (error) {
    const serviceError = error instanceof ServiceError
      ? error
      : new ServiceError("SERVICE_NOT_READY", error.message || "Unexpected service error.", 500);

    logEvent("PRINT_ERR", serviceError.message, {
      code: serviceError.code
    });

    writeJson(res, serviceError.statusCode, {
      success: false,
      code: serviceError.code,
      message: serviceError.message
    }, origin);
  }
}

function startServer() {
  const server = http.createServer(requestHandler);

  server.listen(config.port, config.host, () => {
    logEvent("SERVICE", "Silent print service started.", {
      host: config.host,
      port: config.port,
      printerName: config.printerName || ""
    });
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  startServer
};
