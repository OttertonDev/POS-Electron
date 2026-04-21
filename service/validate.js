const { ServiceError } = require("./errors");

function asOptionalString(value) {
  if (value == null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ServiceError("PAYLOAD_INVALID", "Optional text fields must be strings.", 400);
  }

  return value.trim();
}

function validateItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new ServiceError("PAYLOAD_INVALID", `Item ${index + 1} must be an object.`, 400);
  }

  const qty = asOptionalString(item.qty);
  const name = asOptionalString(item.name);
  const price = asOptionalString(item.price);

  if (!qty || !name || !price) {
    throw new ServiceError("PAYLOAD_INVALID", `Item ${index + 1} must include qty, name, and price.`, 400);
  }

  return { qty, name, price };
}

function validatePrintPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ServiceError("PAYLOAD_INVALID", "Request body must be a JSON object.", 400);
  }

  const storeName = asOptionalString(payload.storeName);
  const date = asOptionalString(payload.date);
  const total = asOptionalString(payload.total);
  const items = Array.isArray(payload.items) ? payload.items.map(validateItem) : null;

  if (!storeName || !date || !total || !items || items.length === 0) {
    throw new ServiceError(
      "PAYLOAD_INVALID",
      "Payload must include storeName, date, total, and at least one item.",
      400
    );
  }

  return {
    receiptId: asOptionalString(payload.receiptId),
    storeName,
    date,
    items,
    subtotal: asOptionalString(payload.subtotal),
    tax: asOptionalString(payload.tax),
    total,
    cash: asOptionalString(payload.cash),
    change: asOptionalString(payload.change),
    footer: asOptionalString(payload.footer)
  };
}

module.exports = {
  validatePrintPayload
};
