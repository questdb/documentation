---
slug: /connect/clients/nodejs
title: Node.js client for QuestDB
sidebar_label: Node.js
description:
  "QuestDB Node.js client for JavaScript and TypeScript: high-throughput
  ingestion and streaming SQL queries over QWP, with failover and
  store-and-forward."
---

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB Node.js client, `@questdb/nodejs-client`, lets JavaScript and
TypeScript applications ingest data and run SQL queries over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), the QuestDB Wire
Protocol: a columnar binary protocol carried over WebSocket. One
`ws::` or `wss::` connect string configures both directions. Ingestion batches
rows in the background, tracks server acknowledgements, and replays
unacknowledged data after a reconnect or failover, optionally from an on-disk
journal that also survives a process restart. Queries stream typed result
batches with bind parameters, timeouts, and flow control.

Key capabilities:

- **Ingestion**: a fluent row API and compiled object-row writers, automatic
  batching, and automatic table and column creation.
- **Querying**: streaming `SELECT` results, DDL and DML statements, typed bind
  parameters, timeouts, and cancellation.
- **One pooled handle**: `connectQwpNodeClient()` owns a sender pool and a
  query pool for services that both write and read.
- **Resilience**: multi-host failover, in-memory replay, and optional
  store-and-forward to disk.
- **TypeScript**: bundled type declarations, with ESM and CommonJS builds.

:::tip Browser applications

Web applications that run in a browser use the
[browser client](/docs/connect/clients/browser/), `@questdb/browser-client`. It
shares this client's QWP API and has no Node.js dependencies.

:::

:::tip Legacy transports

The `Sender` class also ingests over the InfluxDB Line Protocol with `http::`,
`https::`, `tcp::`, and `tcps::` connect strings. This page documents QWP. See
[Legacy ILP transports](#legacy-ilp-transports).

:::

## Quick start

Install the client. It requires Node.js 20.18.1 or later, client version 5.0.0
or later, and QuestDB 10.0 or later:

```shell
npm install @questdb/nodejs-client
```

The examples on this page are TypeScript ES modules that use top-level
`await`. Run them with a TypeScript runner such as `tsx`, or remove the few
type annotations and save them as `.mjs` files. In a CommonJS module, load the
package with `require("@questdb/nodejs-client")` and run the code inside an
`async` function. Every class and function is exported from the package root.

The following program creates a table, writes a trade, waits for QuestDB to
acknowledge it, and reads it back:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

// One handle per process. It owns a sender pool and a query pool, and
// one ws/wss connect string configures both.
const db = await connectQwpNodeClient("ws::addr=localhost:9000;");

try {
  // Create the table. Ingestion would also create it on the first row.
  const ddlLease = await db.borrowQuery();
  try {
    const ddl = await ddlLease.query(`
      CREATE TABLE IF NOT EXISTS trades (
        symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE,
        timestamp TIMESTAMP
      ) TIMESTAMP(timestamp) PARTITION BY DAY`);
    await ddl.completion;
  } finally {
    await ddlLease.close();
  }

  // Ingest: borrow a sender, write a row, wait for the acknowledgement.
  const timestamp = Date.now(); // identifies this run's row
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USDT")
      .symbol("side", "buy")
      .floatColumn("price", 2615.54)
      .floatColumn("amount", 0.5)
      .at(timestamp, "ms");
    if (!(await sender.flushAndWait(10_000))) {
      throw new Error("QuestDB did not acknowledge the row in 10 seconds");
    }
  } finally {
    await sender.close(); // returns the sender to the pool
  }

  // Query: an acknowledged row becomes visible shortly afterwards, so poll
  // until this row, matched by its timestamp, is returned.
  const lease = await db.borrowQuery();
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const query = await lease.query(
        "SELECT symbol, side, price, amount, timestamp FROM trades " +
          "WHERE symbol = $1 AND timestamp = $2",
        {
          binds: (binds) =>
            binds
              .setVarchar(0, "ETH-USDT")
              .setTimestampMicros(1, BigInt(timestamp) * 1000n),
        },
      );
      let rows = 0;
      for await (const batch of query) {
        for (const row of batch.rows()) {
          // [ 'ETH-USDT', 'buy', 2615.54, 0.5, 1735689600000000n ], where the
          // last value is this row's timestamp in microseconds
          console.log(row);
          rows++;
        }
      }
      await query.completion;
      if (rows > 0) break;
      if (Date.now() > deadline) {
        throw new Error("the row is not visible after 10 seconds");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await lease.close();
  }
} finally {
  await db.close();
}
```

`connectQwpNodeClient()` opens one ingestion and one query connection before
it resolves, so it fails fast when QuestDB is unreachable. `borrowSender()` and
`borrowQuery()` lease a connection from the pool, and `close()` on the lease
returns it. `flushAndWait()` resolves `true` once QuestDB has acknowledged the
rows, and `false` if no acknowledgement arrived in time. The rows then stay
queued and are still delivered.

:::caution Read before building on these snippets

- **`flush()` does not wait for QuestDB.** It hands rows to a local queue and
  returns. Delivery and acknowledgement happen in the background, and rows still
  in that queue are lost if the process exits. Wait with `flushAndWait()` where
  you need confirmation, or enable [store-and-forward](#store-and-forward) to
  keep unacknowledged rows on disk.
- **Server rejections arrive asynchronously.** A row QuestDB cannot store fails
  after `flush()` has returned. Register `onSenderError` to observe it, and
  expect a terminal rejection to end the sender. See
  [Server rejections](#server-rejections).
- **Delivery is at least once.** After a reconnect, a sender replays every
  batch that QuestDB has not acknowledged, and QuestDB may already have stored
  some of them. If a table must not hold duplicate rows, declare
  [`DEDUP UPSERT KEYS`](/docs/concepts/deduplication/) on the columns that
  identify a row, as the
  [production example](#production-example-tls-token-and-multiple-hosts) does.
- **An acknowledgement is not visibility.** QuestDB applies acknowledged rows
  to the table shortly afterwards, so a query issued straight after
  `flushAndWait()` can miss them. Poll with a deadline, as above.
- **Pass the unit to `at()`.** Without one, `at()` reads microseconds, so
  `at(Date.now())` stores a timestamp in January 1970. Write
  `at(Date.now(), "ms")`.
- **`LONG`, `DATE`, and `TIMESTAMP` values come back as `bigint`.**
  `JSON.stringify()` throws on a `bigint`. Convert with `Number()` or
  `String()` first.
- **Give each producer its own sender, and run one query at a time per query
  lease.** See [Concurrency](#concurrency).

:::

## Choose an API

Pick the entry point by what the service does:

- **It queries, or it writes from several concurrent tasks:**
  [`connectQwpNodeClient()`](#the-pooled-client). One connect string,
  credentials included, configures both directions, and the client lends each
  task its own sender or query lease from a pool. A service that only queries
  sets `sender_pool_min=0`, and one that only writes sets `query_pool_min=0`,
  so the unused side opens no connection.
- **It writes from one producer:** a standalone sender, from
  `Sender.fromConfig()` with a connect string or `connectQwpNodeSender()` with
  an options object. Its `close()` waits for QuestDB to acknowledge the
  remaining rows and rejects when they do not arrive in time. A borrowed
  sender's `close()` returns without waiting, and `db.close()` logs a warning
  instead of rejecting when acknowledgements are missing. With
  [store-and-forward](#store-and-forward), a standalone sender's journal is
  `<sf_dir>/<sender_id>`, while each pooled sender has its own
  `<sf_dir>/<sender_id>-<index>`. The
  [production example](#production-example-tls-token-and-multiple-hosts) is
  such a service.

`connectQwpNodeClient()` is the only entry point that queries with a connect
string: `connectQwpNodeEgress()` takes an [options object](#options-objects),
with credentials in `authorization` rather than `token`. All entry points share
one QWP implementation:

| You need                                                         | Use                                   | Returns                                                 |
| ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------- |
| A service that queries, or writes from several concurrent tasks  | `connectQwpNodeClient(connectString)` | `QwpClient`, which lends `QwpSender` and `QwpQueryLease` |
| One ingestion producer, or code written for the ILP `Sender`     | `Sender.fromConfig("ws::...")`        | `Sender`                                                |
| One ingestion connection configured by an object                 | `connectQwpNodeSender({ url, ... })`  | `QwpSender`                                             |
| One query connection configured by an object                     | `connectQwpNodeEgress({ url, ... })`  | `QwpEgressSession`                                      |
| Repeated object rows with a fixed schema                         | `sender.writer(table, schema)`        | `QwpTableWriter`                                        |
| Fire-and-forget datagrams on a trusted network                   | `Sender.fromConfig("udp::...")`       | `Sender`                                                |

`Sender` and `QwpSender` share the row API. `Sender` implements the nine
column setters it also supports over ILP, while `QwpSender` adds a setter for
every QuestDB column type and a `metrics` snapshot. A `Sender` reaches the
remaining types through [compiled writers](#compiled-object-row-writers).

`createQwpNodeClient()` and `createQwpNodeSender()` build the same objects as
their `connect*` counterparts without opening a connection. The first operation
that needs one opens it.

## Connecting

### Connect strings

A connect string selects the transport and configures it:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  await sender.connect(); // optional: fail fast if QuestDB is unreachable
} finally {
  await sender.close();
}
```

The format is `schema::key=value;key=value;`:

