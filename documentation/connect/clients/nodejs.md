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
for Node.js exceptions.

### Standalone Sender

For ingestion without a pool, use
`const sender = await Sender.fromConfig("ws::addr=localhost:9000;")`, then
`await sender.connect()` before writing and `await sender.close()` in a
`finally` block. The standalone `Sender` also supports ILP (`http::` and
`tcp::`), but exposes fewer fluent QWP column methods; use `sender.writer()`
for other types, or a pooled sender. For a typed standalone QWP sender, use
`await connectQwpNodeSender({ url: "ws://localhost:9000/write/v4" })`.

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
`ingressSession.reconnect` or `egressSession.reconnect` object **replaces**
the entire policy from the string, not just the fields specified. For the
full typed API, see the
[client reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html).

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
and cannot be combined with `tls_roots`. A token is read when the client is
created: create a new client to rotate it.

## The connection pool

Borrow one sender per concurrent producer and one query lease per concurrent
query. Each pool defaults to a minimum of 1 and a maximum of 4 connections;
set `sender_pool_max`, `query_pool_max`, and, if needed, their `_min` keys.
A borrowed sender's `close()` flushes completed rows and **returns it to the
pool**, but does not normally wait for their acknowledgements. A returned
lease or sender must not be reused. Size pools to the number of simultaneous
borrows, and close the client on shutdown.

### Starting while QuestDB is down

