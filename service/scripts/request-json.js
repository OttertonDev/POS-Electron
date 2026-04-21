const http = require("http");
const { loadConfig } = require("../config");

function requestJson(method, pathname, payload) {
  const config = loadConfig();
  const data = payload ? JSON.stringify(payload) : "";

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: config.host,
      port: config.port,
      path: pathname,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

module.exports = {
  requestJson
};
