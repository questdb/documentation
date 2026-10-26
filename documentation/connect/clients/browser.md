---
slug: /connect/clients/browser
title: Browser client for QuestDB
sidebar_label: Browser
description:
  "Use the QuestDB browser client to ingest data and stream SQL query results
  over QWP WebSockets directly from web applications, with session-cookie or
  token authentication."
---

import SfDedupWarning from "../../partials/_sf-dedup-warning.partial.mdx"

The QuestDB browser client, `@questdb/browser-client`, lets a web application
write rows to QuestDB and stream SQL query results over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), the QuestDB Wire
Protocol, with no backend service in between. It runs on the browser's native
`WebSocket` and `fetch` and contains no Node.js modules or polyfills, which
suits trading dashboards, monitoring consoles, and internal tools that read
and write QuestDB directly. Ingestion batches rows, tracks server
acknowledgements, and replays unacknowledged data after a reconnect. Queries
stream typed result batches with bind parameters, timeouts, and failover.

Key capabilities:

- **Ingestion**: a fluent row API and compiled object-row writers, automatic
  batching and table creation, and transactions.
- **Querying**: streaming `SELECT` results, DDL and DML statements, typed bind
  parameters, timeouts, and compressed results.
- **One pooled handle**: `connectQwpBrowserClient()` owns a sender pool and a
  query pool for components that both write and read.
- **Browser authentication**: HttpOnly session cookies for applications on
  QuestDB's origin, or a credential, such as a refreshed OIDC access token,
  for applications on their own origin.
- **Resilience**: reconnect and failover with in-memory replay.

:::tip Server-side JavaScript

Node.js services use the [Node.js client](/docs/connect/clients/nodejs/),
`@questdb/nodejs-client`. It has the same QWP API, plus connect strings,
store-and-forward to disk, and the ILP transports.

:::

## Requirements

- `@questdb/browser-client` 5.0.0 or later.
- QuestDB 10.1.0 or later.
- A browser with `WebSocket`, `fetch`, `URL`, `TextEncoder`, and `TextDecoder`,
  which every current version of Chrome, Edge, Firefox, and Safari provides.
