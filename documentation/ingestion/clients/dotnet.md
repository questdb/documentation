---
slug: /connect/clients/dotnet
title: .NET client for QuestDB
sidebar_label: .NET
description:
  "QuestDB .NET client for high-throughput data ingestion over the QWP binary
  protocol (WebSocket)."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"
import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB .NET client connects to QuestDB over the
[QWP binary protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/) (WebSocket).
QWP is a column-oriented binary wire format: smaller and faster than the text
ILP used by `http::` and `tcp::`, with the full QuestDB type system, automatic
table creation, schema evolution, multi-host failover, and optional
store-and-forward durability.

:::tip Legacy transports

The same `Sender` also speaks ILP over HTTP and TCP. This page documents the
recommended WebSocket (QWP) path; ILP keeps working unchanged for existing
deployments. For ILP transport details, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/).

:::

:::info

This page focuses on **ingestion** (writing data). The .NET package also ships
a native QWP query client (`QueryClient.New`) that streams query results over
WebSocket — its dedicated guide is in progress. Until it lands, query QuestDB
with a
[PostgreSQL-compatible .NET library](/docs/connect/compatibility/pgwire/dotnet/)
or the [REST API](/docs/query/overview/#rest-http-api).

<!-- TODO: link the QWP egress / query-client guide here once it is written. -->

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

:::note

`Sender` is single-threaded and owns one connection. To send in parallel,
create one sender per producer thread.

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
- **`Column(name, value)`** — overloaded for `string`, `long`, `int`, `bool`,
  `double`, `decimal`, `DateTime`, `DateTimeOffset`, and N-dimensional arrays.
  See [Decimal columns](#decimal-columns).
- **`At(...)` / `AtAsync(...)`** — finishes the row with the
  [designated timestamp](/docs/concepts/designated-timestamp/). `AtNow()` /
  `AtNowAsync()` let the server assign it (this defeats deduplication).

Tables and columns are created automatically if they do not exist. Use the
`Async` overloads (`AtAsync`, `SendAsync`) to avoid blocking the calling
thread.

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

The `SenderError` passed to the handler carries `Category`, `AppliedPolicy`,
`ServerStatusByte`, `ServerMessage`, `MessageSequence`, the `[FromFsn, ToFsn]`
span, `TableName`, and `DetectedAtUtc`. Treat `ServerMessage` as potentially
containing payload fragments — log it at the trust level of your data.

`error_inbox_capacity` (default 256, minimum 16) bounds the async error inbox;
on overflow the oldest entry is dropped.

### Per-category policy

Override the default policy per category with the `on_*_error` connect-string
keys (values `halt` or `drop`):

```csharp
// Treat a schema mismatch as fatal instead of dropping the batch.
using var sender = Sender.New("ws::addr=localhost:9000;on_schema_error=halt;");
```

| Key | Scope |
|---|---|
| `on_server_error` | Catch-all default for every category. |
| `on_schema_error` | Schema-validation rejections. |
| `on_parse_error` | Client-side parse errors. |
| `on_internal_error` | Unexpected client-side errors. |
| `on_security_error` | Auth / TLS errors. |
| `on_write_error` | Transport write failures. |

`ProtocolViolation` and `Unknown` are always `Halt`, regardless of these keys.
For programmatic control, set `SenderOptions.error_policy_resolver` to a
`SenderErrorPolicyResolver` delegate.

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

## Transactions

:::caution WebSocket / QWP does not support transactions

The `Transaction` / `Commit` / `Rollback` API is **HTTP-only**. The QWP
WebSocket sender rejects it — QWP frames are independently acknowledged batches.
Use [store-and-forward](#store-and-forward) plus
[DEDUP](/docs/concepts/deduplication/) keys for delivery guarantees on QWP.

:::

For transactional ILP over HTTP, see the
[ILP overview](/docs/connect/compatibility/ilp/overview#http-transaction-semantics).

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
| Error model | Synchronous on `Send` | Async — observed via FSN / `seqTxn` watermarks |
| Transactions | Supported | Not supported (use SF + DEDUP) |
| Store-and-forward | Not available | Available (`sf_dir`) |
| Multi-endpoint failover | HTTP only | Built in (comma-separated `addr`) |
| Minimum runtime | .NET 6.0 | .NET 7.0 |

Change the connect string from `http::` to `ws::` (or `https::` to `wss::`)
and drop any transaction calls.

## Next steps

Explore more examples in the
[GitHub repository](https://github.com/questdb/net-questdb-client).

With data flowing into QuestDB, the next step is querying — see the
[Query & SQL overview](/docs/query/overview/).

Need help? Visit the [Community Forum](https://community.questdb.com/).
