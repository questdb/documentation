---
slug: /connect/clients/nodejs
title: Node.js client for QuestDB
sidebar_label: Node.js
description:
  "QuestDB Node.js client for high-throughput data ingestion and streaming SQL
  queries over QWP, with pooling, failover, and store-and-forward."
---

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB Node.js client, `@questdb/nodejs-client`, connects Node.js
applications to QuestDB over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), the QuestDB Wire
Protocol: a columnar binary protocol carried over WebSocket. The same client
ingests data at high throughput and runs SQL queries whose results stream back
as typed, column-oriented batches.

Key capabilities:

- **Ingestion**: a fluent row API and compiled, type-checked object-row
  writers, with automatic table creation, schema evolution, batching, and
  acknowledgement tracking.
- **Querying**: SQL with typed bind parameters, results streamed as columnar
  batches, DDL and DML execution, cancellation, deadlines, and flow control.
- **One pooled client**: `connectQwpNodeClient()` configures ingestion and
  queries from one `ws::` connect string, then hands out pooled senders
  (`db.borrowSender()`) and query leases (`db.borrowQuery()`).
- **Failover**: multi-host endpoint lists, automatic reconnect, and replay of
  unacknowledged rows.
- **Store-and-forward**: a disk journal that keeps accepting rows while
  QuestDB is unreachable and survives process restarts.
- **UDP**: fire-and-forget ingestion for metrics where occasional loss is
  acceptable.

:::tip Legacy transports

