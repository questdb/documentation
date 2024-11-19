const fetch = require("node-fetch")

const HOST = "http://localhost:9000"

async function run() {
  try {
    const query = `
        INSERT INTO
          trades
        VALUES(
          to_timestamp('2020-10-09T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
          123456
        );
      `

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
