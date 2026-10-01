---
slug: /connect/clients/nodejs-operations
title: Node.js client operations and reference
sidebar_label: Node.js operations and reference
description: "Node.js QWP client pool lifecycle, error recovery, failover, configuration, migration, and a complete ingestion and query example."
---

For a first connection, row ingestion, and streaming SQL queries, start with the
[Node.js client guide](/docs/connect/clients/nodejs/). This companion page
covers pool lifecycle, concurrency, error recovery, failover, connect-string
differences, migration, and a complete ingestion and query example.

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
[Closing a borrowed sender](/docs/connect/clients/nodejs/#closing-a-borrowed-sender) for how long that can
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
[store-and-forward](/docs/connect/clients/nodejs/#store-and-forward) journal with `sf_dir`. `lazy_connect=on`
still starts the sender in the background when `sf_dir` is set; the journal
changes where rows are buffered, not whether startup waits for a connection.
Replay from the journal is at least once, so write to a deduplicated table as
described there.

`lazy_connect=on` forces `query_pool_min=0` and `initial_connect_retry=async`,
and rejects an explicit conflicting value. Setting `initial_connect_retry=async`
without `lazy_connect` is not enough: the query pool still connects at startup,
so `connectQwpNodeClient()` rejects with `QwpPoolResourceError`. A query
borrowed while QuestDB is still down rejects with `QwpPoolResourceError` too.

A lazy start does not cover two cases. A locked store-and-forward journal
still fails startup; see [Lock recovery](/docs/connect/clients/nodejs/#sf-lock-recovery). And until a
sender has connected once, it cannot check batches against the server's size
limit; see [Batch size limits](/docs/connect/clients/nodejs/#batch-size-limits).

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
[Awaiting acknowledgements](/docs/connect/clients/nodejs/#awaiting-acknowledgements)), or use
[store-and-forward](/docs/connect/clients/nodejs/#store-and-forward).

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

## Error handling

Each error leaves the client in a known state. The sections after this table
have the details and examples:

| Error | Surfaces from | State afterwards | What to do |
|---|---|---|---|
| `TypeError`, `RangeError`, or `Error` from local validation | The column method or `at()` that staged the value | The row in progress is discarded; the sender stays usable | Fix the value and write the row again |
| `QwpBatchTooLargeError` | `flush()`, the `at()` whose auto-flush sends the batch, or `close()` | The batch can never be sent: the staged rows are kept, every later flush fails the same way, and `close()` discards them | Call `reset()`, then write the rows again without the oversized one; see [Batch size limits](/docs/connect/clients/nodejs/#batch-size-limits) |
| `QwpMemoryReplayAppendTimeoutError`, `QwpReplayStoreAppendTimeoutError` | `flush()`, an auto-flushing `at()`, or `close()` | The batch stays staged; the sender stays usable | Keep the sender and flush again later. Don't write the rows again, and don't close the sender while backpressure persists; see [Backpressure](/docs/connect/clients/nodejs/#backpressure) |
| Retriable server rejection | `onSenderError` | The client resends the batch; repeated rejections become terminal | Monitor; no action needed per rejection |
| Terminal server rejection | `onSenderError`, then `QwpIngressNackError` or `QwpReplayRejectedError` from later calls | The sender has failed; rows still staged on it are lost. With `sf_dir`, the batch blocks the journal for every table | Fix the data or schema, then write the lost rows on a new sender; see [Recovering from a terminal rejection](#recovering-from-a-terminal-rejection) |
| `QwpReconnectExhaustedError` on a sender | `onError` with `terminal: true`, then the next `flush()`, `at()`, or `close()` | The sender has failed; unsent rows are lost | Borrow a new sender; see [Ingestion reconnect](#ingestion-reconnect) |
| `QwpReplayStoreLockedError` | `connectQwpNodeClient()` or a borrow, as the `cause` of `QwpPoolResourceError`; `connect()` on a standalone `Sender` | The journal could not be opened | See [Lock recovery](/docs/connect/clients/nodejs/#sf-lock-recovery) |
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
[Closing a sender](/docs/connect/clients/nodejs/#closing-a-sender).

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

Whether the sender gives up depends on the [ingestion mode](/docs/connect/clients/nodejs/#ingestion-modes):

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
described under [Store-and-forward](/docs/connect/clients/nodejs/#store-and-forward), to keep replayed rows
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
[DDL and DML statements](/docs/connect/clients/nodejs/#ddl-and-dml-statements).

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
asynchronously through a bounded queue (64 by default). The connect-string
`connection_listener_inbox_capacity` key configures the ingestion queue only;
for query events, set the typed `egressSession.connectionListenerInboxCapacity`
option. When a queue overflows, its oldest events are dropped and counted in
the metrics.

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
| `durable-ack-unavailable` | A sender is waiting for an endpoint that supports durable acknowledgement. A background-started sender emits this from startup, including with `sf_dir`; a foreground-started sender with `sf_dir` retries after its first successful connection. |
| `durable-ack-persistent-failure` | An orphan drainer gave up waiting for durable acknowledgement support. |
| `primary-unavailable` | An orphan drainer, which recovers a journal left by another sender (see [Store-and-forward](/docs/connect/clients/nodejs/#store-and-forward)), found no endpoint that currently accepts writes. It keeps retrying. Regular senders do not emit it. |

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
| `request_durable_ack`, `durable_ack_keepalive_interval_millis` | `off`, `200` | Enterprise. Explicitly setting the keepalive interval alone requests durable ACK; a negative interval is rejected. |
| `max_name_len` | `127` | Maximum table and column name length, in UTF-8 bytes. |
| `reconnect_initial_backoff_millis`, `reconnect_max_backoff_millis` | `100`, `5000` | Ingestion reconnect backoff. |
| `reconnect_max_duration_millis` | `300000` | Ingestion budget per outage in default memory mode. `0` removes it. |
| `max_frame_rejections`, `poison_min_escalation_window_millis` | `4`, `300000` | Poison-frame detector: rejections of one batch, and the minimum time they must span, before the sender stops. |
| `initial_connect_retry` | `off` | `off`, `on`/`sync`, or `async`. |
| `sf_dir`, `sender_id` | none, `default` | Store-and-forward journal location. |
| `sf_durability` | `memory` | `memory`, `periodic`, or `append`. Requires `sf_dir` when explicitly set, even to `memory`. |
| `sf_max_total_bytes` | `10g` with `sf_dir`, `128m` without | [Journal size target](/docs/connect/clients/nodejs/#sf-capacity), not a hard disk limit; memory queue cap without `sf_dir`. |
| `sf_max_segment_bytes` | `4m` with `sf_dir`, none without | Journal segment size, which also caps a batch. |
| `sf_append_deadline_millis` | `30000` | How long a full journal or queue blocks publishing. |
| `drain_orphans`, `max_background_drainers` | `off`, `4` | Adopt journals left by crashed processes. Both require `sf_dir` when explicitly set. |
| `target`, `zone` | `any`, none | Endpoint role and zone preference. Apply to ingestion too. |
| `failover`, `failover_max_attempts`, `failover_max_duration_ms` | `on`, `8`, `30000` | Query failover. |
| `compression`, `compression_level` | `raw`, `1` | Query result compression. Explicit `compression_level` requires `compression=zstd` or `auto`. |
| `initial_credit`, `buffer_pool_size`, `max_batch_rows` | `0`, `4`, server default | Query flow control. |
| `client_id` | `typescript/<version>` | Sent to the server for diagnostics. |
| `error_inbox_capacity`, `connection_listener_inbox_capacity` | `256`, `64` | Queues for rejection callbacks and ingestion connection events. Query event queue: typed `egressSession.connectionListenerInboxCapacity`. |
| Pool keys | see [Pool settings](#pool-settings) | Applied by the pooled client. A standalone `Sender` also applies `lazy_connect`. |

The
[API reference](https://questdb.github.io/nodejs-questdb-client/modules/_questdb_nodejs-client.html)
covers every type and option. The
[QWP guide](https://github.com/questdb/nodejs-questdb-client/blob/main/QWP.md)
in the client repository describes the delivery semantics in depth.

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
under [Store-and-forward](/docs/connect/clients/nodejs/#store-and-forward). Its fields match the connect
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

### Differences from other clients

The Node.js client differs from the Java reference client, and from the shared
[connect string reference](/docs/connect/clients/connect-string/), in these
places:

| Area | Node.js behavior |
|---|---|
| Outage budget | A sender in default memory mode gives up after `reconnect_max_duration_millis` and fails with `QwpReconnectExhaustedError`. Senders in background memory mode (`initial_connect_retry=async` or `lazy_connect=on`) or with `sf_dir` retry indefinitely. See [Ingestion reconnect](#ingestion-reconnect). |
| `target` and `zone` | Also apply to ingestion. Set a query-only role with the typed `egress.target` option. See [Multiple endpoints](#multiple-endpoints). |
| Authentication rejected after a first connection | Senders with `sf_dir` or in background memory mode keep retrying. Other senders and query connections fail. See [Connection-level errors](#connection-level-errors). |
| Durable acknowledgement unavailable | Senders started in the background retry from startup even with `sf_dir`; foreground store-and-forward senders fail on first connect, but retry after a successful connection. They emit `durable-ack-unavailable` while retrying. See [Durable acknowledgement](/docs/connect/clients/nodejs/#durable-acknowledgement). |
| `sf_durability` and SF-only keys | Also accepts `append`, but rejects explicit `sf_durability` (even `memory`), `sf_sync_interval_millis`, `drain_orphans` (even `off`), `max_background_drainers`, or `catch_up_cap_gap_min_escalation_window_millis` without `sf_dir`. Unlike Java, do not pass these keys in a memory-mode shared string. |
| `sf_max_total_bytes` with `sf_dir` | A journal size target that can be exceeded, not a hard limit. See [Journal capacity](/docs/connect/clients/nodejs/#sf-capacity). |
| `sf_dir` path creation | Creates missing parent directories and the slot recursively; Java and Rust-derived clients only create `sf_dir` and the slot. |
| `durable_ack_keepalive_interval_millis` | Explicitly setting this key, even to `0`, also requests durable ACK; it fails against OSS if the sender connects. Negative values throw `RangeError` (the shared reference treats them as disabled). |
| Journal lock | A `.lock.owner` directory that can outlive a crashed process and that other clients' operating-system locks do not see. See [Lock recovery](/docs/connect/clients/nodejs/#sf-lock-recovery). |
| `max_lifetime_ms` | Closes idle connections above the pool minimum only. Connections at the minimum are not recycled. |
| Connect string parsing | `0`, not `off`, disables `auto_flush_rows` and `auto_flush_interval`, and the interval runs from the last flush or from sender creation. Size values take single-letter suffixes only. `compression_level` requires `compression=zstd` or `auto`. `tls_roots` must be PEM; `tls_roots_password`, `init_buf_size`, and `max_buf_size` are rejected. |
| Initial connection and reconnect | `lazy_connect=on` opens senders in the background at startup instead of waiting for a borrow. A query's first connection retries with explicit `failover=on`, a `failover_*` key (unless `failover=off`), or typed `egressSession.reconnect`, not just from the default `failover=on`. See [Starting while QuestDB is down](#starting-while-questdb-is-down) and [Typed reconnect policy](#typed-reconnect-policy). Ingestion reconnect uses full jitter (delay from 0 up to the backoff ceiling), not the equal-jitter schedule in the shared failover guide. |
| `connect_timeout` | Also covers DNS and the TLS handshake, and `auth_timeout_ms` defaults to `connect_timeout` when only that key is set. See [Connection timeouts](#connection-timeouts). |
| `tls_roots` default | The CA certificates bundled with Node.js, not the operating system's trust store. See [TLS](/docs/connect/clients/nodejs/#tls). |
| Defaults | `connect_timeout` is `15000` and `poison_min_escalation_window_millis` is `300000`. `close_flush_timeout_millis` is `5000`, as in the Rust, C, C++, Python, and Go clients; Java and .NET use `60000`. |
| Close after an ACK timeout | A standalone sender's `close()` rejects with `QwpSenderCloseTimeoutError` instead of logging a warning. The pooled client's `db.close()` resolves and reports the timeout, best-effort, to `ingressSession.onError`. See [Closing a sender](/docs/connect/clients/nodejs/#closing-a-sender). |
| Error reports | Categories and policies are lowercase, hyphenated strings, such as `schema-mismatch` and `retriable-other`. See [Ingestion errors](#ingestion-errors). |
| Pool and query keys on a standalone `Sender` | The `Sender` logs a warning for the pool and query-only keys it ignores. It applies `client_id` and `lazy_connect`. |
| `connection_listener_inbox_capacity` | Sets the ingestion event inbox only. Set the query inbox with typed `egressSession.connectionListenerInboxCapacity`; see [Connection events](#connection-events). |
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
| Column types | ILP types | More types, subject to [column-method](/docs/connect/clients/nodejs/#column-methods) and [array](/docs/connect/clients/nodejs/#arrays) support |

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
  `false`, and BYTE and SHORT default to `0` (see [Null values](/docs/connect/clients/nodejs/#null-values)).
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
from [Store-and-forward](/docs/connect/clients/nodejs/#store-and-forward)). If the table is missing, QWP
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
use the [Read-after-write](/docs/connect/clients/nodejs/#read-after-write) pattern for a visibility guarantee.
A replayed batch is idempotent only because this example retains the event's
ID and timestamp and enables table-level deduplication.

## Next steps

- [Node.js client guide](/docs/connect/clients/nodejs/) for ingestion and queries.
- [Connect string reference](/docs/connect/clients/connect-string/) for the shared keys.
- [Delivery semantics](/docs/concepts/delivery-semantics/) for replay and deduplication.
