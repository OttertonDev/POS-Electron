const { requestJson } = require("./request-json");

requestJson("GET", "/health")
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
