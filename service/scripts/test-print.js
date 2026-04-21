const { requestJson } = require("./request-json");

requestJson("POST", "/test-print", {})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
