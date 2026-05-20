---
slug: /connect/clients/dotnet
title: .NET client for QuestDB
sidebar_label: .NET
description:
  "QuestDB .NET client for high-throughput data ingestion and SQL querying
  over the QWP binary protocol (WebSocket)."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"
import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB .NET client connects to QuestDB over the
[QWP binary protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) (WebSocket).
QWP is a column-oriented binary wire format: smaller and faster than the text
ILP used by `http::` and `tcp::`, with the full QuestDB type system, automatic
table creation, schema evolution, multi-host failover, and optional
store-and-forward durability.

Two complementary clients live in the same NuGet package:

- **Ingestion** (`Sender` / `IQwpWebSocketSender`): column-oriented batched
  writes with automatic table creation, schema evolution, and optional
  store-and-forward durability.
- **Querying** (`QueryClient` / `IQwpQueryClient`): parameterised SQL over the
  QWP egress endpoint (`/read/v1`), with streaming columnar batches, DDL/DML
  execution, per-query failover, and credit-based flow control. See
  [Querying and SQL execution](#querying-and-sql-execution).

:::tip Legacy transports

The same `Sender` also speaks ILP over HTTP and TCP. This page documents the
recommended WebSocket (QWP) path; ILP keeps working unchanged for existing
deployments. For ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

<ILPClientsTable language=".NET" />

## Requirements

- **.NET 7.0 or higher** for the `ws::` / `wss::` (QWP) transport — it depends
  on header-aware `ClientWebSocket` APIs. The HTTP and TCP transports work on
  .NET 6.0+.
- QuestDB must be running. If not, see the
  [quick start guide](/docs/getting-started/quick-start/).

## Client installation

Install the NuGet package with the dotnet CLI:

```shell
dotnet add package net-questdb-client
```

## Quick start

### Ingest data

Build a sender from a connect string, append rows, and flush:

```csharp
using System;
using QuestDB;
using QuestDB.Senders;

await using var sender = Sender.New("ws::addr=localhost:9000;");

await sender.Table("trades")
    .Symbol("symbol", "ETH-USD")
    .Symbol("side", "sell")
    .Column("price", 2615.54)
    .Column("amount", 0.00044)
    .AtAsync(DateTime.UtcNow);

await sender.Table("trades")
    .Symbol("symbol", "BTC-USD")
    .Symbol("side", "buy")
    .Column("price", 39269.98)
    .Column("amount", 0.001)
    .AtAsync(DateTime.UtcNow);

await sender.SendAsync();
```

The steps are:

1. Build a sender from a connect string (`ws::` for plain, `wss::` for TLS).
2. Append rows with the fluent `Table` / `Symbol` / `Column` / `At` builder.
3. Call `SendAsync()` (or rely on auto-flush) to publish.
4. Dispose the sender — `await using` drains in-flight frames on close.

We recommend supplying the event's own timestamp to `AtAsync`. Ingestion-time
timestamps preclude deduplication, which is
[important for exactly-once processing](/docs/connect/compatibility/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

### Query data

Read the same rows back over the QWP egress endpoint. `QueryClient` lives in
the same NuGet package:

```csharp
using QuestDB;
using QuestDB.Qwp.Query;

await using var client = await QueryClient.NewAsync("ws::addr=localhost:9000;");

await client.ExecuteAsync(
    "SELECT ts, symbol, price, amount FROM trades WHERE symbol = 'ETH-USD' LIMIT 10",
    new PrintHandler());

internal sealed class PrintHandler : QwpColumnBatchHandler
{
    public override void OnBatch(QwpColumnBatch batch)
    {
        for (var row = 0; row < batch.RowCount; row++)
        {
            Console.WriteLine(
                $"ts={batch.GetLongValue(0, row)} "
                + $"symbol={batch.GetString(1, row)} "
                + $"price={batch.GetDoubleValue(2, row)} "
                + $"amount={batch.GetDoubleValue(3, row)}");
        }
    }

    public override void OnEnd(long totalRows) =>
        Console.WriteLine($"done: {totalRows} rows");

    public override void OnError(byte status, string message) =>
        Console.Error.WriteLine($"query failed: 0x{status:X2} {message}");
}
```

See [Querying and SQL execution](#querying-and-sql-execution) for the full
egress surface (bind parameters, DDL/DML, failover, compression).

:::note

`Sender` is single-threaded and owns one connection. To send in parallel,
create one sender per producer thread. If those senders share a
[store-and-forward](#store-and-forward) directory, each must be configured
with a distinct `sender_id` so they do not contend for the same on-disk
slot — see [Store-and-forward](#store-and-forward).

:::

## Authentication and TLS

Authentication happens at the HTTP level during the WebSocket upgrade, before
any binary frames are exchanged.

### Basic authentication

```csharp
using var sender = Sender.New(
    "wss::addr=db.example.com:9000;username=admin;password=quest;");
```

### Token authentication

_QuestDB Enterprise only._ Token auth avoids the per-request overhead of basic
auth and is the recommended path for Enterprise deployments.

```csharp
using var sender = Sender.New(
    "wss::addr=db.example.com:9000;token=your_bearer_token;");
```

`username`/`password` and `token` are mutually exclusive.

### TLS

Select the `wss` schema to enable TLS.

- `tls_verify` — `on` (default) or `unsafe_off`. `unsafe_off` disables
  certificate verification; use only for testing.
- `tls_roots` — path to a PKCS#12 / PFX bundle pinning a custom CA.
- `tls_roots_password` — password for the `tls_roots` file.

```csharp
// Development only — never disable verification in production.
using var sender = Sender.New("wss::addr=localhost:9000;tls_verify=unsafe_off;");
```

`auth_timeout_ms` (default 15000) bounds how long the client waits for the
WebSocket upgrade response.

### Unsupported authentication paths

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or in-band refresh | Not supported by this client. It does not negotiate with an identity provider and has no callback to refresh a token mid-session. | QuestDB itself supports OIDC — see [OpenID Connect](/docs/security/oidc/). Acquire an access token out-of-band from your IdP, pass it via `token=...` above, and rebuild the sender / query client when the token nears expiry. |
| Mutual TLS (client certificates) | Not supported. The QuestDB server does not negotiate client certificates regardless of client. | Use bearer-token auth over `wss://`. See the connect-string reference for the canonical statement. |
| Token rotation mid-session | Not supported. Credentials are presented once during the WebSocket upgrade and are not re-sent. | On token expiry, `await sender.DisposeAsync()` and build a fresh sender with the new token. The same applies to `QueryClient`. |

### Production example (TLS + token + multi-host)

A realistic Enterprise deployment combines `wss`, token auth, multi-host
failover, and a store-and-forward directory so unacked frames survive a
sender restart:

```csharp
// Ingestion — write to any writeable node.
await using var sender = Sender.NewQwp(
    "wss::addr=db-primary:9000,db-replica:9000;"
    + "token=your_bearer_token;"
    + "sf_dir=/var/lib/myapp/qdb-sf;"
    + "sender_id=ingest-1;"
    + "reconnect_max_duration_millis=300000;");

// Querying — prefer a replica to offload the primary.
await using var query = await QueryClient.NewAsync(
    "wss::addr=db-primary:9000,db-replica:9000;"
    + "token=your_bearer_token;"
    + "target=replica;"
    + "failover=on;failover_max_duration_ms=30000;");
```

`tls_verify=unsafe_off` is **never** safe in production; pin a CA with
`tls_roots=/path/to/roots.pfx;tls_roots_password=...` if you need to override
the system trust store.

## Ways to create the client

There are three ways to create a client instance:

1. **From a connect string** — the most common way. It describes the whole
   configuration in one string and is portable across language clients.

   ```csharp
   using var sender = Sender.New("ws::addr=localhost:9000;");
   ```

2. **From an environment variable.** `QDB_CLIENT_CONF` holds the connect
   string, keeping credentials out of source code.

   ```bash
   export QDB_CLIENT_CONF="wss::addr=localhost:9000;token=your_bearer_token;"
   ```

   ```csharp
   using var sender = Sender.FromEnv();
   ```

   To set properties programmatically on top of a connect string, use
   `Configure` and `Build`:

   ```csharp
   using var sender =
       (Sender.Configure("ws::addr=localhost:9000;") with { auto_flush = AutoFlushType.off })
       .Build();
   ```

3. **From `SenderOptions`** — bind options from configuration:

   ```json
   {
     "QuestDB": { "addr": "localhost:9000", "protocol": "ws" }
   }
   ```

   ```csharp
   var options = new ConfigurationBuilder()
       .AddJsonFile("config.json")
       .Build()
       .GetSection("QuestDB")
       .Get<SenderOptions>();
   await using var sender = Sender.New(options);
   ```

`Sender.New` and `Sender.FromEnv` return `ISender`. For the QWP-only
operations — ping, `seqTxn` watermarks, FSN tracking, decimal columns — call
`Sender.NewQwp(connectString)` (or `Sender.NewQwp(options)`) instead: it takes
the same `ws::` / `wss::` configuration and returns `IQwpWebSocketSender`
directly, so you skip the `is IQwpWebSocketSender` cast.

For the full list of connect-string keys and defaults, see the
[connect string reference](/docs/connect/clients/connect-string/).

## Data ingestion

### Building rows

A row starts with a table name, then symbols, then other columns, and is
finished with a timestamp:

```csharp
await sender.Table("trades")     // 1. select the target table
    .Symbol("symbol", "ETH-USD") // 2. symbols first
    .Column("price", 2615.54)    // 3. other columns
    .AtAsync(DateTime.UtcNow);   // 4. finish the row
```

- **`Table(name)`** — must be called first for each row.
- **`Symbol(name, value)`** — a [symbol](/docs/concepts/symbol/) is a
  dictionary-encoded string; all symbols must come before other columns.
- **`Column(name, value)`** — overloaded for every QuestDB type reachable
  from `ISender`; see [Type reference](#type-reference) for the full matrix
  and the additional `IQwpWebSocketSender` setters.
- **`At(...)` / `AtAsync(...)`** — finishes the row with the
  [designated timestamp](/docs/concepts/designated-timestamp/). `AtNow()` /
  `AtNowAsync()` let the server assign it (this defeats deduplication).

Tables and columns are created automatically if they do not exist. Use the
`Async` overloads (`AtAsync`, `SendAsync`) to avoid blocking the calling
thread.

### Type reference

`ISender` covers the everyday types from the .NET runtime overloads.
`IQwpWebSocketSender` adds the QWP-only types that ILP cannot carry — cast
the sender (or build it with `Sender.NewQwp(...)`) to reach them:

| QuestDB type | `ISender` setter | `IQwpWebSocketSender` setter | Null variant |
|---|---|---|---|
| `SYMBOL` | `Symbol(name, ReadOnlySpan<char>)` | — | omit the call |
| `BOOLEAN` | `Column(name, bool)` | — | `NullableColumn(name, bool?)` |
| `BYTE` (i8) | — | `ColumnByte(name, sbyte)` | omit the call |
| `SHORT` (i16) | — | `ColumnShort(name, short)` | omit the call |
| `INT` (i32) | `Column(name, int)` | — | omit the call (use `long?` overload for nullable) |
| `LONG` (i64) | `Column(name, long)` | — | `NullableColumn(name, long?)` |
| `FLOAT` (f32) | — | `ColumnFloat(name, float)` | omit the call |
| `DOUBLE` (f64) | `Column(name, double)` | — | `NullableColumn(name, double?)` |
| `CHAR` | `Column(name, char)` | — | `NullableColumn(name, char?)` |
| `VARCHAR` | `Column(name, ReadOnlySpan<char>)` | — | `NullableColumn(name, string?)` |
| `BINARY` | — | `ColumnBinary(name, ReadOnlySpan<byte>)` | omit the call |
| `UUID` | `Column(name, Guid)` | — | `NullableColumn(name, Guid?)` |
| `LONG256` | — | `ColumnLong256(name, BigInteger)` (non-negative) | omit the call |
| `DATE` | — | `ColumnDate(name, long millisSinceEpoch)` | omit the call |
| `TIMESTAMP` (non-designated) | `Column(name, DateTime)` / `Column(name, DateTimeOffset)` | — | `NullableColumn(name, DateTime?)` / `NullableColumn(name, DateTimeOffset?)` |
| `TIMESTAMP_NS` (non-designated) | `ColumnNanos(name, long timestampNanos)` | — | omit the call |
| `IPv4` | — | `ColumnIPv4(name, System.Net.IPAddress)` | omit the call |
| `GEOHASH` | — | `ColumnGeohash(name, ulong hash, int precisionBits)` (1–60 bits) | omit the call |
| `DECIMAL64` | — | `ColumnDecimal64(name, decimal)` / `ColumnDecimal64(name, long unscaled, byte scale)` | omit the call |
| `DECIMAL128` | `Column(name, decimal)` (default for `decimal`) | `ColumnDecimal128(name, long lo, long hi, byte scale)` (full 38-digit range) | `NullableColumn(name, decimal?)` |
| `DECIMAL256` | — | `ColumnDecimal256(name, decimal)` / `ColumnDecimal256(name, long, long, long, long, byte scale)` | omit the call |
| `DOUBLE[]` / `LONG[]` (n-D arrays) | `Column<T>(name, ReadOnlySpan<T>)` / `Column<T>(name, IEnumerable<T>, IEnumerable<int> shape)` / `Column(name, Array)` | — | `NullableColumn(name, Array?)` |
| Designated timestamp | `AtAsync(DateTime)` / `At(DateTime)` / `AtAsync(DateTimeOffset)` / `At(DateTimeOffset)` / `AtAsync(long micros)` / `At(long micros)` / `AtNanosAsync(long)` / `AtNanos(long)` | — | **required, not null** |

The single-arg `Column(name, decimal)` writes `DECIMAL128` so it never
overflows `System.Decimal` (~29 significant digits) — see
[Decimal columns](#decimal-columns) for picking a narrower width.

### Null values

The .NET client has no `setNull` method. Two idioms produce a NULL:

1. **`NullableColumn(name, T?)`** — the wrapper writes a value when the
   nullable argument is set and skips the column when it is `null`:

   ```csharp
   sender.Table("trades")
       .Symbol("symbol", "ETH-USD")
       .NullableColumn("price", maybePrice)  // null → column omitted
       .NullableColumn("notes", maybeNotes);  // null → column omitted
   await sender.AtAsync(DateTime.UtcNow);
   ```

2. **Omit the setter** — every column not set on a row is gap-filled with
   NULL when the row is finished. The two idioms produce the same wire
   output; `NullableColumn` just makes the optionality explicit at the call
   site.

On a brand-new table, an omitted column is not inferred from that row. The
server only adds the column when a later row supplies a non-null value for
it, so first-row nulls leave the column absent until then.

The designated timestamp **cannot** be null — every row requires one of
`AtAsync(DateTime)`, `AtAsync(DateTimeOffset)`, `AtAsync(long micros)`, or
`AtNanosAsync(long)`.

`Symbol(name, value)` and the string overload of `Column(name, value)` take
`ReadOnlySpan<char>`, which cannot itself be null; an empty span is a valid
non-null empty string. Use `NullableColumn(name, string?)` if your value can
be `null`.

### Decimal columns

:::caution

Decimal ingestion requires QuestDB 9.2.0 or later. Pre-create decimal columns
with `DECIMAL(precision, scale)`. See the
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals)
page.

:::

`Column(name, decimal)` writes a `DECIMAL128` (16-byte) column:

```csharp
sender.Table("fx_prices")
    .Symbol("pair", "EURUSD")
    .Column("bid", 1.071234m)    // scale locked on first write
    .Column("ask", 1.071258m);
await sender.AtAsync(DateTime.UtcNow);
```

`DECIMAL128` matches the range of .NET's `System.Decimal` (~29 significant
digits). `DECIMAL64` holds only 18 digits, so it cannot be the safe default —
a large `decimal` would overflow it.

:::tip Narrower columns

If your values fit in 18 digits — typical for prices and quantities — the
8-byte `DECIMAL64` halves wire and storage size. Either pre-create the column
as `DECIMAL(p, s)` with `p ≤ 18` (the stored width follows the column
definition, not the wire width), or cast to `IQwpWebSocketSender` and call
`ColumnDecimal64` explicitly.

:::

`ColumnDecimal64` and `ColumnDecimal256` (32-byte) also accept a
`System.Decimal`. All three widths additionally expose an unscaled-mantissa
overload with an explicit scale, for values beyond `System.Decimal`'s
~28-digit range.

## Flushing

Buffered rows are not on the wire until they are flushed — automatically or
explicitly.

### Auto-flushing

Unlike the C/Rust QWP clients, the .NET WebSocket sender **supports
auto-flushing**. After each `At` / `AtAsync` call the sender checks three
OR'd triggers; whichever trips first publishes the batch.

| Key | `ws` default | Description |
|---|---|---|
| `auto_flush` | `on` | Master switch. `off` requires explicit `Send`. |
| `auto_flush_rows` | `1000` | Flush after this many buffered rows. |
| `auto_flush_interval` | `100` ms | Flush after this long since the first buffered row. |
| `auto_flush_bytes` | `8 MiB` | Flush after the encode buffer reaches this size. |

```csharp
// Tune the batch size, or disable auto-flush entirely.
using var sender = Sender.New("ws::addr=localhost:9000;auto_flush_rows=5000;");
using var manual = Sender.New("ws::addr=localhost:9000;auto_flush=off;");
```

### Explicit flushing

Call `Send()` or `SendAsync()` to publish buffered rows immediately:

```csharp
sender.Table("trades").Symbol("symbol", "ETH-USD").Column("price", 2615.54)
      .At(DateTime.UtcNow);
await sender.SendAsync();
```

On QWP, a flush returns once the batch is accepted by the local send engine —
**before** the server acknowledges it. Server-side errors surface
asynchronously; see [Delivery tracking](#delivery-tracking).

## Delivery tracking

Awaiting ACKs is **optional**: an app that never calls `PingAsync` or
`AwaitAckedFsnAsync` and just `await using`-disposes the sender is safe —
`DisposeAsync` drains in-flight ACKs, bounded by `close_flush_timeout_millis`
(default 5000 ms). Reach for the APIs below when the app needs to (a) know a
specific write made it before continuing, (b) cooperate with QuestDB
Enterprise durable-replication watermarks, or (c) co-ordinate a graceful
shutdown that must not exit until the queue has drained.

`Sender.NewQwp(...)` returns `IQwpWebSocketSender`, which adds QWP-only
delivery operations on top of `ISender`:

```csharp
await using var sender = Sender.NewQwp("ws::addr=localhost:9000;");

// ... ingest rows, then flush ...
await sender.SendAsync();

// Drain the in-flight ACK window: every batch sent so far is acknowledged
// once this returns. Bounded by ping_timeout.
await sender.PingAsync();

// Per-table commit watermark (populated once the server ACKs a batch).
Console.WriteLine($"trades committed seqTxn: {sender.GetHighestAckedSeqTxn("trades")}");
```

For frame-level tracking, every flush is assigned a frame sequence number
(FSN):

```csharp
long fsn = await sender.FlushAndGetSequenceAsync();
bool acked = await sender.AwaitAckedFsnAsync(fsn, TimeSpan.FromSeconds(10));
if (!acked) Console.Error.WriteLine("timed out waiting for server ACK");
```

| Member | Returns |
|---|---|
| `FlushAndGetSequenceAsync()` | FSN of the highest frame published by this call. |
| `AckedFsn` | Highest FSN the server has acknowledged. |
| `AwaitAckedFsnAsync(fsn, timeout)` | Block until `AckedFsn` reaches `fsn`. |
| `GetHighestAckedSeqTxn(table)` | Highest committed `seqTxn` per table (`-1` if none). |
| `GetHighestDurableSeqTxn(table)` | Highest durably-uploaded `seqTxn` per table. |

## Asynchronous error handling

QWP ingestion is asynchronous: a flush returns once the batch is accepted by
the local send engine, before the server validates it. Server rejections and
protocol violations surface separately.

### How errors surface

Each error is classified into a `SenderErrorCategory` and assigned a
`SenderErrorPolicy`:

| Policy | Effect | Default categories |
|---|---|---|
| `DropAndContinue` | The rejected batch is dropped; the sender keeps running. | `SchemaMismatch`, `WriteError` |
| `Halt` | The sender latches terminal; the next producer call throws `LineSenderServerException`. | `ParseError`, `InternalError`, `SecurityError`, `ProtocolViolation`, `Unknown` |

After a `Halt`, discard the sender and create a new one.

### Error handler

Install a `SenderErrorHandler` on `SenderOptions` to observe every error. It
runs on a background dispatcher — never the I/O or producer thread — so a slow
handler cannot stall publishing; thrown exceptions are caught and traced.

```csharp
var options = Sender.Configure("ws::addr=localhost:9000;");
options.error_handler = err =>
    Console.Error.WriteLine(
        $"qwp error: category={err.Category} policy={err.AppliedPolicy} " +
        $"fsn=[{err.FromFsn},{err.ToFsn}] table={err.TableName} msg={err.ServerMessage}");

await using var sender = Sender.NewQwp(options);
```

`error_inbox_capacity` (default 256, minimum 16) bounds the async error inbox;
on overflow the oldest entry is dropped — `IQwpWebSocketSender.DroppedErrorNotifications`
counts how often that happened.

### Error payload fields

Each `SenderError` carries the following fields:

| Field | Description |
|---|---|
| `Category` | `SchemaMismatch`, `ParseError`, `InternalError`, `SecurityError`, `WriteError`, `ProtocolViolation`, `Unknown`. Use for programmatic dispatch. |
| `AppliedPolicy` | `DropAndContinue` (batch dropped, sender continues) or `Halt` (sender latched terminal; next API call throws `LineSenderServerException`). |
| `ServerStatusByte` | Raw QWP status byte (e.g. `0x03` for `SchemaMismatch`). `-1` (`SenderError.NoStatusByte`) on `ProtocolViolation` and engine-internal terminal failures. |
| `ServerMessage` | Human-readable server text (≤ 1024 UTF-8 bytes), or `null`. See [Message stability](#message-stability) and [PII safety](#message-pii). |
| `MessageSequence` | Server's per-frame QWP wire sequence for the error frame. `-1` (`SenderError.NoMessageSequence`) for engine-internal failures. **Resets on reconnect** — only meaningful within one connection. |
| `FromFsn` / `ToFsn` | Inclusive client-side FSN span of the affected batch. Pair with `FlushAndGetSequenceAsync()` to identify the rejected rows. |
| `TableName` | Rejected table; `null` for multi-table batches or when the server did not attribute the error. |
| `DetectedAtUtc` | Wall-clock receipt time on the I/O thread; for ops timelines, not for correlation. |
| `Exception` | Non-`null` for engine-internal failures (connect-budget exhaustion, fatal upgrade reject); `null` for server rejections. |
| `IsInitialConnect` | `true` if the engine never reached a first successful connection (config / connectivity issue); always `false` for server-side rejections. |

#### Message stability {#message-stability}

`ServerMessage` is a human-readable diagnostic — **not a stable contract.**
QWP error frames carry a server-supplied UTF-8 string capped at 1024 bytes by
the wire spec; the text mirrors QuestDB's normal SQL error formatting and has
historically been reworded across releases. The field may be empty. Use
`Category` and `ServerStatusByte` for programmatic dispatch; never
pattern-match on `ServerMessage`.

#### PII / secret safety {#message-pii}

`ServerMessage` may include fragments of the client's own payload — for
example, an offending column value quoted back by a schema or parse
rejection. `TableName` and any text exposed by `Exception.Message` are
similarly user-controlled. **Treat them as potentially containing PII or
secrets.** Log them at the trust level of the data being sent, and sanitise
before forwarding to external error trackers (Sentry, Datadog, end-user UIs).
The other `SenderError` fields are safe to forward as-is — they carry only
structural metadata.

#### Correlating with server-side logs

QWP does not surface a server-issued request or connection identifier. The
closest correlation handle is the `(MessageSequence, FromFsn, ToFsn)` tuple
plus the connection start time from your application logs — `MessageSequence`
resets on reconnect, so it only disambiguates frames within a single
connection. When filing a support ticket, include the connection start time
and the `(MessageSequence, FromFsn, ToFsn)` triple.

### Synchronous errors

Misconfiguration and API-misuse errors surface synchronously as `IngressError`
(or its subclass `LineSenderServerException` for HALT-policy server
rejections). They are thrown directly from the call site:

| Site | Throws when |
|---|---|
| `Sender.New(...)` / `Sender.NewQwp(...)` / `QueryClient.New(...)` | The connect string is malformed (missing `::`, unknown key, invalid value), required fields are absent, or mutually exclusive auth modes are combined. `Sender.NewQwp` additionally rejects non-`ws::` / `wss::` schemes. |
| `Sender.FromEnv()` / `QueryClient.FromEnv()` | `QDB_CLIENT_CONF` is unset or blank. |
| `Column(...)` / `Symbol(...)` before `Table(...)` | The row has not been started; the builder requires `Table(...)` first. |
| Array `Column(...)` overloads | The `shape` does not match the element count, dimensionality exceeds 32, or the element type is not `double` / `long`. |
| `ColumnGeohash(...)` | `precisionBits` is outside `[1, 60]`. |
| `ColumnDecimal*(...)` with explicit `scale` | `scale` is outside `[0, 18]` (DECIMAL64), `[0, 38]` (DECIMAL128), or `[0, 76]` (DECIMAL256). |
| Producer-thread call after `Halt` policy fired | The next `Table`, `Column`, `AtAsync`, or `SendAsync` throws `LineSenderServerException` carrying the latched `SenderError`. Discard the sender and create a new one. |

Authentication failures surface differently between paths: a `401` / `403`
during the WebSocket upgrade returns synchronously from `Sender.New` /
`QueryClient.New` as `IngressError` (since the upgrade is part of `connect`),
while an upgrade that succeeded but later loses the connection and is denied
on reconnect surfaces asynchronously as a `SecurityError` `SenderError` with
the sender latched terminal.

### Per-category policy

Override the default policy per category with the `on_*_error` connect-string
keys (values `halt` or `drop`):

```csharp
// Treat a schema mismatch as fatal instead of dropping the batch.
using var sender = Sender.New(
    "ws::addr=localhost:9000;on_schema_mismatch_error=halt;");
```

| Key | Scope |
|---|---|
| `on_server_error` | Catch-all default for every category. |
| `on_schema_mismatch_error` (alias: `on_schema_error`) | Schema-validation rejections. |
| `on_parse_error` | Client-side parse errors. |
| `on_internal_error` | Unexpected client-side errors. |
| `on_security_error` | Auth / TLS errors. |
| `on_write_error` | Transport write failures. |

`ProtocolViolation` and `Unknown` are always `Halt`, regardless of these keys.
For programmatic control, set `SenderOptions.error_policy_resolver` to a
`SenderErrorPolicyResolver` delegate.

### Connection-level errors

These are not delivered through the `error_handler` because they happen
before the I/O loop is operating against a healthy connection — they surface
synchronously from the factory, from `ExecuteAsync`, or as listener events:

- **Authentication failure** (`401` / `403` during the WebSocket upgrade) —
  terminal across all endpoints. The reconnect / failover loop stops
  immediately rather than replaying the same credential against every host.
- **Malformed frames** — `QwpDecodeException` (egress) or `IngressError`
  with a `ProtocolViolation` category (ingress); the WebSocket is closed
  with a terminal code. The sender / query client transitions to a
  non-recoverable state.
- **Role mismatch** — `QwpRoleMismatchException` from `QueryClient.NewAsync`
  or the next `ExecuteAsync` when no endpoint matches the configured
  `target=any|primary|replica` filter. `LastObserved` carries the most
  recent `QwpServerInfo` to distinguish "no primary available" from
  "all endpoints unreachable".
- **TCP / TLS connect failure** — treated as transient on the ingress side
  and fed into the reconnect loop, capped by `reconnect_max_duration_millis`.

### Error classification

A summary of how the engine treats each error class on the wire:

| Source | Status | Effect |
|---|---|---|
| Auth (`401` / `403`) on any endpoint | Terminal | Halts the failover loop immediately; the sender / query client latches non-recoverable. |
| Role reject (`421` + `X-QuestDB-Role`) | Topology-level (transient if `PRIMARY_CATCHUP`, otherwise terminal for the loop) | The client tries the next endpoint; if every endpoint rejects, surfaces as `QwpRoleMismatchException` (egress) or the sender's reconnect loop exhausts. |
| Version mismatch during upgrade | Per-endpoint, **not** terminal | The client moves on to the next endpoint. |
| Server rejection of a batch (`SchemaMismatch`, `ParseError`, `WriteError`, etc.) | Per the `on_*_error` policy — default is `DropAndContinue` for `SchemaMismatch` / `WriteError`, `Halt` for everything else. | `DropAndContinue` keeps the sender alive; `Halt` latches the sender so the next producer call throws `LineSenderServerException`. |
| TCP / TLS failure, `404`, `503`, mid-stream drop | Transient | Fed into the ingress reconnect loop (`reconnect_max_*` keys) or, on egress, the per-query failover loop (`failover_*` keys). |
| `ProtocolViolation`, `Unknown` | Terminal | Always `Halt`, regardless of `on_*_error` settings. |

### Connection events

Implement `ISenderConnectionListener` and assign it to
`SenderOptions.ConnectionListener` to observe connection-state transitions:

```csharp
class Listener : ISenderConnectionListener
{
    public void OnEvent(SenderConnectionEvent evt) =>
        Console.WriteLine($"{evt.Kind} {evt.Host}:{evt.Port}");
}

var options = Sender.Configure("ws::addr=db-a:9000,db-b:9000;");
options.ConnectionListener = new Listener();
await using var sender = Sender.NewQwp(options);
```

Event kinds: `Connected`, `Disconnected`, `Reconnected`, `FailedOver`,
`EndpointAttemptFailed`, `AllEndpointsUnreachable`, `AuthFailed`,
`ReconnectBudgetExhausted`. Listeners run on a dedicated dispatcher thread.

`AuthFailed` and `ReconnectBudgetExhausted` are **terminal**: the sender
latches a non-recoverable failure, the next producer-thread call (`Table`,
`Column`, `AtAsync`, `SendAsync`) throws `IngressError` (or
`LineSenderServerException` if a HALT-policy error was latched alongside),
and no further data can be sent. Discard the sender, build a new one, and
replay any state your application owns. `DroppedConnectionNotifications` on
`IQwpWebSocketSender` counts events that were dropped because a slow listener
fell behind the dispatcher inbox.

## Store-and-forward

With store-and-forward (SF) enabled, unacknowledged frames are persisted to
disk and replayed after reconnection, surviving sender process restarts:

```csharp
using var sender = Sender.New(
    "ws::addr=localhost:9000;sf_dir=/var/lib/myapp/qdb-sf;sender_id=ingest-1;");
```

Without `sf_dir` the send queue lives in process memory and is lost if the
process exits; the reconnect loop still spans transient outages, bounded by a
RAM cap.

<SfDedupWarning />

| Key | Default | Description |
|---|---|---|
| `sf_dir` | unset | Enables disk-backed SF when set. |
| `sender_id` | `default` | Slot identity (`A-Za-z0-9_-`). Use a distinct id per sender process sharing one `sf_dir`. |
| `sf_max_bytes` | 4 MiB | Per-segment size cap. |
| `sf_max_total_bytes` | 128 MiB (memory) / 10 GiB (disk) | Cap on total queued bytes. |
| `sf_append_deadline_millis` | 30000 | Max time a flush blocks waiting for queue capacity. |
| `drain_orphans` | `off` | If `on`, take over stale slots from a crashed sender. |

## Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication.

:::

By default the server confirms a batch once it is committed to the local
[WAL](/docs/concepts/write-ahead-log/). With `request_durable_ack=on`, the
client tracks when the batch is durably uploaded to object storage:

```csharp
await using var sender = Sender.NewQwp(
    "ws::addr=localhost:9000;sf_dir=/var/lib/myapp/qdb-sf;request_durable_ack=on;");

// ... ingest rows ...
await sender.SendAsync();

Console.WriteLine($"trades durable seqTxn: {sender.GetHighestDurableSeqTxn("trades")}");
```

## Failover and high availability

:::note Enterprise

Multi-host failover is most useful with QuestDB Enterprise primary-replica
replication.

:::

Supply a comma-separated address list (or repeat `addr=`). The client connects
to one endpoint and walks the list to the next healthy peer when the
connection breaks:

```csharp
using var sender = Sender.New(
    "ws::addr=db-primary:9000,db-replica:9000;sf_dir=/var/lib/myapp/qdb-sf;");
```

| Key | Default | Description |
|---|---|---|
| `reconnect_max_duration_millis` | 300000 | Per-outage reconnect budget. |
| `reconnect_initial_backoff_millis` | 100 | First post-failure sleep. |
| `reconnect_max_backoff_millis` | 5000 | Cap on per-attempt sleep. |
| `initial_connect_retry` | `off` | Retry the first connect (`off` / `on` / `async`). Setting any `reconnect_*` key promotes this to `on`. |

`sf_dir` is strongly recommended for multi-host deployments: a flush writes to
disk and returns quickly while the reconnect loop replays to the new primary
in the background, instead of blocking until `sf_append_deadline_millis`.

### Backpressure on send

Row builders (`Table`, `Symbol`, `Column`, `NullableColumn`) never block —
they only mutate the in-process encode buffer, which grows up to
`max_buf_size` (default 100 MiB). Backpressure surfaces at flush time:

- **In-memory mode (no `sf_dir`).** The in-flight publish window caps how
  many unacknowledged frames can sit on the connection. When the server is
  reachable but slow, `SendAsync()` waits for ACK-driven capacity before
  returning. When the server is unreachable for longer than the in-flight
  window can absorb, the rows stay buffered until either the connection
  recovers or `DisposeAsync` fires and `close_flush_timeout_millis` elapses.
  In-memory mode does **not** survive a process exit; unacked frames are lost.
- **Store-and-forward mode (`sf_dir` set).** `SendAsync()` appends to the
  on-disk segment and returns quickly; the I/O loop drains it in the
  background. If the disk queue is at its `sf_max_total_bytes` cap, the
  append blocks waiting for the loop to trim acknowledged frames, bounded by
  `sf_append_deadline_millis` (default 30 000 ms). If the deadline elapses
  the engine latches a terminal error and the next producer call surfaces it.
  No data is dropped while the publisher is parked.

A single batch larger than `sf_max_bytes` (default 4 MiB) is rejected
immediately — it does not enter the backpressure wait. Reduce the rows you
accumulate per flush, or raise `sf_max_bytes` to fit your largest single
payload.

## Transactions

:::caution WebSocket / QWP does not support transactions

The `Transaction` / `Commit` / `Rollback` API is **HTTP-only**. The QWP
WebSocket sender rejects it — QWP frames are independently acknowledged batches.
Use [store-and-forward](#store-and-forward) plus
[DEDUP](/docs/concepts/deduplication/) keys for delivery guarantees on QWP.

:::

For transactional ILP over HTTP, see the
[ILP overview](/docs/connect/compatibility/ilp/overview#http-transaction-semantics).

## Querying and SQL execution

`QueryClient` sends SQL statements over the
[QWP egress](/docs/connect/wire-protocols/qwp-egress-websocket/) endpoint
(`/read/v1`). Results arrive as columnar batches via a callback handler.

`ExecuteAsync` is **blocking on completion**: it sends the query, drives the
WebSocket receive loop, invokes the handler callbacks (`OnBatch`, `OnEnd`,
`OnExecDone`, or `OnError`), and returns only after the query terminates.
That makes operations easy to sequence:

```csharp
await client.ExecuteAsync("CREATE TABLE trades (...) ...", ddlHandler);
// Table exists by this point
await client.ExecuteAsync("INSERT INTO trades VALUES (...) ...", dmlHandler);
// Data is committed by this point
await client.ExecuteAsync("SELECT * FROM trades", selectHandler);
// Results have been fully consumed by this point
```

One `QueryClient` owns one WebSocket and runs **one query at a time**. To run
queries in parallel, create one client per concurrent caller — the same
multi-publisher pattern as for `Sender`.

### Building a query client

```csharp
using QuestDB;
using QuestDB.Qwp.Query;

await using var client = await QueryClient.NewAsync("ws::addr=localhost:9000;");
```

| Factory | Returns | Notes |
|---|---|---|
| `QueryClient.New(string connStr)` | `IQwpQueryClient` | Synchronous. Hops the threadpool to avoid sync-over-async deadlocks on UI / classic ASP.NET. |
| `QueryClient.New(QueryOptions options)` | `IQwpQueryClient` | For programmatic configuration. |
| `QueryClient.NewAsync(string connStr, CancellationToken)` | `Task<IQwpQueryClient>` | **Preferred from async code.** |
| `QueryClient.NewAsync(QueryOptions, CancellationToken)` | `Task<IQwpQueryClient>` | Same, programmatic. |
| `QueryClient.FromEnv()` | `IQwpQueryClient` | Reads the connect string from `QDB_CLIENT_CONF`. |

The egress side requires .NET 7+, the same minimum as the QWP sender.
`QueryClient` is constructed and connected up-front: by the time the factory
returns, the WebSocket upgrade has completed and the negotiated server
metadata is available via `client.ServerInfo`, `client.NegotiatedVersion`,
and `client.NegotiatedCompression`.

### Executing SELECT queries

```csharp
await client.ExecuteAsync(
    "SELECT ts, symbol, price FROM trades WHERE symbol = 'ETH-USD' LIMIT 100",
    new PrintHandler());

internal sealed class PrintHandler : QwpColumnBatchHandler
{
    public override void OnBatch(QwpColumnBatch batch)
    {
        for (var row = 0; row < batch.RowCount; row++)
        {
            if (batch.IsNull(2, row)) continue;
            var ts = batch.GetLongValue(0, row);           // TIMESTAMP — microseconds
            var sym = batch.GetString(1, row);             // SYMBOL — null for NULL
            var price = batch.GetDoubleValue(2, row);
            Console.WriteLine($"{ts} {sym} {price}");
        }
    }

    public override void OnEnd(long totalRows) =>
        Console.WriteLine($"done: {totalRows} rows");

    public override void OnError(byte status, string message) =>
        Console.Error.WriteLine($"query failed: 0x{status:X2} {message}");
}
```

The `QwpColumnBatch` instance — and every span its accessors return — is
**reused across batches**. Do not store a reference past the `OnBatch`
invocation; copy any string / array data you need to keep.

### Reading result batches

`QwpColumnBatch` exposes typed accessors for every QuestDB column type. All
value accessors return a zero-like sentinel (`0`, `false`, `'\0'`, `null`,
`-1`, `Guid.Empty`, `BigInteger.Zero`, empty span) for a NULL cell; call
`IsNull(col, row)` first to disambiguate from a legal zero value.

| Accessor | QuestDB column types |
|---|---|
| `IsNull(col, row)` | all types — call before any value accessor when the column is nullable |
| `GetBoolValue(col, row)` | `BOOLEAN` |
| `GetByteValue(col, row)` / `GetSByteValue(col, row)` | `BYTE` (uint8 or sbyte view) |
| `GetShortValue(col, row)` | `SHORT` |
| `GetCharValue(col, row)` | `CHAR` (UTF-16 code unit) |
| `GetIntValue(col, row)` | `INT`, `IPv4` |
| `GetIPv4Value(col, row)` | `IPv4` (packed `int`; same bits as `GetIntValue`) |
| `GetLongValue(col, row)` | `LONG`, `TIMESTAMP`, `TIMESTAMP_NS`, `DATE` (see units below) |
| `GetTimestampValue(col, row)` | `TIMESTAMP` / `TIMESTAMP_NS` (alias for `GetLongValue`; consult `GetColumnWireType` for the unit) |
| `GetDateValue(col, row)` | `DATE` (millis since Unix epoch; alias for `GetLongValue`) |
| `GetFloatValue(col, row)` | `FLOAT` |
| `GetDoubleValue(col, row)` | `DOUBLE` |
| `GetStringSpan(col, row)` | `VARCHAR`, `SYMBOL` (UTF-8 bytes; valid only during the `OnBatch` call) |
| `GetString(col, row)` | any column — best-effort allocating string; `null` for NULL |
| `GetSymbol(col, row)` / `GetSymbolId(col, row)` | `SYMBOL` (managed string / dictionary id) |
| `GetSymbolForId(col, dictId)` / `GetSymbolDictSize(col)` | `SYMBOL` dictionary access |
| `GetBinarySpan(col, row)` | `BINARY` (raw bytes; valid only during the `OnBatch` call) |
| `GetUuid(col, row)` / `GetUuidLo(col, row)` / `GetUuidHi(col, row)` | `UUID` (as `Guid`, or as 64-bit halves on the QWP wire layout) |
| `GetLong256(col, row)` (BigInteger) / `GetLong256(col, row, out w0, out w1, out w2, out w3)` | `LONG256` (BigInteger, or four 64-bit limbs least → most significant) |
| `GetDecimal64UnscaledValue(col, row)` + `GetDecimalScale(col)` | `DECIMAL64` |
| `GetDecimal128Lo(col, row)` / `GetDecimal128Hi(col, row)` + `GetDecimalScale(col)` | `DECIMAL128` (two int64 limbs) |
| `GetDecimal256(col, row, out ll, out lh, out hl, out hh)` + `GetDecimalScale(col)` | `DECIMAL256` (four int64 limbs least → most significant) |
| `GetGeohashValue(col, row)` + `GetGeohashPrecisionBits(col)` | `GEOHASH` (packed bits + per-column precision; `-1` value for NULL) |
| `GetDoubleArraySpan(col, row)` / `GetDoubleArrayElements(col, row)` | `DOUBLE[]` (row-major, flattened) |
| `GetLongArraySpan(col, row)` / `GetLongArrayElements(col, row)` | `LONG[]` (row-major, flattened) |
| `GetArrayNDims(col, row)` / `GetArrayShape(col, row)` | array dimensionality and shape (per row) |
| `GetColumnName(col)` / `GetColumnWireType(col)` / `ColumnCount` / `RowCount` / `BatchSeq` / `RequestId` | column / batch metadata |

`GetColumnWireType(col)` returns the `QwpTypeCode` of the column; pair it
with the type-specific accessor when the column type is not known statically.

### DDL and DML statements

Non-`SELECT` statements (`CREATE TABLE`, `INSERT`, `UPDATE`, `ALTER`, `DROP`,
`TRUNCATE`) run through the same `ExecuteAsync`. The server emits `EXEC_DONE`
instead of result batches — overload `OnExecDone` to consume it:

```csharp
await client.ExecuteAsync(
    "CREATE TABLE trades ("
    + "ts TIMESTAMP, symbol SYMBOL, price DOUBLE, amount LONG"
    + ") TIMESTAMP(ts) PARTITION BY DAY WAL",
    new DdlHandler());

internal sealed class DdlHandler : QwpColumnBatchHandler
{
    public override void OnExecDone(byte opType, long rowsAffected) =>
        Console.WriteLine($"done: opType={opType} rows={rowsAffected}");

    public override void OnError(byte status, string message) =>
        Console.Error.WriteLine($"DDL/DML failed: 0x{status:X2} {message}");
}
```

`rowsAffected` reports the row count for `INSERT` / `UPDATE` / `DELETE`. Pure
DDL (`CREATE`, `DROP`, `ALTER`, `TRUNCATE`) reports `0`.

### Bind parameters

Parameterised queries use a `QwpBindSetter` delegate. It receives a
`QwpBindValues` and **must set indices in strict ascending order starting at
zero** — gaps and reuses throw `IngressError`. Bind indices are 0-based
(`$1` → index `0`):

```csharp
const string sql =
    "SELECT ts, symbol, price, amount FROM trades "
    + "WHERE symbol = $1 AND price >= $2 LIMIT 1000";

foreach (var symbol in new[] { "ETH-USD", "BTC-USD" })
{
    await client.ExecuteAsync(
        sql,
        binds =>
        {
            binds.SetVarchar(0, symbol);
            binds.SetDouble(1, 2000.0);
        },
        new PrintHandler());
}
```

| Setter | Bind type |
|---|---|
| `SetBoolean(index, bool)` | `BOOLEAN` |
| `SetByte(index, byte)` | `BYTE` (uint8) |
| `SetShort(index, short)` | `SHORT` |
| `SetChar(index, char)` | `CHAR` |
| `SetInt(index, int)` | `INT` |
| `SetLong(index, long)` | `LONG` |
| `SetFloat(index, float)` | `FLOAT` |
| `SetDouble(index, double)` | `DOUBLE` |
| `SetDate(index, long millis)` | `DATE` |
| `SetTimestampMicros(index, long)` | `TIMESTAMP` |
| `SetTimestampNanos(index, long)` | `TIMESTAMP_NS` |
| `SetVarchar(index, string?)` | `VARCHAR` / `STRING` / `SYMBOL` (`null` ⇒ NULL bind) |
| `SetUuid(index, Guid)` / `SetUuid(index, long lo, long hi)` | `UUID` |
| `SetLong256(index, BigInteger)` (non-negative) / `SetLong256(index, long w0, long w1, long w2, long w3)` | `LONG256` |
| `SetGeohash(index, int precisionBits, long value)` | `GEOHASH` (1–60 bits) |
| `SetDecimal64(index, int scale, long unscaled)` | `DECIMAL64` (`scale` 0–18) |
| `SetDecimal128(index, int scale, long lo, long hi)` | `DECIMAL128` (`scale` 0–38) |
| `SetDecimal256(index, int scale, long ll, long lh, long hl, long hh)` | `DECIMAL256` (`scale` 0–76) |

Up to `1024` bind parameters are accepted per query.

To bind a typed NULL — necessary when the placeholder type would otherwise
be inferred from the value — use `SetNull` with the wire type code, or the
type-specific overloads that carry scale / precision:

```csharp
binds =>
{
    binds.SetVarchar(0, null);                        // null VARCHAR (also SetNull(0, QwpTypeCode.Varchar))
    binds.SetNull(1, QwpTypeCode.Long);               // null LONG
    binds.SetNullGeohash(2, precisionBits: 20);       // null GEOHASH with explicit precision
    binds.SetNullDecimal64(3, scale: 4);              // null DECIMAL64 with explicit scale
};
```

### Cancellation

There are two ways to cancel an in-flight query, and they differ in whether
the connection survives:

- **`client.Cancel()`** — cooperative. Posts a QWP `CANCEL` frame to the
  server; the query terminates with `OnError(status=0x0A, …)` (or, if the
  server raced to finish, a normal `OnEnd`). The WebSocket stays open and
  the client is reusable for the next `ExecuteAsync`. `Cancel()` is
  thread-safe and a no-op when no query is in flight. It does **not**
  interrupt an in-progress `ReceiveAsync`; if the server hangs and never
  acknowledges, `ExecuteAsync` will not return.
- **`CancellationToken` cancellation** — terminal. Cancelling the token
  passed to `ExecuteAsync` tears down the WebSocket; the client transitions
  to a non-recoverable state. Use it as a hard stop when cooperative cancel
  is not viable.

### Query error status codes

`OnError(byte status, string message)` carries the QWP wire status byte. The
codes the server raises today:

| Code   | Name              | Description                                       |
|--------|-------------------|---------------------------------------------------|
| `0x03` | `SchemaMismatch`  | Bind parameter type incompatible with placeholder |
| `0x05` | `ParseError`      | SQL syntax error or malformed message             |
| `0x06` | `InternalError`   | Server-side execution failure                     |
| `0x08` | `SecurityError`   | Authorization failure                             |
| `0x0A` | `Cancelled`       | Query terminated by `CANCEL`                      |
| `0x0B` | `LimitExceeded`   | Protocol limit hit (oversized payload, bind cap)  |

`OnError` can arrive before any `OnBatch` (parse failure, schema mismatch on
binds) or mid-stream (storage failure, server shutdown). Once `OnError`
fires, no further frames arrive for that query — the next `ExecuteAsync` on
the same client starts fresh, unless the failure was a transport-level
exception thrown out of `ExecuteAsync` (which is terminal — see Failover
below).

### Failover

When multiple addresses are listed in `addr=`, the query client tries them
in order on connect and on every mid-stream reconnect. Egress failover is
**per-query**: the loop runs within a single `ExecuteAsync` call; between
queries the client uses whichever endpoint last succeeded.

| Connect-string key | Default | Description |
|---|---|---|
| `failover` | `on` | Master switch for per-query reconnect-and-replay. |
| `failover_max_attempts` | `8` | Max reconnect attempts per query. |
| `failover_backoff_initial_ms` | `50` | First post-failure sleep. |
| `failover_backoff_max_ms` | `1000` | Cap on per-attempt sleep. |
| `failover_max_duration_ms` | `30000` | Total wall-clock budget per query (`0` ⇒ unbounded). The loop ends when either this or `failover_max_attempts` fires first. |
| `target` | `any` | Endpoint role filter: `any` (STANDALONE, PRIMARY, PRIMARY_CATCHUP, REPLICA), `primary` (STANDALONE, PRIMARY, PRIMARY_CATCHUP), or `replica` (REPLICA only). |
| `zone` | unset | Opaque zone hint; with `target=any` / `target=replica`, prefers endpoints whose advertised `zone_id` matches. Ignored with `target=primary`. |

:::warning Failover requires multiple endpoints

Failover rotates across the addresses listed in `addr=`. With a single
address, there is no other host to try and the loop exhausts after one
attempt regardless of `failover_max_attempts`. For failover to be useful,
provide at least two addresses.

:::

**Handling partial results.** When the connection fails over mid-stream the
server replays the query from scratch — the client invokes
`OnFailoverReset(QwpServerInfo?)` before the first replayed batch arrives so
the handler can drop any accumulated state:

```csharp
public override void OnFailoverReset(QwpServerInfo? newNode)
{
    Console.WriteLine($"failover to {newNode?.NodeId ?? "<unknown>"}");
    results.Clear();   // drop partial rows; server will resend from row 0
}
```

If `OnFailoverReset` itself throws, the in-flight query is abandoned and the
exception bubbles out of `ExecuteAsync`. `OnFailoverReset` only fires
mid-stream; reconnects that happen between queries are handled internally
and do not invoke the callback.

**Role mismatch.** If the requested `target=` cannot be satisfied by any
endpoint, the factory or the next `ExecuteAsync` throws
`QwpRoleMismatchException`. Its `Target` property echoes the requested
filter; `LastObserved` carries the last `QwpServerInfo` the client saw, so
your application can distinguish "no primary available" from
"all endpoints unreachable".

**Authentication failure is terminal.** A `401` / `403` from any failover
candidate aborts the loop without trying the remaining hosts — replaying an
unsupported credential against every host wastes time and floods server
logs.

### Compression

Negotiate zstd compression to reduce egress bandwidth on large result sets:

```csharp
await using var client = await QueryClient.NewAsync(
    "ws::addr=localhost:9000;compression=zstd;compression_level=3;");
```

| Value | Behaviour |
|---|---|
| `raw` (default) | No compression — sent as `raw` in the upgrade header. |
| `zstd` | Demand zstd; the server falls back to raw per-batch when raw is smaller. |
| `auto` | Advertise both; the server picks zstd if it supports it, else raw. |

`compression_level` is in `[1, 9]` (zstd levels). Inspect
`client.NegotiatedCompression` after connect to see what the server actually
chose. Batches decompress transparently — your `OnBatch` code is unchanged.

### Query connect-string reference

The connect string is shared with the ingest sender; the query parser
accepts the full union and silently ignores the keys that only the sender
acts on, so one connect string drives both clients without erroring. The
keys it honours:

| Category | Keys |
|---|---|
| Addressing | `addr` (one or comma-separated `host:port` entries), `path` (defaults to `/read/v1`), `protocol` (auto-derived from the `ws::` / `wss::` scheme) |
| TLS | `tls_verify`, `tls_roots`, `tls_roots_password` |
| Auth | `username` / `password` (HTTP Basic), `token` (Bearer), `auth` (pre-built `Authorization` header), `auth_timeout_ms` |
| Routing | `target`, `zone`, `client_id` |
| Failover | `failover`, `failover_max_attempts`, `failover_backoff_initial_ms`, `failover_backoff_max_ms`, `failover_max_duration_ms` |
| Streaming | `compression`, `compression_level`, `max_batch_rows`, `initial_credit` |

`initial_credit` (bytes; `0` = unbounded) caps how much data the server may
emit before pausing for a `CREDIT` frame from the client — useful when a
single result is much larger than the consumer's working set. The client
auto-replenishes credit per consumed batch.

`auth`, `username`/`password`, and `token` are mutually exclusive; setting
two raises `IngressError`. Control characters are rejected in all string
values (connect-string parsing is strict).

## Misc

### Cancelling a row

`CancelRow` discards the partially-built current row, before it is finished:

```csharp
sender.Table("trades").Symbol("symbol", "ETH-USD").CancelRow();
```

### Buffer management

`Truncate()` trims the internal buffer back to `init_buf_size`; `Clear()`
empties it without sending. Buffer growth is bounded by `init_buf_size` /
`max_buf_size`.

## Closing the sender

Dispose the sender to flush and drain in-flight frames. Prefer `await using`
(or `DisposeAsync`) so the close path is non-blocking and surfaces delivery
errors:

```csharp
await using var sender = Sender.New("ws::addr=localhost:9000;");
// ... ingest ...
// DisposeAsync drains in-flight ACKs, bounded by close_flush_timeout_millis (default 5000).
```

With `sf_dir` set, anything still un-acked at close is persisted to disk so a
later sender with the same `sf_dir` / `sender_id` replays it.

## Configuration reference

For the full list of connect-string keys and defaults, see the
[connect string reference](/docs/connect/clients/connect-string/). Common
WebSocket options:

| Key | Default | Description |
|---|---|---|
| `addr` | required | One or more `host:port` entries, comma-separated or repeated. Default port `9000`. |
| `username` / `password` | unset | HTTP basic auth. |
| `token` | unset | Bearer token auth (Enterprise). |
| `auth_timeout_ms` | 15000 | WebSocket upgrade timeout. |
| `tls_verify` / `tls_roots` / `tls_roots_password` | — | TLS configuration (`wss` only). |
| `auto_flush` / `auto_flush_rows` / `auto_flush_interval` / `auto_flush_bytes` | `on` / 1000 / 100 ms / 8 MiB | Auto-flush triggers. |
| `sf_dir` / `sender_id` | unset / `default` | Store-and-forward. |
| `request_durable_ack` | `off` | Wait for durable upload (Enterprise). |
| `reconnect_max_duration_millis` | 300000 | Per-outage reconnect budget. |
| `close_flush_timeout_millis` | 5000 | Bound on the drain at dispose. |

## Migration from ILP (HTTP/TCP)

The `Table` / `Symbol` / `Column` / `At` builder is unchanged. To switch a
sender to QWP/WebSocket:

| Aspect | HTTP (ILP) | WebSocket (QWP) |
|---|---|---|
| Connect string schema | `http::` / `https::` | `ws::` / `wss::` |
| Factory | `Sender.New(...)` returns `ISender` | Same; or `Sender.NewQwp(...)` returns `IQwpWebSocketSender` directly (skip the `is IQwpWebSocketSender` cast for QWP-only methods like `PingAsync`, `ColumnDecimal64`, FSN tracking) |
| Type surface | ILP textual types | Full QuestDB type system (DECIMAL64/128/256, BYTE, SHORT, FLOAT, DATE, IPv4, GEOHASH, LONG256, BINARY, n-D arrays) via `IQwpWebSocketSender` |
| Error model | Synchronous on `Send` | Async — observed via [`error_handler`](#error-handler), FSN / `seqTxn` watermarks |
| Transactions | Supported | Not supported (use SF + DEDUP) |
| Store-and-forward | Not available | Available (`sf_dir`) |
| Multi-endpoint failover | HTTP only | Built in (comma-separated `addr`) |
| Querying | Not available | [`QueryClient`](#querying-and-sql-execution) on the same NuGet package |
| Minimum runtime | .NET 6.0 | .NET 7.0 |

The minimal swap is "change the connect string from `http::` to `ws::` (or
`https::` to `wss::`) and drop any transaction calls"; reach for
`Sender.NewQwp(...)` when the application also needs the QWP-only column
types, delivery watermarks, or `PingAsync`.

## Full example: ingestion and querying with failover

This example combines a multi-host ingest sender with the recreate-on-
terminal-failure pattern for the query client. It uses `Sender.NewQwp` for
ingest (so the QWP-only methods are directly reachable), TLS + token auth,
store-and-forward, and a connection listener.

```csharp
using QuestDB;
using QuestDB.Qwp.Query;
using QuestDB.Senders;
using QuestDB.Utils;

const string ingestConnStr =
    "wss::addr=db-primary:9000,db-replica:9000;"   // Enterprise: wss + multi-host
    + "token=your_bearer_token;"                    // Enterprise: token auth
    + "tls_verify=unsafe_off;"                      // test only!
    + "sf_dir=/var/lib/myapp/qdb-sf;"               // disk-backed durability
    + "sender_id=ingest-1;"                         // distinct per process
    + "reconnect_max_duration_millis=300000;";

const string queryConnStr =
    "wss::addr=db-primary:9000,db-replica:9000;"
    + "token=your_bearer_token;"
    + "tls_verify=unsafe_off;"                      // test only!
    + "target=replica;"                             // offload reads
    + "failover=on;failover_max_attempts=8;"
    + "failover_max_duration_ms=30000;";

// ─── Ingestion ──────────────────────────────────────────────────────

var ingestOptions = Sender.Configure(ingestConnStr);
ingestOptions.error_handler = err =>
    Console.Error.WriteLine(
        $"batch rejected: category={err.Category} table={err.TableName} "
        + $"fsn=[{err.FromFsn},{err.ToFsn}] msg={err.ServerMessage}");
ingestOptions.ConnectionListener = new IngestListener();

await using var sender = Sender.NewQwp(ingestOptions);

for (var i = 0; i < 100; i++)
{
    await sender.Table("trades")
        .Symbol("symbol", "ETH-USD")
        .Symbol("side", i % 2 == 0 ? "buy" : "sell")
        .Column("price", 2615.54 + i * 0.01)
        .Column("amount", 0.001 * (i + 1))
        .AtAsync(DateTime.UtcNow);
}

// Bound the publish on a known FSN, then drain remaining ACKs on dispose.
long fsn = await sender.FlushAndGetSequenceAsync();
await sender.AwaitAckedFsnAsync(fsn, TimeSpan.FromSeconds(10));

// Connection events you may see in IngestListener.OnEvent:
//   Connected db-primary:9000               — initial connection
//   Disconnected db-primary:9000            — primary dropped
//   EndpointAttemptFailed db-primary:9000   — retries during outage
//   FailedOver db-replica:9000              — replica took over
//
// With sf_dir set, unacked frames are persisted to disk during the
// outage and replayed once the new primary is reachable.


// ─── Querying (recreate-on-terminal pattern) ────────────────────────

// The QueryClient enters a terminal state once the failover budget is
// exhausted (or on CancellationToken cancel, AuthFailed, or
// QwpRoleMismatchException). The application must Dispose the dead
// client and build a new one. This loop encodes that contract.

IQwpQueryClient? client = null;

while (true)
{
    if (client is null)
    {
        try
        {
            client = await QueryClient.NewAsync(queryConnStr);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"connect failed: {ex.Message}");
            await Task.Delay(TimeSpan.FromSeconds(2));
            continue;
        }
    }

    try
    {
        await client.ExecuteAsync(
            "SELECT ts, symbol, price, amount FROM trades "
            + "ORDER BY ts DESC LIMIT 10",
            new PrintHandler());
    }
    catch (Exception ex)   // failover exhausted, transport tear-down, etc.
    {
        Console.Error.WriteLine($"query failed terminally: {ex.Message}");
        try { await client.DisposeAsync(); } catch { /* best-effort */ }
        client = null;       // recreate on next iteration
        continue;
    }

    await Task.Delay(TimeSpan.FromSeconds(2));
}


internal sealed class IngestListener : ISenderConnectionListener
{
    public void OnEvent(SenderConnectionEvent evt) =>
        Console.WriteLine($"{evt.Kind} {evt.Host}:{evt.Port}");
}

internal sealed class PrintHandler : QwpColumnBatchHandler
{
    public override void OnBatch(QwpColumnBatch batch)
    {
        for (var row = 0; row < batch.RowCount; row++)
        {
            Console.WriteLine(
                $"{batch.GetLongValue(0, row)} "
                + $"{batch.GetString(1, row)} "
                + $"{batch.GetDoubleValue(2, row)} "
                + $"{batch.GetDoubleValue(3, row)}");
        }
    }

    public override void OnEnd(long totalRows) =>
        Console.WriteLine($"({totalRows} rows)");

    public override void OnError(byte status, string message) =>
        Console.Error.WriteLine($"query error 0x{status:X2}: {message}");

    public override void OnFailoverReset(QwpServerInfo? newNode)
    {
        // Fires only when failover happens mid-query. Clear any
        // accumulated partial results — the server will resend from row 0.
        Console.WriteLine(
            $"failover reset to node={newNode?.NodeId ?? "<unknown>"} "
            + $"role={newNode?.RoleName ?? "<unknown>"}");
    }
}
```

Notes on the pattern:

- **Ingestion failover is continuous** — the sender's reconnect loop
  (`reconnect_max_duration_millis`, default 5 min) walks the address list
  transparently and resumes once a healthy host is reachable. The
  application keeps publishing.
- **Egress failover is per-query** — the loop runs only inside one
  `ExecuteAsync`. A total outage that exceeds `failover_max_duration_ms`
  leaves the `QueryClient` terminal; the `recreate-on-catch` outer loop is
  the supported recovery shape.
- **Connect strings are shared-vocabulary, side-private** — the same
  `ws::` / `wss::` URL works for both sides. Each parser silently ignores
  the keys belonging to the other half. The ingest sender pins QWP v1 and
  does not read `SERVER_INFO`, so the `zone=` key is accepted but ignored
  on ingress; egress honours it for replica preference when
  `target=any|replica`.

## Next steps

Explore more examples in the
[GitHub repository](https://github.com/questdb/net-questdb-client), and read
[Querying and SQL execution](#querying-and-sql-execution) on this page to
add SQL reads on the same WebSocket transport.

For SQL reference material, see the [Query & SQL overview](/docs/query/overview/).

Need help? Visit the [Community Forum](https://community.questdb.com/).
