---
title: Java client for QuestDB
sidebar_label: Java
description: "QuestDB Java client for high-throughput data ingestion and streaming SQL queries over the QWP binary protocol."
---

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

import CodeBlock from "@theme/CodeBlock"

:::note

This is the reference for the QuestDB Java client when QuestDB is used as a
server. For embedded QuestDB, see the
[Java embedded guide](/docs/ingestion/java-embedded/).

:::

The QuestDB Java client connects to QuestDB over the
[QWP binary protocol](/docs/protocols/qwp-ingress-websocket/) (WebSocket). It
supports high-throughput data ingestion and streaming SQL queries on the same
transport.

Key capabilities:

- **Ingestion**: column-oriented batched writes with automatic table creation,
  schema evolution, and optional store-and-forward durability.
- **Querying**: streaming SQL result sets, DDL/DML execution, bind parameters,
  and byte-credit flow control.
- **Failover**: multi-endpoint connections with automatic reconnect across
  rolling upgrades and primary migrations.

:::tip Legacy transports

The client also supports ILP ingestion over HTTP and TCP for backward
compatibility. This page documents the recommended WebSocket (QWP) path. For
ILP transport details, see the [ILP overview](/docs/ingestion/ilp/overview/).

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

### Ingest data

```java
import io.questdb.client.Sender;

try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
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
    sender.flush();
}
```

### Query data

```java
import io.questdb.client.cutlass.qwp.client.QwpQueryClient;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatchHandler;
import io.questdb.client.cutlass.qwp.client.QwpColumnBatch;

try (QwpQueryClient client = QwpQueryClient.newPlainText("localhost", 9000)) {
    client.connect();
    client.execute(
        "SELECT ts, sym, price, qty FROM trades WHERE sym = 'ETH-USD' LIMIT 10",
        new QwpColumnBatchHandler() {
            @Override
            public void onBatch(QwpColumnBatch batch) {
                batch.forEachRow(row -> System.out.printf(
                    "ts=%d sym=%s price=%.4f qty=%d%n",
                    row.getLongValue(0),
                    row.getSymbol(1),
                    row.getDoubleValue(2),
                    row.getLongValue(3)
                ));
            }

            @Override
            public void onEnd(long totalRows) {
                System.out.println("done: " + totalRows + " rows");
            }

            @Override
            public void onError(byte status, String message) {
                System.err.println("query failed: " + message);
            }
        }
    );
}
```

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade, before
any binary frames are exchanged. The same mechanisms work for both `Sender`
(ingestion) and `QwpQueryClient` (querying).

### HTTP basic auth

```java
// Ingestion
try (Sender sender = Sender.fromConfig(
        "wss::addr=db.example.com:9000;username=admin;password=quest;")) {
    // ...
}

// Querying
try (QwpQueryClient client = QwpQueryClient.fromConfig(
        "wss::addr=db.example.com:9000;username=admin;password=quest;")) {
    client.connect();
    // ...
}
```

### Token auth (Enterprise)

```java
try (Sender sender = Sender.fromConfig(
        "wss::addr=db.example.com:9000;token=your_bearer_token;")) {
    // ...
}
```

### TLS with custom trust store

```java
try (Sender sender = Sender.fromConfig(
        "wss::addr=db.example.com:9000;tls_roots=/path/to/truststore.jks;tls_roots_password=changeit;")) {
    // ...
}
```

For OIDC authentication (Enterprise), see
[OpenID Connect](/docs/security/oidc/).

## Creating the client

### From a connect string

The connect string format is `<schema>::<key>=<value>;<key>=<value>;...;`

For ingestion, use `ws` (plain) or `wss` (TLS):

```java
try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    // ...
}
```

For querying:

```java
try (QwpQueryClient client = QwpQueryClient.fromConfig("ws::addr=localhost:9000;")) {
    client.connect();
    // ...
}
```

For the full list of connect-string keys, see the
[connect string reference](/docs/client-configuration/connect-string/).

### From an environment variable

