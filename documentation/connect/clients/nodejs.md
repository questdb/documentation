---
slug: /connect/clients/nodejs
title: Node.js client for QuestDB
sidebar_label: Node.js
description:
  "TypeScript and JavaScript client for QuestDB on Node.js
  (@questdb/nodejs-client): QWP ingestion, streaming SQL queries, failover, and
  store-and-forward."
---

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB Node.js client, `@questdb/nodejs-client`, connects Node.js
applications to QuestDB over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), the QuestDB Wire
Protocol: a columnar binary protocol carried over WebSocket. The same client
ingests data at high throughput and runs SQL queries whose results stream back
as typed, column-oriented batches.

Key capabilities:

- **[Ingestion](#data-ingestion)**: a fluent row API and compiled,
  type-checked object-row writers, with automatic table creation, schema
  evolution, batching, and acknowledgement tracking.
- **[Querying](#querying)**: SQL with typed bind parameters, results streamed
  as columnar batches, DDL and DML execution, cancellation, deadlines, and flow
  control.
- **[One pooled client](/docs/connect/clients/nodejs-operations/#the-connection-pool)**: `connectQwpNodeClient()`
  configures ingestion and queries from one `ws::` connect string, then hands
  out pooled senders (`db.borrowSender()`) and query leases
  (`db.borrowQuery()`).
- **[Failover](/docs/connect/clients/nodejs-operations/#failover-and-high-availability)**: multi-host endpoint lists,
  automatic reconnect, and replay of unacknowledged rows. Replay is at least
  once: pair it with table [deduplication](/docs/concepts/deduplication/) for
  exactly-once ingestion.
- **[Store-and-forward](#store-and-forward)**: a disk journal that keeps
  accepting rows while QuestDB is unreachable and survives process restarts.
- **[UDP](#fire-and-forget-udp)**: fire-and-forget ingestion for metrics where
  occasional loss is acceptable.
- **[Error handling](/docs/connect/clients/nodejs-operations/#error-handling)**: typed errors, asynchronous rejection
  callbacks, and connection events. The Node.js client differs from the other
  QWP clients in a few places; see
  [Differences from other clients](/docs/connect/clients/nodejs-operations/#differences-from-other-clients).

:::tip Upgrading from 4.x or using ILP

Version 5.0.0 adds QWP and changes how the existing `Sender` handles `null`
and `undefined` values; see [Upgrading from 4.x](/docs/connect/clients/nodejs-operations/#upgrading-from-4x). To move
existing ILP code to QWP, see [From ILP to QWP](/docs/connect/clients/nodejs-operations/#from-ilp-to-qwp). The
`Sender` class still speaks ILP over HTTP and TCP; for those transports, see
[ILP transports (legacy)](/docs/connect/clients/nodejs-operations/#ilp-transports-legacy)
on the operations and reference page.

:::

## Requirements

- **`@questdb/nodejs-client` 5.0.0 or newer** for QWP. Earlier versions
  support ILP only.
- **Node.js 20.18.1 or newer**.
- **QuestDB 10.0.0 or newer**, which serves QWP on the HTTP port (`9000` by
  default) at `/write/v4` for ingestion and `/read/v1` for queries. If QuestDB
  is not running yet, see the [quick start](/docs/getting-started/quick-start/).

<span id="client-installation"></span>

## Installation

```shell
npm install @questdb/nodejs-client@^5
```

Use `yarn add @questdb/nodejs-client@^5` or
`pnpm add @questdb/nodejs-client@^5` with the other package managers. The
package exports its complete API from the package root, ships ES module and
CommonJS builds, and bundles TypeScript declarations. There are no other supported import paths.

The examples on this page are TypeScript ES modules with top-level `await`.
To run the [quick start](#quick-start) as TypeScript, save its code as
`example.mts`, then run it from the project directory:

```shell
npm install --save-dev tsx
npx tsx example.mts
```

The `.mts` extension enables ES modules and top-level `await` without changing
`package.json`. Run other examples the same way after supplying any required
configuration. To run them as plain JavaScript instead, use ES modules (`.mjs`
or `"type": "module"`) and remove type annotations, type-only imports, and
TypeScript assertions such as `as const`.

## Quick start

Connect with one connect string, create a table, write two rows, wait until
QuestDB acknowledges them, and run a query. QuestDB applies acknowledged rows
asynchronously, so the first query may return no rows.

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    // Create the table first, so the query below cannot hit a missing table.
    const ddl = await lease.query(
      "CREATE TABLE IF NOT EXISTS trades (" +
        "symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE, " +
        "timestamp TIMESTAMP) TIMESTAMP(timestamp) PARTITION BY DAY",
    );
    await ddl.completion;

    // Ingest: borrow a sender, add rows, publish them, and wait for the ACK.
    const sender = await db.borrowSender();
    try {
      await sender
        .table("trades")
        .symbol("symbol", "ETH-USD")
        .symbol("side", "sell")
        .doubleColumn("price", 2615.54)
        .doubleColumn("amount", 0.00044)
        .at(Date.now(), "ms");
      await sender
        .table("trades")
        .symbol("symbol", "BTC-USD")
        .symbol("side", "sell")
        .doubleColumn("price", 39269.98)
        .doubleColumn("amount", 0.001)
        .at(Date.now(), "ms");
      await sender.flush();
      await sender.waitForAcknowledged(sender.publishedSequence);
    } finally {
      // Returns the sender to the pool. The connection stays open.
      await sender.close();
    }

    // Query. QuestDB applies acknowledged rows asynchronously, so a query
    // right after ingestion can still return no rows; see Read-after-write.
    const query = await lease.query(
      "SELECT timestamp, symbol, price, amount FROM trades " +
        "WHERE symbol = 'ETH-USD' LIMIT 10",
    );
    for await (const batch of query) {
      for (const [timestamp, symbol, price, amount] of batch.rows()) {
        console.log(timestamp, symbol, price, amount);
      }
    }
    await query.completion;
  } catch (error) {
    if (!(error instanceof QwpEgressQueryError)) throw error;
    // QuestDB rejected the SQL: status is the QWP status code.
    console.error(`query failed: status=${error.status} ${error.message}`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

What happens:

1. `connectQwpNodeClient()` validates every key of the connect string, then
   opens one ingestion and one query connection. It rejects if QuestDB is
   unreachable.
2. `db.borrowQuery()` leases a query connection. `lease.query()` runs one SQL
   statement and returns a query handle; its `completion` promise settles when
   the statement ends.
3. `db.borrowSender()` leases a sender. Rows are staged locally until an
   auto-flush threshold is reached or the sender is flushed.
   `waitForAcknowledged()` waits until QuestDB has committed them, and
   `close()` returns the sender to the pool.
4. The query handle is an async iterable of result batches, and `batch.rows()`
   yields one array per row.
5. `db.close()` closes both pools; see
   [Closing the pooled client](/docs/connect/clients/nodejs-operations/#closing-the-pooled-client).

Without the `CREATE TABLE`, the first write creates `trades` automatically,
with a designated timestamp column named `timestamp`. A `trades` table that
already exists is left unchanged, and the sender writes to its designated
timestamp. If yours uses the `trades(ts, ...)` schema from the
[PGWire guide](/docs/connect/compatibility/pgwire/nodejs/), replace
`timestamp` with `ts` in the SQL on this page.

Timestamps come back as `bigint` microseconds since the Unix epoch; see
[Reading result values](#reading-result-values) for every type. To wait until a
write is visible to queries, see [Read-after-write](#read-after-write).

## Connecting

Create a client with one of these entry points:

| Entry point | Returns | Use it for |
|---|---|---|
| `connectQwpNodeClient(conf, options?)` | `Promise<QwpClient>` | The recommended pooled client for ingestion and queries. Opens the pool minimums and rejects if QuestDB is unreachable. |
| `createQwpNodeClient(conf, options?)` | `QwpClient` | The same pooled client without contacting the server. It connects on `db.connect()` or on the first borrow. |
| `Sender.fromConfig(conf, options?)` | `Promise<Sender>` | A standalone sender for ingestion only, or for migrating existing ILP code. |
| `connectQwpNodeSender(connection, senderOptions?, sessionOptions?)` | `Promise<QwpSender>` | A standalone sender with every column method, configured with typed options instead of a connect string. |

### Pooled client

`connectQwpNodeClient()` takes one `ws::` or `wss::` connect string for both
directions. Every `addr` entry is used for ingestion (`/write/v4`) and for
queries (`/read/v1`), and the credentials and TLS keys apply to both:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;sender_pool_max=2;query_pool_max=8;",
);
try {
  console.log(db.metrics.senders, db.metrics.queries);
} finally {
  await db.close();
}
```

The `QwpClient` handle has five members:

| Member | Returns | Purpose |
|---|---|---|
| `borrowSender()` | `Promise<QwpSender>` | Lease an exclusive sender. Its `close()` flushes and returns it to the pool. |
| `borrowQuery()` | `Promise<QwpQueryLease>` | Lease an exclusive query connection. Its `close()` returns it to the pool. |
| `connect()` | `Promise<QwpClient>` | Open the pool minimums. Called for you by `connectQwpNodeClient()`. Safe to retry after a failure. |
| `metrics` | `QwpClientMetrics` | Pool counters (`total`, `available`, `leased`, `creating`, `waiting`) for senders and queries. |
| `close()` | `Promise<void>` | Close both pools. Resolves even if rows are not acknowledged; see [Closing the pooled client](/docs/connect/clients/nodejs-operations/#closing-the-pooled-client). Idempotent. |

Share one `QwpClient` across your application and close it at shutdown. See
[The connection pool](/docs/connect/clients/nodejs-operations/#the-connection-pool) for pool sizing and lease rules.

### Standalone Sender

The `Sender` class predates QWP. Changing its connect string from `http::` to
`ws::` switches it from ILP to QWP while keeping the same row API:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  // Opens the WebSocket now, so connection errors surface here.
  await sender.connect();
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.00044)
    .at(Date.now(), "ms");
  await sender.flush();
} finally {
  // Publishes completed rows and waits up to 5 seconds for their ACK.
  // Rejects with QwpSenderCloseTimeoutError if the ACK does not arrive.
  await sender.close();
}
```

`Sender` is ingestion-only. It accepts the complete QWP connect-string
vocabulary, and logs a warning for keys that only the pooled client can apply,
such as `query_pool_max` or `compression`. Its fluent API has only the nine
column methods that also exist for ILP, listed under
[Column methods](#column-methods). For every other QuestDB type, use its
[compiled writer](#compiled-object-row-writers) through `sender.writer()`,
which supports every type, or use a pooled sender or `connectQwpNodeSender()`,
which expose every column method.

`connectQwpNodeSender()` builds a standalone `QwpSender` from typed options.
Its first argument takes the full ingestion URL, and credentials as an
`authorization` header value such as `` `Bearer ${token}` ``:

```typescript
import { connectQwpNodeSender } from "@questdb/nodejs-client";

const sender = await connectQwpNodeSender(
  { url: "ws://localhost:9000/write/v4" },
  { autoFlushRows: 5_000, autoFlushIntervalMs: 1_000 },
);
try {
  await sender
    .table("orders")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .uuidColumn("order_id", "9f1c96b2-54b8-4d85-bb24-e82c6f1ac120")
    .doubleColumn("price", 2615.54)
    .doubleColumn("amount", 0.5)
    .at(Date.now(), "ms");
  await sender.flush();
} finally {
  await sender.close();
}
```

### Environment variable

Keep credentials out of source code by putting the connect string in the
`QDB_CLIENT_CONF` environment variable:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;token=YOUR_TOKEN;"
```

`Sender.fromEnv()` reads the variable. The pooled client takes the string
directly:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const conf = process.env.QDB_CLIENT_CONF;
if (!conf) throw new Error("QDB_CLIENT_CONF is not set");
const db = await connectQwpNodeClient(conf);
try {
  // borrow senders and query leases
} finally {
  await db.close();
}
```

### Connect string syntax

A QWP connect string has the form `schema::key=value;key=value;`:

- **Schema**: `ws` (plain WebSocket) or `wss` (WebSocket over TLS). Both
  default to port `9000` when `addr` omits the port.
- **`addr`**: `host[:port]`. List several endpoints for failover, either
  comma-separated (`addr=a:9000,b:9000`) or by repeating the key. Enclose IPv6
  addresses in brackets: `addr=[::1]:9000`.
- **Keys** are lowercase and case-sensitive. An unrecognized key fails with
  `unknown configuration key: <key>`. Legacy ILP keys fail with a hint:
  `retry_timeout` and `tls_ca` name their QWP replacements
  (`reconnect_max_duration_millis` and `tls_roots`), and keys with no QWP
  equivalent, such as `init_buf_size`, say that they apply only to the legacy
  transports.
- **Values** end at `;`. Double a semicolon to include it in a value:
  `password=p;;ssw;;rd` sets the password to `p;ssw;rd`. The trailing `;` is
  optional. Every key needs a value: `client_id=;` fails with
  `value is not set for 'client_id'`.
- **Each key appears once**, except `addr`. Repeating a key fails with
  `Duplicate QWP cluster configuration key: '<key>'`, and so does setting a key
  and its alias, such as `user` and `username`.
- **No spaces** around the commas in `addr`: `addr=a:9000, b:9000` fails with
  `Invalid QWP cluster address entry: ' b:9000'`.

To add settings to a connect string that comes from configuration, such as
`QDB_CLIENT_CONF`, append only keys that the string does not set already, or
pass the setting as a [typed option](/docs/connect/clients/nodejs-operations/#programmatic-options), which takes
precedence without a duplicate-key error.

The Node.js client's parser differs from some other clients in these ways:

- `auto_flush_rows` and `auto_flush_interval` take `0`, not `off`, to disable
  a trigger. `auto_flush=off` disables auto-flushing entirely.
- Size values accept the single-letter suffixes `k`, `m`, `g`, and `t`
  (`sf_max_total_bytes=10g`). The two-letter forms `kb`, `mb`, and `gb` are
  rejected.

For every key and its default, see the
[connect string reference](/docs/connect/clients/connect-string/) and the
[configuration reference](/docs/connect/clients/nodejs-operations/#configuration-reference).

## Ingestion modes {#ingestion-modes}

The storage choice (`sf_dir`) and the first-connection choice
(`initial_connect_retry` or `lazy_connect`) are independent. This page uses
these names for how a sender publishes and retries:

| Mode | Enabled by | `flush()` resolves when | During an outage |
|---|---|---|---|
| Default memory mode | Neither `sf_dir` nor a background start | The batch is written to the WebSocket, or queued for replay | `flush()`, auto-flushing `at()`, and a borrowed sender's `close()` wait for the reconnect, up to `reconnect_max_duration_millis` (5 minutes) |
| Background memory mode | No `sf_dir`; `initial_connect_retry=async` or `lazy_connect=on` | The batch is added to the in-memory replay queue | Rows keep being accepted until the queue is full |
| Store-and-forward | `sf_dir`, with either foreground or background startup | The batch is appended to the disk journal | Rows keep being accepted until the journal is full |

Background startup retries the first connection indefinitely, with or without
`sf_dir`. With foreground startup, a sender with `sf_dir` must connect first;
subsequent disconnects are retried indefinitely. In the default memory mode,
a running sender stops after the reconnect budget. See
[Starting while QuestDB is down](/docs/connect/clients/nodejs-operations/#starting-while-questdb-is-down) and
[Ingestion reconnect](/docs/connect/clients/nodejs-operations/#ingestion-reconnect) for startup and outage behavior.

<span id="authentication"></span>

## Authentication and TLS

QWP authenticates on the WebSocket upgrade request, before any data is
exchanged. The credential and TLS keys apply to both ingestion and queries.

### Token (Enterprise, recommended)

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");
const db = await connectQwpNodeClient(
  `wss::addr=db.example.com:9000;token=${token};`,
);
await db.close();
```

The token is sent as an `Authorization: Bearer` header on every ingestion and
query upgrade. A [REST token](/docs/security/rbac/#authentication) and an OIDC
access token both use `token`. It cannot be combined with
`username`/`password`.

### HTTP basic auth

```text
wss::addr=db.example.com:9000;username=admin;password=quest;
```

`user` and `pass` are accepted aliases. Both halves must be present, and the
username cannot contain `:`.

### TLS

The `wss` schema enables TLS and, by default, verifies the server certificate
against the CA certificates bundled with Node.js, not the operating system's
trust store. A private CA installed only in the operating system is not
trusted. To trust it,
set `tls_roots`, or add it for the whole process with the
`NODE_EXTRA_CA_CERTS` environment variable, which Node.js reads at startup.
Two keys adjust verification, and both are rejected on a plain `ws` string:

- `tls_roots=/path/to/ca.pem` trusts the CA certificates in a PEM file instead
  of the bundled ones. The Node.js client accepts PEM only:
  `tls_roots_password` and PKCS#12 or JKS stores are rejected. Export the CA
  certificates to PEM first.
- `tls_verify=unsafe_off` disables certificate verification. Use it only in
  development. It cannot be combined with `tls_roots`.

To route the connection through an HTTP or SOCKS proxy, pass an agent such as
`https-proxy-agent` in `webSocket.agent` (or `qwp.webSocket.agent` on a
`Sender`). A custom agent owns certificate verification, so it cannot be
combined with `tls_verify` or `tls_roots`.

The pooled client reports connection setup failures as the `cause` of a
`QwpPoolResourceError`. For the setup deadlines and the errors they produce,
see [Connection timeouts](/docs/connect/clients/nodejs-operations/#connection-timeouts).

### Unsupported authentication paths

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or refresh | Not supported. The client does not talk to an identity provider and has no callback to refresh a token. | Obtain an access token from your identity provider, pass it as `token=...`, and create a new client before the token expires. See [OpenID Connect](/docs/security/oidc/). |
| Token rotation mid-session | Not supported. The credential is read once, when the client is created, and reused for every reconnect. QuestDB rejects an expired token when the client next opens a connection: queries and senders in default memory mode then fail, while senders with `sf_dir` or in background memory mode keep retrying and buffering (see [Connection-level errors](/docs/connect/clients/nodejs-operations/#connection-level-errors)). | Close the client and create a new one with the new token before the old one expires. |
| Mutual TLS (client certificates) | Not supported. QuestDB does not negotiate client certificates. | Use token or basic authentication over `wss`. |
| ILP JWK authentication | Not available for QWP. `auth`, `jwk`, `token_x`, and `token_y` are rejected on `ws`/`wss`. | Use token or basic authentication. |

### Production example: TLS, token, and multiple hosts

A typical Enterprise deployment combines `wss`, a token, and several hosts in
one connect string:

```text
wss::addr=db-a.example.com:9000,db-b.example.com:9000;token=YOUR_TOKEN;
```

Add `tls_roots=/path/to/ca.pem;` when the servers use a private CA. See
[Multiple endpoints](/docs/connect/clients/nodejs-operations/#multiple-endpoints) for routing queries to replicas, and
the [full example](/docs/connect/clients/nodejs-operations/#full-example-ingestion-and-querying-with-failover) for a
complete program with this configuration.

## Data ingestion

<span id="basic-insert"></span>

### General usage pattern

A sender is not safe for concurrent producers: the row in progress is shared
state, so borrow one sender per producer (see [Concurrency](/docs/connect/clients/nodejs-operations/#concurrency)).

1. Borrow a sender with `db.borrowSender()`, or create a
   [standalone `Sender`](#standalone-sender).
2. Call `table(name)` to start a row.
3. Add values with the [column methods](#column-methods), such as
   `symbol(name, value)` and `doubleColumn(name, value)`. For a nullable column,
   pass `null` or `undefined`, or skip the column to store NULL (see
   [Null values](#null-values) for non-nullable defaults).
4. Close the row with `at(timestamp, unit)` or `atNow()`, and `await` the
   returned promise. It rejects if an auto-flush triggered by the row fails.
5. Repeat from step 2, and call `flush()` to publish staged rows.
6. `close()` the sender when done.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.54)
      .doubleColumn("amount", 0.25)
      .at(Date.now(), "ms");
    await sender.flush();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

`flush()` resolving means the rows were published, not that QuestDB accepted
them. QuestDB reports a rejected batch, such as one with a value of the wrong
type for an existing column, after `flush()` has resolved: to the
`onSenderError` callback, which only logs it by default, and as a rejection of
`waitForAcknowledged()`. When your code must know that QuestDB accepted the
rows, wait for the acknowledgement after flushing, with
`await sender.waitForAcknowledged(sender.publishedSequence)`. See
[Awaiting acknowledgements](#awaiting-acknowledgements) and
[Ingestion errors](/docs/connect/clients/nodejs-operations/#ingestion-errors).

Tables and columns are created automatically, with the column types listed
below. Table and column names are validated locally with QuestDB's rules
(at most 127 UTF-8 bytes by default, see `max_name_len`), and column names are
case-insensitive: the first spelling used is kept.

When local value validation in a column method or `at()` fails, the sender
discards the whole row in progress, including its table, so a half-built row
never reaches QuestDB. The next row must start with `table()` again; a column
method called before that throws `table name must be set before adding columns`.
`cancelRow()` discards a row in progress without an error, and `reset()` also
drops every row staged since the last flush.

An awaited `at()` or `atNow()` can also reject because an auto-flush failed
after the row was completed. Whether the completed rows are still staged, and
what to do next, depends on the error class; see the
[Error handling](/docs/connect/clients/nodejs-operations/#error-handling) table.

### Column methods

These methods are available on pooled senders and on senders from
`connectQwpNodeSender()`. Each creates the listed column type when the column
does not exist yet:

| Method | QuestDB type created | Accepted values |
|---|---|---|
| `symbol(name, value)` | SYMBOL | Any value, converted with `String()` |
| `stringColumn(name, value)` | VARCHAR | `string` |
| `booleanColumn(name, value)` | BOOLEAN | `boolean` |
| `byteColumn(name, value)` | BYTE | Integer `number` from -128 to 127 |
| `shortColumn(name, value)` | SHORT | Integer `number` from -32768 to 32767 |
| `int32Column(name, value)` | INT | 32-bit integer `number`. `-2147483648` stores NULL |
| `longColumn(name, value)`, `intColumn(name, value)` | LONG | Safe-integer `number` or `bigint`. `-9223372036854775808n` stores NULL |
| `float32Column(name, value)` | FLOAT | `number` |
| `doubleColumn(name, value)`, `floatColumn(name, value)` | DOUBLE | `number` |
| `timestampColumn(name, value, unit?)` | TIMESTAMP, or TIMESTAMP_NS with unit `"ns"` | Integer `number` or `bigint`. Unit `"us"` (default), `"ms"`, or `"ns"`; `"ns"` requires a `bigint` |
| `dateColumn(name, value)` | DATE | Epoch milliseconds as `number` or `bigint` |
| `charColumn(name, value)` | CHAR | One-character `string` (a single UTF-16 code unit) |
| `binaryColumn(name, value)` | BINARY | `Uint8Array`, copied when staged |
| `uuidColumn(name, value)` | UUID | Canonical UUID `string`, or 16 bytes in canonical big-endian order |
| `long256Column(name, w0, w1, w2, w3)` | LONG256 | Four 64-bit `bigint` words, least significant first |
| `ipv4Column(name, value)` | IPv4 | Dotted-quad `string` or packed 32-bit `number`. `0.0.0.0` is QuestDB's IPv4 NULL value and is rejected; pass `null` for NULL |
| `geohashColumn(name, bits, precisionBits)` | GEOHASH | Raw bits as `bigint`, precision from 1 to 60 bits |
| `decimalColumnText(name, value)` | DECIMAL(76, scale) | Decimal `string` or `number`. The scale comes from the literal |
| `decimalColumn(name, unscaled, scale)` | DECIMAL(76, scale) | Unscaled `bigint`, or big-endian two's-complement `Int8Array` |
| `decimal64Column(name, unscaled, scale)` | DECIMAL(18, scale) | Unscaled `bigint`, scale up to 18 |
| `decimal128Column(name, unscaled, scale)` | DECIMAL(38, scale) | Unscaled `bigint`, scale up to 38 |
| `decimal256Column(name, unscaled, scale)` | DECIMAL(76, scale) | Unscaled `bigint`, scale up to 76 |
| `arrayColumn(name, value)` | DOUBLE[], DOUBLE[][], ... | Nested `number` arrays of uniform shape, 1 to 32 dimensions |
| `longArrayColumn(name, value)` | LONG[] | Encoded for protocol parity. Current QuestDB servers reject LONG arrays terminally; see [Arrays](#arrays) |

Names that differ from what you might expect:

- `floatColumn()` and `intColumn()` write 64-bit DOUBLE and LONG. Use
  `float32Column()` and `int32Column()` for FLOAT and INT.
- There is no `nullColumn()` or `setNull()`. Pass `null` or `undefined`, or
  skip the column; the stored value depends on the column's
  [nullability](#null-values).
- Arrays use `arrayColumn()`. `doubleArray()` is a
  [compiled writer](#compiled-object-row-writers) field, not a sender method.
- `geohashColumn()` takes raw bits only. Base-32 geohash text is accepted by a
  compiled writer's `geohash()` field.

One row can mix any of these methods. This example creates an `orders` table
with a UUID, INT, LONG, BOOLEAN, and a second TIMESTAMP column:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    const submittedMs = Date.now() - 250;
    await sender
      .table("orders")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .uuidColumn("order_id", "0b2b6c4e-7c39-4f0e-9d5a-2f8e61c3a7d4")
      .doubleColumn("price", 2615.54) // DOUBLE
      .doubleColumn("amount", 0.5)
      .int32Column("venue_id", 7) // INT
      .longColumn("lots", 125n) // LONG
      .booleanColumn("is_maker", true) // BOOLEAN
      .timestampColumn("submitted_at", submittedMs, "ms") // TIMESTAMP
      .at(Date.now(), "ms");
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

:::caution SYMBOL is for bounded sets of values

Use SYMBOL for values from a bounded set, such as tickers, sides, or venues.
Each sender keeps every distinct SYMBOL value it has sent, across all tables
and columns, in a dictionary that holds at most 2,000,000 values. The
dictionary is not cleared while the sender lives, and no metric reports its
size. Staging a row never fails because of it: the flush that sends a batch
with a value beyond the limit fails with an `Error`, whether it is an explicit
`flush()`, the auto-flush of an `at()`, or `close()`. The rows stay staged, so
every later flush fails the same way. Call `reset()` to drop them; rows with
values the sender already knows can still be sent. Only a new sender starts
with an empty dictionary: close a standalone sender and create another. A
pooled sender whose `close()` fails with this error is replaced by the pool.
Store unique or high-cardinality values, such as trade or order IDs, as VARCHAR
with `stringColumn()`, or as UUID with `uuidColumn()`. See
[Symbol](/docs/concepts/symbol/).

:::

The standalone `Sender` class exposes only these nine: `symbol`, `stringColumn`,
`booleanColumn`, `floatColumn`, `intColumn`, `timestampColumn`, `arrayColumn`,
`decimalColumn`, and `decimalColumnText`. Its `writer()` method supports every
type.

A column's type is fixed by the first value a sender stages for it. Writing a
different type to the same column in a later row throws
`column type mismatch for '<name>'`.

Within one row, duplicate column assignments keep the first value, including
names that differ only in case. For example,
`.doubleColumn("price", 1).stringColumn("PRICE", "wrong")` keeps `1` and does
not raise a type mismatch. Invalid values can still fail local validation.

For an existing table, QuestDB rejects an incompatible type or value
asynchronously; see [Ingestion errors](/docs/connect/clients/nodejs-operations/#ingestion-errors). Compatible
conversions are allowed: for example, `longColumn("price", 123n)` can write to
an existing DOUBLE column. This does not change the sender's local
type-consistency rule.

### Null values

Passing `null` or `undefined` to a column method omits the column, just like
leaving it out of the row. For an existing nullable column, QuestDB stores SQL
NULL. BOOLEAN, BYTE, and SHORT are not nullable: omitted BOOLEAN values become
`false`, and omitted BYTE and SHORT values become `0`.

CHAR uses the zero character as its NULL marker. Current QWP query results can
return that marker as the one-character string `"\u0000"`, rather than JavaScript
`null`. See the [data types](/docs/query/datatypes/overview/) and
[type nullability](/docs/query/datatypes/overview/#type-nullability) references.

For example, omitting a value for an existing SYMBOL column stores NULL:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    const trade: { side?: string; amount?: number } = { amount: 0.011 };
    await sender
      .table("trades")
      .symbol("symbol", "BTC-USD")
      .symbol("side", trade.side) // undefined: stored as NULL
      .doubleColumn("price", 39269.98)
      .doubleColumn("amount", trade.amount)
      .at(Date.now(), "ms");
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

- An omitted column is not created on a table that lacks it: a NULL carries no
  type to infer from.
- The column name is still validated when the value is nullish.
- Rows that already exist in a batch, or rows added later, use the same
  NULL or non-nullable default for any column they do not set.
- INT, LONG, and DATE reserve their minimum values as NULL: writing
  `-2147483648` to INT or `-9223372036854775808n` to LONG or DATE stores NULL.
  IPv4 reserves `0.0.0.0` for NULL too, but `ipv4Column()` rejects it with a
  `RangeError` and discards the row: pass `null` to store an IPv4 NULL.
- A row where every column value is nullish is still sent over WebSocket.
  Its non-designated columns use the NULL/default rules above; the designated
  timestamp comes from `at()` or `atNow()`. To drop such a row instead, call
  `cancelRow()` before closing it. Over UDP, `atNow()` rejects such a row while
  the sender knows no non-null column for the table.

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) controls
partitioning and ordering. Set it when closing the row:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    // Milliseconds, for example from Date.now()
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.54)
      .doubleColumn("amount", 0.5)
      .at(Date.now(), "ms");

    // Microseconds are the default unit
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "sell")
      .doubleColumn("price", 2615.55)
      .doubleColumn("amount", 0.2)
      .at(BigInt(Date.now()) * 1000n);

    // Server-assigned timestamp
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.56)
      .doubleColumn("amount", 0.1)
      .atNow();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

`at(value, unit)` accepts an integer `number` or a `bigint` with unit `"us"`
(the default), `"ms"`, or `"ns"`. `Date.now()` returns milliseconds, so always
pass `"ms"` with it: without a unit, the value is read as microseconds and the
row lands in January 1970. Nanoseconds require a `bigint`, because epoch
nanoseconds exceed the safe integer range. When the table does not exist yet,
`"ns"` creates a `TIMESTAMP_NS` designated timestamp and the other units create
a microsecond `TIMESTAMP`. An auto-created designated timestamp column is named
`timestamp`.

`atNow()` leaves the timestamp to QuestDB, which assigns it when the row
arrives. Rows replayed after a reconnect are stamped with the replay time.
Prefer event timestamps from your source data: they keep rows in event order and
make [deduplication](/docs/concepts/deduplication/) possible, which is
[required for exactly-once delivery](/docs/concepts/delivery-semantics/).

Other timestamp columns use `timestampColumn(name, value, unit)` with the same
units. For converting dates and strings, see
[Date to timestamp conversion](/docs/connect/clients/date-to-timestamp-conversion/).

### Arrays

`arrayColumn()` takes nested `number` arrays and creates a `DOUBLE` array column
with the same number of dimensions:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("order_book")
      .symbol("symbol", "BTC-USD")
      // shape [2, N]: row 0 holds prices, row 1 holds sizes
      .arrayColumn("bids", [
        [64901.6, 64901.5, 64901.4],
        [3.02, 0.06, 1.2],
      ])
      .arrayColumn("asks", [
        [64901.7, 64901.8, 64901.9],
        [1.54, 0.21, 2.5],
      ])
      .at(Date.now(), "ms");
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

Every sub-array at the same depth must have the same length, and arrays may
have 1 to 32 dimensions. Only DOUBLE arrays can be ingested:
`longArrayColumn()` exists for protocol parity, but current servers reject it
with `long arrays are not supported, only double arrays`. The rejection is
terminal; see
[Recovering from a terminal rejection](/docs/connect/clients/nodejs-operations/#recovering-from-a-terminal-rejection).
Query results return arrays as `{ dimensions, values }`; see
[Reading result values](#reading-result-values).

<span id="decimal-insertion"></span>

### Decimals

Create decimal columns ahead of time with the precision you need. QWP can
create them automatically, but it picks the maximum precision of the wire
width (18, 38, or 76 digits). See
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals).
To also query a decimal column over QWP, give it a precision of 10 or more:
current servers cannot return a DECIMAL with a precision of 9 or less (see
[Reading result values](#reading-result-values)).

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const ddl = await lease.query(
      "CREATE TABLE IF NOT EXISTS trade_fees (" +
        "timestamp TIMESTAMP, symbol SYMBOL, " +
        "settled_price DECIMAL(18, 2), commission DECIMAL(18, 4)" +
        ") TIMESTAMP(timestamp) PARTITION BY DAY",
    );
    await ddl.completion;
  } finally {
    await lease.close();
  }

  const sender = await db.borrowSender();
  try {
    await sender
      .table("trade_fees")
      .symbol("symbol", "ETH-USD")
      .decimal64Column("settled_price", 261554n, 2) // 2615.54
      .decimalColumnText("commission", "0.0750") // keeps the literal's scale
      .at(Date.now(), "ms");
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

- <span id="text-literal-easy-to-use"></span> `decimalColumnText()` takes a
  decimal string (such as `"0.0750"`) and preserves the literal's scale,
  including trailing zeros. Strings and numbers both accept scientific notation
  (such as `"1.5e-3"`); pass a string when scale matters, because JavaScript
  drops trailing zeros when formatting numbers.
- <span id="binary-form-high-throughput"></span>
  `decimalColumn(name, unscaled, scale)` takes the unscaled value as a `bigint`
  or as big-endian two's-complement bytes in an `Int8Array`.
- `decimal64Column()`, `decimal128Column()`, and `decimal256Column()` take an
  unscaled `bigint` and select the wire width directly.

Scale rules:

- The first value staged for a decimal column fixes its scale until the next
  flush. Later values are rescaled exactly (`"2.50"` becomes `2.5` at scale 1),
  and a value that would lose digits throws a `RangeError`, such as `"1.25"`
  at scale 1.
- When QWP creates the column, the first value's scale becomes the column's
  scale.
- QuestDB converts each value to the table column's scale when no digits are
  lost: `"2615.5400"` is stored as `2615.54` in a `DECIMAL(18, 2)` column. A
  value that would lose digits, such as `0.0015` for `DECIMAL(18, 2)`, fails
  the whole batch with a terminal `schema-mismatch` rejection. Stage values
  with the column's scale.

### Compiled object-row writers

When your data is already a stream of objects with one shape, compile a writer
for the table once. The writer validates each complete row before staging it,
and TypeScript checks every row against the schema:

```typescript
import {
  connectQwpNodeClient,
  designatedTimestamp,
  double,
  QwpWriterRowError,
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

    await trades.row({
      symbol: "ETH-USD",
      side: "sell",
      price: 2615.54,
      amount: 0.00044,
      timestamp: Date.now(),
    });

    // Arrays, iterables, and async iterables.
    // Absent nullable fields store NULL.
    await trades.rows([
      {
        symbol: "BTC-USD",
        side: "buy",
        price: 39269.98,
        timestamp: Date.now(),
      },
    ]);
  } catch (error) {
    if (!(error instanceof QwpWriterRowError)) throw error;
    // Names the table, the column, and the zero-based row index for rows().
    console.error(error.message);
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

A rejected row is never partly staged, and rows accepted before a failing row
in `rows()` stay staged. Unknown keys and type mismatches raise
`QwpWriterRowError`. Writers apply the sender's normal auto-flush, transaction,
and acknowledgement settings. `writer()` works on pooled senders and on the
standalone `Sender` over `ws`, `wss`, or `udp`; an ILP `Sender` throws.

Schema fields:

| Field | QuestDB type | Row value |
|---|---|---|
| `symbol()` | SYMBOL | `string` |
| `varchar()` | VARCHAR | `string` |
| `char()` | CHAR | One-character `string` |
| `bool()` | BOOLEAN | `boolean` |
| `byte()`, `short()` | BYTE, SHORT | `number` |
| `int32()` | INT | `number` |
| `int64()`, `long()` | LONG | `bigint` |
| `float32()` | FLOAT | `number` |
| `float64()`, `double()` | DOUBLE | `number` |
| `timestamp(unit)` | TIMESTAMP or TIMESTAMP_NS | `number` or `bigint`; `"ns"` requires `bigint` |
| `designatedTimestamp(unit)` | Designated TIMESTAMP, or TIMESTAMP_NS with `"ns"` | As `timestamp(unit)`, required in every row. At most one per schema. The field's key names the row property only: the value always goes to the table's designated timestamp, which is named `timestamp` when QWP creates the table |
| `date()` | DATE | Epoch milliseconds |
| `binary()` | BINARY | `Uint8Array` |
| `uuid()` | UUID | Canonical UUID `string`, 16 big-endian bytes, or `{ low, high }` |
| `long256()` | LONG256 | Unsigned 256-bit `bigint`, `0x` hex text, four little-endian words, or `{ words }` |
| `ipv4()` | IPv4 | Dotted-quad `string` or packed `number`. `0.0.0.0` is rejected; omit the field for NULL |
| `geohash(precisionBits)` | GEOHASH | Raw bits, base-32 text of `precisionBits / 5` characters, or `{ bits, precisionBits }` |
| `decimal64(scale)`, `decimal128(scale)`, `decimal256(scale)` | DECIMAL | Unscaled `bigint`, decimal text, `number`, or `{ unscaled, scale }` |
| `doubleArray()` | DOUBLE[] | Nested `number` arrays, or `{ dimensions, values }` |
| `longArray()` | LONG[] | Encoded for parity; current servers reject LONG arrays terminally, as for `longArrayColumn()` |

LONG fields take `bigint` so they never lose precision. The object forms
(`{ low, high }`, `{ words }`, `{ bits, precisionBits }`, `{ unscaled, scale }`,
`{ dimensions, values }`) match what [query results](#reading-result-values)
return, so a queried value can be written back unchanged. A writer's decimal
field rescales values to the field's scale and rejects a value that would need
rounding.

### Flushing

Rows are staged in memory until a flush publishes them. Auto-flush is on by
default and flushes after the row that crosses the first threshold:

| Trigger | Default | Connect-string key | Typed option |
|---|---|---|---|
| Row count | 1,000 rows | `auto_flush_rows` | `autoFlushRows` |
| Time since the last flush, or since the sender was created | 100 ms | `auto_flush_interval` | `autoFlushIntervalMs` |
| Estimated buffered bytes | Disabled | `auto_flush_bytes` | `autoFlushBytes` |

The interval is checked when a row is added. There is no background timer, so
call `flush()` after a burst of rows, or rows staged before an idle period wait
for the next row. `auto_flush=off` disables all triggers. `auto_flush_bytes` is
clamped to 90% of the effective batch limit: the server's limit, or
`sf_max_segment_bytes` when that is lower (see
[Batch size limits](#batch-size-limits)).

The [ingestion mode](#ingestion-modes) determines when `flush()` resolves.
In every mode, `flush()` does not wait for QuestDB to acknowledge the rows,
unless you set `awaitServerAck`. Unacknowledged batches are kept and replayed
after a reconnect. See [Awaiting acknowledgements](#awaiting-acknowledgements)
and [Store-and-forward](#store-and-forward).

#### Backpressure

The in-memory replay queue is capped at 128 MiB. When it is full, publishing
waits up to 30 seconds for acknowledgements to free space, then rejects with
`QwpMemoryReplayAppendTimeoutError`. Tune the cap with `sf_max_total_bytes` and
the wait with `sf_append_deadline_millis`; without `sf_dir` they size the
memory queue. A store-and-forward journal applies the same backpressure and
rejects with `QwpReplayStoreAppendTimeoutError`; see
[Journal capacity](#sf-capacity).

After an append timeout the batch stays staged and the sender stays usable.
Keep the sender, slow the producer, and call `flush()` again later. Don't write
the rows again, and don't `close()` a borrowed sender while backpressure
persists: its `close()` flushes too, so it can time out the same way, and the
pool discards a borrowed sender whose `close()` fails. In the memory modes,
every batch it held that QuestDB has not acknowledged by the time it closes is
lost with it.

`sender.metrics.ingress` shows the backlog in every mode: `pendingReplayFrames`
and `pendingReplayBytes` count the published batches that QuestDB has not
acknowledged yet. In the memory modes, `memoryReplayUsedBytes` and
`memoryReplayMaxBytes` show how full the replay queue is, and
`totalMemoryReplayBackpressureStalls` counts publishes that had to wait.
`metrics` is available on pooled senders and on senders from
`connectQwpNodeSender()`, not on the standalone `Sender` class.

#### Batch size limits

When the sender connects, QuestDB advertises the largest batch it accepts:
about 2 MiB (2,097,138 bytes) on a default server, set by
`http.recv.buffer.size`. A batch must also fit in `sf_max_segment_bytes`,
which defaults to 4 MiB with `sf_dir` and applies without `sf_dir` only when
you set it.

A row too large to fit in one batch fails the `flush()`, or the `at()` whose
auto-flush sends it, with `QwpBatchTooLargeError` before anything is sent.
That batch can never be sent: the staged rows are kept, every later flush fails
the same way, and `close()` discards them and rejects with the same error.
Call `reset()` to drop every row staged since the last flush, then write the
rows again without the oversized one.

Until a sender has connected once, it does not know the server's limit. This
applies in background memory mode and to a store-and-forward sender with
`lazy_connect=on` or `initial_connect_retry=async` that starts while QuestDB
is down. Batches are then capped only by
`sf_max_segment_bytes`: 4 MiB with `sf_dir`, and no cap without it. A batch
larger than the server's limit passes `flush()` but can never be delivered:
the sender keeps reconnecting, and `waitForAcknowledged()` times out. With
`sf_dir`, the batch also blocks the journal, so later rows are not delivered
and a restarted client fails with `QwpPoolResourceError`. If the client can
start while QuestDB is down, set `sf_max_segment_bytes` below the server's
limit, for example `1m`: `2m` is slightly above a default server's limit.

### Closing a sender

`close()` publishes the sender's completed rows and discards an unfinished row
with a warning. The rest depends on how you created the sender. With
transactions on, see also [Transactions](#transactions).

#### Closing a standalone sender

`close()` waits up to `close_flush_timeout_millis` (5 seconds by default) for
QuestDB to acknowledge every published row, then closes the connection. `0` or
a negative value skips the wait. If the acknowledgement does not arrive in
time, `close()` rejects with `QwpSenderCloseTimeoutError`. Its
`targetSequence` is the last sequence `close()` waited for, and its
`acknowledgedSequence` is how far QuestDB acknowledged. Without `sf_dir`, the
unacknowledged rows may be lost. With `sf_dir`, they stay in the journal for
the next sender on that directory. A rejection in `finally` replaces any error
the `try` block threw, so catch it there when that matters:

```typescript
import { QwpSenderCloseTimeoutError, Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  await sender.connect();
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.5)
    .at(Date.now(), "ms");
} finally {
  try {
    await sender.close();
  } catch (error) {
    if (!(error instanceof QwpSenderCloseTimeoutError)) throw error;
    console.warn(
      `published through ${error.targetSequence}, ` +
        `acknowledged through ${error.acknowledgedSequence}`,
    );
  }
}
```

#### Closing a borrowed sender

`close()` flushes the sender's completed rows and returns it to the pool
without closing its connection. By default it does not wait for
acknowledgements. With `awaitServerAck: true` or `awaitDurableAck: true`, the
flush performed by `close()` waits for its acknowledgement too. To confirm
delivery of every row the sender published before returning it, call
`flush()` and then `waitForAcknowledged(sender.publishedSequence)`; see
[Awaiting acknowledgements](#awaiting-acknowledgements).

In the default memory mode, the flush in `close()` behaves like `flush()`
during an outage: it waits for the reconnect, up to
`reconnect_max_duration_millis` (5 minutes by default), then rejects with
`QwpReconnectExhaustedError`, and the rows are lost. A standalone sender's
`close()` is bounded by `close_flush_timeout_millis` instead. `db.close()` does
not wait for such a `close()` to finish, and the process stays alive until it
does. To keep shutdown within a deadline, such as a container's termination
grace period, lower `reconnect_max_duration_millis` to fit it, or use
store-and-forward: with `sf_dir`, `flush()` appends to the journal and
returns, and the rows survive the restart.

When a borrowed sender's `close()` fails, the pool discards the sender and
opens a new one for the next borrow. In the memory modes, the batches that
QuestDB has not acknowledged by the time the discarded sender closes are lost
with it; with `sf_dir`, they stay in its journal. Because QuestDB reports rejected batches
asynchronously, a sender can fail after its `close()` already succeeded: the
error then surfaces on the next borrower's auto-flushing `at()`, `flush()`, or
`close()`, and the pool replaces the sender after that. The next borrower's own
staged rows are lost with the failed sender, even rows for other tables: write
them again on a new borrow. See [Ingestion errors](/docs/connect/clients/nodejs-operations/#ingestion-errors).

### Awaiting acknowledgements

QuestDB acknowledges ingested batches asynchronously. Every published frame gets
a sequence number, and the acknowledgement watermark is cumulative, so waiting
for one sequence also covers every earlier one:

```typescript
import {
  connectQwpNodeClient,
  QwpIngressAckTimeoutError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.54)
      .doubleColumn("amount", 0.5)
      .at(Date.now(), "ms");

    // Wait for every row published so far, including rows an auto-flush
    // already sent. Rejects with the server's error if QuestDB rejected them.
    await sender.flush();
    await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
  } catch (error) {
    if (error instanceof QwpIngressAckTimeoutError) {
      // Still pending in memory, but closing without sf_dir can lose them.
      console.warn(
        "ACK timeout; rows may be lost on close at",
        error.acknowledgedSequence,
      );
    } else {
      throw error;
    }
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

| Member | Returns |
|---|---|
| `publishedSequence` | The highest sequence this sender published, including by auto-flushes, or `-1n`. After `flush()`, it covers every row written so far. |
| `waitForAcknowledged(sequence, timeoutMs?)` | Resolves when the watermark reaches `sequence`. Rejects with `QwpIngressAckTimeoutError` on timeout (15 seconds by default), without closing the sender, or with the server's rejection. It only reads the watermark, so another task can wait while the sender keeps producing. |
| `acknowledgedSequence` | The highest acknowledged sequence, or `-1n`. It never passes a batch that QuestDB rejected. |
| `flushAndGetSequence()` | Publishes staged rows and resolves with the highest sequence (`bigint`) this call published, or `-1n` when there was nothing to publish. Rows an earlier auto-flush published are not covered. |

:::caution Do not wait on the result of `flushAndGetSequence()`

An auto-flush inside `at()` publishes the staged rows on its own: on the row
that reaches `auto_flush_rows`, or on the first row after the sender was idle
for `auto_flush_interval` (100 ms by default). `flushAndGetSequence()` then
has nothing left to publish and returns `-1n`, and `waitForAcknowledged(-1n)`
resolves at once, before QuestDB has acknowledged or rejected the rows. To
wait for every row written so far, call `flush()` and wait for
`publishedSequence`, as in the example above.

:::

To make every `flush()` wait for its acknowledgement, set `awaitServerAck`:
`connectQwpNodeClient(conf, { sender: { awaitServerAck: true } })`, or
`{ qwp: { sender: { awaitServerAck: true } } }` for a standalone `Sender`. A
server rejection then rejects the waiting `flush()` itself. See
[Ingestion errors](/docs/connect/clients/nodejs-operations/#ingestion-errors) for the error classes before and after
a terminal failure.

Acknowledgement is not required for delivery: unacknowledged batches are
replayed after a reconnect, and a standalone sender waits for them on
`close()`. Wait for acknowledgements when your application must know that
QuestDB accepted the rows, for example before committing a source offset. If
the process exits before the acknowledgement, rows still in memory may be
lost; use [store-and-forward](#store-and-forward) to keep them across
restarts.

#### Committing source offsets

To commit offsets in a source such as Kafka only after QuestDB has accepted
the rows, record the sequence of each flushed batch together with the batch's
last source offset. After each flush, commit the newest offset whose sequence
is at or below `acknowledgedSequence`. The watermark is cumulative and never
passes a rejected batch, so a rejection stops further commits, and the next
`flush()` or auto-flushing `at()` reports it. The produce loop never waits for
an individual batch:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// Stand-ins for a source such as a Kafka consumer.
async function* readSource() {
  for (let offset = 0n; offset < 2_500n; offset++) {
    yield { offset, price: 2615.54, amount: 0.01, timestampMs: Date.now() };
  }
}
async function commitOffset(offset: bigint) {
  console.log(`committed through offset ${offset}`);
}

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  // Flushed batches whose last offset waits for QuestDB's acknowledgement.
  const pending: { sequence: bigint; offset: bigint }[] = [];
  const commitAcknowledged = async () => {
    let offset: bigint | undefined;
    const acknowledged = sender.acknowledgedSequence;
    while (pending.length > 0 && pending[0].sequence <= acknowledged) {
      offset = pending.shift()!.offset;
    }
    if (offset !== undefined) await commitOffset(offset);
  };
  try {
    let staged = 0;
    let lastOffset = -1n;
    const checkpoint = async () => {
      await sender.flush();
      pending.push({ sequence: sender.publishedSequence, offset: lastOffset });
      staged = 0;
      await commitAcknowledged();
    };
    for await (const event of readSource()) {
      await sender
        .table("trades")
        .symbol("symbol", "ETH-USD")
        .symbol("side", "buy")
        .doubleColumn("price", event.price)
        .doubleColumn("amount", event.amount)
        .at(event.timestampMs, "ms");
      lastOffset = event.offset;
      if (++staged === 1_000) await checkpoint();
    }
    if (staged > 0) await checkpoint();
    // Before shutting down, wait for the rest and commit it.
    await sender.waitForAcknowledged(sender.publishedSequence, 30_000);
    await commitAcknowledged();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

To commit as acknowledgements arrive instead of after each flush, register
`ingressSession.onProgress`. It receives `QwpIngressProgressEvent` objects whose
`kind` is `published`, `acknowledged`, or `durable-acknowledged`, with the
`sequence` they cover. Read the watermark from the event, not from the
sender: events can arrive after a borrowed sender was returned to the pool,
and a returned sender throws `QwpClientClosedError` on every access.

### Transactions

By default QuestDB commits each batch on its own. With transactions on,
auto-flushed batches stay in an open server-side transaction until you commit:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig(
  "ws::addr=localhost:9000;transaction=on;auto_flush_rows=10000;",
);
try {
  await sender.connect();
  for (let i = 0; i < 50_000; i++) {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USD")
      .symbol("side", i % 2 === 0 ? "buy" : "sell")
      .floatColumn("price", 2615.54)
      .floatColumn("amount", 0.01)
      .at(Date.now(), "ms");
  }
  // Ends the transaction: QuestDB commits the auto-flushed batches and the
  // staged rows together when it processes this final batch.
  await sender.flush();
} finally {
  await sender.close();
}
```

- The transaction is atomic per table. A flush that spans several tables
  commits each table separately.
- A transaction is atomic only up to a size limit. QuestDB commits a table
  early once its open transaction holds
  [`qwp.max.uncommitted.rows`](/docs/configuration/qwp/#qwpmaxuncommittedrows)
  rows (1,000,000 by default), and closing without `flush()` cannot roll back
  what it committed. The open transaction's batches also stay in the replay
  queue until the commit, so they must fit in `sf_max_total_bytes` (128 MiB
  without `sf_dir`). Beyond that, publishing waits `sf_append_deadline_millis`
  (30 seconds) and then rejects with `QwpMemoryReplayAppendTimeoutError`, or
  `QwpReplayStoreAppendTimeoutError` with `sf_dir`. Split large loads into
  several transactions.
- `flush()` ends the transaction: it publishes the final batch, and QuestDB
  commits the transaction when it processes that batch. Pooled senders also
  have `commit()`, an alias of `flush()`. The typed option is
  `transactional: true`.
- Closing a standalone sender without calling `flush()` rolls the open
  transaction back, with a warning. Tables and columns that the rolled-back
  batches created remain.
- Returning a borrowed sender with `close()` commits instead, because `close()`
  flushes before returning the sender to the pool. `reset()` does not prevent
  this: it drops only rows staged since the last flush, not the batches already
  sent in the transaction. Use a standalone sender when you may need to abandon
  a transaction.
- QuestDB does not acknowledge the deferred batches until the commit, so
  `waitForAcknowledged()` for a sequence inside an open transaction waits for
  the commit.

### Store-and-forward

In the default memory mode, unacknowledged rows may be lost if the process
exits. Setting `sf_dir` turns on a disk journal instead: every batch is
appended to the journal before it is sent, a background drainer sends it in
order, and acknowledged segments are deleted.

A frame appended to the journal but not acknowledged before a crash is sent
again, so delivery is at least once:

<SfDedupWarning />

If the table does not exist when the first batch arrives, QWP creates it
without deduplication, and replayed batches can then insert duplicate rows.
Create the table as part of a deployment or schema migration, before any
sender writes to it. A sender that starts while QuestDB is down, as in the
example below, delivers its journal as soon as QuestDB is reachable, which can
be before your own startup code gets to run DDL. If the table may already
exist without deduplication, enable it with
`ALTER TABLE ... DEDUP ENABLE UPSERT KEYS(...)`, which is safe to run again.

Use both the event timestamp and a stable, source-assigned trade ID as upsert
keys: distinct trades can share a millisecond timestamp, symbol, and side.
Store the trade ID as VARCHAR, not SYMBOL: every trade has its own ID, and
SYMBOL is for [bounded sets of values](#column-methods).

```questdb-sql
CREATE TABLE IF NOT EXISTS trades_sf (
  timestamp TIMESTAMP,
  trade_id VARCHAR,
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, trade_id);
```

Pass the same source ID and timestamp again if the application retries an
event. The following values represent one source event; do not regenerate them
when retrying it:

```typescript
import {
  connectQwpNodeClient,
  QwpPoolResourceError,
  QwpReplayStoreLockedError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;" +
    "sf_dir=/var/lib/my-service/qdb-sf;sender_id=ingest-a;" +
    // Offline batches must fit the default server limit (about 2 MiB).
    "sf_durability=append;sf_max_segment_bytes=1m;lazy_connect=on;",
).catch((error: unknown) => {
  // Another process holds the journal, or a crash left a stale lock.
  if (
    error instanceof QwpPoolResourceError &&
    error.cause instanceof QwpReplayStoreLockedError
  ) {
    console.error("the journal is locked; see Lock recovery");
  }
  throw error;
});
const event = { tradeId: "trade-12345", timestampMs: 1723000000000 };
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades_sf")
      .stringColumn("trade_id", event.tradeId)
      .symbol("symbol", "ETH-USD")
      .symbol("side", "buy")
      .doubleColumn("price", 2615.54)
      .doubleColumn("amount", 0.5)
      .at(event.timestampMs, "ms");
    // Resolves once the rows are in the journal, even if QuestDB is down.
    await sender.flush();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

With a journal, the sender keeps accepting rows while QuestDB is unreachable,
subject to [journal capacity](#sf-capacity). With `lazy_connect=on` as above,
it retries from startup; without background startup, the first connection
must succeed, then later disconnects are retried indefinitely. A new sender
opened on the same directory replays what the previous process left behind,
once it can take over the directory's lock (see [Lock recovery](#sf-lock-recovery)).

- **Layout.** A standalone `Sender` journals into `<sf_dir>/<sender_id>`. A
  pooled client uses one directory per pooled sender:
  `<sf_dir>/<sender_id>-0`, `<sf_dir>/<sender_id>-1`, and so on. `sender_id`
  defaults to `default` and may contain letters, digits, `_`, and `-`. Give
  every process its own `sender_id`; a second live process on the same
  directory fails with `QwpReplayStoreLockedError`. A pooled client also
  drains any of its own `<sender_id>-<n>` journals that no pooled sender
  holds, such as those left by a larger pool before a restart, without
  `drain_orphans`.
- **Durability.** `sf_durability` sets how the journal reaches the disk. Its
  `memory` value is unrelated to the memory ingestion modes. `memory` (the
  connect-string default) relies on the operating system to write the
  journal, which survives a process crash but not a power loss. `periodic`
  checkpoints in the background every `sf_sync_interval_millis` (5 seconds).
  `append` makes every append durable before `flush()` resolves, which adds a
  disk sync to every flush: on a producer that flushes often, prefer `periodic`
  or larger batches.
- **Startup.** To start the pooled client while QuestDB is down, see
  [Starting while QuestDB is down](/docs/connect/clients/nodejs-operations/#starting-while-questdb-is-down). A
  standalone `Sender` needs only `initial_connect_retry=async` or
  `lazy_connect=on`. With the default `initial_connect_retry=off`, the first
  connection must succeed.
- **Rejected batches.** A batch that QuestDB rejects terminally stays at the
  head of the journal and stops ingestion through the client, for every table,
  until you act; see
  [Recovering from a terminal rejection](/docs/connect/clients/nodejs-operations/#recovering-from-a-terminal-rejection).
- **Orphans.** With `drain_orphans=on`, a sender also adopts and drains
  journals with other `sender_id` values left under the same `sf_dir` by
  processes that crashed, up to `max_background_drainers` (4) at a time.
- **Other clients.** Don't let a client in another language, such as Java, use
  an `sf_dir` while a Node.js client runs on it. Those clients lock journals
  with operating-system file locks, and neither kind of client sees the
  other's locks, so either could open or drain a journal that the other is
  writing and corrupt it. The journal format is shared: once every Node.js
  client on the directory has stopped, another client can open the journals
  they left behind.

Deduplication recognizes a replayed row only when it carries the same
designated timestamp and trade ID, so reuse event values on application retries
instead of calling `atNow()` or generating a new ID. See
[Deduplication](/docs/concepts/deduplication/) for choosing keys.

#### Journal capacity {#sf-capacity}

With `sf_dir`, `sf_max_total_bytes` (10 GiB by default) is a journal size
target, not a hard disk limit. Transaction-closing batches can reserve extra
segments so a full journal does not block the commit needed to release space.
Segment reservations can reach roughly twice the target, depending on segment
rounding; retained symbol dictionaries and other metadata take additional
space. Provision headroom for every sender and monitor actual disk usage.
Without `sf_dir`, the key caps the in-memory replay queue instead.

When an append cannot fit within these allowances, publishing waits up to
`sf_append_deadline_millis` (30 seconds) for acknowledgements to free space,
then rejects with `QwpReplayStoreAppendTimeoutError`; see
[Backpressure](#backpressure) for what to do next.
`sender.metrics.ingress.pendingReplayBytes` reports how much of the journal
QuestDB has not acknowledged yet.

#### Lock recovery {#sf-lock-recovery}

The Node.js client locks a journal directory with a `.lock.owner` directory
inside it, which records the owner's host name and process ID, instead of an
operating-system file lock. After a crash, a new sender takes over
automatically only when the owner ran on the same host and its process ID is
no longer in use. Otherwise opening the journal fails with
`QwpReplayStoreLockedError`:

- The pooled client opens its senders' journals when it starts, so
  `connectQwpNodeClient()` rejects with `QwpPoolResourceError` whose `cause` is
  `QwpReplayStoreLockedError`, even with `lazy_connect=on`, and the whole
  client fails to start, queries included. With `sender_pool_min=0`, the first
  `borrowSender()` rejects instead.
- A standalone `Sender` rejects on `connect()`.

This is common in containers: the application usually runs as process ID 1,
which is in use again after a restart, and a replacement container usually has
a different host name. Once you have verified that the previous owner has
exited and no process is using the slot, remove its stale
`<sf_dir>/<slot>/.lock.owner` directory and start the client again. `<slot>` is
`<sender_id>`, or `<sender_id>-<n>` for a pooled sender. If startup still
fails, a guard under `<sf_dir>/.slot-locks` may have survived the crash too;
[Node.js lock recovery](/docs/high-availability/store-and-forward/operating-and-tuning/#nodejs-lock-recovery)
covers it, and when this cleanup can be automated.

For all tuning options, see
[Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
and the [store-and-forward keys](/docs/connect/clients/connect-string/#sf-keys).

### Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication
configured.

:::

By default QuestDB acknowledges a batch when it is committed to the primary's
write-ahead log. With `request_durable_ack=on`, the acknowledgement watermark
advances only after the batch is uploaded to the replication object store, so
`waitForAcknowledged()` confirms durable upload. To make every `flush()` wait
for durability, also set the typed option `awaitDurableAck`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");
const db = await connectQwpNodeClient(
  `wss::addr=db.example.com:9000;token=${token};request_durable_ack=on;`,
  // Every flush() waits until its batch is in the object store.
  { sender: { awaitDurableAck: true } },
);
try {
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
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

If the server does not support durable acknowledgement, a sender that connects
in the foreground before its first successful connection fails with
`QwpDurableAckUnavailableError`, which the pooled client reports as the
`cause` of a `QwpPoolResourceError`. A background-started sender
(`initial_connect_retry=async` or `lazy_connect=on`) instead retries from
startup and emits `durable-ack-unavailable`
[connection events](/docs/connect/clients/nodejs-operations/#connection-events), **even with `sf_dir`**. With `sf_dir`
and a foreground start, the first connection fails, but a sender that has
connected successfully before keeps retrying after a later mismatch. Monitor
these events and buffer usage: successful background startup does not confirm
that the server supports durable acknowledgement.

### Fire-and-forget UDP

The Node.js `Sender` can send rows as UDP datagrams, for metrics where
occasional loss is acceptable:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig(
  "udp::addr=localhost:9007;max_datagram_size=1400;",
);
try {
  await sender.connect();
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.5)
    .at(Date.now(), "ms");
  await sender.flush();
} finally {
  await sender.close();
}
```

UDP has no authentication, TLS, acknowledgements, transactions, reconnect, or
store-and-forward. The server's UDP receiver is disabled by default; enable it
with [`qwp.udp.enabled`](/docs/configuration/qwp/#udp-receiver). The default
port is `9007`. `max_datagram_size` (1400 bytes by default) must fit your
network path. A row that cannot fit in a datagram fails the flush with
`QwpUdpDatagramTooLargeError`. As with an
[oversized WebSocket batch](#flushing), the staged rows are kept, so later
flushes and `close()` fail too: call `reset()` to drop them.
`multicast_ttl` sets the multicast time-to-live.

## Querying

Queries run on a lease borrowed from the pooled client. One lease runs one
query at a time, so borrow one lease per concurrent query.

### Running a SELECT

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol, price, amount FROM trades " +
        "WHERE symbol = $1 AND price > $2 LIMIT 100",
      {
        binds: (binds) => binds.setVarchar(0, "ETH-USD").setDouble(1, 2000),
        timeoutMs: 30_000,
      },
    );
    for await (const batch of query) {
      for (const [timestamp, symbol, price, amount] of batch.rows()) {
        console.log(timestamp, symbol, price, amount);
      }
    }
    const completion = await query.completion;
    if (completion.kind === "result-end") {
      console.log("rows:", completion.totalRows);
    }
  } catch (error) {
    if (!(error instanceof QwpEgressQueryError)) throw error;
    console.error(`query failed: status=${error.status} ${error.message}`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`lease.query(sql, options?)` sends the query and resolves with a
`QwpEgressQuery` handle. The options are a `QwpEgressQueryOptions` object:

| Query option | Default | Purpose |
|---|---|---|
| `binds` | none | Callback that sets the `$1`, `$2`, ... parameters. See [Bind parameters](#bind-parameters). |
| `timeoutMs` | session `queryTimeoutMs` (none) | Deadline that cancels the query. It covers the whole query, including a re-execution after failover. `0` disables it. |
| `initialCredit` | session value (`0`, unbounded) | Flow-control window in bytes. Without one, the client holds whatever the server sends ahead of your loop in memory, so set it for large results. See [Flow control](#flow-control). |
| `autoCredit` | `true` | Replenish the credit window as batches are consumed. |
| `resetDictionary` | `false` | Ask the server to reset its symbol dictionary for this connection first. |

There is no per-query failover setting; see [Query failover](/docs/connect/clients/nodejs-operations/#query-failover).
The `QwpEgressQuery` handle has these members:

| Member | Purpose |
|---|---|
| `for await (const batch of query)` | Yields `QwpResultBatch` objects in order. |
| `completion` | `Promise<QwpQueryCompletion>` that settles when the query ends. |
| `cancel()` | Asks QuestDB to stop the query; see [Cancellation and timeouts](#cancellation-and-timeouts). |
| `awaitCompletion(timeoutMs)` | Resolves `false` if the query is still running after `timeoutMs`. |
| `isDone()` | Whether the query has ended. |
| `grantCredit(bytes)` | Adds flow-control credit when `autoCredit` is `false`. |
| `requestId` | The `bigint` that numbers queries on this connection. |

Iteration and `completion` reject with the same error when the query fails.
Consume the result through `for await`, or `await query.completion` directly
for statements that return no rows.

A `QwpResultBatch` has:

- `rowCount` and `columns`: an array of `{ name, type, values, scale?, precisionBits? }`,
  where `values` holds one entry per row and `type` is the numeric QWP type
  code. Compare it with the exported `QWP_COLUMN_TYPE` constants: `BOOLEAN`,
  `BYTE`, `SHORT`, `CHAR`, `INT`, `LONG`, `FLOAT`, `DOUBLE`, `SYMBOL`,
  `VARCHAR`, `TIMESTAMP`, `TIMESTAMP_NANOS`, `DATE`, `UUID`, `LONG256`,
  `GEOHASH`, `IPV4`, `BINARY`, `DOUBLE_ARRAY`, `LONG_ARRAY`, `DECIMAL64`,
  `DECIMAL128`, and `DECIMAL256`.
- `rows()`: a generator that yields one array of values per row.
- `get(rowIndex, columnIndex)`: one value.
- `batchSequence`: the batch's position in the result, starting at `0n`.

Batch objects stay valid after iteration moves on, so you can keep them.

With the default `failover=on`, a lost connection can make the client run the
query again from its first batch. If your loop accumulates rows, reset them
when `batch.batchSequence === 0n`. A replay that returns **no batches** has no
sequence to detect, so also clear accumulated state on `onReplayReset` (on a
client with only one active query), or use `failover=off` and retry the whole
query. See [Query failover](/docs/connect/clients/nodejs-operations/#query-failover).

### Reading result values

Values arrive as these JavaScript types:

| QuestDB type | JavaScript value |
|---|---|
| BOOLEAN | `boolean` |
| BYTE, SHORT, INT | `number` |
| FLOAT, DOUBLE | `number` |
| LONG | `bigint` |
| TIMESTAMP | `bigint` microseconds since the Unix epoch |
| TIMESTAMP_NS | `bigint` nanoseconds since the Unix epoch |
| DATE | `bigint` milliseconds since the Unix epoch |
| CHAR | one-character `string` |
| VARCHAR, STRING, SYMBOL | `string` |
| BINARY | `Uint8Array` |
| IPv4 | `number`, as a signed 32-bit integer: `192.168.0.1` arrives as `-1062731775`. Use `value >>> 0` for the unsigned address |
| UUID | `{ low: bigint, high: bigint }`, the unsigned low and high 64-bit halves |
| LONG256 | `{ words: [bigint, bigint, bigint, bigint] }`, least significant word first. Each word is a signed 64-bit value: `BigInt.asUintN(64, word)` gives its unsigned value |
| GEOHASH | `{ bits: bigint, precisionBits: number }` |
| DECIMAL with a precision of 10 or more | `{ unscaled: bigint, scale: number }`: the value is `unscaled / 10^scale` |
| DOUBLE[], DOUBLE[][], ... | `{ dimensions: number[], values: number[] }` with values in row-major order |
| NULL in nullable types other than CHAR | `null` |

BOOLEAN, BYTE, and SHORT are non-nullable, so omitted values read back as
`false`, `0`, and `0`. A CHAR NULL marker can currently read back as the
one-character string `"\u0000"`, not JavaScript `null`. See
[Null values](#null-values).

Some column types cannot be returned over QWP. The server rejects such a query
with status `0x06` and a message such as `unsupported column type INTERVAL`.
Convert the column in SQL instead:

- INTERVAL: select the bounds with `interval_start()` and `interval_end()`,
  which return timestamps, or cast the interval with `::varchar`.
- DECIMAL with a precision of 9 or less, which QuestDB stores as DECIMAL8,
  DECIMAL16, or DECIMAL32: cast it to a wider precision, for example
  `price::DECIMAL(18, 2)`.
- An untyped `NULL` literal, as in `SELECT NULL`: give it a type, for example
  `NULL::double`.

`JSON.stringify()` throws on `bigint`, which LONG, TIMESTAMP, DATE, UUID,
LONG256, and DECIMAL values contain, so convert rows before serializing them,
as `toJson()` does below. Converting common types:

```typescript
// TIMESTAMP (bigint microseconds) to Date. Drops sub-millisecond precision.
const toDate = (micros: bigint) => new Date(Number(micros / 1000n));

// UUID to its canonical string form
function uuidToString({ low, high }: { low: bigint; high: bigint }): string {
  const hex =
    high.toString(16).padStart(16, "0") + low.toString(16).padStart(16, "0");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// IPv4 (signed number) to dotted quad
const ipv4ToString = (value: number) =>
  [24, 16, 8, 0].map((shift) => ((value >>> 0) >>> shift) & 0xff).join(".");

// Any row or value to JSON, with bigint values as decimal strings
const toJson = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );

console.log(toDate(1723000000000000n).toISOString());
console.log(
  uuidToString({ low: 13485158461794337056n, high: 11465204444048149893n }),
);
console.log(ipv4ToString(-1062731775));
console.log(toJson([1723000000000000n, "ETH-USD", 2615.54]));
```

### Bind parameters

Bind values are set by a callback on a `QwpBindValues` object. Indexes are
zero-based (index `0` is `$1`), and setters must be called in ascending index
order without gaps. Every setter returns the object, so calls chain:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol, price FROM trades " +
        "WHERE symbol = $1 AND side = $2 AND timestamp >= $3 LIMIT $4",
      {
        binds: (binds) =>
          binds
            .setVarchar(0, "ETH-USD")
            .setVarchar(1, "buy")
            .setTimestampMicros(2, BigInt(Date.now() - 3_600_000) * 1000n)
            .setLong(3, 1000),
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

| Setter | Bind type |
|---|---|
| `setBoolean(index, value)` | BOOLEAN |
| `setByte(index, value)` | BYTE |
| `setShort(index, value)` | SHORT |
| `setChar(index, value)` | CHAR (one-character `string`) |
| `setInt(index, value)` | INT |
| `setLong(index, value)` | LONG (`number` or `bigint`) |
| `setFloat(index, value)` | FLOAT |
| `setDouble(index, value)` | DOUBLE |
| `setDate(index, millis)` | DATE (`number` or `bigint`) |
| `setTimestampMicros(index, micros)` | TIMESTAMP (`number` or `bigint`) |
| `setTimestampNanos(index, nanos)` | TIMESTAMP_NS (`number` or `bigint`) |
| `setVarchar(index, value)` | VARCHAR, STRING, and SYMBOL comparisons. `null` binds NULL |
| `setUuid(index, value)` or `setUuid(index, low, high)` | UUID, as a canonical string or two 64-bit halves. `null` binds NULL |
| `setLong256(index, w0, w1, w2, w3)` | LONG256, least significant word first. Each word is a `number` or `bigint` |
| `setGeohash(index, precisionBits, value)` | GEOHASH. `value` is a `number` or `bigint` |
| `setDecimal64(index, scale, unscaled)` | DECIMAL64. `unscaled` is a `number` or `bigint` |
| `setDecimal128(index, scale, low, high)` | DECIMAL128. Each half is a `number` or `bigint` |
| `setDecimal256(index, scale, w0, w1, w2, w3)` | DECIMAL256. Each word is a `number` or `bigint` |
| `setNull(index, type)` | A typed NULL. `type` is a `QWP_COLUMN_TYPE` constant for a scalar type, for example `setNull(1, QWP_COLUMN_TYPE.DOUBLE)`. The TIMESTAMP_NS constant is `TIMESTAMP_NANOS`. BINARY, IPv4, arrays, and SYMBOL are excluded (bind text as VARCHAR). |
| `setNullDecimal64/128/256(index, scale)`, `setNullGeohash(index, precisionBits)` | NULL decimals and geohashes, which carry a scale or precision |

There is no setter for BINARY, IPv4, or arrays. Bind IPv4 as a string and cast
it in SQL (`WHERE ip = $1::ipv4` with `setVarchar`), and pass array values as
SQL literals.

Decimal and geohash setters take the scale or precision before the value, the
reverse of the matching column methods: `setDecimal64(index, scale, unscaled)`
but `decimal64Column(name, unscaled, scale)`, and
`setGeohash(index, precisionBits, value)` but
`geohashColumn(name, bits, precisionBits)`.

### DDL and DML statements

`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, and `UPDATE` go through the
same `query()` call. They produce no batches, and `completion` resolves with
`kind: "exec-done"` instead of `kind: "result-end"`.

:::warning DDL and DML can run twice with query failover

With the default `failover=on`, a connection loss replays any in-flight SQL,
including DDL and DML. QuestDB may have applied an `INSERT` before its
`exec-done` response was lost, so replay can insert it again. A transport
error does not prove the statement failed. Use a separate client with
`failover=off` for non-idempotent statements, as below, and verify an
uncertain outcome before retrying manually. Alternatively, make the statement
idempotent so that a second run changes nothing, for example
`CREATE TABLE IF NOT EXISTS`, or an `INSERT` of rows with stable key values
into a table with [deduplication](/docs/concepts/deduplication/).

:::

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
try {
  const lease = await db.borrowQuery();
  try {
    const statements = [
      "CREATE TABLE IF NOT EXISTS fills (" +
        "timestamp TIMESTAMP, symbol SYMBOL, side SYMBOL, " +
        "price DOUBLE, amount DOUBLE" +
        ") TIMESTAMP(timestamp) PARTITION BY DAY",
      "INSERT INTO fills VALUES (now(), 'ETH-USD', 'buy', 2615.54, 0.5)",
      "UPDATE fills SET amount = 0.6 WHERE symbol = 'ETH-USD'",
    ];
    for (const sql of statements) {
      const statement = await lease.query(sql);
      const completion = await statement.completion;
      // rowsAffected counts rows only for INSERT; see the table below.
      if (completion.kind === "exec-done" && sql.startsWith("INSERT")) {
        console.log(`inserted ${completion.rowsAffected} rows`);
      }
    }
  } catch (error) {
    if (!(error instanceof QwpEgressQueryError)) throw error;
    console.error(`statement failed: status=${error.status} ${error.message}`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

| `completion.kind` | Returned for | Fields |
|---|---|---|
| `"result-end"` | Queries that return rows | `totalRows` (`bigint`) |
| `"exec-done"` | DDL and DML | `rowsAffected` (`bigint`, rows written by an `INSERT`), `operationType` (QuestDB's numeric statement type) |

Only `INSERT` reliably reports a row count in `rowsAffected`. For an `UPDATE`
on a WAL table, the default, it currently holds a transaction number rather
than the number of rows changed, so do not use it to check whether an `UPDATE`
matched any rows. On a non-WAL table, `UPDATE` reports the rows changed. DDL
reports `0`, except `TRUNCATE`, which currently reports
`18446744073709551615n`.

Statements run in order on one lease, because each is awaited before the next
starts, so a `CREATE TABLE` is complete before the `INSERT` that follows it.

### Read-after-write

When `flush()` resolves, the client has published the rows, but QuestDB may not
have received them yet. QuestDB acknowledges a batch once it has committed it
to its write-ahead log, and applies committed rows to the table
asynchronously. A query that runs right after ingestion can therefore fail
with `table does not exist` on a first run, or succeed and return no rows.

When your code must read its own writes, create the table first, write an event
with a unique ID, and poll for **that ID**. Pre-creating the table avoids
mistaking an unrelated SQL error for the first-write table-creation delay. Give
each query the time remaining until the deadline so a stalled query cannot
leave the poll running indefinitely:

```typescript
import { randomUUID } from "node:crypto";
import { connectQwpNodeClient } from "@questdb/nodejs-client";

let visible = false;
const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;query_pool_max=1;",
  // There is only one active query. Clear its state even if replay returns no rows.
  {
    egressSession: {
      onReplayReset: () => {
        visible = false;
      },
    },
  },
);
try {
  const lease = await db.borrowQuery();
  try {
    const ddl = await lease.query(
      "CREATE TABLE IF NOT EXISTS trades_readback (" +
        "timestamp TIMESTAMP, trade_id VARCHAR, symbol SYMBOL" +
        ") TIMESTAMP(timestamp) PARTITION BY DAY",
    );
    await ddl.completion;

    const tradeId = randomUUID();
    const sender = await db.borrowSender();
    try {
      await sender
        .table("trades_readback")
        .stringColumn("trade_id", tradeId)
        .symbol("symbol", "ETH-USD")
        .at(Date.now(), "ms");
      await sender.flush();
      await sender.waitForAcknowledged(sender.publishedSequence);
    } finally {
      await sender.close();
    }

    const deadline = Date.now() + 10_000;
    while (!visible) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new Error("trade not visible in time");
      const query = await lease.query(
        "SELECT trade_id FROM trades_readback WHERE trade_id = $1 LIMIT 1",
        {
          binds: (binds) => binds.setVarchar(0, tradeId),
          timeoutMs: remainingMs,
        },
      );
      for await (const batch of query) visible ||= batch.rowCount > 0;
      await query.completion;
      if (!visible) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(100, Math.max(0, deadline - Date.now())),
          ),
        );
      }
    }
    console.log(`visible trade: ${tradeId}`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

Because the table already exists, an SQL error fails the loop at once instead
of being retried; the loop retries only while the row is not yet visible. The
single-query pool lets `onReplayReset` reset `visible` even when a replay
returns no batches. For concurrent queries, use separate clients for this
pattern, or set `failover=off` and retry the entire poll after a connection
error. Do not replace the poll with a fixed sleep: apply latency varies with
load.

### Cancellation and timeouts

A query ends early in four ways:

- **Deadline.** Set a default with `egressSession: { queryTimeoutMs }`, or per
  query with `timeoutMs`. On expiry, iteration and `completion` reject with
  `QwpEgressQueryTimeoutError`, and the client cancels the query in the
  background.
- **Leaving the loop.** `break`, `return`, or an exception inside `for await`
  cancels the query in the background, and `completion` rejects with
  `QwpEgressQueryAbandonedError`. Use it to stop reading a result at once.
- **Cancel.** `await query.cancel()` asks QuestDB to stop and returns without
  waiting for it. Keep consuming the result afterwards: QuestDB acts on the
  cancel only while the result is moving, and iteration and `completion` then
  reject with `QwpEgressQueryError` whose `status` is `0x0a`
  (`QWP_STATUS.CANCELLED`). If you stop consuming and only await `completion`,
  it rejects with `QwpEgressQueryCancelTimeoutError` after
  `query_close_timeout_ms` (5 seconds), and the client closes the connection.
  A query that finishes before QuestDB processes the cancel, or a DDL or DML
  statement, completes normally instead.
- **Waiting without cancelling.** `await query.awaitCompletion(timeoutMs)`
  resolves `false` when the wait times out and leaves the query running.
  `query.isDone()` reports whether the query has ended.

QuestDB checks for a cancel between result batches, while it is sending. Set a
[credit window](#flow-control), with `initial_credit` in the connect string or
`initialCredit` per query, so that QuestDB pauses when your loop falls behind
and stops at the next batch after a cancel, a deadline, or an early exit.
Start with 1 MiB; the client replenishes it as your loop consumes batches.
Without a credit window, QuestDB streams as fast as the network allows: it may
send the whole result before it reads a cancel, and the client holds whatever
arrived. A cancelled query can then complete normally, and returning the lease
after an early exit waits while the rest of the result streams. If draining
that backlog takes longer than `query_close_timeout_ms`, the cancel fails with
`QwpEgressQueryCancelTimeoutError` and the connection is closed, even while
your loop keeps consuming. A credit window does not interrupt expensive work
before the next batch is ready.

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryTimeoutError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT symbol, avg(price) FROM trades SAMPLE BY 1m",
      // With credit, QuestDB stops at the next batch after the deadline.
      { timeoutMs: 5_000, initialCredit: 1024 * 1024 },
    );
    for await (const batch of query) {
      console.log(batch.rowCount);
    }
  } catch (error) {
    if (!(error instanceof QwpEgressQueryTimeoutError)) throw error;
    console.warn(
      `query ${error.requestId} timed out after ${error.timeoutMs} ms`,
    );
  } finally {
    // Waits for the cancellation to drain before the lease is reused.
    await lease.close();
  }
} finally {
  await db.close();
}
```

To stop a result after enough rows, call `cancel()` and keep iterating until
the result ends:

```typescript
import {
  connectQwpNodeClient,
  QWP_STATUS,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT * FROM trades", {
      initialCredit: 1024 * 1024,
    });
    let rows = 0;
    let cancelled = false;
    try {
      for await (const batch of query) {
        rows += batch.rowCount;
        if (rows >= 10_000 && !cancelled) {
          cancelled = true;
          // Keep iterating: the result ends a few batches later.
          await query.cancel();
        }
      }
      await query.completion;
    } catch (error) {
      const wasCancelled =
        error instanceof QwpEgressQueryError &&
        error.status === QWP_STATUS.CANCELLED;
      if (!wasCancelled) throw error;
    }
    console.log(`read ${rows} rows`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

After a query ends early, its connection stays busy until QuestDB confirms the
cancellation, and another `query()` on the same lease rejects with
`a QWP query is already active on this connection`. Return the lease with
`close()` and borrow a new one for the next query. `close()` waits up to
`query_close_timeout_ms` (5 seconds) for QuestDB to confirm the cancellation.
If it does not, `close()` discards the connection, which can take as long
again, so returning the lease can take up to twice `query_close_timeout_ms`.

### Flow control

By default QuestDB streams results as fast as the network allows. The client
decodes up to four batches ahead of your loop (`buffer_pool_size`), but it keeps
every frame it receives in memory until your loop consumes it, so a slow loop
over a large result can hold most of that result in memory. To bound how much
the server sends ahead, set a byte-credit window with `initial_credit` in the
connect string or `initialCredit` per query. Start with 1 MiB for large or
unbounded results:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT * FROM trades", {
      initialCredit: 1024 * 1024, // server pauses after about 1 MiB
    });
    for await (const batch of query) {
      // The client replenishes the credit as each batch is consumed.
      console.log(batch.rowCount);
    }
    await query.completion;
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

With `autoCredit: false`, call `query.grantCredit(bytes)` yourself. To cap the
rows in each batch, set `max_batch_rows` (1 to 1,048,576), or the typed option
`egress: { maxBatchRows }`; it applies to every query. A credit window
also lets QuestDB stop at the next batch after a cancel, a deadline, or an
early exit; see [Cancellation and timeouts](#cancellation-and-timeouts) for
what your loop must do after `cancel()`.

### Zero-copy result views

`query()` materializes every value into JavaScript arrays. For hot paths,
`queryViews()` hands a reusable view of each batch to a callback, and reads
values straight from the received bytes. This single-pass sum disables query
failover so a transport error rejects instead of leaving a partial sum:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;failover=off;");
try {
  const lease = await db.borrowQuery();
  try {
    let notional = 0;
    const query = await lease.queryViews(
      "SELECT timestamp, symbol, price, amount FROM trades",
      (batch) => {
        const price = batch.column(2);
        const amount = batch.column(3);
        for (let row = 0; row < batch.rowCount; row++) {
          if (!price.isNull(row) && !amount.isNull(row)) {
            notional += price.getDouble(row) * amount.getDouble(row);
          }
        }
      },
    );
    await query.completion;
    console.log({ notional });
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

For row-major work instead, `batch.forEachRow()` reuses one row object; read
values inside its callback only when they contribute to your result. For an
accumulator that supports automatic query replay, see
[Query failover](/docs/connect/clients/nodejs-operations/#query-failover).

Batches are delivered one at a time: when the callback returns a promise, the
client waits for it before delivering the next batch. With a credit window set
(`initialCredit`), it also grants credit for a batch only after its callback
resolves, so a slow callback throttles the server.

The batch, its column views, and any `Uint8Array` returned from them are valid
only until the callback returns: copy a byte view with `.slice()`, or call
`batch.materialize()`, to keep data. Column views provide typed getters such as
`getBoolean`, `getInt`, `getLong`, `getDouble`, `getString`, `getSymbol`,
`getBinaryView`, and `get` for any type.

### Compression

Ask for zstd-compressed results to save bandwidth on large result sets:

```text
ws::addr=localhost:9000;compression=zstd;compression_level=3;
```

`compression` is `raw` (the default), `zstd`, or `auto`; `zstd` and `auto` both
accept a raw reply. `compression_level` ranges from 1 to 22, and the server may
clamp it. `lease.negotiatedCompression` reports what the server chose, for
example `{ codec: "zstd", level: 3 }`. Compression applies to query results
only.

### Server information

`lease.serverInfo` describes the server the lease is connected to: `role` (a
`QWP_SERVER_ROLE` value: standalone, primary, replica, or primary catching up),
`zoneId`, `clusterId`, `nodeId`, and `capabilities`. It refreshes after a
failover.

<span id="configuration-options"></span>

For typed options and the key table, see the
[Node.js configuration reference](/docs/connect/clients/nodejs-operations/#configuration-reference).

## Next steps

- [Node.js operations and reference](/docs/connect/clients/nodejs-operations/)
  for pool sizing, failover, error handling, configuration, migration, and a
  complete ingestion and querying example.

- [Connect string reference](/docs/connect/clients/connect-string/) for every
  configuration key.
- [Delivery semantics](/docs/concepts/delivery-semantics/) for at-least-once
  delivery and deduplication.
- [Client failover](/docs/high-availability/client-failover/concepts/) and
  [store-and-forward](/docs/high-availability/store-and-forward/concepts/)
  concepts.
- [Query & SQL overview](/docs/query/overview/) for QuestDB SQL.
- The client's
  [GitHub repository](https://github.com/questdb/nodejs-questdb-client) and the
  [Community Forum](https://community.questdb.com/) for questions and issues.
