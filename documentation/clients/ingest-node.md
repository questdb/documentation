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

## Authentication

Passing in a configuration string with basic auth:

```javascript
const { Sender } = require("@questdb/nodejs-client");

const conf = "http::addr=localhost:9000;username=admin;password=quest;"
const sender = Sender.fromConfig(conf);
    ...
```

Passing via the `QDB_CLIENT_CONF` env var:

```bash
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

```javascript
const { Sender } = require("@questdb/nodejs-client");


const sender = Sender.fromEnv();
    ...
```

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more
info.

## Basic insert

Example: inserting executed trades for cryptocurrencies.

Without authentication and using the current timestamp.

```javascript
const { Sender } = require("@questdb/nodejs-client")

async function run() {
  // create a sender using HTTP protocol
  const sender = Sender.fromConfig("http::addr=localhost:9000")

  // add rows to the buffer of the sender
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.00044)
    .atNow()

  // flush the buffer of the sender, sending the data to QuestDB
  // the buffer is cleared after the data is sent, and the sender is ready to accept new data
  await sender.flush()

  // close the connection after all rows ingested
  // unflushed data will be lost
  await sender.close()
}

run().then(console.log).catch(console.error)
```

In this case, the designated timestamp will be the one at execution time. Let's
see now an example with an explicit timestamp, custom auto-flushing, and basic
auth.

```javascript
const { Sender } = require("@questdb/nodejs-client")

async function run() {
  // create a sender using HTTP protocol
  const sender = Sender.fromConfig(
    "http::addr=localhost:9000;username=admin;password=quest;auto_flush_rows=100;auto_flush_interval=1000;",
  )

  // Calculate the current timestamp. You could also parse a date from your source data.
  const timestamp = Date.now()

  // add rows to the buffer of the sender
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.00044)
    .at(timestamp, "ms")

  // add rows to the buffer of the sender
  await sender
    .table("trades")
    .symbol("symbol", "BTC-USD")
    .symbol("side", "sell")
    .floatColumn("price", 39269.98)
    .floatColumn("amount", 0.001)
    .at(timestamp, "ms")

  // flush the buffer of the sender, sending the data to QuestDB
  // the buffer is cleared after the data is sent, and the sender is ready to accept new data
  await sender.flush()

  // close the connection after all rows ingested
  // unflushed data will be lost
  await sender.close()
}

run().then(console.log).catch(console.error)
```

As you can see, both events now are using the same timestamp. We recommended to
use the original event timestamps when ingesting data into QuestDB. Using the
current timestamp hinder the ability to deduplicate rows which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

## Configuration options

The minimal configuration string needs to have the protocol, host, and port, as
in:

```
http::addr=localhost:9000;
```

For all the extra options you can use, please check
[the client docs](https://questdb.github.io/nodejs-questdb-client/SenderOptions.html)

Alternatively, for a breakdown of Configuration string options available across
all clients, see the [Configuration string](/docs/configuration-string/) page.

## Next Steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
about transactions, error control, delivery guarantees, health check, or table
and column auto-creation.

Dive deeper into the Node.js client capabilities, including TypeScript and
Worker Threads examples, by exploring the
[GitHub repository](https://github.com/questdb/nodejs-questdb-client).

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Should you encounter any issues or have questions, the
[Community Forum](https://community.questdb.io/) is a vibrant platform for
discussions.
