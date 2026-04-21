const DEFAULT_PORT = 3011;
const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:5000",
  "http://localhost:5000",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://tippawan-admin.web.app"
];

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_PORT;
  }
  return port;
}

function parseAllowedOrigins(value) {
  if (!value) {
    return [...DEFAULT_ALLOWED_ORIGINS];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfig(env = process.env) {
  return {
    host: "127.0.0.1",
    port: parsePort(env.PRINT_SERVICE_PORT),
    printerName: String(env.PRINT_PRINTER_NAME || "").trim(),
    allowedOrigins: parseAllowedOrigins(env.PRINT_ALLOWED_ORIGINS)
  };
}

module.exports = {
  loadConfig
};