- `ws` selects plain WebSocket, `wss` selects TLS. Both default to port `9000`.
- `addr=host:port` names the server. List several hosts for
  [failover](#reconnection-and-failover), comma-separated or as repeated
  `addr` keys.
- Keys are case-sensitive. A literal `;` inside a value is written `;;`.
- Sizes accept the suffixes `k`, `m`, `g`, and `t`, as in `sf_max_total_bytes=10g`.
  This client does not accept the two-letter forms such as `mb`.
- An unknown key fails with `unknown configuration key: <key>`. ILP-only keys
  such as `init_buf_size` or `protocol_version` fail the same way, with a hint.
- A `Sender` validates query and pool keys such as `target`, `compression`, or
  `sender_pool_max`, then ignores them with a logged warning. One connect string
  can therefore serve every entry point.

Without `connect()`, a `Sender` connects on its first flush. The keys used most
often:

| Key                          | Default             | Purpose                                                                |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `addr`                       | required            | One or more `host:port` endpoints                                      |
| `username`, `password`       | unset               | HTTP basic authentication                                              |
| `token`                      | unset               | Bearer token: a QuestDB Enterprise REST token or an OIDC access token  |
| `tls_verify`                 | `on`                | `unsafe_off` disables certificate checks, for testing only             |
| `tls_roots`                  | Node.js default CAs | PEM file with trusted CA certificates                                  |
| `auto_flush_rows`            | `1000`              | Rows that trigger a flush. `0` disables the trigger                    |
| `auto_flush_interval`        | `100`               | Milliseconds since the last flush that trigger one. `0` disables it    |
| `auto_flush_bytes`           | `off`               | Estimated batch size that triggers a flush                             |
| `transaction`                | `off`               | Commit each explicit flush as one transaction per table                |
| `request_durable_ack`        | `off`               | Wait for durable upload (Enterprise)                                   |
| `sf_dir`                     | unset               | Enables [store-and-forward](#store-and-forward)                        |
| `initial_connect_retry`      | `off`               | `sync` or `async` to retry the first connection                        |
| `close_flush_timeout_millis` | `5000`              | How long `close()` waits for acknowledgements                          |
| `connect_timeout`            | `15000`             | Milliseconds for the TCP and TLS connection to one endpoint            |
| `auth_timeout_ms`            | `connect_timeout`   | Milliseconds for authentication and the WebSocket upgrade              |

The [connect string reference](/docs/connect/clients/connect-string/) lists
every key.

### From an environment variable

`Sender.fromEnv()` reads the connect string from `QDB_CLIENT_CONF`, which keeps
credentials out of code:

```bash
export QDB_CLIENT_CONF="wss::addr=db.example.com:9000;token=YOUR_TOKEN;"
```

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromEnv();
try {
  await sender.connect();
} finally {
  await sender.close();
}
```

The pooled client has no `fromEnv()`. Pass the variable yourself:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const conf = process.env.QDB_CLIENT_CONF;
if (!conf) throw new Error("QDB_CLIENT_CONF is not set");
const db = await connectQwpNodeClient(conf);
await db.close();
```

### Options objects

`connectQwpNodeSender()` and `connectQwpNodeEgress()` take an options object
instead of a connect string:

```typescript
import { connectQwpNodeSender } from "@questdb/nodejs-client";

const sender = await connectQwpNodeSender({
  url: "ws://localhost:9000/write/v4",
  autoFlushRows: 5_000,
});
await sender.close();
```

- `url` is the full endpoint: `/write/v4` for ingestion, `/read/v1` for
  queries.
- `failoverUrls` lists further endpoints, tried in order.
- `authorization` takes the complete `Authorization` header value, for example
  `` `Bearer ${token}` ``.
- Many options are the camel-case form of a connect-string key, such as
  `reconnectMaxBackoffMs` for `reconnect_max_backoff_millis`. Others differ,
  such as `transactional` for `transaction` and `storeAndForward` for the
  `sf_*` keys. The
  [API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
  lists them all.

`Sender.fromConfig()` and `connectQwpNodeClient()` take the same typed options
as a second argument, for callbacks and anything a string cannot express. The
whole string is validated first, then a typed value wins over the key it
overrides. A `Sender` takes them under `qwp.webSocket`, and the pooled client
under `cluster`, `ingress`, `egress`, and `pool`:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;", {
  qwp: {
    webSocket: {
      onSenderError: (error) =>
        console.error("rejected:", error.category, error.serverMessage),
    },
  },
});
await sender.close();
```

## The pooled client

`connectQwpNodeClient()` returns a `QwpClient`: one handle that keeps a pool of
sender connections and a pool of query connections, configured by one connect
string. Create one per process and share it.

```typescript
import {
  connectQwpNodeClient,
  type QwpQueryLease,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;sender_pool_max=4;query_pool_max=8;",
);
try {
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "BTC-USDT")
      .symbol("side", "sell")
      .floatColumn("price", 65432.1)
      .floatColumn("amount", 0.0012)
      .at(Date.now(), "ms");
    await sender.flushAndWait();
  } finally {
    await sender.close(); // flushes and returns the connection to the pool
  }

  // Each lease runs one query at a time, so borrow one per concurrent query.
  const [prices, volumes] = await Promise.all([
    db.borrowQuery(),
    db.borrowQuery(),
  ]);
  try {
    const collect = async (lease: QwpQueryLease, sql: string) => {
      const query = await lease.query(sql);
      const rows: unknown[] = [];
      for await (const batch of query) rows.push(...batch.rows());
      await query.completion;
      return rows;
    };
    const [latest, volume] = await Promise.all([
      collect(prices, "SELECT symbol, last(price) FROM trades"),
      collect(volumes, "SELECT symbol, sum(amount) FROM trades"),
    ]);
    console.log(latest, volume);
  } finally {
    await Promise.all([prices.close(), volumes.close()]);
  }
} finally {
  await db.close();
}
```

- `borrowSender()` lends a `QwpSender`. Its `close()` publishes completed rows,
  discards an unfinished row with a warning, and returns the connection. It
  does not wait for acknowledgements, so call `flushAndWait()` first where you
  need them.
- `borrowQuery()` lends a `QwpQueryLease` with `query()` and `queryViews()`.
  Its `close()` cancels an unfinished query and returns the connection.
- Every endpoint in `addr` serves both pools, and each pool derives its route,
  `/write/v4` or `/read/v1`, from it.
- `connectQwpNodeClient()` opens the configured minimum of connections before
  it resolves, and rejects with `QwpPoolResourceError` when it cannot. A borrow
  that has to open a connection rejects the same way. The error's `cause` holds
  the original failure, such as a `QwpUpgradeError` for rejected credentials or
  a `QwpReplayStoreLockedError` for a locked journal.
  `createQwpNodeClient()` returns without connecting.
- A lease used after `close()` throws `QwpClientClosedError`.

| Key                       | Default   | Purpose                                                                       |
| ------------------------- | --------- | ----------------------------------------------------------------------------- |
| `sender_pool_min`         | `1`       | Sender connections kept open when idle. `0` opens none until a borrow          |
| `sender_pool_max`         | `4`       | Most sender connections                                                       |
| `query_pool_min`          | `1`       | Query connections kept open when idle. `0` opens none until a borrow           |
| `query_pool_max`          | `4`       | Most query connections, and so the most concurrent queries                    |
| `acquire_timeout_ms`      | `5000`    | How long a borrow waits for a free connection, then `QwpPoolAcquireTimeoutError` |
| `idle_timeout_ms`         | `60000`   | Idle time before a connection above the minimum closes. `0` keeps it          |
| `max_lifetime_ms`         | `1800000` | Age at which an idle connection above the minimum closes. `0` disables it     |
| `housekeeper_interval_ms` | `5000`    | How often idle and old connections are checked                                |
| `lazy_connect`            | `off`     | Start without connecting, so the client starts while QuestDB is down          |

`idle_timeout_ms` and `max_lifetime_ms` close only connections above the pool
minimum, and open no replacements. The minimum connections are never recycled.

`lazy_connect=on` lets `connectQwpNodeClient()` resolve while QuestDB is
unreachable. It starts the senders with `initial_connect_retry=async`, so they
connect in the background and queue rows meanwhile, and it sets
`query_pool_min=0`, so query connections open on the first query. It therefore
rejects a positive `query_pool_min`, an `initial_connect_retry` other than
`async`, and `reconnect: false` under `ingress` with a `RangeError`. A
standalone `Sender` ignores the key: set `initial_connect_retry=async` for it
instead.

The second argument takes typed options for each side. `ingress` takes the
options a standalone `Sender` takes under `qwp.webSocket`, such as
[`onSenderError`](#server-rejections), `onError`, and
[`reconnect`](#connection-events), and `egress` takes the
[query-session options](#querying). Endpoints and `authorization` belong to
`cluster`. Each side has its own `reconnect`, with its own `onEvent`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;", {
  ingress: {
    onSenderError: (error) =>
      console.error("rejected:", error.category, error.serverMessage),
    onError: (event) => {
      if (event.terminal) console.error("pooled sender failed:", event.error);
    },
    reconnect: {
      onEvent: (event) => console.info("ingestion connection:", event.kind),
    },
  },
  egress: {
    queryTimeoutMs: 30_000,
    reconnect: {
      onEvent: (event) => console.info("query connection:", event.kind),
    },
  },
});
await db.close();
```

Callbacks and `reconnect` belong under `ingress` and `egress`. Placed under
`cluster`, TypeScript rejects them, and plain JavaScript passes them to both
sides: a `reconnect` there applies to the senders and the query sessions.

