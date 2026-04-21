const assert = require("assert");
const { buildTestPrintBuffer, encodeThaiTis620 } = require("../encoder");

const encoded = encodeThaiTis620("ทดสอบภาษาไทย");
assert(encoded.length > 0, "Thai sample should encode.");

const buffer = buildTestPrintBuffer();
assert(buffer[0] === 0x1b && buffer[1] === 0x40, "Receipt should begin with ESC @.");
assert(buffer.includes(Buffer.from([0x1b, 0x74, 0xff])), "Receipt should select ESC t 255.");

console.log("Encoder smoke check passed.");
