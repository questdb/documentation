---
slug: /connect/clients/java
title: Java client for QuestDB
sidebar_label: Java
description: "QuestDB Java client for high-throughput data ingestion and streaming SQL queries over the QWP binary protocol."
---

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

import CodeBlock from "@theme/CodeBlock"

:::note

This is the reference for the QuestDB Java client when QuestDB is used as a
server. For embedded QuestDB, see the
[Java embedded guide](/docs/connect/java-embedded/).

:::

The QuestDB Java client connects to QuestDB over
[QWP — QuestDB Wire Protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) —
a columnar binary protocol carried over WebSocket. It supports high-throughput
data ingestion and streaming SQL queries on the same transport.

The recommended entry point is the [`QuestDB`](#the-questdb-handle) handle: a
shared, thread-safe facade that owns connection pools for both ingest and
egress and exposes a fluent query API on top of them.

Key capabilities:

- **One handle, both directions**: `QuestDB.connect(...)` derives ingest and
  egress endpoints from a single connect string; `db.borrowSender()` for
  ingestion, `db.query()` / `db.executeSql(...)` for SQL.
- **Pooled connections**: elastic sender and query pools with idle reaping,
  thread-affine senders, and zero-allocation borrow/submit paths at steady
  state.
- **Ingestion**: column-oriented batched writes with automatic table creation,
  schema evolution, and optional store-and-forward durability.
- **Querying**: streaming SQL result sets, DDL/DML execution, bind parameters,
  async [`Completion`](#completion) handles, and byte-credit flow control.
- **Failover**: multi-endpoint connections with automatic reconnect across
  rolling upgrades and primary migrations.

:::tip Legacy transports

The client also supports ILP ingestion over HTTP and TCP for backward
compatibility. This page documents the recommended WebSocket (QWP) path. For
ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

## Quick start

Add the dependency:

<Tabs defaultValue="maven" values={[ { label: "Maven", value: "maven" },
{ label: "Gradle", value: "gradle" }, ]}

>   <TabItem value="maven">

    <InterpolateJavaClientVersion renderText={(release) => (
      <CodeBlock className="language-xml">
        {`<dependency>
  <groupId>org.questdb</groupId>
  <artifactId>questdb-client</artifactId>
  <version>${release.name}</version>
</dependency>`}
      </CodeBlock>
    )} />
  </TabItem>
  <TabItem value="gradle">
    <InterpolateJavaClientVersion renderText={(release) => (
      <CodeBlock className="language-text">
        {`implementation 'org.questdb:questdb-client:${release.name}'`}
      </CodeBlock>
    )} />
  </TabItem>
</Tabs>

Construct one `QuestDB` per deployment, share it across threads, close it at
shutdown:

```java
import io.questdb.client.Completion;
import io.questdb.client.QuestDB;
import io.questdb.client.QueryException;
import io.questdb.client.Sender;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatch;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatchHandler;

try (QuestDB db = QuestDB.connect("ws::addr=localhost:9000;")) {

    // Ingest -- borrow a Sender, write rows, close() flushes and returns
    // the Sender to the pool. Real disconnect only happens at db.close().
    try (Sender sender = db.borrowSender()) {
        sender.table("trades")
              .symbol("symbol", "ETH-USD")
              .symbol("side", "sell")
              .doubleColumn("price", 2615.54)
              .doubleColumn("amount", 0.00044)
              .atNow();
        sender.table("trades")
              .symbol("symbol", "BTC-USD")
              .symbol("side", "sell")
              .doubleColumn("price", 39269.98)
              .doubleColumn("amount", 0.001)
              .atNow();
    }

    // Query -- one-shot SELECT, blocking await on the Completion.
    Completion c = db.executeSql(
        "SELECT ts, symbol, price, amount FROM trades "
        + "WHERE symbol = 'ETH-USD' LIMIT 10",
        new QwpColumnBatchHandler() {
            @Override
            public void onBatch(QwpColumnBatch batch) {
                batch.forEachRow(row -> System.out.printf(
                    "ts=%d symbol=%s price=%.4f amount=%.5f%n",
                    row.getLongValue(0),
                    row.getSymbol(1),
                    row.getDoubleValue(2),
                    row.getDoubleValue(3)));
            }

            @Override
            public void onEnd(long totalRows) {
                System.out.println("done: " + totalRows + " rows");
            }

            @Override
            public void onError(byte status, String message) {
                System.err.printf("error: 0x%02X %s%n", status & 0xFF, message);
            }
        });
    try {
        c.await();
    } catch (QueryException e) {
        // Server reported an error (parse failure, schema mismatch, etc.).
        System.err.printf("query failed: status=0x%02X %s%n",
            e.getStatus() & 0xFF, e.getMessage());
    }
}
```

`QuestDB.connect(...)` accepts an `http`, `https`, `ws` or `wss` connect
string and derives the other half by schema translation
(`http`↔`ws`, `https`↔`wss`). Use
[`QuestDB.connect(ingestCfg, queryCfg)`](#separate-ingest-and-egress-configs)
or the [builder](#builder-api) when the two sides differ.

## The QuestDB handle

`QuestDB` is a `Closeable` deployment-level handle. It owns two pools — one
for [`Sender`](#data-ingestion) instances and one for the underlying query
clients — plus a daemon housekeeper that reaps idle and over-age pool slots.

| Method | Returns | Purpose |
|--------|---------|---------|
| `connect(String)` | `QuestDB` | Static factory. Single connect string for both ingest and egress (schema must be `http`/`https`/`ws`/`wss`). |
| `connect(String, String)` | `QuestDB` | Static factory. Explicit ingest + egress connect strings. |
| `builder()` | `QuestDBBuilder` | Pool sizes, timeouts, separate configs. |
| `borrowSender()` | `Sender` | Lease a sender from the pool; `close()` flushes and returns it. |
| `sender()` | `Sender` | Thread-affine sender: pinned to the calling thread on first use, reused on subsequent calls. |
| `releaseSender()` | `void` | Release the thread-affine sender for the calling thread. |
| `query()` | `Query` | Per-thread cached fluent query builder (allocation-free). |
| `newQuery()` | `Query` | Fresh `Query` instance — use when one thread holds multiple in-flight queries. |
| `executeSql(sql, handler)` | `Completion` | One-shot shortcut, equivalent to `query().sql(sql).handler(handler).submit()`. |
| `close()` | `void` | Shut down pools and disconnect every underlying client. Idempotent. |

A `QuestDB` instance is safe to share across threads. Borrows, query
submissions, and the per-thread caches all serialize through the pool
internally.

### Single connect string

```java
try (QuestDB db = QuestDB.connect("ws::addr=localhost:9000;")) {
    // ...
}
```

Allowed schemas: `http`, `https`, `ws`, `wss`. The other side is derived by
schema translation:

| Input schema | Ingest schema | Egress schema |
|--------------|---------------|---------------|
| `http`       | `http`        | `ws`          |
| `https`      | `https`       | `wss`         |
| `ws`         | `http`        | `ws`          |
| `wss`        | `https`       | `wss`         |

These keys are mirrored from the input config to the derived side: `addr`,
`token`, `username`, `password`, `auth`, `tls_roots`, `tls_roots_password`,
`tls_verify`. Other keys stay on the input side only.

`token=...` is rewritten to `auth=Bearer ...` on the egress (WebSocket) side
so the same Enterprise token works for both directions.

:::note username/password and unified configs

Single-string unified configuration does not auto-derive
`username`/`password` for the WebSocket side. Either pass
`auth=Basic <base64>` directly (which propagates as-is to both sides) or use
the [builder](#builder-api) with explicit `ingestConfig()` and
`queryConfig()` strings.

:::

### Separate ingest and egress configs

When ingest and egress endpoints differ — typical when reads target a
read-replica or when ingest goes through a different load balancer — pass
explicit strings:

```java
try (QuestDB db = QuestDB.connect(
        "ws::addr=ingest.cluster:9000;",
        "wss::addr=read-replica.cluster:9000;auth=Bearer YOUR_TOKEN;")) {
    // ...
}
```

The first argument follows
[`Sender.fromConfig`](#sender-low-level-primitive) format; the second follows
[`QwpQueryClient.fromConfig`](#qwpqueryclient-low-level-primitive) format.

### Builder API

For pool tuning, separate configs, or any of the housekeeping knobs:

```java
try (QuestDB db = QuestDB.builder()
        .ingestConfig("ws::addr=ingest.cluster:9000;")
        .queryConfig("ws::addr=read-replica.cluster:9000;")
        .senderPoolSize(8)                // fixed size, eager allocation
        .queryPoolMin(2).queryPoolMax(16) // elastic
        .acquireTimeoutMillis(10_000)
        .idleTimeoutMillis(60_000)
        .maxLifetimeMillis(30 * 60_000L)
        .build()) {
    // ...
}
```

Builder methods:

| Method | Default | Purpose |
|--------|---------|---------|
| `fromConfig(String)` | — | Unified config; also parses pool-tuning keys from the string. |
| `ingestConfig(String)` | — | Sender-side config (required). |
| `queryConfig(String)` | — | Query-side config (required). |
| `senderPoolMin(int)` | `1` | Minimum senders kept warm. `0` allows drain. |
| `senderPoolMax(int)` | `4` | Maximum senders. |
| `senderPoolSize(int)` | — | Shortcut: fixed `min = max = size`, eager allocation. |
| `queryPoolMin(int)` | `1` | Minimum query clients kept warm. |
| `queryPoolMax(int)` | `4` | Maximum query clients. |
| `queryPoolSize(int)` | — | Shortcut: fixed `min = max = size`. |
| `acquireTimeoutMillis(long)` | `5000` | Borrow / submit blocks up to this long when the pool is exhausted, then throws. |
| `idleTimeoutMillis(long)` | `60000` | Idle slot reap threshold. `min` is always respected. `0` ⇒ never reap. |
| `maxLifetimeMillis(long)` | `1800000` | Recycle a slot after this age. `0` ⇒ never recycle. |
| `housekeeperIntervalMillis(long)` | `5000` | Daemon sweep cadence. Minimum 100ms. |

### Environment variable

Set `QDB_CLIENT_CONF` and use `QuestDB.connect` with the same string read
from the environment:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;token=YOUR_TOKEN;"
```

```java
String cfg = System.getenv("QDB_CLIENT_CONF");
try (QuestDB db = QuestDB.connect(cfg)) {
    // ...
}
```

### Connect-string pool keys

The pool-tuning options above can also live in the connect string itself.
The builder strips them out before passing the string to the underlying
`Sender` and `QwpQueryClient` parsers (which don't recognise them):

| Key                       | Builder equivalent         |
|---------------------------|----------------------------|
| `sender_pool_min`         | `senderPoolMin(int)`       |
| `sender_pool_max`         | `senderPoolMax(int)`       |
| `query_pool_min`          | `queryPoolMin(int)`        |
| `query_pool_max`          | `queryPoolMax(int)`        |
| `acquire_timeout_ms`      | `acquireTimeoutMillis(long)` |
| `idle_timeout_ms`         | `idleTimeoutMillis(long)`  |
| `max_lifetime_ms`         | `maxLifetimeMillis(long)`  |
| `housekeeper_interval_ms` | `housekeeperIntervalMillis(long)` |

Explicit builder calls **after** `fromConfig(...)` overwrite anything the
string set; last write wins.

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade for
egress and on each request for HTTP ingress, before any data is exchanged.
The mirrored keys (`token`, `username`/`password`, `auth`, `tls_*`) work
identically on `QuestDB.connect(...)`.

### Token (Enterprise, recommended)

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;token=YOUR_BEARER_TOKEN;")) {
    // ...
}
```

The bearer token is sent verbatim to the ingest side and rewritten to
`auth=Bearer YOUR_BEARER_TOKEN` on the egress side.

### HTTP basic auth

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;username=admin;password=quest;")) {
    // ...
}
```

This works for ingest. For the egress side, use the builder with explicit
`queryConfig("...auth=Basic <base64>...")` (see the note in
[Single connect string](#single-connect-string)).

### TLS with custom trust store

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;"
        + "tls_roots=/path/to/truststore.jks;"
        + "tls_roots_password=changeit;"
        + "token=YOUR_BEARER_TOKEN;")) {
    // ...
}
```

For development, `tls_verify=unsafe_off` disables certificate validation.
**Never use this in production.**

## The connection pool

Both pools are *elastic*: they keep `min` slots warm, grow up to `max`
on demand, and reap idle slots (anything above `min`) at the housekeeper
interval.

### Borrowed vs thread-affine senders

```java
// Borrowed: lease per use. close() flushes and returns to the pool.
try (Sender sender = db.borrowSender()) {
    sender.table("trades").doubleColumn("price", 42.0).atNow();
}

// Thread-affine: first call pins one Sender to this thread. Subsequent
// calls on the same thread return the same instance with zero overhead.
Sender sender = db.sender();
for (int i = 0; i < 1_000_000; i++) {
    sender.table("trades").doubleColumn("price", 42.0 + i).atNow();
}
sender.flush();
```

Pick `db.sender()` for long-lived dedicated producer threads where
borrow/return overhead would dominate. Pick `db.borrowSender()` for
short-lived or event-loop callers.

If your producer thread is borrowed from a foreign pool (Netty event loop,
servlet container, etc.) and may be recycled to handle unrelated work,
call `db.releaseSender()` before handing it back, otherwise it stays
pinned for the rest of the thread's life.

:::note Pooled Sender close semantics

`Sender.close()` on a borrowed sender flushes pending rows and returns the
decorator to the pool — it does **not** disconnect the underlying
WebSocket. A real disconnect only happens at `QuestDB.close()` (or when the
housekeeper reaps an idle slot).

:::

### Per-thread Query cache

`db.query()` returns the same `Query` instance on every call from the same
thread, reset to empty if it was in a terminal state. The associated
`Completion` is a field on that instance, so the steady-state submit path
is allocation-free.

For multiple in-flight queries from one thread, call `db.newQuery()` —
each call allocates a fresh `Query`. The query pool's `max` caps overall
concurrency (one worker per in-flight query).

### Acquire timeout

`db.borrowSender()` and `Query.submit()` block when the pool is exhausted
(every slot in use and `max` already reached). They unblock when a slot
returns or when the timeout (default 5s) elapses; on timeout, they throw
`LineSenderException`. Raise `acquireTimeoutMillis` for steady-state
bursts you expect to absorb, or raise `max` to allow more concurrency.

## Data ingestion

Once you have a `Sender` from the pool, the row-building API is identical
across all transports.

### General usage pattern

`Sender` is not thread-safe. The pool's contract is that a borrowed sender
is owned by the borrower until it's returned (via `close()` or
`releaseSender()`).

1. Borrow a sender (`db.borrowSender()` or `db.sender()`).
2. Call `table(name)` to select a table.
3. Call column methods to add values:
   - `symbol(name, value)`
   - `stringColumn(name, value)`
   - `boolColumn(name, value)`
   - `byteColumn(name, byte)`, `shortColumn(name, short)`, `intColumn(name, int)`
   - `longColumn(name, long)`, `floatColumn(name, float)`, `doubleColumn(name, double)`
   - `charColumn(name, char)`
   - `timestampColumn(name, Instant)` or `timestampColumn(name, long, ChronoUnit)`
   - `uuidColumn(name, lo, hi)` (two longs)
   - `long256Column(name, l0, l1, l2, l3)` (four longs, least significant first)
   - `decimalColumn(name, Decimal256)` or `decimalColumn(name, CharSequence)`
   - `ipv4Column(name, int)` (packed 32-bit address) or `ipv4Column(name, CharSequence)`
     (dotted-quad)
   - `geoHashColumn(name, long bits, int precisionBits)` or
     `geoHashColumn(name, CharSequence base32)`
   - `binaryColumn(name, byte[])`, `binaryColumn(name, long ptr, long len)`, or
     `binaryColumn(name, DirectByteSlice)`
   - `doubleArray(name, ...)` and `longArray(name, ...)` (see
     [Ingest arrays](#ingest-arrays))

   DATE is accepted on ingress server-side but the Java client does not yet
   expose a `dateColumn()` setter. All types are readable on the
   [egress side](#reading-result-batches).

   To store a null for a column, omit that column's setter before calling
   `at()` or `atNow()`. The column set for the batch is the union of all
   columns seen across rows; a column first used on a later row is
   backfilled with null for earlier rows.

   :::note IPv4 string input is strict

   `ipv4Column(name, CharSequence)` rejects the literal strings `"null"`
   (case-insensitive) and `"0.0.0.0"` with a `LineSenderException`. Passing
   a `null` reference is a no-op (the column is left unset, which surfaces
   as SQL NULL on read).

   :::

   :::note GEOHASH precision is locked per column

   The first call to `geoHashColumn` for a column fixes its precision
   (number of bits). Subsequent rows must use the same precision or the
   call throws `LineSenderException`. For the string overload, precision
   is `value.length() * 5` bits; for the bits overload, it is the explicit
   `precisionBits` argument (1..60).

   :::

4. Call `at(Instant)`, `at(long, ChronoUnit)`, or `atNow()` to finalize the
   row.
5. Repeat from step 2, or call `flush()` to send buffered data.
6. Release the sender:
   - For `db.borrowSender()`, close the sender (try-with-resources). The
     pool flushes pending rows before reusing the slot.
   - For `db.sender()`, leave it pinned across calls and `flush()` between
     batches; release only on shutdown or thread recycling.

```java
try (Sender sender = db.borrowSender()) {
    sender.table("trades")
          .symbol("symbol", "EURUSD")
          .symbol("side", "buy")
          .doubleColumn("price", 1.0842)
          .doubleColumn("amount", 100_000.0)
          .at(Instant.now());
}
```

Tables and columns are created automatically if they do not exist.

### Ingest arrays

For 1D and 2D arrays, pass a Java array directly:

```java
double[] prices = {1.0842, 1.0843, 1.0841};
sender.table("book").doubleArray("levels", prices).atNow();
```

For higher-dimensional arrays, use the `DoubleArray` class to avoid GC
overhead. Create the instance once and reuse it across rows by calling
`clear()` before populating each row:

```java
import io.questdb.client.cutlass.line.array.DoubleArray;

try (Sender sender = db.borrowSender();
     DoubleArray ary = new DoubleArray(3, 3, 3)) {
    for (int i = 0; i < ROW_COUNT; i++) {
        ary.clear();  // reset write position, reuse native memory
        for (int v = 0; v < 27; v++) {
            ary.append(v);
        }
        sender.table("book")
              .doubleArray("cube", ary)
              .at(getTimestamp(), ChronoUnit.MICROS);
    }
}
```

The constructor `new DoubleArray(d1, d2, ...)` defines the shape. Values are
appended in row-major order: the last dimension varies fastest. For a 2D
array with shape `(3, 2)`, `append()` fills positions `[0,0], [0,1], [1,0],
[1,1], [2,0], [2,1]`. You can also use `set(value, i, j, ...)` to write at
specific coordinates. Call `reshape(d1, d2, ...)` to change the shape
without reallocating.

`LongArray` works the same way for 64-bit integer arrays — pass a Java
`long[]`, `long[][]`, or `long[][][]` directly, or use the reusable
`LongArray` class for higher dimensions:

```java
import io.questdb.client.cutlass.line.array.LongArray;

try (LongArray counts = new LongArray(3, 3, 3)) {
    counts.clear();
    for (int v = 0; v < 27; v++) {
        counts.append(v);
    }
    sender.table("book").longArray("counts", counts).atNow();
}
```

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) column
controls time-based partitioning and ordering. There are two ways to set it:

**User-assigned** (recommended for deduplication and exactly-once delivery):

```java
sender.table("trades")
      .symbol("symbol", "EURUSD")
      .doubleColumn("price", 1.0842)
      .at(Instant.now());

// Explicit microseconds for high-throughput paths:
sender.table("trades")
      .symbol("symbol", "EURUSD")
      .doubleColumn("price", 1.0842)
      .at(System.currentTimeMillis() * 1000, ChronoUnit.MICROS);

// Nanosecond precision (creates a timestamp_ns column):
sender.table("ticks")
      .symbol("symbol", "EURUSD")
      .doubleColumn("price", 1.0842)
      .at(System.nanoTime(), ChronoUnit.NANOS);
```

Using `ChronoUnit.NANOS` with `at()` or `timestampColumn()` creates a
`timestamp_ns` column. Using any other unit creates a standard `TIMESTAMP`
column (microsecond precision).

**Server-assigned** (server uses its wall-clock time):

```java
sender.table("trades")
      .symbol("symbol", "EURUSD")
      .doubleColumn("price", 1.0842)
      .atNow();
```

:::note
QuestDB works best when data arrives in chronological order (sorted by
timestamp).
:::

### Decimal columns

Create decimal columns ahead of time with `DECIMAL(precision, scale)` so
QuestDB ingests values with the expected precision. See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page for details.

### Flushing

The client accumulates rows in an internal buffer and sends them in batches.

**Auto-flush** (default): the client flushes when either threshold is reached:

| Trigger    | WebSocket default | HTTP default |
|------------|-------------------|--------------|
| Row count  | 1,000 rows        | 75,000 rows  |
| Time       | 100 ms            | 1,000 ms     |

Customize via connect string:

```text
ws::addr=localhost:9000;auto_flush_rows=500;auto_flush_interval=50;
```

**Explicit flush**: you can call `flush()` at any time to send buffered data
immediately, even with auto-flush enabled:

```java
try (Sender sender = db.borrowSender()) {
    for (Trade trade : trades) {
        sender.table("trades")
              .symbol("symbol", trade.symbol())
              .doubleColumn("price", trade.price())
              .doubleColumn("amount", trade.amount())
              .at(trade.timestamp());
    }
    sender.flush();  // send everything now, regardless of auto-flush thresholds
}
```

:::note
Disabling auto-flush entirely (`auto_flush=off`) is not supported on the
WebSocket transport. Use the auto-flush row count and interval settings to
control batch size instead.
:::

`Sender.close()` (or pool return) flushes pending rows, waiting up to
`close_flush_timeout_millis` (default 5000) for acknowledgements. If the
flush fails at close time, the client does not retry. For at-least-once
semantics, flush explicitly and check FSN progress
([Awaiting acknowledgements](#awaiting-acknowledgements)) before closing.

:::note Server-advertised batch cap

The server advertises its maximum accepted batch size on the WebSocket
upgrade response (`X-QWP-Max-Batch-Size`). The client parses this header
on connect and clamps subsequent batches to the advertised cap. A single
row larger than the cap, or a batch that would exceed the cap at flush
time, surfaces synchronously as a `LineSenderException` from the
offending column call or from `flush()` — earlier client versions only
saw this as a `1009` WebSocket close on the next operation.

:::

### Store-and-forward

With store-and-forward enabled, unacknowledged data is persisted to disk and
replayed after reconnection, surviving sender process restarts.

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;sender_id=ingest-1;
```

When multiple senders share the same `sf_dir`, each must have a distinct
`sender_id`. Slots are exclusive: two senders with the same ID will collide.
Allowed characters: `A-Za-z0-9_-`.

If you use `db.sender()` (thread-affine) across multiple application
threads, each pinned sender needs its own `sender_id`. Configure the pool
with a unique `sender_id` per slot using the builder's `ingestConfig` (one
`QuestDB` per slot ID), or stick to a single-slot pool when SF is enabled.

Without `sf_dir`, unacknowledged data lives in process memory and is lost
if the sender process dies. The reconnect loop still spans transient server
outages (rolling upgrades), but the RAM buffer caps how much data can
accumulate.

<SfDedupWarning />

With store-and-forward enabled, `flush()` can block when the buffer hits its
cap. The producer blocks until the wire path drains enough capacity, up to
`sf_append_deadline_millis` (default 30 seconds). If the deadline elapses,
the call fails without dropping data. Terminal rejections (schema, parse,
or security errors) latch a terminal error on the sender. The next API
call throws `LineSenderServerException`; the pool detects the terminal
state and replaces the slot.

### Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication
configured.

:::

By default, the server confirms a batch when it is committed to the local
[WAL](/docs/concepts/write-ahead-log/). To wait for the batch to be durably
uploaded to object storage:

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;request_durable_ack=on;
```

### Awaiting acknowledgements

`flush()` returns once the batch is published into the cursor engine, not
once the server has acknowledged it. ACKs arrive asynchronously on the I/O
loop. To bridge between publish and acknowledgement, every published frame
is assigned a frame sequence number (FSN). `flushAndGetSequence()` returns
the highest FSN the call published, and `awaitAckedFsn(targetFsn,
timeoutMillis)` blocks until the server has acknowledged up to that FSN:

```java
try (Sender sender = db.borrowSender()) {
    sender.table("trades").doubleColumn("price", 42.0).atNow();
    long fsn = sender.flushAndGetSequence();
    if (fsn >= 0 && !sender.awaitAckedFsn(fsn, 10_000)) {
        // timed out waiting for the server ACK
    }
}
```

Related accessors:

| Method | Returns |
|--------|---------|
| `flushAndGetSequence()` | Highest FSN published by this call. `-1` if nothing was published. |
| `getAckedFsn()` | Highest FSN the server has acknowledged. `-1` if no batch has been published yet. |
| `awaitAckedFsn(fsn, timeoutMillis)` | Block until `getAckedFsn()` reaches `fsn`, or the timeout elapses. |

When `request_durable_ack=on` is set, `getAckedFsn()` advances after the
durable upload to object storage, not on the ordinary commit ACK. The same
FSN span is reported on `SenderError.getFromFsn()` / `getToFsn()` for
rejected batches, so the value returned by `flushAndGetSequence()` is also
the correlation key for async error reports.

These methods are no-ops on transports that do not track frame sequence
numbers (HTTP, TCP, UDP): `flushAndGetSequence()` and `getAckedFsn()`
return `-1`, and `awaitAckedFsn()` returns immediately.

## Querying with `Query` and `Completion`

SQL queries are submitted through the fluent `Query` builder and observed
through an async `Completion` handle:

```java
import io.questdb.client.Completion;
import io.questdb.client.QueryException;
import io.questdb.client.Query;

Query q = db.query()
    .sql("SELECT ts, symbol, price FROM trades WHERE symbol = $1 LIMIT $2")
    .binds(binds -> {
        binds.setVarchar(0, "EURUSD");
        binds.setLong(1, 100L);
    })
    .handler(handler);

Completion c = q.submit();
try {
    c.await();  // blocks until onEnd / onError / onExecDone resolves
} catch (QueryException e) {
    System.err.printf("query failed: status=0x%02X %s%n",
        e.getStatus() & 0xFF, e.getMessage());
}
```

Or, for queries without bind parameters, the one-shot shortcut:

```java
Completion c = db.executeSql(
    "SELECT count(*) FROM trades",
    handler);
c.await();
```

`db.executeSql(...)` is equivalent to
`db.query().sql(sql).handler(handler).submit()` and uses the same per-thread
cached `Query` and `Completion` — both forms are allocation-free at steady
state.

### The `Query` builder

| Method | Required | Purpose |
|--------|----------|---------|
| `sql(CharSequence)` | yes | SQL text. Buffer is copied; not retained past `submit()`. |
| `binds(QwpBindSetter)` | no | Bind-parameter populator. See [Bind parameters](#bind-parameters). |
| `handler(QwpColumnBatchHandler)` | yes | Result handler — fires `onBatch` + `onEnd` (or `onError` / `onExecDone`). |
| `submit()` | — | Acquire a worker, dispatch, return the cached `Completion`. Throws if SQL or handler is unset, or if a previous submit on this `Query` is still in flight. |
| `abandon()` | — | Discard the current SQL/binds/handler without submitting. |

`db.query()` returns the per-thread cached `Query`; one in-flight query
per thread. For multiple concurrent in-flight queries from one thread, use
`db.newQuery()` and submit each separately — the query pool serves up to
`queryPoolMax` workers in parallel.

### `Completion`

| Method | Returns | Notes |
|--------|---------|-------|
| `await()` | `void` | Block until terminal; rethrow `QueryException` on server error or cancel. |
| `await(long, TimeUnit)` | `boolean` | Like `await()` but returns `false` on timeout (the query stays in flight). |
| `cancel()` | `void` | Request cancellation; idempotent. The handler observes `onError` with the cancel status; `await()` throws `QueryException`. |
| `isDone()` | `boolean` | True once the query has reached a terminal state (success / error / cancel acknowledged). |

`QueryException.getStatus()` returns the wire-level QWP status byte (see
[Query error status codes](#query-errors)). `0` indicates a client-side
failure — for example, a transport drop before any server response.

The `Completion` is signaled from the query worker's I/O thread after the
handler's terminal callback (`onEnd`, `onError`, or `onExecDone`) returns.

### Bind parameters

Parameterized queries use typed bind values, avoiding SQL injection and
enabling server-side factory cache reuse across repeated calls:

```java
String sql = "SELECT ts, symbol, price, amount FROM trades "
    + "WHERE symbol = $1 AND price >= $2 LIMIT 1000";

for (String symbol : List.of("EURUSD", "GBPUSD", "USDJPY")) {
    db.query()
      .sql(sql)
      .binds(binds -> binds
          .setVarchar(0, symbol)
          .setDouble(1, 1.0))
      .handler(handler)
      .submit()
      .await();
}
```

Bind indices are 0-based (`$1` maps to index 0). Setters must be called in
ascending order with no gaps. Available setters:

| Setter | Bind type |
|--------|-----------|
| `setBoolean(index, value)` | BOOLEAN |
| `setByte(index, value)` | BYTE |
| `setChar(index, value)` | CHAR |
| `setShort(index, value)` | SHORT |
| `setInt(index, value)` | INT |
| `setLong(index, value)` | LONG |
| `setFloat(index, value)` | FLOAT |
| `setDouble(index, value)` | DOUBLE |
| `setDate(index, millis)` | DATE |
| `setTimestampMicros(index, micros)` | TIMESTAMP |
| `setTimestampNanos(index, nanos)` | `timestamp_ns` |
| `setVarchar(index, value)` | VARCHAR, STRING, and SYMBOL columns |
| `setUuid(index, lo, hi)` or `setUuid(index, UUID)` | UUID |
| `setLong256(index, l0, l1, l2, l3)` | LONG256 |
| `setGeohash(index, precisionBits, value)` | GEOHASH |
| `setDecimal64(index, scale, unscaled)` | DECIMAL64 |
| `setDecimal128(index, scale, lo, hi)` | DECIMAL128 |
| `setDecimal256(index, scale, ll, lh, hl, hh)` | DECIMAL256 |

To pass a NULL bind value, either pass `null` to `setVarchar` or use the
typed `setNull`:

```java
.binds(binds -> binds.setVarchar(0, null))           // null VARCHAR/SYMBOL
.binds(binds -> binds.setNull(0, TYPE_LONG))         // typed null (requires QWP type code)
.binds(binds -> binds.setNullGeohash(0, 20))         // null GEOHASH with precision
.binds(binds -> binds.setNullDecimal64(0, 4))        // null DECIMAL64 with scale
```

To keep submission allocation-free, hoist your `QwpBindSetter` lambda to a
field rather than capturing per-call locals — captured locals allocate a
new closure object each submit.

### Cancellation and timeouts

```java
Completion c = db.executeSql(
    "SELECT * FROM big_table ORDER BY ts",
    handler);

if (!c.await(5, TimeUnit.SECONDS)) {
    c.cancel();
    try {
        c.await();
    } catch (QueryException cancelled) {
        // status carries the cancel byte; handler also saw onError
    }
}
```

`cancel()` is a no-op if the query has already completed. If `cancel()`
races to terminal, `await()` throws `QueryException` with the cancel
status. If the query finished first, `await()` returns normally.

### Result handler

The handler interface is unchanged from the lower-level
[`QwpQueryClient`](#qwpqueryclient-low-level-primitive):

```java
import io.questdb.client.cutlass.qwp.client.QwpColumnBatch;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatchHandler;

new QwpColumnBatchHandler() {
    @Override
    public void onBatch(QwpColumnBatch batch) {
        for (int row = 0; row < batch.getRowCount(); row++) {
            long ts = batch.getLongValue(0, row);
            String symbol = batch.getSymbol(1, row);
            double price = batch.getDoubleValue(2, row);
            // process row...
        }
    }

    @Override
    public void onEnd(long totalRows) {}

    @Override
    public void onError(byte status, String message) {
        System.err.printf("error: 0x%02X %s%n", status & 0xFF, message);
    }
};
```

The `QwpColumnBatch` object is valid only during the `onBatch` callback.
Copy values out if you need them after the callback returns.

**Convenience accessors**: `batch.forEachRow(row -> ...)` provides a
`RowView` with single-argument accessors (`row.getLongValue(col)`,
`row.getSymbol(col)`, etc.) for compact read paths.

**Null checking**: call `batch.isNull(col, row)` before reading a value.

When the handler is invoked through `Query`/`Completion`, the same instance
can be reused across submissions — there is no per-call wrapping
allocation.

### Reading result batches

`QwpColumnBatch` provides typed accessors for all QuestDB column types:

| Accessor | Column types |
|----------|-------------|
| `getBoolValue(col, row)` | BOOLEAN |
| `getByteValue(col, row)` | BYTE |
| `getShortValue(col, row)` | SHORT |
| `getCharValue(col, row)` | CHAR |
| `getIntValue(col, row)` | INT, IPv4 |
| `getLongValue(col, row)` | LONG, TIMESTAMP, `timestamp_ns`, DATE, DECIMAL64 (unscaled) |
| `getFloatValue(col, row)` | FLOAT |
| `getDoubleValue(col, row)` | DOUBLE |
| `getSymbol(col, row)` | SYMBOL (returns cached `String`) |
| `getStrA(col, row)` / `getStrB(col, row)` | VARCHAR (reusable `CharSequence` views) |
| `getString(col, row)` | VARCHAR (heap-allocating `String`) |
| `getString(col, row, CharSink)` | VARCHAR (copy into sink) |
| `getBinaryA(col, row)` / `getBinaryB(col, row)` | BINARY (reusable native views) |
| `getBinary(col, row)` | BINARY (heap-allocating `byte[]`) |
| `getUuid(col, row, Uuid)` | UUID (zero-allocation, into sink) |
| `getUuidHi(col, row)` / `getUuidLo(col, row)` | UUID (individual 64-bit halves) |
| `getLong256(col, row, Long256Sink)` | LONG256, DECIMAL256 (into sink) |
| `getLong256Word(col, row, wordIndex)` | LONG256, DECIMAL256 (individual 64-bit word) |
| `getGeohashValue(col, row)` | GEOHASH (raw long value) |
| `getGeohashPrecisionBits(col)` | GEOHASH (precision metadata, per column) |
| `getDecimal128High(col, row)` / `getDecimal128Low(col, row)` | DECIMAL128 (two longs) |
| `getDecimalScale(col)` | DECIMAL64 / DECIMAL128 / DECIMAL256 (scale metadata, per column) |
| `getDoubleArrayElements(col, row)` | DOUBLE_ARRAY (flattened `double[]`, row-major) |
| `getArrayNDims(col, row)` | DOUBLE_ARRAY (dimension count) |
| `isNull(col, row)` | All types |

Column metadata is available via `batch.getColumnName(col)`,
`batch.getColumnWireType(col)`, and `batch.getColumnCount()`.

**Reading array columns:**

`getDoubleArrayElements(col, row)` returns a flattened `double[]` in
row-major order. Use `getArrayNDims(col, row)` to discover the
dimensionality:

```java
int nDims = batch.getArrayNDims(colIndex, row);  // e.g. 2
double[] flat = batch.getDoubleArrayElements(colIndex, row);
// flat contains all elements in row-major order
```

Alternatively, extract individual elements in SQL (e.g.,
`SELECT bids[1][1] FROM market_data`) and read them as scalar doubles.

### DDL and DML statements

Non-SELECT statements (CREATE TABLE, INSERT, UPDATE, ALTER, DROP, TRUNCATE)
go through the same `submit()` / `executeSql(...)` path. The server replies
with `EXEC_DONE` instead of result batches; override the
`onExecDone(opType, rowsAffected)` callback:

```java
db.executeSql(
    "CREATE TABLE trades ("
    + "ts TIMESTAMP, symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE"
    + ") TIMESTAMP(ts) PARTITION BY DAY WAL",
    new QwpColumnBatchHandler() {
        @Override public void onBatch(QwpColumnBatch batch) {}
        @Override public void onEnd(long totalRows) {}

        @Override
        public void onError(byte status, String message) {
            System.err.println("failed: " + message);
        }

        @Override
        public void onExecDone(short opType, long rowsAffected) {
            System.out.printf("done: opType=%d rows=%d%n", opType, rowsAffected);
        }
    }
).await();
```

`rowsAffected` reports the count for INSERT/UPDATE/DELETE. Pure DDL
(CREATE, DROP, ALTER, TRUNCATE) reports 0.

Because `await()` blocks until the terminal callback returns, you can
safely sequence DDL → DML → SELECT:

```java
db.executeSql("CREATE TABLE t (...) ...", ddlHandler).await();
db.executeSql("INSERT INTO t VALUES ...", dmlHandler).await();
db.executeSql("SELECT * FROM t", selectHandler).await();
```

### Flow control

For large result sets, byte-credit flow control prevents the server from
overwhelming the client. Set `initial_credit` on the query connect string
(via the builder's `queryConfig`):

```java
try (QuestDB db = QuestDB.builder()
        .ingestConfig("ws::addr=localhost:9000;")
        .queryConfig("ws::addr=localhost:9000;initial_credit=" + (256 * 1024) + ";")
        .build()) {
    // server pauses after streaming ~256 KiB, auto-replenishes per batch
}
```

A credit of `0` (the default) means unbounded: the server streams as fast
as the network allows.

### Compression

Negotiate zstd compression to reduce network bandwidth for large result
sets:

```java
try (QuestDB db = QuestDB.connect(
        "ws::addr=localhost:9000;compression=zstd;compression_level=3;")) {
    // batches are automatically decompressed
}
```

`compression` and `compression_level` apply to the query side only and are
ignored by the ingest side.

## Error handling

### Ingestion errors

WebSocket ingestion uses an asynchronous error model. Batch rejections are
delivered via the `SenderErrorHandler` callback, not thrown from `flush()`.
The `QuestDB` connect-string path does not yet expose this callback — if
your application needs structured `SenderError` reports, drop down to the
[low-level `Sender.builder`](#sender-low-level-primitive) directly and
skip the pool. The structured fields on `SenderError` are the same
regardless of how the sender was created:

| Field | Accessor | Description |
|-------|----------|-------------|
| Category | `getCategory()` | `SCHEMA_MISMATCH`, `PARSE_ERROR`, `INTERNAL_ERROR`, `SECURITY_ERROR`, `WRITE_ERROR`, `PROTOCOL_VIOLATION`, or `UNKNOWN` |
| Policy | `getAppliedPolicy()` | `DROP_AND_CONTINUE` (batch dropped, sender continues) or `HALT` (next API call throws `LineSenderServerException`) |
| Server message | `getServerMessage()` | Human-readable error text from the server (may be null) |
| Table name | `getTableName()` | The rejected table (null for multi-table batches) |
| FSN range | `getFromFsn()` / `getToFsn()` | Frame sequence number span identifying the rejected batch |
| Message sequence | `getMessageSequence()` | Server's per-frame sequence number (`-1` if not available) |
| Status byte | `getServerStatusByte()` | Raw QWP status code (`-1` if not available) |

The error handler runs on a dedicated dispatcher thread, never on the I/O
or producer thread.

When a sender owned by `QuestDB` enters a terminal `HALT` state, the next
producer-thread call throws `LineSenderServerException`. The pool detects
the failure on close/return and replaces the slot with a fresh sender on
the next borrow.

### Query errors

Query errors surface in two places:

1. The handler's `onError(byte status, String message)` callback fires
   exactly once with the QWP status and server text.
2. `Completion.await()` rethrows them as `QueryException`:

```java
try {
    db.executeSql(sql, handler).await();
} catch (QueryException e) {
    if (e.getStatus() == 0) {
        // client-side failure: transport drop before any server response
    } else {
        System.err.printf("server reported 0x%02X: %s%n",
            e.getStatus() & 0xFF, e.getMessage());
    }
}
```

Status codes:

| Code   | Name            | Description                                       |
|--------|-----------------|---------------------------------------------------|
| `0x03` | SCHEMA_MISMATCH | Bind parameter type incompatible with placeholder |
| `0x05` | PARSE_ERROR     | SQL syntax error or malformed message             |
| `0x06` | INTERNAL_ERROR  | Server-side execution failure                     |
| `0x08` | SECURITY_ERROR  | Authorization failure                             |
| `0x0A` | CANCELLED       | Query terminated by `Completion.cancel()`         |
| `0x0B` | LIMIT_EXCEEDED  | Protocol limit hit                                |

Errors can arrive before any data (parse failure) or mid-stream (storage
failure, server shutdown). When `onError` is called, no further frames
arrive for that query.

`onError(long requestId, byte status, String message)` is a
correlation-aware overload — the request id matches
`QwpColumnBatch.requestId()` from any prior `onBatch`. Similarly,
`onEnd(long requestId, long totalRows)`,
`onExecDone(long requestId, short opType, long rowsAffected)`, and
`onFailoverReset(long requestId, QwpServerInfo newNode)` are
default-method overloads of the corresponding completion callbacks; all
default to the shorter signatures, so existing handlers compile
unchanged.

#### Diagnostics surface

What is and isn't carried on `onError`:

| Diagnostic | Surfaced? |
|------------|-----------|
| Request id | Yes — `requestId` argument on the 3-arg overload. Also available mid-stream on `QwpColumnBatch.requestId()`. `-1` when the failure is raised before a request was assigned (closed client, bind-encode failure, latched terminal failure from a prior generation). |
| Failing SQL | Not surfaced. Stash the string at the submit site if you need it on `onError`. |
| Bind index (for `SCHEMA_MISMATCH`) | Not structurally surfaced. May be embedded in the free-form `message`; format is not part of the protocol contract. |
| Message stability | `message` is server-supplied free-form text, not localized. Wording is not guaranteed across server releases — pattern-match on `status` instead. |
| PII / secret safety | `message` may echo back SQL fragments, bind values, and table or column names. Treat it as untrusted user-derived text; redact before logging at INFO. |

### Connection-level errors

- **Authentication failure**: `401`/`403` HTTP response before the WebSocket
  upgrade completes. Terminal across all endpoints. The borrow that
  triggered the connect rethrows `LineSenderException`.
- **Malformed frames**: `QwpDecodeException` or WebSocket close with a
  terminal code.
- **Role mismatch**: `QwpRoleMismatchException` when all endpoints report
  roles that do not match the `target=` filter.

## Failover and high availability

:::note Enterprise

Multi-host failover with automatic reconnect requires QuestDB Enterprise.

:::

### Multiple endpoints

Specify comma-separated addresses in the connect string:

```text
ws::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

The client tries endpoints in order. On connection loss, it walks the list
to find the next healthy endpoint. Schema translation applies to the whole
list — the egress side sees the same hosts on `ws`/`wss`.

### Ingestion failover

The ingestion sender uses a reconnect loop with exponential backoff. Key
connect-string options:

| Key                              | Default   | Description                               |
|----------------------------------|-----------|-------------------------------------------|
| `reconnect_max_duration_millis`  | `300000`  | Total outage budget before giving up.     |
| `reconnect_initial_backoff_millis` | `100`   | First post-failure sleep.                 |
| `reconnect_max_backoff_millis`   | `5000`    | Cap on per-attempt sleep.                 |
| `initial_connect_retry`          | `off`     | Retry on first connect (`on`, `sync`, `async`). |

Ingress is zone-blind: it pins QWP v1 and does not read `SERVER_INFO`. The
`zone=` key is accepted but ignored, so a connect string shared with egress
clients works unchanged.

With store-and-forward (`sf_dir` set), unacknowledged data survives sender
restarts. Without it, unacknowledged data lives in process memory and is
lost if the sender process dies.

### Query failover

The query client drives a per-query reconnect loop. When a transport error
occurs mid-stream, the client reconnects to another endpoint and replays
the query. `batch_seq` restarts at 0 on the new connection, and the
handler's `onFailoverReset(...)` fires before the replayed batches arrive.

Key connect-string options:

| Key                           | Default | Description                               |
|-------------------------------|---------|-------------------------------------------|
| `failover`                    | `on`    | Master switch for per-query reconnect.    |
| `failover_max_attempts`       | `8`     | Max reconnect attempts per query.         |
| `failover_backoff_initial_ms` | `50`    | First post-failure sleep.                 |
| `failover_backoff_max_ms`     | `1000`  | Cap on per-attempt sleep.                 |
| `failover_max_duration_ms`    | `30000` | Total wall-clock budget per query.        |

:::warning Failover requires multiple endpoints

Failover rotates across endpoints. With a single `addr`, there is no other
host to try, and the loop exhausts after one attempt regardless of
`failover_max_attempts`. For failover to be useful, provide at least two
addresses.

:::

**Handling partial results**: when failover occurs mid-stream, the
`onFailoverReset` callback fires before replayed batches arrive. Use it to
clear any accumulated state:

```java
@Override
public void onFailoverReset(QwpServerInfo newNode) {
    // Clear partial results; the server will re-send from the beginning
    results.clear();
}
```

If you do not clear state, you will see overlapping data (the server
replays the full result set).

`onFailoverReset` is a mid-stream event only. It does not fire between
queries — the pool transparently replaces unhealthy query clients on
borrow.

**Terminal failure**: when all endpoints are unreachable and the failover
budget is exhausted, the error is delivered via `onError` and
`Completion.await()` rethrows `QueryException`. The pool detects the
terminal state on slot return and provisions a fresh client on the next
submit; no application-level recreate loop is required, in contrast to
direct `QwpQueryClient` usage.

### Connection events (low-level)

`SenderConnectionListener`, `SenderErrorHandler`, and
`SenderProgressHandler` are configured via the
[`Sender.builder`](#sender-low-level-primitive) — they are not yet wired
into the `QuestDB` connect-string path. Applications that need these
callbacks should use the low-level `Sender` API directly. The available
event kinds:

`CONNECTED`, `DISCONNECTED`, `RECONNECTED`, `FAILED_OVER`,
`ENDPOINT_ATTEMPT_FAILED`, `ALL_ENDPOINTS_UNREACHABLE`, `AUTH_FAILED`
(terminal), `RECONNECT_BUDGET_EXHAUSTED` (terminal).

### Error classification

- **Authentication errors** (`401`/`403`): terminal at any host. The
  reconnect loop stops immediately.
- **Role reject** (`421 + X-QuestDB-Role`): transient if the role is
  `PRIMARY_CATCHUP`, topology-level otherwise.
- **Version mismatch** at upgrade: per-endpoint, not terminal. The client
  tries the next endpoint.
- **All other errors** (TCP/TLS failures, `404`, `503`, mid-stream errors):
  transient, fed into the reconnect loop.

For the full list of connect-string keys, see the
[reconnect and failover](/docs/connect/clients/connect-string#reconnect-keys)
and
[multi-host failover](/docs/connect/clients/connect-string#failover-keys)
sections of the connect string reference.

## Concurrency

`QuestDB` is the only thread-safe handle in the library. `Sender` and
`Query` (and the underlying `QwpQueryClient`) are single-threaded:

- **Senders**: not thread-safe. Borrow one per concurrent producer, or pin
  one per thread via `db.sender()`.
- **Queries**: one in-flight query per `Query` instance.
  `db.query()` returns the per-thread cached instance — fine for one
  in-flight query per thread. For multiple concurrent in-flight queries
  on one thread, call `db.newQuery()` per submit.
- **Query pool**: caps total in-flight queries at `queryPoolMax`.

To max out parallel query throughput, raise `queryPoolMax` and submit from
as many threads as you have workers.

:::note Phase 1 limitation

A single underlying query client serves one in-flight query at a time. The
pool runs N clients in parallel, so concurrency = `queryPoolMax`. The wire
protocol allows demultiplexed concurrent queries on one client;
multi-query support per client is planned for a future release.

:::

## Low-level primitives

`QuestDB` is built on the same `Sender` and `QwpQueryClient` types you can
construct directly. Use them when you need:

- A `SenderErrorHandler`, `SenderConnectionListener`, or
  `SenderProgressHandler` registered on the sender (not yet exposed via
  the pool).
- The `Sender.builder` API for explicit advanced-TLS / endpoint
  configuration that isn't expressible in a connect string.
- A single-shot lifecycle without pooling overhead — for example, an ETL
  job that opens, ingests, and exits.

### `Sender` (low-level primitive)

```java
import io.questdb.client.Sender;

try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    sender.table("trades")
          .symbol("symbol", "ETH-USD")
          .doubleColumn("price", 2615.54)
          .atNow();
}
```

Or with the builder, for callbacks the unified config can't express:

```java
try (Sender sender = Sender.builder(Sender.Transport.WEBSOCKET)
        .address("db-primary:9000")
        .address("db-replica:9000")
        .enableTls()
        .httpToken("YOUR_BEARER_TOKEN")
        .errorHandler(error -> {
            System.err.printf("batch rejected: category=%s table=%s msg=%s%n",
                error.getCategory(), error.getTableName(),
                error.getServerMessage());
        })
        .connectionListener(event -> {
            System.out.printf("connection: %s host=%s:%d%n",
                event.getKind(), event.getHost(), event.getPort());
        })
        .progressHandler(ackedFsn -> {
            // settled watermark; see SenderProgressHandler javadoc for the
            // distinction from durable
        })
        .build()) {
    // ...
}
```

### `QwpQueryClient` (low-level primitive)

```java
import io.questdb.client.cutlass.qwp.client.QwpQueryClient;

try (QwpQueryClient client = QwpQueryClient.newPlainText("localhost", 9000)) {
    client.connect();
    client.execute(sql, handler);
}
```

This is the path the `QuestDB` facade uses internally. Direct usage gives
you explicit control over `connect()` timing, per-query `withInitialCredit`
adjustment, and removal of the pool's `Completion` wrapper layer.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common WebSocket-specific options:

| Key | Default | Description |
|-----|---------|-------------|
| `auto_flush_rows` | `1000` | Rows before auto-flush. |
| `auto_flush_interval` | `100` | Milliseconds before auto-flush. |
| `auto_flush_bytes` | disabled | Bytes before auto-flush. |
| `sf_dir` | unset | Store-and-forward directory. |
| `sender_id` | `default` | Sender slot identity for SF. |
| `request_durable_ack` | `off` | Request durable upload ACK (Enterprise). |
| `reconnect_max_duration_millis` | `300000` | Ingress reconnect budget. |
| `failover` | `on` | Egress per-query reconnect switch. |
| `compression` | `raw` | Egress batch compression (`raw`, `zstd`). |

Pool keys (parsed by the `QuestDB` facade, stripped before passing on):

| Key | Default | Description |
|-----|---------|-------------|
| `sender_pool_min` | `1` | Minimum senders kept warm. |
| `sender_pool_max` | `4` | Maximum senders. |
| `query_pool_min` | `1` | Minimum query clients kept warm. |
| `query_pool_max` | `4` | Maximum query clients. |
| `acquire_timeout_ms` | `5000` | Borrow / submit timeout. |
| `idle_timeout_ms` | `60000` | Reap idle slots after this duration. |
| `max_lifetime_ms` | `1800000` | Recycle slots older than this. |
| `housekeeper_interval_ms` | `5000` | Sweep cadence. |

## Compatible JDKs

The client relies on some JDK internal libraries, which certain specialised
JDK offerings may not support.

Known incompatible JDKs:

- Azul Zing 17 (use Azul Zulu 17 instead)

## Migration from ILP (HTTP/TCP)

If you are migrating from the ILP-based client, the row-building API is
unchanged. The main differences:

| Aspect | HTTP (ILP) | WebSocket (QWP) |
|--------|-----------|-----------------|
| Connect string schema | `http::` / `https::` | `ws::` / `wss::` |
| Auto-flush rows | 75,000 | 1,000 |
| Auto-flush interval | 1,000 ms | 100 ms |
| Error model | Synchronous (`flush()` throws) | Async (`SenderErrorHandler` callback) |
| Buffer capacity | Configurable | Not configurable (internal cursor) |
| Store-and-forward | Not available | Available (`sf_dir`) |
| Multi-endpoint failover | Limited | Full reconnect loop with backoff |
| Querying | Not available | `QuestDB.executeSql` / `QwpQueryClient` |
| Pooled facade | Not available | `QuestDB.connect(...)` |

To migrate, either:

1. Replace `Sender.fromConfig(...)` with `QuestDB.connect(...)` and use
   `db.borrowSender()` — the row-building chain is unchanged.
2. Or keep `Sender.fromConfig(...)` if you need the builder-only callbacks
   (`SenderErrorHandler`, `SenderConnectionListener`,
   `SenderProgressHandler`) and add a separate `QuestDB` or
   `QwpQueryClient` for queries.

Either way, change your connect string from `http::` to `ws::` (or
`https::` to `wss::`) to opt into the QWP path, and adjust auto-flush
settings if needed.

## Full example: ingestion and querying with failover

```java
import io.questdb.client.Completion;
import io.questdb.client.QuestDB;
import io.questdb.client.QueryException;
import io.questdb.client.Sender;
import io.questdb.client.cutlass.line.array.DoubleArray;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatch;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatchHandler;
import io.questdb.client.cutlass.qwp.client.QwpServerInfo;

import java.time.Instant;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

// One QuestDB per deployment. Holds elastic pools for both ingest and
// egress. Use try-with-resources at the application boundary; everything
// inside is allocation-free at steady state.

try (QuestDB db = QuestDB.builder()
        .fromConfig(
            "wss::addr=db-primary:9000,db-replica:9000,db-replica2:9000;"
            + "token=YOUR_BEARER_TOKEN;"
            + "failover=on;"
            + "failover_max_attempts=8;"
            + "failover_max_duration_ms=30000;")
        .senderPoolMin(2).senderPoolMax(16)
        .queryPoolMin(2).queryPoolMax(8)
        .acquireTimeoutMillis(10_000)
        .build()) {

    // ─── Ingestion ─────────────────────────────────────────────────────

    // Borrow a sender per producer task. close() flushes and returns it
    // to the pool. The pool transparently handles reconnects; the
    // failover loop drives the underlying Sender's reconnect budget.

    try (Sender sender = db.borrowSender();
         DoubleArray bids = new DoubleArray(5, 2);
         DoubleArray asks = new DoubleArray(5, 2)) {

        for (int i = 0; i < 100; i++) {
            bids.clear();
            asks.clear();
            for (int lvl = 0; lvl < 5; lvl++) {
                bids.append(1.0842 - 0.0001 * (lvl + 1));
                bids.append(100_000 + ThreadLocalRandom.current().nextInt(900_000));
                asks.append(1.0842 + 0.0001 * (lvl + 1));
                asks.append(100_000 + ThreadLocalRandom.current().nextInt(900_000));
            }
            sender.table("book")
                  .symbol("ticker", "EURUSD")
                  .doubleArray("bids", bids)
                  .doubleArray("asks", asks)
                  .at(Instant.now());
        }
        // close() (via try-with-resources) flushes pending rows.
    }

    // ─── Querying ──────────────────────────────────────────────────────

    // executeSql() is the one-shot shortcut. The pool serves the request
    // from a query worker. Mid-query failover is transparent to the
    // application; the handler's onFailoverReset() fires before replayed
    // batches arrive.

    Completion c = db.executeSql(
        "SELECT ts, ticker, bids[1][1] AS best_bid, asks[1][1] AS best_ask "
        + "FROM book ORDER BY ts DESC LIMIT 10",
        new QwpColumnBatchHandler() {
            @Override
            public void onBatch(QwpColumnBatch batch) {
                batch.forEachRow(row -> System.out.printf(
                    "ts=%s ticker=%s bid=%.5f ask=%.5f%n",
                    Instant.ofEpochMilli(row.getLongValue(0) / 1000),
                    row.getSymbol(1),
                    row.getDoubleValue(2),
                    row.getDoubleValue(3)));
            }

            @Override
            public void onEnd(long requestId, long totalRows) {
                System.out.printf("req=%d (%d rows)%n", requestId, totalRows);
            }

            @Override
            public void onError(long requestId, byte status, String message) {
                System.err.printf("query error: req=%d 0x%02X %s%n",
                    requestId, status & 0xFF, message);
            }

            @Override
            public void onFailoverReset(long requestId, QwpServerInfo newNode) {
                System.out.printf("failover req=%d to node=%s role=%s%n",
                    requestId,
                    newNode != null ? newNode.getNodeId() : "v1",
                    newNode != null ? QwpServerInfo.roleName(newNode.getRole()) : "n/a");
            }
        });

    try {
        if (!c.await(30, TimeUnit.SECONDS)) {
            c.cancel();
            c.await();
        }
    } catch (QueryException e) {
        System.err.printf("query failed: status=0x%02X %s%n",
            e.getStatus() & 0xFF, e.getMessage());
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }

    // ─── Query with bind parameters ────────────────────────────────────

    db.query()
      .sql("SELECT ts, ticker FROM book WHERE ticker = $1 LIMIT $2")
      .binds(binds -> {
          binds.setVarchar(0, "EURUSD");
          binds.setLong(1, 50L);
      })
      .handler(new QwpColumnBatchHandler() {
          @Override public void onBatch(QwpColumnBatch batch) { /* ... */ }
          @Override public void onEnd(long totalRows) { /* ... */ }
          @Override public void onError(byte status, String message) { /* ... */ }
      })
      .submit()
      .await();
}
```
