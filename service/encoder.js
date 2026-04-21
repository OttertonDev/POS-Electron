const { ServiceError } = require("./errors");

const ESC = 0x1b;
const GS = 0x1d;
const MAX_LINE_WIDTH = 32;

function encodeThaiTis620(text) {
  const bytes = [];

  for (const char of String(text || "")) {
    const codePoint = char.codePointAt(0);

    if (codePoint === 0x0a) {
      bytes.push(0x0a);
      continue;
    }

    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      bytes.push(codePoint);
      continue;
    }

    if (codePoint >= 0x0e01 && codePoint <= 0x0e3a) {
      bytes.push(codePoint - 0x0e01 + 0xa1);
      continue;
    }

    if (codePoint === 0x0e3f) {
      bytes.push(0xdf);
      continue;
    }

    if (codePoint >= 0x0e40 && codePoint <= 0x0e5b) {
      bytes.push(codePoint - 0x0e40 + 0xe0);
      continue;
    }

    throw new ServiceError(
      "ENCODING_FAILED",
      `Unsupported character for Thai 255 text encoding: "${char}"`
    );
  }

  return Buffer.from(bytes);
}

function toLine(text = "") {
  const value = String(text);
  if (value.length <= MAX_LINE_WIDTH) {
    return value;
  }
  return value.slice(0, MAX_LINE_WIDTH);
}

function padLine(left, right) {
  const safeLeft = String(left || "");
  const safeRight = String(right || "");
  const available = Math.max(1, MAX_LINE_WIDTH - safeRight.length);
  const clippedLeft = safeLeft.length > available ? safeLeft.slice(0, available) : safeLeft;
  return clippedLeft + " ".repeat(Math.max(1, MAX_LINE_WIDTH - clippedLeft.length - safeRight.length)) + safeRight;
}

function pushLine(chunks, text) {
  chunks.push(encodeThaiTis620(toLine(text)));
  chunks.push(Buffer.from([0x0a]));
}

function pushAlign(chunks, align) {
  const mode = align === "center" ? 0x01 : 0x00;
  chunks.push(Buffer.from([ESC, 0x61, mode]));
}

function buildReceiptBuffer(payload) {
  const chunks = [];

  chunks.push(Buffer.from([ESC, 0x40]));
  chunks.push(Buffer.from([ESC, 0x74, 0xff]));

  pushAlign(chunks, "center");
  pushLine(chunks, payload.storeName);
  if (payload.receiptId) {
    pushLine(chunks, `Receipt: ${payload.receiptId}`);
  }
  pushLine(chunks, payload.date);

  pushAlign(chunks, "left");
  pushLine(chunks, "-".repeat(MAX_LINE_WIDTH));

  for (const item of payload.items) {
    pushLine(chunks, `${item.qty} ${item.name}`);
    pushLine(chunks, padLine("", item.price));
  }

  pushLine(chunks, "-".repeat(MAX_LINE_WIDTH));

  if (payload.subtotal) {
    pushLine(chunks, padLine("Subtotal", payload.subtotal));
  }

  if (payload.tax) {
    pushLine(chunks, padLine("Tax", payload.tax));
  }

  pushLine(chunks, padLine("Total", payload.total));

  if (payload.cash) {
    pushLine(chunks, padLine("Cash", payload.cash));
  }

  if (payload.change) {
    pushLine(chunks, padLine("Change", payload.change));
  }

  if (payload.footer) {
    pushLine(chunks, "-".repeat(MAX_LINE_WIDTH));
    pushAlign(chunks, "center");
    pushLine(chunks, payload.footer);
  }

  chunks.push(Buffer.from([ESC, 0x64, 0x03]));
  chunks.push(Buffer.from([GS, 0x56, 0x00]));

  return Buffer.concat(chunks);
}

function buildTestPrintBuffer() {
  return buildReceiptBuffer({
    receiptId: "TEST-255",
    storeName: "Vozy P50 Thai Test",
    date: new Date().toLocaleString("th-TH"),
    items: [
      { qty: "1x", name: "ทดสอบภาษาไทย", price: "0.00" },
      { qty: "1x", name: "ชาไทย 55.00", price: "55.00" },
      { qty: "1x", name: "กาแฟเย็น 65.00", price: "65.00" }
    ],
    subtotal: "120.00",
    tax: "0.00",
    total: "120.00",
    cash: "120.00",
    change: "0.00",
    footer: "ขอบคุณที่ใช้บริการ"
  });
}

module.exports = {
  buildReceiptBuffer,
  buildTestPrintBuffer,
  encodeThaiTis620
};
