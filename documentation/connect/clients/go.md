---
slug: /connect/clients/go
title: Go client for QuestDB
sidebar_label: Go
description:
  "QuestDB Go client for high-throughput data ingestion and streaming SQL
  queries over the QWP binary protocol."
---

import { RemoteRepoExample } from "@theme/RemoteRepoExample"

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB Go client connects to QuestDB over
[QWP — QuestDB Wire Protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) — a
columnar binary protocol carried over WebSocket. It supports high-throughput
data ingestion and streaming SQL queries on the same transport.

The recommended entry point is the [`QuestDB`](#the-questdb-handle) handle: a
shared, goroutine-safe facade that owns connection pools for both ingress and
egress.

Key capabilities:

- **One handle, both directions**: `qdb.Connect(...)` configures ingress and
  egress from a single `ws`/`wss` connect string; `db.BorrowSender(...)` for
  ingestion, `db.BorrowQuery(...)` for SQL.
- **Pooled connections**: elastic sender and query pools that close idle
  connections, shared safely across goroutines.
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

:::caution Pre-release

The pooled `QuestDB` facade (`qdb.Connect`, `BorrowSender`, `BorrowQuery`) and the
QWP query API on this page are **pre-release**: they are not yet part of a tagged
`v4` release of `go-questdb-client`, so
`go get github.com/questdb/go-questdb-client/v4` alone will not resolve the types
shown below. Build against the pre-release QWP client, pin the exact version, and
expect the API to change before it ships. Track the
[client releases](https://github.com/questdb/go-questdb-client/releases) for the
first version that includes it.

:::

## Quick start

The client requires Go 1.23 or later. Add it to your module:

```bash
go get github.com/questdb/go-questdb-client/v4
```

Construct one `QuestDB` handle per deployment, share it across goroutines, and
close it at shutdown. Borrow a sender to ingest and a query session to read:

```go
package main

import (
	"context"
	"fmt"

	qdb "github.com/questdb/go-questdb-client/v4"
)

func main() {
	ctx := context.TODO()

	// One ws/wss config drives both the ingest and the query pool.
	db, err := qdb.Connect(ctx, "ws::addr=localhost:9000;")
	if err != nil {
		panic(err)
	}
	defer db.Close(ctx)

	// Borrow a query session and create the table up front so its designated
	// timestamp column is named `ts`. An auto-created table would name that
	// column `timestamp` (see the note under Data ingestion).
	query, err := db.BorrowQuery(ctx)
	if err != nil {
		panic(err)
	}
	defer query.Close()
	if _, err := query.Exec(ctx,
		"CREATE TABLE IF NOT EXISTS trades "+
			"(ts TIMESTAMP, symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE) "+
			"TIMESTAMP(ts) PARTITION BY DAY WAL"); err != nil {
		panic(err)
	}

	// Ingest: borrow a sender, write rows, Close returns it to the pool.
	sender, err := db.BorrowSender(ctx)
	if err != nil {
		panic(err)
	}
	err = sender.Table("trades").
		Symbol("symbol", "ETH-USD").
		Symbol("side", "sell").
		Float64Column("price", 2615.54).
		Float64Column("amount", 0.00044).
		AtNow(ctx)
	if err != nil {
		panic(err)
	}
	if err := sender.Close(ctx); err != nil { // flush + return to pool
		panic(err)
	}

	// Query: run a SELECT and iterate its result batches.
	cursor := query.Query(ctx,
		"SELECT symbol, price FROM trades WHERE symbol = 'ETH-USD' LIMIT 10")
	defer cursor.Close()
	for batch, err := range cursor.Batches() {
		if err != nil {
			panic(err)
		}
		for row := 0; row < batch.RowCount(); row++ {
			fmt.Println(batch.String(0, row), batch.Float64(1, row))
		}
	}
}
```

The `QuestDB` handle is a facade over two pools: a sender pool for ingestion
(`db.BorrowSender`) and a query pool for SQL (`db.BorrowQuery`). Both speak QWP,
so a single `ws` or `wss` connect string passed to `qdb.Connect(...)` configures
both. Each side reads the connect-string keys it owns and ignores the rest.

:::caution Read before building on these snippets

The snippet above is deliberately minimal. Three behaviors will cause data
loss, corruption, or panics if you carry the minimal form into real code:

- **Ingestion errors are asynchronous.** `Flush` returning `nil` does **not**
  mean the server accepted the rows. Schema, parse, and write rejections are
  delivered out of band. Register an error handler with
  `qdb.WithQuestDBErrorHandler`. See [Ingestion errors](#ingestion-errors).
- **A borrowed sender or query session is not safe for concurrent use.** The
  `QuestDB` handle is; an individual borrow is not. Borrow one per goroutine.
  See [Concurrency](#concurrency).
- **A query batch is valid only inside its loop iteration.** Some accessors
  alias the network buffer. Copy out anything you keep. See
  [Reading result batches](#reading-result-batches).

Building with multi-host failover? It adds exactly three rules on top of the
single-host code, listed up front in
[Failover and high availability](#failover-and-high-availability). Single-host
applications can ignore them.

:::

## The QuestDB handle

`QuestDB` is a handle for a QuestDB deployment: you create one, share it across
your application's goroutines, and close it at shutdown. It owns an elastic pool
of each client type — senders for ingestion and query sessions for SQL — plus a
background housekeeper goroutine that closes idle and over-age connections.

| Method | Returns | Purpose |
|--------|---------|---------|
| `qdb.Connect(ctx, conf)` | `*QuestDB` | Open a handle with default pool sizing. One `ws`/`wss` string for both directions. |
| `qdb.NewQuestDB(ctx, conf, opts...)` | `*QuestDB` | Same, with pool-tuning [options](#options-api). |
| `db.BorrowSender(ctx)` | `LineSender` | Lease a sender from the pool; `Close` flushes and returns it. |
| `db.BorrowQuery(ctx)` | `*Query` | Lease a query session; `Close` returns it. |
| `db.Close(ctx)` | `error` | Shut down both pools and disconnect every underlying client. Idempotent. |

A `*QuestDB` is safe to share across goroutines: `BorrowSender`, `BorrowQuery`,
and `Close` may be called concurrently. The leases they hand back are **not** —
use one per goroutine (see [Concurrency](#concurrency)).

### Single connect string

```go
db, err := qdb.Connect(ctx, "ws::addr=localhost:9000;")
```

The schema must be `ws` or `wss`. QuestDB ingests and queries over QWP, so the
pooled facade is WebSocket-only and rejects `http`/`https`/`tcp` and the other
legacy ILP schemas. (The low-level [`LineSender`](#low-level-primitives) speaks
those transports; only the `QuestDB` facade is QWP-only.)

The string is handed to both the ingress sender and the egress query client
verbatim. Each direction reads the keys it owns and ignores keys meant only for
the other, so ingress-only and egress-only options coexist in one string:

```go
db, err := qdb.Connect(ctx,
	"wss::addr=db.example.com:9000;"+
		"token=YOUR_TOKEN;"+     // common: authenticates both directions
		"auto_flush_rows=5000;"+ // ingress-only: the query side ignores it
		"compression=zstd;")     // egress-only: the sender ignores it
```

`addr`, the credentials (`username`/`password` or `token`), the `tls_*` keys,
and `connect_timeout` are **common** — they apply to both directions. The Go
facade takes a single config string for the whole cluster; list every node in
one `addr` server list.

### Options API

`qdb.NewQuestDB(ctx, conf, opts...)` accepts the same config string plus
type-safe pool-tuning options. An explicit option always wins over the matching
connect-string key.

```go
db, err := qdb.NewQuestDB(ctx, "ws::addr=localhost:9000;",
	qdb.WithSenderPoolMin(2),
	qdb.WithSenderPoolMax(8),
	qdb.WithQueryPoolMax(16),
	qdb.WithAcquireTimeout(10*time.Second),
	qdb.WithIdleTimeout(60*time.Second),
	qdb.WithMaxLifetime(30*time.Minute),
	qdb.WithQuestDBErrorHandler(func(e *qdb.SenderError) { /* see Error handling */ }),
	qdb.WithQuestDBConnectionListener(func(e qdb.SenderConnectionEvent) { /* see Connection events */ }))
```

| Option | Default | Purpose |
|--------|---------|---------|
| `WithSenderPoolMin(int)` | `1` | Senders kept open even when idle. `0` lets the pool close them all. |
| `WithSenderPoolMax(int)` | `4` | Maximum senders the pool opens. |
| `WithQueryPoolMin(int)` | `1` | Query sessions kept open even when idle (`0` with `lazy_connect`). |
| `WithQueryPoolMax(int)` | `4` | Maximum query sessions the pool opens. |
| `WithAcquireTimeout(d)` | `5s` | How long `BorrowSender`/`BorrowQuery` wait for a free connection when the pool is at `max`. |
| `WithIdleTimeout(d)` | `60s` | How long an above-`min` connection stays idle before the housekeeper closes it. `0` keeps idle connections forever. |
| `WithMaxLifetime(d)` | `30m` | Maximum age of a connection before recycling. `0` disables age recycling. |
| `WithHousekeeperInterval(d)` | `5s` | How often the housekeeper checks for idle and over-age connections. |
| `WithLazyConnect(bool)` | `false` | Tolerate a down server at startup (see [below](#tolerating-a-down-server-at-startup)). |
| `WithQuestDBErrorHandler(h)` | — | Ingest [`SenderErrorHandler`](#ingestion-errors) applied to every pooled sender. |
| `WithQuestDBConnectionListener(l)` | — | [`SenderConnectionListener`](#connection-events) applied to every pooled sender. |

Unlike the Java facade, the Go `QuestDB` handle accepts the ingest error handler
and connection listener directly, so you do not need to drop down to the
low-level sender to observe rejections or connection-state transitions.

### From an environment variable

Set `QDB_CLIENT_CONF` to avoid hard-coding credentials, then read it and pass it
to `qdb.Connect`:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;token=YOUR_TOKEN;"
```

```go
db, err := qdb.Connect(ctx, os.Getenv("QDB_CLIENT_CONF"))
```

### Connect-string pool keys

The pool-tuning options can also live in the connect string itself. They belong
to the facade: the sender and query parsers accept and ignore them, while the
facade reads them off the string.

| Key                       | Option equivalent             |
|---------------------------|-------------------------------|
| `sender_pool_min`         | `WithSenderPoolMin(int)`      |
| `sender_pool_max`         | `WithSenderPoolMax(int)`      |
| `query_pool_min`          | `WithQueryPoolMin(int)`       |
| `query_pool_max`          | `WithQueryPoolMax(int)`       |
| `acquire_timeout_ms`      | `WithAcquireTimeout(d)`       |
| `idle_timeout_ms`         | `WithIdleTimeout(d)`          |
| `max_lifetime_ms`         | `WithMaxLifetime(d)`          |
| `housekeeper_interval_ms` | `WithHousekeeperInterval(d)`  |
| `lazy_connect`            | `WithLazyConnect(bool)`       |

An explicit option setter always wins over the same key in the string.

## Authentication and TLS

QWP runs over WebSocket, so authentication uses HTTP-style credentials sent on
the WebSocket upgrade request — for both ingress and egress, before any data is
exchanged. The credential and TLS keys (`token`, `username`/`password`, `tls_*`)
are common to both directions, so a single `qdb.Connect(...)` string
authenticates both pools.

### Token auth (Enterprise, recommended)

Token authentication avoids the per-request overhead of basic auth and is the
recommended path for Enterprise deployments.

```go
db, err := qdb.Connect(ctx,
	"wss::addr=db.example.com:9000;token=YOUR_BEARER_TOKEN;")
```

The token is sent as an `Authorization: Bearer YOUR_BEARER_TOKEN` header on both
the ingress and egress WebSocket upgrades. It is a **static credential**: the
client sends exactly the string you pass and never refreshes or renews it.
Acquire it out of band — QuestDB Enterprise issues bearer tokens through its
[OpenID Connect flow](/docs/security/oidc/) — and manage its lifetime yourself.
When the token expires or is rotated, construct a new handle with the new token.
An expired or rejected token surfaces as an authentication failure (see
[Connection-level errors](#connection-level-errors)). It is mutually exclusive
with `username`/`password`.

### HTTP basic auth

```go
db, err := qdb.Connect(ctx,
	"wss::addr=db.example.com:9000;username=admin;password=quest;")
```

`username`/`password` are common keys, so this authenticates both the ingress
and egress upgrades. Both halves must be present together, and they are mutually
exclusive with `token`.

### TLS trust store

TLS is enabled by the `wss` schema. The Go client verifies the server
certificate against the **operating-system trust store**. It does **not**
support a custom trust store: the `tls_roots` / `tls_roots_password`
connect-string keys (a Java-keystore feature) are rejected by the Go
connect-string parser. To trust a private CA, install it in the host trust
store. For test-only certificate-verification bypass, use `tls_verify=unsafe_off`
(**never in production**); see the
[TLS section](/docs/connect/clients/connect-string#tls) of the connect string
reference.

### Production example (TLS + token + multi-host)

A realistic Enterprise deployment combines `wss`, token auth, and a multi-host
`addr` list. The `target` key controls which server roles the query pool
connects to: `primary` for the authoritative write node, `replica` for
read-only replicas, or `any` (default) for either. (Ingest always lands on the
primary — replicas reject write connections — so it accepts but ignores
`target`.)

```go
db, err := qdb.Connect(ctx,
	"wss::addr=db-1.example.com:9000,db-2.example.com:9000;"+
		"token=YOUR_BEARER_TOKEN;target=replica;")
```

## The connection pool

Both pools are *elastic*. Each holds live connections — pooled senders in one,
query sessions in the other. A pool keeps at least `min` connections open and
ready, opens more on demand up to `max`, and a background **housekeeper**
goroutine closes connections left idle too long, down to `min`.

### Borrowing and returning

```go
sender, err := db.BorrowSender(ctx)
if err != nil {
	return err
}
sender.Table("trades").Float64Column("price", 42.0).AtNow(ctx)
if err := sender.Close(ctx); err != nil { // flush + return to the pool
	return err
}
```

`Close` on a borrowed sender flushes pending rows and returns it to the pool for
reuse — it does **not** disconnect the underlying WebSocket. A real disconnect
only happens at `db.Close(ctx)` (or when the housekeeper closes an idle
connection). Leases are generation-stamped: a handle kept after `Close` cannot
corrupt the borrow that next reuses its slot.

The same lifecycle applies to a borrowed query session: `db.BorrowQuery(ctx)`
hands back a `*Query`, and its `Close` returns it to the query pool.

### Acquire timeout

Both `BorrowSender` and `BorrowQuery` take a connection from a pool. When every
connection is in use and the pool has already grown to `max`, the call blocks,
waiting for another caller to return one. It proceeds the moment a connection
frees up, or, if the acquire timeout (default 5s) elapses first, returns an
error. Raise `WithAcquireTimeout` to ride out longer bursts, or raise `max` to
allow more concurrency.

### Tolerating a down server at startup

By default the pool prewarms `min` connections eagerly, so `Connect` fails fast
if the server is unreachable. Set `lazy_connect=true` (or the `WithLazyConnect`
option) to tolerate a down server at startup:

```go
db, err := qdb.Connect(ctx, "ws::addr=localhost:9000;lazy_connect=true;")
// or:
db, err := qdb.NewQuestDB(ctx, "ws::addr=localhost:9000;", qdb.WithLazyConnect(true))
```

With `lazy_connect`, the ingest pool connects asynchronously (writes buffer
until the wire comes up) and the query pool defaults to `query_pool_min=0`,
connecting on the first `BorrowQuery`. The handle builds successfully even while
the server is down. `lazy_connect` is facade-only; standalone clients accept but
ignore the key.

## Data ingestion

Once you have a sender from the pool (or a standalone
[`LineSender`](#low-level-primitives)), the row-building API is identical across
all transports.

### General usage pattern

1. Borrow a sender via `db.BorrowSender(ctx)`.
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
6. Call `Close(ctx)` to flush and return the sender to the pool.

The call order is fixed: `Table`, then `Symbol`s, then column setters, then
`At`/`AtNow`. The fluent methods do not return errors; the first error is
latched and surfaces from `At`, `AtNow`, or `Flush`, so always check that
return value.

:::caution The error from `At`/`AtNow`/`Flush` is not the server's verdict on your rows

A `nil` return does not mean the server accepted the data: batch rejections are
delivered asynchronously to the error handler, never returned from the call that
sent the rows. A non-`nil` return is one of two things — a client-side problem (a
bad value, wrong call order, or store-and-forward backpressure), or, once a
`PolicyHalt` rejection has latched, the terminal `*SenderError` itself, surfaced
on the next producer call. Always `errors.As(err, &se)` to tell them apart. See
[Ingestion errors](#ingestion-errors).

:::

Tables and columns are created automatically if they do not exist. Auto-created
tables name the designated-timestamp column `timestamp`. To use a different name
(the examples on this page use `ts`), pre-create the table with
`CREATE TABLE … TIMESTAMP(<name>)`, as the [quick start](#quick-start) does. See
[designated timestamp](/docs/concepts/designated-timestamp/).

The full runnable program below is a **standalone `LineSender`** that registers an
error handler — the minimum correct shape for a QWP producer. For shared,
multi-goroutine use, prefer the pooled facade (`db.BorrowSender` with
`qdb.WithQuestDBErrorHandler`, shown under
[The QuestDB handle](#the-questdb-handle)):

<RemoteRepoExample name="qwp-ingest" lang="go" header={false} />

### QWP-only column types

`BorrowSender` returns a `LineSender`. The QWP transport exposes column types
that are not part of ILP; type-assert the sender to `qdb.QwpSender` with the
comma-ok form (every pooled sender is a QWP sender, so the assertion always
succeeds — but check it, as a standalone HTTP or TCP sender would not):

```go
sender, err := db.BorrowSender(ctx)
if err != nil {
	panic(err)
}
qs, ok := sender.(qdb.QwpSender)
if !ok {
	panic("not a QWP sender")
}

// UuidColumn takes the UUID as two big-endian uint64 halves:
id := uuid.New() // github.com/google/uuid — a [16]byte value
hi := binary.BigEndian.Uint64(id[0:8])
lo := binary.BigEndian.Uint64(id[8:16])

// Table and Symbol return LineSender, so call them first; then chain the
// QWP-only setters (which return QwpSender) into AtNano.
qs.Table("trades")
qs.Symbol("symbol", "ETH-USD")
qs.Symbol("side", "sell") // side is a SYMBOL, matching the rest of the page
err = qs.
	Int32Column("venue_id", 7).
	CharColumn("cond", 'R'). // trade-condition code — a single CHAR
	UuidColumn("order_id", hi, lo).
	AtNano(ctx, time.Now())
```

`QwpSender` adds `ByteColumn`, `ShortColumn`, `Int32Column`, `Float32Column`,
`CharColumn`, `DateColumn`, `TimestampNanosColumn`, `UuidColumn`,
`GeohashColumn`, `Int64Array1DColumn` / `2D` / `3D`, the fixed-width decimal
columns (`Decimal64Column` / `Decimal128Column` / `Decimal256Column`), and
`AtNano` for nanosecond designated timestamps. It also exposes the
acknowledgement and observability accessors (`AwaitAckedFsn`,
`FlushAndGetSequence`, `TotalReconnectAttempts`, `LastTerminalError`, …).

### Null values

The client has no null setter. To store a null for a column in a given row, omit
that column's setter before `At`/`AtNow`/`AtNano`. On row commit, every column
not set in the row is gap-filled with a null, so omitting a column and writing an
"explicit null" are the same operation.

The buffered column set is the union across the batch: a column first used on a
later row is backfilled with null for every earlier row still in the send buffer.

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
`Set(value, positions...)` to write at specific coordinates, `Append(value)` for
sequential fills, and `Reshape(shape...)` for a new view with a different shape
over the same backing data.

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) column controls
time-based partitioning and ordering:

```go
// User-assigned (recommended for deduplication and exactly-once delivery)
err = sender.Table("trades").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842).
	At(ctx, time.Now())

// Nanosecond precision (creates a timestamp_ns column); AtNano lives on
// QwpSender, so obtain qs first (comma-ok form shown under "QWP-only column
// types"), then call the base setters — they return LineSender.
qs := sender.(qdb.QwpSender)
qs.Table("ticks").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842)
err = qs.AtNano(ctx, time.Now())

// Server-assigned (server uses its wall-clock time)
err = sender.Table("trades").
	Symbol("symbol", "EURUSD").
	Float64Column("price", 1.0842).
	AtNow(ctx)
```

:::caution
A table's designated timestamp resolution is fixed by its first row. Mixing `At`
(microseconds) and `AtNano` (nanoseconds) on rows of the same table **within a
single flush** returns a local type-conflict error; across flushes the mismatch
is caught server-side and surfaces as an asynchronous rejection instead. Pick one
resolution per table.
:::

:::note
QuestDB works best when data arrives in chronological order, sorted by timestamp.
:::

### Decimal columns

:::caution
Decimal values require QuestDB 9.2.0 or later. Create decimal columns ahead of
time with `DECIMAL(precision, scale)` so QuestDB ingests values with the expected
precision. See the
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

qs := sender.(qdb.QwpSender) // see "QWP-only column types" for the comma-ok form
qs.Table("trade_fees")
qs.Symbol("symbol", "ETH-USD")
err = qs.
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

Auto-flush (default) flushes when any of these thresholds is reached:

| Trigger   | WebSocket default | HTTP default |
| --------- | ----------------- | ------------ |
| Row count (`auto_flush_rows`)    | 1,000 rows | 75,000 rows |
| Interval (`auto_flush_interval`) | 100 ms     | 1,000 ms    |
| Byte size (`auto_flush_bytes`)   | 8 MiB      | disabled    |

Customize via the connect string or the options API:

```text
ws::addr=localhost:9000;auto_flush_rows=500;auto_flush_interval=50;
```

`Flush(ctx)` sends buffered data immediately. It returns once the rows are
published into the cursor engine (in memory, or on disk when `sf_dir` is set) —
it does **not** wait for the server to acknowledge them. Delivery and
acknowledgement happen asynchronously on the send loop; a server-side rejection
surfaces on the error handler, never as a `Flush` error (see
[Ingestion errors](#ingestion-errors)). For explicit server-ack confirmation,
pair `FlushAndGetSequence` with `AwaitAckedFsn` (below). Write many rows per
`Flush`; calling it after every row collapses throughput.

:::caution
If you disable auto-flush, nothing is sent until you call `Flush` yourself. On
QWP, use the connect-string `auto_flush=off` to disable every trigger;
`qdb.WithAutoFlushDisabled()` clears only the row-count and interval triggers and
leaves the 8 MiB byte-size trigger active. `Close` does a final flush, but it is
best-effort, bounded by `close_flush_timeout_millis`, and not retried on failure.
An app that disables auto-flush and never calls `Flush` loses everything it
buffered.
:::

`QwpSender.FlushAndGetSequence(ctx)` returns the published frame sequence number
(FSN), and `AwaitAckedFsn(ctx, target)` blocks until the server has acknowledged
up to a given FSN. Use the FSN to correlate a publish with any later
`SenderError`.

### Store-and-forward

With store-and-forward enabled, unacknowledged data is persisted to disk and
replayed after reconnection, surviving sender process restarts:

```text
ws::addr=localhost:9000;sf_dir=/var/lib/questdb/sf;sender_id=ingest-1;
```

When multiple senders share the same `sf_dir`, each must have a distinct
`sender_id`. Slots are exclusive: two senders with the same ID will collide.
Allowed characters: `A-Za-z0-9_-`. When the `QuestDB` pool runs in
store-and-forward mode, it assigns each pooled sender its own slot under the
base `sender_id`, so slots never collide and crash-stranded slots are recovered
automatically.

Without `sf_dir`, unacknowledged data lives in process memory and is lost if the
sender process dies. The reconnect loop still spans transient server outages, but
the RAM buffer caps how much data can accumulate.

<SfDedupWarning />

In both modes, `At`/`AtNow`/`Flush` can block when the buffer hits its cap: the
producer waits for the wire path to free enough capacity, and returns a deadline
error if it does not within `sf_append_deadline_millis` (default 30 seconds).
Treat a blocking call as a signal that the server is unreachable or slow, not as
a reason to retry in a tight loop.

Terminal rejections (schema, parse, or security errors) latch a terminal error.
The next producer call returns it as a typed `*SenderError`; the sender will not
drain further. Close it and borrow a new one to continue.

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
[WAL](/docs/concepts/write-ahead-log/). Set `request_durable_ack=on` in the
connect string to instead wait until the batch has been durably uploaded to
object storage:

```text
ws::addr=db-primary:9000;request_durable_ack=on;
```

On the pooled facade, durable-ack is configured through the connect string. The
equivalent option form, `qdb.WithRequestDurableAck(true)`, applies to a standalone
[`LineSender`](#low-level-primitives) — it is not a `NewQuestDB` option.

With durable-ack on, the sender advances its acknowledged watermark on the
server's `STATUS_DURABLE_ACK` (object-storage upload) instead of the ordinary OK
ACK (WAL commit) — so `FlushAndGetSequence` / `AwaitAckedFsn` confirm *durable*
upload, not just commit. This is independent of store-and-forward: it works in
memory mode, and combined with `sf_dir` it keeps unacknowledged data on disk until
the upload is confirmed, surviving a sender restart. `QwpSender.TotalDurableAcks()`
and `TotalDurableTrimAdvances()` expose durable-ack progress; on a standalone
sender, `qdb.WithProgressHandler` reports each watermark advance.

Durable-ack is **QWP-only** and requires a **replication primary** that advertises
support. Against a single endpoint that does not advertise it (e.g. a replica),
the connect fails terminally with a `*SenderError` of category
`PROTOCOL_VIOLATION` — the client never falls back to commit-only trimming, which
would drop data you believe is durable. With a multi-host `addr`, the connect
walks the full endpoint list and binds a durable-advertising primary if one is
reachable, failing terminally only when none do.

`durable_ack_keepalive_interval_millis` (default 200 ms; `0` disables) paces a
keepalive ping that prods an idle server into flushing pending durable-ack frames;
the standalone option form is `qdb.WithDurableAckKeepaliveInterval`. Leave it
enabled under `request_durable_ack`: with the keepalive off, a quiescent final
batch has nothing to elicit its `STATUS_DURABLE_ACK`, so `AwaitAckedFsn` can block
on that batch and `Close` may report a drain-timeout even after the data reached
the server. See the
[durable ACK keys](/docs/connect/clients/connect-string#durable-ack).

## Querying and SQL execution

Borrow a query session with `db.BorrowQuery(ctx)`. The returned `*Query`
delegates to the QWP [egress](/docs/connect/wire-protocols/qwp-egress-websocket/)
endpoint: `Query` returns a streaming cursor for SELECT statements; `Exec` runs
DDL and DML and returns an `ExecResult`. `Exec` blocks until the statement
completes, so you can sequence DDL and DML safely; `Query` submits the statement
and returns at once — batches stream as you iterate the cursor. `Close` returns
the session to the pool.

The self-contained program below walks the full query lifecycle using a
standalone `QwpQueryClient` over a minimal table. The pooled `BorrowQuery` idiom
on the `trades` model is used throughout the sections that follow:

<RemoteRepoExample name="qwp-query" lang="go" header={false} />

A borrowed query session runs **one query at a time** (the protocol is
single-in-flight in this release) and is **not safe for concurrent `Query` or
`Exec` calls**. To run queries in parallel, borrow one session per goroutine —
the query pool's `max` caps overall concurrency. `Cancel` (on the cursor) and
`Close` are safe to call from other goroutines. A cursor is single-use: once its
`Batches()` range ends, do not iterate it again.

Results stream as a sequence of batches. Process each batch as it arrives rather
than collecting an entire large result set in memory. For big result sets, bound
how fast the server pushes with [flow control](#flow-control).

### Executing SELECT queries

The simple, single-host idiom is to treat any non-`nil` error from the iteration
as terminal. This is always safe, including under failover:

```go
type Trade struct {
	TsMicros int64
	Symbol   string
	Price    float64
}

query, err := db.BorrowQuery(ctx)
if err != nil {
	return err
}
defer query.Close()

var trades []Trade
cursor := query.Query(ctx, "SELECT ts, symbol, price FROM trades LIMIT 1000")
defer cursor.Close()

for batch, err := range cursor.Batches() {
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

A `*QwpColumnBatch` is valid only during its iteration of the loop. Never store
the batch itself; use `batch.CopyAll()` for a retainable snapshot. Which
accessors alias the receive buffer and which return caller-owned data:

- **Alias the buffer** (copy with `bytes.Clone` before the loop advances if you
  keep them): `Str(col, row)` and `Binary(col, row)`.
- **Safe to retain:** `String(col, row)` returns a freshly allocated Go string.
  `Float64Array`, `Int64Array`, the `*Into` accessors, and the `QwpColumn`
  `*Range` accessors return caller-owned slices (freshly allocated, or appended
  into a buffer you supply).
- The fixed-width scalar accessors (`Int64`, `Float64`, …) return values, not
  views.

:::

For tight loops over a single column, `batch.Column(i)` returns a `QwpColumn`
that caches the column layout once, and `Int64Range` / `Float64Range` decode a
row range into a caller-owned slice in one shot:

```go
buf := make([]int64, 0, 4096)
for batch, err := range cursor.Batches() {
	if err != nil {
		return err
	}
	buf = batch.Column(1).Int64Range(0, batch.RowCount(), buf[:0])
	for _, v := range buf {
		// ...
	}
}
```

`cursor.Cancel()` aborts the query and is safe to call from another goroutine.
`cursor.TotalRows()` reports the row count once the cursor completes.

### Reading result batches

`QwpColumnBatch` and `QwpColumn` provide typed accessors for every QuestDB
column type. `QwpColumnBatch` accessors take `(col, row)`; the cached `QwpColumn`
accessors take `(row)`.

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
| `Geohash`                           | GEOHASH (bits right-aligned in a `uint64`) |
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
  `Decimal128Hi`/`Decimal128Lo`, and `DECIMAL256` with `Long256Word` (words
  0–3); apply the scale yourself.
- `GEOHASH` comes back as the packed bits right-aligned in a `uint64`
  (`Geohash(col, row)`), with the per-column precision from
  `GeohashPrecisionBits(col)`; decode to the text form client-side if you need
  it.
- A typed accessor on a NULL cell returns the zero value (`0`, `false`, `""`,
  `nil`), which is indistinguishable from a real zero. Call `IsNull(col, row)`
  first whenever NULL is meaningful.

Reassembling a UUID and scaling a decimal from a batch (`col`/`row` from the
iteration loop above):

```go
// UUID: recombine the two int64 halves into the 16-byte big-endian form.
var u [16]byte
binary.BigEndian.PutUint64(u[0:8], uint64(batch.UuidHi(col, row)))
binary.BigEndian.PutUint64(u[8:16], uint64(batch.UuidLo(col, row)))
id := uuid.UUID(u) // github.com/google/uuid; id.String() -> canonical text

// DECIMAL64: combine the unscaled integer with the per-column scale.
unscaled := batch.Int64(col, row)
scale := batch.DecimalScale(col)                  // fractional-digit count
value := decimal.New(unscaled, -int32(scale))     // github.com/shopspring/decimal
// DECIMAL128 uses Decimal128Hi/Decimal128Lo, DECIMAL256 uses Long256Word(0..3);
// apply the same DecimalScale(col) to the reassembled unscaled integer.
```

Column metadata is available via `ColumnName(col)`, `ColumnType(col)`, and
`ColumnCount()`.

### DDL and DML statements

Non-SELECT statements run through `Exec`, which returns an `ExecResult`:

```go
res, err := query.Exec(ctx,
	"CREATE TABLE trades (ts TIMESTAMP, symbol SYMBOL, side SYMBOL, "+
		"price DOUBLE, amount DOUBLE) TIMESTAMP(ts) PARTITION BY DAY WAL")
if err != nil {
	return err
}
fmt.Println(res.OpType, res.RowsAffected)
```

`RowsAffected` reports the count for INSERT, UPDATE, and DELETE. Pure DDL reports
0. `OpType` is the server's statement discriminator, useful for distinguishing
INSERT from UPDATE from pure DDL.

:::caution `Exec` is not retried across a reconnect by default

If the connection drops mid-statement, `Exec` returns an error — the transport
error, or `*QwpFailoverExhaustedError` once the failover budget is spent. This
means the statement was **interrupted and not confirmed**, not that it succeeded.
For a non-idempotent `INSERT`, re-issuing it may double-apply, so decide per
statement whether replay is safe. To make `Exec` retry transparently (only for
idempotent statements), set `replay_exec=on` in the connect string (or
`qdb.WithQwpQueryReplayExec(true)` on a standalone
[`QwpQueryClient`](#qwpqueryclient-low-level-primitive)).

:::

### Bind parameters

Parameterized queries use typed bind values, avoiding SQL injection and enabling
server-side factory cache reuse. Pass a `QwpBindFunc` via `qdb.WithQwpQueryBinds`:

```go
sql := "SELECT ts, symbol, price FROM trades " +
	"WHERE symbol = $1 AND price >= $2 LIMIT 1000"

for _, symbol := range []string{"EURUSD", "GBPUSD", "USDJPY"} {
	cursor := query.Query(ctx, sql, qdb.WithQwpQueryBinds(func(b *qdb.QwpBinds) {
		b.VarcharBind(0, symbol).DoubleBind(1, 1.0)
	}))
	for batch, err := range cursor.Batches() {
		if err != nil {
			break
		}
		// ...
	}
	cursor.Close()
}
```

Bind indices are 0-based and must be set in strictly ascending order; index `0`
maps to `$1`. Setters include `BooleanBind`, `ByteBind`, `ShortBind`, `IntBind`,
`LongBind`, `FloatBind`, `DoubleBind`, `CharBind`, `DateBind`,
`TimestampMicrosBind`, `TimestampNanosBind`, `VarcharBind`, `UuidBind`,
`Long256Bind`, `GeohashBind`, `DecimalBind` (and `Decimal64/128/256Bind`), plus a
`Null...Bind` variant for each type. There is no symbol bind: use `VarcharBind`
for symbol parameters. **Not bindable:** `BINARY` (no setter); `ARRAY` /
`DOUBLE[]` / `LONG[]` (bind frames carry no array shape — pass a SQL array
literal in the statement instead); `IPv4` (bind it as `INT` with `IntBind`). A
gap, a duplicate index, or any out-of-order call latches an error that surfaces
from `Query` or `Exec`.

### Flow control

For large result sets, byte-credit flow control prevents the server from
overwhelming the client. Set the initial credit (bytes) via the connect string,
which the facade applies to every pooled query session:

```text
ws::addr=localhost:9000;initial_credit=262144;
```

The server pauses after streaming the granted budget and replenishes after each
batch. A credit of `0` (the default) means unbounded: the server streams as fast
as the network allows, so set a credit when consuming a large result set on a
memory-constrained client. On a standalone
[`QwpQueryClient`](#qwpqueryclient-low-level-primitive) the equivalent option is
`qdb.WithQwpQueryInitialCredit(256*1024)`.

### Compression

Negotiate compression to reduce bandwidth for large result sets, via the
connect string. `compression` is one of `raw` (default, no compression), `zstd`,
or `auto` (advertise both and let the server choose). `compression_level` is the
zstd level hint — default `1`, accepted range `1`–`22`:

```text
ws::addr=localhost:9000;compression=zstd;compression_level=3;
```

Batches are decompressed automatically.

## Error handling

### Ingestion errors

WebSocket ingestion uses an asynchronous error model. Batch rejections are
**not** returned from `Flush`. They are delivered to a `SenderErrorHandler`
callback. Register one on the `QuestDB` handle (it is applied to every pooled
sender) with `qdb.WithQuestDBErrorHandler`. If you do not register one, a
built-in handler logs them, but your application is not notified and cannot
dead-letter or alert, so register one in any non-trivial producer:

```go
db, err := qdb.NewQuestDB(ctx, "ws::addr=localhost:9000;",
	qdb.WithQuestDBErrorHandler(func(e *qdb.SenderError) {
		log.Printf("rejected: category=%s table=%s msg=%s fsn=[%d,%d]",
			e.Category, e.TableName, e.ServerMessage, e.FromFsn, e.ToFsn)
	}))
```

Full `SenderError` field set, for logging, alerting, and support correlation:

| Field              | Type        | Use                                                                                                                                                                                   |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Category`         | `Category`  | Stable named class (`CategorySchemaMismatch`, `CategoryParseError`, `CategoryInternalError`, `CategorySecurityError`, `CategoryWriteError`, `CategoryProtocolViolation`, `CategoryUnknown`). The recommended switch target. |
| `ServerStatusByte` | `int`       | Numeric wire status (e.g. `0x03`). `NoStatusByte` (`-1`) for `CategoryProtocolViolation`.                                                                                              |
| `AppliedPolicy`    | `Policy`    | `PolicyHalt` or `PolicyDropAndContinue` — what the send loop did.                                                                                                                      |
| `ServerMessage`    | `string`    | Human-readable server text. **≤ 1024 UTF-8 bytes**, English, may be empty. Safe to log; not a stable pattern-match key (switch on `Category` / `ServerStatusByte`). May echo table / column names — sanitise before forwarding to third-party error trackers. |
| `TableName`        | `string`    | Rejected table; empty for unknown or multi-table batches.                                                                                                                             |
| `FromFsn`,`ToFsn`  | `int64`     | Inclusive FSN span; join to `FlushAndGetSequence` to identify the rejected rows.                                                                                                       |
| `MessageSequence`  | `int64`     | Server's per-frame wire sequence for the rejection frame. **Resets on reconnect** — only meaningful within one connection; round-trips verbatim against that connection's server-side logs. Not a standalone correlation key (see below). `NoMessageSequence` (`-1`) for protocol violations.                                       |
| `DetectedAt`       | `time.Time` | Client-side receipt time, for ops timelines (not for correlation).                                                                                                                     |

The protocol does not surface a server-issued request or connection identifier.
The closest correlation handle is the `(MessageSequence, FromFsn, ToFsn)` tuple
plus the connection start time from your application logs — `MessageSequence`
resets on reconnect, so it only disambiguates frames within a single connection.
The ingest client identifies itself with an `X-QWP-Client-Id: go/<version>`
header on the upgrade. When filing a support ticket, include the connection start time and the
`(MessageSequence, FromFsn, ToFsn)` triple.

The per-category policy is configurable. Resolution precedence is the policy
resolver, then the per-category policy, then the connect-string `on_*_error`
keys, then the spec defaults. `CategoryProtocolViolation` and `CategoryUnknown`
are always `PolicyHalt`. These policies are set on the standalone sender options
(`qdb.WithErrorPolicy`, `qdb.WithErrorPolicyResolver`, `qdb.WithErrorInboxCapacity`)
or via the connect-string `on_*_error` keys that the facade forwards to every
pooled sender:

```go
qdb.WithErrorPolicy(qdb.CategorySchemaMismatch, qdb.PolicyDropAndContinue)
qdb.WithErrorPolicyResolver(func(c qdb.Category) qdb.Policy { ... })
qdb.WithErrorInboxCapacity(512)
```

After a `PolicyHalt` rejection, the sender stops draining and the next producer
call returns the same payload as a typed error. Unwrap it with `errors.As`, then
`Close` (which returns the broken sender to the pool to be discarded) and borrow
a new one to continue:

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
counted by `QwpSender.DroppedErrorNotifications()`. The inbox holds 256
notifications by default; raise it with the `error_inbox_capacity` connect-string
key — forwarded to every pooled sender — or, on a standalone sender, the
`qdb.WithErrorInboxCapacity` option (range 16–1,048,576).

### Query errors

Server-side query failures surface as a `*QwpQueryError` from the `Batches()`
iteration or the `Exec` return value:

```go
for batch, err := range cursor.Batches() {
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
`Status`, not on message text). Errors can arrive before any data or mid-stream.
Once an error is yielded, no further batches arrive for that query.

### Connection-level errors

- **Authentication failure**: a `401` or `403` response before the WebSocket
  upgrade completes. Terminal across all endpoints.
- **Role mismatch**: a `*QwpRoleMismatchError` when no configured endpoint
  satisfies the `target=` filter. Because the query pool prewarms
  `query_pool_min` sessions at construction, it surfaces from `Connect` (or from
  the first `BorrowQuery` under `lazy_connect`, where `query_pool_min` is `0`).
  It reports the endpoints tried, the last observed server role, and the last
  transport error.

## Failover and high availability

:::note Enterprise
Multi-host failover with automatic reconnect requires QuestDB Enterprise.
:::

Single-host applications need nothing from this section. The simple loops shown
earlier are already correct: treating any iteration error as terminal is always
safe, including when a reconnect happens.

If you connect to multiple hosts for failover, a correct application must do
exactly three things beyond the single-host code. This is the whole list:

1. **Ingestion: no loop changes.** Configure multiple endpoints and a reconnect
   policy; reconnection is transparent to the producer. You still need the
   universal asynchronous error handling from
   [Ingestion errors](#ingestion-errors). Details:
   [Ingestion failover](#ingestion-failover).
2. **Querying: handle `*QwpFailoverReset`, but only if you accumulate rows.** If
   you build up rows across batches, discard them on a reset and continue
   iterating. If you process each batch and keep nothing, the simple
   terminal-on-error loop is already correct. Pattern:
   [Query failover](#query-failover).
3. **DDL/DML: `Exec` is not retried by default.** An error from `Exec` after a
   mid-statement disconnect means the statement was not confirmed, not that it
   succeeded. Re-issue it only if it is idempotent, or opt into `replay_exec=on`.
   Details: [the Exec caution](#ddl-and-dml-statements).

Everything below is the detail behind these three points.

### Multiple endpoints

Specify comma-separated addresses in the connect string:

```text
ws::addr=db-primary:9000,db-replica-1:9000,db-replica-2:9000;
```

The pool tries endpoints in order and walks the list to find the next healthy one
on connection loss.

### Ingestion failover

The ingestion sender uses a reconnect loop with exponential backoff. Configure it
via the connect string:

| Key                                | Default  | Description                          |
| ---------------------------------- | -------- | ------------------------------------ |
| `reconnect_max_duration_millis`    | `300000` | Total outage budget before giving up |
| `reconnect_initial_backoff_millis` | `100`    | First post-failure sleep             |
| `reconnect_max_backoff_millis`     | `5000`   | Cap on per-attempt sleep             |
| `initial_connect_retry`            | `off`    | First-connect retry: `off` fails fast; `on`/`sync` retries blocking the constructor; `async` returns immediately and buffers |

Ingress is zone-blind — it never sees the server's role or zone information —
and ignores the `zone=` key, so a connect string shared with the query pool
works unchanged. Reconnect is transparent to the producer; you do not change the
ingestion loop for it.

### Query failover

The query pool drives a per-query reconnect loop. On a mid-stream transport error
it reconnects and replays the query.

| Key                           | Default | Description                       |
| ----------------------------- | ------- | --------------------------------- |
| `failover`                    | `on`    | Master switch for reconnect       |
| `failover_max_attempts`       | `8`     | Max reconnect attempts per query  |
| `failover_backoff_initial_ms` | `50`    | First post-failure sleep          |
| `failover_backoff_max_ms`     | `1000`  | Cap on per-attempt sleep          |
| `failover_max_duration_ms`    | `30000` | Total wall-clock failover budget per query (`0` = unbounded) |
| `target`                      | `any`   | Role filter: `any`, `primary`, `replica` |

You only need the pattern below if you **accumulate rows across batches and want
the query to continue transparently across a reconnect**. When failover occurs
mid-stream, `Batches()` yields a non-fatal `*QwpFailoverReset` before the replayed
batches arrive. Detect it with `errors.As`, discard the rows you accumulated from
the prior connection (the server replays from the beginning), and continue
iterating:

```go
for batch, err := range cursor.Batches() {
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

:::warning Without the reset branch, accumulated rows are duplicated

If you accumulate rows across batches and do **not** handle `*QwpFailoverReset`,
the rows you kept from the prior connection stay in your buffer while the server
replays the **entire** result set from the beginning after the reconnect. The
replayed rows are appended to the ones you already have, so every pre-failover row
ends up in your result set twice. Either clear the accumulator on the reset (as
shown above), or use the simple terminal-on-error loop, which discards everything
on any error and so cannot duplicate.

:::

If you do not need transparent continuation, the simple loop is correct: returning
on any error treats a reset as terminal, which the client supports explicitly.
When the failover budget is consumed, `Batches()` (and `Exec`) return
`*QwpFailoverExhaustedError`. The pool discards the exhausted query session when
you `Close` it, so the next `BorrowQuery` hands back a healthy one. This differs
from ingestion, where the sender has a continuous reconnect loop
(`reconnect_max_duration_millis`, default 5 minutes) that spans full outages
transparently. The query side reconnects only within the scope of a single query.

:::note Failover with a single endpoint

With a single `addr`, the failover loop retries the same host with backoff — up
to `failover_max_attempts` / `failover_max_duration_ms` — which rides out a
server restart. Multiple addresses additionally let a query move to another
healthy node.

:::

### Connection events

Register a `SenderConnectionListener` on the `QuestDB` handle with
`qdb.WithQuestDBConnectionListener` to watch connect, disconnect, reconnect, and
failover transitions across every pooled sender:

```go
db, err := qdb.NewQuestDB(ctx, "ws::addr=db-1:9000,db-2:9000;",
	qdb.WithQuestDBConnectionListener(func(e qdb.SenderConnectionEvent) {
		switch e.Kind {
		case qdb.SenderConnected, qdb.SenderReconnected, qdb.SenderFailedOver:
			log.Printf("qwp up: %s endpoint=%s:%d", e.Kind, e.Host, e.Port)
		case qdb.SenderAuthFailed, qdb.SenderReconnectBudgetExhausted:
			// Terminal: the sender has stopped draining. Page on-call.
			log.Printf("qwp TERMINAL: %s cause=%v", e.Kind, e.Cause)
		}
	}))
```

`SenderConnectionEvent.Kind` is one of `SenderConnected`, `SenderDisconnected`,
`SenderReconnected`, `SenderFailedOver`, `SenderEndpointAttemptFailed`,
`SenderAllEndpointsUnreachable`, `SenderAuthFailed`, or
`SenderReconnectBudgetExhausted`. The event also carries `Host`/`Port` (and
`PreviousHost`/`PreviousPort` for a failover), `AttemptNumber`, `RoundNumber`,
`Cause` (for failure/terminal kinds), and `TimestampMillis`.

The listener runs on a dedicated dispatcher goroutine, never on the I/O or
producer goroutine. The dispatch inbox is bounded and drop-oldest, so under inbox
pressure any event — success, failure, or terminal — can be dropped; dropped
events are counted by `QwpSender.DroppedConnectionNotifications()`. The inbox
holds 256 events by default; raise it with the `connection_listener_inbox_capacity`
connect-string key — forwarded to every pooled sender — or, on a standalone
sender, the `qdb.WithConnectionListenerInboxCapacity` option (range
16–1,048,576). Terminal state does not depend on catching the event: it is also
reported on demand by `LastTerminalError()` and by the next typed producer error.

A borrowed sender also exposes polling counters once type-asserted to
`qdb.QwpSender`: `TotalReconnectAttempts`, `TotalReconnectsSucceeded`,
`TotalFramesReplayed`, `TotalBackpressureStalls`, `TotalServerErrors`,
`TotalDurableAcks`, `TotalDurableTrimAdvances`, and `LastTerminalError`. With
`drain_orphans=on`, `BackgroundDrainers()` snapshots the goroutines adopting
unacked data from crashed sibling senders; on a standalone sender,
`qdb.WithBackgroundDrainerListener` surfaces their durable-ack drain outcomes.

For background and worked configurations, see
[client failover concepts](/docs/high-availability/client-failover/concepts/),
[client failover configuration](/docs/high-availability/client-failover/configuration/),
and the
[multi-host failover](/docs/connect/clients/connect-string#failover-keys) and
[reconnect](/docs/connect/clients/connect-string#reconnect-keys) keys of the
connect string reference.

## Concurrency

The `QuestDB` handle is the **only** thread-safe object in the client. Borrow a
sender or query session per goroutine; the leases themselves are single-threaded:

- **Senders**: not safe for concurrent use. Borrow one per concurrent producer.
  Sharing a borrowed sender across goroutines corrupts the buffer and interleaves
  rows.
- **Queries**: one in-flight query per borrowed session. `Cancel` (on the cursor)
  and `Close` are safe to call from other goroutines, which is how you cancel an
  in-flight query or shut down cleanly.
- **Pool sizing**: the sender and query pools cap total in-flight ingest and
  query concurrency at their respective `max`. Raise `WithQueryPoolMax` and submit
  from as many goroutines as you have workers to scale parallel query throughput.

:::note Phase 1 limitation
A single underlying query client serves one in-flight query at a time. The pool
runs N clients in parallel, so concurrency equals the query pool's `max`. The wire
protocol allows demultiplexed concurrent queries on one client; multi-query
support per client is planned for a future release.
:::

## Low-level primitives

The `QuestDB` facade is built on the same `LineSender` and `QwpQueryClient` types
you can construct directly. Use them when you need a single-shot lifecycle without
pooling overhead — for example, an ETL job that opens, ingests, and exits — or the
ILP (HTTP/TCP) transports, which the QWP-only facade does not expose.

### `LineSender` (low-level primitive)

Construct a standalone sender from a connect string or the options API. The
options API is the only way to register an error handler or connection listener on
a standalone sender; `NewLineSender` requires exactly one transport option
(`qdb.WithQwp()` here), while `LineSenderFromConf` infers the transport from the
`ws`/`wss` schema:

```go
// From a connect string.
sender, err := qdb.LineSenderFromConf(ctx, "ws::addr=localhost:9000;")

// From an environment variable (QDB_CLIENT_CONF).
sender, err := qdb.LineSenderFromEnv(ctx)

// From the options API, for callbacks the connect string can't express.
// Multiple endpoints go in one comma-separated address string.
sender, err := qdb.NewLineSender(ctx,
	qdb.WithQwp(),
	qdb.WithAddress("db-primary:9000,db-replica:9000"),
	qdb.WithTls(),
	qdb.WithBearerToken("YOUR_BEARER_TOKEN"),
	qdb.WithAutoFlushRows(500),
	qdb.WithErrorHandler(func(e *qdb.SenderError) { /* ... */ }),
	qdb.WithConnectionListener(func(e qdb.SenderConnectionEvent) { /* ... */ }))
```

A standalone `LineSender` owns a single connection and is closed (and
disconnected) by its own `Close`. The same row-building API, `QwpSender`
type-assertion, and store-and-forward behavior described above all apply.

`qdb.WithInitialConnectMode` selects `InitialConnectOff` (default),
`InitialConnectSync` (block the constructor while retrying), or
`InitialConnectAsync` (return immediately and buffer rows until connected).

### `QwpQueryClient` (low-level primitive)

Construct a standalone query client from a connect string or the options API:

```go
client, err := qdb.QwpQueryClientFromConf(ctx, "ws::addr=localhost:9000;")

client, err := qdb.NewQwpQueryClient(ctx,
	qdb.WithQwpQueryAddress("localhost:9000"),
	qdb.WithQwpQueryInitialCredit(256*1024))
defer client.Close(ctx)

cursor := client.Query(ctx, "SELECT * FROM trades LIMIT 10")
defer cursor.Close()
for batch, err := range cursor.Batches() {
	// ...
}
```

This is the path the `QuestDB` facade uses internally. The `Query`, `Exec`, and
`Batches` APIs are identical to a borrowed query session; the difference is that
you manage `connect`/`Close` and the client's lifecycle yourself instead of
leasing from the pool.

## Configuration reference

For the full list of connect-string keys and their defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

Common keys for the pooled facade:

| Key                             | Default  | Description                          |
| ------------------------------- | -------- | ------------------------------------ |
| `sender_pool_min` / `_max`      | `1` / `4`| Ingest pool size bounds              |
| `query_pool_min` / `_max`       | `1` / `4`| Query pool size bounds               |
| `acquire_timeout_ms`            | `5000`   | Borrow wait when the pool is at `max`|
| `idle_timeout_ms`               | `60000`  | Idle connection reap (0 = never)     |
| `max_lifetime_ms`               | `1800000`| Max connection age (0 = no limit)    |
| `housekeeper_interval_ms`       | `5000`   | Reaper sweep interval                |
| `lazy_connect`                  | `false`  | Tolerate a down server at startup    |
| `connect_timeout`              | unset    | TCP-connect budget (milliseconds)    |
| `auto_flush_rows`               | `1000`   | Rows before auto-flush               |
| `auto_flush_interval`           | `100`    | Milliseconds before auto-flush       |
| `auto_flush_bytes`              | `8388608`| Bytes before auto-flush (QWP 8 MiB; HTTP disabled) |
| `sf_dir`                        | unset    | Store-and-forward directory          |
| `sender_id`                     | `default`| Sender slot identity for SF          |
| `request_durable_ack`           | `off`    | Wait for durable object-storage upload ACK (Enterprise, QWP, replication primary) |
| `durable_ack_keepalive_interval_millis` | `200` | Durable-ack keepalive ping pacing (`0` disables) |
| `reconnect_max_duration_millis` | `300000` | Ingress reconnect budget             |
| `failover`                      | `on`     | Query per-query reconnect switch     |
| `compression`                   | `raw`    | Query batch compression (`raw`, `zstd`, `auto`) |
| `compression_level`             | `1`      | zstd level hint (`1`–`22`)           |
| `error_inbox_capacity`          | `256`    | Error-notification inbox size (`0` = default; 16–1,048,576); forwarded to each pooled sender |
| `connection_listener_inbox_capacity` | `256` | Connection-event inbox size (`0` = default; 16–1,048,576); forwarded to each pooled sender |
| `client_id`                     | `go/<ver>` | `X-QWP-Client-Id` on the query-side upgrade (ingest always sends the default) |

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
| Connection pooling    | `LineSenderPool` (HTTP-only) | `QuestDB` facade |
| Multi-endpoint failover | Limited         | Full reconnect loop     |
| Querying              | Not available     | `BorrowQuery` / `QwpQueryClient` |

The biggest behavioral change is the error model: on HTTP, `Flush` returns the
rejection synchronously; on QWP it does not. To migrate, change the connect string
from `http::` to `ws::` (or `https::` to `wss::`), register a
`SenderErrorHandler`, and adjust auto-flush settings if needed. `QwpSender` is a
superset of `LineSender`, so existing ingestion code keeps working. Note that the
legacy `LineSenderPool` is HTTP-only; the QWP path uses the
[`QuestDB` handle](#the-questdb-handle) for pooling instead.

## Full example: pooled ingestion and querying with failover

This example uses the `QuestDB` handle with store-and-forward durability and a
connection listener, borrowing a sender to ingest and a query session to read the
data back.

```go
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"time"

	qdb "github.com/questdb/go-questdb-client/v4"
)

func main() {
	ctx := context.Background()

	// One handle for the whole deployment. Multi-host + wss + token are
	// Enterprise; sf_dir adds durability across outages.
	db, err := qdb.NewQuestDB(ctx,
		"wss::addr=db-primary:9000,db-replica:9000;"+ // Enterprise: multi-host
			"token=YOUR_BEARER_TOKEN;"+               // Enterprise: token auth
			"sf_dir=/var/lib/myapp/qdb-sf;"+          // durability across outages
			"sender_id=ingest;"+                      // SF slot base
			"target=replica;",                        // queries prefer a replica
		qdb.WithSenderPoolMax(8),
		qdb.WithQueryPoolMax(8),
		qdb.WithQuestDBErrorHandler(func(e *qdb.SenderError) {
			fmt.Printf("batch rejected: category=%s table=%s msg=%s\n",
				e.Category, e.TableName, e.ServerMessage)
		}),
		qdb.WithQuestDBConnectionListener(func(e qdb.SenderConnectionEvent) {
			log.Printf("connection: %s endpoint=%s:%d", e.Kind, e.Host, e.Port)
		}))
	if err != nil {
		panic(err)
	}
	defer db.Close(ctx)

	// ─── Schema ──────────────────────────────────────────────────────
	// Borrow one query session for both the DDL and the read-back. An
	// auto-created table would name the designated timestamp `timestamp`;
	// create it explicitly so the column is named `ts`.
	query, err := db.BorrowQuery(ctx)
	if err != nil {
		panic(err)
	}
	defer query.Close()

	if _, err := query.Exec(ctx,
		"CREATE TABLE IF NOT EXISTS book "+
			"(ts TIMESTAMP, ticker SYMBOL, price DOUBLE, size DOUBLE) "+
			"TIMESTAMP(ts) PARTITION BY DAY WAL"); err != nil {
		panic(err)
	}

	// ─── Ingest ──────────────────────────────────────────────────────
	sender, err := db.BorrowSender(ctx)
	if err != nil {
		panic(err)
	}
	for i := 0; i < 100; i++ {
		price := 1.0842 + (rand.Float64()-0.5)*0.002
		if err := sender.Table("book").
			Symbol("ticker", "EURUSD").
			Float64Column("price", price).
			Float64Column("size", 100000+rand.Float64()*900000).
			At(ctx, time.Now()); err != nil {
			fmt.Printf("row error: %s\n", err)
		}
	}
	// Flush and wait for the server to acknowledge every buffered row before
	// reading it back. Flush and Close publish asynchronously and do not wait
	// for the ack, so an immediate read could race the commit (see Flushing).
	qs := sender.(qdb.QwpSender)
	fsn, err := qs.FlushAndGetSequence(ctx)
	if err != nil {
		panic(err)
	}
	if err := qs.AwaitAckedFsn(ctx, fsn); err != nil {
		panic(err)
	}
	if err := sender.Close(ctx); err != nil { // return to pool
		fmt.Printf("sender close error: %s\n", err)
	}

	// ─── Query ───────────────────────────────────────────────────────
	cursor := query.Query(ctx,
		"SELECT ts, ticker, price FROM book ORDER BY ts DESC LIMIT 10")
	defer cursor.Close()

	// Accumulate across batches, so a mid-query failover must clear the
	// partial results: the server replays the result set from the beginning.
	var lines []string
	for batch, err := range cursor.Batches() {
		if err != nil {
			var reset *qdb.QwpFailoverReset
			if errors.As(err, &reset) {
				lines = lines[:0]
				continue
			}
			fmt.Printf("query failed: %s\n", err)
			return
		}
		for row := 0; row < batch.RowCount(); row++ {
			ts := time.UnixMicro(batch.Int64(0, row))
			lines = append(lines, fmt.Sprintf("%s  %s  price=%.5f",
				ts.Format("2006-01-02T15:04:05.000Z"),
				batch.String(1, row), batch.Float64(2, row)))
		}
	}
	for _, line := range lines {
		fmt.Println(line)
	}
}
```
