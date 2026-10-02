---
slug: /connect/clients/nodejs
title: Node.js client for QuestDB
sidebar_label: Node.js
description: "Use @questdb/nodejs-client for QWP ingestion, streaming SQL queries, failover, and store-and-forward from TypeScript or JavaScript."
---

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

`@questdb/nodejs-client` ingests rows and streams SQL results over the
[QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/qwp-ingress-websocket/).
One pooled client can serve both writers and queries. It also supports the
older ILP transports for existing applications.

## Requirements

- `@questdb/nodejs-client` 5.0.0 or later (earlier versions support ILP only).
- Node.js 20.18.1 or later.
- QuestDB 10.0.0 or later, with QWP on its HTTP port (9000 by default).

<span id="client-installation"></span>

## Installation

```shell
npm install @questdb/nodejs-client@^5
npm install --save-dev tsx
```

The examples are TypeScript ES modules: save one as `example.mts` and run
`npx tsx example.mts`. For JavaScript, use `.mjs` or `"type": "module"`
and remove TypeScript annotations.

## Quick start

Create a table, publish a row, wait for QuestDB's acknowledgement, then poll
until the row is visible. An acknowledgement means QuestDB has committed the
row, but queries see it only after it is applied, which happens
asynchronously; see [Read-after-write](#read-after-write).

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const ddl = await lease.query(
      "CREATE TABLE IF NOT EXISTS trades (" +
        "timestamp TIMESTAMP, symbol SYMBOL, side SYMBOL, " +
        "price DOUBLE, amount DOUBLE" +
        ") TIMESTAMP(timestamp) PARTITION BY DAY",
    );
    await ddl.completion;

    const eventTime = Date.now(); // milliseconds; also used to find the row
    const sender = await db.borrowSender();
    try {
      await sender
        .table("trades")
        .symbol("symbol", "ETH-USD")
        .symbol("side", "buy")
        .doubleColumn("price", 2615.54)
        .doubleColumn("amount", 0.5)
        .at(eventTime, "ms");
      await sender.flush();
      await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
    } finally {
      await sender.close(); // return it to the pool
    }

    // Poll until the acknowledged row is visible, for up to 10 seconds.
    const deadline = Date.now() + 10_000;
    let found = false;
    while (!found && Date.now() < deadline) {
      const query = await lease.query(
        "SELECT timestamp, symbol, side, price, amount FROM trades " +
          "WHERE timestamp = $1",
        {
          binds: (binds) =>
            binds.setTimestampMicros(0, BigInt(eventTime) * 1000n),
        },
      );
      for await (const batch of query) {
        for (const row of batch.rows()) {
          // [timestamp in microseconds, symbol, side, price, amount]
          console.log(row);
          found = true;
        }
      }
      await query.completion;
      if (!found) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!found) throw new Error("row not visible after 10 seconds");
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

Use an event timestamp rather than `atNow()` if rows may be replayed. If a
`trades` table already exists with a different designated timestamp name,
change the SQL to match it; the
[PGWire Node.js guide](/docs/connect/compatibility/pgwire/nodejs/) uses `ts`.

## Connecting

`connectQwpNodeClient(conf, options?)` opens a pooled ingestion and query
connection and rejects if the server is unreachable. A `ws::` connect string
uses plain WebSocket, and `wss::` uses TLS. The same `addr`, credentials, and
TLS settings apply to both directions:

```text
ws::addr=localhost:9000;sender_pool_max=2;query_pool_max=8;
```

`addr` accepts comma-separated or repeated hosts. A port omitted from an
address defaults to 9000. A key may appear only once (except `addr`);
unknown keys and duplicate keys fail validation. Escape a semicolon in a
value as `;;`. See the
[connect string reference](/docs/connect/clients/connect-string/) for the
shared keys and [Differences from other clients](#differences-from-other-clients)
for Node.js exceptions. A second argument takes typed options; see
[Programmatic options](#programmatic-options).

`connectQwpNodeClient()` resolves to a `QwpClient`. Its `borrowSender()`
returns a `QwpSender`, and its `borrowQuery()` a `QwpQueryLease`. The package
exports all three classes, so you can use them to type your own variables.

### Standalone Sender

For ingestion without a pool, create a `Sender` from a connect string, call
`connect()` before writing, and close it in a `finally` block:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  await sender.connect();
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .floatColumn("price", 2615.54) // DOUBLE: the Sender has no doubleColumn()
    .floatColumn("amount", 0.5)
    .at(Date.now(), "ms");
  await sender.flush();
} finally {
  await sender.close();
}
```

The standalone `Sender` has only the nine column methods it shares with ILP
(see [Column methods](#column-methods)); use `sender.writer()` for other types,
or a pooled sender. It also speaks ILP over `http::` and `tcp::`; see
[ILP transports](#ilp-transports-legacy). For a typed standalone QWP sender
with every column method, use
`await connectQwpNodeSender({ url: "ws://localhost:9000/write/v4" })`.

<span id="authentication"></span>

## Authentication and TLS

Use a bearer token (QuestDB Enterprise) or HTTP basic authentication. Supply
secrets through your application's configuration rather than source code:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");
const db = await connectQwpNodeClient(
  `wss::addr=db.example.com:9000;token=${token};`,
);
await db.close();
```

Basic auth uses `username=...;password=...;`. With `wss`, the client checks
certificates against Node.js's bundled CA store. For a private CA, set
`tls_roots=/path/to/ca.pem` or `NODE_EXTRA_CA_CERTS`; only PEM roots are
supported. `tls_verify=unsafe_off` disables verification for development
and cannot be combined with `tls_roots`.

| Path | Status | Alternative |
|---|---|---|
| OIDC token acquisition or refresh | Not supported. The client does not talk to an identity provider. | Get an access token from your identity provider, pass it as `token`, and create a new client before it expires. See [OpenID Connect](/docs/security/oidc/). |
| Client certificates (mTLS) | Not supported. QuestDB does not negotiate client certificates. | Use a token or basic auth over `wss`. |
| Token rotation on a running client | Not supported. Every connection, including reconnects, sends the token the client was created with. | Close the client and create a new one with the new token. For a token rejected on reconnect, see [Connection-level errors](#connection-level-errors). |

## The connection pool

Borrow one sender per concurrent producer and one query lease per concurrent
query. Each pool defaults to a minimum of 1 and a maximum of 4 connections;
set `sender_pool_max`, `query_pool_max`, and, if needed, their `_min` keys.
A borrowed sender's `close()` flushes completed rows and **returns it to the
pool**, but does not normally wait for their acknowledgements. A returned
lease or sender must not be reused. Size pools to the number of simultaneous
borrows, and close the client on shutdown.

### Startup and outage modes {#ingestion-modes}

To start while QuestDB is down and keep accepting rows during an outage, add
`lazy_connect=on;sf_max_segment_bytes=1m;` to the connect string. To also
keep unacknowledged rows across process restarts, add
`sf_dir=/var/lib/myapp/qdb-sf;sender_id=trades;`. These keys select one of
three modes:

| Mode | Keys | QuestDB down at startup | During an outage |
|---|---|---|---|
| Default memory | None | `connectQwpNodeClient()` rejects | `flush()`, and `at()` when it triggers an auto-flush, wait for the reconnect for up to `reconnect_max_duration_millis` (5 minutes by default). Then the sender fails with `QwpReconnectExhaustedError` and its unacknowledged rows are lost |
| Background memory | `lazy_connect=on` | Starts; rows queue in memory | Rows queue in memory, up to `sf_max_total_bytes` (128 MiB by default); retries continue indefinitely |
| Store-and-forward | `sf_dir`, usually with `lazy_connect=on` | With `lazy_connect=on`, starts and journals rows; without it, rejects | Rows go to the disk journal and survive a process restart; retries continue indefinitely |

:::caution Default memory mode blocks producers

Auto-flush runs on the first `at()` call 100 ms or more after the last flush,
so in default memory mode a producer blocks almost as soon as an outage
starts. The blocked call throws if QuestDB is still unreachable after
`reconnect_max_duration_millis` (5 minutes by default). If a producer must
not block on QuestDB, for example an HTTP request handler, use a background
start: its calls block only when the replay queue is full; see
[Backpressure](#backpressure).

:::

How the keys combine:

- **Foreground and background start.** By default, senders get a
  *foreground start*: `connectQwpNodeClient()` connects them and rejects if
  QuestDB is down. `lazy_connect=on` gives them a *background start* instead
  and sets `query_pool_min=0`; combining it with a positive
  `query_pool_min` is a configuration error. `initial_connect_retry=async`
  also gives senders a background start, but `connectQwpNodeClient()` still
  opens one query connection at startup and rejects while QuestDB is down,
  unless you also set `query_pool_min=0`. A query borrowed before QuestDB is
  reachable fails. A standalone `Sender` gets a background start from either
  key.
- **Batch size.** With a background start, set `sf_max_segment_bytes=1m`,
  with or without `sf_dir`; see [Batch size limits](#batch-size-limits).
- **Storage.** Without `sf_dir`, unacknowledged rows live in memory and are
  lost if the process exits. With `sf_dir`, they are journaled to disk and
  replayed after a restart; see [Store-and-forward](#store-and-forward).
  `sf_dir` alone keeps a foreground start: startup rejects while QuestDB is
  down, and outages after the first successful connection are retried
  indefinitely.
- **Tables.** An ingester that starts while QuestDB is down cannot create
  its tables first. Create tables that need DEDUP beforehand; see
  [Store-and-forward](#store-and-forward).
- **First-connection retry.** `initial_connect_retry=on`, or any
  `reconnect_*` key unless `initial_connect_retry=off` is set, makes senders
  retry their first connection for up to `reconnect_max_duration_millis`
  instead of failing at once. The sender stays in default memory mode. These
  keys do not apply to query connections, so with the default
  `query_pool_min=1`, `connectQwpNodeClient()` still rejects almost at once:
  also set `query_pool_min=0`.
- **Locked journal.** A journal locked by another process fails startup,
  even with a background start; see [Lock recovery](#sf-lock-recovery).

### Closing the pooled client

`db.close()` rejects new borrows, closes idle senders and queries, and waits
briefly for borrowed senders to be returned. It then waits up to
`close_flush_timeout_millis` (5 seconds by default) for acknowledgements and
resolves even if some batches are still unacknowledged: with `sf_dir`, they
stay in the journal and are replayed on the next start; without it, they are
lost. When an ACK is required, call
`await sender.waitForAcknowledged(sender.publishedSequence, timeoutMs)` before
returning a borrowed sender.

A borrowed sender's `close()` flushes its completed rows. With a background
start or `sf_dir`, that hands them to the memory replay queue or the journal,
so `close()` returns without waiting for QuestDB, even during an outage,
unless the queue or journal is full (see [Backpressure](#backpressure)). In
[default memory mode](#ingestion-modes), `close()` can wait for a reconnect up
to `reconnect_max_duration_millis` (5 minutes by default); plan your shutdown
deadline accordingly.

## Data ingestion

<span id="basic-insert"></span>

Start a row with `table()`, add columns, and finish with
`await sender.at(timestamp, unit)` or `await sender.atNow()`. QuestDB creates
missing tables and columns automatically. The
[quick start](#quick-start) shows the full borrow/flush/close cycle.

### Column methods

The pooled QWP sender and `connectQwpNodeSender()` expose these methods:

| Method | QuestDB type / value |
|---|---|
| `symbol(name, value)` | SYMBOL; use for bounded sets such as tickers and sides |
| `stringColumn(name, value)` | VARCHAR; use for high-cardinality IDs |
| `booleanColumn`, `byteColumn`, `shortColumn`, `int32Column` | BOOLEAN, BYTE, SHORT, INT |
| `longColumn`, `intColumn` | LONG; safe integer `number` or `bigint` |
| `float32Column`, `doubleColumn`, `floatColumn` | FLOAT, DOUBLE, DOUBLE |
| `timestampColumn(name, value, unit?)`, `dateColumn` | TIMESTAMP/TIMESTAMP_NS and DATE |
| `charColumn`, `binaryColumn`, `uuidColumn` | CHAR, BINARY (`Uint8Array`), UUID |
| `long256Column`, `ipv4Column`, `geohashColumn` | LONG256, IPv4, GEOHASH |
| `decimalColumnText`, `decimalColumn`, `decimal64Column`, `decimal128Column`, `decimal256Column` | DECIMAL; see [Decimals](#decimals) |
| `arrayColumn(name, value)` | Nested DOUBLE arrays; see [Arrays](#arrays) |

`floatColumn()` writes DOUBLE and `intColumn()` writes LONG; use the `32`
variants for FLOAT and INT. A standalone `Sender` offers the nine methods
shared with ILP: `symbol`, `stringColumn`, `booleanColumn`, `floatColumn`,
`intColumn`, `timestampColumn`, `arrayColumn`, `decimalColumn`, and
`decimalColumnText`. Its compiled writer supports the other types. See the
[API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
for method signatures and accepted values.

:::caution Use SYMBOL for bounded sets

A sender keeps distinct SYMBOL values in a dictionary across its lifetime;
high-cardinality IDs belong in VARCHAR or UUID instead. The dictionary is
limited to 2,000,000 values. If a flush exceeds it, discard the staged rows
with `reset()` and use a new sender for new symbol values. A pooled sender is
replaced only if its `close()` fails; resetting before returning it leaves its
dictionary full.

:::

### Designated timestamp

`at(value, unit)` accepts `"us"` (the default), `"ms"`, or `"ns"`.
`Date.now()` is **milliseconds**, so use `.at(Date.now(), "ms")`;
without the unit the row lands in 1970. Nanoseconds require a `bigint`.
`atNow()` asks QuestDB to assign arrival time, which changes on replay. Use
the event's timestamp for deduplication. For a newly created table, `"ns"`
creates a TIMESTAMP_NS designated timestamp; the other units create
TIMESTAMP. The default designated column name is `timestamp`. On an existing
table, `at()` writes the table's designated timestamp column, whatever its
name.

### Null values

Passing `null` or `undefined` omits that column. On an existing nullable
column this stores NULL; an omitted BOOLEAN becomes `false`, and BYTE and
SHORT become `0`. An all-null column does not create a new column. Local
value errors discard the row in progress: start again with `table()`.
`cancelRow()` drops an unfinished row; `reset()` also drops rows staged since
the last flush.

<span id="decimal-insertion"></span>

### Decimals

Pre-create a table if you need a specific precision: QWP auto-creation
chooses the maximum precision for the wire width.

```questdb-sql
CREATE TABLE IF NOT EXISTS trade_fees (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  settled_price DECIMAL(18, 2),
  commission DECIMAL(18, 4)
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

<span id="text-literal-easy-to-use"></span>

`decimalColumnText(name, value)` sends a decimal as text and preserves its
scale, including trailing zeros. Both strings and numbers accept exponents
such as `"1.5e-3"`; a JavaScript number cannot retain trailing zeros.

<span id="binary-form-high-throughput"></span>

The binary methods `decimal64Column(name, unscaled, scale)`,
`decimal128Column()`, and `decimal256Column()` take the unscaled value as a
`bigint`, followed by the scale:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trade_fees")
      .symbol("symbol", "ETH-USD")
      .decimalColumnText("settled_price", "2615.50") // keeps the trailing zero
      .decimal64Column("commission", -750n, 4) // -0.0750
      .at(Date.now(), "ms");
    await sender.flush();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

Bind parameters take the scale **before** the unscaled value, the reverse of
`decimal64Column()`: `binds.setDecimal64(0, 2, 261550n)` binds `2615.50`; see
[Bind parameters](#bind-parameters). Query results return a DECIMAL as
`{ unscaled, scale }`. The server currently cannot return DECIMAL with
precision 9 or less over QWP; cast it to a wider precision when querying.

### Arrays

`arrayColumn(name, value)` sends a uniformly shaped nested array of numbers
as DOUBLE[], DOUBLE[][], and so on. `longArrayColumn()` exists for protocol
parity, but current servers reject LONG arrays. Query results expose DOUBLE
arrays as `{ dimensions, values }`.

### Compiled object-row writers

For a stream of objects with a fixed shape, compile a writer once with
`sender.writer(table, schema)` and call `writer.row(object)` or
`writer.rows(iterable)`. The package exports the schema builders, such as
`symbol()`, `double()`, `varchar()`, and `designatedTimestamp("ms")`. Each
schema key names a column, except the `designatedTimestamp()` key: it supplies
the row's designated timestamp (named `timestamp` on a new table) and is
required in every row.

```typescript
import {
  connectQwpNodeClient,
  designatedTimestamp,
  double,
  symbol,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    const trades = sender.writer("trades", {
      symbol: symbol(),
      side: symbol(),
      price: double(),
      amount: double(),
      timestamp: designatedTimestamp("ms"),
    });
    await trades.rows([
      { symbol: "ETH-USD", side: "buy", price: 2615.54, amount: 0.5, timestamp: Date.now() },
      { symbol: "BTC-USD", side: "sell", price: 61234.5, amount: 0.01, timestamp: Date.now() },
    ]);
    await sender.flush();
  } finally {
    await sender.close(); // the writer cannot be used after its sender is closed
  }
} finally {
  await db.close();
}
```

The writer validates each row; its `QwpWriterRowError` names the offending
table, column, and row index. See the
[client API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
for all builders.

### Flushing

Auto-flush is enabled by default: 1,000 rows or 100 ms since the last flush
(checked when a row is added, not by a background timer). Call `flush()` at
the end of a burst. `auto_flush=off` disables triggers, or set
`auto_flush_rows=0` / `auto_flush_interval=0` separately. `flush()` publishes
rows, but does not by default wait for QuestDB to accept them. To confirm
delivery, see [Awaiting acknowledgements](#awaiting-acknowledgements).

#### Backpressure

The replay queue defaults to 128 MiB without `sf_dir`, and the disk journal
targets 10 GiB with it. When full, publishing waits up to 30 seconds by
default, then rejects with `QwpMemoryReplayAppendTimeoutError` or
`QwpReplayStoreAppendTimeoutError`. The batch stays staged: slow down and
retry `flush()`; do not write the rows again. If you close the sender
instead, `close()` tries once more and, if there is still no room, drops the
staged rows with a warning and rejects with the same error. Configure the cap
with `sf_max_total_bytes` and the wait with `sf_append_deadline_millis`.

#### Batch size limits

QuestDB advertises its maximum batch size on connection (about 2 MiB on a
default server). The client splits a larger batch into several frames at row
boundaries. A single row larger than the limit fails with
`QwpBatchTooLargeError`: call `reset()` and shrink that row, for example a
large VARCHAR or BINARY value. A sender with a [background start](#ingestion-modes) cannot know
the limit before its first connection, so a frame built while QuestDB is
down can exceed it. That frame is then never delivered: it is retried
indefinitely and blocks every later batch. With a background start, with or
without `sf_dir`, set `sf_max_segment_bytes=1m` to cap each frame at 1 MiB.

### Awaiting acknowledgements

After `flush()`, wait for the cumulative watermark:
`await sender.waitForAcknowledged(sender.publishedSequence, 10_000)`.

`publishedSequence` includes batches sent by auto-flush; `acknowledgedSequence`
is the last accepted one. `waitForAcknowledged()` rejects on a server
rejection, or with `QwpIngressAckTimeoutError` on timeout; without a timeout
argument, it waits up to `ackTimeoutMs` (15 seconds by default). A timeout
alone does not mean the batch was rejected: it may still be in flight. **Do
not use the return value of `flushAndGetSequence()` as the watermark for all
your rows**: it returns `-1n` if an earlier auto-flush already published them.

To make each `flush()` wait for the acknowledgement, pass typed
`sender: { awaitServerAck: true }` as the second argument of
`connectQwpNodeClient()`; see [Programmatic options](#programmatic-options).
Each such flush waits up to `ackTimeoutMs`, then rejects with a plain `Error`
whose message starts with `timed out waiting for QWP ACK`. As with
`waitForAcknowledged()`, QuestDB may still acknowledge the batch later. Set the
deadline with typed `ingressSession: { ackTimeoutMs }`; it has no
connect-string key.

#### Committing source offsets

When consuming from Kafka or another source, record each batch's
`publishedSequence` with its last source offset. Commit only the newest offset
whose sequence is at or below `acknowledgedSequence`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

interface Fill { offset: bigint; symbol: string; price: number; amount: number; tsMs: number }
// Stand-ins for your consumer: replace them with your Kafka client's calls.
const batches: Fill[][] = [
  [{ offset: 41n, symbol: "ETH-USD", price: 2615.54, amount: 0.5, tsMs: Date.now() }],
  [{ offset: 42n, symbol: "BTC-USD", price: 61234.5, amount: 0.01, tsMs: Date.now() }],
];
const commitOffset = async (offset: bigint) => console.log("commit", offset);

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  const pending: { sequence: bigint; offset: bigint }[] = [];
  const commitAcknowledged = async () => {
    let newest: bigint | undefined;
    while (pending.length > 0 && pending[0].sequence <= sender.acknowledgedSequence) {
      newest = pending.shift()!.offset;
    }
    if (newest !== undefined) await commitOffset(newest);
  };
  try {
    for (const batch of batches) {
      for (const fill of batch) {
        await sender
          .table("trades")
          .symbol("symbol", fill.symbol)
          .doubleColumn("price", fill.price)
          .doubleColumn("amount", fill.amount)
          .at(fill.tsMs, "ms");
      }
      await sender.flush();
      pending.push({ sequence: sender.publishedSequence, offset: batch[batch.length - 1].offset });
      await commitAcknowledged();
    }
    await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
    await commitAcknowledged();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

Request [durable acknowledgement](#durable-acknowledgement) if the offset must
also survive a primary failure. The watermark then advances only after the
upload to object storage, so allow for the upload interval in your
`waitForAcknowledged()` timeout.

### Transactions

Set `transaction=on` to defer server commits of auto-flushed batches until
`flush()` (or `commit()` on a pooled sender). Transactions are atomic per
table, not across tables, and QuestDB can commit early when the table exceeds
[`qwp.max.uncommitted.rows`](/docs/configuration/qwp/#qwpmaxuncommittedrows).

Only a standalone sender can roll back: closing it without `flush()` discards
the open transaction. A pooled sender has no rollback. Returning it with
`close()` flushes and commits the open transaction, including batches that
auto-flush already sent; `reset()` drops only rows that have not been sent.
If your code throws partway through a batch, a pooled sender therefore
commits the rows written before the error. When a failed batch must leave no
rows, use a standalone sender:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;transaction=on;");
try {
  await sender.connect();
  for (const [side, price] of [["buy", 2615.54], ["sell", 2615.62]] as const) {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", side)
      .floatColumn("price", price) // DOUBLE: the Sender has no doubleColumn()
      .floatColumn("amount", 0.5)
      .at(Date.now(), "ms");
  }
  await sender.flush(); // commits: both rows become visible together
} finally {
  await sender.close(); // rolls back the transaction if flush() was not reached
}
```

### Store-and-forward

Set `sf_dir` to journal batches across process restarts. To start while
QuestDB is down, add a background start (`lazy_connect=on`), as below; see
[Startup and outage modes](#ingestion-modes). Keep event IDs and timestamps
stable across retries.

If duplicates are unacceptable, create a deduplicated table **before** the
first ingester runs, for example as a deployment or migration step. An
ingester that starts while QuestDB is down cannot create the table itself
first: when QuestDB comes back, the sender replays its journal in the
background, QuestDB auto-creates a missing table without DEDUP, and a later
`CREATE TABLE IF NOT EXISTS` does nothing. To add DEDUP to an existing table,
use [`ALTER TABLE ... DEDUP ENABLE`](/docs/query/sql/alter-table-enable-deduplication/),
for example
`ALTER TABLE trades_sf DEDUP ENABLE UPSERT KEYS(timestamp, trade_id);`. It
does not remove duplicates that were written earlier.

<SfDedupWarning />

```questdb-sql
CREATE TABLE IF NOT EXISTS trades_sf (
  timestamp TIMESTAMP,
  trade_id VARCHAR,
  symbol SYMBOL,
  price DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, trade_id);
```

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// Persist this directory outside the container in production.
const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;sf_dir=./questdb-sf;sender_id=trades;" +
    "sf_max_segment_bytes=1m;lazy_connect=on;",
);
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades_sf")
      .stringColumn("trade_id", "trade-12345")
      .symbol("symbol", "ETH-USD")
      .doubleColumn("price", 2615.54)
      .at(1723000000000, "ms");
    await sender.flush(); // persisted locally; not necessarily acknowledged
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

If this client closes before an ACK, the journal keeps the unacknowledged row
until a client reopens the same `sf_dir` and `sender_id`; see
[Replaying the journal after a restart](#replaying-the-journal-after-a-restart).

`sf_durability=memory` (the default) survives a process crash, not a power
failure; `periodic` checkpoints and `append` syncs each append. `sf_dir` alone
keeps a foreground start; see [Startup and outage modes](#ingestion-modes).
A terminally rejected batch stays at the head of the journal and blocks later
rows until fixed; see
[Recovering from a terminal rejection](#recovering-from-a-terminal-rejection).
See also the
[store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
and [operating guide](/docs/high-availability/store-and-forward/operating-and-tuning/).

#### Replaying the journal after a restart

Run a client with the same `sf_dir` and `sender_id` once QuestDB is reachable
again. It replays the unacknowledged frames in the background, whatever
`sender_pool_min` is: each pooled sender reopens its own slot (`trades-0` for
the first), and a background drainer replays every `trades-<n>` slot that no
running sender holds, at startup and then every 30 seconds. That includes
slots left by more concurrent senders in an earlier run. Slots of other
`sender_id`s in the same `sf_dir` are replayed only with `drain_orphans=on`.
Then poll for a row you know was written:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;sf_dir=./questdb-sf;sender_id=trades;" +
    "sf_max_segment_bytes=1m;failover=off;",
);
try {
  const lease = await db.borrowQuery();
  try {
    const deadline = Date.now() + 10_000;
    let visible = false;
    while (!visible && Date.now() < deadline) {
      const query = await lease.query(
        "SELECT trade_id FROM trades_sf WHERE trade_id = $1 LIMIT 1",
        {
          binds: (binds) => binds.setVarchar(0, "trade-12345"),
          timeoutMs: Math.max(1, deadline - Date.now()),
        },
      );
      for await (const batch of query) visible ||= batch.rowCount > 0;
      await query.completion;
      if (!visible) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!visible) throw new Error("trade not visible in time");
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`failover=off` prevents a replayed query from invalidating the result
mid-poll. A fixed sleep without checking for the row is not a visibility
guarantee.

#### Journal capacity {#sf-capacity}

`sf_max_total_bytes=10g` is a target, not a hard disk quota: transaction
completion and symbol dictionaries can exceed it. Provision extra space and
monitor the directory. Without `sf_dir`, the same key caps the memory replay
queue.

#### Lock recovery {#sf-lock-recovery}

Node.js uses a `.lock.owner` directory in each journal slot, not an OS file
lock, and a crashed process can leave one behind. The next sender reclaims it
automatically only when the lock was recorded on the same host and the
recorded process ID is no longer in use, as when a process restarts on the
same machine under a new process ID. It cannot reclaim a lock recorded on
another host, such as a container replaced under a new host name, or one whose
process ID is in use again. That includes a container restarted in place,
which usually gives the restarted process its previous process ID (often 1),
so the restarted process holds the recorded ID itself. Opening the journal
then fails with `QwpReplayStoreLockedError` (wrapped in `QwpPoolResourceError`
when pooled) on every start until the stale lock is removed. Verify that no
other process owns the slot **before** removing it; the
[Node.js lock-recovery runbook](/docs/high-availability/store-and-forward/operating-and-tuning/#nodejs-lock-recovery)
also shows when a startup step can remove it safely.
Do not let Node.js and another client's OS-lock-based sender use the same
`sf_dir` concurrently.

### Durable acknowledgement

On QuestDB Enterprise with replication, `request_durable_ack=on` makes the
acknowledgement watermark wait until the WAL has been uploaded to object
storage. Typed `sender: { awaitDurableAck: true }` also makes each `flush()`
wait for the upload, for up to `durableAckTimeoutMs` (by default
`ackTimeoutMs`, 15 seconds). Under light load, the primary uploads WAL data
only when
[`replication.primary.throttle.window.duration`](/docs/high-availability/tuning/#throttle-window)
expires: 10 seconds by default, and 60 seconds in the network-efficiency
profile. Set the deadline well above it:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");
const db = await connectQwpNodeClient(
  `wss::addr=db.example.com:9000;token=${token};request_durable_ack=on;`,
  { sender: { awaitDurableAck: true, durableAckTimeoutMs: 120_000 } },
);
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .doubleColumn("price", 2615.54)
      .at(Date.now(), "ms");
    await sender.flush(); // waits up to 2 minutes for the upload
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

When the deadline passes, `flush()` rejects with a plain `Error` whose message
starts with `timed out waiting for QWP durable ACK`. QuestDB has already
acknowledged the batch, so it is committed to the WAL on the primary: the
timeout means only that the upload was not confirmed in time.

If the server does not support durable ACK:

- A sender with a foreground start fails with
  `QwpDurableAckUnavailableError` (wrapped in `QwpPoolResourceError` when
  pooled).
- A sender with a background start retries from startup and emits
  `durable-ack-unavailable` connection events, **even with `sf_dir`**.
- A sender with `sf_dir` and a foreground start fails at its first
  connection, but after a successful connection it retries later mismatches.

Monitor these events and journal capacity: a successful background start
does not prove durable ACK is available.

### Fire-and-forget UDP

The standalone `Sender` also accepts `udp::addr=localhost:9007;` for
fire-and-forget ingestion. Enable the server's
[`qwp.udp.enabled`](/docs/configuration/qwp/#udp-receiver) first. UDP has no
TLS, auth, ACK, retries, transactions, or store-and-forward; use WebSocket
for reliable writes.

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("udp::addr=localhost:9007;");
try {
  await sender.connect();
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.5)
    .at(Date.now(), "ms");
  await sender.flush(); // sends datagrams; nothing confirms delivery
} finally {
  await sender.close();
}
```

## Querying

Borrow one query lease per concurrent query. A lease executes one query at a
time; close it in `finally`.

### Running a SELECT

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol, price FROM trades WHERE symbol = $1 LIMIT 100",
      {
        binds: (binds) => binds.setVarchar(0, "ETH-USD"),
        timeoutMs: 30_000,
        initialCredit: 1024 * 1024,
      },
    );
    for await (const batch of query) {
      for (const [timestamp, symbol, price] of batch.rows()) {
        console.log(new Date(Number((timestamp as bigint) / 1000n)), symbol, price);
      }
    }
    await query.completion;
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`lease.query()` returns a handle with async result batches and a `completion`
promise. For DDL/DML, await `completion` without iterating. A batch has
`rowCount`, `columns`, `rows()`, `get(rowIndex, columnIndex)`, and
`batchSequence`. `rows()` yields one array per row, in SELECT column order:
destructure or index it, because a row has no named properties (`row.price`
is `undefined`). `batch.columns[i].name` gives the column names. A query can
fail during iteration as well as at completion.

Query failover is on by default: if the connection is lost, the query runs
again from its first row, so code that accumulates rows must handle the
restart. See [Query failover](#query-failover).

### Reading result values

| QuestDB type | JavaScript value |
|---|---|
| BOOLEAN, INT, DOUBLE, FLOAT | `boolean` or `number` |
| LONG | `bigint` |
| TIMESTAMP / TIMESTAMP_NS / DATE | `bigint` in microseconds / nanoseconds / milliseconds |
| VARCHAR, SYMBOL, CHAR | `string` |
| BINARY | `Uint8Array` |
| UUID | `{ low: bigint, high: bigint }` |
| DECIMAL | `{ unscaled: bigint, scale: number }` |
| DOUBLE arrays | `{ dimensions: number[], values: number[] }` |
| Nullable values | `null` (except CHAR's zero marker, which can be `"\u0000"`) |

Other types include IPv4 (signed 32-bit `number`), GEOHASH and LONG256
objects. `JSON.stringify()` cannot serialize `bigint`: convert it to a string
first. Convert a TIMESTAMP to a `Date` with `new Date(Number(value / 1000n))`.
Current servers cannot return INTERVAL, an untyped NULL, or DECIMAL
with precision 9 or less over QWP; cast those in SQL to a supported type.

### Bind parameters

Set bind values in the `binds` callback of `query()`. Index 0 binds `$1`, and
indexes must be set in ascending order without gaps. A placeholder after the
last one you set is treated as NULL rather than rejected, so set every
placeholder.

| QuestDB type | Setter | JavaScript value |
|---|---|---|
| BOOLEAN | `setBoolean(i, value)` | `boolean` |
| BYTE, SHORT, INT | `setByte`, `setShort`, `setInt` | `number` |
| LONG | `setLong(i, value)` | `bigint` or safe-integer `number` |
| FLOAT, DOUBLE | `setFloat`, `setDouble` | `number` |
| CHAR | `setChar(i, value)` | one-character `string` |
| VARCHAR, SYMBOL | `setVarchar(i, value)` | `string` or `null`; SYMBOL has no setter of its own |
| TIMESTAMP | `setTimestampMicros(i, value)` | microseconds, such as `BigInt(date.getTime()) * 1000n` |
| TIMESTAMP_NS | `setTimestampNanos(i, value)` | nanoseconds as a `bigint` |
| DATE | `setDate(i, value)` | milliseconds, such as `date.getTime()` |
| UUID | `setUuid(i, value)` or `setUuid(i, low, high)` | canonical UUID `string`, or two 64-bit halves |
| DECIMAL | `setDecimal64(i, scale, unscaled)`, `setDecimal128(i, scale, low, high)`, `setDecimal256(i, scale, lowLow, lowHigh, highLow, highHigh)` | unscaled value in 64-bit parts, after the scale |
| LONG256 | `setLong256(i, word0, word1, word2, word3)` | four 64-bit words |
| GEOHASH | `setGeohash(i, precisionBits, value)` | geohash bits as an integer |

For a typed NULL, use `setNull(i, QWP_COLUMN_TYPE.DOUBLE)` (import
`QWP_COLUMN_TYPE` from the package), `setNullDecimal64/128/256(i, scale)`, or
`setNullGeohash(i, precisionBits)`. The decimal setters take the scale
**before** the unscaled value, the reverse of
`decimal64Column(name, unscaled, scale)`. BINARY, IPv4, arrays, and INTERVAL
have no bind setter.

### DDL and DML statements

`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, and `UPDATE` use `query()`.
For a statement without result batches, `completion.kind` is `"exec-done"`.
Only `INSERT` reliably provides a row count in `rowsAffected`, a `bigint`; a
WAL `UPDATE` can report a transaction number instead.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// failover=off: a lost connection fails the INSERT instead of running it again.
const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "INSERT INTO trades (timestamp, symbol, side, price, amount) " +
        "VALUES (now(), 'ETH-USD', 'buy', 2615.54, 0.5)",
    );
    const completion = await query.completion;
    if (completion.kind === "exec-done") {
      console.log(`inserted ${completion.rowsAffected} row(s)`);
    }
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

:::warning SQL writes can run twice

Query failover is on by default, so a lost connection can re-execute in-flight
SQL, including `INSERT`. Use `failover=off` for non-idempotent SQL and check an
uncertain outcome before retrying, or make the statement idempotent. A typed
`egressSession.reconnect` object turns failover back on even when the connect
string says `failover=off`; see [Typed reconnect policy](#typed-reconnect-policy).

:::

### Read-after-write

An ACK confirms commitment to the WAL, **not** query visibility: WAL apply
is asynchronous. Create the table before writing, wait for the ACK, then poll
for the row with a deadline:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
try {
  const eventTime = Date.now(); // a stable key to find the row again
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "sell")
      .doubleColumn("price", 2615.62)
      .doubleColumn("amount", 0.25)
      .at(eventTime, "ms");
    await sender.flush();
    await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
  } finally {
    await sender.close();
  }

  const lease = await db.borrowQuery();
  try {
    const deadline = Date.now() + 10_000;
    let visible = false;
    while (!visible && Date.now() < deadline) {
      const query = await lease.query(
        "SELECT price FROM trades WHERE timestamp = $1 AND symbol = $2 LIMIT 1",
        {
          binds: (binds) =>
            binds.setTimestampMicros(0, BigInt(eventTime) * 1000n).setVarchar(1, "ETH-USD"),
          timeoutMs: Math.max(1, deadline - Date.now()),
        },
      );
      for await (const batch of query) visible ||= batch.rowCount > 0;
      await query.completion;
      if (!visible) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!visible) throw new Error("row not visible in time");
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`failover=off` prevents a replayed query from invalidating the result mid-poll.
A fixed sleep without checking for the row is not a visibility guarantee.
After a store-and-forward restart, see
[Replaying the journal after a restart](#replaying-the-journal-after-a-restart).

### Cancellation and timeouts

Set `timeoutMs` per query (or `egressSession.queryTimeoutMs` by default).
A deadline cancels the query and reports `QwpEgressQueryTimeoutError`.
Leaving a `for await` loop early also cancels the query, and `completion`
then rejects with `QwpEgressQueryAbandonedError`. `query.cancel()` requests
cancellation but does not wait for it.

Cancellation is prompt only with a credit window (see
[Flow control](#flow-control)). Without one, the server keeps streaming after
a cancel: returning the lease waits up to `query_close_timeout_ms` (5 seconds
by default) for the stream to drain, can take about twice that in total, and
then discards the connection. Set `initialCredit` on any query you may time
out, cancel, or stop early:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT timestamp, symbol, price FROM trades", {
      timeoutMs: 5_000,
      initialCredit: 1024 * 1024,
    });
    let seen = 0;
    let stoppedEarly = false;
    for await (const batch of query) {
      seen += batch.rowCount;
      if (seen >= 10_000) {
        stoppedEarly = true;
        break; // cancels the rest of the result
      }
    }
    // After a break, completion rejects with QwpEgressQueryAbandonedError.
    if (!stoppedEarly) await query.completion;
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

### Flow control

Without a credit window, the server streams as fast as it can: a slow consumer
can buffer a large result in memory, and cancelling the query is slow. Set
`initialCredit: 1024 * 1024` on a query, as above, or `initial_credit=1048576`
in the connect string; `initial_credit` takes plain bytes, not a size suffix
such as `1m`. The client replenishes credit as your loop consumes batches. Use
`autoCredit: false` and `query.grantCredit(bytes)` for manual control.

### Zero-copy result views

For hot paths, `lease.queryViews(sql, callback)` reads typed values directly
from received bytes instead of materializing arrays. Views and byte slices
are valid only until the callback returns; copy them if you need to retain
them.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// failover=off: a re-run after a lost connection would count batches twice.
const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
try {
  const lease = await db.borrowQuery();
  try {
    let notional = 0;
    const query = await lease.queryViews(
      "SELECT price, amount FROM trades WHERE symbol = 'ETH-USD'",
      (batch) => {
        const price = batch.column(0);
        const amount = batch.column(1);
        for (let row = 0; row < batch.rowCount; row++) {
          if (!price.isNull(row) && !amount.isNull(row)) {
            notional += price.getDouble(row) * amount.getDouble(row);
          }
        }
      },
      { initialCredit: 1024 * 1024 },
    );
    await query.completion;
    console.log("ETH-USD notional:", notional);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

The callback adds to a running total, so the example turns failover off: with
failover on, a lost connection re-runs the query and its batches are added
again. If the query fails with `QwpEgressSessionClosedError`, run it again
from an empty total; see [Query failover](#query-failover). See the
[client API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
for the typed column getters.

### Compression

Query results default to `compression=raw`. Use `compression=zstd` (or `auto`)
for large results; `compression_level=3` is accepted only with `zstd` or
`auto`. Compression does not affect ingestion.

## Error handling

Handle the failure at the stage where it occurs. Every error class and
constant named on this page is exported from `@questdb/nodejs-client`, so you
can import it for `instanceof` checks:

| Failure | Action |
|---|---|
| Local value validation | Fix the value; the row in progress was discarded. Test `QwpBatchTooLargeError` before `RangeError` because it extends `RangeError`. |
| `QwpMemoryReplayAppendTimeoutError` / `QwpReplayStoreAppendTimeoutError` | The batch stays staged. Slow down and retry the flush, not the rows. |
| ACK timeout: `QwpIngressAckTimeoutError` from `waitForAcknowledged()`, or a plain `Error` from a `flush()` that waits for an acknowledgement | Not a rejection: QuestDB may still acknowledge the batch. Do not write the rows again; wait again, or raise `ackTimeoutMs` or `durableAckTimeoutMs`. See [Awaiting acknowledgements](#awaiting-acknowledgements). |
| Server rejection | See [Ingestion errors](#ingestion-errors); a terminal rejection fails the sender. |
| `QwpEgressQueryError` | Check `status`: fix SQL or bind values for `PARSE_ERROR`; retry on a new lease for `CANCELLED`, such as a query cancelled by a server shutdown. The lease remains usable after a SQL error. |
| `QwpEgressSessionClosedError` | The query connection was lost with failover off. Close the lease and retry the whole query. |
| `QwpReconnectExhaustedError` | Close the failed sender or query lease and borrow a new one. |

### Ingestion errors

A local column or `at()` validation error discards the unfinished row.
A **server** rejection can arrive after `flush()` resolves: register
`ingressSession.onSenderError` to receive it, and branch on the error's
`appliedPolicy` and `category`.

```typescript
import {
  connectQwpNodeClient,
  QWP_SENDER_ERROR_CATEGORY,
  QWP_SENDER_ERROR_POLICY,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  ingressSession: {
    onSenderError: (error) => {
      // Keep serverMessage out of external trackers: it may contain row values.
      const details = {
        category: error.category,
        table: error.tableName,
        fromFsn: error.fromFsn,
        toFsn: error.toFsn,
      };
      if (error.appliedPolicy === QWP_SENDER_ERROR_POLICY.TERMINAL) {
        // The sender has stopped; see "Recovering from a terminal rejection".
        console.error("QuestDB rejected a batch; ingestion stopped", details);
      } else if (error.appliedPolicy === QWP_SENDER_ERROR_POLICY.ABANDONED) {
        console.error("rows set aside in", error.quarantinedPath, details);
      } else if (error.category === QWP_SENDER_ERROR_CATEGORY.WRITE_ERROR) {
        console.warn("QuestDB could not write a batch; resending", details);
      } else {
        console.warn("QuestDB rejected a batch; resending", details);
      }
    },
    onError: (event) => {
      // terminal: true means the sender has stopped; other events are warnings.
      if (event.terminal) {
        console.error("QuestDB ingestion stopped:", event.error.message);
      }
    },
  },
});
await db.close();
```

Each error has `category`, `appliedPolicy`, `serverStatusByte`,
`serverMessage`, `messageSequence`, the rejected frame range `fromFsn` to
`toFsn`, `tableName` when the server reports one, `detectedAtMs`, and, when
abandoned store-and-forward data was preserved on disk, `quarantinedPath`.
Categories and policies are lowercase, hyphenated strings; compare them with
the `QWP_SENDER_ERROR_CATEGORY` and `QWP_SENDER_ERROR_POLICY` constants. Each
category has a fixed default policy, because Node.js does not apply the
`on_*_error` keys:

| Category | Default policy | Meaning |
|---|---|---|
| `schema-mismatch` | `terminal` | The batch does not match the table schema |
| `parse-error` | `terminal` | QuestDB could not parse the batch |
| `security-error` | `terminal` | QuestDB denied the write, for example by ACL |
| `protocol-violation` | `terminal` | The client and server disagree on the protocol |
| `write-error` | `retriable` | The write failed, for example on a table that is not accepting writes |
| `internal-error` | `retriable` | An unexpected server-side failure |
| `dictionary-gap` | `retriable` | The connection lacks symbol dictionary entries; the client resends them |
| `not-writable` | `retriable-other` | The node cannot accept writes; the client tries another endpoint |
| `cancelled`, `limit-exceeded` | `retriable` | Current servers send these statuses only on query connections |
| `unknown` | `retriable` | A status this client does not know, for example from a newer server |
| `data-loss` | `abandoned` | Store-and-forward data was set aside; see [Quarantined journal slots](#quarantined-journal-slots) |

The handler also runs for retriable rejections, which the client resends: only
`terminal` (the sender stops) and `abandoned` (journal data set aside) mean
the rows are not being delivered. Without a callback, the client logs
rejections. `waitForAcknowledged()`
rejects for a rejected batch. Branch on category, not the unstable message
text, and redact messages before sending them to external trackers.
`ingressSession.onError` receives an event with `error`, `terminal`,
`timestampMs`, and, for a server rejection, `senderError`. It also reports
non-terminal problems, such as ACK timeouts; `terminal: true` means the sender
has stopped.

#### Recovering from a terminal rejection

A terminal batch rejection stops that sender, and its `close()` rejects with
`QwpReplayRejectedError`. Without `sf_dir`, unacknowledged rows on the failed
sender are lost: fix the row or schema before retrying. With `sf_dir`, the
rejected batch stays at the front of the journal and blocks **all** tables
using it, across restarts. A pooled sender is replaced after a failed
`close()`, but its replacement sees the same blocked journal. To unblock the
journal:

1. Stop the process that owns the slot: `<sf_dir>/<sender_id>-<n>` for a
   pooled sender, or `<sf_dir>/<sender_id>` for a standalone one. The
   `onSenderError` report, or the client's log line, gives the category and
   the server message. If the slot stays locked after a crash, see
   [Lock recovery](#sf-lock-recovery).
2. Either fix the cause on the server so that every journaled batch is
   accepted, for example by changing a conflicting column with
   `ALTER TABLE ... ALTER COLUMN ... TYPE`, or move the slot directory out of
   `sf_dir` to discard its unacknowledged rows. Keep the moved directory for
   inspection.
3. Start the client again with the same `sf_dir` and `sender_id`. After a
   server-side fix, it replays the whole journal, including the rejected
   batch. After a move, it starts with an empty slot.

#### Quarantined journal slots

Store-and-forward does not delete rows that it cannot deliver. It sets them
aside and reports them to `onSenderError` with category `data-loss` and
policy `abandoned`:

- **Corrupt journal.** When a sender opens a slot whose journal is
  structurally corrupt, the client renames the slot directory to
  `<slot>.unreplayable-N`, adds a `.failed` file, and continues with an empty
  slot. The error's `quarantinedPath` names the renamed directory. The client
  never replays it; keep it for inspection.
- **Undeliverable slot.** When the background drainer (see
  [Replaying the journal after a restart](#replaying-the-journal-after-a-restart))
  cannot deliver a slot, for example because QuestDB terminally rejects the
  oldest batch or rejects authentication, it adds a `.failed` file to the
  slot and stops retrying it. The rows stay in the slot.

To replay an undeliverable slot, fix the cause, then remove its marker with
`retryQwpNodeOrphanSlot()`. A running client replays the slot on its next
scan, within 30 seconds:

```typescript
import { retryQwpNodeOrphanSlot } from "@questdb/nodejs-client";

await retryQwpNodeOrphanSlot("/var/lib/myapp/qdb-sf/trades-1");
```

### Query errors

SQL errors reject query iteration and `completion` with
`QwpEgressQueryError` (`status`, `message`, `requestId`); the lease remains
usable. Compare `status` with `QWP_STATUS` constants instead of matching
server error text:

```typescript
import { connectQwpNodeClient, QWP_STATUS, QwpEgressQueryError } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT no_such_column FROM trades");
    for await (const batch of query) console.log(batch.rowCount);
    await query.completion;
  } catch (error) {
    if (!(error instanceof QwpEgressQueryError)) throw error;
    const invalidSql = error.status === QWP_STATUS.PARSE_ERROR;
    console.error(invalidSql ? "invalid SQL:" : "query failed:", error.message);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`requestId` numbers queries per connection; it is not a server-side
correlation ID. A server that shuts down cancels running queries: they fail
with `status` `QWP_STATUS.CANCELLED` instead of failing over, so retry them on
a new lease. Other failures are separate classes, not `QwpEgressQueryError`:

- `QwpEgressQueryTimeoutError`: `timeoutMs` expired.
- `QwpEgressQueryAbandonedError`: the loop ended early; see
  [Cancellation and timeouts](#cancellation-and-timeouts).
- `QwpEgressQueryCancelTimeoutError`: a cancellation did not drain in time.
- `QwpEgressSessionClosedError`: the connection was lost with failover off.
- `QwpReconnectExhaustedError`: failover gave up.

After a cancellation or a lost connection, return the lease before borrowing
another.

### Connection-level errors

The pool wraps connection creation failures in `QwpPoolResourceError`; inspect
its `cause`. A `QwpUpgradeError` covers any failure while opening the
WebSocket, so check its `kind`: `authentication` for an HTTP `401` or `403`,
`transport` or `timeout` when QuestDB is unreachable, and others such as
`role-rejected` and `version-mismatch`. `QwpRoleMismatchError` and
`QwpDurableAckUnavailableError` extend `QwpUpgradeError`, so test for them
first. With several endpoints, a connection that fails on every endpoint, for
example because none is reachable, has a `QwpFailoverError` cause whose
`attempts` records each endpoint's failure. An authentication rejection is the
exception: it stops the endpoint sweep at once, so the cause is that
`QwpUpgradeError` itself. With one endpoint, the cause is always that
endpoint's error. A borrow at pool capacity times out as
`QwpPoolAcquireTimeoutError` after `acquire_timeout_ms` (5 seconds by
default).

An authentication rejection never moves the client to another endpoint. It is
terminal before a sender's first successful connection. After that, senders
with `sf_dir` or a background start retry it indefinitely, keep buffering,
and emit an `attempt-failed` [connection event](#connection-events) for each
failed attempt; other senders and query connections treat it as terminal. See
[Authentication is cluster-wide](/docs/high-availability/client-failover/concepts/#authentication-is-cluster-wide).

#### Connection timeouts

`connect_timeout` and `auth_timeout_ms` default to 15 seconds. They cover
connection setup and WebSocket upgrade; the query connection also waits for
the server's initial information frame. Set shorter timeouts if a request
needs a tighter deadline.

## Failover and high availability

Multi-host failover requires QuestDB Enterprise replication; reconnecting to
a single restarted server also works in open source.

### Multiple endpoints

```text
wss::addr=db-a.example.com:9000,db-b.example.com:9000;token=YOUR_TOKEN;
```

Ingestion needs the primary; queries can use any healthy node. `target`
filters the roles queries accept (`any`, `primary`, `replica`), while `zone`
prefers same-zone nodes. On Node.js, setting `target=replica` **in the shared
connect string also filters ingestion**, so use the typed query-only option
`{ egress: { target: "replica" } }` instead. `target=replica` is strict, not
"prefer replica and fall back to primary". If no replica is up at startup,
set `query_pool_min=0` to defer the query connection.

For a query-only client with only replica endpoints, set `sender_pool_min=0`:
otherwise the default pool prewarms a sender and startup fails because no
primary can accept its write connection. Set the replica filter in the typed
query options so it applies only to queries. If you later borrow a sender,
include a primary endpoint in `addr`.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "wss::addr=db-a.example.com:9000,db-b.example.com:9000;" +
    "token=YOUR_TOKEN;sender_pool_min=0;",
  { egress: { target: "replica" } },
);
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol FROM trades LIMIT 10",
    );
    for await (const batch of query) {
      for (const row of batch.rows()) console.log(row);
    }
    await query.completion;
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

A query that fails over restarts from its first row; see
[Query failover](#query-failover) before accumulating results.

### Ingestion reconnect

Senders resend unacknowledged batches after a disconnect. Between attempts,
they wait a random delay below a ceiling that starts at
`reconnect_initial_backoff_millis` (100 ms by default) and doubles up to
`reconnect_max_backoff_millis` (5 seconds). A sender in default memory mode
gives up after `reconnect_max_duration_millis` (5 minutes by default): it
fails with `QwpReconnectExhaustedError` and its unacknowledged rows are lost.
Background memory mode and store-and-forward retry indefinitely, subject to
queue or journal capacity. Setting any `reconnect_*` key also makes senders
retry their first connection; see
[Startup and outage modes](#ingestion-modes).

### Query failover

Query failover is on by default. A lost query connection re-executes the
query **from its first row**, even if your loop has already consumed rows. The
re-executed query reads the data as it is then, so it can return fewer rows
than the first attempt, or no batches at all. For streaming results you cannot
retract, use `failover=off` and retry the whole operation when the query fails
with `QwpEgressSessionClosedError`. Otherwise buffer the result and reset the
buffer in `egressSession.onReplayReset`. Give that callback a client with one
query connection (`query_pool_max=1`), because request IDs are per connection,
not unique across pooled leases:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const rows: unknown[][] = [];
// One query connection, so every replay reset belongs to the query below.
const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;query_pool_max=1;sender_pool_min=0;",
  { egressSession: { onReplayReset: () => { rows.length = 0; } } },
);
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol, price FROM trades WHERE symbol = 'ETH-USD'",
      { initialCredit: 1024 * 1024 },
    );
    for await (const batch of query) {
      for (const row of batch.rows()) rows.push([...row]);
    }
    await query.completion;
    console.log(`${rows.length} rows`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`batch.batchSequence === 0n` detects a nonempty replay but not a replay
returning no batches. A single-row aggregate, such as `count()` or `avg()`
without `GROUP BY`, needs no reset: every execution returns exactly one row,
so keep the last row you receive.

Between failover attempts, the client waits a random delay below a ceiling
that starts at `failover_backoff_initial_ms` (50 ms by default) and doubles up
to `failover_backoff_max_ms` (1 second). It makes at most
`failover_max_attempts` (8) attempts within `failover_max_duration_ms`
(30 seconds), so the attempt limit can end failover before the time budget:
raise `failover_max_attempts` for longer outages. When failover gives up, the
query fails with `QwpReconnectExhaustedError`; close the lease and borrow a
new one.

### Typed reconnect policy

Typed `ingressSession.reconnect` and `egressSession.reconnect` objects
**replace** their connect-string policies: a field you omit takes the default
below, not the connect-string value, so set every limit you rely on in the
typed object. Durations are in milliseconds, and `maxDurationMs: 0` removes
the time limit.

| Field | Ingestion key (default) | Query key (default) |
|---|---|---|
| `initialBackoffMs` | `reconnect_initial_backoff_millis` (100) | `failover_backoff_initial_ms` (50) |
| `maxBackoffMs` | `reconnect_max_backoff_millis` (5000) | `failover_backoff_max_ms` (1000) |
| `maxDurationMs` | `reconnect_max_duration_millis` (300000) | `failover_max_duration_ms` (30000) |
| `maxAttempts` | No key (0, unlimited) | `failover_max_attempts` (8) |
| `maxFrameRejections` | `max_frame_rejections` (4) | Not used |
| `poisonMinEscalationWindowMs` | `poison_min_escalation_window_millis` (300000) | Not used |
| `onEvent` | No key; see [Connection events](#connection-events) | No key |

- **Ingestion.** `reconnect_*` keys trigger first-connection retry; a typed
  ingestion `reconnect` object does not.
- **Queries.** The first query connection is retried only if one of these is
  set:
  - `failover=on`, explicitly;
  - a `failover_*` key, without `failover=off`;
  - a typed `egressSession.reconnect` object.
- **Failover off.** A typed `egressSession.reconnect` object turns query
  failover back on even when the connect string says `failover=off`. Do not
  add one, even just for `onEvent`, to a client that must not re-execute SQL.

### Connection events

Set `ingressSession.reconnect.onEvent` or `egressSession.reconnect.onEvent` to
observe connection events. Each event has a `kind`, an `attempt` number,
`timestampMs`, and, where relevant, `endpoint`, `previousEndpoint`, and
`cause`. The kinds are `connected`, `reconnecting`, `attempt-failed` (one per
failed connection attempt, with its `cause`), `reconnected`, `failed-over`,
and `durable-ack-unavailable`. The store-and-forward background drainer (see
[Replaying the journal after a restart](#replaying-the-journal-after-a-restart))
sends its events to the same `ingressSession.reconnect.onEvent` and also
reports `primary-unavailable` and `durable-ack-persistent-failure`.
`QWP_RECONNECT_EVENT_KIND` lists them all.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  ingressSession: {
    // A typed reconnect object replaces the connect-string policy: set its limits too.
    reconnect: {
      maxDurationMs: 300_000,
      onEvent: (event) => {
        if (event.kind === "attempt-failed") {
          console.warn("connection attempt failed", event.endpoint, event.cause);
        } else {
          console.info("connection event", event.kind, event.endpoint);
        }
      },
    },
  },
});
await db.close();
```

No event marks a terminal failure: use
[`ingressSession.onError`](#ingestion-errors) with
`terminal: true` for that. An `egressSession.reconnect` object added for
`onEvent` re-enables query failover on a `failover=off` client; see
[Typed reconnect policy](#typed-reconnect-policy). Connect-string
`connection_listener_inbox_capacity` configures ingestion events only; for
query events, use typed `egressSession.connectionListenerInboxCapacity`.

## Concurrency

Share one `QwpClient`, but keep one sender per producer and one query lease per
concurrent query. Worker threads need their own clients and, with `sf_dir`,
distinct `sender_id` values.

### Writing from request handlers

In a Node.js service, every request handler that writes rows is a concurrent
producer, even though all handlers run on one thread. Two patterns work:

- **Borrow per request.** `borrowSender()` hands out an idle pooled sender
  without reconnecting, and `close()` flushes the request's rows and returns
  the sender. At most `sender_pool_max` handlers (4 by default) hold a sender
  at once; another borrow waits up to `acquire_timeout_ms` (5 seconds by
  default), then fails with `QwpPoolAcquireTimeoutError`. Each request sends
  its own batch. With `sf_dir`, each pooled sender journals into its own
  `<sender_id>-<n>` slot.
- **One shared sender.** Borrow one sender at startup and build each row in
  one synchronous chain from `table()` to `at()` or `atNow()`, with no `await`
  in between. Rows from concurrent handlers then never interleave, auto-flush
  batches them together, and flushes are serialized. A handler that awaits
  mid-row makes the next handler's `table()` throw. Auto-flush runs only when a
  row is added, so also call `flush()` from a timer, or the last rows wait for
  the next request. A terminal failure stops the sender for every handler,
  and with `transaction=on` all handlers share one transaction.

With a background start, `borrowSender()`, `at()`, `flush()`, and `close()`
return promptly while QuestDB is down, until the replay queue or journal is
full (see [Backpressure](#backpressure)); only `borrowQuery()` fails until
QuestDB is reachable. In default memory mode, `flush()`, `close()`, and an
auto-flushing `at()` wait for the reconnect instead; see
[Startup and outage modes](#ingestion-modes).

```typescript
import { createServer } from "node:http";
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// A background start lets the service start, and record trades, while
// QuestDB is down.
const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;lazy_connect=on;sf_max_segment_bytes=1m;",
);

async function recordTrade(price: number, amount: number): Promise<void> {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", price)
      .doubleColumn("amount", amount)
      .at(Date.now(), "ms");
  } finally {
    await sender.close(); // flushes the row and returns the sender
  }
}

const server = createServer((req, res) => {
  recordTrade(2615.54, 0.5).then(
    () => res.end("recorded\n"),
    (error) => {
      console.error("could not record the trade:", error);
      res.statusCode = 503;
      res.end();
    },
  );
});
server.listen(8080);

process.once("SIGTERM", () => {
  // db.close() waits up to close_flush_timeout_millis for acknowledgements.
  server.close(() => void db.close());
});
```

<span id="configuration-options"></span>

## Configuration reference

The [connect string reference](/docs/connect/clients/connect-string/) lists
shared keys and defaults; Node.js differences follow the typed options.

### Programmatic options

The second argument of `connectQwpNodeClient` accepts typed `sender`,
`ingressSession`, `egressSession`, `egress`, `webSocket`, `storeAndForward`, and
`pool` options. For example:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  sender: { awaitServerAck: true },
  ingressSession: {
    onSenderError: (error) =>
      console.error("rejected batch:", error.category, error.serverMessage),
  },
  pool: { senderPoolMax: 2 },
});
await db.close();
```

Typed options override the corresponding connect-string settings. A typed
`reconnect` object replaces the whole reconnect policy from the string; see
[Typed reconnect policy](#typed-reconnect-policy). For the full typed API, see
the
[client reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html).

### Differences from other clients

| Area | Node.js behavior |
|---|---|
| Startup/outage | `connectQwpNodeClient()` also opens a query connection, so it starts while QuestDB is down only with `query_pool_min=0`, which `lazy_connect=on` sets. A sender in default memory mode gives up after `reconnect_max_duration_millis` per outage. See [Startup and outage modes](#ingestion-modes). |
| Authentication | After a sender's first successful connection, `401`/`403` is retried indefinitely by senders with `sf_dir` or a background start; other senders and queries treat it as terminal. |
| Query startup | First-connect retry requires explicit `failover=on`, a `failover_*` key (without `failover=off`), or typed `egressSession.reconnect`. |
| `target`, `zone` | Also apply to ingestion when set in the connect string; use typed `egress.target` for queries only. |
| `sf_dir` | Node.js recursively creates missing parents and a slot; pooled senders use slots named `<sender_id>-<n>`. Its `.lock.owner` directory can outlive a crashed process; see [Lock recovery](#sf-lock-recovery). |
| Background drainer | With `sf_dir`, a pooled client replays slots of its own `sender_id` that no running sender holds, even without `drain_orphans`; `drain_orphans=on` adds other `sender_id`s. See [Replaying the journal after a restart](#replaying-the-journal-after-a-restart). |
| SF-only keys | Explicit `sf_durability` (even `memory`), `sf_sync_interval_millis`, `drain_orphans`, `max_background_drainers`, and `catch_up_cap_gap_min_escalation_window_millis` require `sf_dir`. `sf_durability=append` is supported. |
| `sf_max_total_bytes` | With `sf_dir` it is a journal size **target**, not a disk quota; without `sf_dir` it caps the memory queue. |
| Durable ACK | Background-started senders, including with `sf_dir`, retry an unavailable capability from startup. Explicit `durable_ack_keepalive_interval_millis` also requests durable ACK even at `0`; negatives are rejected. |
| Timeouts | `connect_timeout` defaults to 15 seconds and also bounds DNS and the TLS handshake; `auth_timeout_ms` defaults to `connect_timeout`. `close_flush_timeout_millis` defaults to 5 seconds. When it expires, a standalone sender's `close()` rejects with `QwpSenderCloseTimeoutError`, while `db.close()` resolves and usually reports a non-terminal `QwpIngressAckTimeoutError` to `ingressSession.onError`. |
| `poison_min_escalation_window_millis` | Defaults to 300000 (5 minutes), not 5000. |
| Auto-flush | `auto_flush_interval` counts from the last flush (or sender creation), not from the first buffered row. `auto_flush_bytes` defaults to 0 (off). |
| `max_lifetime_ms` | Closes only idle connections above the pool minimum; the minimum connections are never recycled. |
| `connection_listener_inbox_capacity` | Configures only ingestion events, not query events. |
| Parsing | Use `0`, not `off`, for `auto_flush_rows` and `auto_flush_interval`. Size keys take single-letter suffixes (`k`, `m`, `g`, `t`), but `initial_credit` takes plain bytes. `compression_level` requires `compression=zstd` or `auto`. `tls_roots` must be PEM, and `tls_roots_password` is rejected; without `tls_roots`, certificates are checked against Node.js's bundled CA store. `init_buf_size` and `max_buf_size` are rejected on `ws` and `wss` strings. |
| Reconnect jitter | Ingestion uses full jitter, unlike the shared guide's equal-jitter ingestion schedule. |
| Error categories | `onSenderError` reports categories and policies as lowercase, hyphenated strings, such as `schema-mismatch` and `retriable-other`, and adds the `cancelled` and `limit-exceeded` categories. |
| `on_*_error` | Accepted by every entry point but not applied; observe rejections with `ingressSession.onSenderError`. |
| Typed SF options | A typed `storeAndForward` option passed with a connect string, as in `connectQwpNodeClient(conf, { storeAndForward })`, keeps the connect-string defaults: memory durability, 10 GiB, and wait-on-full. Without a connect string, as in `connectQwpNodeSender({ url, storeAndForward })`, the defaults are append durability, 1 GiB, and fail-on-full. |
| Standalone `Sender` | Ignores pool and query-only keys with a warning, but applies `client_id` and `lazy_connect`. |

## Migration

### From ILP to QWP

The existing `Sender` row API can migrate from `http::` or `tcp::` to `ws::`
or `wss::`, followed by `await sender.connect()`. QWP adds querying, replay,
store-and-forward, and richer types. Unlike ILP HTTP, a QWP `flush()` can
resolve **before** the server accepts the rows, so wait for an ACK when
committing source offsets. Legacy ILP-only keys such as `retry_timeout`,
`init_buf_size`, and `tls_ca` are rejected on QWP strings. The
[Standalone Sender](#standalone-sender) example shows the QWP form of the row
API; [ILP transports](#ilp-transports-legacy) shows the ILP form.

### Upgrading from 4.x

Version 5.0.0 requires Node.js 20.18.1 or newer. Existing ILP senders now
omit columns passed `null` or `undefined` (instead of throwing for most
values); `decimalColumn()` rejects non-integer scales instead of silently
coercing them. The package adds `ws` for QWP and retains the old ILP
transports.

## Full example: ingestion and querying with failover

This program combines the production settings from the sections above: TLS
and a token, two endpoints, a background start with store-and-forward,
deduplicated replays, error callbacks, an acknowledgement wait, and a query
that is safe under failover. If QuestDB is unreachable, the program still
starts and journals the rows, and `borrowQuery()` fails once query failover
gives up. Create the table first, for example as a migration step, so that
replays are deduplicated even if an ingester starts while QuestDB is down:

```questdb-sql
CREATE TABLE IF NOT EXISTS trades_sf (
  timestamp TIMESTAMP,
  trade_id VARCHAR,
  symbol SYMBOL,
  price DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, trade_id);
```

```typescript
import {
  connectQwpNodeClient,
  QWP_SENDER_ERROR_POLICY,
  QwpIngressAckTimeoutError,
} from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");

const db = await connectQwpNodeClient(
  "wss::addr=db-a.example.com:9000,db-b.example.com:9000;" +
    `token=${token};` +
    // Start while QuestDB is down and journal rows across restarts.
    "lazy_connect=on;sf_dir=/var/lib/myapp/qdb-sf;sender_id=trades;" +
    "sf_max_segment_bytes=1m;" +
    // Bound query buffering; let query failover run for up to a minute.
    "initial_credit=1048576;failover_max_duration_ms=60000;",
  {
    ingressSession: {
      onSenderError: (error) => {
        if (error.appliedPolicy === QWP_SENDER_ERROR_POLICY.TERMINAL) {
          console.error("ingestion stopped:", error.category, error.tableName);
        }
      },
      onError: (event) => {
        if (event.terminal) console.error("ingestion stopped:", event.error);
      },
    },
  },
);
try {
  // Stable trade IDs and event timestamps let DEDUP absorb replays.
  const now = Date.now();
  const fills = [
    { tradeId: "trade-1001", symbol: "ETH-USD", price: 2615.54, tsMs: now },
    { tradeId: "trade-1002", symbol: "ETH-USD", price: 2615.62, tsMs: now + 1 },
  ];
  const sender = await db.borrowSender();
  try {
    for (const fill of fills) {
      await sender
        .table("trades_sf")
        .stringColumn("trade_id", fill.tradeId)
        .symbol("symbol", fill.symbol)
        .doubleColumn("price", fill.price)
        .at(fill.tsMs, "ms");
    }
    await sender.flush(); // journaled locally
    try {
      await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
    } catch (error) {
      if (!(error instanceof QwpIngressAckTimeoutError)) throw error;
      // Not a rejection: the journal keeps the rows and replays them.
      console.warn("not acknowledged yet; the rows stay in the journal");
    }
  } finally {
    await sender.close();
  }

  // A single-row aggregate is safe under query failover: a replay returns
  // its own row, which replaces the first attempt's.
  const lease = await db.borrowQuery();
  try {
    const sinceMicros = BigInt(Date.now() - 3_600_000) * 1000n;
    const query = await lease.query(
      "SELECT count(), avg(price) FROM trades_sf " +
        "WHERE symbol = $1 AND timestamp >= $2",
      {
        binds: (binds) =>
          binds.setVarchar(0, "ETH-USD").setTimestampMicros(1, sinceMicros),
        timeoutMs: 30_000,
      },
    );
    let summary: unknown[] = [];
    for await (const batch of query) {
      for (const row of batch.rows()) summary = [...row];
    }
    await query.completion;
    // Rows written above may not be visible yet; see Read-after-write.
    console.log("ETH-USD, last hour [trades, average price]:", summary);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

Keep `target=replica` out of this connect string: on Node.js it also filters
ingestion; see [Multiple endpoints](#multiple-endpoints). To also wait for the
upload to object storage on QuestDB Enterprise, see
[Durable acknowledgement](#durable-acknowledgement).

## ILP transports (legacy)

The standalone `Sender` still speaks InfluxDB Line Protocol (ILP) over HTTP
and TCP, for ingestion only. ILP over HTTP sends each `flush()` as an HTTP
request and has no `connect()` step; calling it throws:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("http::addr=localhost:9000;");
try {
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.00044)
    .at(Date.now(), "ms");
  await sender.flush(); // close() does not flush: unflushed rows are lost
} finally {
  await sender.close();
}
```

For authentication, add `username=...;password=...;` (or, on QuestDB
Enterprise, `token=...;`) to the connect string. For ILP over TCP, use
`tcp::addr=localhost:9009;` and call `await sender.connect()` before writing.
`Sender.fromEnv()` reads the connect string from the `QDB_CLIENT_CONF`
environment variable. ILP uses the same nine column methods as the standalone
QWP `Sender`; see [Column methods](#column-methods). See the
[ILP overview](/docs/connect/compatibility/ilp/overview/) for TCP
authentication, protocol versions, and transport configuration.

## Next steps

- [Delivery semantics](/docs/concepts/delivery-semantics/) for replay and deduplication.
- [Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/).
- [Connect string reference](/docs/connect/clients/connect-string/) and the
  [Node.js API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html).
- [`@questdb/nodejs-client` on npm](https://www.npmjs.com/package/@questdb/nodejs-client)
  and its [source on GitHub](https://github.com/questdb/nodejs-questdb-client).