- QuestDB's `/write/v4` and `/read/v1` WebSocket routes reachable from the
  page, either on the page's own origin, usually through a reverse proxy, or
  directly from a page origin that QuestDB allows. See
  [Deployment](#deployment).

## Installation

```shell
npm install @questdb/browser-client
```

The package ships ES module and CommonJS builds with TypeScript declarations,
and works with bundlers such as Vite, webpack, Rollup, and esbuild. Import from
the package root: other import paths are not supported.

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";
```

The examples on this page are TypeScript ES modules that use top-level
`await`, which browsers and bundlers support in modules. A `declare` line
stands for a value or function your application provides, such as an access
token.

## Quick start

The following module creates a table, writes a trade, waits for QuestDB to
acknowledge it, and reads it back. It assumes that the page and QuestDB share
an origin, which a reverse proxy provides, and that QuestDB authentication is
off. Later sections cover [deployment](#deployment) and
[authentication](#authentication).

```typescript
import { connectQwpBrowserClient } from "@questdb/browser-client";

// QuestDB on the page's own origin: ws: for http pages, wss: for https.
const origin = new URL("/", window.location.href);
origin.protocol = origin.protocol === "https:" ? "wss:" : "ws:";

// One handle for the component. It owns a sender pool and a query pool,
// and derives the /write/v4 and /read/v1 routes from the origin.
const db = await connectQwpBrowserClient({ cluster: { url: origin } });

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
  const sender = await db.borrowSender();
  try {
    await sender
      .table("trades")
      .symbol("symbol", "ETH-USDT")
      .symbol("side", "buy")
      .floatColumn("price", 2615.54)
      .floatColumn("amount", 0.5)
      .at(Date.now(), "ms");
    if (!(await sender.flushAndWait(10_000))) {
      throw new Error("QuestDB did not acknowledge the row in 10 seconds");
    }
  } finally {
    await sender.close(); // returns the sender to the pool
  }

  // Query: an acknowledged row becomes visible shortly afterwards, so poll.
  const lease = await db.borrowQuery();
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const query = await lease.query(
        "SELECT symbol, side, price, amount, timestamp FROM trades " +
          "WHERE symbol = $1 LIMIT -5",
        { binds: (binds) => binds.setVarchar(0, "ETH-USDT") },
      );
      let rows = 0;
      for await (const batch of query) {
        for (const row of batch.rows()) {
          // [ 'ETH-USDT', 'buy', 2615.54, 0.5, 1735689600000000n ]
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

`connectQwpBrowserClient()` opens one ingestion and one query WebSocket before
it resolves, so it fails fast when QuestDB is unreachable. `borrowSender()` and
`borrowQuery()` lease a connection, and `close()` on the lease returns it.
`flushAndWait()` resolves `true` once QuestDB has acknowledged the rows, and
`false` if no acknowledgement arrived in time. The rows then stay queued and
are still delivered.

:::caution Read before building on these snippets

- **Unacknowledged rows live in the page's memory.** `flush()` hands rows to a
  local queue and returns, and a closed or reloaded tab loses whatever QuestDB
  has not acknowledged yet. Call `flushAndWait()` where rows must be stored.
- **Server rejections arrive asynchronously.** A row QuestDB cannot store fails
  after `flush()` has returned. Register `onSenderError` to observe it, and
  expect a terminal rejection to end the sender. See
  [Server rejections](#server-rejections).
- **An acknowledgement is not visibility.** QuestDB applies acknowledged rows
  to the table shortly afterwards, so a query issued straight after
  `flushAndWait()` can miss them. Poll with a deadline, as above.
- **Pass the unit to `at()`.** Without one, `at()` reads microseconds, so
  `at(Date.now())` stores a timestamp in January 1970. Write
  `at(Date.now(), "ms")`.
- **`LONG`, `DATE`, and `TIMESTAMP` values come back as `bigint`.**
  `JSON.stringify()` throws on a `bigint`. Convert with `Number()` or
  `String()` first.
- **Everything in browser code is visible to its user.** Never ship a shared
  password or long-lived token in a public application. See
  [Choosing credentials](#choosing-credentials).

:::

## Choose an API

| You need                                     | Use                                      | Returns                                                 |
| -------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Ingestion and queries in one component       | `connectQwpBrowserClient(options)`       | `QwpClient`, which lends `QwpSender` and `QwpQueryLease` |
| Ingestion only                               | `connectQwpBrowserSender(options)`       | `QwpSender`                                             |
| Queries only, such as a dashboard            | `connectQwpBrowserEgress(options)`       | `QwpEgressSession`                                      |
| Repeated object rows with a fixed schema     | `sender.writer(table, schema)`           | `QwpTableWriter`                                        |
| A session cookie before connecting           | `bootstrapQwpBrowserSession(options)`    | `{ url, status, serviceAccount }`                       |

The browser client takes options objects, not connect strings, and has no
`QDB_CLIENT_CONF` environment variable: pass settings from your application's
own configuration. Option names match the typed options of the Node.js client:
`url`, `failoverUrls`, `autoFlushRows`, `queryTimeoutMs`, and so on. `createQwpBrowserSender()` and
`createQwpBrowserClient()` build the same objects as their `connect*`
counterparts without opening a connection.

A standalone sender or query session takes the full endpoint URL:
`/write/v4` for ingestion and `/read/v1` for queries. The pooled client takes
the origin, or a base path under a reverse proxy, and derives both routes.

## Deployment

QuestDB accepts a browser's WebSocket upgrade when the page has the same
origin as QuestDB, or when the page's origin is listed in
`qwp.browser.allowed.origins`. It rejects every other origin, which protects
the server from cross-site WebSocket hijacking.

### Same-origin applications

A reverse proxy serves the application and forwards QuestDB's routes on the
same origin. Same-origin applications can authenticate with session cookies.
The proxy must forward WebSocket upgrades and keep the browser's `Host`
header, port included, because QuestDB compares it with the `Origin` header.
For nginx:

```nginx
# In the http block
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# In the server block that serves the application
location ~ ^/(write/v4|read/v1|exec)$ {
    proxy_pass http://questdb:9000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $http_host;
}
```

`/exec` is needed only for [session cookies](#session-cookies). When the proxy
terminates TLS and reaches QuestDB over plain HTTP, set
[`qwp.browser.tls.termination.enabled=true`](/docs/configuration/qwp/#qwpbrowsertlsterminationenabled)
on QuestDB, or the `https://` origin fails the same-origin check. Enable it only
when QuestDB's HTTP port is reachable through the proxy alone.

### Applications on another origin

An application served from its own origin, such as
`https://app.example.com`, connects to QuestDB directly once QuestDB lists that
origin:

```ini title="server.conf"
qwp.browser.allowed.origins=https://app.example.com
```

[`qwp.browser.allowed.origins`](/docs/configuration/qwp/#qwpbrowserallowedorigins)
takes a comma-separated list of exact origins, written as browsers send them:
scheme, lowercase host, and a port only when it is not the default. Wildcards
and paths are rejected. The setting can be changed at runtime with
`reload_config()`. It covers the QWP routes only and does not enable CORS on
QuestDB's REST API. QuestDB ignores cookies on these cross-origin upgrades, so
an authenticated application passes a credential with [`auth`](#credentials-for-applications-on-another-origin).

Pages served over `https:` must connect with `wss:`, because browsers block
plain `ws:` connections from secure pages.

## Authentication

A browser cannot add an `Authorization` header to a WebSocket upgrade, so the
client authenticates in one of two ways:

| Application                                                 | Mechanism                                                  | Option                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| On QuestDB's origin, usually through a reverse proxy        | An HttpOnly session cookie, created by a REST request      | `sessionBootstrap`, or `bootstrapQwpBrowserSession()` |
| On its own origin, listed in `qwp.browser.allowed.origins`  | A credential sent with every WebSocket upgrade             | `auth`                                              |

Both take a credential in one of two forms: `{ type: "bearer", token }` for a
QuestDB Enterprise REST token or an OIDC access token, or
`{ type: "basic", username, password }`. A connection uses one mechanism:
`auth` cannot be combined with `sessionBootstrap`.

### Session cookies

With `sessionBootstrap`, the client authenticates over REST before every
connection attempt, the first one and each reconnect and failover. QuestDB
answers with an HttpOnly `qdb_session` cookie, which the browser then sends with
the WebSocket upgrade:

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";

// Your application's OIDC access token or QuestDB REST token
declare const accessToken: string;

const url = new URL("/write/v4", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const sender = await connectQwpBrowserSender({
  url,
  sessionBootstrap: {
    authentication: { type: "bearer", token: accessToken },
    // QuestDB Enterprise: act as this service account. Optional.
    serviceAccount: "dashboard_writer",
  },
});
await sender.close();
```

- The bootstrap sends `GET /exec` beside the endpoint, with the credential and
  `credentials: "include"`. Set `sessionBootstrap.url` when the proxy exposes
  `/exec` under another path.
- JavaScript never reads the cookie. The REST and WebSocket routes must share
  the page's origin, or the browser may not store or send it.
- `serviceAccount` makes the session act as that QuestDB Enterprise service
  account, which the user must be allowed to assume. See
  [service account assumption](/docs/security/rbac/#service-account-assumption).
- `bootstrapQwpBrowserSession({ url, authentication })` runs the same request
  once, and a sender or session opened afterwards uses the cookie it set.
  Unlike `sessionBootstrap`, it does not run again before a reconnect, so
  prefer the option for long-lived connections.

A rejected bootstrap fails the connection with a
`QwpBrowserSessionBootstrapError`, whose `statusCode` and `responseBody` show
the server's answer and whose `kind` is `"authentication"` for HTTP 401 and
403. It is the one place where a browser application sees the HTTP status of an
authentication failure:

```typescript
import {
  QwpBrowserSessionBootstrapError,
  bootstrapQwpBrowserSession,
} from "@questdb/browser-client";

try {
  await bootstrapQwpBrowserSession({
    url: new URL("/exec", window.location.href),
    authentication: { type: "basic", username: "admin", password: "quest" },
  });
} catch (error) {
  if (error instanceof QwpBrowserSessionBootstrapError) {
    console.error(`login failed with HTTP ${error.statusCode}`);
  }
  throw error;
}
```

### Credentials for applications on another origin

With `auth`, the client sends the credential with every WebSocket upgrade, in
the `Sec-WebSocket-Protocol` header that browser JavaScript can set. Pass a
function to supply a fresh OIDC access token before every connection attempt,
so a long-lived sender or query session survives token expiry:

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";

// Your identity provider SDK: returns a current OIDC access token.
declare function getAccessToken(signal: AbortSignal): Promise<string>;

const sender = await connectQwpBrowserSender({
  url: "wss://questdb.example.com:9000/write/v4",
  auth: async ({ signal }) => ({
    type: "bearer",
    token: await getAccessToken(signal),
  }),
});
await sender.close();
```

- A fixed credential works as well: `auth: { type: "bearer", token }`.
- The function runs before the first connection and before each reconnect and
  failover. Its `signal` aborts when the attempt is abandoned, and its time
  counts against `connectTimeoutMs`.
- A function that throws fails the attempt with a `QwpUpgradeError` of kind
  `"authentication"`, with the thrown error as `cause`. Reconnects retry it
  with backoff, unless the thrown error has `retryable: false`.
- The credential is base64url-encoded, not encrypted: use `wss:`.
- QuestDB accepts the credential only from an origin in
  `qwp.browser.allowed.origins`, including QuestDB's own origin if a page
  served there uses `auth`. It creates no session, so the connection runs as
  the credential's own principal and cannot assume a service account.
- With QuestDB authentication off, a listed origin needs no credential.

A credential QuestDB rejects fails the upgrade with an opaque
`QwpUpgradeError` (kind `"opaque"`), because browsers hide the HTTP status of a
failed WebSocket upgrade.

### Choosing credentials

Anything a browser application holds, its user can read. Choose credentials
accordingly:

- **Per-user OIDC access tokens** (QuestDB Enterprise) are the right choice for
  applications used by people. Your application obtains them with its identity
  provider's SDK, using the Authorization Code flow with PKCE, and QuestDB
  applies each user's own permissions. See
  [OpenID Connect](/docs/security/oidc/).
- **REST tokens** suit internal tools. Issue short-lived tokens for an account
  with only the permissions the application needs: `HTTP`, plus `SELECT` or
  `INSERT` on its tables.
- **Basic authentication** sends a password the user can read. Keep it for
  development and trusted internal tools.

### Unsupported authentication paths

| Path                                       | Status                                                         | Alternative                                                                                |
| ------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `Authorization` or custom upgrade headers  | Browsers do not let JavaScript set them                        | `sessionBootstrap` or `auth`                                                               |
| Interactive OIDC login                     | The client does not run it                                     | Log in with your identity provider's SDK and pass the token                                |
| Service account with `auth`                | Not available: `auth` creates no session                       | Use `sessionBootstrap` with `serviceAccount`, or authenticate as the service account       |
| Mutual TLS (client certificates)           | Not supported. QuestDB does not negotiate client certificates  | Use a token over `wss`                                                                     |

## Data ingestion

### Writing rows

A sender builds rows one at a time and sends them in batches:

1. `table(name)` selects the table.
2. Column setters add values, such as `symbol()` for `SYMBOL` columns and
   `floatColumn()` for `DOUBLE` columns. They can come in any order.
3. `at(value, unit)` or `atNow()` closes the row. Await it.
4. Repeat, then call `flush()` or let [auto-flush](#auto-flush) send the batch.

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";

const trades = [
  { symbol: "ETH-USDT", side: "buy", price: 2615.54, amount: 0.5 },
  { symbol: "BTC-USDT", side: "sell", price: 65432.1, amount: 0.0012 },
];

const url = new URL("/write/v4", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const sender = await connectQwpBrowserSender({ url });
try {
  for (const trade of trades) {
    await sender
      .table("trades")
      .symbol("symbol", trade.symbol)
      .symbol("side", trade.side)
      .floatColumn("price", trade.price)
      .floatColumn("amount", trade.amount)
      .at(Date.now(), "ms");
  }
  await sender.flushAndWait();
} finally {
  await sender.close(); // publishes what remains and waits for the ACK
}
```

QuestDB creates missing tables and columns from the first row that uses them.
The designated timestamp column of an auto-created table is named `timestamp`.
`at()` and `atNow()` return a promise that settles once any auto-flush the row
triggered has been published, so awaiting them propagates errors and slows the
producer down when the queue is full. A sender is not safe to share between
independent producers: give each producer its own. See
[Concurrency](#concurrency).

A setter that rejects a value throws, and `at()` rejects with the error. Either
way, the sender discards the row in progress, including its table selection,
and keeps the rows completed before it. `cancelRow()` discards the row in
progress without an error, and `reset()` also discards every row not yet
flushed.

### Column types

| Method                                     | QuestDB type                         | Accepted values                                                       |
| ------------------------------------------ | ------------------------------------ | --------------------------------------------------------------------- |
| `symbol(name, value)`                      | `SYMBOL`                             | Any value, converted with `String()`                                  |
| `stringColumn(name, value)`                | `VARCHAR`                            | `string`                                                              |
| `booleanColumn(name, value)`               | `BOOLEAN`                            | `boolean`                                                             |
| `floatColumn(name, value)`, `doubleColumn(name, value)` | `DOUBLE`                | `number`                                                              |
| `float32Column(name, value)`               | `FLOAT`                              | `number`                                                              |
| `intColumn(name, value)`, `longColumn(name, value)` | `LONG`                      | Safe-integer `number` or `bigint`                                     |
| `int32Column(name, value)`                 | `INT`                                | Integer `number`                                                      |
| `shortColumn(name, value)`                 | `SHORT`                              | Integer from -32768 to 32767                                          |
| `byteColumn(name, value)`                  | `BYTE`                               | Integer from -128 to 127                                              |
| `charColumn(name, value)`                  | `CHAR`                               | `string` of one UTF-16 code unit                                      |
| `timestampColumn(name, value, unit)`       | `TIMESTAMP`, or `TIMESTAMP_NS` for `"ns"` | `number` or `bigint`. Units `"ns"`, `"us"` (default), `"ms"`; `"ns"` needs a `bigint` |
| `dateColumn(name, millis)`                 | `DATE`                               | Milliseconds since the epoch, `number` or `bigint`                    |
| `uuidColumn(name, value)`                  | `UUID`                               | Canonical UUID text, or 16 bytes in RFC 4122 order as a `Uint8Array`  |
| `long256Column(name, w0, w1, w2, w3)`      | `LONG256`                            | Four 64-bit `bigint` words, least significant first                   |
| `ipv4Column(name, value)`                  | `IPV4`                               | Dotted-quad text, or the packed address as a `number`                 |
| `geohashColumn(name, bits, precisionBits)` | `GEOHASH`                            | `bigint` bits, with a precision from 1 to 60 bits                     |
| `binaryColumn(name, value)`                | `BINARY`                             | `Uint8Array`, copied on append                                        |
| `arrayColumn(name, value)`                 | `DOUBLE[]`                           | Rectangular nested `number` arrays, 1 to 32 dimensions                |
| `decimalColumnText(name, value)`           | `DECIMAL`                            | Decimal text or a `number`                                            |
| `decimalColumn(name, unscaled, scale)`     | `DECIMAL`                            | `bigint`, or big-endian two's complement `Int8Array`; scale 0 to 76   |
| `decimal64Column(name, unscaled, scale)`   | `DECIMAL`, up to 18 digits           | `bigint`; scale 0 to 18                                               |
| `decimal128Column(name, unscaled, scale)`  | `DECIMAL`, up to 38 digits           | `bigint`; scale 0 to 38                                               |
| `decimal256Column(name, unscaled, scale)`  | `DECIMAL`, up to 76 digits           | `bigint`; scale 0 to 76                                               |
| `longArrayColumn(name, value)`             | `LONG[]`                             | Current QuestDB servers reject it                                     |

Despite their names, `floatColumn()` and `intColumn()` write the 64-bit
`DOUBLE` and `LONG` types. Use `float32Column()` and `int32Column()` for the
32-bit `FLOAT` and `INT`.

`arrayColumn()` writes `DOUBLE` arrays only: a two-level array creates a
`DOUBLE[][]` column. A `DECIMAL` column that ingestion creates gets the widest
precision of its setter, `DECIMAL(76, scale)` for `decimalColumnText()` and
`decimalColumn()`. Create decimal columns first with the precision you need,
and see [decimal](/docs/query/datatypes/decimal/).

### Null values

Pass `null` or `undefined` to a setter, or skip the setter. Either way the
column is omitted from the row and QuestDB stores `NULL`. There is no
`setNull()` or `nullColumn()` method.

```typescript
// sender: a QwpSender, created as in Writing rows
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

### Designated timestamp

`at(value, unit)` sets the
[designated timestamp](/docs/concepts/designated-timestamp/) from your data, and
`atNow()` lets the server assign the time the row arrives. The unit is `"ns"`,
`"us"`, or `"ms"`, and defaults to `"us"`. A `Date` is not accepted: pass
`date.getTime()` with `"ms"`. Nanoseconds need a `bigint` and create a
`TIMESTAMP_NS` column on a new table.

### Compiled object-row writers

When rows already exist as objects with one shape, compile the table schema
once and append objects. With TypeScript, each row is type-checked against the
schema:

```typescript
import {
  connectQwpBrowserSender,
  designatedTimestamp,
  double,
  symbol,
} from "@questdb/browser-client";

const url = new URL("/write/v4", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const sender = await connectQwpBrowserSender({ url });
try {
  const trades = sender.writer("trades", {
    symbol: symbol(),
    side: symbol(),
    price: double(),
    amount: double(),
    timestamp: designatedTimestamp("ms"),
  });
  await trades.rows([
    { symbol: "ETH-USDT", side: "buy", price: 2615.54, amount: 0.5,
      timestamp: Date.now() },
    { symbol: "BTC-USDT", side: "sell", price: 65432.1, amount: 0.0012,
      timestamp: Date.now() },
  ]);
  await sender.flush();
} finally {
  await sender.close();
}
```

A writer validates every field before it stages a row. A field that is absent,
`null`, or `undefined` writes `NULL`, and the `designatedTimestamp()` field is
required in every row. An invalid row is rejected with a `QwpWriterRowError`
that names the table, the column, and, for `rows()`, the row index. Writers
offer a field for every column type: `symbol()`, `varchar()`, `char()`,
`bool()`, `byte()`, `short()`, `int32()`, `long()`, `float32()`, `double()`,
`timestamp(unit)`, `designatedTimestamp(unit)`, `date()`, `binary()`,
`uuid()`, `long256()`, `ipv4()`, `geohash(precisionBits)`,
`decimal64(scale)`, `decimal128(scale)`, `decimal256(scale)`, `doubleArray()`,
and `longArray()`.

## Flushing and acknowledgements

### Auto-flush

A sender publishes its batch when it completes a row that crosses any of these
thresholds:

| Trigger                       | Default | Option                |
| ----------------------------- | ------- | --------------------- |
| Rows in the batch             | `1000`  | `autoFlushRows`       |
| Milliseconds since last flush | `100`   | `autoFlushIntervalMs` |
| Estimated batch bytes         | off     | `autoFlushBytes`      |

`0` disables one trigger, and `autoFlush: false` disables all three. The checks
run when a row completes. No timer runs, so rows below the thresholds wait for
the next row, `flush()`, or `close()`.

### Waiting for acknowledgements

`flush()` publishes the batch to an in-memory replay queue and returns. A
background task sends queued data in order, and QuestDB acknowledges it once it
is committed to the [write-ahead log](/docs/concepts/write-ahead-log/).

| Call                                | Resolves when                                       | Result                                                                   |
| ----------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `flush()`                           | The batch is in the replay queue                    | `true` if it published anything                                          |
| `flushAndWait(timeoutMs?)`          | QuestDB acknowledged everything published so far    | `true`, or `false` when acknowledgements stalled for `timeoutMs` (15 s) |
| `flushAndGetSequence()`             | The batch is in the replay queue                    | Highest frame sequence it published as a `bigint`, or `-1n`             |
| `waitForAck(sequence, timeoutMs?)`  | The acknowledged sequence reaches `sequence`        | `true`, or `false` when acknowledgements stalled for `timeoutMs`        |

Waiting is optional: a sender that never waits still delivers every row in
order while the page is open. But the queue lives in the page's memory. Rows
that QuestDB has not acknowledged are lost when the user closes or reloads the
tab, and the browser does not wait for `close()` during unload. Call
`flushAndWait()` at the points where rows must be stored, such as after a user
submits an order ticket. A `false` result means only that the wait ran out: the
rows are still queued, and sending them again would duplicate them.

There is no store-and-forward in the browser. Data that must survive the page
belongs in a backend service with the Node.js client's
[store-and-forward](/docs/connect/clients/nodejs/#store-and-forward).

### Transactions

With `transactional: true`, auto-flushed batches stay in an open server-side
transaction, and an explicit `flush()` or `flushAndWait()` commits them
together. A transaction is atomic per table. `close()` does not commit: QuestDB
rolls the open transaction back.

### Durable acknowledgement

:::note Enterprise

Durable acknowledgement requires QuestDB Enterprise with primary replication.

Try it with a [free 30-day trial](https://questdb.com/enterprise/trial/).
:::

With `requestDurableAck: true`, the acknowledged sequence advances only after a
batch is uploaded to object storage, so `flushAndWait()` waits for durable
upload. The browser negotiates it through a WebSocket subprotocol, and a server
that cannot confirm it fails the connection with
`QwpDurableAckUnavailableError`.

### Backpressure

The replay queue holds up to 128 MiB. When it is full, `flush()` and the `at()`
that triggered an auto-flush wait up to 30 seconds for acknowledgements to free
space, then reject with `QwpMemoryReplayAppendTimeoutError`. The
`memoryReplayMaxBytes` and `memoryReplayAppendDeadlineMs` options change both
limits. `sender.metrics.ingress` reports the queue, for example
`memoryReplayUsedBytes` and `waitingMemoryReplayAppends`.

After connecting, the client reads the server's batch size limit and splits
larger batches. `maxBatchSizeBytes` sets a lower limit of your own.

## Querying

### Running a query

A query session runs SQL over its own WebSocket. Results stream as batches of
rows:

```typescript
import {
  QwpEgressQueryError,
  connectQwpBrowserEgress,
} from "@questdb/browser-client";

const url = new URL("/read/v1", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const session = await connectQwpBrowserEgress({
  url,
  initialCredit: 1024 * 1024, // at most 1 MiB in flight per query
  queryTimeoutMs: 30_000,
});
try {
  const query = await session.query(
    "SELECT timestamp, symbol, first(price) AS open, last(price) AS close " +
      "FROM trades WHERE timestamp IN '$today' AND symbol = $1 " +
      "SAMPLE BY 1m",
    { binds: (binds) => binds.setVarchar(0, "BTC-USDT") },
  );
  for await (const batch of query) {
    const names = batch.columns.map((column) => column.name);
    for (const values of batch.rows()) {
      const row = Object.fromEntries(names.map((n, i) => [n, values[i]]));
      console.log(row);
    }
  }
  await query.completion;
} catch (error) {
  if (!(error instanceof QwpEgressQueryError)) throw error;
  console.error(`query failed with status ${error.status}: ${error.message}`);
} finally {
  await session.close();
}
```

- `query()` returns a `QwpEgressQuery`. Iterate it with `for await` to receive
  `QwpResultBatch` objects, each with `rowCount`, `columns` (each with `name`,
  numeric `type`, and `values`), `rows()`, and `get(rowIndex, columnIndex)`.
- `completion` resolves after the last batch with
  `{ kind: "result-end", totalRows }`, or `{ kind: "exec-done", rowsAffected }`
  for a statement such as `CREATE TABLE` or `INSERT`, which returns no
  batches. Both counts are `bigint`.
- Consume or cancel every result before awaiting `completion`: the client
  stops reading once four decoded batches are waiting.
- A session runs one query at a time. Starting another while one is active
  rejects with `a QWP query is already active on this connection`. Run
  concurrent queries on separate sessions or
  [pooled leases](#the-pooled-client).
- A positive `initialCredit` limits how far the server streams ahead of your
  code, which matters in browsers: the browser buffers incoming WebSocket
  frames before JavaScript reads them. The default, `0`, is unlimited.

### Bind parameters

Bind values to `$1`, `$2`, ... placeholders instead of building SQL strings.
Index `0` binds `$1`, setters must run in ascending index order without gaps,
and the `binds` callback must be synchronous.

| Setter                                                | Bind type                                          |
| ----------------------------------------------------- | -------------------------------------------------- |
| `setBoolean(index, value)`                            | `BOOLEAN`                                          |
| `setByte(index, value)`                               | `BYTE`                                             |
| `setShort(index, value)`                              | `SHORT`                                            |
| `setChar(index, value)`                               | `CHAR`, a one-character `string`                   |
| `setInt(index, value)`                                | `INT`                                              |
| `setLong(index, value)`                               | `LONG`, a safe-integer `number` or a `bigint`      |
| `setFloat(index, value)`                              | `FLOAT`                                            |
| `setDouble(index, value)`                             | `DOUBLE`                                           |
| `setDate(index, millis)`                              | `DATE`, milliseconds since the epoch               |
| `setTimestampMicros(index, micros)`                   | `TIMESTAMP`, microseconds since the epoch          |
| `setTimestampNanos(index, nanos)`                     | `TIMESTAMP_NS`, nanoseconds since the epoch        |
| `setVarchar(index, value)`                            | `VARCHAR`, also for `STRING` and `SYMBOL` columns  |
| `setUuid(index, text)` or `setUuid(index, low, high)` | `UUID`                                             |
| `setLong256(index, w0, w1, w2, w3)`                   | `LONG256`, least significant word first            |
| `setGeohash(index, precisionBits, bits)`              | `GEOHASH`                                          |
| `setDecimal64(index, scale, unscaled)`                | `DECIMAL` up to 18 digits                          |
| `setDecimal128(index, scale, low, high)`              | `DECIMAL` up to 38 digits                          |
| `setDecimal256(index, scale, w0, w1, w2, w3)`         | `DECIMAL` up to 76 digits, least significant first |
| `setNull(index, type)`                                | A typed `NULL`, for example `QWP_COLUMN_TYPE.LONG` |
| `setNullDecimal64/128/256(index, scale)`              | A `NULL` decimal with a scale                      |
| `setNullGeohash(index, precisionBits)`                | A `NULL` geohash with a precision                  |

`setVarchar(index, null)` and `setUuid(index, null)` also bind a `NULL`.
`IPV4`, `BINARY`, and array values cannot be bound. Bind an IPv4 address as
text and cast it in SQL, as in `WHERE address = $1::ipv4`.

### Result values

| QuestDB type                     | JavaScript value                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `BOOLEAN`                        | `boolean`. `NULL` cannot be stored and reads as `false`                              |
| `BYTE`, `SHORT`                  | `number`. `NULL` cannot be stored and reads as `0`                                   |
| `INT`, `FLOAT`, `DOUBLE`         | `number`                                                                             |
| `LONG`                           | `bigint`                                                                             |
| `DATE`                           | `bigint`, milliseconds since the epoch                                               |
| `TIMESTAMP`                      | `bigint`, microseconds since the epoch                                               |
| `TIMESTAMP_NS`                   | `bigint`, nanoseconds since the epoch                                                |
| `CHAR`                           | `string` of one character                                                            |
| `VARCHAR`, `STRING`, `SYMBOL`    | `string`                                                                             |
| `UUID`                           | `{ high: bigint, low: bigint }`, the first and last 64 bits                          |
| `LONG256`                        | `{ words: [w0, w1, w2, w3] }`, signed 64-bit `bigint` words, least significant first |
| `IPV4`                           | `number`, the packed address as a signed 32-bit integer                              |
| `GEOHASH`                        | `{ bits: bigint, precisionBits: number }`                                            |
| `BINARY`                         | `Uint8Array`                                                                         |
| `DECIMAL`                        | `{ unscaled: bigint, scale: number }`                                                |
| `DOUBLE[]` and other arrays      | `{ dimensions: number[], values: number[] }`, values in row-major order              |

`NULL` reads as `null` for every other type. A column type that QWP cannot
carry, such as `INTERVAL`, fails the query: cast it to `VARCHAR` in SQL. To
chart a `TIMESTAMP`, convert it with `new Date(Number(micros / 1000n))`.

### Cancellation, timeouts, and failover

- `queryTimeoutMs` sets a session default, and `timeoutMs` per query overrides
  it. An expired query is cancelled and rejects with
  `QwpEgressQueryTimeoutError`.
- `query.cancel()` cancels explicitly: iteration then throws a
  `QwpEgressQueryError` with `status` `10`. Leaving a `for await` loop early
  also cancels, and rejects `completion` with `QwpEgressQueryAbandonedError`.
- The session stays usable after a timeout, a cancellation, or a query error.
- After a connection failure the session reconnects and runs the active query
  again from the start, so rows you already consumed arrive again. Clear
  accumulated results in the query's `onFailoverReset` callback. See
  [Failover and reconnect](#failover-and-reconnect).

### Zero-copy views and compression

`session.queryViews(sql, onBatch, options)` passes each batch to a callback as
reusable column views instead of building JavaScript arrays. The views are
valid only until the callback returns: copy what you keep, or call
`batch.materialize()`. The Node.js client page lists the
[view accessors](/docs/connect/clients/nodejs/#zero-copy-result-views), which
are the same in the browser.

`compression: "zstd"` asks the server to compress result batches, and
`compressionLevel` sets the level from 1 to 22. The browser sends the request
as a URL parameter, and the decoder is part of the package.
`session.negotiatedCompression` reports what the server chose.

## The pooled client

`connectQwpBrowserClient()` returns a `QwpClient`: one handle with a pool of
sender connections and a pool of query connections. Endpoints and
authentication go in `cluster`, and side-specific options in `ingress`,
`egress`, and `pool`:

```typescript
import { connectQwpBrowserClient } from "@questdb/browser-client";

declare const accessToken: string;

const db = await connectQwpBrowserClient({
  cluster: {
    url: "wss://questdb-a.example.com:9000",
    failoverUrls: ["wss://questdb-b.example.com:9000"],
    auth: { type: "bearer", token: accessToken },
  },
  ingress: { autoFlushRows: 5_000 },
  egress: { compression: "zstd", initialCredit: 1024 * 1024 },
  pool: { senderPoolMax: 2, queryPoolMax: 4 },
});
try {
  const lease = await db.borrowQuery();
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

- `cluster.url` and `failoverUrls` take an origin, a base path under a reverse
  proxy, or an endpoint. Each pool derives its own route, `/write/v4` or
  `/read/v1`, and a `sessionBootstrap` without a `url` derives `/exec` for
  every endpoint.
- `borrowSender()` lends a `QwpSender`. Its `close()` publishes completed rows
  and returns the connection without waiting for acknowledgements, so call
  `flushAndWait()` first where you need them.
- `borrowQuery()` lends a `QwpQueryLease` with `query()` and `queryViews()`.
  Each lease runs one query at a time: borrow one per concurrent query.
- Pool options: `senderPoolMin` and `queryPoolMin` (`1`), `senderPoolMax` and
  `queryPoolMax` (`4`), `acquireTimeoutMs` (`5000`), `idleTimeoutMs`
  (`60000`), and `maxLifetimeMs` (`1800000`). A borrow that waits longer than
  `acquireTimeoutMs` rejects with `QwpPoolAcquireTimeoutError`.
- `connectQwpBrowserClient()` rejects with `QwpPoolResourceError` when it
  cannot open the minimum connections. `createQwpBrowserClient()` returns
  without connecting.

## Concurrency

Browser JavaScript runs on one thread, but `await` interleaves asynchronous
tasks:

- **Give each producer its own sender.** A sender holds one row in progress
  and one batch. Sharing it between tasks is safe only if every row is built
  in one synchronous chain from `table()` to `at()`, with no `await` in
  between. Even then, the tasks share flushes, acknowledgements, and failures.
- **Run one query at a time per session or lease.** Borrow a lease per
  concurrent query.
- **Create clients inside each Web Worker that needs one.** Client objects
  cannot be passed between the page and workers.

## Failover and reconnect

A sender reconnects by default when its connection drops, and replays every
unacknowledged batch from memory, so delivery is at least once. Once a sender
has connected, it retries with jittered exponential backoff until `close()` or
a terminal error, and rows published meanwhile wait in the replay queue.

- **Endpoints**: `url` plus `failoverUrls`, or `cluster.url` plus
  `cluster.failoverUrls` for the pooled client.
- **First connection**: `initialConnectMode` chooses. `"off"`, the default,
  tries each endpoint once. `"sync"` retries for up to
  `reconnect.reconnectMaxDurationMs` (5 minutes) and then rejects with
  `QwpReconnectExhaustedError`. `"async"` returns at once and connects in the
  background.
- **Fixed connection**: `reconnect: false` disables reconnecting.
- **Ingestion endpoints**: only the primary accepts writes, and a browser
  cannot see why an upgrade failed, so it cannot tell a replica's refusal from
  an outage. Avoid listing replicas for ingestion, unless a proxy routes writes
  to the current primary.

:::note Enterprise

Failing over between QuestDB hosts requires QuestDB Enterprise with
replication.

Try it with a [free 30-day trial](https://questdb.com/enterprise/trial/).
:::

<SfDedupWarning />

A query session fails over within limits: `reconnect.failoverMaxAttempts` (8
sweeps), `failoverBackoffInitialMs` (50), `failoverBackoffMaxMs` (1000), and
`failoverMaxDurationMs` (30 seconds). When they run out, the query rejects with
`QwpReconnectExhaustedError`, and the session cannot be used again. `target`
(`"any"`, `"primary"`, or `"replica"`) and `zone` route queries, and the client
checks the server's role and zone after connecting.

:::warning Re-executed queries deliver rows again

After a failover, a query restarts from its first row. Batches you already
consumed are delivered again, so code that accumulates results sees duplicate
rows unless it clears them in `onFailoverReset`.

:::

```typescript
// session: from connectQwpBrowserEgress() or a borrowQuery() lease
let rows: unknown[] = [];
const query = await session.query(
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

`reconnect.onEvent` reports connection changes on senders and query sessions,
with `kind` set to `connected`, `disconnected`, `reconnected`, `failed-over`,
`endpoint-attempt-failed`, `all-endpoints-unreachable`, or `auth-failed`. In a
browser, `auth-failed` comes only from a rejected `sessionBootstrap` request:
other authentication failures surface as `endpoint-attempt-failed`. When a
query session reconnects, its active query restarts from the first row, so
clear accumulated rows in `onFailoverReset`.

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";

// Your user interface
declare function showBanner(text: string): void;
declare function hideBanner(): void;

const sender = await connectQwpBrowserSender({
  url: "wss://questdb.example.com:9000/write/v4",
  reconnect: {
    onEvent: (event) => {
      if (event.kind === "disconnected") showBanner("Reconnecting to QuestDB");
      if (event.kind === "reconnected" || event.kind === "failed-over") {
        hideBanner();
      }
    },
  },
});
await sender.close();
```

## Error handling

### Errors from calls

| Where                                 | What you get                                                                                    | What to do                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A column setter, `at()`, `row()`      | `TypeError`, `RangeError`, or `QwpWriterRowError` for an invalid value                          | Fix the value. Only that row is discarded          |
| Connecting                            | `QwpUpgradeError`, usually of kind `"opaque"`, or `QwpBrowserSessionBootstrapError`             | Check the URL, origin allowlist, and credentials   |
| `connectQwpBrowserClient()`           | `QwpPoolResourceError`, with the connection error as `cause`                                    | As for connecting                                  |
| `flushAndWait()`, `waitForAck()`      | `QwpIngressNackError` with a `senderError` payload                                              | See [Server rejections](#server-rejections)        |
| `flush()`, `at()` under backpressure  | `QwpMemoryReplayAppendTimeoutError`                                                             | Slow the producer, or raise the limits             |
| Query iteration and `completion`      | `QwpEgressQueryError`, `QwpEgressQueryTimeoutError`, `QwpEgressQueryAbandonedError`             | See [Query errors](#query-errors)                  |
| `close()`                             | `QwpSenderCloseTimeoutError` when acknowledgements do not arrive in time                        | The unacknowledged rows are lost                   |

A browser hides the HTTP response of a failed WebSocket upgrade. A wrong URL,
an origin missing from the allowlist, and a rejected `auth` credential all fail
with `QwpUpgradeError` of kind `"opaque"`. Check the browser console and the
QuestDB server log for the reason: QuestDB logs why it refused an upgrade.

After a terminal failure, such as a schema mismatch, the sender is finished.
Every later call, `close()` included, rejects with the same error. Close it,
catching the error, and create a new sender. A pooled lease is replaced on the
next `borrowSender()`.

### Server rejections

QuestDB validates batches after `flush()` has returned. A batch it cannot
store, for example a string for a `DOUBLE` column, is rejected asynchronously.
`onSenderError` receives one immutable `QwpSenderError` per rejection:

```typescript
import { connectQwpBrowserSender } from "@questdb/browser-client";

const url = new URL("/write/v4", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const sender = await connectQwpBrowserSender({
  url,
  onSenderError: (error) => {
    console.error(
      `QuestDB rejected frames ${error.fromFsn}..${error.toFsn}: ` +
        `${error.category} (${error.appliedPolicy}) ` +
        `${error.tableName ?? ""} ${error.serverMessage ?? ""}`,
    );
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
| `category`         | `string` | `schema-mismatch`, `parse-error`, `security-error`, `write-error`, `internal-error`, `not-writable`, `limit-exceeded`, `dictionary-gap`, `cancelled`, `protocol-violation`, or `unknown` |
| `appliedPolicy`    | `string` | `terminal`, `retriable`, or `retriable-other`                                                            |
| `serverStatusByte` | `number` | The QWP status code, such as `3` for a schema mismatch                                                   |
| `serverMessage`    | `string` | The server's explanation, when it sent one                                                               |
| `fromFsn`, `toFsn` | `bigint` | The inclusive range of rejected frame sequences, comparable with `flushAndGetSequence()` results        |
| `messageSequence`  | `bigint` | The sequence of the server response                                                                      |
| `tableName`        | `string` | The table, when the rejection concerns one                                                               |
| `detectedAtMs`     | `number` | Client time of the rejection                                                                             |

A `terminal` rejection, such as a schema mismatch, parse error, or security
error, stops the sender. For `retriable` and `retriable-other`, the client
reconnects and replays from the last acknowledgement. Without `onSenderError`,
the client logs rejections to the browser console. `onError` additionally
receives an event for each rejection and for terminal session failures.

Dispatch on `category`, not on the message. Messages are English text written
by the server, may change between versions, and can quote table names, column
names, and the rejected values, so sanitize them before showing them in your
user interface or sending them to an external error tracker. QuestDB returns
no request ID: correlate with server logs through the frame range and
`detectedAtMs`.

### Query errors

A query that fails on the server throws a `QwpEgressQueryError` from the
iteration and rejects `completion`. It has `status`, `message`, and the
session-local `requestId`. For SQL errors the message starts with the position
of the error. The session remains usable:

```typescript
import {
  QwpEgressQueryError,
  connectQwpBrowserEgress,
} from "@questdb/browser-client";

const url = new URL("/read/v1", window.location.href);
url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

const session = await connectQwpBrowserEgress({ url });
try {
  const query = await session.query("SELECT * FROM no_such_table");
  for await (const batch of query) console.log(batch.rowCount);
  await query.completion;
} catch (error) {
  if (!(error instanceof QwpEgressQueryError)) throw error;
  // status 5: [14] table does not exist [table=no_such_table]
  console.error(`status ${error.status}: ${error.message}`);
} finally {
  await session.close();
}
```

Dispatch on `status`, and sanitize the message before showing it to users,
since it can quote SQL.

| `status` | Name              | Meaning                                         |
| -------- | ----------------- | ----------------------------------------------- |
| `3`      | `SCHEMA_MISMATCH` | A bind value does not fit its placeholder       |
| `5`      | `PARSE_ERROR`     | Invalid SQL, or a missing table or column       |
| `6`      | `INTERNAL_ERROR`  | The server failed while running the query       |
| `8`      | `SECURITY_ERROR`  | The principal lacks a permission                |
| `10`     | `CANCELLED`       | The query was cancelled                         |
| `11`     | `LIMIT_EXCEEDED`  | A protocol limit was reached                    |

## Closing

Close every sender, session, lease, and pooled client in a `finally` block, or
when the component that owns it unmounts:

- **`QwpSender.close()`** publishes completed rows, then waits up to
  `closeFlushTimeoutMs` (5 seconds) for QuestDB to acknowledge everything. If
  it does not, `close()` rejects with `QwpSenderCloseTimeoutError` and the
  unacknowledged rows are lost. An unfinished row is discarded with a warning,
  and an open transaction is rolled back.
- **A borrowed sender's `close()`** publishes and returns the connection
  without waiting.
- **`QwpEgressSession.close()`** closes the connection, ending a running query.
  **A query lease's `close()`** cancels it and returns the connection.
- **`QwpClient.close()`** closes both pools.

## Differences from the Node.js client

| Feature                                   | Browser client                                       | Node.js client                         |
| ----------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Configuration                             | Options objects                                      | Connect strings and options objects    |
| Authentication                            | Session cookies or `auth` subprotocol credential     | `Authorization` header                 |
| Unacknowledged data                       | Memory only, lost with the page                      | Memory, or store-and-forward to disk   |
| HTTP status of a failed upgrade           | Hidden by the browser                                | Reported on `QwpUpgradeError`          |
| TLS settings                              | The browser's own                                    | `tls_roots`, `tls_verify`, custom agents |
| Connection deadlines                      | `connectTimeoutMs` covers the whole opening          | `connectTimeoutMs` and `authTimeoutMs` |
| UDP ingestion                             | Not available                                        | `udp::`                                |
| ILP transports and the `Sender` class     | Not available                                        | `http::`, `https::`, `tcp::`, `tcps::` |

The [Node.js client](/docs/connect/clients/nodejs/) page describes the shared
API in more depth: the full compiled-writer schema table, flow control, and
the error classes.

## Next steps

- [Node.js client](/docs/connect/clients/nodejs/)
- [QWP server configuration](/docs/configuration/qwp/)
- [QWP ingress protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
  and [QWP egress protocol](/docs/connect/wire-protocols/qwp-egress-websocket/)
- [OpenID Connect](/docs/security/oidc/)
- [Browser API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_browser-client.html)
  and the [client repository](https://github.com/questdb/nodejs-questdb-client)
