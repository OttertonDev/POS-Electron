const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = 3010;
const DEMO_PAGE = path.join(__dirname, "silent-print-demo.html");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function hasThaiCharacters(value) {
  return /[\u0E00-\u0E7F]/.test(String(value || ""));
}

function toPrintableAscii(value) {
  return String(value || "")
    .replace(/[^\x20-\x7E\n]/g, "?")
    .replace(/\r\n/g, "\n");
}

function bufferToHex(buffer) {
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function pushTextLine(chunks, line) {
  chunks.push(Buffer.from(toPrintableAscii(line), "ascii"));
  chunks.push(Buffer.from("\n", "ascii"));
}

function buildEscPosTextReceipt(payload) {
  const chunks = [];
  const warnings = [];
  const lines = [];

  const allText = [
    payload.storeName,
    payload.footer,
    ...(payload.items || []).flatMap((item) => [item.name, item.qty, item.price])
  ].filter(Boolean);

  if (allText.some((value) => hasThaiCharacters(value))) {
    warnings.push("Thai text detected. Raw ESC/POS text mode needs a printer-specific Thai code page and matching byte encoding.");
    warnings.push("This demo falls back to ASCII-safe placeholders for non-ASCII characters.");
  }

  chunks.push(Buffer.from([0x1b, 0x40]));
  chunks.push(Buffer.from([0x1b, 0x61, 0x01]));
  pushTextLine(chunks, payload.storeName || "Silent Printer Demo");
  chunks.push(Buffer.from([0x1b, 0x61, 0x00]));
  pushTextLine(chunks, "--------------------------------");

  for (const item of payload.items || []) {
    const line = `${item.qty || "1x"} ${item.name || "Item"} ${item.price || "0.00"}`;
    pushTextLine(chunks, line);
    lines.push(line);
  }

  pushTextLine(chunks, "--------------------------------");
  pushTextLine(chunks, `TOTAL ${payload.total || "0.00"}`);
  if (payload.footer) {
    pushTextLine(chunks, payload.footer);
  }

  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));

  const bytes = Buffer.concat(chunks);
  return {
    engine: "escpos-text-demo",
    warnings,
    bytesHex: bufferToHex(bytes),
    byteLength: bytes.length,
    previewLines: lines
  };
}

function buildRasterSafePlan(payload) {
  const warnings = [];
  const allText = [
    payload.storeName,
    payload.footer,
    ...(payload.items || []).flatMap((item) => [item.name, item.qty, item.price])
  ].filter(Boolean);

  if (allText.some((value) => hasThaiCharacters(value))) {
    warnings.push("Thai text is safest when rendered as an image/bitmap before sending ESC/POS commands.");
  }

  return {
    engine: "raster-safe-plan",
    warnings,
    explanation: [
      "Render receipt HTML or canvas to a monochrome bitmap.",
      "Convert bitmap rows into ESC/POS raster bytes (GS v 0 or ESC *).",
      "Send the bytes through a local bridge with silent printer access."
    ],
    sampleControlBytes: "1b 40 1d 76 30 00 ... 1d 56 00"
  };
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
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    const html = fs.readFileSync(DEMO_PAGE, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      message: "Silent print bridge demo is running."
    });
    return;
  }

  if (req.method === "POST" && req.url === "/print-demo") {
    try {
      const body = await parseBody(req);
      const payload = body.data || {};
      const mode = body.mode || "escpos-text-demo";

      const result = mode === "raster-safe-plan"
        ? buildRasterSafePlan(payload)
        : buildEscPosTextReceipt(payload);

      sendJson(res, 200, {
        success: true,
        mode,
        result
      });
    } catch (error) {
      sendJson(res, 400, {
        success: false,
        error: error.message
      });
    }
    return;
  }

  sendJson(res, 404, { success: false, error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Silent printer demo bridge running at http://${HOST}:${PORT}`);
});
