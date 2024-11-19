const rimraf = require("rimraf")
console.log("Removing docs/__guidelines")
rimraf.sync("./docs/__guidelines")
