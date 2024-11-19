"use strict"

const { Client } = require("pg")

const start = async () => {
  const client = new Client({
    database: "qdb",
    host: "127.0.0.1",
    password: "quest",
    port: 8812,
    user: "admin",
  })
  await client.connect()

  const res = await client.query("SELECT x FROM long_sequence(5);")

  console.log(res)

  await client.end()
}

start().catch(console.error)
