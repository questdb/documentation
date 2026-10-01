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
- **[One pooled client](#the-connection-pool)**: `connectQwpNodeClient()`
  configures ingestion and queries from one `ws::` connect string, then hands
  out pooled senders (`db.borrowSender()`) and query leases
  (`db.borrowQuery()`).
- **[Failover](#failover-and-high-availability)**: multi-host endpoint lists,
  automatic reconnect, and replay of unacknowledged rows. Replay is at least
  once: pair it with table [deduplication](/docs/concepts/deduplication/) for
  exactly-once ingestion.
- **[Store-and-forward](#store-and-forward)**: a disk journal that keeps
  accepting rows while QuestDB is unreachable and survives process restarts.
- **[UDP](#fire-and-forget-udp)**: fire-and-forget ingestion for metrics where
  occasional loss is acceptable.
- **[Error handling](#error-handling)**: typed errors, asynchronous rejection
  callbacks, and connection events. The Node.js client differs from the other
  QWP clients in a few places; see
  [Differences from other clients](#differences-from-other-clients).

:::tip Upgrading from 4.x or using ILP

Version 5.0.0 adds QWP and changes how the existing `Sender` handles `null`
and `undefined` values; see [Upgrading from 4.x](#upgrading-from-4x). To move
existing ILP code to QWP, see [From ILP to QWP](#from-ilp-to-qwp). The
`Sender` class still speaks ILP over HTTP and TCP; for those transports, see
[ILP transports (legacy)](#ilp-transports-legacy) near the end of this page.

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
   [Closing the pooled client](#closing-the-pooled-client).

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
| `close()` | `Promise<void>` | Close both pools. Resolves even if rows are not acknowledged; see [Closing the pooled client](#closing-the-pooled-client). Idempotent. |

Share one `QwpClient` across your application and close it at shutdown. See
[The connection pool](#the-connection-pool) for pool sizing and lease rules.

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
pass the setting as a [typed option](#programmatic-options), which takes
precedence without a duplicate-key error.

The Node.js client's parser differs from some other clients in two places:

- `auto_flush_rows` and `auto_flush_interval` take `0`, not `off`, to disable
  a trigger. `auto_flush=off` disables auto-flushing entirely.
- Size values accept the single-letter suffixes `k`, `m`, `g`, and `t`
  (`sf_max_total_bytes=10g`). The two-letter forms `kb`, `mb`, and `gb` are
  rejected.

For every key and its default, see the
[connect string reference](/docs/connect/clients/connect-string/) and the
[configuration reference](#configuration-reference) at the end of this page.

### Programmatic options

Callbacks, custom agents, and other settings a string cannot express go in the
second argument, a `QwpNodeClientConfigOptions` object. When the connect string
and typed options set the same option, the typed value wins. Credentials and
TLS are the exception: a typed `webSocket.authorization` header cannot be
combined with `token`, `username`, or `password` in the string, and a typed
`webSocket.agent` cannot be combined with `tls_verify` or `tls_roots`. Both
combinations are rejected.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  // QwpSenderOptions for every pooled sender
  sender: { awaitServerAck: true },
  // Ingestion callbacks and replay settings
  ingressSession: {
    onSenderError: (error) =>
      console.error("rejected batch", error.category, error.serverMessage),
  },
  // Query session defaults
  egressSession: {
    queryTimeoutMs: 30_000,
    cancelDrainTimeoutMs: 5_000,
    serverInfoTimeoutMs: 10_000,
  },
  // Egress-only routing and compression
  egress: { compression: "zstd" },
  // Pool sizes and timeouts
  pool: { senderPoolMax: 2, queryPoolMax: 8 },
});
await db.close();
```

The typed `egress` section takes `target`, `zone`, `compression`,
`compressionLevel`, and `maxBatchRows`. The other sections are `webSocket`
(connection settings shared by both directions, such as `agent` or
`connectTimeoutMs`) and `storeAndForward`, the journal settings described
under [Store-and-forward](#store-and-forward). Its fields match the connect
string keys:

| Typed field | Connect string key |
|---|---|
| `directory` | `sf_dir` |
| `maxBytes` | `sf_max_total_bytes` |
| `maxSegmentBytes` | `sf_max_segment_bytes` |
| `durability` | `sf_durability` |
| `checkpointIntervalMs` | `sf_sync_interval_millis` |
| `appendDeadlineMs` | `sf_append_deadline_millis` |
| `drainOrphans` | `drain_orphans` |
| `maxBackgroundDrainers` | `max_background_drainers` |

The second argument has no field for `sender_id`; set it in the connect
string.

`Sender.fromConfig()` takes `{ log, agent, qwp }` as its second argument,
where `qwp` has the sections `webSocket`, `session` (the equivalent of
`ingressSession`), `sender`, and `udp`.

The `reconnect` objects in `ingressSession` and `egressSession` replace the
whole reconnect policy parsed from the connect string; see
[Typed reconnect policy](#typed-reconnect-policy) before you set one.

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
see [Connection timeouts](#connection-timeouts).

### Unsupported authentication paths

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or refresh | Not supported. The client does not talk to an identity provider and has no callback to refresh a token. | Obtain an access token from your identity provider, pass it as `token=...`, and create a new client before the token expires. See [OpenID Connect](/docs/security/oidc/). |
| Token rotation mid-session | Not supported. The credential is read once, when the client is created, and reused for every reconnect. QuestDB rejects an expired token when the client next opens a connection: queries and senders in default memory mode then fail, while senders with `sf_dir` or in background memory mode keep retrying and buffering (see [Connection-level errors](#connection-level-errors)). | Close the client and create a new one with the new token before the old one expires. |
| Mutual TLS (client certificates) | Not supported. QuestDB does not negotiate client certificates. | Use token or basic authentication over `wss`. |
| ILP JWK authentication | Not available for QWP. `auth`, `jwk`, `token_x`, and `token_y` are rejected on `ws`/`wss`. | Use token or basic authentication. |

### Production example: TLS, token, and multiple hosts

A typical Enterprise deployment combines `wss`, a token, and several hosts in
one connect string:

```text
wss::addr=db-a.example.com:9000,db-b.example.com:9000;token=YOUR_TOKEN;
```

Add `tls_roots=/path/to/ca.pem;` when the servers use a private CA. See
[Multiple endpoints](#multiple-endpoints) for routing queries to replicas, and
the [full example](#full-example-ingestion-and-querying-with-failover) for a
complete program with this configuration.

## The connection pool

The pooled client keeps two elastic pools: one of senders and one of query
connections. Each pool opens its minimum on `connect()`, grows on demand up to
its maximum, and a housekeeper closes connections that stay idle too long or
exceed their maximum lifetime, never going below the minimum.

### Borrowing a sender

A borrowed sender belongs to the borrower until its `close()` returns it:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    for (const [symbol, price] of [
      ["ETH-USD", 2615.54],
      ["BTC-USD", 39269.98],
    ] as const) {
      await sender
        .table("trades")
        .symbol("symbol", symbol)
        .symbol("side", "buy")
        .doubleColumn("price", price)
        .doubleColumn("amount", 0.1)
        .at(Date.now(), "ms");
    }
    await sender.flush();
    await sender.waitForAcknowledged(sender.publishedSequence);
  } finally {
    // Returns the sender to the pool; any pending rows are flushed.
    await sender.close();
  }
} finally {
  await db.close();
}
```

A long-running producer can keep its borrow for its whole lifetime and call
`flush()` between batches. Size `sender_pool_max` to the number of producers
that hold a sender at the same time.

`close()` on a borrowed sender flushes its completed rows and returns it to
the pool. The example above waits for the acknowledgement *before* returning
the sender: `close()` itself does not wait for acknowledgements, although in
default memory mode its flush waits for the reconnect during an outage. See
[Closing a borrowed sender](#closing-a-borrowed-sender) for how long that can
take, how to wait for acknowledgements, and what happens when a close fails.

After `close()`, every method call or property read on that sender object
throws `QwpClientClosedError`. Don't keep references to a returned sender, for
example in callbacks that can run later.

### Borrowing a query lease

A query lease runs one query at a time. For concurrent queries, borrow one lease
per query, up to `query_pool_max`:

```typescript
import {
  connectQwpNodeClient,
  type QwpQueryLease,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");

async function countBySymbol(lease: QwpQueryLease, symbol: string) {
  const query = await lease.query(
    "SELECT count() FROM trades WHERE symbol = $1",
    { binds: (binds) => binds.setVarchar(0, symbol) },
  );
  let count = 0n;
  for await (const batch of query) count = batch.get(0, 0) as bigint;
  await query.completion;
  return count;
}

try {
  const [a, b] = await Promise.all([db.borrowQuery(), db.borrowQuery()]);
  try {
    // Two leases, two WebSockets: the queries run concurrently.
    const [eth, btc] = await Promise.all([
      countBySymbol(a, "ETH-USD"),
      countBySymbol(b, "BTC-USD"),
    ]);
    console.log({ eth, btc });
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
} finally {
  await db.close();
}
```

Starting a second query on a lease while one is still active rejects with
`a QWP query is already active on this connection`. Always close a lease in
`finally`: an unreturned lease holds its connection until `db.close()`.

### Pool settings

| Key | Default | Purpose |
|---|---|---|
| `sender_pool_min` | `1` | Senders kept open even when idle. `0` lets the pool close them all. |
| `sender_pool_max` | `4` | Maximum senders the pool opens. |
| `query_pool_min` | `1` | Query connections kept open even when idle. |
| `query_pool_max` | `4` | Maximum query connections, which also caps concurrent queries. |
| `acquire_timeout_ms` | `5000` | How long a borrow waits when the pool is at its maximum, before rejecting with `QwpPoolAcquireTimeoutError`. |
| `idle_timeout_ms` | `60000` | Idle time before an excess connection is closed. `0` keeps idle connections. |
| `max_lifetime_ms` | `1800000` | Age at which an idle connection above the pool minimum is closed. Connections kept open by `sender_pool_min` and `query_pool_min` are never recycled, so this does not rotate a pool that is at its minimum. `0` disables it. |
| `housekeeper_interval_ms` | `5000` | How often the housekeeper checks for idle and over-age connections. Minimum `100`. |
| `query_close_timeout_ms` | `5000` | How long returning a lease with an active query waits for the cancellation to drain before discarding the connection. |
| `lazy_connect` | `off` | Start without connecting. See below. |

Pool sizes, acquisition and idle timeouts, lifetime, and housekeeping settings
have typed equivalents in the `pool` section of the second argument
(`senderPoolMin`, `acquireTimeoutMs`, `housekeepingIntervalMs`, and so on).
The other two settings use different locations:

- `query_close_timeout_ms` maps to `egressSession.cancelDrainTimeoutMs`, not
  `pool`.
- Set `lazy_connect=on` in the connect string. When passing a full
  `QwpNodeClientOptions` object instead of a string, use top-level
  `lazyConnect: true`. It is not supported in `pool` or the second argument.

When creating a new pooled connection fails, the borrow rejects with
`QwpPoolResourceError`, whose `cause` holds the connection error.

`borrowSender()` and `borrowQuery()` take no timeout argument. When the pool
is at its maximum, a borrow waits up to `acquire_timeout_ms` for a connection
to be returned. Opening a new connection is bounded by the
[connection timeouts](#connection-timeouts) of each endpoint, and by the
[failover budget](#query-failover) when query retries are on. To enforce a
shorter deadline, such as a request deadline, race the borrow against a timer
and return a lease that arrives late:

```typescript
import { connectQwpNodeClient, type QwpClient } from "@questdb/nodejs-client";

function borrowQueryWithin(db: QwpClient, timeoutMs: number) {
  const borrow = db.borrowQuery();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("borrow timed out")), timeoutMs);
  });
  return Promise.race([borrow, deadline])
    .catch((error: unknown) => {
      // Return a lease that arrives after the deadline.
      borrow.then((lease) => lease.close(), () => undefined);
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await borrowQueryWithin(db, 2_000);
  try {
    const query = await lease.query("SELECT count() FROM trades");
    for await (const batch of query) console.log(batch.get(0, 0));
    await query.completion;
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

### Starting while QuestDB is down

`connectQwpNodeClient()` fails fast when QuestDB is unreachable. Set
`lazy_connect=on` to start regardless: senders connect in the background and
buffer rows in memory until QuestDB is reachable. The query pool stays empty
until the first query.

```typescript
import {
  connectQwpNodeClient,
  QwpIngressAckTimeoutError,
} from "@questdb/nodejs-client";

// Resolves immediately, even if QuestDB is not running yet.
const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;lazy_connect=on;",
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
    const sequence = sender.publishedSequence;
    // Keep the process running until QuestDB comes back and acknowledges it.
    for (;;) {
      try {
        await sender.waitForAcknowledged(sequence, 10_000);
        break;
      } catch (error) {
        if (!(error instanceof QwpIngressAckTimeoutError)) throw error;
        console.info("still waiting for QuestDB; do not restage the row");
      }
    }
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

Rows buffered while QuestDB is down exist only in memory. This example keeps
the client running until the row is acknowledged; if the process exits first,
the unacknowledged row may be lost. See
[Closing the pooled client](#closing-the-pooled-client).
To keep them across a shutdown or restart, add a
[store-and-forward](#store-and-forward) journal with `sf_dir`. Replay from the
journal is at least once, so write to a deduplicated table as described there.

`lazy_connect=on` forces `query_pool_min=0` and `initial_connect_retry=async`,
and rejects an explicit conflicting value. Setting `initial_connect_retry=async`
without `lazy_connect` is not enough: the query pool still connects at startup,
so `connectQwpNodeClient()` rejects with `QwpPoolResourceError`. A query
borrowed while QuestDB is still down rejects with `QwpPoolResourceError` too.

A lazy start does not cover two cases. A locked store-and-forward journal
still fails startup; see [Lock recovery](#sf-lock-recovery). And until a
sender has connected once, it cannot check batches against the server's size
limit; see [Batch size limits](#batch-size-limits).

### Closing the pooled client

`db.close()` rejects new borrows, then:

- Cancels active queries and closes every query connection, including leased
  ones.
- Closes idle senders. Each publishes its remaining rows and waits up to
  `close_flush_timeout_millis` (5 seconds) for QuestDB to acknowledge them.
- Waits for borrowed senders to be returned, until 5 seconds after
  `db.close()` was called, or `acquire_timeout_ms` if that is lower. Closing
  the idle senders counts toward the same deadline. A sender still borrowed
  after that stays open: its owner must `close()` it, and the process stays
  alive until then.

`db.close()` resolves even when an acknowledgement does not arrive in time.
Without `sf_dir`, the unacknowledged rows are then lost. With `sf_dir`, they
stay in the journal, and the next sender on the same directory replays them.
The client usually reports the timeout to `ingressSession.onError` as a
non-terminal `QwpIngressAckTimeoutError`, logged as a warning by default, but
the report is best-effort: do not rely on it to detect unacknowledged rows. To
know that QuestDB accepted every row before shutting down, wait for the
acknowledgement before returning each sender (see
[Awaiting acknowledgements](#awaiting-acknowledgements)), or use
[store-and-forward](#store-and-forward).

## Concurrency

Node.js runs your code on one thread, but async functions interleave at every
`await`:

- **`QwpClient`** is safe to share across your whole application.
- **Senders** are not safe for concurrent producers. A row is built across
  several calls, so an `await` between `table()` and `at()` lets another task
  add columns to the same row. Give each producer its own sender, borrowed from
  the pool, and size `sender_pool_max` to match.
- **Query leases** run one query at a time. Borrow one lease per concurrent
  query; `query_pool_max` caps concurrent queries.
- **Worker threads** cannot share clients. Create one client per worker, and
  give each worker its own `sender_id` when using store-and-forward.

Callbacks such as `onSenderError` run on the same event loop, so move CPU-heavy
work out of them. Row encoding runs on the event loop too, so one process
ingests at most as fast as one CPU core allows. To go faster, split the stream
across worker threads or processes, each with its own client.

## Data ingestion

<span id="basic-insert"></span>

### General usage pattern

A sender is not safe for concurrent producers: the row in progress is shared
state, so borrow one sender per producer (see [Concurrency](#concurrency)).

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
[Ingestion errors](#ingestion-errors).

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
[Error handling](#error-handling) table.

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
asynchronously; see [Ingestion errors](#ingestion-errors). Compatible
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
[Recovering from a terminal rejection](#recovering-from-a-terminal-rejection).
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
  plain decimal string (such as `"0.0750"`) and preserves the literal's scale,
  including trailing zeros. Scientific notation is accepted for a `number`,
  not a string; JavaScript drops trailing zeros when formatting numbers.
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

What `flush()` waits for depends on the ingestion mode. This page uses these
three names for the modes:

| Mode | Enabled by | `flush()` resolves when | During an outage |
|---|---|---|---|
| Default memory mode | Neither of the others | The batch is written to the WebSocket, or queued for replay | `flush()`, auto-flushing `at()`, and a borrowed sender's `close()` wait for the reconnect, up to `reconnect_max_duration_millis` (5 minutes) |
| Background memory mode | `initial_connect_retry=async` or `lazy_connect=on` | The batch is added to the in-memory replay queue | Rows keep being accepted until the queue is full |
| Store-and-forward | `sf_dir` | The batch is appended to the disk journal | Rows keep being accepted until the journal is full |

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
applies in background memory mode, and to a store-and-forward sender that
restarts while QuestDB is down. Batches are then capped only by
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
them again on a new borrow. See [Ingestion errors](#ingestion-errors).

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
[Ingestion errors](#ingestion-errors) for the error classes before and after
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
subject to [journal capacity](#sf-capacity). It retries the connection
indefinitely once it has connected, and a new sender opened on the same
directory replays what the previous process left behind, once it can take over
the directory's lock (see [Lock recovery](#sf-lock-recovery)).

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
  [Starting while QuestDB is down](#starting-while-questdb-is-down). A
  standalone `Sender` needs only `initial_connect_retry=async` or
  `lazy_connect=on`. With the default `initial_connect_retry=off`, the first
  connection must succeed.
- **Rejected batches.** A batch that QuestDB rejects terminally stays at the
  head of the journal and stops ingestion through the client, for every table,
  until you act; see
  [Recovering from a terminal rejection](#recovering-from-a-terminal-rejection).
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

If the server does not support durable acknowledgement, connecting fails with
`QwpDurableAckUnavailableError`, which the pooled client reports as the
`cause` of a `QwpPoolResourceError`.

Senders in background memory mode instead keep retrying and emit
`durable-ack-unavailable`
[connection events](#connection-events). A store-and-forward sender does the
same when reconnecting after its first successful connection. Monitor these
events and buffer usage: successful background startup does not confirm that
the server supports durable acknowledgement.

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

There is no per-query failover setting; see [Query failover](#query-failover).
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
query. See [Query failover](#query-failover).

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
[Query failover](#query-failover).

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

## Error handling

Each error leaves the client in a known state. The sections after this table
have the details and examples:

| Error | Surfaces from | State afterwards | What to do |
|---|---|---|---|
| `TypeError`, `RangeError`, or `Error` from local validation | The column method or `at()` that staged the value | The row in progress is discarded; the sender stays usable | Fix the value and write the row again |
| `QwpBatchTooLargeError` | `flush()`, the `at()` whose auto-flush sends the batch, or `close()` | The batch can never be sent: the staged rows are kept, every later flush fails the same way, and `close()` discards them | Call `reset()`, then write the rows again without the oversized one; see [Batch size limits](#batch-size-limits) |
| `QwpMemoryReplayAppendTimeoutError`, `QwpReplayStoreAppendTimeoutError` | `flush()`, an auto-flushing `at()`, or `close()` | The batch stays staged; the sender stays usable | Keep the sender and flush again later. Don't write the rows again, and don't close the sender while backpressure persists; see [Backpressure](#backpressure) |
| Retriable server rejection | `onSenderError` | The client resends the batch; repeated rejections become terminal | Monitor; no action needed per rejection |
| Terminal server rejection | `onSenderError`, then `QwpIngressNackError` or `QwpReplayRejectedError` from later calls | The sender has failed; rows still staged on it are lost. With `sf_dir`, the batch blocks the journal for every table | Fix the data or schema, then write the lost rows on a new sender; see [Recovering from a terminal rejection](#recovering-from-a-terminal-rejection) |
| `QwpReconnectExhaustedError` on a sender | `onError` with `terminal: true`, then the next `flush()`, `at()`, or `close()` | The sender has failed; unsent rows are lost | Borrow a new sender; see [Ingestion reconnect](#ingestion-reconnect) |
| `QwpReplayStoreLockedError` | `connectQwpNodeClient()` or a borrow, as the `cause` of `QwpPoolResourceError`; `connect()` on a standalone `Sender` | The journal could not be opened | See [Lock recovery](#sf-lock-recovery) |
| `QwpPoolResourceError` with another `cause` | `connectQwpNodeClient()`, `borrowSender()`, or `borrowQuery()` | No connection was opened | Unwrap `cause`; see [Connection-level errors](#connection-level-errors) |
| `QwpEgressQueryError` | Query iteration and `completion` | The lease stays usable | Fix the SQL or the bind values |
| `QwpEgressQueryTimeoutError`, `QwpEgressQueryAbandonedError` | Query iteration and `completion` | The lease is busy until QuestDB confirms the cancellation | Close the lease and borrow a new one |
| `QwpEgressQueryCancelTimeoutError` | Query iteration and `completion` | The connection is closed | Close the lease and borrow a new one |
| `QwpReconnectExhaustedError` on a query | Query iteration and `completion` | The lease stays failed, even after QuestDB recovers | Close the lease and borrow a new one; see [Query failover](#query-failover) |

`QwpReplayStoreAppendTimeoutError` and the other store-and-forward journal
errors extend `QwpReplayStoreError`, so test for the specific classes before
the base class, or branch on `error.retryable`. `true` means the failure is
temporary and the sender stays usable. `false` means the journal itself can no
longer be used, for example `QwpReplayStoreCorruptionError` or
`QwpReplayStoreLockLostError`, and the sender has failed. The other classes in
the table have no common base class: test each with `instanceof`.

### Ingestion errors

Ingestion reports errors in two ways:

- **While building a row.** A column method throws, or the promise returned by
  `at()` or `atNow()` rejects, with a `TypeError`, `RangeError`, or `Error` for
  an invalid value or name. The row in progress is discarded, and the sender
  stays usable.
- **Asynchronously, when QuestDB rejects a batch.** The rejection arrives after
  `flush()` resolved. It is delivered to the `onSenderError` callback, and
  surfaces as a rejection of `waitForAcknowledged()`, or of `flush()` with
  `awaitServerAck`.

```typescript
import {
  connectQwpNodeClient,
  QWP_SENDER_ERROR_POLICY,
  type QwpSenderError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  ingressSession: {
    onSenderError: (error: QwpSenderError) => {
      // serverStatusByte is absent for client-side errors.
      const status =
        error.serverStatusByte === undefined
          ? "none"
          : `0x${error.serverStatusByte.toString(16)}`;
      console.error(
        `rejected [${error.category}, policy=${error.appliedPolicy}, ` +
          `status=${status}, frames=${error.fromFsn}..${error.toFsn}]: ` +
          error.serverMessage,
      );
      if (error.appliedPolicy === QWP_SENDER_ERROR_POLICY.TERMINAL) {
        // The sender stopped: alert, and fix the data or the schema.
      }
    },
  },
});
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
    await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
  } finally {
    // Rethrows a terminal error. The pool then replaces the sender.
    await sender.close();
  }
} finally {
  await db.close();
}
```

When `onSenderError` is not set, rejections are logged: retriable ones at
`warn`, terminal ones at `error`. Callbacks run asynchronously, never inside the
client's protocol handling, and an exception thrown by a callback is contained.
A standalone sender's `close()` can also reject, with
`QwpSenderCloseTimeoutError`, when its rows are not acknowledged in time; see
[Closing a sender](#closing-a-sender).

`QwpSenderError` fields:

| Field | Type | Meaning |
|---|---|---|
| `category` | `string` | `schema-mismatch`, `parse-error`, `security-error`, `write-error`, `internal-error`, `not-writable`, `dictionary-gap`, `cancelled`, `limit-exceeded`, `protocol-violation`, `data-loss`, or `unknown`. Branch on this field. |
| `appliedPolicy` | `string` | What the client did: `retriable` (reconnect and resend), `retriable-other` (resend to another endpoint), `terminal` (the sender stopped), or `abandoned` (journaled data was quarantined). |
| `serverStatusByte` | `number` | The raw QWP status code, for example `0x03` for a schema mismatch. Absent for client-side errors. |
| `serverMessage` | `string` | QuestDB's error text, for example `cannot parse DOUBLE from string [value=abc, column=price]`. |
| `fromFsn`, `toFsn` | `bigint` | The rejected frame sequence range, in the same numbering as `publishedSequence`. |
| `messageSequence` | `bigint` | The wire sequence of the rejected message. |
| `tableName` | `string` | The table, when the server attributes the rejection to one. Often absent. |
| `detectedAtMs` | `number` | When the client received the rejection. |
| `quarantinedPath` | `string` | For `data-loss` in store-and-forward: where the unreplayable journal was preserved. |

The default policy follows the category:

| Category | Policy | Examples |
|---|---|---|
| `schema-mismatch`, `parse-error`, `security-error`, `protocol-violation` | Terminal | Wrong value type for an existing column, malformed data, missing permission |
| `write-error`, `internal-error`, `dictionary-gap`, `cancelled`, `limit-exceeded`, `unknown` | Retriable | Disk pressure, a suspended table, a transient server fault |
| `not-writable` | Retriable on another endpoint | The server is a replica or cannot accept writes |
| `data-loss` | Abandoned | A corrupt store-and-forward journal was set aside |

A retriable rejection is resent. For rejections that count toward the
poison-frame detector, if the same batch keeps being rejected after
`max_frame_rejections` (4) attempts spanning at least
`poison_min_escalation_window_millis` (5 minutes), the sender stops as for a
terminal error. The `dictionary-gap`, `unknown`, and `not-writable` categories
are exempt: they reset the poison episode instead of adding a strike.
Retriable rejections of symbol-dictionary catch-up frames are also exempt.
The six `on_*_error` connect-string keys are accepted but not applied by this
client.

Handling notes:

- **Message stability.** `serverMessage` is free-form English text from the
  server. Its wording can change between releases: branch on `category`, not on
  the text.
- **Sensitive data.** Server messages can contain column names and values.
  Treat them as untrusted input, and redact them before sending them to
  third-party error trackers or showing them to end users.
- **Correlation.** There is no server-side request ID. Correlate with the frame
  sequence range, `tableName`, and `detectedAtMs`.

#### Recovering from a terminal rejection

After a terminal server rejection, the sender is permanently failed. An
already-pending `waitForAcknowledged()` for the rejected batch can reject with
`QwpIngressNackError`. Once the terminal failure is latched, new calls to
`waitForAcknowledged()`, `flush()`, or `close()` reject with
`QwpReplayRejectedError`, whose `status` and message repeat the server's.
Error handlers must allow either class depending on timing. Writing LONG arrays
with `longArrayColumn()` triggers a terminal rejection on every current server.

Close the sender and create a new one. A pooled sender is replaced
automatically after the `close()` that reports the error. What happens to the
rejected batch depends on the mode:

- **Without store-and-forward**, the failed sender's unacknowledged batches,
  including the rejected one, are discarded with it, and so are rows that a
  later borrower staged on it before the error surfaced. The new sender starts
  empty.
- **With store-and-forward**, the rejected batch stays at the head of the
  journal. Every new sender on that directory, including the pool's
  replacement sender and the same client after a restart, sends it again and
  fails the same way, with `QwpReplayRejectedError`. Pooled borrows keep
  getting that journal, so ingestion through the client stops for every table,
  not only the table in the rejected batch, until you act. Treat it as an
  outage and alert on it from `onSenderError`. Fix the cause so that QuestDB
  accepts the batch, for example by adjusting the table schema, or stop the
  process and move the journal directory aside. Moving it aside discards every
  unacknowledged batch in it, not only the rejected one.

### Query errors

Query errors reject both the `for await` iteration and `completion`:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
  QwpEgressQueryTimeoutError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT * FROM no_such_table");
    for await (const batch of query) console.log(batch.rowCount);
    await query.completion;
  } catch (error) {
    if (error instanceof QwpEgressQueryError) {
      // Prints: 5 [14] table does not exist [table=no_such_table]
      console.error(error.status, error.message);
    } else if (error instanceof QwpEgressQueryTimeoutError) {
      console.error("timed out");
    } else {
      throw error;
    }
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`QwpEgressQueryError` has `status` (the QWP status code), `message` (the server
text, where parse errors start with the character position in brackets), and
`requestId` (a client-assigned `bigint` that numbers the queries of a
connection). The lease remains usable after a `QwpEgressQueryError`.

| Status | Name | Meaning |
|---|---|---|
| `0x05` | PARSE_ERROR | SQL syntax error, unknown table or column, or a bind value the statement cannot use, such as a boolean for `LIMIT` |
| `0x06` | INTERNAL_ERROR | Execution failure, including a bind value that cannot be converted, such as `'abc'` compared with a DOUBLE column, and a column type that QWP cannot return |
| `0x08` | SECURITY_ERROR | Missing permission |
| `0x0a` | CANCELLED | The query was cancelled with `cancel()` |
| `0x0b` | LIMIT_EXCEEDED | A server limit was reached: the server-side query timeout, memory, or a result row too large to send |

The `QWP_STATUS` export names these codes, for example
`QWP_STATUS.PARSE_ERROR`, so code can compare against constants instead of
numbers. A status alone does not separate a client mistake from a server
fault: `0x06` covers both bind values that cannot be converted and execution
failures, and `0x0b` covers both the server-side query timeout and memory
limits.

Other query errors:

| Error | Meaning |
|---|---|
| `QwpEgressQueryTimeoutError` | The query deadline expired and cancellation started. Has `requestId` and `timeoutMs`. |
| `QwpEgressQueryAbandonedError` | Iteration ended early, for example with `break`. |
| `QwpEgressQueryCancelTimeoutError` | QuestDB did not confirm a cancellation in time; the connection was closed. |
| `QwpEgressSessionClosedError` | The query connection is closed. |
| `QwpReconnectExhaustedError` | Failover gave up; see [Query failover](#query-failover). |

As with ingestion, the message text is not stable, may echo parts of the SQL,
and has no server-side correlation ID beyond `requestId`.

### Connection-level errors

| Error | Raised when |
|---|---|
| `QwpUpgradeError` | Connecting to an endpoint failed. `kind` is `authentication` (HTTP 401 or 403), `role-rejected`, `http-rejected`, `version-mismatch`, `capability-mismatch`, `timeout`, or `transport`. It also carries `statusCode`, `retryable`, and `url`. |
| `QwpFailoverError` | Every endpoint in a multi-host list failed. `attempts` holds each endpoint and its error. |
| `QwpPoolResourceError` | The pool could not open a new connection. `cause` holds the error above. |
| `QwpPoolAcquireTimeoutError` | Every pooled connection stayed leased past `acquire_timeout_ms`. |
| `QwpReconnectExhaustedError` | The reconnect budget ran out. The sender or query failed permanently. |
| `QwpRoleMismatchError` | No endpoint has the role that `target` requires. |
| `QwpDurableAckUnavailableError` | `request_durable_ack=on`, but the server does not support it. |
| `QwpClientClosedError` | The pooled client, or a returned lease, is already closed. |

The pooled client wraps every failure to open a connection, from
`connectQwpNodeClient()`, `db.connect()`, `borrowSender()`, or
`borrowQuery()`, in a `QwpPoolResourceError`. Unwrap its `cause` before
checking for a specific error. When `addr` lists several hosts, the cause is a
`QwpFailoverError` whose `attempts` hold the error of each endpoint. When
initial-connect retry is on, for example with a `failover_*` or `reconnect_*`
key, or with a typed `egressSession.reconnect` object for query connections
(see [Typed reconnect policy](#typed-reconnect-policy)), the cause is a
`QwpReconnectExhaustedError` instead, and its own `cause` holds the last
attempt's error:

```typescript
import {
  connectQwpNodeClient,
  QwpFailoverError,
  QwpPoolResourceError,
  QwpReconnectExhaustedError,
  QwpUpgradeError,
} from "@questdb/nodejs-client";

// The errors behind a failed connection, one per endpoint tried.
function connectionErrors(error: unknown): unknown[] {
  let cause = error instanceof QwpPoolResourceError ? error.cause : error;
  // With initial-connect retry on, the last attempt's error is wrapped.
  if (cause instanceof QwpReconnectExhaustedError) cause = cause.cause;
  return cause instanceof QwpFailoverError
    ? cause.attempts.map((attempt) => attempt.error)
    : [cause];
}

try {
  const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
  await db.close();
} catch (error) {
  for (const cause of connectionErrors(error)) {
    if (cause instanceof QwpUpgradeError && cause.kind === "authentication") {
      console.error("QuestDB rejected the credentials:", cause.message);
    } else {
      console.error("cannot connect:", cause);
    }
  }
  throw error;
}
```

An authentication rejection (HTTP 401 or 403) is terminal before a sender's
first successful connection and for query connections. It stops the endpoint
walk because credentials are assumed to be shared across the cluster.

After a successful connection, regular senders with `sf_dir` or in background
memory mode (`initial_connect_retry=async` or `lazy_connect=on`) keep retrying
authentication rejections indefinitely. This lets buffered data drain once
server-side authentication is restored. Senders in default memory mode, and
orphan drainers, do not have this exception. See
[Authentication is cluster-wide](/docs/high-availability/client-failover/concepts/#authentication-is-cluster-wide)
for how other clients behave.

Endpoints in error messages have any embedded credentials removed.

#### Connection timeouts

Two transport deadlines bound WebSocket setup: `connect_timeout` covers DNS
and the TCP/TLS connection, and `auth_timeout_ms` covers the upgrade and
authentication. Both default to 15 seconds, and `auth_timeout_ms` inherits
`connect_timeout` when only the latter is set. A timeout in either phase
produces a `QwpUpgradeError` whose `timeoutPhase` is `connect` or
`authentication`.

After the upgrade, a query connection has a separate 5-second deadline for
the initial QWP `SERVER_INFO` frame. Configure it with the typed option
`egressSession.serverInfoTimeoutMs`; raising the transport deadlines does not
change it. Expiry produces an ordinary `Error` with the message
`timed out waiting for QWP SERVER_INFO`, not a `QwpUpgradeError`.

### Logging

The client writes its own messages to the console by default, at the `error`,
`warn`, and `info` levels. To route a sender's messages, such as warnings about
rows discarded on close, through your logger, pass a `QwpSenderLogger`
function: `{ sender: { log } }` as the second argument of
`connectQwpNodeClient()`, or `{ log }` for `Sender.fromConfig()`. Its signature
is `(level: "error" | "warn" | "info" | "debug", message: string | Error)`, so
convert `message` with `String()` if your logger takes strings only. The
function also receives `debug` messages, one per staged row, so filter by
level.

Rejected batches and session errors go to `ingressSession.onSenderError` and
`ingressSession.onError`. Their defaults log to the console, so replace both to
route them through your logger. Some messages from other parts of the client,
such as store-and-forward recovery, always go to the console.

## Failover and high availability

:::note Enterprise

Failing over between several QuestDB hosts requires QuestDB Enterprise
replication. Reconnecting to a single restarted server works in open source
too.

:::

### Multiple endpoints

List several hosts in `addr`:

```text
wss::addr=db-a.example.com:9000,db-b.example.com:9000,db-c.example.com:9000;
```

The client ranks endpoints by observed health and by `zone`, and on a
connection loss moves to the next usable one. `addr` is shared by ingestion and
queries.

Ingestion always needs the primary: replicas refuse writes, and the sender
walks the list until it finds the current primary. Queries can use any node.
`target` selects which roles queries accept: `any` (the default), `primary`, or
`replica`. Set it with the typed `egress` option, as below, because in the
connect string `target` also filters ingestion (see the caution that follows).

`target` is a strict filter, not a preference. With `replica`, queries never
fall back to the primary, and they fail when no replica is reachable, including
against a single open source server. Because the pooled client opens a query
connection at startup, `connectQwpNodeClient()` then fails too, with a
`QwpPoolResourceError` whose `cause` leads to a `QwpRoleMismatchError`; see
[Connection-level errors](#connection-level-errors) to unwrap it. To start
without a replica, also set `query_pool_min=0`. Queries borrowed before a
replica is reachable then reject with `QwpPoolResourceError`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// Queries run on replicas only. Ingestion still follows the primary.
const db = await connectQwpNodeClient(
  "wss::addr=db-a.example.com:9000,db-b.example.com:9000;token=YOUR_TOKEN;" +
    // Start, and ingest, even while no replica is reachable.
    "query_pool_min=0;",
  { egress: { target: "replica" } },
);
await db.close();
```

`zone` prefers endpoints in the same zone.

:::caution `target` in the connect string also filters ingestion

Unlike the Java client, the Node.js client applies `target` and `zone` from
the connect string to ingestion as well as queries. `target=replica` in the
connect string therefore stops ingestion from reaching the primary. To read
from replicas and write to the primary with one client, keep `target` out of
the connect string and set it for queries only:
`connectQwpNodeClient(conf, { egress: { target: "replica" } })`.

:::

### Ingestion reconnect

When the connection drops, the sender reconnects with exponential backoff and
jitter, then resends every unacknowledged batch:

| Key | Default | Purpose |
|---|---|---|
| `reconnect_initial_backoff_millis` | `100` | First retry delay. |
| `reconnect_max_backoff_millis` | `5000` | Longest delay between retries. |
| `reconnect_max_duration_millis` | `300000` (5 minutes) | Budget for one outage in default memory mode. `0` removes the limit. |
| `initial_connect_retry` | `off` | Whether the first connection retries: `off` fails fast, `on` (or `sync`) retries within the budget, `async` connects in the background. |

Whether the sender gives up depends on the mode (see [Flushing](#flushing)):

- **Default memory mode** retries for up to `reconnect_max_duration_millis`
  per outage. When the budget runs out, the sender fails permanently with
  `QwpReconnectExhaustedError`, and its unsent rows are lost. The Java
  reference client retries indefinitely in this mode instead.
- **Background memory mode** (`initial_connect_retry=async` or
  `lazy_connect=on`) and **store-and-forward** (`sf_dir`) retry indefinitely.

Setting any `reconnect_*` key also makes a sender's first connection retry
within the budget, as if `initial_connect_retry=on`. Set
`initial_connect_retry=off` explicitly to keep a fail-fast start. The keys do
not apply to query connections: the pooled client still opens its query pool
at startup, so `connectQwpNodeClient()` fails fast while QuestDB is down unless
you also set `query_pool_min=0` or enable query retries (see
[Connection events](#connection-events)).

Replay after a reconnect is at least once: a batch that QuestDB committed just
before the connection dropped is sent again. Write to a deduplicated table, as
described under [Store-and-forward](#store-and-forward), to keep replayed rows
from inserting duplicates.

### Query failover

If the connection fails during a query, the client reconnects, to another
endpoint when there is one, and runs the query again from the start:

| Key | Default | Purpose |
|---|---|---|
| `failover` | `on` | Set `off` to fail the query instead of retrying. |
| `failover_max_attempts` | `8` | Connection attempts per failure. Each attempt tries every endpoint in `addr`. |
| `failover_backoff_initial_ms` | `50` | First retry delay. |
| `failover_backoff_max_ms` | `1000` | Longest delay between retries. |
| `failover_max_duration_ms` | `30000` | Time budget per failure. |

The attempt limit and the time budget apply together, and whichever is reached
first ends the failover. When attempts fail fast, for example with connection
refused while a server restarts, the 8 attempts and their backoff of 50 ms to
1 second, with jitter, take only about 1 to 3 seconds, and at most about 4.5
seconds, long before the 30-second budget. To ride out a longer restart, raise `failover_max_attempts`,
or set `maxAttempts: 0` in a typed `egressSession.reconnect` object to remove
the attempt limit and rely on the time budget alone; see
[Typed reconnect policy](#typed-reconnect-policy).

When failover gives up, the query rejects with `QwpReconnectExhaustedError`,
and the lease stays failed even after QuestDB recovers: close it and borrow a
new one. A `QwpEgressQueryError` from the server is a query result and never
triggers failover. Replaying an in-flight `query()` also re-executes DDL and
DML: an `INSERT` may run twice if its completion was lost. For non-idempotent
SQL, use a separate client configured with `failover=off` and check an
uncertain outcome before retrying; see
[DDL and DML statements](#ddl-and-dml-statements).

:::warning Clear partial results when a query restarts

A re-executed query starts again from the first row. Batches that were queued
but not yet consumed are discarded for you, but rows your loop already
processed are delivered again. If your code accumulates rows, clear them when
the query restarts; otherwise it sees the first part of the result twice.

:::

Every batch has a `batchSequence` starting at `0n`, including the first batch
after a replay. Clear accumulated rows on that batch. A replay may return
**zero rows and no batches**, though, leaving prior rows in your accumulator.
`egressSession.onReplayReset` also clears it when that happens. Since this
callback is shared across the pool and request IDs are per connection, the
example limits the pool to one active query:

```typescript
import {
  connectQwpNodeClient,
  QwpReconnectExhaustedError,
} from "@questdb/nodejs-client";

const rows: (readonly unknown[])[] = [];
const db = await connectQwpNodeClient(
  "ws::addr=db-a.example.com:9000,db-b.example.com:9000;query_pool_max=1;",
  {
    egressSession: {
      onReplayReset: () => {
        rows.length = 0;
      },
    },
  },
);
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT * FROM trades LIMIT 100000", {
      // The deadline covers the whole query, including a re-execution.
      timeoutMs: 30_000,
    });
    for await (const batch of query) {
      // Sequence 0 starts the result, both initially and after a failover.
      if (batch.batchSequence === 0n) rows.length = 0;
      for (const row of batch.rows()) rows.push(row);
    }
    await query.completion;
    console.log(`${rows.length} rows`);
  } catch (error) {
    if (!(error instanceof QwpReconnectExhaustedError)) throw error;
    // Failover gave up. This lease stays failed: return it, retry later.
    console.error("no endpoint could run the query:", error.message);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

The reset needs the rows of the current attempt in one place you can discard.
When your code passes rows on as they arrive, for example by streaming them to
an HTTP response, it cannot take them back after a restart. Then choose one
of these instead:

- Run such queries on a separate client with `failover=off`, so that a lost
  connection fails the query instead of restarting it, and retry the whole
  request.
- Keep each result small enough to buffer, for example by paging with
  `WHERE timestamp < $1 ORDER BY timestamp DESC LIMIT n`, binding the oldest
  timestamp of the previous page.
- Treat `batchSequence === 0n` after rows have left as an error, and abort the
  downstream response instead of sending duplicates.

`egressSession.onReplayReset` runs before a query is replayed, including when
that replay returns no batches. Its event has `requestId`, `endpoint`,
`previousEndpoint`, `serverInfo`, and `cause`. The `requestId` matches
`query.requestId`, but request IDs are numbered per connection and every lease
of a pooled client shares the callback: it cannot identify which of several
concurrent queries restarted. Use a dedicated, single-query client when the
callback resets result state, as above. For concurrent results that cannot be
isolated, set `failover=off` and retry the whole query after a transport error;
`batchSequence === 0n` alone cannot detect a zero-batch replay.

### Typed reconnect policy

Reconnect and failover behavior comes from the connect-string keys above, or
from typed `reconnect` objects in the second argument of
`connectQwpNodeClient()`: `ingressSession.reconnect` for senders and
`egressSession.reconnect` for queries. You need the object to register
`onEvent` for [connection events](#connection-events).

:::caution A typed `reconnect` object replaces the connect-string keys

`ingressSession.reconnect` (or `qwp.session.reconnect` on a `Sender`) replaces
the whole reconnect policy parsed from the `reconnect_*`,
`max_frame_rejections`, and `poison_min_escalation_window_millis` keys, and
`egressSession.reconnect` replaces the policy parsed from `failover*` keys.
Fields you leave out of the object take the built-in defaults, not the values
from the connect string. When you supply the object, for example to register
`onEvent`, set every bound you rely on in it.

:::

The object's fields and the connect-string keys they replace:

| Field | Ingestion key, default | Query key, default |
|---|---|---|
| `maxAttempts` | None, `0` (unlimited) | `failover_max_attempts`, `8`. The key accepts `1` or more; the typed field also accepts `0`, unlimited |
| `initialBackoffMs` | `reconnect_initial_backoff_millis`, `100` | `failover_backoff_initial_ms`, `50` |
| `maxBackoffMs` | `reconnect_max_backoff_millis`, `5000` | `failover_backoff_max_ms`, `1000` |
| `maxDurationMs` | `reconnect_max_duration_millis`, `300000` | `failover_max_duration_ms`, `30000` |
| `maxFrameRejections` | `max_frame_rejections`, `4` | Not used |
| `poisonMinEscalationWindowMs` | `poison_min_escalation_window_millis`, `300000` | Not used |
| `onEvent` | None | None |

`egressSession: { reconnect: false }` is the typed equivalent of
`failover=off`. Senders in background memory mode or with `sf_dir` retry
indefinitely: `maxAttempts` and `maxDurationMs` do not end their retries, so
the full example's `reconnect: { onEvent }` with `sf_dir` keeps retrying
through an outage of any length.

The two directions treat the first connection differently:

- **Senders**: setting any `reconnect_*` key makes the first connection retry
  within the budget, as if `initial_connect_retry=on`. A typed
  `ingressSession.reconnect` object does not, so the first connection still
  fails fast. Set `initial_connect_retry` in the connect string to choose the
  startup behavior.
- **Query connections**: the first connection retries within the failover
  budget, for retryable errors, when you supply an `egressSession.reconnect`
  object, set `failover=on` explicitly, or set a `failover_*` key without
  `failover=off`. Otherwise it is attempted once. `failover=off` and
  `egressSession.reconnect: false` turn reconnects off entirely.

### Connection events

Register `reconnect.onEvent` to observe connections. Events are delivered
asynchronously through a bounded queue (64 by default,
`connection_listener_inbox_capacity`); when it overflows, the oldest events are
dropped and counted in the metrics.

```typescript
import {
  connectQwpNodeClient,
  QWP_RECONNECT_EVENT_KIND,
  type QwpReconnectEvent,
} from "@questdb/nodejs-client";

function onEvent(event: QwpReconnectEvent) {
  switch (event.kind) {
    case QWP_RECONNECT_EVENT_KIND.RECONNECTING:
      console.warn("connection lost, reconnecting:", event.cause);
      break;
    case QWP_RECONNECT_EVENT_KIND.FAILED_OVER:
      console.warn(`failed over to ${String(event.endpoint)}`);
      break;
    default:
      console.info(event.kind, String(event.endpoint ?? ""));
  }
}

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  // Each object replaces the reconnect_* or failover* keys from the connect
  // string. Fields left out use the built-in defaults.
  ingressSession: {
    reconnect: { onEvent },
    // No event marks a terminal failure: it arrives here instead.
    onError: (event) => {
      if (event.terminal) console.error("ingestion stopped:", event.error);
    },
  },
  egressSession: { reconnect: { onEvent } },
});
await db.close();
```

Supplying the `reconnect` objects also changes how the first connection is
retried; see [Typed reconnect policy](#typed-reconnect-policy).

| Kind | Meaning |
|---|---|
| `connected` | The first connection succeeded. |
| `reconnecting` | The active connection was lost. `cause` holds the error. |
| `attempt-failed` | One connection attempt failed. The client retries if the error is retryable and its budget allows; otherwise this is the last event before the failure is reported. |
| `reconnected` | Reconnected to the same endpoint. |
| `failed-over` | Reconnected to a different endpoint. `previousEndpoint` holds the old one. |
| `durable-ack-unavailable` | A sender is waiting for an endpoint that supports durable acknowledgement. Only senders that retry indefinitely wait: store-and-forward senders after their first connection, and senders in background memory mode. |
| `durable-ack-persistent-failure` | An orphan drainer gave up waiting for durable acknowledgement support. |
| `primary-unavailable` | An orphan drainer, which recovers a journal left by another sender (see [Store-and-forward](#store-and-forward)), found no endpoint that currently accepts writes. It keeps retrying. Regular senders do not emit it. |

The `QWP_RECONNECT_EVENT_KIND` constants name these kinds: `CONNECTED`,
`RECONNECTING`, `ATTEMPT_FAILED`, `RECONNECTED`, `FAILED_OVER`,
`DURABLE_ACK_UNAVAILABLE`, `DURABLE_ACK_PERSISTENT_FAILURE`, and
`PRIMARY_UNAVAILABLE`.

`reconnected` and `failed-over` are mutually exclusive: code that tracks the
current node must handle both. The client has no property that says whether it
is connected right now. To report it, for example in a health check, track the
latest event: after `reconnecting` the connection is down, and `connected`,
`reconnected`, or `failed-over` mean it is up. A query that reconnects runs
again from its first batch; see
[Query failover](#query-failover) for resetting accumulated rows.

No event marks a terminal failure. When a sender stops retrying, because its
reconnect budget ran out or the error cannot be retried,
`ingressSession.onError` receives a `QwpIngressErrorEvent` with
`terminal: true`, even while the sender is idle. The event also has `error`,
`timestampMs`, and, for a server rejection, `senderError`. The sender's next `flush()`, auto-flushing `at()`, or
`close()` then rejects with the same error, such as
`QwpReconnectExhaustedError`. A query that cannot fail over rejects its
iteration and `completion` instead.

For ingestion, `ingressSession` also accepts `onProgress`, for published,
acknowledged, and durably acknowledged sequences, and `onError`, for session
errors. `sender.metrics` returns a snapshot of the sender's counters, including
`metrics.ingress` with the replay queue, reconnect, and notification counters.

<span id="configuration-options"></span>

## Configuration reference

The [connect string reference](/docs/connect/clients/connect-string/) documents
every key. The Node.js client's defaults and deviations:

| Key | Default | Notes |
|---|---|---|
| `addr` | required | Comma-separated or repeated for failover. Port defaults to `9000`. |
| `username`, `password`, `token` | none | Basic or bearer authentication. |
| `tls_verify`, `tls_roots` | `on`, Node.js CA bundle | `wss` only. `tls_roots` must be PEM. `tls_roots_password` is rejected. |
| `connect_timeout`, `auth_timeout_ms` | `15000` | DNS and TCP/TLS connection, and upgrade deadlines, in milliseconds. See [Connection timeouts](#connection-timeouts). |
| `auto_flush` | `on` | Master switch for the three triggers. |
| `auto_flush_rows` | `1000` | `0` disables. `off` is rejected. |
| `auto_flush_interval` | `100` | Milliseconds. `0` disables. `off` is rejected. |
| `auto_flush_bytes` | disabled | Size, or `off`. |
| `close_flush_timeout_millis` | `5000` | ACK wait in a standalone sender's `close()`. |
| `transaction` | `off` | Keep auto-flushed batches in an open transaction until `flush()`. |
| `request_durable_ack` | `off` | Enterprise. |
| `max_name_len` | `127` | Maximum table and column name length, in UTF-8 bytes. |
| `reconnect_initial_backoff_millis`, `reconnect_max_backoff_millis` | `100`, `5000` | Ingestion reconnect backoff. |
| `reconnect_max_duration_millis` | `300000` | Ingestion budget per outage in default memory mode. `0` removes it. |
| `max_frame_rejections`, `poison_min_escalation_window_millis` | `4`, `300000` | Poison-frame detector: rejections of one batch, and the minimum time they must span, before the sender stops. |
| `initial_connect_retry` | `off` | `off`, `on`/`sync`, or `async`. |
| `sf_dir`, `sender_id` | none, `default` | Store-and-forward journal location. |
| `sf_durability` | `memory` | `memory`, `periodic`, or `append`. |
| `sf_max_total_bytes` | `10g` with `sf_dir`, `128m` without | [Journal size target](#sf-capacity), not a hard disk limit; memory queue cap without `sf_dir`. |
| `sf_max_segment_bytes` | `4m` with `sf_dir`, none without | Journal segment size, which also caps a batch. |
| `sf_append_deadline_millis` | `30000` | How long a full journal or queue blocks publishing. |
| `drain_orphans`, `max_background_drainers` | `off`, `4` | Adopt journals left by crashed processes. |
| `target`, `zone` | `any`, none | Endpoint role and zone preference. Apply to ingestion too. |
| `failover`, `failover_max_attempts`, `failover_max_duration_ms` | `on`, `8`, `30000` | Query failover. |
| `compression`, `compression_level` | `raw`, `1` | Query result compression. |
| `initial_credit`, `buffer_pool_size`, `max_batch_rows` | `0`, `4`, server default | Query flow control. |
| `client_id` | `typescript/<version>` | Sent to the server for diagnostics. |
| `error_inbox_capacity`, `connection_listener_inbox_capacity` | `256`, `64` | Queues for rejection callbacks and connection events. |
| Pool keys | see [Pool settings](#pool-settings) | Applied by the pooled client. A standalone `Sender` also applies `lazy_connect`. |

The
[API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
covers every type and option. The
[QWP guide](https://github.com/questdb/nodejs-questdb-client/blob/main/QWP.md)
in the client repository describes the delivery semantics in depth.

### Differences from other clients

The Node.js client differs from the Java reference client, and from the shared
[connect string reference](/docs/connect/clients/connect-string/), in these
places:

| Area | Node.js behavior |
|---|---|
| Outage budget | A sender in default memory mode gives up after `reconnect_max_duration_millis` and fails with `QwpReconnectExhaustedError`. Senders in background memory mode (`initial_connect_retry=async` or `lazy_connect=on`) or with `sf_dir` retry indefinitely. See [Ingestion reconnect](#ingestion-reconnect). |
| `target` and `zone` | Also apply to ingestion. Set a query-only role with the typed `egress.target` option. See [Multiple endpoints](#multiple-endpoints). |
| Authentication rejected after a first connection | Senders with `sf_dir` or in background memory mode keep retrying. Other senders and query connections fail. See [Connection-level errors](#connection-level-errors). |
| Durable acknowledgement unavailable | Senders in background memory mode keep retrying from startup, and store-and-forward senders after their first connection, emitting `durable-ack-unavailable`. See [Durable acknowledgement](#durable-acknowledgement). |
| `sf_durability` | Also accepts `append`. |
| `sf_max_total_bytes` with `sf_dir` | A journal size target that can be exceeded, not a hard limit. See [Journal capacity](#sf-capacity). |
| Journal lock | A `.lock.owner` directory that can outlive a crashed process and that other clients' operating-system locks do not see. See [Lock recovery](#sf-lock-recovery). |
| `max_lifetime_ms` | Closes idle connections above the pool minimum only. Connections at the minimum are not recycled. |
| Connect string parsing | `0`, not `off`, disables `auto_flush_rows` and `auto_flush_interval`, and the interval runs from the last flush or from sender creation. Size values take single-letter suffixes only. `tls_roots` must be PEM. `init_buf_size` and `max_buf_size` are rejected. |
| `connect_timeout` | Also covers DNS and the TLS handshake, and `auth_timeout_ms` defaults to `connect_timeout` when only that key is set. See [Connection timeouts](#connection-timeouts). |
| `tls_roots` default | The CA certificates bundled with Node.js, not the operating system's trust store. See [TLS](#tls). |
| Defaults | `connect_timeout` is `15000` and `poison_min_escalation_window_millis` is `300000`. `close_flush_timeout_millis` is `5000`, as in the Rust, C, C++, Python, and Go clients; Java and .NET use `60000`. |
| Close after an ACK timeout | A standalone sender's `close()` rejects with `QwpSenderCloseTimeoutError` instead of logging a warning. The pooled client's `db.close()` resolves and reports the timeout, best-effort, to `ingressSession.onError`. See [Closing a sender](#closing-a-sender). |
| Error reports | Categories and policies are lowercase, hyphenated strings, such as `schema-mismatch` and `retriable-other`. See [Ingestion errors](#ingestion-errors). |
| Pool and query keys on a standalone `Sender` | The `Sender` logs a warning for the pool and query-only keys it ignores. It applies `client_id` and `lazy_connect`. |
| `on_*_error` keys | Accepted but not applied. |

## Migration

### From ILP to QWP

The row API is unchanged, so existing `Sender` code migrates by changing the
connect string and calling `connect()`:

```diff
- const sender = await Sender.fromConfig("http::addr=localhost:9000");
+ const sender = await Sender.fromConfig("ws::addr=localhost:9000");
+ await sender.connect();
```

| Aspect | ILP over HTTP | QWP over WebSocket |
|---|---|---|
| Connect string schema | `http::`, `https::` | `ws::`, `wss::` |
| Auto-flush rows | 75,000 (600 over TCP) | 1,000 |
| Auto-flush interval | 1,000 ms | 100 ms |
| `flush()` completes when | QuestDB responds to the HTTP request | The batch is published; the ACK arrives later |
| Server rejection | `flush()` throws | Asynchronous: `onSenderError`, `waitForAcknowledged()`, or `flush()` with `awaitServerAck` |
| Rows staged at `close()` | Lost unless flushed | Published; waits up to 5 seconds for ACK, then unacknowledged rows may be lost without `sf_dir` |
| Reconnect and replay | Retries one request for `retry_timeout` | Automatic, with replay of unacknowledged batches |
| Store-and-forward, querying, pooling | Not available | Available |
| Column types | ILP types | More types, subject to [column-method](#column-methods) and [array](#arrays) support |

Legacy keys such as `retry_timeout`, `request_timeout`, `init_buf_size`,
`max_buf_size`, `protocol_version`, and `tls_ca` are rejected on `ws`/`wss`
with a hint. It names the replacement where there is one
(`retry_timeout` becomes `reconnect_max_duration_millis`, and `tls_ca` becomes
`tls_roots`), and otherwise says that the key applies only to ILP or that QWP
negotiates the setting itself. To keep ILP-sized batches, set
`auto_flush_rows` and `auto_flush_interval` explicitly. Migrate one sender at a
time: ILP and QWP senders can run side by side.

### Upgrading from 4.x

Version 5.0.0 keeps the ILP API and adds QWP. Changes that affect existing ILP
code:

- **Null values.** Passing `null` or `undefined` to a column or symbol method now
  omits the column. Existing nullable columns store NULL; BOOLEAN defaults to
  `false`, and BYTE and SHORT default to `0` (see [Null values](#null-values)).
  Earlier versions threw a type error for most such values. Validate data
  before calling the sender if you relied on the error.
- **Decimal scale.** `decimalColumn()` over ILP rejects a non-integer `scale`
  with a `RangeError`. Earlier versions silently coerced it, writing `2.5` as
  scale 2 and `NaN` as scale 0.
- **`intColumn()`** also accepts a `bigint`, for LONG values beyond
  `Number.MAX_SAFE_INTEGER`.
- **TCP authentication** now works on Node.js 26, which rejects the JWK the
  client previously built.
- **New dependency.** The package now depends on `ws`, used for QWP.

## ILP transports (legacy)

The Node.js `Sender` still ingests over ILP, for existing deployments and for
servers without QWP. To move ILP code to QWP, see
[From ILP to QWP](#from-ilp-to-qwp); for behavior changes in 5.0.0, see
[Upgrading from 4.x](#upgrading-from-4x). ILP senders support HTTP (`http::`,
`https::`) and TCP (`tcp::`, `tcps::`) transports:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig(
  "http::addr=localhost:9000;username=admin;password=quest;",
);
try {
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.00044)
    .at(Date.now(), "ms");
  // ILP does not flush on close: rows still buffered at close() are lost.
  await sender.flush();
} finally {
  await sender.close();
}
```

- HTTP connects per request, so `connect()` is not needed; TCP transports
  require `await sender.connect()`. `token=...` selects bearer authentication
  over HTTP. Over TCP, `username` and `token` set the JWK key ID and private
  key.
- Over HTTP, `flush()` sends the buffer as one request and throws if QuestDB
  rejects it. Data is transactional only for a single-table request. A
  multi-table request can commit earlier tables before a later table fails,
  so a failed flush does not mean no data was committed. Schema changes, such
  as automatically added columns, are not rolled back even for a single-table
  request. See [HTTP transaction semantics](/docs/connect/compatibility/ilp/overview/#http-transaction-semantics).
- Decimals need ILP protocol version 3: HTTP negotiates it automatically, and
  TCP needs `protocol_version=3`. Arrays need version 2 or later.
- Undici is the default HTTP agent. Set `stdlib_http=on` to use the Node.js
  `http` module instead.

For ILP options, see the
[`SenderOptions` reference](https://questdb.github.io/nodejs-questdb-client/classes/_questdb_nodejs-client.SenderOptions.html)
and the [ILP overview](/docs/connect/compatibility/ilp/overview/).

## Full example: Ingestion and querying with failover

A production-oriented pattern that ingests trades and queries recent prices,
with TLS, a token, several hosts, error handling, and failover handling. Before
running it, create the deduplicated table on the primary (or reuse the table
from [Store-and-forward](#store-and-forward)). If the table is missing, QWP
creates it without deduplication:

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

Replace the sample events with source-assigned trade IDs and timestamps. Keep
both values unchanged when retrying the same event, and use a writable,
persistent `sf_dir` so unacknowledged rows survive a shutdown:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
  QwpIngressAckTimeoutError,
  QwpPoolResourceError,
  QWP_RECONNECT_EVENT_KIND,
  QWP_SENDER_ERROR_POLICY,
  type QwpReconnectEvent,
  type QwpSenderError,
} from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");

// This example runs one query at a time so its replay callback can clear it.
const recentPrices: (readonly unknown[])[] = [];

// Replace with your alerting.
function alertOperator(message: string) {
  console.error("ALERT:", message);
}

function logConnection(event: QwpReconnectEvent) {
  if (event.kind !== QWP_RECONNECT_EVENT_KIND.ATTEMPT_FAILED) {
    const endpoint = String(event.endpoint ?? "");
    console.info("questdb connection:", event.kind, endpoint);
  }
}

const db = await connectQwpNodeClient(
  "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;" +
    `token=${token};` +
    // append: every flush waits for a disk sync; see "Store-and-forward".
    "sf_dir=/var/lib/my-service/qdb-sf;sender_id=trade-service;" +
    // Limit offline batches below the default server's 2 MiB limit.
    "sf_durability=append;sf_max_segment_bytes=1m;sender_pool_max=4;" +
    // Query pool stays cold while replicas are down; one active query so the
    // replay callback below can reset its state even if replay has no batches.
    "query_pool_min=0;query_pool_max=1;",
  {
    // Queries run on replicas only, never on the primary; ingestion always
    // follows the primary.
    egress: { target: "replica", compression: "zstd" },
    ingressSession: {
      onSenderError: (error: QwpSenderError) => {
        console.error("batch rejected:", error.category, error.serverMessage);
        // A terminally rejected batch stays in the journal and blocks
        // ingestion through this client, for every table, until it is fixed.
        if (error.appliedPolicy === QWP_SENDER_ERROR_POLICY.TERMINAL) {
          alertOperator(`QuestDB rejected a batch: ${error.serverMessage}`);
        }
      },
      // Terminal failures, such as a batch that QuestDB rejects terminally.
      onError: (event) => {
        if (event.terminal) console.error("ingestion stopped:", event.error);
      },
      // Replaces any reconnect_* keys; omitted fields use the defaults.
      reconnect: { onEvent: logConnection },
    },
    egressSession: {
      queryTimeoutMs: 30_000,
      // Replaces any failover* keys; omitted fields use the defaults.
      // No 8-attempt limit (maxAttempts 0): failover can last up to 30 s.
      reconnect: {
        maxAttempts: 0,
        maxDurationMs: 30_000,
        onEvent: logConnection,
      },
      onReplayReset: (event) => {
        recentPrices.length = 0;
        console.warn("query restarts on", String(event.endpoint));
      },
    },
  },
);

try {
  // Ingestion: one borrowed sender per producer. IDs and timestamps must
  // come from the source, not be regenerated on an application retry.
  const events = [
    {
      tradeId: "trade-12345",
      timestampMs: 1723000000000,
      symbol: "ETH-USD",
      price: 2615.54,
      amount: 0.5,
    },
    {
      tradeId: "trade-12346",
      timestampMs: 1723000000001,
      symbol: "BTC-USD",
      price: 39269.98,
      amount: 0.001,
    },
  ];
  const sender = await db.borrowSender();
  try {
    for (const event of events) {
      await sender
        .table("trades_sf")
        .stringColumn("trade_id", event.tradeId)
        .symbol("symbol", event.symbol)
        .symbol("side", "buy")
        .doubleColumn("price", event.price)
        .doubleColumn("amount", event.amount)
        .at(event.timestampMs, "ms");
    }
    await sender.flush();
    await sender.waitForAcknowledged(sender.publishedSequence, 10_000);
  } catch (error) {
    if (!(error instanceof QwpIngressAckTimeoutError)) throw error;
    console.warn("ACK timed out; rows remain in sf_dir for replay after close");
  } finally {
    // After a terminal rejection, close() rejects with the same failure.
    // Log it so that it does not replace the error thrown above.
    await sender
      .close()
      .catch((error) => console.error("close failed:", error));
  }

  // Querying: rows may not be visible yet, see "Read-after-write".
  try {
    const lease = await db.borrowQuery();
    try {
      const query = await lease.query(
        "SELECT timestamp, trade_id, symbol, price FROM trades_sf " +
          "WHERE symbol = $1 ORDER BY timestamp DESC LIMIT 10",
        { binds: (binds) => binds.setVarchar(0, "ETH-USD") },
      );
      for await (const batch of query) {
        // A nonempty replay starts at sequence 0; the callback handles
        // empty ones.
        if (batch.batchSequence === 0n) recentPrices.length = 0;
        for (const row of batch.rows()) recentPrices.push(row);
      }
      await query.completion;
      console.log(recentPrices);
    } finally {
      await lease.close();
    }
  } catch (error) {
    if (error instanceof QwpPoolResourceError) {
      // No replica was reachable within the failover budget.
      console.warn("no replica available for queries:", error.cause);
    } else if (error instanceof QwpEgressQueryError) {
      console.error(`query failed: status=${error.status} ${error.message}`);
    } else {
      throw error;
    }
  }
} finally {
  await db.close();
}
```

The query can still miss newly acknowledged rows until WAL apply catches up;
use the [Read-after-write](#read-after-write) pattern for a visibility guarantee.
A replayed batch is idempotent only because this example retains the event's
ID and timestamp and enables table-level deduplication.

## Next steps

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
