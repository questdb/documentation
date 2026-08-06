---
slug: /connect/wire-protocols/qwp-client-behavior
title: QWP client behaviour specification
description:
  Normative specification for how QWP clients behave at startup, connection,
  failover, and store-and-forward — the contract all QuestDB language clients
  align to.
---

:::info Audience

This is the **normative behaviour specification** for QWP clients at **startup**,
**connection**, **failover**, and **store-and-forward (SF)** durability — the
contract every QuestDB language client is aligned to. It is for **client
implementers** and for advanced users who need the exact contract.

It is derived from the Java reference client and is under active refinement.
Code samples use the Java client for illustration, but the normative content is
the **behaviour and configuration tables**, which apply to every client. Where a
client currently diverges, this spec is the target.

:::

## Scope

This specifies client behaviour for three connection concerns — **initial
connect / startup**, **failover and reconnection**, and **store-and-forward (SF)
durability** — plus the connection **pooling** model that ties them together. The
[Quick start](#quick-start) and [Mental model](#mental-model) sections are the
minimum to configure a correct client; the [Reference](#reference) section is the
exhaustive behaviour matrix; the [Implementation appendix](#implementation-appendix)
records non-normative reference-client internals.

Behaviours still being aligned across clients are marked **⚠ Sharp edge** and
listed under [Known sharp edges](#known-sharp-edges). "Intended" items are
deliberate contracts; "Candidate" items are likely defects targeted for change.

---

## Quick start

### Write-only client that tolerates the server being down at startup

Use the direct `Sender` API (not the `QuestDB` facade — see
[sharp edge #4](#known-sharp-edges)).

```java
String cfg = "wss::addr=db-a:9000,db-b:9000;"
        + "sf_dir=/var/lib/my-app/questdb-sf;"   // opt into disk durability
        + "sender_id=writer-1;"                  // unique per process per sf_dir
        + "initial_connect_retry=async;"         // non-blocking startup
        + "sf_max_total_bytes=100g;";            // how long an outage you can absorb

// For production, prefer the builder so you can install an error handler:
try (Sender sender = Sender.builder(cfg)
        .errorHandler(myErrorHandler)            // see "Error visibility" below
        .connectionListener(myConnectionListener)
        .build()) {
    sender.table("telemetry").longColumn("v", 42).atNow();
    sender.flush(); // persists to SF storage; wire ACK is asynchronous
}
```

Why each line matters:

- `sf_dir` is the **only** SF enable switch — there is no boolean flag.
- `initial_connect_retry=async` is what makes `build()` return without a live
  socket. Without it, startup is blocking (see [Mental model](#mental-model)).
- `sf_max_total_bytes` is what actually bounds how long an outage you survive.
  A **running** sender retries indefinitely, so the limit is how much
  unacknowledged data you can buffer, not a timer. Size it from your row rate
  times your worst expected outage.

:::note `reconnect_max_duration_millis` is not an outage budget

It bounds only the **blocking** initial connect (`initial_connect_retry=on` /
`sync`). Once a sender is running, the reconnect loop never consults it and
retries a transport outage forever. Setting a large value here does nothing for
a running producer. See [Reconnect and outage handling](#reconnect-and-outage-handling).

:::

**Error visibility ⚠:** the simplest path (`Sender.fromConfig(...)` + async)
surfaces terminal async failures only *later*, through a producer call or at
`close()`. For production, use `Sender.builder(...)` and install a
`SenderErrorHandler` / `SenderConnectionListener`
([sharp edge #7](#known-sharp-edges)).

### Read client that only reads from replicas

```java
String cfg = "wss::addr=replica-a:9000,replica-b:9000,replica-c:9000;"
        + "target=replica;"   // without this, the client may bind a primary
        + "failover=on;";      // default; affects execute()-time recovery only

try (QuestDB db = QuestDB.connect(cfg);
     Query q = db.borrowQuery()) {
    q.sql("select * from telemetry limit 10")
     .handler(myBatchHandler)
     .submit()
     .await();
}
```

Why each line matters:

- `target=replica` is required to avoid binding a primary/standalone server.
  The default `target=any` will accept any role.
- `failover=on` is the default. It does **not** affect startup; it only governs
  reconnect+replay after a query connection that was already established later
  fails during `execute()`.

---

## Mental model

### Three independent "connect" models live in one client

A `QuestDB` facade owns an **ingest pool** and a **query pool**. They do not
share a startup model. You must hold all three in mind:

| Concern | Controlled by | Startup is... |
| --- | --- | --- |
| Ingest sender initial connect | `initial_connect_retry` = `off` / `sync` / `async` | one-shot / blocking-retry / background-retry |
| Query client initial connect | (no mode; always synchronous) | always blocking |
| Facade prewarm (how many of each connect at `build()`) | `sender_pool_min`, `query_pool_min` | eager if `min>0`, lazy if `min=0` |

`failover=on` (query default) is **not** a startup setting — it only affects
query execution after a connection exists. This naming trips people up
([sharp edge #3](#known-sharp-edges)).

### Ingest initial-connect modes

| `initial_connect_retry` | Mode | `build()` behavior on a down server |
| --- | --- | --- |
| `off` / `false` | `OFF` | one attempt on caller thread; throws immediately |
| `on` / `true` / `sync` | `SYNC` | retry loop on caller thread, bounded by `reconnect_max_duration_millis` (blocks) |
| `async` | `ASYNC` | returns immediately; I/O thread retries in background |

**Default resolution ⚠:** if you don't set `initial_connect_retry` explicitly but
you *do* set any `reconnect_*` knob, the mode becomes `SYNC` — so a "resilience"
knob silently turns startup into a multi-minute **blocking** retry. If no
`reconnect_*` knob is set either, the mode is `OFF`. Always set
`initial_connect_retry` explicitly to avoid this ([sharp edge #1](#known-sharp-edges)).

### Facade prewarm

`QuestDBBuilder.build()` validates both configs (without connecting), then
eagerly creates `min` connections per pool. Consequences:

| Configuration | Build-time network behavior |
| --- | --- |
| defaults (`min=1` both) | creates one sender + one query client; build fails if either cannot connect — unless ingest uses `initial_connect_retry=async` |
| `sender_pool_min=0` | no sender at build; first `borrowSender()`/`sender()` creates it (then follows the ingest initial-connect mode) |
| `query_pool_min=0` | no query client at build; first query `submit()` creates it |
| both mins `0` | config-only validation at build; all network work is lazy |

After prewarm, both pools grow lazily up to `max` on demand, and shrink back to
`min` when idle. Growth uses the same real connect path as prewarm. At `max`,
callers block up to `acquire_timeout_ms` then throw.

---

## Defaults (single source of truth)

### Pool (facade only)

| Key / builder | Default |
| --- | ---: |
| `sender_pool_min` | `1` |
| `sender_pool_max` | `4` |
| `query_pool_min` | `1` |
| `query_pool_max` | `4` |
| `acquire_timeout_ms` | `5000` |
| `idle_timeout_ms` | `60000` (`0` ⇒ infinite) |
| `max_lifetime_ms` | `1800000` (`0` ⇒ infinite) |
| `housekeeper_interval_ms` | `5000` |

### Ingest sender (SF + reconnect)

| Key | Default |
| --- | ---: |
| `sender_id` | `default` |
| `sf_max_segment_bytes` (segment size) | `4 MiB` |
| `sf_max_total_bytes` | `10 GiB` (SF mode) · `128 MiB` (memory mode) |
| `sf_durability` | `memory` (also supports `periodic`) |
| `sf_sync_interval_millis` | `5000` (requires `sf_durability=periodic`) |
| `sf_append_deadline_millis` | `30000` |
| `reconnect_max_duration_millis` | `300000` — bounds the **blocking initial connect only** |
| `reconnect_initial_backoff_millis` | `100` |
| `reconnect_max_backoff_millis` | `5000` |
| `close_flush_timeout_millis` | `60000` (Java/.NET) · `5000` (Rust/C/C++/Python) |
| `connect_timeout` | unset — per-endpoint TCP connect bound, must be `> 0` |
| `auth_timeout_ms` | `15000` |
| `max_frame_rejections` | `4` |
| `poison_min_escalation_window_millis` | `5000` |

### Query client

| Key | Default |
| --- | ---: |
| `target` | `any` |
| `failover` | `on` |
| `failover_max_attempts` | `8` (incl. original) |
| `failover_max_duration_ms` | `30000` (`0` disables the duration cap) |
| `failover_backoff_initial_ms` | `50` |
| `failover_backoff_max_ms` | `1000` |
| `auth_timeout_ms` | `15000` |
| `serverInfoTimeoutMs` | `5000` (builder API only — no config key ⚠) |

There is no "retry forever" setting to look for on the reconnect keys — a
running sender already does. `reconnect_max_duration_millis` applies only to a
blocking initial connect; see
[Reconnect and outage handling](#reconnect-and-outage-handling).

---

## Knob availability by surface

Three configuration surfaces exist. Not every knob is reachable from every
surface — this matrix shows where each lives.

- **Conn string**: a `ws`/`wss` config string. Works for `Sender.fromConfig`,
  `QwpQueryClient.fromConfig`, and `QuestDB.connect(...)`.
- **Sender builder**: `Sender.builder(...)` (`LineSenderBuilder`) — direct
  ingest only.
- **Facade builder**: `QuestDB.builder()` (`QuestDBBuilder`) — pool knobs plus
  the ingest callbacks; addressing and per-direction behaviour come from the
  conn string, which the facade takes via `fromConfig(...)`. The facade accepts
  **one** config string for both directions; there is no separate
  ingest/query config setter.

| Knob | Conn string | Sender builder | Facade builder |
| --- | :---: | :---: | :---: |
| `addr` | ✅ | ✅ `address()/port()` | via conn string |
| `username`/`password`/`token` | ✅ | ✅ | via conn string |
| `tls_verify`/`tls_roots` | ✅ | ✅ | via conn string |
| `auth_timeout_ms` | ✅ | ✅ | via conn string |
| `initial_connect_retry` | ✅ | ✅ `initialConnectMode()` | via conn string |
| `reconnect_*` | ✅ | ✅ | via conn string |
| `sf_dir`/`sender_id`/`sf_*` | ✅ | ✅ | via conn string |
| `request_durable_ack` | ✅ | ✅ | via conn string |
| `close_flush_timeout_millis` | ✅ | ✅ | via conn string |
| `connect_timeout` | ✅ | ✅ `connectTimeoutMillis()` | via conn string |
| `SenderErrorHandler` | ❌ | ✅ `errorHandler()` | ✅ `errorHandler()` |
| `SenderConnectionListener` | ❌ | ✅ `connectionListener()` | ✅ `connectionListener()` |
| `BackgroundDrainerListener` | ❌ | ✅ `drainerListener()` | ✅ `drainerListener()` |
| `SenderProgressHandler` | ❌ | ❌ — post-construction only, see below | ❌ |
| `target` | ✅ | n/a | via conn string |
| `failover`/`failover_*` | ✅ | n/a | via conn string |
| `serverInfoTimeoutMs` | ❌ | n/a | ❌ (QwpQueryClient builder only) |
| `sender_pool_*`/`query_pool_*` | ✅ | n/a | ✅ |
| `acquire_timeout_ms`/`idle_timeout_ms`/`max_lifetime_ms` | ✅ | n/a | ✅ |
| `query_close_timeout_ms` | ✅ | n/a | ✅ `queryCloseTimeoutMillis()` |
| `lazy_connect` | ✅ | n/a | via conn string |

⚠ Two genuine gaps remain. **`serverInfoTimeoutMs`** has no config key, so a
facade query client cannot tune it ([sharp edge #6](#known-sharp-edges)).
And **`SenderProgressHandler`** has no builder setter on either surface — it is
installed after construction on the concrete sender:

```java
if (sender instanceof QwpWebSocketSender) {
    ((QwpWebSocketSender) sender).setProgressHandler(handler);
}
```

The ingest **error handler**, **connection listener**, and **drainer listener**
*are* reachable from the facade builder, and apply across the whole sender pool.

---

## Known sharp edges

These are behaviours still under review as clients are aligned. "Intended" means
a deliberate contract that will be kept; "Candidate" means a likely ergonomic
defect targeted for change. The numbered references throughout this spec point
here.

| # | Sharp edge | Status |
| --- | --- | --- |
| 1 | `initial_connect_retry` is implicitly promoted to `SYNC` when any `reconnect_*` knob is set — a resilience knob silently makes startup block. | Candidate |
| 2 | `reconnect_max_duration_millis` is named as if it governs reconnection, but a running sender never consults it — it bounds only the blocking initial connect. | Candidate (naming) |
| 3 | `failover` sounds like it covers startup but only affects post-connect query `execute()`. Queries have no async/lazy initial connect at all. | Candidate |
| 4 | No first-class write-only facade: a write-only user must still supply a query config and remember `query_pool_min=0`, or use `lazy_connect=true`. | Candidate |
| 5 | A single endpoint returning `401`/`403` is treated as cluster-wide terminal and aborts the whole endpoint walk, even at startup, even if other endpoints would accept the credentials. | Intended (documented), revisit |
| 6 | Query `serverInfoTimeoutMs` has no config key, so a facade query client cannot tune it. | Candidate |
| 7 | The simplest API (`fromConfig` + async) has the worst error visibility — terminal async failures surface only on later producer calls or at `close()`. | Candidate |
| 8 | `SenderProgressHandler` has no builder setter on either surface; it must be installed post-construction via `QwpWebSocketSender.setProgressHandler`. | Candidate |

**Resolved since an earlier revision of this page** — do not reintroduce:

- *"`reconnect_max_duration_millis=0` means give up immediately, while sibling
  `0` values mean infinite."* The running loop no longer consults the key at
  all, so the inconsistency is gone.
- *"No client-side TCP connect timeout."* `connect_timeout` now bounds the TCP
  connect phase per endpoint, so a black-holed host no longer stalls the walk
  until the OS timeout.
- *"Ingest `errorHandler` / `connectionListener` are unreachable from the
  facade."* Both are on `QuestDBBuilder`, along with `drainerListener`.

---

## Reference

### Store-and-forward semantics

`sf_dir=...` enables SF. There is no separate boolean enable flag.

- The sender owns one slot: `<sf_dir>/<sender_id>/`. Default `sender_id` is
  `default`.
- Multiple independent senders sharing one `sf_dir` must use distinct
  `sender_id` values, else the second fails because the slot lock is held.
- In pooled `QuestDB` usage, the pool derives per-slot IDs from the base so
  pooled senders never collide. The minted name is client-specific: Java uses
  `<base>-0`, `<base>-1`, …; the Rust, C and C++ pool uses
  `<base>-ingest-0`, `<base>-ingest-1`, ….
- On restart, the cursor engine opens existing segment files and replays
  unacknowledged frames; acknowledged/truncated frames are not replayed.

`flush()` semantics (QWP sender):

- Encodes pending rows into the cursor engine.
- In SF mode, data is persisted to mmap-backed segment files before `flush()`
  returns.
- `flush()` does **not** wait for server ACKs unless backpressure requires
  space. The I/O thread sends frames and trims ACKed frames asynchronously.
- `drain(timeoutMillis)` flushes and waits for the server to ACK all currently
  published frames, up to the timeout.
- `close()` flushes then waits up to `close_flush_timeout_millis` for ACKs,
  unless that timeout is `<= 0`.

### Async initial connect (ingest)

With `initial_connect_retry=async`:

- `build()` returns without a live socket; `wasEverConnected()` is `false`.
- Producer calls and `flush()` can run before the server exists; frames
  accumulate in the cursor engine (and on disk with `sf_dir`).
- The I/O thread retries in the background using the same loop used after wire
  failure, with capped exponential backoff and no wall-clock deadline.
- When a server appears, buffered frames are sent/replayed and ACK-driven
  trimming begins.
- Terminal errors go to a configured `SenderErrorHandler`; without one they
  surface on later producer calls or at close-time.

A sender in async mode does not give up because time passed. What ends it is a
**terminal** condition — authentication rejection, a durable-ack capability
mismatch, or the poison-frame detector — or the producer hitting
`sf_max_total_bytes` and exhausting `sf_append_deadline_millis` on `append()`.

### Reconnect and outage handling

**A running sender retries a transport outage indefinitely.** There is no
wall-clock give-up and no budget-exhaustion event. Backoff grows from
`reconnect_initial_backoff_millis` to `reconnect_max_backoff_millis` and stays
there; the loop rotates through the endpoints in `addr` as it goes.

`reconnect_max_duration_millis` has exactly two consumers, neither of which is
the steady-state loop:

1. The **blocking sync initial connect** (`initial_connect_retry=on` / `sync`),
   which gives up and throws when the budget expires.
2. The background drainer's **durable-ack capability-gap budget**, used when an
   orphan slot repeatedly lands on a node that cannot serve durable acks.

The practical consequence: what bounds your tolerance of a long outage is
**buffer capacity, not time**. In SF mode that is `sf_max_total_bytes` against
available disk; in memory mode it is the same key against RAM. When the cap is
reached, `append()` blocks and then throws after
`sf_append_deadline_millis` — that, not a timer, is the signal that an outage
has outlasted your configuration.

:::note Alignment

This is the behaviour of the Java reference client and the .NET client. Other
clients are aligned to it. If you are implementing a new client, the contract
is: retry transport failures forever, surface only genuine terminal conditions,
and apply back-pressure to the producer rather than dropping data.

:::

### Ingest endpoint walk (`addr=a:9000,b:9000,...`)

| Per-endpoint result | Sender behavior |
| --- | --- |
| DNS failure | transport error; try next endpoint |
| TCP connect failure | transport error; try next endpoint |
| TLS session/certificate failure | transport error; try next endpoint |
| HTTP upgrade timeout / non-auth transport error | try next endpoint |
| `421` with `X-QuestDB-Role: REPLICA` | role reject; try next endpoint |
| `401` / `403` auth failure | **terminal**; do not try later endpoints ⚠ |
| durable-ack requested but unsupported | terminal mismatch |
| successful write upgrade | bind this endpoint |
| all endpoints fail transport | throw / retry per initial/reconnect mode |
| all endpoints role-reject as replicas | `QwpRoleMismatchException` |

### Query client initial connect

`QwpQueryClient.connect()` is synchronous. Per endpoint it: opens TCP/TLS,
performs the WebSocket upgrade to `/read/v1`, reads the initial `SERVER_INFO`
frame, applies the `target=` role filter, and starts the egress I/O thread on
the first match. If no endpoint can be used, it throws. There is no async
initial-connect mode for queries.

`target=` matching:

| Target | Accepted roles |
| --- | --- |
| `any` | any role |
| `primary` | `PRIMARY`, `PRIMARY_CATCHUP`, `STANDALONE` |
| `replica` | `REPLICA` only |

Query initial-connect endpoint matrix:

| Per-endpoint result | Behavior |
| --- | --- |
| DNS / TCP / TLS failure | record transport error; try next endpoint |
| HTTP upgrade timeout | transport error; try next endpoint |
| HTTP `401` / `403` | **terminal** `QwpAuthFailedException`; do not try later ⚠ |
| HTTP `421` + role header | role reject; try next endpoint |
| upgrade ok but no `SERVER_INFO` before timeout | transport error; try next |
| `SERVER_INFO` role ≠ `target` | role reject; try next endpoint |
| endpoint matches target | bind and return success |
| all endpoints transport-fail | `HttpClientException: all QWP endpoints unreachable ...` |
| all endpoints role-reject | `QwpRoleMismatchException` |

`auth_timeout_ms` bounds the upgrade/auth phase **after** TCP connect. There is
no separate client-side TCP connect timeout, so a black-holed connect blocks
until the OS timeout before the walk advances ⚠.

### Query execution-time failover

With `failover=on`:

- A transport/protocol terminal failure during `execute()` is intercepted; the
  client reconnects via the host tracker and re-submits.
- The handler receives `onFailoverReset(...)` before replayed batches.
- Bounded by `failover_max_attempts` (default `8`, incl. original) **and**
  `failover_max_duration_ms` (default `30000`; `0` disables the duration cap).
- Backoff: `failover_backoff_initial_ms=50`, `failover_backoff_max_ms=1000`.
- Auth failure during failover reconnect is terminal and reported to the handler.

With `failover=off`, a transport failure is reported to the handler with no
reconnect/replay.

### Scenario matrix

#### Facade startup

| Scenario | Config | Result |
| --- | --- | --- |
| Default `connect`, all servers down | default mins | build fails |
| Default `connect`, first endpoint down, second works | multi-addr | build can succeed; each prewarmed client walks endpoints |
| Write-only-ish startup while down | `query_pool_min=0` + sender async | build returns |
| Fully lazy startup | both mins `0` | build returns after validation only |
| Query first use after lazy startup while down | `query_pool_min=0` | first `submit()` throws |
| Sender first use after lazy startup while down | `sender_pool_min=0` | first sender creation follows ingest initial mode |

#### Direct sender startup

| Scenario | Config | Result |
| --- | --- | --- |
| server down, default mode | no `reconnect_*`, no async | one attempt; build throws |
| server down, reconnect duration set, no mode | `reconnect_max_duration_millis=...` | **synchronous** retry; build blocks ⚠ |
| server down, async | `initial_connect_retry=async` | build returns; I/O thread retries |
| server returns `401`/`403` | any mode | terminal auth failure; no endpoint continuation |
| server appears later, any delay | `initial_connect_retry=async` | buffered frames sent and ACKed — the retry loop has no deadline |
| server never appears, buffer fills | async + `sf_max_total_bytes` reached | `append()` blocks, then throws after `sf_append_deadline_millis`; the sender itself stays alive and keeps retrying |

#### Read-replica startup (one bad endpoint, another replica works)

| Bad endpoint type | Continue to working replica? | Notes |
| --- | --- | --- |
| DNS failure | Yes | transport error |
| TCP refused/unreachable | Yes | transport error; black-hole waits for OS timeout |
| TLS handshake failure | Yes | transport error |
| HTTP upgrade timeout | Yes | after `auth_timeout_ms` |
| upgrades but no `SERVER_INFO` | Yes | after `serverInfoTimeoutMs` (builder only) |
| primary/standalone while `target=replica` | Yes | role mismatch |
| `421` role reject | Yes | try next |
| `401`/`403` | **No** | auth treated as cluster-wide terminal ⚠ |
| broken shared TLS/trust store | No | every endpoint fails |
| all endpoints down | No | `all QWP endpoints unreachable` |
| reachable but none match `target` | No | `QwpRoleMismatchException` |

---

## Implementation appendix

Non-normative. Documents how the **Java reference client** implements this spec;
useful while aligning other clients. Primary source areas:

- `io.questdb.client.QuestDB` / `QuestDBBuilder`
- `io.questdb.client.impl.SenderPool` / `QueryClientPool` / `PoolHousekeeper`
- `io.questdb.client.Sender.LineSenderBuilder`
- `io.questdb.client.cutlass.qwp.client.QwpWebSocketSender`
- `io.questdb.client.cutlass.qwp.client.QwpQueryClient`
- `io.questdb.client.cutlass.qwp.client.sf.cursor.CursorSendEngine`
- `io.questdb.client.cutlass.qwp.client.sf.cursor.CursorWebSocketSendLoop`
- `io.questdb.client.cutlass.qwp.client.QwpHostHealthTracker`
- `io.questdb.client.impl.ConfigSchema` (the single key registry)

### `QuestDBBuilder.build()` steps

1. Require a config string; `build()` throws
   `IllegalStateException("configuration is required; call fromConfig()")`
   if none was set. One string drives both pools.
2. Parse + validate the config without connecting, once as the Sender would and
   once as the query client would (runs even when both mins are `0`, so a
   malformed pool/ingest/query/TLS/auth/enum/range value fails here).
3. Resolve `lazy_connect`: when set, the ingest side is rewritten to
   `initial_connect_retry=async` and the query pool defaults to `min=0`, so
   startup tolerates a down server without disabling reads.
4. Resolve pool keys: explicit builder setters override conn-string keys.
5. Construct `SenderPool` and `QueryClientPool`.
6. Eagerly create `min` connections per pool.
7. Start the `PoolHousekeeper`.

### Initial-connect mode resolution (`Sender.java`)

```text
if initialConnectMode set explicitly -> use it (including OFF alongside tuned reconnect_* keys)
else if any reconnect_* set          -> SYNC
else                                 -> OFF
```

This is the promotion behind [sharp edge #1](#known-sharp-edges): setting a
`reconnect_*` key and nothing else turns startup into a blocking retry bounded
by `reconnect_max_duration_millis`. Set `initial_connect_retry` explicitly to
avoid it.

### Pooled SF startup recovery nuance

- Live/prewarmed sender slots recover their own unacked data via their
  `CursorSendEngine`.
- Non-live managed slots are scanned by the housekeeper startup recovery path,
  so `build()` does not block on stranded slots.
- Recovery of non-live stranded slots is best-effort and bounded: a build/drain
  failure aborts that scan; data stays durable for a later attempt, but the
  current process does not retry the aborted scan indefinitely.
- For immediate background drain of all slots, keep enough `sender_pool_min`
  slots warm or construct direct senders for the slots that must actively retry.

### Reconnect loop (`CursorWebSocketSendLoop`)

The loop has no wall-clock deadline. It retries while the sender is running,
backing off from `reconnect_initial_backoff_millis` up to
`reconnect_max_backoff_millis` and rotating endpoints between attempts. The
source states the contract directly:

> `reconnect_max_duration_millis` is intentionally NOT consulted by THIS loop.
> Its holders pass it explicitly where it does apply: the blocking (non-lazy)
> initial connect hands it to `connectWithRetry`, and `BackgroundDrainer`
> converts it into the durable-ack capability-gap budget. Neither bounds this
> loop's steady-state reconnect.

`QwpAuthFailedException` and `WebSocketUpgradeException` raised inside the loop
are terminal across all endpoints. Everything else is retried.