The pooled client also accepts one options object, with the endpoints in
`cluster`:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient({
  cluster: {
    url: "wss://db.example.com:9000",
    authorization: `Bearer ${process.env.QUESTDB_TOKEN}`,
  },
  ingress: { autoFlushRows: 5_000 },
  egress: { queryTimeoutMs: 30_000 },
  pool: { senderPoolMax: 2, queryPoolMax: 8 },
});
await db.close();
```

`db.close()` waits briefly for borrowed senders, cancels running queries, and
closes every connection. Closing a pooled sender is best effort: if its
acknowledgement wait times out, the client logs a warning instead of
rejecting.

## Authentication and TLS

Credentials go in the connect string and are sent on every WebSocket upgrade:
the first connection, each reconnect, and each failover.

```text
wss::addr=db.example.com:9000;username=admin;password=quest;
wss::addr=db.example.com:9000;token=YOUR_TOKEN;
```

- `username` and `password` (aliases `user` and `pass`) select HTTP basic
  authentication.
- `token` selects bearer authentication. It takes a QuestDB Enterprise REST
  token or an OIDC access token. It cannot be combined with `username`.
- With an options object, set `authorization` to the header value instead:
  `"Bearer <token>"` or `"Basic <base64 of user:password>"`.

Rejected credentials fail the connection with a `QwpUpgradeError` whose `kind`
is `"authentication"` and whose `statusCode` is `401` or `403`. The client does
not try the other endpoints or retry the first connection, because every node
of a cluster would reject the same credential:

```typescript
import { QwpUpgradeError, Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig(
  `wss::addr=db.example.com:9000;token=${process.env.QUESTDB_TOKEN};`,
);
try {
  await sender.connect();
} catch (error) {
  if (error instanceof QwpUpgradeError && error.kind === "authentication") {
    console.error(`credentials rejected with HTTP ${error.statusCode}`);
  }
  throw error;
} finally {
  await sender.close();
}
```

The pooled client wraps this error: `connectQwpNodeClient()`, and a borrow
that opens a connection, reject with a `QwpPoolResourceError` whose `cause` is
the `QwpUpgradeError`.

A rejected credential also ends a sender that has already connected, unless
the sender uses [store-and-forward](#store-and-forward) or
`initial_connect_retry=async`, which the pooled client's `lazy_connect=on` also
selects. Such a sender keeps retrying with backoff and
keeps its queued rows, so ingestion resumes once QuestDB accepts the
credential again. It reports each rejected attempt as an `auth-failed`
[connection event](#connection-events).

On QuestDB Enterprise, give a service the permissions it needs and a REST
token, then pass the token as `token=`. `HTTP` is the endpoint permission QWP
connections need:

```questdb-sql title="Service account for an ingestion service"
CREATE SERVICE ACCOUNT trade_feed;
GRANT HTTP, CREATE TABLE TO trade_feed;
ALTER SERVICE ACCOUNT trade_feed
    CREATE TOKEN TYPE REST WITH TTL '30d' REFRESH;
```

The account owns the tables it creates, so it can insert into them and query
them. For tables created in advance, grant `INSERT` or `SELECT` on each
instead of `CREATE TABLE`. See [RBAC](/docs/security/rbac/).

### TLS

The `wss` schema enables TLS. The server certificate is checked against the
certificate authorities Node.js trusts by default:

- `tls_roots=/path/to/ca.pem` trusts the PEM-encoded CA certificates in that
  file instead, for a private CA. PKCS#12 and JKS trust stores, and with them
  `tls_roots_password`, are rejected: export the certificates to PEM.
- `tls_verify=unsafe_off` disables verification. Use it only for testing. It
  cannot be combined with `tls_roots`.
- A custom Node.js agent, such as an HTTPS proxy agent, goes in the typed
  options as `qwp.webSocket.agent` for a `Sender` or `cluster.agent` for the
  pooled client. It then owns certificate verification, so it cannot be
  combined with the `tls_*` keys.

```text
wss::addr=db.example.com:9000;tls_roots=/etc/ssl/qdb-ca.pem;token=YOUR_TOKEN;
```

### Unsupported authentication paths

| Path                               | Status                                                                                                                       | Alternative                                                                                                                                                                                                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OIDC token acquisition and refresh | Not supported. The client does not talk to an identity provider and sends the same token on every connection, reconnects included. | Acquire the access token from your identity provider and pass it as `token=`. Before it expires, close the sender or client and create a new one with a fresh token. With store-and-forward, reuse the same `sf_dir` and `sender_id`: the new sender replays whatever the old one did not deliver. See [OpenID Connect](/docs/security/oidc/). |
| Mutual TLS (client certificates)   | Not supported. QuestDB does not negotiate client certificates.                                                               | Use a token or basic authentication over `wss`.                                                                                                                                                                                                              |
| JWK (ECDSA key) authentication     | ILP over TCP only. `ws` and `wss` reject the JWK options.                                                                    | Use a token or basic authentication.                                                                                                                                                                                                                         |

## Data ingestion

### Writing rows

A sender builds rows one at a time and sends them in batches:

1. `table(name)` selects the table.
2. Column setters add values, such as `symbol()` for `SYMBOL` columns and
   `floatColumn()` for `DOUBLE` columns. They can come in any order.
3. `at(value, unit)` or `atNow()` closes the row. Await it.
4. Repeat, then call `flush()` or let [auto-flush](#auto-flush) send the batch.

```typescript
import { Sender } from "@questdb/nodejs-client";

const trades = [
  { symbol: "ETH-USDT", side: "buy", price: 2615.54, amount: 0.5 },
  { symbol: "BTC-USDT", side: "sell", price: 65432.1, amount: 0.0012 },
];

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  await sender.connect();
  for (const trade of trades) {
    await sender
      .table("trades")
      .symbol("symbol", trade.symbol)
      .symbol("side", trade.side)
      .floatColumn("price", trade.price)
      .floatColumn("amount", trade.amount)
      .at(Date.now(), "ms");
  }
  await sender.flush();
} finally {
  await sender.close(); // publishes what remains and waits for the ACK
}
```

QuestDB creates missing tables and columns from the first row that uses them.
The designated timestamp column of an auto-created table is named `timestamp`.
`at()` and `atNow()` return a promise that settles once any auto-flush the row
triggered has been published, so awaiting them propagates errors and slows the
producer down when the queue is full.

The same methods exist on a `QwpSender` from `borrowSender()` or
`connectQwpNodeSender()`. A sender is not safe to share between independent
producers: give each producer its own. See [Concurrency](#concurrency).

A setter that rejects a value throws, and the sender discards the row in
progress, including its table selection. It keeps the rows completed before
it, so the next row starts again from `table()`. `at()` rejects an invalid
timestamp the same way, but it also rejects when the auto-flush that the row
triggered fails, for example while QuestDB is unreachable. That row is
complete and stays queued for the next flush, so writing it again would
duplicate it. Catch row errors around the setters, and let a rejected `at()`
propagate:

```typescript
for (const trade of trades) {
  try {
    sender
      .table("trades")
      .symbol("symbol", trade.symbol)
      .floatColumn("price", trade.price); // TypeError if price is a string
  } catch (error) {
    console.warn("skipped a trade:", error); // only this row is dropped
    continue;
  }
  // Rejects if the auto-flush this row triggered fails. The row is then
  // queued, not dropped, so the error propagates instead of being skipped.
  await sender.at(Date.now(), "ms");
}
```

`cancelRow()` discards the row in progress without an error. `reset()` also
discards every row not yet flushed.

### Column types

The `Sender` column marks the nine setters that `Sender` implements. A
`QwpSender` implements all of them.

| Method                                     | QuestDB type                         | Accepted values                                                       | `Sender` |
| ------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------- | -------- |
| `symbol(name, value)`                      | `SYMBOL`                             | Any value, converted with `String()`                                  | ✓        |
| `stringColumn(name, value)`                | `VARCHAR`                            | `string`                                                              | ✓        |
| `booleanColumn(name, value)`               | `BOOLEAN`                            | `boolean`                                                             | ✓        |
| `floatColumn(name, value)`                 | `DOUBLE`                             | `number`                                                              | ✓        |
| `doubleColumn(name, value)`                | `DOUBLE`                             | `number`                                                              |          |
| `float32Column(name, value)`               | `FLOAT`                              | `number`                                                              |          |
| `intColumn(name, value)`                   | `LONG`                               | Safe-integer `number` or `bigint`                                     | ✓        |
| `longColumn(name, value)`                  | `LONG`                               | Safe-integer `number` or `bigint`                                     |          |
| `int32Column(name, value)`                 | `INT`                                | Integer `number`                                                      |          |
| `shortColumn(name, value)`                 | `SHORT`                              | Integer from -32768 to 32767                                          |          |
| `byteColumn(name, value)`                  | `BYTE`                               | Integer from -128 to 127                                              |          |
| `charColumn(name, value)`                  | `CHAR`                               | `string` of one UTF-16 code unit                                      |          |
| `timestampColumn(name, value, unit)`       | `TIMESTAMP`, or `TIMESTAMP_NS` for `"ns"` | `number` or `bigint`. Units `"ns"`, `"us"` (default), `"ms"`; `"ns"` needs a `bigint` | ✓        |
| `dateColumn(name, millis)`                 | `DATE`                               | Milliseconds since the epoch, `number` or `bigint`                    |          |
| `uuidColumn(name, value)`                  | `UUID`                               | Canonical UUID text, or 16 bytes in RFC 4122 order as a `Uint8Array`  |          |
| `long256Column(name, w0, w1, w2, w3)`      | `LONG256`                            | Four 64-bit `bigint` words, least significant first                   |          |
| `ipv4Column(name, value)`                  | `IPV4`                               | Dotted-quad text, or the packed address as a `number`                 |          |
| `geohashColumn(name, bits, precisionBits)` | `GEOHASH`                            | `bigint` bits, with a precision from 1 to 60 bits                     |          |
| `binaryColumn(name, value)`                | `BINARY`                             | `Uint8Array`, copied on append                                        |          |
| `arrayColumn(name, value)`                 | `DOUBLE[]`                           | Rectangular nested `number` arrays, 1 to 32 dimensions                | ✓        |
| `decimalColumnText(name, value)`           | `DECIMAL`                            | Decimal text or a `number`                                            | ✓        |
| `decimalColumn(name, unscaled, scale)`     | `DECIMAL`                            | `bigint`, or big-endian two's complement `Int8Array`; scale 0 to 76   | ✓        |
| `decimal64Column(name, unscaled, scale)`   | `DECIMAL`, up to 18 digits           | `bigint`; scale 0 to 18                                               |          |
| `decimal128Column(name, unscaled, scale)`  | `DECIMAL`, up to 38 digits           | `bigint`; scale 0 to 38                                               |          |
| `decimal256Column(name, unscaled, scale)`  | `DECIMAL`, up to 76 digits           | `bigint`; scale 0 to 76                                               |          |
| `longArrayColumn(name, value)`             | `LONG[]`                             | Current QuestDB servers reject it                                     |          |

Despite their names, `floatColumn()` and `intColumn()` write the 64-bit
`DOUBLE` and `LONG` types. Use `float32Column()` and `int32Column()` for the
32-bit `FLOAT` and `INT`. A `SYMBOL` is a dictionary-encoded string for values
that repeat, such as tickers and venues. Use `stringColumn()` for free text.

A `GEOHASH` column keeps the precision of the first value staged for it.

### Null values

Pass `null` or `undefined` to a setter, or skip the setter. Either way the
column is omitted from the row and QuestDB stores `NULL`. There is no
`setNull()` or `nullColumn()` method.

```typescript
// sender: a Sender or QwpSender, created as in Writing rows
const trade = { symbol: "ETH-USDT", side: undefined, amount: null };

await sender
  .table("trades")
  .symbol("symbol", trade.symbol)
  .symbol("side", trade.side) // undefined: stored as NULL
  .floatColumn("price", 2615.54)
  .floatColumn("amount", trade.amount) // null: stored as NULL
  .at(Date.now(), "ms");
```

- A column that only ever received `null` is not created on a new table,
  because a `null` carries no type.
- `BOOLEAN`, `BYTE`, and `SHORT` columns cannot hold `NULL` in QuestDB. A
  missing value reads back as `false` or `0`.
- Some values are QuestDB's `NULL` markers and are stored as `NULL`:
  `-2147483648` for `INT`, and `-9223372036854775808n` for `LONG` and `DATE`.
  `ipv4Column()` rejects `0.0.0.0`, the `IPV4` null value.
- A row whose values were all `null` still counts as a row, and QuestDB stores
  it with `NULL` in every column. Call `cancelRow()` instead of `at()` to drop
  it.

### Designated timestamp

The [designated timestamp](/docs/concepts/designated-timestamp/) orders and
partitions a table. `at(value, unit)` sets it from your data, and `atNow()`
lets the server assign the time the batch arrives:

```typescript
// sender: a Sender or QwpSender, created as in Writing rows

// Milliseconds, as returned by Date.now() and Date.prototype.getTime()
await sender
  .table("trades")
  .symbol("symbol", "ETH-USDT")
  .floatColumn("price", 2615.54)
  .at(Date.now(), "ms");

// Nanoseconds as a bigint: a new table gets a TIMESTAMP_NS column
await sender
  .table("trades_ns")
  .symbol("symbol", "ETH-USDT")
  .floatColumn("price", 2615.54)
  .at(1_735_689_600_123_456_789n, "ns");

// Server-assigned timestamp, shared by every row of the batch
await sender
  .table("trades")
  .symbol("symbol", "ETH-USDT")
  .floatColumn("price", 2615.54)
  .atNow();
```

The unit is `"ns"`, `"us"`, or `"ms"`, and defaults to `"us"`. A `Date` is not
accepted: pass `date.getTime()` with `"ms"`.

`atNow()` gives every row of a batch the same timestamp: the time QuestDB
receives the batch, not the time each row was written. On a table with
[deduplication](/docs/concepts/deduplication/), rows flushed together can then
share a key, and QuestDB keeps only one of them: with
`DEDUP UPSERT KEYS(timestamp, symbol)`, two trades of one symbol in a batch
become one row. Use the event's own timestamp with `at()` instead.
Deduplication also relies on it to discard rows replayed after a reconnect.

### Compiled object-row writers

When rows already exist as objects with one shape, compile the table schema once
and append objects. A writer validates every field before it stages a row, so a
failing row never reaches QuestDB partially:

```typescript
import {
  Sender,
  designatedTimestamp,
  double,
  symbol,
} from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
try {
  const trades = sender.writer("trades", {
    symbol: symbol(),
    side: symbol(),
    price: double(),
    amount: double(),
    timestamp: designatedTimestamp("ms"),
  });

  await trades.row({
    symbol: "ETH-USDT",
    side: "buy",
    price: 2615.54,
    amount: 0.5,
    timestamp: Date.now(),
  });
  // Accepts arrays and other sync or async iterables
  await trades.rows([
    { symbol: "BTC-USDT", side: "sell", price: 65432.1, amount: 0.0012,
      timestamp: Date.now() },
  ]);
  await sender.flush();
} finally {
  await sender.close();
}
```

`writer()` works on every QWP sender, including a `Sender` with a `ws` or `wss`
connect string, and gives a `Sender` access to every column type. It throws on
an ILP transport. With TypeScript, each row is type-checked against the schema.
A writer stages rows on its sender, so use it from the producer that owns the
sender.

A field that is absent, `null`, or `undefined` writes `NULL`. The
`designatedTimestamp()` field is required in every row. Its property name only
names the field in your objects: the value goes to the table's designated
timestamp column. An unknown property or a wrongly typed value rejects the row
with a `QwpWriterRowError` carrying `tableName`, `columnName`, and, for
`rows()`, the zero-based `rowIndex`. Rows completed before the failing one stay
staged.

| Field                       | QuestDB type                   | Accepted values                                                       |
| --------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `symbol()`                  | `SYMBOL`                       | `string`                                                              |
| `varchar()`                 | `VARCHAR`                      | `string`                                                              |
| `char()`                    | `CHAR`                         | `string` of one UTF-16 code unit                                      |
| `bool()`                    | `BOOLEAN`                      | `boolean`                                                             |
| `byte()`, `short()`         | `BYTE`, `SHORT`                | `number`                                                              |
| `int32()`                   | `INT`                          | `number`                                                              |
| `int64()`, `long()`         | `LONG`                         | `bigint`                                                              |
| `float32()`                 | `FLOAT`                        | `number`                                                              |
| `float64()`, `double()`     | `DOUBLE`                       | `number`                                                              |
| `timestamp(unit)`           | `TIMESTAMP`, `TIMESTAMP_NS`    | `number` or `bigint`; `"ns"` needs a `bigint`                         |
| `designatedTimestamp(unit)` | Designated timestamp           | As `timestamp()`, required in every row                               |
| `date()`                    | `DATE`                         | Milliseconds since the epoch                                          |
| `binary()`                  | `BINARY`                       | `Uint8Array`                                                          |
| `uuid()`                    | `UUID`                         | Canonical text, 16 bytes in RFC 4122 order, or `{ low, high }`        |
| `long256()`                 | `LONG256`                      | Unsigned 256-bit `bigint`, `0x` hex text, four words, or `{ words }`  |
| `ipv4()`                    | `IPV4`                         | Dotted-quad text or the packed address                                |
| `geohash(precisionBits)`    | `GEOHASH`                      | Raw `bigint` bits, base-32 text, or `{ bits, precisionBits }`         |
| `decimal64(scale)`          | `DECIMAL`, up to 18 digits     | Unscaled `bigint`, decimal text, `number`, or `{ unscaled, scale }`   |
| `decimal128(scale)`         | `DECIMAL`, up to 38 digits     | As `decimal64()`                                                      |
| `decimal256(scale)`         | `DECIMAL`, up to 76 digits     | As `decimal64()`                                                      |
| `doubleArray()`             | `DOUBLE[]`                     | Rectangular nested arrays, or `{ dimensions, values }`                |
| `longArray()`               | `LONG[]`                       | Current QuestDB servers reject it                                     |

The object forms are the values queries return, so a result row can be written
back without conversion. Decimal text is rescaled to the field's scale when
that is exact and rejected when it would round: at `decimal64(2)`, `"1.50"` is
accepted and `"1.005"` is rejected.

### Arrays

`arrayColumn()` writes a `DOUBLE[]` column from nested JavaScript arrays. A
two-level array creates a `DOUBLE[][]` column, which suits order book
snapshots:

```typescript
// sender: a Sender or QwpSender, created as in Writing rows
await sender
  .table("order_book")
  .symbol("symbol", "BTC-USDT")
  .arrayColumn("bids", [[64901.6, 64901.5], [3.02, 0.06]])
  .arrayColumn("asks", [[64901.7, 64901.8], [1.54, 0.21]])
  .at(Date.now(), "ms");
