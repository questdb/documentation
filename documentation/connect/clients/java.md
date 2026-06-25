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
shared, thread-safe facade that owns connection pools for both ingress and
egress and exposes a fluent query API on top of them.

Key capabilities:

- **One handle, both directions**: `QuestDB.connect(...)` configures ingress and
  egress from a single `ws`/`wss` connect string; `db.borrowSender()` for
  ingestion, `db.query()` / `db.executeSql(...)` for SQL.
- **Pooled connections**: elastic sender and query pools that close idle connections,
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

The `QuestDB` handle is a facade over two distinct kinds of client: a
[`Sender`](#data-ingestion) for ingestion (`db.borrowSender()` /
`db.sender()`) and a [query client](#querying-with-query-and-completion) for
SQL (`db.query()` / `db.executeSql(...)`). You acquire both from the same
handle, and both speak QWP, so a single `ws` or `wss` connect string passed to
`QuestDB.connect(...)` configures both. Each client reads the connect-string
keys it owns and ignores the rest. Use
[`QuestDB.connect(ingestCfg, queryCfg)`](#separate-ingress-and-egress-configs)
or the [builder](#builder-api) when ingestion and queries need different
addresses or settings.

## The QuestDB handle

`QuestDB` is a `Closeable` handle for a QuestDB deployment: you create one,
share it across your application's threads, and close it at shutdown. It owns
a pool of each client type — [`Sender`](#data-ingestion)s for ingestion and
query clients for SQL — plus a background housekeeper thread that closes idle
and over-age connections.

| Method | Returns | Purpose |
|--------|---------|---------|
| `connect(String)` | `QuestDB` | Static factory. Single connect string for both ingress and egress (schema must be `ws`/`wss`). |
| `connect(String, String)` | `QuestDB` | Static factory. Explicit ingress + egress connect strings. |
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

The schema must be `ws` or `wss`. QuestDB ingests and queries over QWP, so the
pooled facade is WebSocket-only and rejects `http`/`https`/`tcp` and the other
legacy ILP schemas. (The low-level [`Sender`](#sender-low-level-primitive)
speaks those transports; only the `QuestDB` facade is QWP-only.)

The string is handed to both the ingress sender and the egress query client
verbatim.
Each direction reads the keys it owns and ignores keys meant only for the
other, so ingress-only and egress-only options coexist in one string:

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;"
        + "token=YOUR_TOKEN;"        // common: authenticates both directions
        + "auto_flush_rows=5000;"    // ingress-only: the query client ignores it
        + "compression=zstd;")) {    // egress-only: the sender ignores it
    // ...
}
```

`addr`, the credentials (`username`/`password` or `token`), and the `tls_*`
keys are **common** — they apply to both directions. `token` is sent as an
`Authorization: Bearer` header on both the ingress and egress WebSocket
upgrades, and `username`/`password` configure HTTP basic auth on both.

An unrecognized key fails fast at `connect()` with
`unknown configuration key: <key>`; a legacy ILP key (such as `init_buf_size`
or `retry_timeout`) is rejected with a hint pointing to the right place. For
the full key list, see the
[connect string reference](/docs/connect/clients/connect-string/).

### Separate ingress and egress configs

When ingress and egress endpoints differ — typical when reads target a
read-replica or when ingest goes through a different load balancer — pass
explicit strings:

```java
try (QuestDB db = QuestDB.connect(
        "ws::addr=ingest.cluster:9000;",
        "wss::addr=read-replica.cluster:9000;token=YOUR_TOKEN;")) {
    // ...
}
```

Both strings must use the `ws`/`wss` schema. The first follows
[`Sender.fromConfig`](#sender-low-level-primitive) format; the second follows
[`QwpQueryClient.fromConfig`](#qwpqueryclient-low-level-primitive) format.
Because the two sides share one key vocabulary, each string also accepts keys
owned by the other direction; the split just lets ingress and egress point at
different hosts or carry different tuning.

### Builder API

For pool tuning, separate configs, or any of the housekeeping knobs:

```java
try (QuestDB db = QuestDB.builder()
        .ingestConfig("ws::addr=ingest.cluster:9000;")
        .queryConfig("ws::addr=read-replica.cluster:9000;")
        .senderPoolSize(8)                // fixed size, opened up front
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
| `fromConfig(String)` | — | One `ws`/`wss` string for both sides; honors pool keys in the string. |
| `ingestConfig(String)` | — | Ingress-side `ws`/`wss` config. |
| `queryConfig(String)` | — | Egress-side `ws`/`wss` config. |
| `senderPoolMin(int)` | `1` | Senders kept open even when idle. `0` lets the pool close them all. |
| `senderPoolMax(int)` | `4` | Maximum senders the pool opens. |
| `senderPoolSize(int)` | — | Shortcut: fixed `min = max = size`, all opened up front. |
| `queryPoolMin(int)` | `1` | Query clients kept open even when idle. `0` lets the pool close them all. |
| `queryPoolMax(int)` | `4` | Maximum query clients the pool opens. |
| `queryPoolSize(int)` | — | Shortcut: fixed `min = max = size`. |
| `acquireTimeoutMillis(long)` | `5000` | How long `borrowSender()` / `Query.submit()` wait for a free connection when the pool is at `max`, before throwing. |
| `idleTimeoutMillis(long)` | `60000` | How long an unused connection stays open before the housekeeper closes it (never below `min`). `0` ⇒ keep idle connections forever. |
| `maxLifetimeMillis(long)` | `1800000` | Maximum age of a connection; the housekeeper closes and reopens older ones once idle. `0` ⇒ no age limit. |
| `housekeeperIntervalMillis(long)` | `5000` | How often the housekeeper checks for idle and over-age connections. Minimum 100ms. |

Supply the connection config with either `fromConfig(...)` or with both
`ingestConfig(...)` and `queryConfig(...)`; `build()` throws if either side is
left unset. The config strings combine last-write-wins, so an `ingestConfig(...)`
or `queryConfig(...)` call after `fromConfig(...)` overrides that one side.

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

The pool-tuning options above can also live in the connect string itself. They
belong to the facade: the `Sender` and `QwpQueryClient` parsers accept and
ignore them, while the facade reads them off the string.

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

An explicit builder setter always wins over the same key in the string,
regardless of call order. When you pass [separate ingress and egress
strings](#separate-ingress-and-egress-configs) that both carry the same pool key
with **different** values, `build()` fails — set it on one side only, or use
the builder setter.

## Authentication and TLS

QWP runs over WebSocket, so authentication uses HTTP-style credentials sent on
the WebSocket upgrade request — for both ingress and egress, before any data is
exchanged. The credential and TLS keys (`token`, `username`/`password`,
`tls_*`) are common to both directions, so a single `QuestDB.connect(...)`
string authenticates both.

### Token (Enterprise, recommended)

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;token=YOUR_BEARER_TOKEN;")) {
    // ...
}
```

The token is sent as an `Authorization: Bearer YOUR_BEARER_TOKEN` header on
both the ingress and egress WebSocket upgrades. It is mutually exclusive with
`username`/`password`.

### HTTP basic auth

```java
try (QuestDB db = QuestDB.connect(
        "wss::addr=db.example.com:9000;username=admin;password=quest;")) {
    // ...
}
```

`username`/`password` are common keys, so this authenticates both the ingress
and egress upgrades. Both halves must be present together, and they are
mutually exclusive with `token`.

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

Both pools are *elastic*. Each holds live connections — pooled senders in one,
query clients in the other. A pool keeps at least `min` connections open and
ready, opens more on demand up to `max`, and a background **housekeeper** thread
closes connections left idle too long, down to `min`.

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

`Sender.close()` on a borrowed sender flushes pending rows and returns it to
the pool for reuse — it does **not** disconnect the underlying
WebSocket. A real disconnect only happens at `QuestDB.close()` (or when the
housekeeper closes an idle connection).

:::

### Per-thread Query cache

`db.query()` returns the same `Query` instance on every call from the same
thread, reset to empty if it was in a terminal state. The associated
`Completion` is a field on that instance, so the steady-state submit path
is allocation-free.

For multiple in-flight queries from one thread, call `db.newQuery()` —
each call allocates a fresh `Query`. The query pool's `max` caps overall
concurrency (one query client per in-flight query).

### Acquire timeout

Both `db.borrowSender()` and `Query.submit()` take a connection from a pool — a
sender from the sender pool, a query client from the query pool. When every
connection is in use and the pool has already grown to `max`, the call blocks,
waiting for another caller to return one. It proceeds the moment a connection
frees up, or, if the timeout (default 5s) elapses first, gives up and throws:
`LineSenderException` from `borrowSender()`, `QueryException` from
`Query.submit()`. Raise `acquireTimeoutMillis` to ride out longer bursts, or
raise `max` to allow more concurrency.

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
     pool flushes pending rows before the sender returns for reuse.
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

Rows you build accumulate in a buffer. `flush()` hands the batch to a background
**send engine**: a buffer of unacknowledged rows plus a thread that delivers
them to the server, waits for acknowledgements, and reconnects on failure. The
engine holds every unacknowledged row until the server acks it, and replays the
held rows after a reconnect.

`flush()` returns once the rows are handed to the engine. The server's
acknowledgement arrives later, asynchronously;
[Awaiting acknowledgements](#awaiting-acknowledgements) shows how to wait for a
specific batch to be acked. Where the engine holds unacknowledged rows depends
on the mode (see [Store-and-forward](#store-and-forward)): in RAM by default, or
in memory-mapped files on disk when `sf_dir` is set.

**Auto-flush** (on by default) calls `flush()` for you when the buffer first
crosses one of these thresholds:

| Trigger      | Default  | Connect-string key    |
|--------------|----------|-----------------------|
| Row count    | 1,000    | `auto_flush_rows`     |
| Time         | 100 ms   | `auto_flush_interval` |
| Buffer bytes | disabled | `auto_flush_bytes`    |

Smaller thresholds lower latency at the cost of more, smaller batches:

```text
ws::addr=localhost:9000;auto_flush_rows=500;auto_flush_interval=50;
```

The WebSocket transport always auto-flushes; control batch size through these
thresholds.

**Explicit flush.** Call `flush()` at any point to hand the buffered rows to the
engine immediately, regardless of the auto-flush thresholds:

```java
try (Sender sender = db.borrowSender()) {
    for (Trade trade : trades) {
        sender.table("trades")
              .symbol("symbol", trade.symbol())
              .doubleColumn("price", trade.price())
              .doubleColumn("amount", trade.amount())
              .at(trade.timestamp());
    }
    sender.flush();  // hand everything to the engine now
}
```

**Backpressure.** The engine's buffer is bounded by `sf_max_total_bytes`
(default 128 MiB in memory mode, 10 GiB in store-and-forward mode). If a slow or
unreachable server lets it fill, `flush()` blocks until the server acks rows and
the engine frees space, up to `sf_append_deadline_millis` (default 30 s), then
throws, keeping the buffered rows.

**Closing.** On a sender you own, `close()` flushes buffered rows and then
*drains*: it waits for the server to acknowledge everything published, up to
`close_flush_timeout_millis` (default 60 s), before disconnecting. If the drain
times out, `close()` throws `LineSenderException` with rows still unacknowledged
— recoverable by reopening on the same `sf_dir` in store-and-forward mode, lost
in memory mode. A **pooled** sender (from `db.borrowSender()`) behaves
differently: its `close()` flushes and returns it to the pool without
disconnecting or draining, and the drain runs only when `QuestDB.close()` closes
the underlying connection. To
confirm a batch is durable before moving on, wait for its ack with
[`awaitAckedFsn`](#awaiting-acknowledgements) rather than relying on `close()`.

:::note Server-advertised batch cap

The server advertises its maximum accepted batch size on the WebSocket upgrade
(`X-QWP-Max-Batch-Size`), and the client clamps batches to it. A single row
larger than the cap, or a batch that would exceed it at flush time, surfaces as
a `LineSenderException` from the offending column call or from `flush()`.

:::

### Store-and-forward

Ingestion is asynchronous in every mode: `flush()` hands rows to the background
send engine, which delivers them and tracks the server's acknowledgements on
its own (see [Flushing](#flushing)). The `sf_dir` key changes one thing —
**where the engine keeps unacknowledged rows** — and with it, what a crash can
lose.

**Memory mode** is the default (no `sf_dir`). Unacknowledged rows live in RAM.
The engine still reconnects across transient server outages — rolling upgrades,
brief network loss — for up to `reconnect_max_duration_millis` (default 5
minutes) and replays the unacknowledged tail, so a server blip loses nothing.
But if the **sender process** dies, the RAM buffer dies with it. The buffer is
capped at 128 MiB (`sf_max_total_bytes`).

**Store-and-forward mode** turns on when you set `sf_dir`. The engine backs its
buffer with memory-mapped files under `sf_dir`, so unacknowledged rows survive a
sender **process restart**: on the next startup the engine
recovers the unacknowledged tail from disk and replays it once the server is
reachable. The on-disk buffer defaults to a 10 GiB cap.

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;
```

**Choosing an `sf_dir` layout.** An `sf_dir` is a recovery identity — a restart
recovers a run's unacknowledged rows by re-opening the same path — so keep it
stable for a given producer. Pick one of two layouts:

- **One `sf_dir` per instance** is the simplest and the common case. The default
  `sender_id` is fine. When the process restarts against the same directory, the
  pool recovers its own unacknowledged rows and delivers them once the server is
  reachable. Use this whenever a producer restarts in place — a fixed host, a pod
  with a stable volume.
- **One shared `sf_dir` across instances** suits ephemeral producers — autoscaled
  workers or rolling pods on a shared volume — where a crashed producer may never
  come back to flush its own rows. Give each instance a distinct `sender_id` so
  their directories don't collide, and set `drain_orphans=on` so a surviving
  instance picks up a crashed peer's leftover rows instead of leaving them
  stranded.

```text
# shared root: a distinct sender_id per instance, peers recover each other
ws::addr=db:9000;sf_dir=/shared/qdb-sf;sender_id=ingest-a;drain_orphans=on;
ws::addr=db:9000;sf_dir=/shared/qdb-sf;sender_id=ingest-b;drain_orphans=on;
```

**Directories and recovery.** Within an `sf_dir`, each pooled sender owns
`<sender_id>-<index>` (`ingest-a-0`, `ingest-a-1`, …), held by an exclusive OS
lock for its lifetime — two running senders never share a directory, and one
becomes adoptable only after its owner releases the lock by exiting or crashing,
so a live sender's rows are never drained from under it. On restart a pool
recovers its own directories automatically; `drain_orphans=on` extends that to
abandoned siblings under the same root, replaying their rows over fresh
connections (up to `max_background_drainers` at a time, default 4) and skipping
any directory an earlier drain flagged `.failed`. Two instances that share an
`sf_dir` with the same `sender_id` collide, and the second to start fails fast
with `sf slot already in use`. Allowed `sender_id` characters: letters, digits,
`_`, `-`.

**Durability.** Store-and-forward runs with `sf_durability=memory`, the only
supported mode. The engine relies on the OS page cache and the memory-mapped
files rather than an explicit `fsync`, so the on-disk buffer survives a JVM crash
and a process restart; rows still in the page cache at an OS crash or power loss
can be lost.

<SfDedupWarning />

A batch the server rejects outright — a schema, parse, or security error — is
terminal. It latches an error on the sender: the next call throws
`LineSenderServerException`, and the pool replaces the failed sender on the next
borrow (see [Ingestion errors](#ingestion-errors)).

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

`flush()` returns once the batch is handed to the send engine, not once the
server has acknowledged it. ACKs arrive asynchronously on the I/O loop. To
bridge between publish and acknowledgement, every published frame is assigned a
frame sequence number (FSN). `flushAndGetSequence()` returns
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

Build a query by setting its SQL and a result handler — plus bind parameters if
the SQL has any — then call `submit()` to run it:

| Method | Required | Sets |
|--------|----------|------|
| `sql(CharSequence)` | yes | The SQL text. Copied internally, so you can reuse or change your source string after `submit()`. |
| `binds(QwpBindSetter)` | no | A callback that fills in the query's `$1`, `$2`, … parameters (see [Bind parameters](#bind-parameters)). |
| `handler(QwpColumnBatchHandler)` | yes | A callback that receives the query's row batches and its outcome (see [Result handler](#result-handler)). |

- **`submit()`** sends the query and returns a [`Completion`](#completion) you
  use to wait for it. It throws if the SQL or handler is missing, or if this
  `Query`'s previous query is still running.
- **`abandon()`** clears the SQL, binds, and handler without sending anything —
  use it to back out of a query you started building.

`db.query()` returns a reusable `Query` bound to the calling thread, which runs
one query at a time. To run several at once from a single thread, call
`db.newQuery()` for each; the [query pool](#the-connection-pool) runs up to
`queryPoolMax` queries in parallel.

### `Completion`

A `Completion` tracks one submitted query until it **finishes** — succeeds (all
rows delivered, or a DDL/DML statement done), fails with a server error, or is
cancelled.

| Method | Returns | Notes |
|--------|---------|-------|
| `await()` | `void` | Blocks until the query finishes. Returns normally on success; throws `QueryException` if the server reported an error or the query was cancelled. |
| `await(long, TimeUnit)` | `boolean` | Like `await()`, but gives up after the timeout and returns `false` — the query keeps running. |
| `cancel()` | `void` | Asks the server to stop the query; safe to call more than once. The handler then sees `onError` with a cancel status, and `await()` throws `QueryException`. |
| `isDone()` | `boolean` | `true` once the query has finished — succeeded, failed, or been cancelled. |

`QueryException.getStatus()` returns the QWP status code the server sent (see
[Query error status codes](#query-errors)). `0` means the failure was
client-side — for example, the connection dropped before the server replied.

`await()` returns (or throws) only after the handler's final callback —
`onEnd`, `onError`, or `onExecDone` — has run, so whatever state that callback
set is visible by the time `await()` returns.

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
the failure on close/return and replaces the failed sender with a fresh one on
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

Failing over across multiple QuestDB hosts requires QuestDB Enterprise — the
replicas you fail over to come from Enterprise replication.

:::

A `QuestDB` handle keeps working across server restarts and network blips: the
ingestion sender and the query client each reconnect on their own. The two sides
recover a little differently, so they are covered separately below.

### Multiple endpoints

List several hosts in `addr`, comma-separated:

```text
ws::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

The client tries them in order and, when a connection drops, moves on to the
next reachable one. `addr` is shared by both sides, so ingestion and queries use
the same host list.

### Ingestion failover

Ingestion always writes to the **primary** — replicas are read-only and reject a
write connection. When you list several hosts, the sender tries them in order and
settles on whichever one is the current primary, while the replicas turn it away.
So failing over to a *different* host only helps once that host becomes the
primary — for example, after the old primary goes down and a replica is promoted
in its place. (The query-side keys `target` and `zone` don't apply to ingestion;
the sender always needs the primary.)

If the connection to the primary drops, the sender reconnects on its own, using
exponential backoff between attempts, and resumes where it left off once a
primary is reachable again. Whether unacknowledged rows survive a *sender*
failure depends on the [store-and-forward](#store-and-forward) mode: with `sf_dir`
set they are on disk and survive even a restart; without it they live in RAM and
are lost only if the sender process itself dies.

Tune the reconnect loop from the connect string:

| Key | Default | What it does |
|-----|---------|--------------|
| `reconnect_max_duration_millis` | `300000` (5 min) | How long to keep retrying one outage before giving up. |
| `reconnect_initial_backoff_millis` | `100` | Wait before the first retry. |
| `reconnect_max_backoff_millis` | `5000` | Longest wait between retries. |
| `initial_connect_retry` | `off` | Whether to retry the *first* connect too (`on`, `sync`, `async`). |

### Query failover

If a query's connection fails partway through, the query client reconnects to
another host (with exponential backoff between attempts) and re-runs the query
from the start. Because the server resends the
whole result, your handler's `onFailoverReset(...)` fires first, so you can throw
away the partial results you had collected:

```java
@Override
public void onFailoverReset(QwpServerInfo newNode) {
    results.clear();  // the server will resend from the beginning
}
```

If you don't clear, you'll see the first part of the result twice. Failover is a
mid-query event; between queries the pool simply hands you a healthy client, so
`onFailoverReset` doesn't fire there.

Tune query failover from the connect string:

| Key | Default | What it does |
|-----|---------|--------------|
| `failover` | `on` | Turn per-query failover on or off. |
| `failover_max_attempts` | `8` | Most reconnect attempts for one query. |
| `failover_backoff_initial_ms` | `50` | Wait before the first retry. |
| `failover_backoff_max_ms` | `1000` | Longest wait between retries. |
| `failover_max_duration_ms` | `30000` (30 s) | Total time budget for one query's retries. |

:::warning Failover needs at least two hosts

Failover works by trying a *different* host. With a single `addr` there is
nowhere else to go, so the query fails after one attempt no matter how high
`failover_max_attempts` is. List two or more hosts for failover to do anything.

:::

When every host is unreachable and the time or attempt budget runs out, the
query fails: your handler gets `onError` and `Completion.await()` throws
`QueryException`. You don't need to rebuild anything — the pool drops the broken
client and gives you a fresh one on your next query.

### Which failures are retried

- **Authentication failures** (a bad token or wrong credentials) stop
  immediately on every host — retrying cannot help.
- **Network and availability failures** (connection refused, TLS errors, a
  `5xx` from the server, a mid-query drop) are treated as temporary and fed into
  the reconnect and failover loops.
- **A host that turns you away because of its role** (for example, you asked for
  the primary but reached a replica) is skipped, and the client tries the next
  host.

### Connection events

The `QuestDB` facade does not expose connection callbacks. To watch connect,
disconnect, reconnect, and failover events — `CONNECTED`, `DISCONNECTED`,
`RECONNECTED`, `FAILED_OVER`, `AUTH_FAILED`, and the rest — use the low-level
[`Sender.builder`](#sender-low-level-primitive) and register a
`SenderConnectionListener`.

For the full list of connect-string keys, see the
[reconnect](/docs/connect/clients/connect-string#reconnect-keys) and
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

Pool keys (read by the `QuestDB` facade; the two clients accept and ignore them):

| Key | Default | Description |
|-----|---------|-------------|
| `sender_pool_min` | `1` | Senders kept open even when idle. |
| `sender_pool_max` | `4` | Maximum senders the pool opens. |
| `query_pool_min` | `1` | Query clients kept open even when idle. |
| `query_pool_max` | `4` | Maximum query clients the pool opens. |
| `acquire_timeout_ms` | `5000` | Wait this long for a free connection before throwing. |
| `idle_timeout_ms` | `60000` | Close a connection after it is idle this long. |
| `max_lifetime_ms` | `1800000` | Replace a connection once it reaches this age. |
| `housekeeper_interval_ms` | `5000` | How often the housekeeper checks for idle and over-age connections. |

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

// One QuestDB per deployment. Holds elastic pools for both ingress and
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
    // from a query client. Mid-query failover is transparent to the
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
                    requestId, newNode.getNodeId(),
                    QwpServerInfo.roleName(newNode.getRole()));
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
