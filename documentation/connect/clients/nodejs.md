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

Create a table, publish a row, wait for QuestDB's acknowledgement, and query
it. Acknowledged rows are applied asynchronously, so the query may initially
return no rows; see [Read-after-write](#read-after-write).

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

    const sender = await db.borrowSender();
    try {
      await sender
        .table("trades")
        .symbol("symbol", "ETH-USD")
        .symbol("side", "buy")
        .doubleColumn("price", 2615.54)
        .doubleColumn("amount", 0.5)
        .at(Date.now(), "ms");
      await sender.flush();
      await sender.waitForAcknowledged(sender.publishedSequence);
    } finally {
      await sender.close(); // return it to the pool
    }

    const query = await lease.query(
      "SELECT timestamp, symbol, price FROM trades LIMIT 10",
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

Two independent choices decide what a sender does while QuestDB is
unreachable:

- **Startup.** A *foreground start*, the default, connects senders inside
  `connectQwpNodeClient()`, which rejects if QuestDB is down. A *background
  start* connects senders in the background: `initial_connect_retry=async`
  selects it, and `lazy_connect=on` selects it and also sets
  `query_pool_min=0`, rejecting a positive value. `connectQwpNodeClient()`
  returns while QuestDB is down only with `query_pool_min=0`: with
  `initial_connect_retry=async` alone, the default query connection still
  has to connect at startup. A query borrowed before QuestDB is reachable
  fails. A standalone `Sender` gets a background start from either key. With
  a background start, also set `sf_max_segment_bytes=1m`; see
  [Batch size limits](#batch-size-limits).
- **Storage.** Without `sf_dir`, unacknowledged rows live in memory and are
  lost if the process exits. With `sf_dir`, they are journaled to disk and
  replayed after a restart; see [Store-and-forward](#store-and-forward).

| Mode | Enabled by | QuestDB down at startup | During an outage |
|---|---|---|---|
| Default memory | Neither `sf_dir` nor a background start | Startup rejects | `flush()`, and `at()` when it triggers an auto-flush, wait for the reconnect for up to `reconnect_max_duration_millis` (5 minutes by default). Then the sender fails with `QwpReconnectExhaustedError` and its unacknowledged rows are lost |
| Background memory | A background start without `sf_dir` | Starts if `query_pool_min=0`, as with `lazy_connect=on`; rows queue in memory | Rows queue in memory, up to `sf_max_total_bytes` (128 MiB by default); retries continue indefinitely |
| Store-and-forward | `sf_dir`, with either startup | Foreground: startup rejects. Background: starts if `query_pool_min=0` | Rows go to the disk journal; retries continue indefinitely, from startup with a background start or after the first successful connection otherwise |

A foreground start fails fast. `initial_connect_retry=on`, or any
`reconnect_*` key, makes senders retry their first connection for up to
`reconnect_max_duration_millis` before rejecting. These keys do not apply to
query connections, so with the default `query_pool_min=1`,
`connectQwpNodeClient()` still rejects almost at once: also set
`query_pool_min=0` to wait for the senders. A locked journal fails startup
even with a background start.

### Closing the pooled client

`db.close()` rejects new borrows, closes idle senders and queries, and waits
briefly for borrowed senders to be returned. It can resolve without every
batch being acknowledged. Wait for `sender.publishedSequence` before returning
a borrowed sender when an ACK is required, or use `sf_dir` to retain unacked
rows across restarts. In [default memory mode](#ingestion-modes), a borrowed
sender's `close()` can wait for a reconnect up to
`reconnect_max_duration_millis` (5 minutes by
default); plan your shutdown deadline accordingly.

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
TIMESTAMP. The default designated column name is `timestamp`.

### Null values

Passing `null` or `undefined` omits that column. On an existing nullable
column this stores NULL; an omitted BOOLEAN becomes `false`, and BYTE and
SHORT become `0`. An all-null column does not create a new column. Local
value errors discard the row in progress: start again with `table()`.
`cancelRow()` drops an unfinished row; `reset()` also drops rows staged since
the last flush.

<span id="decimal-insertion"></span>

### Decimals

Use `decimalColumnText(name, "0.0750")` to preserve the input scale, including
trailing zeros. Both strings and numbers accept exponents such as
`"1.5e-3"`; a JavaScript number cannot retain trailing zeros. Binary methods
`decimal64Column(name, unscaled, scale)`, `decimal128Column()`, and
`decimal256Column()` take an unscaled `bigint`. Pre-create a table if you need
a specific precision: QWP auto-creation chooses the maximum precision for the
wire width. The server currently cannot return DECIMAL with precision 9 or
less over QWP; cast it to a wider precision when querying.

<span id="text-literal-easy-to-use"></span>
<span id="binary-form-high-throughput"></span>

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
retry `flush()`; do not write the rows again. Configure the cap with
`sf_max_total_bytes` and the wait with `sf_append_deadline_millis`.

#### Batch size limits

QuestDB advertises its maximum batch size on connection (about 2 MiB on a
default server). The client splits a larger batch into several frames at row
boundaries. A single row larger than the limit fails with
`QwpBatchTooLargeError`: call `reset()` and shrink that row, for example a
large VARCHAR or BINARY value. A sender with a background start cannot know
the limit before its first connection, so a frame built while QuestDB is
down can exceed it. That frame is then never delivered: it is retried
indefinitely and blocks every later batch. With a background start, with or
without `sf_dir`, set `sf_max_segment_bytes=1m` to cap each frame at 1 MiB.

### Awaiting acknowledgements

After `flush()`, wait for the cumulative watermark:
`await sender.waitForAcknowledged(sender.publishedSequence, 10_000)`.

`publishedSequence` includes batches sent by auto-flush; `acknowledgedSequence`
is the last accepted one. `waitForAcknowledged()` rejects on timeout or server
rejection. A timeout alone does not mean the batch was rejected: it may still
be in flight. **Do not use the return value of `flushAndGetSequence()` as the
watermark for all your rows**: it returns `-1n` if an earlier auto-flush
already published them. To make each flush wait, use typed
`sender: { awaitServerAck: true }`.

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
also survive a primary failure.

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
[Startup and outage modes](#ingestion-modes). Create a deduplicated table
**before** ingestion if duplicates are unacceptable: a missing table is
auto-created without DEDUP. Keep event IDs and timestamps stable across
retries.

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
again. The pool's first sender reopens the journal slot (`trades-0` here) at
startup and replays the unacknowledged frames in the background, so keep the
default `sender_pool_min=1`. Then poll for a row you know was written:

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
lock. A crashed process can leave one behind. If opening the journal fails
with `QwpReplayStoreLockedError` (wrapped in `QwpPoolResourceError` when
pooled), verify that no other process owns the slot **before** removing a
stale lock. See the
[Node.js lock-recovery runbook](/docs/high-availability/store-and-forward/operating-and-tuning/#nodejs-lock-recovery).
Do not let Node.js and another client's OS-lock-based sender use the same
`sf_dir` concurrently.

### Durable acknowledgement

On QuestDB Enterprise with replication, `request_durable_ack=on` makes the
acknowledgement watermark wait until the WAL has been uploaded to object
storage. `sender: { awaitDurableAck: true }` also makes each `flush()` wait:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");
const db = await connectQwpNodeClient(
  `wss::addr=db.example.com:9000;token=${token};request_durable_ack=on;`,
  { sender: { awaitDurableAck: true } },
);
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .doubleColumn("price", 2615.54)
      .at(Date.now(), "ms");
    await sender.flush(); // resolves once the batch is in object storage
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

If the server lacks support, a foreground start fails with
`QwpDurableAckUnavailableError` (wrapped in `QwpPoolResourceError` when
pooled). A sender with a background start retries from startup and emits
`durable-ack-unavailable` connection events **even with `sf_dir`**. With
`sf_dir` and a foreground start, only later mismatches, after a successful
connection, are retried. Monitor these events and journal capacity: a
successful background start does not prove durable ACK is available.

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

Handle the failure at the stage where it occurs:

| Failure | Action |
|---|---|
| Local value validation | Fix the value; the row in progress was discarded. Test `QwpBatchTooLargeError` before `RangeError` because it extends `RangeError`. |
| `QwpMemoryReplayAppendTimeoutError` / `QwpReplayStoreAppendTimeoutError` | The batch stays staged. Slow down and retry the flush, not the rows. |
| Server rejection | See [Ingestion errors](#ingestion-errors); a terminal rejection fails the sender. |
| `QwpEgressQueryError` | Check `status`: fix SQL or bind values for `PARSE_ERROR`; retry on a new lease for `CANCELLED`, such as a query cancelled by a server shutdown. The lease remains usable after a SQL error. |
| `QwpEgressSessionClosedError` | The query connection was lost with failover off. Close the lease and retry the whole query. |
| `QwpReconnectExhaustedError` | Close the failed sender or query lease and borrow a new one. |

### Ingestion errors

A local column or `at()` validation error discards the unfinished row.
A **server** rejection can arrive after `flush()` resolves: register
`ingressSession.onSenderError` to receive it.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  ingressSession: {
    onSenderError: (error) => {
      // Keep serverMessage out of external trackers: it may contain row values.
      console.error("QuestDB rejected a batch", {
        category: error.category, // for example "schema-mismatch"
        policy: error.appliedPolicy, // "retriable", "retriable-other", "terminal", or "abandoned"
        table: error.tableName,
        fromFsn: error.fromFsn,
        toFsn: error.toFsn,
      });
    },
  },
});
await db.close();
```

Each error has `category`, `appliedPolicy`, `serverStatusByte`,
`serverMessage`, `messageSequence`, the rejected frame range `fromFsn` to
`toFsn`, `tableName` when the server reports one, and `detectedAtMs`.
Categories and policies are lowercase, hyphenated strings
(`QWP_SENDER_ERROR_CATEGORY`, `QWP_SENDER_ERROR_POLICY`). The handler also
runs for retriable rejections, which the client resends: only `terminal` (the
sender stops) and `abandoned` (journal data set aside) mean the rows are not
being delivered. The default policy of each category is listed under
[Error frames](/docs/high-availability/store-and-forward/concepts/#error-frames).
Without a callback, the client logs rejections. `waitForAcknowledged()`
rejects for a rejected batch. Branch on category, not the unstable message
text, and redact messages before sending them to external trackers. Terminal
session errors also reach `ingressSession.onError` with `terminal: true`.

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
first. With several endpoints, the cause is a `QwpFailoverError` whose
`attempts` records each endpoint's failure; with one endpoint, it is that
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

Senders resend unacknowledged batches after a disconnect. A sender in default
memory mode gives up after `reconnect_max_duration_millis` (5 minutes by
default): it fails with `QwpReconnectExhaustedError` and its unacknowledged
rows are lost. Background memory mode or `sf_dir` retries indefinitely,
subject to queue or journal capacity. For the first connection, see
[Startup and outage modes](#ingestion-modes). Setting a `reconnect_*` key
implicitly requests bounded first-connection retry for senders unless you
explicitly set `initial_connect_retry=off`; `connectQwpNodeClient()` waits
for that retry only with `query_pool_min=0`.

### Query failover

Query failover is on by default. A lost query connection re-executes the
query **from its first row**, even if your loop has already consumed rows, and
a replay can also return zero batches. For streaming results you cannot
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
returning no batches. Query failover defaults to 8 attempts, which may end
before the 30-second time budget: raise `failover_max_attempts` for longer
outages. When failover gives up, the query fails with
`QwpReconnectExhaustedError`; close the lease and borrow a new one.

### Typed reconnect policy

Typed `ingressSession.reconnect` and `egressSession.reconnect` **replace**
their respective connect-string policies; set every limit you rely on in
the typed object. Ingestion `reconnect_*` keys trigger first-connection
retry, but a typed ingestion `reconnect` object does not. A query's first
connection retries only if `failover=on` is explicit, a `failover_*` key is
set without `failover=off`, or a typed query `reconnect` object is provided.
A typed `egressSession.reconnect` object also turns query failover back on
when the connect string says `failover=off`, so do not add one, even just for
`onEvent`, to a client that must not re-execute SQL.

### Connection events

Set `ingressSession.reconnect.onEvent` or `egressSession.reconnect.onEvent` to
observe connection events. Each event has a `kind`, an `attempt` number,
`timestampMs`, and, where relevant, `endpoint`, `previousEndpoint`, and
`cause`. The kinds are `connected`, `reconnecting`, `attempt-failed` (one per
failed connection attempt, with its `cause`), `reconnected`, `failed-over`,
and `durable-ack-unavailable`. Orphan drainers (`drain_orphans=on`) also
report `primary-unavailable` and `durable-ack-persistent-failure`.
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

No event marks a terminal failure: use `ingressSession.onError` with
`terminal: true` for that. An `egressSession.reconnect` object added for
`onEvent` re-enables query failover on a `failover=off` client; see
[Typed reconnect policy](#typed-reconnect-policy). Connect-string
`connection_listener_inbox_capacity` configures ingestion events only; for
query events, use typed `egressSession.connectionListenerInboxCapacity`.

## Concurrency

Share one `QwpClient`, but keep one sender per producer and one query lease per
concurrent query. Worker threads need their own clients and, with `sf_dir`,
distinct `sender_id` values.

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
| Startup/outage | `lazy_connect=on` or `initial_connect_retry=async` starts senders in the background, but `connectQwpNodeClient()` starts while QuestDB is down only with `query_pool_min=0`, which `lazy_connect=on` sets. First-connection retry from `initial_connect_retry=on` or a `reconnect_*` key covers senders only. Default memory mode gives up after 5 minutes per outage; SF and background memory modes retry indefinitely. See [Startup and outage modes](#ingestion-modes). |
| Authentication | After a sender's first successful connection, `401`/`403` is retried indefinitely by senders with `sf_dir` or a background start; other senders and queries treat it as terminal. |
| Query startup | First-connect retry requires explicit `failover=on`, a `failover_*` key (without `failover=off`), or typed `egressSession.reconnect`. |
| `target`, `zone` | Also apply to ingestion when set in the connect string; use typed `egress.target` for queries only. |
| `sf_dir` | Node.js recursively creates missing parents and a slot; pooled senders use slots named `<sender_id>-<n>`. Its `.lock.owner` directory can outlive a crashed process; see [Lock recovery](#sf-lock-recovery). |
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