Set `QDB_CLIENT_CONF` to avoid hard-coding credentials:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;username=admin;password=quest;"
```

```java
try (Sender sender = Sender.fromEnv()) {
    // ...
}
```

### Using the builder API

The builder provides type-safe configuration:

```java
try (Sender sender = Sender.builder(Sender.Transport.WEBSOCKET)
        .address("localhost:9000")
        .autoFlushRows(500)
        .autoFlushIntervalMillis(50)
        .build()) {
    // ...
}
```

For `QwpQueryClient`, use the factory methods or configure post-construction:

```java
try (QwpQueryClient client = QwpQueryClient.newPlainText("localhost", 9000)) {
    client.withInitialCredit(256 * 1024);
    client.connect();
    // ...
}
```

## Data ingestion

### General usage pattern

1. Create a `Sender` via `Sender.fromConfig()` or the builder.
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
   - `doubleArray(name, ...)` (see [Ingest arrays](#ingest-arrays))

   The server also accepts GEOHASH and DATE on ingress, but the Java client
   does not yet expose sender methods for them. IPv4 and BINARY are not
   supported for ingestion on either the client or the server. All types are
   readable on the [egress side](#reading-result-batches).

5. Call `at(Instant)`, `at(long, ChronoUnit)`, or `atNow()` to finalize the row.
6. Repeat from step 2, or call `flush()` to send buffered data.
7. Call `close()` when done (or use try-with-resources).

```java
try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    sender.table("trades")
          .symbol("symbol", "EURUSD")
          .symbol("side", "buy")
          .doubleColumn("price", 1.0842)
          .longColumn("quantity", 100_000)
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

try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;");
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
appended in row-major order: the last dimension varies fastest. For a 2D array
with shape `(3, 2)`, `append()` fills positions `[0,0], [0,1], [1,0], [1,1],
[2,0], [2,1]`. You can also use `set(value, i, j, ...)` to write at specific
coordinates. Call `reshape(d1, d2, ...)` to change the shape without
reallocating.

:::note
Arrays require QuestDB 9.0.0 or later.
:::

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