```

Arrays must be rectangular, hold only numbers, and have between 1 and 32
dimensions. QuestDB ingests `DOUBLE` arrays only: `longArrayColumn()` encodes a
`LONG[]` value that current servers reject with `long arrays are not supported,
only double arrays`. See [arrays](/docs/query/datatypes/array/).

### Decimals

QWP can create `DECIMAL` columns, but the precision then follows the setter
rather than your data: `decimalColumnText()` and `decimalColumn()` create
`DECIMAL(76, scale)`, `decimal64Column()` creates `DECIMAL(18, scale)`, and
`decimal128Column()` creates `DECIMAL(38, scale)`. Create the column first to
choose the precision:

```questdb-sql
CREATE TABLE fx_positions (
  symbol SYMBOL,
  notional DECIMAL(18, 2),
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

```typescript
// sender: a Sender or QwpSender, created as in Writing rows
await sender
  .table("fx_positions")
  .symbol("symbol", "EURUSD")
  .decimalColumnText("notional", "1250000.50") // keeps the written scale
  .at(Date.now(), "ms");

await sender
  .table("fx_positions")
  .symbol("symbol", "GBPUSD")
  .decimalColumn("notional", 98000025n, 2) // 980000.25 as unscaled + scale
  .at(Date.now(), "ms");
```

QuestDB converts the value to the column's scale. A value that would lose
digits, such as `"1.2345"` for `DECIMAL(18, 2)`, is rejected by the server. In
one batch, a decimal column keeps the scale of its first value, and later
values are rescaled to it when that is exact. See
[decimal](/docs/query/datatypes/decimal/).

## Flushing and acknowledgements

### Auto-flush

A sender publishes its batch when it completes a row that crosses any of these
thresholds:

| Trigger                       | Default | Connect-string key    | Option                |
| ----------------------------- | ------- | --------------------- | --------------------- |
| Rows in the batch             | `1000`  | `auto_flush_rows`     | `autoFlushRows`       |
| Milliseconds since last flush | `100`   | `auto_flush_interval` | `autoFlushIntervalMs` |
| Estimated batch bytes         | off     | `auto_flush_bytes`    | `autoFlushBytes`      |

`0` disables one row or time trigger: this client rejects `off` for
`auto_flush_rows` and `auto_flush_interval`, and accepts it for
`auto_flush_bytes`. `auto_flush=off` (`autoFlush: false`) disables all three.
The checks run when a row completes. No timer runs, so rows below the
thresholds wait for the next row, `flush()`, or `close()`. A byte threshold is
capped at 90% of the batch size the server advertises, and a batch above the
server limit is split automatically.

### Waiting for acknowledgements

`flush()` publishes the batch to a local replay queue, in memory or in the
[store-and-forward](#store-and-forward) journal, and returns. A background task
sends queued data in order, and QuestDB acknowledges it once it is committed
to the [write-ahead log](/docs/concepts/write-ahead-log/).

| Call                                | Resolves when                                            | Result                                                                    |
| ----------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `flush()`                           | The batch is in the replay queue                         | `true` if it published anything                                           |
| `flushAndWait(timeoutMs?)`          | QuestDB acknowledged everything published so far         | `true`, or `false` when acknowledgements stalled for `timeoutMs` (15 s)  |
| `flushAndGetSequence()`             | The batch is in the replay queue                         | Highest frame sequence this call published, or `-1n` if it published none |
| `waitForAck(sequence, timeoutMs?)`  | The acknowledged sequence reaches `sequence`             | `true`, or `false` when acknowledgements stalled for `timeoutMs`         |

Sequences are `bigint` values. `publishedSequence` and `ackedSequence` report
the two watermarks without waiting. `flushAndWait()` and `waitForAck()`
correspond to `drain()` and `awaitAckedFsn()` in the Java client.

To wait for everything written so far, flush, then wait for the published
watermark. `flushAndWait()` does the same in one call:

```typescript
// sender: a Sender or QwpSender, created as in Writing rows
await sender.flush();
// Covers this flush and every earlier one, auto-flushes included
const sequence = sender.publishedSequence;
if (!(await sender.waitForAck(sequence, 5_000))) {
  // No acknowledgement progress for 5 seconds. The rows stay queued.
}
```

Do not pass the result of `flushAndGetSequence()` to `waitForAck()` unchecked.
It is `-1n` when that call published nothing, for example because auto-flush
had already sent every row, and `waitForAck(-1n)` resolves `true` at once,
before QuestDB acknowledges anything. Use `flushAndGetSequence()` to learn
which frames a flush produced, for example to match them with the `fromFsn`
and `toFsn` of a [server rejection](#server-rejections).

Waiting is optional. A sender that never waits still delivers every row in
order and replays unacknowledged data after a reconnect. Waiting decides what
your application knows:

- Rows that are only queued in memory are lost if the process exits. Wait, or
  use store-and-forward, before you acknowledge the data upstream, for example
  before committing a message-queue offset.
- A rejection of rows you did not wait for reaches only `onSenderError`. A
  `flushAndWait()` or `waitForAck()` that is waiting when it arrives also
  rejects, with a `QwpIngressNackError`.
- Without store-and-forward, a terminal rejection discards every batch that
  QuestDB has not acknowledged, including batches flushed after the rejected
  one. See [Errors from calls](#errors-from-calls).
- A `false` result means only that the wait ran out. The rows are still queued
  and will be delivered, so sending them again would duplicate them.

### Transactions

With `transaction=on` (`transactional: true`), auto-flushed batches stay in an
open server-side transaction, and an explicit `flush()` commits them together:

```typescript
import { Sender } from "@questdb/nodejs-client";

// trades: an array of { symbol, price, timestamp } objects
const sender = await Sender.fromConfig(
  "ws::addr=localhost:9000;transaction=on;auto_flush_rows=10000;",
);
try {
  for (const trade of trades) {
    await sender
      .table("trades")
      .symbol("symbol", trade.symbol)
      .floatColumn("price", trade.price)
      .at(trade.timestamp, "ms");
  }
  await sender.flushAndWait(); // commits, then waits for the ACK
} finally {
  await sender.close();
}
```

A transaction is atomic per table: a flush that writes several tables commits
each one separately. `close()` does not commit. It publishes the remaining
rows, and QuestDB rolls the open transaction back when the connection closes.

QuestDB acknowledges the batches of an open transaction only when it commits,
so they stay in the replay queue until then. A transaction must fit in that
queue, which `sf_max_total_bytes` sizes: 128 MiB by default, or 10 GiB with
[store-and-forward](#store-and-forward). A larger one makes `at()` and
`flush()` wait for space, as in [Backpressure](#backpressure), and then reject
with `QwpMemoryReplayAppendTimeoutError`, or `QwpReplayStoreAppendTimeoutError`
with store-and-forward, and none of its rows are committed. Commit large
imports in parts.

### Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication.

Try it with a [free 30-day trial](https://questdb.com/enterprise/trial/).
:::

By default QuestDB acknowledges a batch once it is in the primary's
write-ahead log. With `request_durable_ack=on`, the acknowledged sequence
advances only after the batch is uploaded to object storage, so
`flushAndWait()`, `waitForAck()`, and the `close()` drain wait for durable
upload:

```text
wss::addr=db.example.com:9000;token=YOUR_TOKEN;request_durable_ack=on;
```

A server that cannot confirm durable acknowledgement fails the connection with
`QwpDurableAckUnavailableError`. Request it when losing the primary must not
lose acknowledged data. The key applies to ingestion only: query sessions
ignore it.

### Backpressure

Without store-and-forward, published data waits in a 128 MiB memory queue
until QuestDB acknowledges it. When the queue is full, `flush()` and the
`at()` that triggered an auto-flush wait up to 30 seconds for acknowledgements
to free space, then reject with `QwpMemoryReplayAppendTimeoutError`. The rows
stay staged, and the next `flush()` tries to publish them again, so do not
write them a second time. Awaiting those calls is what slows a producer down
when QuestDB cannot keep up or is unreachable.

`sf_max_total_bytes` and `sf_append_deadline_millis` resize the queue and
change the wait (`memoryReplayMaxBytes` and `memoryReplayAppendDeadlineMs` as
options). A `QwpSender` reports the queue in `metrics.ingress`:

```typescript
// sender: a QwpSender from borrowSender() or connectQwpNodeSender()
const ingress = sender.metrics.ingress;
if (ingress && ingress.waitingMemoryReplayAppends > 0) {
  console.warn(
    `ingestion is blocked: ${ingress.memoryReplayUsedBytes} bytes queued`,
  );
}
```

## Store-and-forward

Setting `sf_dir` journals every batch to disk before it is sent. `flush()` then
resolves once the batch is in the journal, and unacknowledged data survives a
process crash or restart: a new sender with the same `sf_dir` and `sender_id`
replays it. After a crash in a container, the new sender may first need a
[manual step](#recovering-a-journal-after-a-crash).

```text
ws::addr=localhost:9000;sf_dir=/var/lib/trade-feed/qdb-sf;sender_id=feed-1;
```

- The journal of a standalone sender is `<sf_dir>/<sender_id>`, and `sender_id`
  defaults to `default`. Each pooled sender uses `<sf_dir>/<sender_id>-<index>`.
- One live sender owns a journal. A second process that opens it fails with
  `QwpReplayStoreLockedError`, which the pooled client reports as the `cause`
  of a `QwpPoolResourceError`, so give concurrent senders distinct `sender_id`
  values. `sender_id` allows letters, digits, `_`, and `-`. The same error
  after a crash means that the crashed process's lock was not released: see
  [Recovering a journal after a crash](#recovering-a-journal-after-a-crash).
- With `initial_connect_retry=async`, a sender starts while QuestDB is
  unreachable, and rows wait in the journal until it connects.
- A batch that QuestDB rejects, such as one with a string for a `DOUBLE`
  column, stays in the journal and stops delivery from it until you fix the
  cause or move the journal aside. See [Errors from calls](#errors-from-calls).
- Store-and-forward is Node.js only. The browser client replays from memory.

| Key                         | Default  | Purpose                                                                                                     |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `sf_durability`             | `memory` | `memory` relies on the OS page cache, `periodic` checkpoints in the background, `append` syncs every frame |
| `sf_sync_interval_millis`   | `5000`   | Checkpoint interval for `periodic`                                                                          |
| `sf_max_total_bytes`        | `10g`    | Journal size limit                                                                                          |
| `sf_max_segment_bytes`      | `4m`     | Segment file size, which also caps one batch                                                                |
| `sf_append_deadline_millis` | `30000`  | How long a flush waits for space in a full journal                                                         |
| `drain_orphans`             | `off`    | Adopt and replay journals that crashed producers left in `sf_dir`                                          |
| `max_background_drainers`   | `4`      | Journals drained concurrently                                                                               |

`memory` durability survives a process crash but not a power loss or host
crash. `periodic` can lose the last checkpoint interval on power loss.
`append` makes each batch durable before `flush()` resolves, at the cost of
throughput.

When the journal is full, a flush waits up to `sf_append_deadline_millis` for
acknowledgements to free space, then rejects with
`QwpReplayStoreAppendTimeoutError`. With the typed option
`storeAndForward.backpressurePolicy: "error"`, it rejects at once with
`QwpReplayStoreFullError`.

`drain_orphans=on` scans the other journals in `sf_dir` at startup and every
30 seconds, and replays any that no live process holds. Use it only on a
directory dedicated to this producer group. A journal that cannot be replayed
is marked `.failed` and left on disk. After inspecting it, call
`retryQwpNodeOrphanSlot(directory)` to make it eligible again.

:::caution Do not share a journal directory with a running Java client

The journal format is shared with the Java, Rust, and Python clients, so one
runtime can recover a directory another runtime wrote after it has closed.
Their locks do not interoperate, though: a Node.js process and a Java process
must never open the same `sf_dir` at the same time.

:::

<SfDedupWarning />

See [store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/)
for the delivery model.

### Recovering a journal after a crash

`close()` releases the journal's lock. After a crash, such as an out-of-memory
kill, the lock stays on disk, and a new sender takes it over only when it names
a process on the same host that no longer exists. In containers that is often
not the case:

- A restarted container usually gives the application the same process ID as
  before, often `1`, so the lock seems to belong to a live process.
- A pod rescheduled to another node, with the same volume, has a new host name.

The new sender then fails with `QwpReplayStoreLockedError`, and
`connectQwpNodeClient()` with a `QwpPoolResourceError` whose `cause` is that
error. The journal stays on disk unsent. To recover, make sure that no other
process uses the journal, delete its `.lock.owner` directory, and start the
sender again. It replays the journal:

```shell
# sf_dir=/var/lib/trade-feed/qdb-sf, sender_id=feed-1
rm -r /var/lib/trade-feed/qdb-sf/feed-1/.lock.owner
```

A pooled sender's lock is `<sf_dir>/<sender_id>-<index>/.lock.owner`. A
container can run this step at startup only if no other container mounts the
volume that holds `sf_dir`: deleting the lock of a journal that another process
still uses lets both processes write to it and corrupt it.

## Querying

### Running a query

A query runs SQL over a query connection: a lease from the
[pooled client](#the-pooled-client), or a standalone session. Results stream
as batches of rows:

```typescript
import {
  QwpEgressQueryError,
  connectQwpNodeClient,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
const lease = await db.borrowQuery();
try {
  const query = await lease.query(
    "SELECT symbol, side, price, amount, timestamp FROM trades " +
      "WHERE timestamp IN '$now-1h..$now' AND symbol = $1",
    { binds: (binds) => binds.setVarchar(0, "ETH-USDT") },
  );
  for await (const batch of query) {
    const names = batch.columns.map((column) => column.name);
    for (const values of batch.rows()) {
      const row = Object.fromEntries(names.map((n, i) => [n, values[i]]));
      console.log(row);
    }
  }
  const done = await query.completion;
  if (done.kind === "result-end") console.log(`${done.totalRows} rows`);
} catch (error) {
  if (!(error instanceof QwpEgressQueryError)) throw error;
  console.error(`query failed with status ${error.status}: ${error.message}`);
} finally {
  await lease.close(); // returns the connection to the pool
  await db.close();
}
```

- `query()` resolves once the query is sent, and returns a `QwpEgressQuery`.
  Iterate it with `for await` to receive `QwpResultBatch` objects.
- A batch has `rowCount`, `columns` (each with `name`, numeric `type`, and
  `values`), `rows()`, which yields one array of values per row, and
  `get(rowIndex, columnIndex)`.
- `completion` resolves after the last batch with
  `{ kind: "result-end", totalRows }`, or `{ kind: "exec-done", rowsAffected }`
  for a statement that returns no rows.
- Consume or cancel every result before awaiting `completion`. The client
  stops reading from the server once four decoded batches are waiting.
- A lease runs one query at a time. Starting another while one is active
  rejects with `a QWP query is already active on this connection`. Borrow a
  lease per concurrent query.

A standalone session from `connectQwpNodeEgress()` has the same `query()` and
`queryViews()` methods. It takes an [options object](#options-objects) instead
of a connect string, and the query options in this section as session
defaults.

### Bind parameters

Bind values to `$1`, `$2`, ... placeholders instead of building SQL strings.
The `binds` callback receives a `QwpBindValues` object. Index `0` binds `$1`,
setters must run in ascending index order without gaps, and the callback must
be synchronous:

```typescript
// lease: from db.borrowQuery(), as in Running a query
const since = BigInt(Date.now() - 3_600_000) * 1000n; // microseconds

const query = await lease.query(
  "SELECT * FROM trades " +
    "WHERE symbol = $1 AND price > $2 AND timestamp > $3 LIMIT $4",
  {
    binds: (binds) =>
      binds
        .setVarchar(0, "BTC-USDT")
        .setDouble(1, 60_000)
        .setTimestampMicros(2, since)
        .setLong(3, 100),
  },
);
for await (const batch of query) console.log(batch.rowCount);
await query.completion;
```

| Setter                                                        | Bind type                                          |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `setBoolean(index, value)`                                    | `BOOLEAN`                                          |
| `setByte(index, value)`                                       | `BYTE`                                             |
| `setShort(index, value)`                                      | `SHORT`                                            |
| `setChar(index, value)`                                       | `CHAR`, a one-character `string`                   |
| `setInt(index, value)`                                        | `INT`                                              |
| `setLong(index, value)`                                       | `LONG`, a safe-integer `number` or a `bigint`      |
| `setFloat(index, value)`                                      | `FLOAT`                                            |
| `setDouble(index, value)`                                     | `DOUBLE`                                           |
| `setDate(index, millis)`                                      | `DATE`, milliseconds since the epoch               |
| `setTimestampMicros(index, micros)`                           | `TIMESTAMP`, microseconds since the epoch          |
| `setTimestampNanos(index, nanos)`                             | `TIMESTAMP_NS`, nanoseconds since the epoch        |
| `setVarchar(index, value)`                                    | `VARCHAR`, also for `STRING` and `SYMBOL` columns  |
| `setUuid(index, text)` or `setUuid(index, low, high)`         | `UUID`                                             |
| `setLong256(index, w0, w1, w2, w3)`                           | `LONG256`, least significant word first            |
| `setGeohash(index, precisionBits, bits)`                      | `GEOHASH`                                          |
| `setDecimal64(index, scale, unscaled)`                        | `DECIMAL` up to 18 digits                          |
| `setDecimal128(index, scale, low, high)`                      | `DECIMAL` up to 38 digits                          |
| `setDecimal256(index, scale, w0, w1, w2, w3)`                 | `DECIMAL` up to 76 digits, least significant first |
| `setNull(index, type)`                                        | A typed `NULL`, for example `QWP_COLUMN_TYPE.LONG` |
| `setNullDecimal64/128/256(index, scale)`                      | A `NULL` decimal with a scale                      |
| `setNullGeohash(index, precisionBits)`                        | A `NULL` geohash with a precision                  |

`setVarchar(index, null)` and `setUuid(index, null)` also bind a `NULL`.
`IPV4`, `BINARY`, and array values cannot be bound. Bind an IPv4 address as
text and cast it in SQL, as in `WHERE address = $1::ipv4`.

### Result values

| QuestDB type                       | JavaScript value                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| `BOOLEAN`                          | `boolean`. `NULL` cannot be stored and reads as `false`                              |
| `BYTE`, `SHORT`                    | `number`. `NULL` cannot be stored and reads as `0`                                   |
| `INT`, `FLOAT`, `DOUBLE`           | `number`                                                                             |
| `LONG`                             | `bigint`                                                                             |
| `DATE`                             | `bigint`, milliseconds since the epoch                                               |
| `TIMESTAMP`                        | `bigint`, microseconds since the epoch                                               |
| `TIMESTAMP_NS`                     | `bigint`, nanoseconds since the epoch                                                |
| `CHAR`                             | `string` of one character                                                            |
| `VARCHAR`, `STRING`, `SYMBOL`      | `string`                                                                             |
| `UUID`                             | `{ high: bigint, low: bigint }`, the first and last 64 bits                          |
| `LONG256`                          | `{ words: [w0, w1, w2, w3] }`, signed 64-bit `bigint` words, least significant first |
| `IPV4`                             | `number`, the packed address as a signed 32-bit integer                              |
| `GEOHASH`                          | `{ bits: bigint, precisionBits: number }`                                            |
| `BINARY`                           | `Uint8Array`                                                                         |
| `DECIMAL`                          | `{ unscaled: bigint, scale: number }`                                                |
| `DOUBLE[]` and other array types   | `{ dimensions: number[], values: number[] }`, values in row-major order              |

`NULL` reads as `null` for every other type. `batch.columns[i].type` is a
numeric code that matches the `QWP_COLUMN_TYPE` constants. A column type that
QWP cannot carry, such as `INTERVAL`, fails the query: cast it to `VARCHAR` in
SQL. Converting the less direct forms:

```typescript
import type { QwpUuidValue } from "@questdb/nodejs-client";

// TIMESTAMP (microseconds) to a Date
const toDate = (micros: bigint) => new Date(Number(micros / 1000n));

// UUID to its canonical text
const toUuid = ({ high, low }: QwpUuidValue) => {
  const hex =
    high.toString(16).padStart(16, "0") + low.toString(16).padStart(16, "0");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
};

// IPV4 to dotted-quad text
const toIpv4 = (packed: number) =>
  [24, 16, 8, 0].map((shift) => (packed >>> shift) & 255).join(".");
```

### DDL and DML

`CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, and `UPDATE` run through the
same `query()` call. They return no batches, and `completion` resolves with
`kind: "exec-done"` and the affected row count:

```typescript
import { connectQwpNodeClient } from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
const lease = await db.borrowQuery();
try {
  const create = await lease.query(`
    CREATE TABLE IF NOT EXISTS trades (
      symbol SYMBOL, side SYMBOL, price DOUBLE, amount DOUBLE,
      timestamp TIMESTAMP
    ) TIMESTAMP(timestamp) PARTITION BY DAY`);
  await create.completion;

  const insert = await lease.query(
    "INSERT INTO trades (symbol, side, price, amount, timestamp) " +
      "VALUES ($1, $2, $3, $4, now())",
    {
      binds: (binds) =>
        binds
          .setVarchar(0, "SOL-USDT")
          .setVarchar(1, "buy")
          .setDouble(2, 142.5)
          .setDouble(3, 3),
    },
  );
  const done = await insert.completion;
  if (done.kind === "exec-done") {
    console.log(`inserted ${done.rowsAffected} row(s)`); // a bigint
  }
} finally {
  await lease.close();
  await db.close();
}
```

`rowsAffected` is `0n` for DDL. A failed statement rejects `completion` with a
`QwpEgressQueryError`. Use `INSERT` for occasional writes and the sender for
streams of rows.

:::warning A statement can run twice after a reconnect

When the connection fails before the reply to a statement arrives, the session
runs the statement again on the next connection, as it does with a query. If
QuestDB had already completed it, the statement takes effect twice and still
reports `exec-done`: an `INSERT` adds its rows again, and
`UPDATE trades SET amount = amount - 1` subtracts twice. For a statement that
must not run twice, use one of these:

- A statement that a second run does not change, such as one that sets a value
  rather than adjusting it.
- A connection with failover off, through `failover=off` or
  `reconnect: false`. A lost reply then fails the statement, which may still
  have taken effect, so check the table before running it again.
- The [sender](#data-ingestion), writing to a table with
  [deduplication](/docs/concepts/deduplication/).

:::

### Cancellation and timeouts

A query timeout covers the whole query, from the `query()` call until the last
batch is consumed. When it expires, the client cancels the query on the server.
Stopping a query while it streams its result needs a positive `initialCredit`,
as the caution below explains:

```typescript
import {
  QwpEgressQueryTimeoutError,
  connectQwpNodeClient,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient(
  "ws::addr=localhost:9000;" +
    "query_timeout_ms=30000;" + // default for every query of this client
    "initial_credit=1048576;", // lets a timeout stop a streaming query
);
const lease = await db.borrowQuery();
try {
  const query = await lease.query(
    "SELECT * FROM trades WHERE timestamp IN '$today'",
    { timeoutMs: 5_000 }, // overrides the default
  );
  for await (const batch of query) console.log(batch.rowCount);
  await query.completion;
} catch (error) {
  if (!(error instanceof QwpEgressQueryTimeoutError)) throw error;
  console.warn(`gave up after ${error.timeoutMs} ms`);
} finally {
  await lease.close();
  await db.close();
}
```

:::caution Set `initialCredit` on queries you may stop early

As of QuestDB 10.1, the server does not see a cancellation while it streams a
result faster than your code reads it. Without a positive `initialCredit`, a
`cancel()`, an expired timeout, or leaving a `for await` loop early does not
stop such a query. The client then waits up to `cancelDrainTimeoutMs` for the
query to end, and fails the session with `QwpEgressQueryCancelTimeoutError` if
it does not. A failed session runs no further queries: close it and open
another. A pooled lease's `close()` blocks for several seconds while this
happens, and the pool then replaces the connection.

With a positive `initialCredit`, the server stops whenever it is that many
bytes ahead of your code and waits for more credit, so it sees the
cancellation, and the query ends at once.

:::

- `query_timeout_ms` (`queryTimeoutMs` as an option) sets the default for
  every query. `0`, the default, disables it, and a per-query `timeoutMs`
  overrides it.
- `query.cancel()` cancels explicitly. Iteration then throws a
  `QwpEgressQueryError` with `status` `10` (`CANCELLED`).
- Leaving a `for await` loop early, with `break`, `return`, or an exception,
  cancels the query and rejects `completion` with
  `QwpEgressQueryAbandonedError`.
- `query.awaitCompletion(timeoutMs)` waits without cancelling, and resolves
  `false` if the query is still running.
- `cancelDrainTimeoutMs` (`query_close_timeout_ms`, default `5000`) bounds how
  long a cancelled, timed-out, or abandoned query may take to end before the
  session fails.
- The lease or session stays usable after a query error, and, with a positive
  `initialCredit`, after a timeout or a cancellation. A statement that the
  server completes despite the timeout still succeeds, so a statement that
  took effect is never reported as timed out.

### Flow control and buffering

By default the server streams results as fast as the network allows. A
positive `initialCredit` caps how many bytes the server sends ahead of your
code. The client replenishes the credit as you consume each batch, so set it
on queries with large results when memory is limited, and on queries you may
cancel, time out, or abandon, as
[Cancellation and timeouts](#cancellation-and-timeouts) explains:

```typescript
// lease: from db.borrowQuery(), as in Running a query
const query = await lease.query("SELECT * FROM trades", {
  initialCredit: 1024 * 1024, // at most 1 MiB in flight
});
for await (const batch of query) console.log(batch.rowCount);
await query.completion;
```

- `autoCredit: false` turns off replenishment. Grant more with
  `query.grantCredit(bytes)`.
- `bufferPoolSize` (`buffer_pool_size`, default `4`) bounds the decoded batches
  waiting for your code.
- `maxBatchRows` (`max_batch_rows`) asks the server for batches of at most that
  many rows, from 1 to 1,048,576.

### Zero-copy result views

`queryViews()` passes each batch to a callback as reusable column views,
without building a JavaScript array per column. Typed accessors read values
straight from the received bytes:

```typescript
// lease: from db.borrowQuery(), as in Running a query
const query = await lease.queryViews(
  "SELECT timestamp, symbol, price FROM trades",
  (batch) => {
    const symbol = batch.column(1);
    const price = batch.column(2);
    for (let row = 0; row < batch.rowCount; row++) {
      if (!price.isNull(row)) {
        console.log(symbol.getSymbol(row), price.getDouble(row));
      }
    }
  },
  { initialCredit: 256 * 1024 },
);
await query.completion;
```

The batch, its columns, and any byte array they return are valid only until
the callback returns. Copy values you keep, or call `batch.materialize()` for
an independent `QwpResultBatch`. `batch.forEachRow((row) => ...)` iterates with
one reusable row view that has the same accessors, taking a column index. The
callback is awaited before the next batch.

| Column view accessor                   | Column types                                           |
| -------------------------------------- | ------------------------------------------------------ |
| `isNull(row)`                          | Every type                                             |
| `getBoolean(row)`                      | `BOOLEAN`                                              |
| `getByte(row)`, `getShort(row)`        | `BYTE`, `SHORT`                                        |
| `getChar(row)`                         | `CHAR`                                                 |
| `getInt(row)`                          | `INT`, `IPV4`                                          |
| `getFloat(row)`, `getDouble(row)`      | `FLOAT`, `DOUBLE`                                      |
| `getLong(row)`                         | `LONG`, `DATE`, `TIMESTAMP`, `TIMESTAMP_NS`, as `bigint` |
| `getString(row)`                       | `VARCHAR`, `SYMBOL`                                    |
| `getSymbol(row)`, `getSymbolId(row)`   | `SYMBOL`                                               |
| `getUuidHigh(row)`, `getUuidLow(row)`  | `UUID`                                                 |
| `getLong256Word(row, word)`            | `LONG256`, word `0` least significant                  |
| `getDecimalUnscaled(row)`              | `DECIMAL`, with the column's `scale`                   |
| `getGeohashBits(row)`                  | `GEOHASH`, with the column's `precisionBits`           |
| `getUtf8View(row)`, `getBinaryView(row)` | `VARCHAR`, `BINARY`, as zero-copy bytes              |
| `getArrayView(row)`                    | Arrays, as zero-copy encoded bytes                     |
| `get(row)`                             | Every type, as the value in [Result values](#result-values) |

An accessor called on a column of another type throws a `TypeError`. A `NULL`
reads as a zero value, `NaN`, or `null`, depending on the accessor, so check
`isNull()` first.

### Compression

`compression=zstd` (`compression: "zstd"`) asks the server to compress result
batches, which helps on slow links and wide results. `compression_level` sets
the level, from 1 (the default, lowest CPU cost) to 22, and the server may
cap it. The default, `raw`, sends results uncompressed. `auto` accepts
compression when the server offers it.
A lease's or session's `negotiatedCompression` reports what the server chose.

## Concurrency

Node.js runs your code on one thread, but `await` interleaves asynchronous
tasks:

- **Give each producer its own sender.** A sender holds one row in progress
  and one batch. Sharing it between tasks is safe only if every row is built
  in one synchronous chain from `table()` to `at()`, with no `await` in
  between. Even then, the tasks share flushes, acknowledgements, and failures:
  one task's `flushAndWait()` waits for the other's rows, and a terminal
  rejection ends the sender for both. Use `borrowSender()` per task, or one
  `Sender` per producer.
- **Run one query at a time per session or lease.** Borrow a lease per
  concurrent query, up to `query_pool_max`.
- **Create clients inside each worker thread.** Client objects cannot be
  passed between `worker_threads`.
- **Give each store-and-forward sender its own journal.** Senders sharing an
  `sf_dir` need distinct `sender_id` values. The pool does this for its own
  senders.

The `QwpClient` handle itself is safe to share across tasks.

## Reconnection and failover

Senders and query sessions reconnect on their own when a connection drops,
for example when QuestDB restarts, the network fails, or QuestDB closes an
idle connection. This applies to a single open source server as well as to a
cluster, and so do the rules below for replayed rows, re-executed queries, and
retry limits.

:::note Enterprise

Failing over to another QuestDB host requires QuestDB Enterprise with
replication. Open source QuestDB runs as a single node, and the client
reconnects to it.

Try it with a [free 30-day trial](https://questdb.com/enterprise/trial/).
:::

To fail over between the nodes of a cluster, list every node in `addr`:

```text
wss::addr=db-a:9000,db-b:9000,db-c:9000;token=YOUR_TOKEN;
```

### Ingestion reconnects and failover

- **A connected sender never gives up.** After an outage it retries with
  jittered exponential backoff, from `reconnect_initial_backoff_millis` (100)
  up to `reconnect_max_backoff_millis` (5000), until `close()` or a terminal
  error. No setting limits these retries.
- **Rows keep flowing into the replay queue** during an outage, until the
  [backpressure](#backpressure) limit. After reconnecting, the sender replays
  every unacknowledged batch, so delivery is at least once.
- **The first connection fails fast by default.** `initial_connect_retry`
  chooses: `off` tries each endpoint once, `sync` retries for up to
  `reconnect_max_duration_millis` (5 minutes) and then rejects with
  `QwpReconnectExhaustedError`, and `async` returns at once and connects in the
  background. Setting a `reconnect_*` key without `initial_connect_retry`
  selects `sync`. A process that starts while no primary is reachable, for
  example during a failover when only replicas answer, fails this first
  connection. To start anyway and queue rows until a primary appears, set
  `lazy_connect=on` on the [pooled client](#the-pooled-client), or
  `initial_connect_retry=async` on a `Sender`.
- **Rejected credentials are not retried.** HTTP 401 or 403 ends the attempt
  for every endpoint, because a credential applies to the whole cluster. A
  store-and-forward sender, or one started with `async`, that has connected
  before keeps retrying instead, so it does not lose queued rows.
- **A batch the server keeps rejecting** becomes terminal after
  `max_frame_rejections` (4) consecutive rejections over at least
  `poison_min_escalation_window_millis` (5000) of connected time.
- **Writes find the primary.** With several endpoints, a replica rejects the
  upgrade, and the sender moves on to the next endpoint until it reaches the
  primary.

<SfDedupWarning />

### Query reconnects and failover

A query session reconnects when its connection fails, to the next healthy
endpoint when `addr` lists several, and runs the active query again from the
start. SQL errors do not trigger a reconnect.

:::warning Re-executed queries deliver rows again

After a reconnect, the query restarts from its first row. Batches you already
consumed are delivered again, so code that accumulates results sees duplicate
rows unless it clears them in `onFailoverReset`. A statement such as an
`INSERT` or `UPDATE` runs again too, and can take effect twice: see
[DDL and DML](#ddl-and-dml).

:::

```typescript
// lease: from db.borrowQuery(), or a session from connectQwpNodeEgress()
let rows: unknown[] = [];
const query = await lease.query(
  "SELECT * FROM trades WHERE timestamp IN '$today'",
  {
    onFailoverReset: () => {
      rows = []; // the query restarts from its first row
    },
  },
);
for await (const batch of query) rows.push(...batch.rows());
await query.completion;
```

The callback runs before the query is sent again, and can be async. An
`egress` or session option of the same name applies to queries without their
own.

| Key                           | Default | Purpose                                                         |
| ----------------------------- | ------- | --------------------------------------------------------------- |
| `failover`                    | `on`    | `off` surfaces connection failures without reconnecting         |
| `failover_max_attempts`       | `8`     | Endpoint sweeps per reconnect                                   |
| `failover_backoff_initial_ms` | `50`    | First delay between sweeps                                      |
| `failover_backoff_max_ms`     | `1000`  | Longest delay between sweeps                                    |
| `failover_max_duration_ms`    | `30000` | Time limit per reconnect. `0` disables it                       |
| `target`                      | `any`   | Server role a query accepts: `any`, `primary`, or `replica`     |
| `zone`                        | unset   | Preferred zone. Endpoints in other zones remain a fallback      |

When the limits run out, the query rejects with `QwpReconnectExhaustedError`
and the session stays failed: close it and open another. The limits also apply
to an idle session, which reconnects as soon as its connection drops, so an
outage of a few seconds, such as a QuestDB restart, can use them up. No
connection event reports this: the session's next query rejects with
`QwpReconnectExhaustedError`. A pooled client can lend such a connection once.
Close that lease and borrow again, and the pool opens a new connection.

`target` and `zone` route queries only, because writes always go to the
primary. As options, the failover keys go in `reconnect`
(`failoverMaxAttempts` and so on), and `reconnect: false` turns reconnecting
off.

### Connection events

`reconnect.onEvent` reports connection changes on both senders and query
sessions. Callbacks run on a later event-loop turn, outside the protocol code,
and a bounded inbox of 64 events (`connection_listener_inbox_capacity`) drops
the oldest event when a callback falls behind.

A `disconnected` event alone does not mean that QuestDB is down. QuestDB closes
a connection that carries no traffic for
[`http.net.connection.timeout`](/docs/configuration/http-server/#httpnetconnectiontimeout),
5 minutes by default, and a proxy or load balancer in between may close it
sooner. The client then reconnects at once and reports `disconnected` followed
by `reconnected`. To detect an outage, watch for `all-endpoints-unreachable`,
which fires each time a reconnect sweep reaches no endpoint:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig(
  "ws::addr=db-a.example.com:9000,db-b.example.com:9000;",
  {
    qwp: {
      webSocket: {
        reconnect: {
          onEvent: (event) => {
            const endpoint = event.endpoint ? String(event.endpoint) : "";
            if (event.kind === "all-endpoints-unreachable") {
              console.warn("QuestDB is unreachable; rows stay queued", event.cause);
            } else if (event.kind === "failed-over") {
              console.info(`failed over to ${endpoint}`);
            } else if (event.kind === "auth-failed") {
              console.error("credentials rejected; fix them and restart");
            } else {
              // Includes the disconnected/reconnected pair of an idle close
              console.info("QuestDB connection:", event.kind, endpoint);
            }
          },
        },
      },
    },
  },
);
await sender.close();
```

| `kind`                      | Fired when                                                  |
| --------------------------- | ----------------------------------------------------------- |
| `connected`                 | The first connection succeeds                               |
| `disconnected`              | An established connection closes: once per outage, and after an idle close |
| `reconnected`               | A reconnect reaches the endpoint used before                |
| `failed-over`               | A reconnect reaches a different endpoint                    |
| `endpoint-attempt-failed`   | One endpoint fails during a sweep                           |
| `all-endpoints-unreachable` | A sweep tries every endpoint without success                |
| `auth-failed`               | The server rejects the credentials with HTTP 401 or 403     |
| `durable-ack-unavailable`   | A store-and-forward sender waits for an endpoint with durable acknowledgement |
| `durable-ack-persistent-failure` | An orphan journal drain stopped waiting for durable acknowledgement |
| `primary-unavailable`       | No reachable endpoint can act as the primary right now      |

Each event has `kind`, `attempt`, `timestampMs`, `endpoint`,
`previousEndpoint`, and `cause`. When a query session reconnects, the active
query restarts from its first row: clear rows you accumulated in
[`onFailoverReset`](#query-reconnects-and-failover), or they appear twice.

## Error handling

### Errors from calls

| Where                                 | What you get                                                                                                                                                                  | What to do                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A column setter, `at()`, `row()`      | `TypeError`, `RangeError`, or `QwpWriterRowError` for an invalid value. A plain `Error` for a setter called before `table()`, or for a column this sender wrote with another type | Fix the value. Only that row is discarded                     |
| `connect()`, the first flush or query | `QwpUpgradeError` with `kind` and, for HTTP rejections, `statusCode`; or `QwpFailoverError`                                                                                   | Check the address, credentials, and server version            |
| `connectQwpNodeClient()`, a borrow that opens a connection | `QwpPoolResourceError`, with the connection error, such as a `QwpUpgradeError` or a `QwpReplayStoreLockedError`, as `cause`                                     | Handle `cause` as for a standalone sender                     |
| `flushAndWait()`, `waitForAck()`      | `QwpIngressNackError` with a `senderError` payload, when QuestDB rejects a batch during the wait                                                                              | See [Server rejections](#server-rejections)                   |
| Any later call, `close()` included    | `QwpReplayRejectedError`, once a rejected batch has ended the sender                                                                                                          | Close the sender and create a new one. See below              |
| `flush()`, `at()` under backpressure  | `QwpMemoryReplayAppendTimeoutError`, or a `QwpReplayStore*Error` with store-and-forward                                                                                       | Slow the producer, or raise the limits                        |
| Query iteration and `completion`      | `QwpEgressQueryError`, `QwpEgressQueryTimeoutError`, `QwpEgressQueryAbandonedError`, `QwpEgressQueryCancelTimeoutError`                                                       | See [Query errors](#query-errors)                             |
| `close()`                             | `QwpSenderCloseTimeoutError` when acknowledgements do not arrive in time, or the error of publishing the remaining rows, such as `QwpMemoryReplayAppendTimeoutError`, when that fails first | Unacknowledged data is lost, unless store-and-forward kept it |

`QwpUpgradeError.kind` is one of `authentication`, `role-rejected`,
`http-rejected`, `version-mismatch`, `capability-mismatch`, `timeout`, or
`transport`. `retryable` tells whether a later attempt can succeed.

After a terminal failure, such as a schema mismatch, or rejected credentials on
a sender that does not [retry them](#authentication-and-tls), the sender is
finished, and every later call, `close()` included, rejects. After a rejected
batch, the error is a `QwpReplayRejectedError`. It carries the rejected
`frameSequence` and `status` but no `senderError`, so read the details in
`onSenderError`, or from the `QwpIngressNackError` of a wait that was running
when the rejection arrived. Close the sender, catching the error, and create a
new one. A pooled lease is replaced automatically on the next `borrowSender()`.

Without store-and-forward, the failure discards every row that QuestDB has not
acknowledged: the rejected batch, including its rows for other tables, every
batch flushed after it, even though those `flush()` calls resolved, and the
rows still staged. Wait for acknowledgements before you treat rows as stored,
or use store-and-forward.

With store-and-forward, the journal keeps a batch that QuestDB rejected, so a
new sender with the same `sf_dir` and `sender_id` sends it again and fails the
same way. Delivery from that journal stops until you act, so alert on terminal
failures, for example on an `onError` event with `terminal` set. Then either:

- Fix the cause, for example the column type, so that QuestDB accepts the
  batch, and start a new sender. It delivers the rejected batch and every
  batch journalled after it.
- Move the journal directory, `<sf_dir>/<sender_id>`, out of `sf_dir`, and
  start a new sender with an empty journal. QuestDB never receives the batches
  in the moved journal, including those journalled after the rejected one.

Validate rows before you write them to avoid most terminal rejections: QuestDB
rejects a value of the wrong type for an existing column, and a designated
timestamp before 1970.

### Server rejections

QuestDB validates batches after `flush()` has returned. A batch it cannot
store, for example a string for a `DOUBLE` column, is rejected asynchronously.
`onSenderError` receives one immutable `QwpSenderError` per rejection:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("ws::addr=localhost:9000;", {
  qwp: {
    webSocket: {
      onSenderError: (error) => {
        console.error(
          `QuestDB rejected frames ${error.fromFsn}..${error.toFsn}: ` +
            `${error.category} (${error.appliedPolicy}) ` +
            `${error.tableName ?? ""} ${error.serverMessage ?? ""}`,
        );
      },
    },
  },
});
try {
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USDT")
    .floatColumn("price", 2615.54)
    .at(Date.now(), "ms");
  await sender.flushAndWait(); // also rejects with QwpIngressNackError
} finally {
  await sender.close();
}
```

| Field              | Type     | Meaning                                                                                                  |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------- |
| `category`         | `string` | `schema-mismatch`, `parse-error`, `security-error`, `write-error`, `internal-error`, `not-writable`, `limit-exceeded`, `dictionary-gap`, `cancelled`, `protocol-violation`, `data-loss`, or `unknown` |
| `appliedPolicy`    | `string` | `terminal`, `retriable`, `retriable-other`, or `abandoned`                                               |
| `serverStatusByte` | `number` | The QWP status code, such as `3` for a schema mismatch                                                   |
| `serverMessage`    | `string` | The server's explanation, when it sent one                                                               |
| `fromFsn`, `toFsn` | `bigint` | The inclusive range of rejected frame sequences, comparable with `flushAndGetSequence()` results        |
| `messageSequence`  | `bigint` | The sequence of the server response                                                                      |
| `tableName`        | `string` | The table, when the rejection concerns one                                                               |
| `detectedAtMs`     | `number` | Client time of the rejection                                                                             |
| `quarantinedPath`  | `string` | For `data-loss`: where store-and-forward kept the bytes it could not replay                              |

- **`terminal`**: schema mismatches, parse errors, and security errors cannot
  succeed on replay. The sender stops, and later calls reject with
  `QwpReplayRejectedError`. Without store-and-forward, every batch QuestDB has
  not acknowledged is lost. With store-and-forward, the rejected batch stays
  in the journal. See [Errors from calls](#errors-from-calls).
- **`retriable`** and **`retriable-other`**: the client reconnects, to another
  endpoint for `retriable-other`, and replays from the last acknowledgement.
- **`abandoned`**: store-and-forward recovery could not replay data, which is
  kept at `quarantinedPath` when possible.

Without `onSenderError`, the client logs each rejection to the console:
retriable ones as warnings, the others as errors. `onError`, set next to
`onSenderError` (under `qwp.webSocket` for a `Sender`, under `ingress` for the
pooled client), additionally receives an event for each rejection and for
terminal session failures, with `error`, `terminal`, and a `metrics` snapshot.

Dispatch on `category`, not on the message. Messages are English text written
by the server, may change between versions, and can quote table names, column
names, and the rejected values, so sanitize them before showing them to end
users or sending them to an external error tracker. QuestDB returns no request
ID: correlate with server logs through the frame range and `detectedAtMs`.

### Query errors

A query that fails on the server throws a `QwpEgressQueryError` from the
iteration and rejects `completion`. It has `status`, `message`, and the
session-local `requestId`. For SQL errors the message starts with the position
of the error, as in `[14] table does not exist [table=no_such_table]`. The
lease remains usable:

```typescript
import {
  QwpEgressQueryError,
  connectQwpNodeClient,
} from "@questdb/nodejs-client";

const db = await connectQwpNodeClient("ws::addr=localhost:9000;");
const lease = await db.borrowQuery();
try {
  const query = await lease.query("SELECT * FROM no_such_table");
  for await (const batch of query) console.log(batch.rowCount);
  await query.completion;
} catch (error) {
  if (!(error instanceof QwpEgressQueryError)) throw error;
  // status 5: [14] table does not exist [table=no_such_table]
  console.error(`status ${error.status}: ${error.message}`);
} finally {
  await lease.close();
  await db.close();
}
```

The same message rules apply as for ingestion: dispatch on `status`, and
sanitize the text before showing it to end users, since it can quote SQL.

| `status` | Name              | Meaning                                                                                                                                          |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `5`      | `PARSE_ERROR`     | Invalid SQL, a missing table or column, or a bind value the query cannot take, such as text for `LIMIT $1`                                       |
| `6`      | `INTERNAL_ERROR`  | The server could not run the query, including a bind value it cannot convert, such as `abc` for a `DOUBLE` column, and a column type QWP cannot carry |
| `8`      | `SECURITY_ERROR`  | The principal lacks a permission                                                                                                                 |
| `10`     | `CANCELLED`       | The query was cancelled                                                                                                                          |
| `11`     | `LIMIT_EXCEEDED`  | A server limit was reached: its query timeout, its memory limit, or a row larger than its send buffer                                            |

QuestDB 10.1 does not send status `3` (`SCHEMA_MISMATCH`) for queries. A bind
value of the wrong type arrives as `5` or `6`, so do not treat every `6` as a
server fault.

### Error classes

| Class                               | Raised when                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `QwpUpgradeError`                   | A WebSocket upgrade fails. `kind` gives the reason                               |
| `QwpFailoverError`                  | Every endpoint of one connection attempt failed. `attempts` lists them           |
| `QwpReconnectExhaustedError`        | A `sync` first connection or a query failover ran out of its limits              |
| `QwpDurableAckUnavailableError`     | Durable acknowledgement was requested but the server does not support it         |
| `QwpIngressNackError`               | QuestDB rejected a batch during a wait. `senderError` holds the details          |
| `QwpReplayRejectedError`            | A rejected batch ended the sender; later calls reject with it                    |
| `QwpBatchTooLargeError`             | One row is larger than the server's batch limit                                  |
| `QwpWriterRowError`                 | A compiled writer rejected a row                                                 |
| `QwpMemoryReplayAppendTimeoutError` | The memory queue stayed full past its deadline                                   |
| `QwpReplayStoreAppendTimeoutError`  | The store-and-forward journal stayed full past its deadline                      |
| `QwpReplayStoreFullError`           | The journal is full and `backpressurePolicy` is `"error"`                        |
| `QwpReplayStoreLockedError`         | Another process owns the journal, or a crashed one left its lock                 |
| `QwpSenderCloseTimeoutError`        | `close()` timed out waiting for acknowledgements                                 |
| `QwpEgressQueryError`               | The server reported a query error. `status` gives the code                       |
| `QwpEgressQueryTimeoutError`        | A query ran past its timeout and was cancelled                                   |
| `QwpEgressQueryAbandonedError`      | Iteration stopped before the query finished                                      |
| `QwpEgressQueryCancelTimeoutError`  | A stopped query did not end within `cancelDrainTimeoutMs`, so the session failed |
| `QwpEgressSessionClosedError`       | The query session or its connection is closed                                    |
| `QwpPoolAcquireTimeoutError`        | No pooled connection became free within `acquire_timeout_ms`                     |
| `QwpPoolResourceError`              | The pool could not open a connection. `cause` holds the connection error         |
| `QwpClientClosedError`              | The pooled client or a lease is already closed                                   |

The [API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
lists every exported class.

## Closing

Close every sender, session, and lease in a `finally` block:

- **`Sender.close()` and `QwpSender.close()`** publish completed rows, then wait
  up to `close_flush_timeout_millis` (5 seconds) for QuestDB to acknowledge
  everything. If it does not, `close()` rejects with
  `QwpSenderCloseTimeoutError`: in memory mode the unacknowledged data is lost,
  and with store-and-forward it stays on disk for the next sender. If
  publishing the remaining rows fails first, for example because the replay
  queue is full, `close()` rejects with that error instead and logs the
  timeout. `0` skips the wait. An unfinished row is discarded with a warning,
  and an open transaction is rolled back.
- **A borrowed sender's `close()`** publishes and returns the connection
  without waiting. Call `flushAndWait()` first where you need the
  acknowledgement.
- **`QwpEgressSession.close()`** closes the connection, ending a running
  query. **A query lease's `close()`** cancels a running query and returns the
  connection to the pool.
- **`QwpClient.close()`** closes both pools.

To drain on shutdown, wait for acknowledgements before closing:

```typescript
// sender: a Sender or QwpSender, created as in Writing rows
process.once("SIGTERM", async () => {
  try {
    await sender.flushAndWait(10_000);
  } finally {
    await sender.close();
  }
});
```

## Fire-and-forget UDP

The `udp` schema sends rows as self-contained QWP datagrams. It suits
high-volume metrics on a trusted network, where losing a datagram is
acceptable:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("udp::addr=localhost:9007;");
await sender.connect();
try {
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USDT")
    .floatColumn("price", 2615.54)
    .at(Date.now(), "ms");
  await sender.flush();
} finally {
  await sender.close();
}
```

UDP has no authentication, TLS, acknowledgements, transactions, reconnection,
or store-and-forward. Datagrams default to port `9007` and to
`max_datagram_size=1400` bytes, and `multicast_ttl` sets the multicast TTL. A
row that cannot fit one datagram fails with `QwpUdpDatagramTooLargeError`. The
server must enable the UDP receiver with
[`qwp.udp.enabled=true`](/docs/configuration/qwp/#udp-receiver).
`connectQwpNodeUdpSender()` creates the same sender from an options object.

## Production example: TLS, token, and multiple hosts

A long-running ingestion service with TLS, a bearer token, two endpoints, a
disk journal, error and connection callbacks, and a clean shutdown. It consumes
trades in batches from an upstream queue, such as a Kafka topic, and commits
each batch upstream once the batch is on disk in the store-and-forward journal.

The service has one producer and runs no queries, so it uses a standalone
`Sender` rather than the pooled client, as [Choose an API](#choose-an-api)
recommends. Its journal is `<sf_dir>/feed-1`, and its `close()` rejects when
acknowledgements are missing instead of logging a warning.

Create `trades` before the first start. Replay after a reconnect or a restart
is at least once, so the table deduplicates on the identity of a trade: the
designated timestamp, the symbol, and the venue's trade ID. Keys without the
trade ID would merge distinct trades of one symbol that share a timestamp:

```questdb-sql
CREATE TABLE trades (
  symbol SYMBOL,
  side SYMBOL,
  price DOUBLE,
  amount DOUBLE,
  trade_id LONG,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol, trade_id);
```

For an existing table, add the column with
`ALTER TABLE trades ADD COLUMN trade_id LONG`, then enable deduplication with
[`ALTER TABLE trades DEDUP ENABLE UPSERT KEYS(timestamp, symbol, trade_id)`](/docs/query/sql/alter-table-enable-deduplication/).

`ingest()` writes every batch its feed yields, flushes it, commits it upstream,
and drains when the feed ends:

```typescript
import { Sender } from "@questdb/nodejs-client";

interface Trade {
  tradeId: bigint; // the venue's trade ID
  symbol: string;
  side: string;
  price: number;
  amount: number;
  timestamp: number; // milliseconds since the epoch
}

interface TradeBatch {
  trades: Trade[];
  commit(): Promise<void>; // acknowledges the batch upstream
}

export async function ingest(feed: AsyncIterable<TradeBatch>): Promise<void> {
  const token = process.env.QUESTDB_TOKEN;
  if (!token) throw new Error("QUESTDB_TOKEN is not set");

  const sender = await Sender.fromConfig(
    "wss::addr=db-a.example.com:9000,db-b.example.com:9000;" +
      `token=${token};` +
      "sf_dir=/var/lib/trade-feed/qdb-sf;sender_id=feed-1;" +
      "sf_durability=append;initial_connect_retry=async;",
    {
      qwp: {
        webSocket: {
          onSenderError: (error) =>
            console.error(
              `QuestDB rejected frames ${error.fromFsn}..${error.toFsn}:`,
              error.category,
              error.appliedPolicy,
              error.serverMessage,
            ),
          reconnect: {
            onEvent: (event) =>
              console.info(
                "QuestDB connection:",
                event.kind,
                event.endpoint ? String(event.endpoint) : "",
              ),
          },
        },
      },
    },
  );
  await sender.connect(); // returns at once: initial_connect_retry=async

  try {
    for await (const batch of feed) {
      for (const trade of batch.trades) {
        await sender
          .table("trades")
          .symbol("symbol", trade.symbol)
          .symbol("side", trade.side)
          .floatColumn("price", trade.price)
          .floatColumn("amount", trade.amount)
          .intColumn("trade_id", trade.tradeId)
          .at(trade.timestamp, "ms");
      }
      // Auto-flush runs only when a row completes, so flush the end of each
      // batch. Otherwise its last rows wait for the next trade.
      await sender.flush();
      // The batch is on disk in the journal, so the commit cannot lose it.
      await batch.commit();
    }
    // Rows still unacknowledged stay in the journal for the next start.
    await sender.flushAndWait(10_000);
  } finally {
    await sender.close();
  }
}
```

With `sf_durability=append`, `flush()` resolves only after the batch is synced
to disk, so a batch committed upstream survives a power loss as well as a
process crash. With the default `memory` durability, a host crash can lose
batches in the journal: commit upstream after `flushAndWait()` instead.

A terminal rejection, such as a schema mismatch, makes the next `at()` or
`flush()` reject and ends `ingest()`. The rejected batch stays in the journal,
so a restart sends it again and fails the same way until you
[fix the cause or move the journal aside](#errors-from-calls).

End the feed on `SIGTERM` so that `ingest()` drains and closes the sender. The
journal under `sf_dir` keeps every unacknowledged batch, so a restart with the
same `sender_id` delivers what this process did not, and the deduplication
keys discard rows that QuestDB had already stored. After a crash, a restarted
container may first need the
[lock recovery step](#recovering-a-journal-after-a-crash).

## Migrating from ILP

For an existing `Sender`, switching to QWP is a change of the connect string:

```diff
- const sender = await Sender.fromConfig("http::addr=localhost:9000;");
+ const sender = await Sender.fromConfig("ws::addr=localhost:9000;");
```

Check these differences before rolling it out:

- **`flush()` no longer waits for the server.** Over HTTP, `flush()` resolves
  after QuestDB answers the request. Over QWP it resolves once the batch is
  queued locally. Use `flushAndWait()` where code relied on the old behavior.
- **`close()` flushes.** QWP publishes completed rows on `close()` and waits
  up to 5 seconds for acknowledgements. ILP discarded unflushed rows.
- **Auto-flush thresholds are smaller.** QWP defaults to 1,000 rows or 100 ms,
  where `http::` uses 75,000 rows or 1 second. Set `auto_flush_rows` and
  `auto_flush_interval` to keep the old batch sizes.
- **ILP-only keys are rejected.** `init_buf_size`, `max_buf_size`,
  `request_timeout`, `retry_timeout`, `protocol_version`, and `tls_ca` fail
  with a hint. Use `tls_roots` for a CA file, and
  `reconnect_max_duration_millis` for the startup retry budget.
- **Decimals need no protocol version.** `decimalColumn()` and
  `decimalColumnText()` work over QWP without `protocol_version=3`.
- **Errors arrive asynchronously.** Register `onSenderError` instead of
  relying on `flush()` to throw.
- **More column types and queries.** QWP adds the `QwpSender` setters, compiled
  writers, and SQL queries over the same connect string.

Migrate one sender at a time: ILP and QWP senders can write to the same tables
at once.

## Legacy ILP transports

The `Sender` class keeps its InfluxDB Line Protocol transports for existing
applications and for QuestDB versions before 10.0:

```typescript
import { Sender } from "@questdb/nodejs-client";

const sender = await Sender.fromConfig("http::addr=localhost:9000;");
try {
  await sender
    .table("trades")
    .symbol("symbol", "ETH-USDT")
    .symbol("side", "buy")
    .floatColumn("price", 2615.54)
    .floatColumn("amount", 0.5)
    .at(Date.now(), "ms");
  await sender.flush(); // ILP discards unflushed rows on close()
} finally {
  await sender.close();
}
```

`http::` and `https::` send each flush as an HTTP request and report errors
from `flush()`. `tcp::` and `tcps::` keep one connection and authenticate with
a JWK key. ILP-specific options, such as `protocol_version` and
`stdlib_http`, are described in the
[`SenderOptions` reference](https://questdb.github.io/nodejs-questdb-client/classes/_questdb_nodejs-client.SenderOptions.html).
For the protocol itself, see the
[ILP overview](/docs/connect/compatibility/ilp/overview/). Applications that
must run on Node.js releases older than 20.18.1 can use client 3.x, which
supports ILP only.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [Browser client](/docs/connect/clients/browser/)
- [QWP ingress protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
  and [QWP egress protocol](/docs/connect/wire-protocols/qwp-egress-websocket/)
- [Client failover concepts](/docs/high-availability/client-failover/concepts/)
- [Node.js API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
  and the [client repository](https://github.com/questdb/nodejs-questdb-client)
- [Query & SQL overview](/docs/query/overview/)