`connectQwpNodeClient()` normally connects at startup. `lazy_connect=on`
starts senders in the background, forces `query_pool_min=0`, and lets the
client start while QuestDB is down. A query borrowed before QuestDB is
reachable can still fail. Memory-only rows are lost if the process exits;
add `sf_dir` to keep them on disk. A locked journal fails startup even with
`lazy_connect=on`. With `sf_dir` and a background start, retries begin from
startup; without a background start, the first connection must succeed.

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
`writer.rows(iterable)`. Schema builders include `symbol()`, `double()`,
`varchar()`, and `designatedTimestamp("ms")`. The writer validates each row;
its `QwpWriterRowError` names the offending table, column, and row index.
See the [client API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
for all builders.

### Ingestion modes {#ingestion-modes}

Storage (`sf_dir`) and the initial-connect choice are independent:

| Mode | Enabled by | During an outage |
|---|---|---|
| Default memory | Neither `sf_dir` nor a background start | `flush()` waits for reconnect, for up to 5 minutes by default |
| Background memory | No `sf_dir`; `lazy_connect=on` or `initial_connect_retry=async` | Rows queue in memory; retries continue |
| Store-and-forward | `sf_dir`, with either startup choice | Rows go to the disk journal; retries continue after the first successful connection, or from startup with a background start |

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
default server). A batch too large to send fails with `QwpBatchTooLargeError`;
call `reset()` and rebuild it in smaller batches. If a sender starts offline,
it cannot yet know the server limit. With `sf_dir` and `lazy_connect=on`, set
`sf_max_segment_bytes=1m` so an oversized batch cannot block journal replay.

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
whose sequence is at or below `acknowledgedSequence`. Request
[durable acknowledgement](#durable-acknowledgement) if the offset must also
survive a primary failure.

### Transactions

Set `transaction=on` to defer server commits of auto-flushed batches until
`flush()` (or `commit()` on a pooled sender). Transactions are atomic per
table, not across tables, and QuestDB can commit early when the table exceeds
[`qwp.max.uncommitted.rows`](/docs/configuration/qwp/#qwpmaxuncommittedrows).
Closing a standalone sender without `flush()` rolls back the open transaction;
returning a pooled sender with `close()` flushes and commits instead.

### Store-and-forward

Set `sf_dir` to journal batches across process restarts. For an offline start,
also set `lazy_connect=on` (or `initial_connect_retry=async` on a standalone
sender). Create a deduplicated table **before** ingestion if duplicates are
unacceptable: a missing table is auto-created without DEDUP. Keep event IDs
and timestamps stable across retries.

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

`sf_durability=memory` (the default) survives a process crash, not a power
failure; `periodic` checkpoints and `append` syncs each append. The sender's
first connection is foreground by default; adding `sf_dir` alone does not
make it lazy. With `sf_dir` plus `lazy_connect=on`, it retries from startup.
A terminally rejected batch stays at the head of the journal and blocks later
rows until fixed. See the
[store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
and [operating guide](/docs/high-availability/store-and-forward/operating-and-tuning/).

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
storage. `sender: { awaitDurableAck: true }` also makes each `flush()` wait.
If the server lacks support, a foreground first connection fails with
`QwpDurableAckUnavailableError` (wrapped in `QwpPoolResourceError` when
pooled). A background-started sender retries from startup and emits
`durable-ack-unavailable` connection events **even with `sf_dir`**. With
`sf_dir` and foreground startup, only later mismatches, after a successful
connection, are retried. Monitor these events and journal capacity: a
successful background start does not prove durable ACK is available.

### Fire-and-forget UDP

The standalone `Sender` also accepts `udp::addr=localhost:9007;` for
fire-and-forget ingestion. Enable the server's
[`qwp.udp.enabled`](/docs/configuration/qwp/#udp-receiver) first. UDP has no
TLS, auth, ACK, retries, transactions, or store-and-forward; use WebSocket
for reliable writes.

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

`lease.query()` returns a handle with async result batches and a `completion`
promise. For DDL/DML, await `completion` without iterating. A batch has
`rowCount`, `columns`, `rows()`, `get(rowIndex, columnIndex)`, and
`batchSequence`. A query can fail during iteration as well as at completion.

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
first. Current servers cannot return INTERVAL, an untyped NULL, or DECIMAL
with precision 9 or less over QWP; cast those in SQL to a supported type.

### Bind parameters

Bind indexes start at 0 for `$1` and must be set in ascending order without
gaps. Use `setVarchar`, `setInt`, `setLong`, `setDouble`,
`setTimestampMicros`, `setTimestampNanos`, `setUuid`, or other typed setters
on the `binds` callback. Use `setNull(index, QWP_COLUMN_TYPE.DOUBLE)` for a
typed NULL; BINARY, IPv4, and arrays have no direct bind setter.

### DDL and DML statements

`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, and `UPDATE` use `query()`.
For a statement without result batches, `completion.kind` is `"exec-done"`.
Only `INSERT` reliably provides a row count in `rowsAffected`; a WAL
`UPDATE` can report a transaction number instead.

:::warning SQL writes can run twice

With `failover=on`, a lost connection can re-execute in-flight SQL, including
`INSERT`. Use `failover=off` for non-idempotent SQL and check an uncertain
outcome before retrying, or make the statement idempotent.

:::

### Read-after-write

An ACK confirms commitment to the WAL, **not** query visibility: WAL apply
is asynchronous. Create the table before writing, then poll for a stable event
ID with a deadline. For the `trades_sf` table above, after publishing
`trade-12345`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
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

`failover=off` prevents a replayed query from invalidating the result mid-poll.
A fixed sleep without checking for the row is not a visibility guarantee.

### Cancellation and timeouts

Set `timeoutMs` per query (or `egressSession.queryTimeoutMs` by default).
A deadline cancels the query and reports `QwpEgressQueryTimeoutError`.
Leaving a `for await` loop early also starts cancellation. `query.cancel()`
requests cancellation but does not wait for it; returning the lease waits for
the cancellation to drain up to `query_close_timeout_ms` (5 seconds by
default), then discards the connection if needed.

### Flow control

Without a credit window, a slow consumer can buffer a large result in memory.
Set `initialCredit: 1024 * 1024` on a query, as above, or set
`initial_credit` in the connect string. The client replenishes credit as your
loop consumes batches. Use `autoCredit: false` and `query.grantCredit(bytes)`
for manual control.

### Zero-copy result views

For hot paths, `lease.queryViews(sql, callback)` reads typed values directly
from received bytes instead of materializing arrays. Views and byte slices
are valid only until the callback returns; copy them if you need to retain
them. See the [client API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html).

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
| `QwpEgressQueryError` | Fix SQL or bind values; the lease remains usable. |
| `QwpReconnectExhaustedError` | Close the failed sender or query lease and borrow a new one. |

### Ingestion errors

A local column or `at()` validation error discards the unfinished row.
A **server** rejection can arrive after `flush()` resolves: register
`ingressSession.onSenderError` to inspect its `category`, `appliedPolicy`,
`serverStatusByte`, and `serverMessage`. Without a callback, the client logs
rejections. `waitForAcknowledged()` rejects for a rejected batch.
Branch on category, not the unstable message text, and redact messages before
sending them to external trackers: they may contain row values. Terminal
session errors also reach `ingressSession.onError` with `terminal: true`.

#### Recovering from a terminal rejection

A terminal batch rejection stops that sender. Close it and fix the row or
schema before retrying. Without `sf_dir`, unacknowledged rows on the failed
sender are lost. With `sf_dir`, the rejected batch stays at the front of the
journal and blocks **all** tables using it until fixed or deliberately
quarantined. A pooled sender is replaced after a failed `close()`, but its
replacement sees the same blocked journal. See the
[operating guide](/docs/high-availability/store-and-forward/operating-and-tuning/).

### Query errors

SQL errors reject query iteration and `completion` with
`QwpEgressQueryError` (`status`, `message`, `requestId`). Other failures
include `QwpEgressQueryTimeoutError`, cancellation and failover exhaustion.
After cancellation, return the lease before borrowing another. Compare
`QWP_STATUS` constants instead of matching server error text.

### Connection-level errors

The pool wraps connection creation failures in `QwpPoolResourceError`; inspect
its `cause` for an authentication `QwpUpgradeError`, a
`QwpDurableAckUnavailableError`, `QwpRoleMismatchError`, or another failure.
`QwpFailoverError.attempts` records failed endpoints. A borrow at pool
capacity times out as `QwpPoolAcquireTimeoutError`.

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

### Ingestion reconnect

Senders resend unacknowledged batches after a disconnect. A sender in default
memory mode gives up after `reconnect_max_duration_millis` (5 minutes by
default); background memory mode or `sf_dir` retries indefinitely, subject
to queue or journal capacity. The first connection is fail-fast unless
`initial_connect_retry=on` (bounded), `initial_connect_retry=async`, or
`lazy_connect=on` (background). Setting a `reconnect_*` key implicitly
requests bounded first-connection retry unless you explicitly set
`initial_connect_retry=off`.

### Query failover

A lost query connection can re-execute the query **from its first row**, even
if your loop has already consumed rows. A replay can also return zero batches.
For streaming results you cannot retract, use `failover=off` and retry the
whole operation after a transport failure. Otherwise buffer the result and
reset it using `egressSession.onReplayReset`; use a single-query client for
that callback because request IDs are per connection, not unique across
pooled leases. `batch.batchSequence === 0n` detects a nonempty replay but
not a replay returning no batches. Query failover defaults to 8 attempts,
which may end before the 30-second time budget: raise
`failover_max_attempts` for longer outages. A failed query lease must be
closed and replaced.

### Typed reconnect policy

Typed `ingressSession.reconnect` and `egressSession.reconnect` **replace**
their respective connect-string policies; set every limit you rely on in
the typed object. Ingestion `reconnect_*` keys trigger first-connection
retry, but a typed ingestion `reconnect` object does not. A query's first
connection retries only if `failover=on` is explicit, a `failover_*` key is
set without `failover=off`, or a typed query `reconnect` object is provided.

### Connection events

Set `ingressSession.reconnect.onEvent` or
`egressSession.reconnect.onEvent` to observe `connected`, `reconnecting`,
`reconnected`, `failed-over`, and `durable-ack-unavailable` events. No event
marks a terminal failure: use `ingressSession.onError` with `terminal: true`
for that. Connect-string `connection_listener_inbox_capacity` configures
ingestion events only; for query events, use typed
`egressSession.connectionListenerInboxCapacity`.

## Concurrency

Share one `QwpClient`, but keep one sender per producer and one query lease per
concurrent query. Worker threads need their own clients and, with `sf_dir`,
distinct `sender_id` values.

<span id="configuration-options"></span>

## Configuration reference

The [connect string reference](/docs/connect/clients/connect-string/) lists
shared keys and defaults. Important Node.js differences:

### Differences from other clients

| Area | Node.js behavior |
|---|---|
| Startup/outage | `lazy_connect=on` starts senders in the background; default memory mode gives up after 5 minutes per outage; SF and background memory modes retry indefinitely. |
| Query startup | First-connect retry requires explicit `failover=on`, a `failover_*` key (without `failover=off`), or typed `egressSession.reconnect`. |
| `target`, `zone` | Also apply to ingestion when set in the connect string; use typed `egress.target` for queries only. |
| `sf_dir` | Node.js recursively creates missing parents and a slot. Its `.lock.owner` directory can outlive a crashed process; see [Lock recovery](#sf-lock-recovery). |
| SF-only keys | Explicit `sf_durability` (even `memory`), `sf_sync_interval_millis`, `drain_orphans`, `max_background_drainers`, and `catch_up_cap_gap_min_escalation_window_millis` require `sf_dir`. `sf_durability=append` is supported. |
| `sf_max_total_bytes` | With `sf_dir` it is a journal size **target**, not a disk quota; without `sf_dir` it caps the memory queue. |
| Durable ACK | Background-started senders, including with `sf_dir`, retry an unavailable capability from startup. Explicit `durable_ack_keepalive_interval_millis` also requests durable ACK even at `0`; negatives are rejected. |
| `connection_listener_inbox_capacity` | Configures only ingestion events, not query events. |
| Parsing | Use `0`, not `off`, for `auto_flush_rows` and `auto_flush_interval`; sizes take single-letter suffixes (`k`, `m`, `g`, `t`). `compression_level` requires `compression=zstd` or `auto`. `tls_roots` must be PEM; `tls_roots_password` is rejected. |
| Reconnect jitter | Ingestion uses full jitter, unlike the shared guide's equal-jitter ingestion schedule. |
| Typed SF options | A typed-only `storeAndForward` object defaults to append durability, 1 GiB, and fail-on-full; connect strings default to memory durability, 10 GiB, and wait-on-full. |
| Standalone `Sender` | Ignores pool and query-only keys with a warning; `on_*_error` keys are accepted but not applied. |

## Migration

### From ILP to QWP

The existing `Sender` row API can migrate from `http::` or `tcp::` to `ws::`
or `wss::`, followed by `await sender.connect()`. QWP adds querying, replay,
store-and-forward, and richer types. Unlike ILP HTTP, a QWP `flush()` can
resolve **before** the server accepts the rows, so wait for an ACK when
committing source offsets. Legacy ILP-only keys such as `retry_timeout`,
`init_buf_size`, and `tls_ca` are rejected on QWP strings.

### Upgrading from 4.x

Version 5.0.0 requires Node.js 20.18.1 or newer. Existing ILP senders now
omit columns passed `null` or `undefined` (instead of throwing for most
values); `decimalColumn()` rejects non-integer scales instead of silently
coercing them. The package adds `ws` for QWP and retains the old ILP
transports.

## ILP transports (legacy)

Use `Sender.fromConfig("http::addr=localhost:9000;")` for ILP over HTTP,
or `tcp::addr=localhost:9009;` for TCP. ILP is ingestion-only: call
`sender.flush()` before `sender.close()` or buffered rows are lost. See the
[ILP overview](/docs/connect/compatibility/ilp/overview/) for authentication,
protocol versions, and transport configuration.

## Next steps

- [Delivery semantics](/docs/concepts/delivery-semantics/) for replay and deduplication.
- [Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/).
- [Connect string reference](/docs/connect/clients/connect-string/) and the
  [Node.js API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html).