:::caution
Decimal values require QuestDB 9.2.0 or later. Create decimal columns ahead
of time with `DECIMAL(precision, scale)` so QuestDB ingests values with the
expected precision. See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page for details.
:::

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
try (Sender sender = Sender.fromConfig("ws::addr=localhost:9000;")) {
    for (Trade trade : trades) {
        sender.table("trades")
              .symbol("symbol", trade.symbol())
              .doubleColumn("price", trade.price())
              .longColumn("quantity", trade.quantity())
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

The client also flushes when closed. However, if the flush fails at close
time, the client does not retry. Always flush explicitly before closing.

### Store-and-forward

With store-and-forward enabled, unacknowledged data is persisted to disk and
replayed after reconnection, surviving sender process restarts.

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;sender_id=ingest-1;
```

Without `sf_dir`, unacknowledged data lives in process memory and is lost if
the sender process dies. The reconnect loop still spans transient server
outages (rolling upgrades), but the RAM buffer caps how much data can
accumulate.

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

## Querying and SQL execution

The `QwpQueryClient` sends SQL statements over the
[QWP egress](/docs/protocols/qwp-egress-websocket/) endpoint (`/read/v1`).
Results arrive as columnar batches via a callback handler.

`execute()` is **blocking**: it sends the query, drives the WebSocket receive
loop on the calling thread, invokes the handler callbacks (`onBatch`,
`onEnd`, `onError`, or `onExecDone`), and returns only after the query
completes. This means you can safely sequence operations:

```java
client.execute("CREATE TABLE t (...) ...", ddlHandler);
// Table exists by this point
client.execute("INSERT INTO t VALUES ...", dmlHandler);
// Data is committed by this point
client.execute("SELECT * FROM t", selectHandler);
// Results have been fully consumed by this point
```

### Executing SELECT queries

```java
try (QwpQueryClient client = QwpQueryClient.newPlainText("localhost", 9000)) {
    client.connect();
    client.execute(
        "SELECT ts, sym, price FROM trades WHERE sym = 'EURUSD' LIMIT 100",
        new QwpColumnBatchHandler() {
            @Override
            public void onBatch(QwpColumnBatch batch) {
                for (int row = 0; row < batch.getRowCount(); row++) {
                    long ts = batch.getLongValue(0, row);
                    String sym = batch.getSymbol(1, row);
                    double price = batch.getDoubleValue(2, row);
                    // process row...
                }
            }

            @Override
            public void onEnd(long totalRows) { }

            @Override
            public void onError(byte status, String message) {
                System.err.printf("error: 0x%02X %s%n", status & 0xFF, message);
            }
        }
    );
}
```

The `QwpColumnBatch` object is valid only during the `onBatch` callback. Copy
values out if you need them after the callback returns.

**Convenience accessors**: `batch.forEachRow(row -> ...)` provides a
`RowView` with single-argument accessors (`row.getLongValue(col)`,
`row.getSymbol(col)`, etc.) for compact read paths.

**Null checking**: call `batch.isNull(col, row)` before reading a value.

### Reading result batches

`QwpColumnBatch` provides typed accessors for all QuestDB column types:

| Accessor | Column types |
|----------|-------------|
| `getBoolValue(col, row)` | BOOLEAN |
| `getByteValue(col, row)` | BYTE |
| `getShortValue(col, row)` | SHORT |
| `getCharValue(col, row)` | CHAR |
| `getIntValue(col, row)` | INT, IPv4 |
| `getLongValue(col, row)` | LONG, TIMESTAMP, `timestamp_ns`, DATE |
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
| `getLong256(col, row, Long256Sink)` | LONG256 (into sink) |
| `getLong256Word(col, row, wordIndex)` | LONG256 (individual 64-bit word) |
| `getGeohashValue(col, row)` | GEOHASH (raw long value) |
| `getGeohashPrecisionBits(col)` | GEOHASH (precision metadata, per column) |
| `getDecimal128High(col, row)` / `getDecimal128Low(col, row)` | DECIMAL128 (two longs) |
| `getDecimalScale(col)` | DECIMAL (scale metadata, per column) |
| `getDoubleArrayElements(col, row)` | DOUBLE_ARRAY (flattened `double[]`, row-major) |
| `getArrayNDims(col, row)` | DOUBLE_ARRAY (dimension count) |
| `isNull(col, row)` | All types |

Column metadata is available via `batch.getColumnName(col)`,
`batch.getColumnWireType(col)`, and `batch.getColumnCount()`.

**Reading array columns:**

`getDoubleArrayElements(col, row)` returns a flattened `double[]` in row-major
order. Use `getArrayNDims(col, row)` to discover the dimensionality. For
example, reading a 2D `DOUBLE[][]` column:

```java
int nDims = batch.getArrayNDims(colIndex, row);  // e.g. 2
double[] flat = batch.getDoubleArrayElements(colIndex, row);
// flat contains all elements in row-major order
```

Alternatively, you can extract individual elements in SQL (e.g.,
`SELECT bids[1][1] FROM market_data`) and read them as scalar doubles.

### DDL and DML statements

Non-SELECT statements (CREATE TABLE, INSERT, UPDATE, ALTER, DROP, TRUNCATE)
are executed through the same `execute()` method. The server responds with
`EXEC_DONE` instead of result batches:

```java
client.execute(
    "CREATE TABLE trades ("
    + "ts TIMESTAMP, sym SYMBOL, price DOUBLE, qty LONG"
    + ") TIMESTAMP(ts) PARTITION BY DAY WAL",
    new QwpColumnBatchHandler() {
        @Override
        public void onBatch(QwpColumnBatch batch) { }

        @Override
        public void onEnd(long totalRows) { }

        @Override
        public void onError(byte status, String message) {
            System.err.println("failed: " + message);
        }

        @Override
        public void onExecDone(short opType, long rowsAffected) {
            System.out.printf("done: opType=%d rows=%d%n", opType, rowsAffected);
        }
    }
);
```

`rowsAffected` reports the count for INSERT/UPDATE/DELETE. Pure DDL (CREATE,
DROP, ALTER, TRUNCATE) reports 0.

### Bind parameters

Parameterized queries use typed bind values, avoiding SQL injection and
enabling server-side factory cache reuse across repeated calls:

```java
String sql = "SELECT ts, sym, price, qty FROM trades "
    + "WHERE sym = $1 AND price >= $2 LIMIT 1000";

for (String symbol : List.of("EURUSD", "GBPUSD", "USDJPY")) {
    client.execute(
        sql,
        binds -> binds
            .setVarchar(0, symbol)
            .setDouble(1, 1.0),
        handler
    );
}
```

Bind indices are 0-based (`$1` maps to index 0). Available setters include
`setBoolean`, `setByte`, `setShort`, `setInt`, `setLong`, `setFloat`,
`setDouble`, `setString`, `setVarchar`, `setTimestampMicros`, `setDate`,
`setUuid`, `setDecimal64/128/256`, `setSymbol`, `setNull`, and more.

To pass a NULL bind value:

```java
binds -> binds.setNull(0)
```

:::note Server leniency

The current server accepts a SYMBOL wire type for bind parameters and treats
it as VARCHAR. Compliant clients should send VARCHAR. A future revision may
reject SYMBOL bind type codes.

:::

### Flow control

For large result sets, byte-credit flow control prevents the server from
overwhelming the client:

```java
try (QwpQueryClient client = QwpQueryClient.newPlainText("localhost", 9000)
        .withInitialCredit(256 * 1024)) {
    client.connect();
    // Server pauses after streaming ~256 KiB, auto-replenishes after each batch
}
```

A credit of `0` (the default) means unbounded: the server streams as fast as
the network allows.

### Compression

Negotiate zstd compression to reduce network bandwidth for large result sets:

```java
try (QwpQueryClient client = QwpQueryClient.fromConfig(
        "ws::addr=localhost:9000;compression=zstd;compression_level=3;")) {
    client.connect();
    // Batches are automatically decompressed
}
```

## Error handling

### Ingestion errors

WebSocket ingestion uses an asynchronous error model. Batch rejections are
delivered via the `SenderErrorHandler` callback, not thrown from `flush()`:

```java
try (Sender sender = Sender.builder(Sender.Transport.WEBSOCKET)
        .address("localhost:9000")
        .errorHandler(error -> {
            System.err.printf("batch rejected: category=%s table=%s msg=%s%n",
                error.getCategory(), error.getTableName(), error.getServerMessage());
        })
        .build()) {
    // ...
}
```

Each `SenderError` carries:

- **Category**: `SCHEMA_MISMATCH`, `PARSE_ERROR`, `INTERNAL_ERROR`,
  `SECURITY_ERROR`, `WRITE_ERROR`, `PROTOCOL_VIOLATION`, or `UNKNOWN`.
- **Policy**: `DROP_AND_CONTINUE` (batch dropped, sender continues) or `HALT`
  (sender halted, next API call throws `LineSenderServerException`).
- **Server message**: human-readable error text.
- **Table name**: the rejected table (null for multi-table batches).

The error handler runs on a dedicated dispatcher thread, never on the I/O or
producer thread.

**Recovery after errors**: call `reset()` to clear buffers and continue with
fresh data. On WebSocket, `reset()` does not recover from terminal failures
(auth failure, reconnect budget exhaustion). In those cases, close the sender
and create a new one.

### Query errors

Query errors arrive via the `onError` callback:

```java
@Override
public void onError(byte status, String message) {
    System.err.printf("query failed: 0x%02X %s%n", status & 0xFF, message);
}
```

Status codes:

| Code   | Name            | Description                                       |
|--------|-----------------|---------------------------------------------------|
| `0x03` | SCHEMA_MISMATCH | Bind parameter type incompatible with placeholder |
| `0x05` | PARSE_ERROR     | SQL syntax error or malformed message             |
| `0x06` | INTERNAL_ERROR  | Server-side execution failure                     |
| `0x08` | SECURITY_ERROR  | Authorization failure                             |
| `0x0A` | CANCELLED       | Query terminated by CANCEL                        |
| `0x0B` | LIMIT_EXCEEDED  | Protocol limit hit                                |

Errors can arrive before any data (parse failure) or mid-stream (storage
failure, server shutdown). When `onError` is called, no further frames arrive
for that query.

### Connection-level errors

- **Authentication failure**: `401`/`403` HTTP response before the WebSocket
  upgrade completes. Terminal across all endpoints.
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
to find the next healthy endpoint.

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
restarts. Without it, unacknowledged data lives in process memory and is lost
if the sender process dies.

### Query failover

The query client drives a per-query reconnect loop. When a transport error
occurs mid-stream, the client reconnects and replays the query. `batch_seq`
restarts at 0 on the new connection.

Key connect-string options:

| Key                           | Default | Description                               |
|-------------------------------|---------|-------------------------------------------|
| `failover`                    | `on`    | Master switch for per-query reconnect.    |
| `failover_max_attempts`       | `8`     | Max reconnect attempts per query.         |
| `failover_backoff_initial_ms` | `50`    | First post-failure sleep.                 |
| `failover_backoff_max_ms`     | `1000`  | Cap on per-attempt sleep.                 |
| `failover_max_duration_ms`    | `30000` | Total wall-clock budget per query.        |

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

If you do not clear state, you will see overlapping data (the server replays
the full result set).

### Connection events

For ingestion, register a `SenderConnectionListener` to observe connection
state transitions:

```java
Sender sender = Sender.builder(Sender.Transport.WEBSOCKET)
    .address("db-primary:9000")
    .address("db-replica:9000")
    .connectionListener(event -> {
        System.out.printf("%s host=%s:%d%n",
            event.getKind(), event.getHost(), event.getPort());
    })
    .build();
```

Event kinds: `CONNECTED`, `DISCONNECTED`, `RECONNECTED`, `FAILED_OVER`,
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
[reconnect and failover](/docs/client-configuration/connect-string#reconnect-keys)
and
[multi-host failover](/docs/client-configuration/connect-string#failover-keys)
sections of the connect string reference.

## Parallel queries

:::note Phase 1 limitation

The current implementation supports a single in-flight query per connection.
The wire protocol allows multiple concurrent queries (demultiplexed by
request ID); multi-query support is planned for a future release.

:::

To run queries in parallel, create separate `QwpQueryClient` instances. Each
instance manages its own WebSocket connection.

Neither `Sender` nor `QwpQueryClient` is thread-safe. For multi-threaded
workloads, use one instance per thread or use an object pool.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/client-configuration/connect-string/).

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

## Compatible JDKs

The client relies on some JDK internal libraries, which certain specialised JDK
offerings may not support.

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
| Querying | Not available | `QwpQueryClient` |

To migrate, change your connect string from `http::` to `ws::` (or `https::`
to `wss::`), register a `SenderErrorHandler` for async error handling, and
adjust auto-flush settings if needed.
