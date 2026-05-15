---
slug: /connect/clients/go
title: Go client for QuestDB
sidebar_label: Go
description:
  "QuestDB Go client for high-throughput data ingestion and streaming SQL
  queries over the QWP binary protocol."
---

import { RemoteRepoExample } from "@theme/RemoteRepoExample"

The QuestDB Go client connects to QuestDB over the
[QWP binary protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
(WebSocket). It supports high-throughput data ingestion and streaming SQL
queries on the same transport.

Key capabilities:

- **Ingestion**: column-oriented batched writes with automatic table creation,
  schema evolution, and optional store-and-forward durability.
- **Querying**: streaming SQL result sets, DDL and DML execution, bind
  parameters, and byte-credit flow control.
- **Failover**: multi-endpoint connections with automatic reconnect across
  rolling upgrades and primary migrations.

:::tip Legacy transports

The client also supports ILP ingestion over HTTP and TCP for backward
compatibility. This page documents the recommended WebSocket (QWP) path. For
ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

## Quick start

The client requires Go 1.23 or later. Add it to your module:

```bash
go get github.com/questdb/go-questdb-client/v4
```

### Ingest data

```go
package main

import (
	"context"

	qdb "github.com/questdb/go-questdb-client/v4"
)

func main() {
	ctx := context.TODO()

	sender, err := qdb.LineSenderFromConf(ctx, "ws::addr=localhost:9000;")
	if err != nil {
		panic(err)
	}
	defer sender.Close(ctx)

	err = sender.Table("trades").
		Symbol("symbol", "ETH-USD").
		Symbol("side", "sell").
		Float64Column("price", 2615.54).
		Float64Column("amount", 0.00044).
		AtNow(ctx)
	if err != nil {
		panic(err)
	}

	if err := sender.Flush(ctx); err != nil {
		panic(err)
	}
}
```

### Query data

```go
package main

import (
	"context"
	"fmt"

	qdb "github.com/questdb/go-questdb-client/v4"
)

func main() {
	ctx := context.TODO()

	client, err := qdb.NewQwpQueryClient(ctx,
		qdb.WithQwpQueryAddress("localhost:9000"))
	if err != nil {
		panic(err)
	}
	defer client.Close(ctx)

	q := client.Query(ctx,
		"SELECT symbol, price FROM trades WHERE symbol = 'ETH-USD' LIMIT 10")
	defer q.Close()

	for batch, err := range q.Batches() {
		if err != nil {
			panic(err)
		}
		for row := 0; row < batch.RowCount(); row++ {
			fmt.Println(batch.String(0, row), batch.Float64(1, row))
		}
	}
}
```

:::caution Read before building on these snippets

The two snippets above are deliberately minimal. Three behaviors will cause
data loss, corruption, or panics if you carry the minimal form into real code:

- **Ingestion errors are asynchronous.** `Flush` returning `nil` does **not**
  mean the server accepted the rows. Schema, parse, and write rejections are
  delivered out of band. Register an error handler. See
  [Ingestion errors](#ingestion-errors).
- **A sender or query client is not safe for concurrent use.** Use one per
  goroutine. See [Concurrency](#concurrency).
- **A query batch is valid only inside its loop iteration.** Some accessors
  alias the network buffer. Copy out anything you keep. See
  [Reading result batches](#reading-result-batches).

Building with multi-host failover? It adds exactly three rules on top of the
single-host code, listed up front in
[Failover and high availability](#failover-and-high-availability). Single-host
applications can ignore them.

:::

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade, before
any binary frames are exchanged. The same mechanisms work for both the
`LineSender` (ingestion) and the `QwpQueryClient` (querying).

### HTTP basic auth

```go
// Ingestion
sender, err := qdb.LineSenderFromConf(ctx,
	"wss::addr=db.example.com:9000;username=admin;password=quest;")

// Querying
client, err := qdb.QwpQueryClientFromConf(ctx,
	"wss::addr=db.example.com:9000;username=admin;password=quest;")
```

The options API exposes the same settings:

```go
sender, err := qdb.NewLineSender(ctx,
	qdb.WithQwp(),
	qdb.WithAddress("db.example.com:9000"),
	qdb.WithTls(),
	qdb.WithBasicAuth("admin", "quest"))
```

### Token auth (Enterprise)

```go
sender, err := qdb.LineSenderFromConf(ctx,
	"wss::addr=db.example.com:9000;token=your_bearer_token;")

client, err := qdb.NewQwpQueryClient(ctx,
	qdb.WithQwpQueryAddress("db.example.com:9000"),
	qdb.WithQwpQueryTls(),
	qdb.WithQwpQueryBearerToken("your_bearer_token"))
```

The client takes a **static** bearer token; it does not acquire or refresh
OIDC tokens. With [OpenID Connect](/docs/security/oidc/), the application
obtains the access token from the identity provider and is responsible for
rotating it before it expires. An expired or revoked token is not refreshed
in place: the next connect or reconnect fails with a `SECURITY_ERROR` (or a
`401`/`403` on the WebSocket upgrade — terminal across all endpoints). To
rotate, construct a new sender or client with the fresh token.

### Production example (TLS + auth + multi-host)

The realistic Enterprise shape combines `wss`, credentials, and a multi-host
`addr` list in a single connect string:

```go
sender, err := qdb.LineSenderFromConf(ctx,
	"wss::addr=db-1.example.com:9000,db-2.example.com:9000;"+
		"username=ingest;password=secret;")

client, err := qdb.QwpQueryClientFromConf(ctx,
	"wss::addr=db-1.example.com:9000,db-2.example.com:9000;"+
		"token=your_bearer_token;target=replica;")
```

### TLS trust store and mTLS

TLS is enabled by the `wss` schema (or `qdb.WithTls()`). The Go client
verifies the server certificate against the **operating-system trust
store**. It does **not** support a custom trust store: the `tls_roots` /
`tls_roots_password` connect-string keys (a Java-keystore feature) are
rejected by the Go connect-string parser. To trust a private CA, install it
in the host trust store. Mutual TLS (client certificates) is **not
supported** by this client — authenticate with a bearer token or basic auth
over `wss` instead. For test-only certificate-verification bypass, see
`tls_verify` in the
[TLS section](/docs/connect/clients/connect-string#tls) of the connect
string reference.

## Creating the client

### From a connect string

The connect string format is `<schema>::<key>=<value>;<key>=<value>;...;`. Use
`ws` for plain WebSocket or `wss` for TLS:

```go
sender, err := qdb.LineSenderFromConf(ctx, "ws::addr=localhost:9000;")

client, err := qdb.QwpQueryClientFromConf(ctx, "ws::addr=localhost:9000;")
```

For the full list of connect-string keys, see the
[connect string reference](/docs/connect/clients/connect-string/).

### From an environment variable

Set `QDB_CLIENT_CONF` to avoid hard-coding credentials:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;username=admin;password=quest;"
```

```go
sender, err := qdb.LineSenderFromEnv(ctx)
```

### Using the options API

The options API provides type-safe configuration. `NewLineSender` requires
exactly one transport option (`qdb.WithQwp()` here);
`LineSenderFromConf` infers the transport from the `ws`/`wss` schema instead.
An error handler can only be set through the options API:

```go
sender, err := qdb.NewLineSender(ctx,
	qdb.WithQwp(),
	qdb.WithAddress("localhost:9000"),
	qdb.WithAutoFlushRows(500),
	qdb.WithAutoFlushInterval(50*time.Millisecond),
	qdb.WithErrorHandler(func(e *qdb.SenderError) { /* see Error handling */ }))

client, err := qdb.NewQwpQueryClient(ctx,
	qdb.WithQwpQueryAddress("localhost:9000"),
	qdb.WithQwpQueryInitialCredit(256*1024))
```

## Data ingestion

### Concurrency

A `LineSender` owns a single connection and is **not safe for concurrent
use**. Sharing one across goroutines corrupts the buffer and interleaves
rows. Create one sender per goroutine, or hand rows to a single dedicated
writer goroutine through a channel.

Connection pooling (`LineSenderPool`) targets the stateless HTTP transport and
is not available for QWP, so it is not the answer to QWP concurrency.

### General usage pattern

1. Create a sender via `qdb.LineSenderFromConf()` or `qdb.NewLineSender()`.
2. Call `Table(name)` to select a table.
3. Call column methods to add values:
   - `Symbol(name, value)`
   - `StringColumn(name, value)`, `BoolColumn(name, value)`
   - `Int64Column(name, value)`, `Float64Column(name, value)`
   - `TimestampColumn(name, time.Time)` for non-designated timestamps
   - `Long256Column(name, *big.Int)`
   - `Float64Array1DColumn` / `2D` / `3D` / `NDColumn` (see
     [Ingest arrays](#ingest-arrays))
   - `DecimalColumn`, `DecimalColumnFromString` (see
     [Decimal columns](#decimal-columns))
4. Call `At(ctx, time.Time)` or `AtNow(ctx)` to finalize the row.
5. Repeat from step 2, or call `Flush(ctx)` to send buffered data.
6. Call `Close(ctx)` when done.

The call order is fixed: `Table`, then `Symbol`s, then column setters, then
`At`/`AtNow`. The fluent methods do not return errors; the first error is
latched and surfaces from `At`, `AtNow`, or `Flush`, so always check that
return value.

:::caution The error from `At`/`AtNow`/`Flush` is only the local error

It reports a client-side problem: a bad value, wrong call order, or
store-and-forward backpressure. Server-side rejections (schema mismatch,
parse error, write error) are **asynchronous** and are delivered to the
error handler, never returned here. A `nil` return does not mean the server
accepted the data. See [Ingestion errors](#ingestion-errors).

:::

Tables and columns are created automatically if they do not exist. The full
runnable example registers an error handler, the minimum correct shape for a
QWP producer:

<RemoteRepoExample name="qwp-ingest" lang="go" header={false} />

The QWP transport exposes column types that are not part of ILP. Type-assert
the sender to `qdb.QwpSender` with the comma-ok form (only `ws`/`wss` senders
implement it; an HTTP or TCP sender does not):

```go
sender, err := qdb.LineSenderFromConf(ctx, "ws::addr=localhost:9000;")
qs, ok := sender.(qdb.QwpSender)
if !ok {
	panic("not a QWP sender")
}

err = qs.Table("trades").
	Symbol("symbol", "ETH-USD").
	Int32Column("venue_id", 7).
	CharColumn("side", 'S').
	UuidColumn("order_id", hi, lo).
	AtNano(ctx, time.Now())
```

`QwpSender` adds `ByteColumn`, `ShortColumn`, `Int32Column`, `Float32Column`,
`CharColumn`, `DateColumn`, `TimestampNanosColumn`, `UuidColumn`,
`GeohashColumn`, `Int64Array1DColumn` / `2D` / `3D`, the decimal columns, and
`AtNano` for nanosecond designated timestamps.

### Null values

The client has no null setter. To store a null for a column in a given row,
omit that column's setter before `At`/`AtNow`/`AtNano`. On row commit, every
column not set in the row is gap-filled with a null, so omitting a column and
writing an "explicit null" are the same operation.

The buffered column set is the union across the batch: a column first used on
a later row is backfilled with null for every earlier row still in the send
buffer.

### Ingest arrays

For 1D, 2D, and 3D `double` arrays, pass a Go slice directly:

```go
prices := []float64{1.0842, 1.0843, 1.0841}
err = sender.Table("book").Float64Array1DColumn("levels", prices).AtNow(ctx)
```

For higher-dimensional arrays, build an `NdArray` once and reuse it:

```go
arr, err := qdb.NewNDArray[float64](3, 3, 3)
if err != nil {
	panic(err)
}
arr.Fill(1.5)
err = sender.Table("book").Float64ArrayNDColumn("cube", arr).AtNow(ctx)
```

Values are stored in row-major order: the last dimension varies fastest. Use
`Set(value, positions...)` to write at specific coordinates, `Append(value)`
for sequential fills, and `Reshape(shape...)` to change the shape without
reallocating.

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) column
controls time-based partitioning and ordering:

```go
// User-assigned (recommended for deduplication and exactly-once delivery)
err = sender.Table("trades").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842).
	At(ctx, time.Now())

// Nanosecond precision (creates a timestamp_ns column); QwpSender only
err = qs.Table("ticks").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842).
	AtNano(ctx, time.Now())

// Server-assigned (server uses its wall-clock time)
err = sender.Table("trades").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842).
	AtNow(ctx)
```

:::caution
A table's designated timestamp resolution is fixed by its first row. Mixing
`At` (microseconds) and `AtNano` (nanoseconds) on rows of the same table
within one flush returns a type-conflict error. Pick one resolution per
table.
:::

:::note
QuestDB works best when data arrives in chronological order, sorted by
timestamp.
:::

### Decimal columns

:::caution
Decimal values require QuestDB 9.2.0 or later. Create decimal columns ahead of
time with `DECIMAL(precision, scale)` so QuestDB ingests values with the
expected precision. See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page for details.
:::

Construct a `qdb.Decimal` from an `int64`, a `*big.Int`, or a raw two's
complement big-endian payload:

```go
price := qdb.NewDecimalFromInt64(12345, 2) // 123.45, scale 2
commission, err := qdb.NewDecimal(big.NewInt(-750), 4)
if err != nil {
	panic(err)
}

err = qs.Table("trade_fees").
	Symbol("symbol", "ETH-USD").
	Decimal128Column("settled_price", price).
	Decimal128Column("commission", commission).
	AtNow(ctx)
```

`DecimalColumn` serializes a 256-bit value, while `Decimal64Column`,
`Decimal128Column`, and `Decimal256Column` (on `QwpSender`) target the matching
column width. `DecimalColumnFromString` lets the server parse a validated
literal, and `DecimalColumnShopspring` accepts
[github.com/shopspring/decimal](https://github.com/shopspring/decimal) values.

### Flushing

The client accumulates rows in an internal buffer and sends them in batches.

Auto-flush (default) flushes when either threshold is reached:

| Trigger   | WebSocket default | HTTP default |
| --------- | ----------------- | ------------ |
| Row count | 1,000 rows        | 75,000 rows  |
| Time      | 100 ms            | 1,000 ms     |

Customize via the connect string or the options API:

```text
ws::addr=localhost:9000;auto_flush_rows=500;auto_flush_interval=50;
```

`Flush(ctx)` sends buffered data immediately. On QWP it is a synchronous
barrier: it returns after the server has acknowledged the flushed frames.
Write many rows per `Flush`; calling it after every row collapses throughput.

:::caution
If you disable auto-flush (`auto_flush=off` or `qdb.WithAutoFlushDisabled()`),
nothing is sent until you call `Flush` yourself. `Close` does a final flush,
but it is best-effort, bounded by `close_flush_timeout_millis`, and not
retried on failure. An app that disables auto-flush and never calls `Flush`
loses everything it buffered.
:::

`QwpSender.FlushAndGetSequence(ctx)` returns the published frame sequence
number (FSN), and `AwaitAckedFsn(ctx, target)` blocks until the server has
acknowledged up to a given FSN. Use the FSN to correlate a publish with any
later `SenderError`.

### Store-and-forward

With store-and-forward enabled, unacknowledged data is persisted to disk and
replayed after reconnection, surviving sender process restarts:

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;sender_id=ingest-1;
```

Without `sf_dir`, unacknowledged data lives in process memory and is lost if
the sender process dies. The reconnect loop still spans transient server
outages, but the RAM buffer caps how much data can accumulate.

:::caution Replay is at-least-once — enable DEDUP

After a reconnect or a sender restart, the client replays frames the server
may have accepted but not yet acknowledged. Without
[DEDUP](/docs/concepts/deduplication/) on the target table, replay produces
duplicate rows. Tables ingested over a reconnecting or multi-host connection
**must** declare `DEDUP UPSERT KEYS(...)` covering row identity. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the full
at-least-once / exactly-once model.

:::

:::caution Store-and-forward changes how `At` and errors behave

- **`At`/`AtNow`/`Flush` can block.** When the on-disk buffer hits its cap,
  the producer blocks until the wire path drains it, then returns a deadline
  error (`sf_append_deadline_millis`) if it does not drain in time. Treat a
  blocking `At` as a signal that the server is unreachable or slow, not as a
  reason to retry in a tight loop.
- **Terminal rejections halt the sender.** A schema, parse, or security
  rejection latches a terminal error. The next producer call returns it as a
  typed `*SenderError`; the sender will not drain further. You must `Close`
  and create a new sender to continue.

:::

For concepts, sizing, and recovery, see
[store-and-forward](/docs/high-availability/store-and-forward/concepts/) and the
[store-and-forward keys](/docs/connect/clients/connect-string#sf-keys) of the
connect string reference.

### Durable acknowledgement

:::note Enterprise
Durable acknowledgement requires QuestDB Enterprise with primary replication
configured.
:::

By default, the server confirms a batch when it is committed to the local
[WAL](/docs/concepts/write-ahead-log/). Durable acknowledgement instead waits
until the batch has been durably uploaded to object storage. See the
[durable ACK keys](/docs/connect/clients/connect-string#durable-ack).

:::caution Not yet implemented in the Go client

Durable-ack mode is a deferred follow-up in this client. Passing
`request_durable_ack=on;` (or `=true`) in the connect string is **rejected at
construction** with an `InvalidConfigStr` error; the only accepted value
today is `request_durable_ack=off` (the default). Until the feature ships,
the sender confirms on the transport-level OK ACK and ignores
`STATUS_DURABLE_ACK` frames.

:::

## Querying and SQL execution

The `QwpQueryClient` sends SQL statements over the
[QWP egress](/docs/connect/wire-protocols/qwp-egress-websocket/) endpoint.
`Query` returns a streaming cursor for SELECT statements; `Exec` runs DDL and
DML and returns an `ExecResult`. Both block until the statement completes, so
you can sequence operations safely:

<RemoteRepoExample name="qwp-query" lang="go" header={false} />

A `QwpQueryClient` is **not safe for concurrent `Query` or `Exec` calls**, and
it runs **one query at a time** (the protocol is single-in-flight in this
release). Use one client per query-issuing goroutine. `Cancel` (on a
`*QwpQuery`) and `Close` are safe to call from other goroutines. A `*QwpQuery`
is single-use: once its `Batches()` range ends, do not iterate it again.

Results stream as a sequence of batches. Process each batch as it arrives
rather than collecting an entire large result set in memory. For big result
sets, bound how fast the server pushes with
[flow control](#flow-control).

### Executing SELECT queries

The simple, single-host idiom is to treat any non-`nil` error from the
iteration as terminal. This is always safe, including under failover:

```go
type Trade struct {
	TsMicros int64
	Symbol   string
	Price    float64
}

var trades []Trade
q := client.Query(ctx, "SELECT ts, symbol, price FROM trades LIMIT 1000")
defer q.Close()

for batch, err := range q.Batches() {
	if err != nil {
		return err // simple apps: any error is terminal
	}
	for row := 0; row < batch.RowCount(); row++ {
		trades = append(trades, Trade{
			TsMicros: batch.Int64(0, row),
			Symbol:   batch.String(1, row),
			Price:    batch.Float64(2, row),
		})
	}
}
```

:::caution Copy aliasing values out before the iteration ends

A `*QwpColumnBatch` is valid only during its iteration of the loop. Never
store the batch itself; use `batch.CopyAll()` for a retainable snapshot.
Which accessors alias the receive buffer and which return caller-owned data:

- **Alias the buffer** (copy with `bytes.Clone` before the loop advances if
  you keep them): `Str(col, row)` and `Binary(col, row)`.
- **Safe to retain:** `String(col, row)` returns a freshly allocated Go
  string. `Float64Array`, `Int64Array`, the `*Into` accessors, and the
  `QwpColumn` `*Range` accessors return caller-owned slices (freshly
  allocated, or appended into a buffer you supply).
- The fixed-width scalar accessors (`Int64`, `Float64`, …) return values,
  not views.

:::

For tight loops over a single column, `batch.Column(i)` returns a `QwpColumn`
that caches the column layout once, and `Int64Range` / `Float64Range` decode a
row range into a caller-owned slice in one shot:

```go
buf := make([]int64, 0, 4096)
for batch, err := range q.Batches() {
	if err != nil {
		return err
	}
	buf = batch.Column(1).Int64Range(0, batch.RowCount(), buf[:0])
	for _, v := range buf {
		// ...
	}
}
```

`q.Cancel()` aborts the query and is safe to call from another goroutine.
`q.TotalRows()` reports the row count once the cursor completes.

### Reading result batches

`QwpColumnBatch` and `QwpColumn` provide typed accessors for every QuestDB
column type. `QwpColumnBatch` accessors take `(col, row)`; the cached
`QwpColumn` accessors take `(row)`.

| Accessor                            | Column types                              |
| ----------------------------------- | ----------------------------------------- |
| `Bool`                              | BOOLEAN                                    |
| `Int8`                              | BYTE                                       |
| `Int16`                             | SHORT                                      |
| `Char`                              | CHAR                                       |
| `Int32`                             | INT, IPv4                                  |
| `Int64`                             | LONG, TIMESTAMP, timestamp_ns, DATE        |
| `Float32`                           | FLOAT                                      |
| `Float64`                           | DOUBLE                                     |
| `String` / `Str`                    | VARCHAR, SYMBOL (`String` allocates)       |
| `Binary`                            | BINARY                                     |
| `UuidHi` / `UuidLo`                 | UUID (64-bit halves)                       |
| `Decimal128Hi` / `Decimal128Lo`     | DECIMAL128 (two int64 words)               |
| `Long256Word`                       | LONG256 (per 64-bit word)                  |
| `Float64Array` / `Int64Array`       | DOUBLE_ARRAY, LONG_ARRAY (flattened)       |
| `ArrayNDims` / `ArrayDim`           | array dimensionality and shape             |
| `DecimalScale`                      | DECIMAL scale metadata (per column)        |
| `GeohashPrecisionBits`              | GEOHASH precision metadata (per column)    |
| `IsNull`                            | all types                                  |

Representations to be aware of:

- `TIMESTAMP` and `timestamp_ns` and `DATE` come back as `int64`, not
  `time.Time`: microseconds, nanoseconds, and milliseconds since epoch
  respectively. Convert with `time.UnixMicro` / `time.Unix(0, ns)` as needed.
- `UUID` is two `int64` halves (`UuidHi` / `UuidLo`); reassemble client-side.
- Decimals come back as the unscaled integer plus the per-column
  `DecimalScale(col)`: read `DECIMAL64` with `Int64`, `DECIMAL128` with
  `Decimal128Hi`/`Decimal128Lo`, and `DECIMAL256` with `Long256Word`
  (words 0–3); apply the scale yourself.
- `GEOHASH` result columns expose only metadata in this release
  (`GeohashPrecisionBits(col)`); there is no public value accessor for a
  GEOHASH cell. Cast it to a string or long in SQL if you need the value.
- A typed accessor on a NULL cell returns the zero value (`0`, `false`, `""`,
  `nil`), which is indistinguishable from a real zero. Call `IsNull(col, row)`
  first whenever NULL is meaningful.

Column metadata is available via `ColumnName(col)`, `ColumnType(col)`, and
`ColumnCount()`.

### DDL and DML statements

Non-SELECT statements run through `Exec`, which returns an `ExecResult`:

```go
res, err := client.Exec(ctx,
	"CREATE TABLE trades (ts TIMESTAMP, symbol SYMBOL, side SYMBOL, "+
		"price DOUBLE, amount DOUBLE) TIMESTAMP(ts) PARTITION BY DAY WAL")
if err != nil {
	return err
}
fmt.Println(res.OpType, res.RowsAffected)
```

`RowsAffected` reports the count for INSERT, UPDATE, and DELETE. Pure DDL
reports 0. `OpType` is the server's statement discriminator, useful for
distinguishing INSERT from UPDATE from pure DDL.

:::caution `Exec` is not retried across a reconnect by default

If the connection drops mid-statement, `Exec` returns a `*QwpFailoverReset`.
This means the statement was **interrupted and not confirmed**, not that it
succeeded. For a non-idempotent `INSERT`, re-issuing it may double-apply, so
decide per statement whether replay is safe. To make `Exec` retry
transparently (only for idempotent statements), construct the client with
`qdb.WithQwpQueryReplayExec(true)`.

:::

### Bind parameters

Parameterized queries use typed bind values, avoiding SQL injection and
enabling server-side factory cache reuse. Pass a `QwpBindFunc` via
`qdb.WithQueryBinds`:

```go
sql := "SELECT ts, symbol, price FROM trades " +
	"WHERE symbol = $1 AND price >= $2 LIMIT 1000"

for _, symbol := range []string{"EURUSD", "GBPUSD", "USDJPY"} {
	q := client.Query(ctx, sql, qdb.WithQueryBinds(func(b *qdb.QwpBinds) {
		b.VarcharBind(0, symbol).DoubleBind(1, 1.0)
	}))
	for batch, err := range q.Batches() {
		if err != nil {
			break
		}
		// ...
	}
	q.Close()
}
```

Bind indices are 0-based and must be set in strictly ascending order; index `0`
maps to `$1`. Setters include `BooleanBind`, `ByteBind`, `ShortBind`,
`IntBind`, `LongBind`, `FloatBind`, `DoubleBind`, `CharBind`, `DateBind`,
`TimestampMicrosBind`, `TimestampNanosBind`, `VarcharBind`, `UuidBind`,
`Long256Bind`, `GeohashBind`, `DecimalBind` (and `Decimal64/128/256Bind`),
plus a `Null...Bind` variant for each type. There is no symbol bind: use
`VarcharBind` for symbol parameters. **Not bindable:** `BINARY` (no setter);
`ARRAY` / `DOUBLE[]` / `LONG[]` (bind frames carry no array shape — pass a
SQL array literal in the statement instead); `IPv4` (bind it as `INT` with
`IntBind`). A gap, a duplicate index, or any out-of-order call latches an
error that surfaces from `Query` or `Exec`.

### Flow control

For large result sets, byte-credit flow control prevents the server from
overwhelming the client:

```go
client, err := qdb.NewQwpQueryClient(ctx,
	qdb.WithQwpQueryAddress("localhost:9000"),
	qdb.WithQwpQueryInitialCredit(256*1024))
```

The server pauses after streaming the granted budget and replenishes after
each batch. A credit of `0` (the default) means unbounded: the server streams
as fast as the network allows, so set a credit when consuming a large result
set on a memory-constrained client.

### Compression

Negotiate zstd compression to reduce bandwidth for large result sets:

```go
client, err := qdb.QwpQueryClientFromConf(ctx,
	"ws::addr=localhost:9000;compression=zstd;compression_level=3;")
```

Batches are decompressed automatically.

## Error handling

### Ingestion errors

WebSocket ingestion uses an asynchronous error model. Batch rejections are
**not** returned from `Flush`. They are delivered to a `SenderErrorHandler`
callback. If you do not register one, a built-in handler logs them, but your
application is not notified and cannot dead-letter or alert, so register one
in any non-trivial producer:

```go
sender, err := qdb.NewLineSender(ctx,
	qdb.WithQwp(),
	qdb.WithAddress("localhost:9000"),
	qdb.WithErrorHandler(func(e *qdb.SenderError) {
		log.Printf("rejected: category=%s table=%s msg=%s fsn=[%d,%d]",
			e.Category, e.TableName, e.ServerMessage, e.FromFsn, e.ToFsn)
	}))
```

Full `SenderError` field set, for logging, alerting, and support
correlation:

| Field              | Type        | Use                                                                                                                                                                                   |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`         | `Category`  | Stable named class (`CategorySchemaMismatch`, `CategoryParseError`, `CategoryInternalError`, `CategorySecurityError`, `CategoryWriteError`, `CategoryProtocolViolation`, `CategoryUnknown`). The recommended switch target. |
| `ServerStatusByte` | `int`       | Numeric wire status (e.g. `0x03`). `NoStatusByte` (`-1`) for `CategoryProtocolViolation`.                                                                                              |
| `AppliedPolicy`    | `Policy`    | `PolicyHalt` or `PolicyDropAndContinue` — what the send loop did.                                                                                                                      |
| `ServerMessage`    | `string`    | Human-readable server text. **≤ 1024 UTF-8 bytes**, English, may be empty. Safe to log; not a stable pattern-match key (switch on `Category` / `ServerStatusByte`). May echo table / column names — sanitise before forwarding to third-party error trackers. |
| `TableName`        | `string`    | Rejected table; empty for unknown or multi-table batches.                                                                                                                             |
| `FromFsn`,`ToFsn`  | `int64`     | Inclusive FSN span; join to `FlushAndGetSequence` to identify the rejected rows.                                                                                                       |
| `MessageSequence`  | `int64`     | Server per-frame sequence — the correlation key for support tickets and server-log matching. `NoMessageSequence` (`-1`) for protocol violations.                                       |
| `DetectedAt`       | `time.Time` | Client-side receipt time, for ops timelines (not for correlation).                                                                                                                     |

The per-category policy is configurable. Resolution precedence is the policy
resolver, then the per-category policy, then the connect-string `on_*_error`
keys, then the spec defaults. `CategoryProtocolViolation` and
`CategoryUnknown` are always `PolicyHalt`:

```go
qdb.WithErrorPolicy(qdb.CategorySchemaMismatch, qdb.PolicyDropAndContinue)
qdb.WithErrorPolicyResolver(func(c qdb.Category) qdb.Policy { ... })
qdb.WithErrorInboxCapacity(512)
```

After a `PolicyHalt` rejection, the sender stops draining and the next
producer call returns the same payload as a typed error. Unwrap it with
`errors.As`, then `Close` and rebuild the sender to continue:

```go
if err := sender.Flush(ctx); err != nil {
	var se *qdb.SenderError
	if errors.As(err, &se) {
		// se.Category, se.ServerMessage, se.FromFsn, se.ToFsn
	}
}
```

The handler runs on a dedicated dispatcher goroutine, never on the producer
goroutine. If the bounded inbox fills, surplus notifications are dropped and
counted by `QwpSender.DroppedErrorNotifications()`.

### Query errors

Server-side query failures surface as a `*QwpQueryError` from the `Batches()`
iteration or the `Exec` return value:

```go
for batch, err := range q.Batches() {
	if err != nil {
		var qe *qdb.QwpQueryError
		if errors.As(err, &qe) {
			log.Printf("query %d failed: 0x%02X %s",
				qe.RequestId, qe.Status, qe.Message)
		}
		break
	}
	// ...
}
```

| Code   | Name            | Description                                          |
| ------ | --------------- | ---------------------------------------------------- |
| `0x03` | SCHEMA_MISMATCH | Bind parameter type incompatible with placeholder    |
| `0x05` | PARSE_ERROR     | SQL syntax error or malformed message                |
| `0x06` | INTERNAL_ERROR  | Server-side execution failure                        |
| `0x08` | SECURITY_ERROR  | Authorization failure                                |
| `0x09` | WRITE_ERROR     | Write failure (e.g. table not accepting writes; DML) |
| `0x0A` | CANCELLED       | Query terminated by `Cancel`                         |
| `0x0B` | LIMIT_EXCEEDED  | Protocol limit hit                                   |

`QwpQueryError` also carries `RequestId` (the client-assigned query id — the
correlation key for support tickets and server-log matching) and `Message`
(server-supplied UTF-8, English, may be empty; safe to log, but switch on
`Status`, not on message text). Errors can arrive before any data or
mid-stream. Once an error is yielded, no further batches arrive for that
query.

### Connection-level errors

- **Authentication failure**: a `401` or `403` response before the WebSocket
  upgrade completes. Terminal across all endpoints.
- **Role mismatch**: `*QwpRoleMismatchError` from `NewQwpQueryClient` when no
  configured endpoint satisfies the `target=` filter. It reports the endpoints
  tried, the last observed server role, and the last transport error.

## Failover and high availability

:::note Enterprise
Multi-host failover with automatic reconnect requires QuestDB Enterprise.
:::

Single-host applications need nothing from this section. The simple loops
shown earlier are already correct: treating any iteration error as terminal is
always safe, including when a reconnect happens.

If you connect to multiple hosts for failover, a correct application must do
exactly three things beyond the single-host code. This is the whole list:

1. **Ingestion: no loop changes.** Configure multiple endpoints and a
   reconnect policy; reconnection is transparent to the producer. You still
   need the universal asynchronous error handling from
   [Ingestion errors](#ingestion-errors). Details:
   [Ingestion failover](#ingestion-failover).
2. **Querying: handle `*QwpFailoverReset`, but only if you accumulate rows.**
   If you build up rows across batches, discard them on a reset and continue
   iterating. If you process each batch and keep nothing, the simple
   terminal-on-error loop is already correct. Pattern:
   [Query failover](#query-failover).
3. **DDL/DML: `Exec` is not retried by default.** A `*QwpFailoverReset` from
   `Exec` means the statement was not confirmed, not that it succeeded.
   Re-issue it only if it is idempotent, or opt into
   `qdb.WithQwpQueryReplayExec(true)`. Details:
   [the Exec caution](#ddl-and-dml-statements).

Everything below is the detail behind these three points.

### Multiple endpoints

Specify comma-separated addresses in the connect string, or pass them to the
options API:

```text
ws::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

```go
client, err := qdb.NewQwpQueryClient(ctx,
	qdb.WithQwpQueryEndpoints("db-primary:9000", "db-replica-1:9000"))
```

The client tries endpoints in order and walks the list to find the next
healthy one on connection loss.

### Ingestion failover

The ingestion sender uses a reconnect loop with exponential backoff. Configure
it via the connect string or `qdb.WithReconnectPolicy(maxDuration,
initialBackoff, maxBackoff)`:

| Key                                | Default  | Description                          |
| ---------------------------------- | -------- | ------------------------------------ |
| `reconnect_max_duration_millis`    | `300000` | Total outage budget before giving up |
| `reconnect_initial_backoff_millis` | `100`    | First post-failure sleep             |
| `reconnect_max_backoff_millis`     | `5000`   | Cap on per-attempt sleep             |
| `initial_connect_retry`            | `off`    | Retry on first connect               |

`qdb.WithInitialConnectMode` selects `InitialConnectOff` (default),
`InitialConnectSync` (block the constructor while retrying), or
`InitialConnectAsync` (return immediately and buffer rows until connected).
Ingress is zone-blind: it pins QWP v1 and ignores the `zone=` key, so a connect
string shared with query clients works unchanged. Reconnect is transparent to
the producer; you do not change the ingestion loop for it.

### Query failover

The query client drives a per-query reconnect loop. On a mid-stream transport
error it reconnects and replays the query.

| Key                           | Default | Description                       |
| ----------------------------- | ------- | --------------------------------- |
| `failover`                    | `on`    | Master switch for reconnect       |
| `failover_max_attempts`       | `8`     | Max reconnect attempts per query  |
| `failover_backoff_initial_ms` | `50`    | First post-failure sleep          |
| `failover_backoff_max_ms`     | `1000`  | Cap on per-attempt sleep          |
| `failover_max_duration_ms`    | `30000` | Total wall-clock failover budget per query (`0` = unbounded) |
| `target`                      | `any`   | Role filter: `any`, `primary`, `replica` |

The matching options are `qdb.WithQwpQueryFailover`,
`qdb.WithQwpQueryFailoverMaxAttempts`, `qdb.WithQwpQueryFailoverBackoff`,
`qdb.WithQwpQueryFailoverMaxDuration`, and `qdb.WithQwpQueryTarget`.

You only need the pattern below if you **accumulate rows across batches and
want the query to continue transparently across a reconnect**. When failover
occurs mid-stream, `Batches()` yields a non-fatal `*QwpFailoverReset` before
the replayed batches arrive. Detect it with `errors.As`, discard the rows you
accumulated from the prior connection (the server replays from the
beginning), and continue iterating:

```go
for batch, err := range q.Batches() {
	if err != nil {
		var reset *qdb.QwpFailoverReset
		if errors.As(err, &reset) {
			results = results[:0] // server replays from the beginning
			continue
		}
		return err // any other error is terminal
	}
	// ...
}
```

If you do not need transparent continuation, the simple loop is correct:
returning on any error treats a reset as terminal, which the client supports
explicitly. When the failover budget is consumed, `Batches()` (and `Exec`)
return `*QwpFailoverExhaustedError`.

### Observability

`QwpSender` exposes counters for dashboards: `TotalReconnectAttempts`,
`TotalReconnectsSucceeded`, `TotalFramesReplayed`, `TotalBackpressureStalls`,
`TotalServerErrors`, and `LastTerminalError`. With `drain_orphans=on`,
`BackgroundDrainers()` snapshots the goroutines adopting unacked data from
crashed sibling senders. The query client exposes `ServerInfo()` and
`CurrentEndpoint()`; `QwpServerInfo.RoleName()` returns the bound node's role.

There is no per-transition connection callback: connect, disconnect,
reconnect, and failover are not delivered as events. Observe reconnect and
failover through these counters, and terminal failures through the
[ingestion error handler](#ingestion-errors). Poll the counters from a
background goroutine:

```go
go func() {
	t := time.NewTicker(10 * time.Second)
	defer t.Stop()
	for range t.C {
		log.Printf("qwp: reconnects=%d/%d replayed=%d stalls=%d",
			qs.TotalReconnectsSucceeded(), qs.TotalReconnectAttempts(),
			qs.TotalFramesReplayed(), qs.TotalBackpressureStalls())
		if e := qs.LastTerminalError(); e != nil {
			// Page on-call: the sender has stopped draining.
			log.Printf("qwp TERMINAL: %s", e)
		}
	}
}()
```

where `qs` is the `qdb.QwpSender` from the type assertion shown earlier.

For background and worked configurations, see
[client failover concepts](/docs/high-availability/client-failover/concepts/),
[client failover configuration](/docs/high-availability/client-failover/configuration/),
and the
[multi-host failover](/docs/connect/clients/connect-string#failover-keys) and
[reconnect](/docs/connect/clients/connect-string#reconnect-keys) keys of the
connect string reference.

## Concurrency and parallel queries

:::note Phase 1 limitation
The current implementation supports a single in-flight query per connection.
Multi-query support is planned for a future release.
:::

Neither the `LineSender` nor the `QwpQueryClient` is safe for concurrent use.
For multi-threaded workloads, use one instance per goroutine. To run queries
in parallel, create separate `QwpQueryClient` instances, one per goroutine.
`Cancel` (on a `*QwpQuery`) and `Close` are safe to call from other
goroutines, which is how you cancel an in-flight query or shut down cleanly.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common WebSocket-specific keys:

| Key                             | Default  | Description                          |
| ------------------------------- | -------- | ------------------------------------ |
| `auto_flush_rows`               | `1000`   | Rows before auto-flush               |
| `auto_flush_interval`           | `100`    | Milliseconds before auto-flush       |
| `sf_dir`                        | unset    | Store-and-forward directory          |
| `sender_id`                     | `default`| Sender slot identity for SF          |
| `request_durable_ack`           | `off`    | Request durable upload ACK (Enterprise) |
| `reconnect_max_duration_millis` | `300000` | Ingress reconnect budget             |
| `failover`                      | `on`     | Query per-query reconnect switch     |
| `compression`                   | `raw`    | Query batch compression (`raw`, `zstd`) |

## Migration from ILP (HTTP/TCP)

The row-building API is unchanged across transports. The main differences:

| Aspect                | HTTP (ILP)        | WebSocket (QWP)         |
| --------------------- | ----------------- | ----------------------- |
| Connect string schema | `http::` / `https::` | `ws::` / `wss::`     |
| Options transport     | `qdb.WithHttp()`  | `qdb.WithQwp()`         |
| Auto-flush rows       | 75,000            | 1,000                   |
| Auto-flush interval   | 1,000 ms          | 100 ms                  |
| Error model           | Synchronous       | Async `SenderErrorHandler` |
| Store-and-forward     | Not available     | Available (`sf_dir`)    |
| Multi-endpoint failover | Limited         | Full reconnect loop     |
| Querying              | Not available     | `QwpQueryClient`        |

The biggest behavioral change is the error model: on HTTP, `Flush` returns the
rejection synchronously; on QWP it does not. To migrate, change the connect
string from `http::` to `ws::` (or `https::` to `wss::`), register a
`SenderErrorHandler`, and adjust auto-flush settings if needed. `QwpSender` is
a superset of `LineSender`, so existing ingestion code keeps working.
