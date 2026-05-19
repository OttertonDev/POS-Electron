const { ServiceError } = require("./errors");

function getOptionalString(value) {
  if (value == null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ServiceError("PAYLOAD_INVALID", "Text fields must be strings.", 400);
  }

  return value.trim();
}

function validateItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new ServiceError("PAYLOAD_INVALID", `Item ${index + 1} must be an object.`, 400);
  }

  const qty = getOptionalString(item.qty);
  const name = getOptionalString(item.name);
  const price = getOptionalString(item.price);

  if (!qty || !name || !price) {
    throw new ServiceError("PAYLOAD_INVALID", `Item ${index + 1} must include qty, name, and price.`, 400);
  }

  return {
    qty,
    name,
    price,
    tagLine: getOptionalString(item.tagLine),
    variantLine: getOptionalString(item.variantLine)
  };
}

function validateReceiptLayout(layout) {
  if (!Array.isArray(layout)) {
    return [];
  }

  return layout
    .filter((line) => line && typeof line === "object")
    .slice(0, 40)
    .map((line, index) => {
      const type = getOptionalString(line.type) || "field";
      const align = getOptionalString(line.align);

      return {
        id: getOptionalString(line.id) || `${type}-${index}`,
        type,
        source: getOptionalString(line.source),
        label: getOptionalString(line.label),
        align: ["left", "center", "right"].includes(align) ? align : "left",
        visible: line.visible !== false,
        text: getOptionalString(line.text)
      };
    });
}

function validatePrintPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new ServiceError("PAYLOAD_INVALID", "Request body must be a JSON object.", 400);
  }

  const items = Array.isArray(payload.items) ? payload.items.map(validateItem) : [];
  const storeName = getOptionalString(payload.storeName);
  const date = getOptionalString(payload.date);
  const total = getOptionalString(payload.total);

  if (!storeName || !date || !total || items.length === 0) {
    throw new ServiceError(
      "PAYLOAD_INVALID",
      "Payload must include storeName, date, total, and at least one item.",
      400
    );
  }

  return {
    receiptId: getOptionalString(payload.receiptId),
    storeName,
    address: getOptionalString(payload.address),
    phone: getOptionalString(payload.phone),
    date,
    items,
    subtotal: getOptionalString(payload.subtotal),
    tax: getOptionalString(payload.tax),
    total,
    cash: getOptionalString(payload.cash),
    change: getOptionalString(payload.change),
    footer: getOptionalString(payload.footer),
    receiptLayout: validateReceiptLayout(payload.receiptLayout)
  };
}

module.exports = {
  validatePrintPayload
};
