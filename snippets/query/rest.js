const fetch = require("node-fetch")

const HOST = "http://localhost:9000"

async function run() {
  try {
    const query = insertInto([Date.now() * 1000, 100])

    const response = await fetch(
      `${HOST}/exec?query=${encodeURIComponent(query)}`,
    )
    const json = await response.json()

    console.log(json)
  } catch (error) {
    console.log(error)
  }
}

run()