The Node.js `Sender` class still speaks ILP over HTTP and TCP. This page
documents the recommended QWP path. For ILP, see
[ILP transports (legacy)](#ilp-transports-legacy) near the end of this page.

:::

## Requirements

- **`@questdb/nodejs-client` 5.0.0 or newer** for QWP. Earlier versions
  support ILP only.
- **Node.js 20.18.1 or newer**.
- **QuestDB 10.0.0 or newer**, which serves QWP on the HTTP port (`9000` by
  default) at `/write/v4` for ingestion and `/read/v1` for queries. If QuestDB
  is not running yet, see the [quick start](/docs/getting-started/quick-start/).

## Installation

```shell
npm install @questdb/nodejs-client
```

The package also installs with `yarn add` and `pnpm add`. It exports its
complete API from the package root, ships ES module and CommonJS builds, and
bundles TypeScript declarations. There are no other supported import paths.

The examples on this page are TypeScript ES modules with top-level `await`.
They also run as plain JavaScript once type annotations are removed.

## Quick start

Connect with one connect string, write two rows, and read them back:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  // Ingest: borrow a sender, add rows, and close() it to flush the rows and
  // return the sender to the pool. The underlying connection stays open.
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
  } finally {
    await sender.close();
  }

  // Query: borrow a query lease and iterate the result batches.
  // QuestDB applies ingested rows asynchronously, so on a first run this
  // query can fail with "table does not exist" or return no rows yet.
  // See "Read-after-write" below for the polling pattern.
  const lease = await db.borrowQuery();
  try {
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
2. `db.borrowSender()` leases a sender. Rows are staged locally until an
   auto-flush threshold is reached or the sender is flushed. `close()` on a
   borrowed sender flushes its rows and returns it to the pool.
3. `db.borrowQuery()` leases a query connection. `lease.query()` returns a
   query handle that is an async iterable of result batches. `batch.rows()`
   yields one array per row. `query.completion` resolves when the server
   finishes the query.
4. `db.close()` closes every pooled connection. Pooled senders publish any
   remaining rows and wait up to five seconds for QuestDB to acknowledge them.

The table was created automatically by the first row, so its designated
timestamp column is named `timestamp`. Timestamps come back as `bigint`
microseconds since the Unix epoch; see
[Reading result values](#reading-result-values) for every type.

### Read-after-write

When `flush()` resolves, the client has published the rows, but QuestDB may not
have received them yet. QuestDB acknowledges a batch once it has committed it
to its write-ahead log, and applies committed rows to the table
asynchronously. A query that runs right after
ingestion can therefore fail with `table does not exist` on a first run, or
succeed and return no rows. When your code must read its own writes, poll until
the rows appear, bounded by a deadline:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
  type QwpClient,
} from "@questdb/nodejs-client";

async function countRows(db: QwpClient, sql: string): Promise<number> {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(sql);
    let rows = 0;
    for await (const batch of query) rows += batch.rowCount;
    await query.completion;
    return rows;
  } finally {
    await lease.close();
  }
}

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sql = "SELECT * FROM trades WHERE symbol = 'ETH-USD' LIMIT 10";
  const deadline = Date.now() + 10_000;
  let rows = 0;
  while (rows === 0) {
    try {
      rows = await countRows(db, sql);
    } catch (error) {
      // The table may not exist yet: keep polling until the deadline.
      if (!(error instanceof QwpEgressQueryError) || Date.now() >= deadline) {
        throw error;
      }
    }
    if (rows === 0) {
      if (Date.now() >= deadline) throw new Error("rows not visible in time");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  console.log(`visible rows: ${rows}`);
} finally {
  await db.close();
}
```

Do not replace the poll with a fixed sleep: the apply latency varies with load.

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
| `close()` | `Promise<void>` | Reject new borrows, close idle connections, cancel active queries, and close the pools. Idempotent. |

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
such as `query_pool_max` or `compression`. Its fluent API covers the column
methods that also exist for ILP: `symbol`, `stringColumn`, `booleanColumn`,
`floatColumn` (DOUBLE), `intColumn` (LONG), `timestampColumn`, `arrayColumn`,
`decimalColumn`, and `decimalColumnText`. For the other QuestDB types (UUID,
IPv4, DATE, INT, and more), use a [compiled writer](#compiled-object-row-writers)
through `sender.writer()`, a pooled sender, or `connectQwpNodeSender()`, which
all expose every [column method](#column-methods).

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
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "buy")
    .doubleColumn("price", 2615.54)
    .doubleColumn("amount", 0.5)
    .uuidColumn("order_id", "9f1c96b2-54b8-4d85-bb24-e82c6f1ac120")
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
  `unknown configuration key: <key>`. Legacy ILP keys such as `retry_timeout`
  or `init_buf_size` fail with a hint that names the QWP replacement.
- **Values** end at `;`. Double a semicolon to include it in a value:
  `password=p;;ssw;;rd` sets the password to `p;ssw;rd`. The trailing `;` is
  optional.

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
second argument. The connect string is validated in full first; when both set
the same option, the typed value wins:

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
  egressSession: { queryTimeoutMs: 30_000 },
  // Egress-only routing and compression
  egress: { compression: "zstd" },
  // Pool sizes and timeouts
  pool: { senderPoolMax: 2, queryPoolMax: 8 },
});
await db.close();
```

The other sections are `webSocket` (connection settings shared by both
directions, such as `agent` or `connectTimeoutMs`) and `storeAndForward`
(journal settings, see [Store-and-forward](#store-and-forward)).

`Sender.fromConfig()` takes `{ log, agent, qwp }` as its second argument,
where `qwp` has the sections `webSocket`, `session` (the equivalent of
`ingressSession`), `sender`, and `udp`.

:::caution A typed `reconnect` object replaces the connect-string keys

`ingressSession.reconnect` (or `qwp.session.reconnect` on a `Sender`) replaces
the whole reconnect policy parsed from `reconnect_*` keys, and
`egressSession.reconnect` replaces the policy parsed from `failover*` keys.
Fields you leave out of the object take the built-in defaults, not the values
from the connect string. When you supply the object, for example to register
`onEvent`, set every bound you rely on in it, such as `maxDurationMs`.

:::

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

The `wss` schema enables TLS and verifies the server certificate against the
CA certificates bundled with Node.js, not the operating system's trust store. A
private CA installed only in the operating system is not trusted. To trust it,
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

Two deadlines bound connection setup: `connect_timeout` covers DNS and the
TCP/TLS connection, and `auth_timeout_ms` covers the upgrade and
authentication. Both default to 15 seconds, and `auth_timeout_ms` inherits
`connect_timeout` when only the latter is set. A timeout fails with
`QwpUpgradeError`, whose `timeoutPhase` is `connect` or `authentication`.

### Unsupported authentication paths

| Path | Status | Workaround |
|---|---|---|
| OIDC token acquisition or refresh | Not supported. The client does not talk to an identity provider and has no callback to refresh a token. | Obtain an access token from your identity provider, pass it as `token=...`, and create a new client before the token expires. See [OpenID Connect](/docs/security/oidc/). |
| Token rotation mid-session | Not supported. The credential is read once, when the client is created, and reused for every reconnect. | Close the client and create a new one with the new token. |
| Mutual TLS (client certificates) | Not supported. QuestDB does not negotiate client certificates. | Use token or basic authentication over `wss`. |
| ILP JWK authentication | Not available for QWP. `auth`, `jwk`, `token_x`, and `token_y` are rejected on `ws`/`wss`. | Use token or basic authentication. |

### Production example: TLS, token, and multiple hosts

A typical Enterprise deployment combines `wss`, a token, and several hosts:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");

const db = await connectQwpNodeClient(
  "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;" +
    `token=${token};` +
    "tls_roots=/etc/ssl/questdb-ca.pem;",
  {
    // Queries run on replicas only (see "Multiple endpoints"). Set target
    // here: in the connect string it also applies to ingestion.
    egress: { target: "replica" },
  },
);
try {
  // borrow senders and query leases
} finally {
  await db.close();
}
```

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
  } finally {
    // Flushes the rows and returns the sender. Does not wait for the ACK.
    await sender.close();
  }
} finally {
  await db.close();
}
```

A long-running producer can keep its borrow for its whole lifetime and call
`flush()` between batches. Size `sender_pool_max` to the number of producers
that hold a sender at the same time.

:::note Pooled sender close semantics

`close()` on a borrowed sender flushes completed rows, discards an unfinished
row with a warning, and returns the sender to the pool. It does not close the
WebSocket and does not wait for QuestDB to acknowledge the rows. To confirm
delivery before returning the sender, use
[`flushAndGetSequence()` and `waitForAcknowledged()`](#awaiting-acknowledgements).

When a borrowed sender's `close()` fails, the pool discards that sender and
opens a new one for the next borrow. Because QuestDB reports rejected batches
asynchronously, a sender can fail after its `close()` already succeeded: the
error then surfaces on the `flush()` or `close()` of the next borrower, and the
pool replaces the sender after that. See [Ingestion errors](#ingestion-errors).

:::

### Borrowing a query lease

A query lease runs one query at a time. For concurrent queries, borrow one lease
per query, up to `query_pool_max`:

```typescript
import { connectQwpNodeClient, type QwpQueryLease } from "@questdb/nodejs-client";

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

Starting a second query on a lease while one is still active throws
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
| `max_lifetime_ms` | `1800000` | Age at which an idle connection is recycled. `0` disables recycling. |
| `housekeeper_interval_ms` | `5000` | How often the housekeeper checks for idle and over-age connections. Minimum `100`. |
| `query_close_timeout_ms` | `5000` | How long returning a lease with an active query waits for the cancellation to drain before discarding the connection. |
| `lazy_connect` | `off` | Start without connecting. See below. |

The typed equivalents live in the `pool` section of the second argument
(`senderPoolMin`, `acquireTimeoutMs`, `housekeepingIntervalMs`, and so on).
When creating a new pooled connection fails, the borrow rejects with
`QwpPoolResourceError`, whose `cause` holds the connection error.

### Starting while QuestDB is down

`connectQwpNodeClient()` fails fast when QuestDB is unreachable. Set
`lazy_connect=on` to start regardless: senders connect in the background and
buffer rows until QuestDB is reachable, in memory or, with `sf_dir`, in the
[store-and-forward](#store-and-forward) journal. The query pool stays empty
until the first query.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// Resolves immediately, even if QuestDB is not running yet.
const db = await connectQwpNodeClient("ws::addr=localhost:9000;lazy_connect=on;");
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
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

`lazy_connect=on` forces `query_pool_min=0` and `initial_connect_retry=async`,
and rejects an explicit conflicting value. Setting `initial_connect_retry=async`
without `lazy_connect` is not enough: the query pool still connects at startup,
so `connectQwpNodeClient()` rejects with `QwpPoolResourceError`. A query
borrowed while QuestDB is still down rejects with `QwpPoolResourceError` too.

## Data ingestion

### General usage pattern

A sender is not safe for concurrent producers: the row in progress is shared
state, so borrow one sender per producer (see [Concurrency](#concurrency)).

1. Borrow a sender with `db.borrowSender()`, or create a
   [standalone `Sender`](#standalone-sender).
2. Call `table(name)` to start a row.
3. Add values with the [column methods](#column-methods), such as
   `symbol(name, value)` and `doubleColumn(name, value)`. To store a NULL, pass
   `null` or `undefined`, or skip the column (see [Null values](#null-values)).
4. Close the row with `at(timestamp, unit)` or `atNow()`, and `await` the
   returned promise. It rejects if an auto-flush triggered by the row fails.
5. Repeat from step 2, and call `flush()` to send staged rows.
6. `close()` the sender when done.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const sender = await db.borrowSender();
  try {
    try {
      await sender
        .table("trades")
        .symbol("symbol", "ETH-USD")
        .symbol("side", "buy")
        .doubleColumn("price", 2615.54)
        .doubleColumn("amount", 0.25)
        .at(Date.now(), "ms");
    } catch (error) {
      // An invalid value throws a TypeError or RangeError. The row in progress
      // is discarded; rows completed earlier stay staged.
      console.error("row rejected:", error);
    }
    await sender.flush();
  } finally {
    await sender.close();
  }
} finally {
  await db.close();
}
```

Tables and columns are created automatically, with the column types listed
below. Table and column names are validated locally with QuestDB's rules
(at most 127 UTF-8 bytes by default, see `max_name_len`), and column names are
case-insensitive: the first spelling used is kept.

When a column method or `at()` rejects a value, the sender discards the whole
row in progress, including its table, so a half-built row never reaches
QuestDB. The next row must start with `table()` again; a column method called
before that throws `table name must be set before adding columns`.
`cancelRow()` discards a row in progress without an error, and `reset()` also
drops every row staged since the last flush.

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
| `timestampColumn(name, value, unit)` | TIMESTAMP, or TIMESTAMP_NS with unit `"ns"` | Integer `number` or `bigint`. Unit `"us"` (default), `"ms"`, or `"ns"`; `"ns"` requires a `bigint` |
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
| `longArrayColumn(name, value)` | LONG[] | Encoded for protocol parity, but current QuestDB servers reject LONG array ingestion |

Names that differ from what you might expect:

- `floatColumn()` and `intColumn()` write 64-bit DOUBLE and LONG. Use
  `float32Column()` and `int32Column()` for FLOAT and INT.
- There is no `nullColumn()` or `setNull()`. Pass `null` or `undefined`, or
  skip the column.
- Arrays use `arrayColumn()`. `doubleArray()` is a
  [compiled writer](#compiled-object-row-writers) field, not a sender method.
- `geohashColumn()` takes raw bits only. Base-32 geohash text is accepted by a
  compiled writer's `geohash()` field.

The standalone `Sender` class exposes only `symbol`, `stringColumn`,
`booleanColumn`, `floatColumn`, `intColumn`, `timestampColumn`, `arrayColumn`,
`decimalColumn`, and `decimalColumnText`. Its `writer()` method supports every
type.

A column's type is fixed by the first value a sender stages for it. Writing a
different type to the same column later throws
`column type mismatch for '<name>'`. If the table already exists with a
different column type, QuestDB rejects the batch asynchronously; see
[Ingestion errors](#ingestion-errors).

### Null values

To store NULL, pass `null` or `undefined` to any column method, or leave the
column out of the row. All three have the same effect:

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
- Rows that already exist in a batch, or rows added later, get NULL for any
  column they do not set.
- INT, LONG, and DATE reserve their minimum values as NULL: writing
  `-2147483648` to INT or `-9223372036854775808n` to LONG or DATE stores NULL.
  IPv4 reserves `0.0.0.0` for NULL too, but `ipv4Column()` rejects it with a
  `RangeError` and discards the row: pass `null` to store an IPv4 NULL.
- A row where every value is nullish is still sent over WebSocket and stored
  with NULL in every column. To drop such a row instead, call `cancelRow()`
  before closing it. Over UDP, `atNow()` rejects such a row while the sender
  knows no non-null column for the table.

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
(the default), `"ms"`, or `"ns"`. Nanoseconds require a `bigint`, because epoch
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
with `long arrays are not supported, only double arrays`. Query results return
arrays as `{ dimensions, values }`; see
[Reading result values](#reading-result-values).

### Decimals

Create decimal columns ahead of time with the precision you need. QWP can
create them automatically, but it picks the maximum precision of the wire
width (18, 38, or 76 digits). See
[decimal data type](/docs/query/datatypes/decimal/#creating-tables-with-decimals).

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

- `decimalColumnText()` takes a decimal string, scientific notation included
  (`"1.5e-3"`), and preserves the literal's scale, including trailing zeros.
  Passing a `number` works, but JavaScript drops trailing zeros when formatting.
- `decimalColumn(name, unscaled, scale)` takes the unscaled value as a `bigint`
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

    // Arrays, iterables, and async iterables. Absent fields store NULL.
    await trades.rows([
      { symbol: "BTC-USD", side: "buy", price: 39269.98, timestamp: Date.now() },
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
| `designatedTimestamp(unit)` | designated TIMESTAMP | As `timestamp(unit)`, required in every row. At most one per schema |
| `date()` | DATE | Epoch milliseconds |
| `binary()` | BINARY | `Uint8Array` |
| `uuid()` | UUID | Canonical UUID `string`, 16 big-endian bytes, or `{ low, high }` |
| `long256()` | LONG256 | Unsigned 256-bit `bigint`, `0x` hex text, four little-endian words, or `{ words }` |
| `ipv4()` | IPv4 | Dotted-quad `string` or packed `number`. `0.0.0.0` is rejected; omit the field for NULL |
| `geohash(precisionBits)` | GEOHASH | Raw bits, base-32 text of `precisionBits / 5` characters, or `{ bits, precisionBits }` |
| `decimal64(scale)`, `decimal128(scale)`, `decimal256(scale)` | DECIMAL | Unscaled `bigint`, decimal text, `number`, or `{ unscaled, scale }` |
| `doubleArray()` | DOUBLE[] | Nested `number` arrays, or `{ dimensions, values }` |
| `longArray()` | LONG[] | Encoded for parity; current servers reject LONG arrays |

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
| Time since the last flush | 100 ms | `auto_flush_interval` | `autoFlushIntervalMs` |
| Estimated buffered bytes | Disabled | `auto_flush_bytes` | `autoFlushBytes` |

The interval is checked when a row is added. There is no background timer, so
call `flush()` after a burst of rows, or rows staged before an idle period wait
for the next row. `auto_flush=off` disables all triggers. `auto_flush_bytes` is
clamped to 90% of the batch size the server advertises.

What `flush()` waits for depends on the ingestion mode:

| Mode | Enabled by | `flush()` resolves when | During an outage |
|---|---|---|---|
| Memory (default) | Neither of the others | The batch is written to the WebSocket, or queued for replay | `flush()` and auto-flushing `at()` wait for the reconnect, up to `reconnect_max_duration_millis` (5 minutes) |
| Background memory | `initial_connect_retry=async`, or `lazy_connect=on` on the pooled client | The batch is added to the in-memory replay queue | Rows keep being accepted until the queue is full |
| Store-and-forward | `sf_dir` | The batch is appended to the disk journal | Rows keep being accepted until the journal is full |

In every mode, `flush()` does not wait for QuestDB to acknowledge the rows,
unless you set `awaitServerAck`. Unacknowledged batches are kept and replayed
after a reconnect. See [Awaiting acknowledgements](#awaiting-acknowledgements)
and [Store-and-forward](#store-and-forward).

**Backpressure.** The in-memory replay queue is capped at 128 MiB. When it is
full, publishing waits up to 30 seconds for acknowledgements to free space,
then rejects with `QwpMemoryReplayAppendTimeoutError`. Tune the cap with
`sf_max_total_bytes` and the wait with `sf_append_deadline_millis`; without
`sf_dir` they size the memory queue. Watch `sender.metrics.ingress`
(`memoryReplayUsedBytes`, `totalMemoryReplayBackpressureStalls`) to detect
backpressure before it blocks. A single row larger than the server's batch
limit is rejected before it is sent, with `QwpBatchTooLargeError`.

**Closing.** `close()` on a standalone sender publishes completed rows and waits
up to `close_flush_timeout_millis` (5 seconds by default) for their
acknowledgement. `0` or a negative value skips the wait. An unfinished row is
discarded with a warning. On a borrowed sender, `close()` flushes and returns
the sender to the pool without waiting; see
[Borrowing a sender](#borrowing-a-sender).

If the acknowledgement does not arrive in time, `close()` on a standalone
sender rejects with `QwpSenderCloseTimeoutError`. Its `targetSequence` is the
last published sequence and its `acknowledgedSequence` is how far QuestDB
acknowledged. Without `sf_dir`, the unacknowledged rows are lost. With `sf_dir`,
they stay in the journal for the next sender on that directory. A rejection in
`finally` replaces any error the `try` block threw, so catch it there when that
matters:

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

    const sequence = await sender.flushAndGetSequence();
    // Rejects with the server's error if QuestDB rejected the batch.
    await sender.waitForAcknowledged(sequence, 10_000);
  } catch (error) {
    if (error instanceof QwpIngressAckTimeoutError) {
      // Not acknowledged in time. The rows are still pending, not lost.
      console.warn("ACK timeout at", error.acknowledgedSequence);
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
| `flushAndGetSequence()` | Publishes staged rows and resolves with the highest sequence (`bigint`) this call published, or `-1n` when there was nothing to publish. |
| `waitForAcknowledged(sequence, timeoutMs?)` | Resolves when the watermark reaches `sequence`. Rejects with `QwpIngressAckTimeoutError` on timeout, without closing the sender, or with the server's rejection. |
| `acknowledgedSequence` | The highest acknowledged sequence, or `-1n`. |
| `publishedSequence` | The highest published sequence, or `-1n`. |

To make every `flush()` wait for its acknowledgement, set `awaitServerAck`:
`connectQwpNodeClient(conf, { sender: { awaitServerAck: true } })`, or
`{ qwp: { sender: { awaitServerAck: true } } }` for a standalone `Sender`. A
server rejection then rejects `flush()` itself, with `QwpIngressNackError`.

Acknowledgement is not required for delivery: unacknowledged batches are
replayed after a reconnect, and a standalone sender waits for them on
`close()`. Wait for acknowledgements when your application must know that
QuestDB accepted the rows, for example before committing a source offset. If
the process exits before the acknowledgement, rows still in memory are lost;
use [store-and-forward](#store-and-forward) to keep them across restarts.

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
- `flush()` ends the transaction: it publishes the final batch, and QuestDB
  commits the transaction when it processes that batch. Pooled senders also
  have `commit()`, an alias of `flush()`. The typed option is
  `transactional: true`.
- Closing a standalone sender without calling `flush()` rolls the open
  transaction back, with a warning.
- Returning a borrowed sender with `close()` commits instead, because `close()`
  flushes before returning the sender to the pool. `reset()` does not prevent
  this: it drops only rows staged since the last flush, not the batches already
  sent in the transaction. Use a standalone sender when you may need to abandon
  a transaction.
- QuestDB does not acknowledge the deferred batches until the commit, so
  `waitForAcknowledged()` for a sequence inside an open transaction waits for
  the commit.

### Store-and-forward

In the default memory mode, unacknowledged rows are lost if the process
exits. Setting `sf_dir` turns on a disk journal instead: every batch is
appended to the journal before it is sent, a background drainer sends it in
order, and acknowledged segments are deleted.

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;" +
    "sf_dir=/var/lib/my-service/qdb-sf;sender_id=ingest-a;" +
    "sf_durability=append;lazy_connect=on;",
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
until `sf_max_total_bytes` (10 GiB) is full. It retries the connection
indefinitely once it has connected, and a new sender opened on the same
directory replays what the previous process left behind, once it can take over
the directory's lock (see Lock recovery below).

- **Layout.** A standalone `Sender` journals into `<sf_dir>/<sender_id>`. A
  pooled client uses one directory per pooled sender:
  `<sf_dir>/<sender_id>-0`, `<sf_dir>/<sender_id>-1`, and so on. `sender_id`
  defaults to `default` and may contain letters, digits, `_`, and `-`. Give
  every process its own `sender_id`; a second live process on the same
  directory fails with `QwpReplayStoreLockedError`.
- **Durability.** `sf_durability=memory` (the connect-string default) relies on
  the operating system to write the journal, which survives a process crash but
  not a power loss. `periodic` checkpoints in the background every
  `sf_sync_interval_millis` (5 seconds). `append` makes every append durable
  before `flush()` resolves.
- **Backpressure.** When the journal is full, publishing waits up to
  `sf_append_deadline_millis` (30 seconds) for acknowledgements to free space,
  then rejects with `QwpReplayStoreAppendTimeoutError`.
- **Startup.** `lazy_connect=on` lets the pooled client start while QuestDB is
  down, as in the example above. `initial_connect_retry=async` alone is not
  enough for the pooled client, because its query pool still connects at
  startup. A standalone `Sender` needs only `initial_connect_retry=async`. With
  the default `off`, the first connection must succeed.
- **Lock recovery.** The Node.js client locks a journal directory with a
  `.lock.owner` directory inside it, which records the owner's host name and
  process ID, instead of an operating-system file lock. After a crash, a new
  sender takes over automatically only when the owner ran on the same host and
  its process ID is no longer in use. Otherwise the new sender fails with
  `QwpReplayStoreLockedError`. This is common in containers: the application
  usually runs as process ID 1, which is in use again after a restart, and a
  replacement container usually has a different host name. Once you are sure
  the previous process has exited, delete `.lock.owner` from the journal
  directory (`<sf_dir>/<sender_id>`, or `<sf_dir>/<sender_id>-<n>` for a pooled
  sender) and start the sender again.
- **Rejected batches.** A batch that QuestDB rejects terminally, such as one
  with a value of the wrong type for an existing column, stays in the journal.
  Every new sender on that directory, including the pool's replacement for a
  failed pooled sender, sends it again and fails the same way. See
  [Ingestion errors](#ingestion-errors) for recovery.
- **Orphans.** With `drain_orphans=on`, a sender also adopts and drains
  journals left under the same `sf_dir` by processes that crashed, up to
  `max_background_drainers` (4) at a time.

A frame appended to the journal but not acknowledged before a crash is sent
again, so delivery is at least once:

<SfDedupWarning />

Create the table with deduplication before ingesting. The upsert keys must
include the designated timestamp and identify a row: rows with equal key values
replace each other.

```questdb-sql
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol, side);
```

For an existing table, run
`ALTER TABLE trades DEDUP ENABLE UPSERT KEYS(timestamp, symbol, side);`.
Deduplication recognizes a replayed row only when it carries the same
designated timestamp, so pass event timestamps to `at()` instead of using
`atNow()`. See [Deduplication](/docs/concepts/deduplication/) for choosing keys.

:::warning Do not share a journal directory with a Java client

The Node.js client locks journal directories with its own lock files, which the
Java client does not see. Never point a running Java client and a running
Node.js client at the same directory. The journal format is shared, so a
directory written by one can be opened by the other after the first has
closed it.

:::

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
`waitForAcknowledged()` confirms durable upload:

```text
wss::addr=db.example.com:9000;token=YOUR_TOKEN;request_durable_ack=on;
```

To make every flush wait for durability, add the typed option
`{ sender: { awaitDurableAck: true } }`. If the server does not support durable
acknowledgement, connecting fails with `QwpDurableAckUnavailableError`.

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
network path; a row that cannot fit a datagram fails with
`QwpUdpDatagramTooLargeError`.
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
    console.log("rows:", completion.kind === "result-end" && completion.totalRows);
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

`lease.query(sql, options)` sends the query and resolves with a query handle.
Iterating it with `for await` yields `QwpResultBatch` objects, and the handle's
`completion` promise settles when the query ends:

| Query option | Default | Purpose |
|---|---|---|
| `binds` | none | Callback that sets the `$1`, `$2`, ... parameters. See [Bind parameters](#bind-parameters). |
| `timeoutMs` | session `queryTimeoutMs` (none) | Deadline that cancels the query. It covers the whole query, including a re-execution after failover. `0` disables it. |
| `initialCredit` | session value (`0`, unbounded) | Flow-control window in bytes. See [Flow control](#flow-control). |
| `autoCredit` | `true` | Replenish the credit window as batches are consumed. |
| `resetDictionary` | `false` | Ask the server to reset its symbol dictionary for this connection first. |

Iteration and `completion` reject with the same error when the query fails.
Consume the result through `for await`, or `await query.completion` directly
for statements that return no rows.

A `QwpResultBatch` has:

- `rowCount` and `columns`: an array of `{ name, type, values, scale?, precisionBits? }`,
  where `values` holds one entry per row and `type` is the numeric QWP type
  code (compare it with the exported `QWP_COLUMN_TYPE` constants).
- `rows()`: a generator that yields one array of values per row.
- `get(rowIndex, columnIndex)`: one value.

Batch objects stay valid after iteration moves on, so you can keep them.

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
| LONG256 | `{ words: [bigint, bigint, bigint, bigint] }`, least significant word first |
| GEOHASH | `{ bits: bigint, precisionBits: number }` |
| DECIMAL | `{ unscaled: bigint, scale: number }`: the value is `unscaled / 10^scale` |
| DOUBLE[], DOUBLE[][], ... | `{ dimensions: number[], values: number[] }` with values in row-major order |
| NULL of any type | `null` |

INTERVAL values cannot be returned over QWP: the server rejects such a query
with `unsupported column type INTERVAL`. Select the bounds with
`interval_start()` and `interval_end()`, which return timestamps, or cast the
interval with `::varchar`.

Converting common types:

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

console.log(toDate(1723000000000000n).toISOString());
console.log(uuidToString({ low: 13485158461794337056n, high: 11465204444048149893n }));
console.log(ipv4ToString(-1062731775));
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
| `setDate(index, millis)` | DATE |
| `setTimestampMicros(index, micros)` | TIMESTAMP |
| `setTimestampNanos(index, nanos)` | TIMESTAMP_NS |
| `setVarchar(index, value)` | VARCHAR, STRING, and SYMBOL comparisons. `null` binds NULL |
| `setUuid(index, value)` or `setUuid(index, low, high)` | UUID, as a canonical string or two 64-bit halves. `null` binds NULL |
| `setLong256(index, w0, w1, w2, w3)` | LONG256, least significant word first |
| `setGeohash(index, precisionBits, value)` | GEOHASH |
| `setDecimal64(index, scale, unscaled)` | DECIMAL64 |
| `setDecimal128(index, scale, low, high)` | DECIMAL128 |
| `setDecimal256(index, scale, w0, w1, w2, w3)` | DECIMAL256 |
| `setNull(index, type)` | A typed NULL, with `type` from `QWP_COLUMN_TYPE` |
| `setNullDecimal64/128/256(index, scale)`, `setNullGeohash(index, precisionBits)` | NULL decimals and geohashes, which carry a scale or precision |

There is no setter for BINARY, IPv4, or arrays. Bind IPv4 as a string and cast
it in SQL (`WHERE ip = $1::ipv4` with `setVarchar`), and pass array values as
SQL literals.

### DDL and DML statements

`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, and `UPDATE` go through the
same `query()` call. They produce no batches, and `completion` resolves with
`kind: "exec-done"` instead of `kind: "result-end"`:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
try {
  const lease = await db.borrowQuery();
  try {
    const statements = [
      "CREATE TABLE IF NOT EXISTS fills (" +
        "timestamp TIMESTAMP, symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE" +
        ") TIMESTAMP(timestamp) PARTITION BY DAY",
      "INSERT INTO fills VALUES (now(), 'ETH-USD', 'buy', 2615.54, 0.5)",
      "UPDATE fills SET amount = 0.6 WHERE symbol = 'ETH-USD'",
    ];
    for (const sql of statements) {
      const statement = await lease.query(sql);
      const completion = await statement.completion;
      if (completion.kind === "exec-done") {
        console.log(`${sql.slice(0, 20)}...: ${completion.rowsAffected} rows`);
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
| `"exec-done"` | DDL and DML | `rowsAffected` (`bigint`, `0` for DDL), `operationType` (QuestDB's numeric statement type) |

Statements run in order on one lease, because each is awaited before the next
starts, so a `CREATE TABLE` is complete before the `INSERT` that follows it.

### Cancellation and timeouts

A query ends early in four ways:

- **Deadline.** Set a default with `egressSession: { queryTimeoutMs }`, or per
  query with `timeoutMs`. On expiry, iteration and `completion` reject with
  `QwpEgressQueryTimeoutError` and the client sends a cancel to QuestDB.
- **Cancel.** `await query.cancel()` asks QuestDB to stop. Iteration and
  `completion` reject with `QwpEgressQueryError` whose `status` is `0x0a`
  (CANCELLED).
- **Leaving the loop.** `break`, `return`, or an exception inside `for await`
  cancels the query, and `completion` rejects with
  `QwpEgressQueryAbandonedError`.
- **Waiting without cancelling.** `await query.awaitCompletion(timeoutMs)`
  resolves `false` when the wait times out and leaves the query running.
  `query.isDone()` reports whether the query has ended.

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
      { timeoutMs: 5_000 },
    );
    for await (const batch of query) {
      console.log(batch.rowCount);
    }
  } catch (error) {
    if (!(error instanceof QwpEgressQueryTimeoutError)) throw error;
    console.warn(`query ${error.requestId} timed out after ${error.timeoutMs} ms`);
  } finally {
    // Waits for the cancellation to drain before the lease is reused.
    await lease.close();
  }
} finally {
  await db.close();
}
```

After a query ends early, its connection stays busy until QuestDB confirms the
cancellation, and another `query()` on the same lease throws
`a QWP query is already active on this connection`. Return the lease with
`close()` and borrow a new one for the next query. `close()` waits for the
cancellation, up to `query_close_timeout_ms` (5 seconds), and discards the
connection if QuestDB does not confirm in time.

### Flow control

By default QuestDB streams results as fast as the network allows, and the
client decodes up to four batches ahead of your loop (`buffer_pool_size`). To
bound how much the server sends ahead, set a byte-credit window with
`initial_credit` in the connect string or `initialCredit` per query:

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
rows in each batch, set `max_batch_rows` (1 to 1,048,576).

### Zero-copy result views

`query()` materializes every value into JavaScript arrays. For hot paths,
`queryViews()` hands a reusable view of each batch to a callback, and reads
values straight from the received bytes:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
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
        // Row-major access reuses one row object for every row.
        batch.forEachRow((r) => void r.getSymbol(1));
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

The callback is awaited before more credit is granted. The batch, its column
views, and any `Uint8Array` returned from them are valid only until the
callback returns: copy a byte view with `.slice()`, or call
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
      const status = error.serverStatusByte?.toString(16);
      console.error(
        `rejected [${error.category}, policy=${error.appliedPolicy}, ` +
          `status=0x${status}, frames=${error.fromFsn}..${error.toFsn}]: ` +
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
    const sequence = await sender.flushAndGetSequence();
    await sender.waitForAcknowledged(sequence, 10_000);
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
[Flushing](#flushing).

`QwpSenderError` fields:

| Field | Type | Meaning |
|---|---|---|
| `category` | `string` | `schema-mismatch`, `parse-error`, `security-error`, `write-error`, `internal-error`, `not-writable`, `dictionary-gap`, `cancelled`, `limit-exceeded`, `protocol-violation`, `data-loss`, or `unknown`. Branch on this field. |
| `appliedPolicy` | `string` | What the client did: `retriable` (reconnect and resend), `retriable-other` (resend to another endpoint), `terminal` (the sender stopped), or `abandoned` (journaled data was quarantined). |
| `serverStatusByte` | `number` | The raw QWP status code, for example `0x03` for a schema mismatch. Absent for client-side errors. |
| `serverMessage` | `string` | QuestDB's error text, for example `cannot parse DOUBLE from string [value=abc, column=price]`. |
| `fromFsn`, `toFsn` | `bigint` | The rejected frame sequence range, in the same numbering as `flushAndGetSequence()`. |
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

A retriable rejection is resent. If the same batch keeps being rejected, after
`max_frame_rejections` (4) attempts spanning at least
`poison_min_escalation_window_millis` (5 minutes), the sender stops as for a
terminal error. The six `on_*_error` connect-string keys are accepted but not
applied by this client.

**After a terminal error**, the sender is permanently failed.
`waitForAcknowledged()` for the rejected batch rejects with
`QwpIngressNackError`, and every later `flush()` or `close()` rejects with
`QwpReplayRejectedError`, whose `status` and message repeat the server's. Close
the sender and create a new one. A pooled sender is replaced automatically
after the `close()` that reports the error. What happens to the rejected batch
depends on the mode:

- **Without store-and-forward**, the failed sender's unacknowledged batches,
  including the rejected one, are discarded with it, and the new sender starts
  empty.
- **With store-and-forward**, the rejected batch stays in the journal. Every
  new sender on that directory, including the pool's replacement sender, sends
  it again and fails the same way. Fix the cause so that QuestDB accepts the
  batch, for example by adjusting the table schema, or stop the process and
  move the journal directory aside. Moving it aside discards every
  unacknowledged batch in it, not only the rejected one.

Handling notes:

- **Message stability.** `serverMessage` is free-form English text from the
  server. Its wording can change between releases: branch on `category`, not on
  the text.
- **Sensitive data.** Server messages can contain column names and values.
  Treat them as untrusted input, and redact them before sending them to
  third-party error trackers or showing them to end users.
- **Correlation.** There is no server-side request ID. Correlate with the frame
  sequence range, `tableName`, and `detectedAtMs`.

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
| `0x03` | SCHEMA_MISMATCH | A bind type is incompatible with its placeholder |
| `0x05` | PARSE_ERROR | SQL syntax error, unknown table or column |
| `0x06` | INTERNAL_ERROR | Server-side execution failure |
| `0x08` | SECURITY_ERROR | Missing permission |
| `0x0a` | CANCELLED | The query was cancelled with `cancel()` |
| `0x0b` | LIMIT_EXCEEDED | A protocol limit was exceeded |

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

An authentication failure (HTTP 401 or 403) ends the connection attempt for
the whole endpoint list, because a credential rejected by one node is wrong for
all of them, and it is not retried. The exception is a store-and-forward sender
that has connected before: it keeps retrying, so that a rotated credential
cannot strand its journal. Endpoints in error messages have any embedded
credentials removed.

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
`replica`. It is a strict filter, not a preference: with `replica`, queries
never fall back to the primary, and they fail when no replica is reachable,
including against a single open source server. Because the pooled client opens
a query connection at startup, `connectQwpNodeClient()` then rejects too, with
`QwpPoolResourceError` caused by `QwpRoleMismatchError`. Set `query_pool_min=0`
to start without a replica. `zone` prefers endpoints in the same zone.

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
| `reconnect_max_duration_millis` | `300000` (5 minutes) | Budget for one outage in memory mode. `0` removes the limit. |
| `initial_connect_retry` | `off` | Whether the first connection retries: `off` fails fast, `on` (or `sync`) retries within the budget, `async` connects in the background. |

Whether the sender gives up depends on the mode (see [Flushing](#flushing)):

- **Memory mode** retries for up to `reconnect_max_duration_millis` per outage.
  When the budget runs out, the sender fails permanently with
  `QwpReconnectExhaustedError`, and its unsent rows are lost.
- **Background memory mode** (`initial_connect_retry=async`) and
  **store-and-forward** (`sf_dir`) retry indefinitely.

Setting any `reconnect_*` key also makes the first connection retry within the
budget, as if `initial_connect_retry=on`. Set `initial_connect_retry=off`
explicitly to keep a fail-fast start.

Replay after a reconnect is at least once: a batch that QuestDB committed just
before the connection dropped is sent again.

<SfDedupWarning />

### Query failover

If the connection fails during a query, the client reconnects, to another
endpoint when there is one, and runs the query again from the start:

| Key | Default | Purpose |
|---|---|---|
| `failover` | `on` | Set `off` to fail the query instead of retrying. |
| `failover_max_attempts` | `8` | Connection attempts per failure. |
| `failover_backoff_initial_ms` | `50` | First retry delay. |
| `failover_backoff_max_ms` | `1000` | Longest delay between retries. |
| `failover_max_duration_ms` | `30000` | Time budget per failure. |

When the budget runs out, the query rejects with `QwpReconnectExhaustedError`.
A `QwpEgressQueryError` from the server is a query result and never triggers
failover.

:::warning Clear partial results when a query restarts

A re-executed query starts again from the first row. Batches that were queued
but not yet consumed are discarded for you, but rows your loop already
processed are delivered again. If your code accumulates rows, clear them when
the query restarts; otherwise it sees the first part of the result twice.

:::

Detect the restart inside the loop. Every batch has a `batchSequence` that
starts at `0n`, and a re-executed query starts again at `0n`. The check works
for each query on its own, so it also covers concurrent queries on separate
leases:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=db-a.example.com:9000,db-b.example.com:9000;",
);
try {
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query("SELECT * FROM trades LIMIT 100000", {
      // The deadline covers the whole query, including a re-execution.
      timeoutMs: 30_000,
    });
    const rows: (readonly unknown[])[] = [];
    for await (const batch of query) {
      // Sequence 0 starts the result, both initially and after a failover.
      if (batch.batchSequence === 0n) rows.length = 0;
      for (const row of batch.rows()) rows.push(row);
    }
    await query.completion;
    console.log(`${rows.length} rows`);
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

To be notified of a restart, set `egressSession.onReplayReset` in the second
argument of `connectQwpNodeClient()`. It runs before the first replayed batch
is delivered, and its event has `requestId`, `endpoint`, `previousEndpoint`,
`serverInfo`, and `cause`. The `requestId` matches `query.requestId`, but
request IDs are numbered per connection and every lease of a pooled client
shares the callback, so the event cannot tell concurrent queries apart. Use it
for logging, and the sequence check above to reset results.

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
  ingressSession: { reconnect: { onEvent } },
  egressSession: { reconnect: { onEvent } },
});
await db.close();
```

Supplying `egressSession.reconnect`, like setting any `failover*` key, also
makes opening a query connection retry within the failover budget, instead of
failing on the first error.

| Kind | Meaning |
|---|---|
| `connected` | The first connection succeeded. |
| `reconnecting` | The active connection was lost. `cause` holds the error. |
| `attempt-failed` | One connection attempt failed. The client keeps trying. |
| `reconnected` | Reconnected to the same endpoint. |
| `failed-over` | Reconnected to a different endpoint. `previousEndpoint` holds the old one. |
| `durable-ack-unavailable` | A store-and-forward sender is waiting for an endpoint that supports durable acknowledgement. |
| `durable-ack-persistent-failure` | An orphan drainer gave up waiting for durable acknowledgement support. |
| `primary-unavailable` | No reachable endpoint can currently accept writes. |

`reconnected` and `failed-over` are mutually exclusive: code that tracks the
current node must handle both. Neither `attempt-failed` nor
`primary-unavailable` is terminal: the client keeps retrying until its budget
runs out.

For ingestion, `ingressSession` also accepts `onProgress`, for published,
acknowledged, and durably acknowledged sequences, and `onError`, for session
errors. `sender.metrics` returns a snapshot of the sender's counters, including
`metrics.ingress` with the replay queue, reconnect, and notification counters.

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
work out of them.

## Configuration reference

The [connect string reference](/docs/connect/clients/connect-string/) documents
every key. The Node.js client's defaults and deviations:

| Key | Default | Notes |
|---|---|---|
| `addr` | required | Comma-separated or repeated for failover. Port defaults to `9000`. |
| `username`, `password`, `token` | none | Basic or bearer authentication. |
| `tls_verify`, `tls_roots` | `on`, Node.js CA bundle | `wss` only. `tls_roots` must be PEM. `tls_roots_password` is rejected. |
| `connect_timeout`, `auth_timeout_ms` | `15000` | TCP/TLS connection and upgrade deadlines, in milliseconds. |
| `auto_flush` | `on` | Master switch for the three triggers. |
| `auto_flush_rows` | `1000` | `0` disables. `off` is rejected. |
| `auto_flush_interval` | `100` | Milliseconds. `0` disables. `off` is rejected. |
| `auto_flush_bytes` | disabled | Size, or `off`. |
| `close_flush_timeout_millis` | `5000` | ACK wait in a standalone sender's `close()`. |
| `transaction` | `off` | Keep auto-flushed batches in an open transaction until `flush()`. |
| `request_durable_ack` | `off` | Enterprise. |
| `max_name_len` | `127` | Maximum table and column name length, in UTF-8 bytes. |
| `reconnect_initial_backoff_millis`, `reconnect_max_backoff_millis` | `100`, `5000` | Ingestion reconnect backoff. |
| `reconnect_max_duration_millis` | `300000` | Ingestion budget per outage in memory mode. `0` removes it. |
| `initial_connect_retry` | `off` | `off`, `on`/`sync`, or `async`. |
| `sf_dir`, `sender_id` | none, `default` | Store-and-forward journal location. |
| `sf_durability` | `memory` | `memory`, `periodic`, or `append`. |
| `sf_max_total_bytes` | `10g` with `sf_dir`, `128m` without | Journal or memory queue cap. |
| `sf_max_segment_bytes` | `4m` | Journal segment size, which also caps a batch. |
| `sf_append_deadline_millis` | `30000` | How long a full journal or queue blocks publishing. |
| `drain_orphans`, `max_background_drainers` | `off`, `4` | Adopt journals left by crashed processes. |
| `target`, `zone` | `any`, none | Endpoint role and zone preference. Apply to ingestion too. |
| `failover`, `failover_max_attempts`, `failover_max_duration_ms` | `on`, `8`, `30000` | Query failover. |
| `compression`, `compression_level` | `raw`, `1` | Query result compression. |
| `initial_credit`, `buffer_pool_size`, `max_batch_rows` | `0`, `4`, server default | Query flow control. |
| `client_id` | `typescript/<version>` | Sent to the server for diagnostics. |
| Pool keys | see [Pool settings](#pool-settings) | Applied by the pooled client only. |

The
[API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
covers every type and option. The
[QWP guide](https://github.com/questdb/nodejs-questdb-client/blob/main/QWP.md)
in the client repository describes the delivery semantics in depth.

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
| Rows staged at `close()` | Lost unless flushed | Published, then acknowledged within 5 seconds |
| Reconnect and replay | Retries one request for `retry_timeout` | Automatic, with replay of unacknowledged batches |
| Store-and-forward, querying, pooling | Not available | Available |
| Column types | ILP types | Every QuestDB type |

Legacy keys such as `retry_timeout`, `request_timeout`, `init_buf_size`,
`max_buf_size`, `protocol_version`, and `tls_ca` are rejected on `ws`/`wss`,
with a hint naming the replacement. To keep ILP-sized batches, set
`auto_flush_rows` and `auto_flush_interval` explicitly. Migrate one sender at a
time: ILP and QWP senders can run side by side.

### Upgrading from 4.x

Version 5.0.0 keeps the ILP API and adds QWP. Changes that affect existing ILP
code:

- **Null values.** Passing `null` or `undefined` to a column or symbol method now
  omits the column, which QuestDB stores as NULL. Earlier versions threw a type
  error for most such values. Validate data before calling the sender if you
  relied on the error.
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
servers without QWP. ILP senders support HTTP (`http::`, `https::`) and TCP
(`tcp::`, `tcps::`) transports:

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
- `flush()` sends the buffer as one HTTP request, which QuestDB commits as one
  transaction, and throws if QuestDB rejects it.
- Decimals need ILP protocol version 3: HTTP negotiates it automatically, and
  TCP needs `protocol_version=3`. Arrays need version 2 or later.
- Undici is the default HTTP agent. Set `stdlib_http=on` to use the Node.js
  `http` module instead.

For ILP options, see the
[`SenderOptions` reference](https://questdb.github.io/nodejs-questdb-client/classes/_questdb_nodejs-client.SenderOptions.html)
and the [ILP overview](/docs/connect/compatibility/ilp/overview/).

## Full example: ingestion and querying with failover

A production service that ingests trades and queries recent prices, with TLS,
a token, several hosts, error handling, and failover handling:

```typescript
import {
  connectQwpNodeClient,
  QwpEgressQueryError,
  QwpIngressAckTimeoutError,
  QWP_RECONNECT_EVENT_KIND,
  type QwpReconnectEvent,
  type QwpSenderError,
} from "@questdb/nodejs-client";

const token = process.env.QDB_TOKEN;
if (!token) throw new Error("QDB_TOKEN is not set");

function logConnection(event: QwpReconnectEvent) {
  if (event.kind !== QWP_RECONNECT_EVENT_KIND.ATTEMPT_FAILED) {
    console.info("questdb connection:", event.kind, String(event.endpoint ?? ""));
  }
}

const db = await connectQwpNodeClient(
  "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;" +
    `token=${token};` +
    "sender_pool_max=4;query_pool_max=8;",
  {
    // Queries run on replicas only; ingestion always follows the primary.
    egress: { target: "replica", compression: "zstd" },
    ingressSession: {
      onSenderError: (error: QwpSenderError) =>
        console.error("batch rejected:", error.category, error.serverMessage),
      // Replaces any reconnect_* keys; omitted fields use the defaults.
      reconnect: { onEvent: logConnection },
    },
    egressSession: {
      queryTimeoutMs: 30_000,
      // Replaces any failover* keys; omitted fields use the defaults.
      reconnect: { maxDurationMs: 30_000, onEvent: logConnection },
      onReplayReset: (event) =>
        console.warn("query restarts on", String(event.endpoint)),
    },
  },
);

try {
  // Ingestion: one borrowed sender per producer.
  const sender = await db.borrowSender();
  try {
    for (const [symbol, price, amount] of [
      ["ETH-USD", 2615.54, 0.5],
      ["BTC-USD", 39269.98, 0.001],
    ] as const) {
      await sender
        .table("trades")
        .symbol("symbol", symbol)
        .symbol("side", "buy")
        .doubleColumn("price", price)
        .doubleColumn("amount", amount)
        .at(Date.now(), "ms");
    }
    const sequence = await sender.flushAndGetSequence();
    await sender.waitForAcknowledged(sequence, 10_000);
  } catch (error) {
    if (!(error instanceof QwpIngressAckTimeoutError)) throw error;
    console.warn("rows not acknowledged yet; they stay queued for replay");
  } finally {
    await sender.close();
  }

  // Querying: rows may not be visible yet, see "Read-after-write".
  const lease = await db.borrowQuery();
  try {
    const query = await lease.query(
      "SELECT timestamp, symbol, price FROM trades " +
        "WHERE symbol = $1 ORDER BY timestamp DESC LIMIT 10",
      { binds: (binds) => binds.setVarchar(0, "ETH-USD") },
    );
    const recentPrices: (readonly unknown[])[] = [];
    for await (const batch of query) {
      // A failover re-executes the query from sequence 0: drop the partial result.
      if (batch.batchSequence === 0n) recentPrices.length = 0;
      for (const row of batch.rows()) recentPrices.push(row);
    }
    await query.completion;
    console.log(recentPrices);
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
