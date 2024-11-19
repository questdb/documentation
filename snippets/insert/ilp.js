"use strict"

const net = require("net")

const client = new net.Socket()

const HOST = "localhost"
const PORT = 9009

function run() {
  client.connect(PORT, HOST, () => {
    const rows = [
      `test,location=uk temperature=12.4 ${Date.now() * 1e6}`,
      `test,location=uk temperature=11.4 ${Date.now() * 1e6}`,
    ]

    function write(idx) {
      if (idx === rows.length) {
        client.destroy()
        return
      }

      client.write(rows[idx] + "\n", (err) => {
        if (err) {
          console.error(err)
          process.exit(1)
        }
        write(++idx)
      })
    }

    write(0)
  })

  client.on("error", (err) => {
    console.error(err)
    process.exit(1)
  })

  client.on("close", () => {
    console.log("Connection closed")
  })
}

run()
