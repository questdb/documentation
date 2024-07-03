---
title: Node.js Client Documentation
description:
  "Get started with QuestDB using the Node.js client for efficient,
  high-performance insert operations. Achieve unparalleled time series data
  ingestion and query capabilities."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB offers Node.js developers a dedicated client designed for efficient and
high-performance data ingestion.

The Node.js client has solid benefits:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

This quick start guide introduces the basic functionalities of the Node.js
client, including setting up a connection, inserting data, and flushing data to
QuestDB.

<ILPClientsTable language="NodeJS" />

## Requirements

- Node.js v16 or newer.
- Assumes QuestDB is running. If it's not, refer to
  [the general quick start](/docs/quick-start/).

## Client installation

Install the QuestDB Node.js client via npm:

```shell
npm i -s @questdb/nodejs-client
```

## Basic Usage

A simple example to connect to QuestDB, insert some data into a table, and flush
the data:

```javascript
const { Sender } = require("@questdb/nodejs-client")

async function run() {
  // create a sender using HTTP protocol
  const sender = Sender.fromConfig("http::addr=localhost:9000")

  // add rows to the buffer of the sender
  await sender
    .table("prices")
    .symbol("instrument", "EURUSD")
    .floatColumn("bid", 1.0195)
    .floatColumn("ask", 1.0221)
    .at(Date.now(), "ms")
  await sender
    .table("prices")
    .symbol("instrument", "GBPUSD")
    .floatColumn("bid", 1.2076)
    .floatColumn("ask", 1.2082)
    .at(Date.now(), "ms")

  // flush the buffer of the sender, sending the data to QuestDB
  // the buffer is cleared after the data is sent, and the sender is ready to accept new data
  await sender.flush()

  // add rows to the buffer again, and send it to the server
  await sender
    .table("prices")
    .symbol("instrument", "EURUSD")
    .floatColumn("bid", 1.0197)
    .floatColumn("ask", 1.0224)
    .at(Date.now(), "ms")
  await sender.flush()

  // close the connection after all rows ingested
  await sender.close()
}

run().then(console.log).catch(console.error)
```

## Next Steps

Dive deeper into the Node.js client capabilities by exploring more examples
provided in the
[GitHub repository](https://github.com/questdb/nodejs-questdb-client).

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Should you encounter any issues or have questions, the
[Community Forum](https://community.questdb.io/) is a vibrant platform for
discussions.
