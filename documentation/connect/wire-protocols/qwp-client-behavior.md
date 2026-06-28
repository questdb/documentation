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
String cfg = "ws::addr=db-a:9000,db-b:9000;"
        + "sf_dir=/var/lib/my-app/questdb-sf;"   // opt into disk durability
        + "sender_id=writer-1;"                  // unique per process per sf_dir
        + "initial_connect_retry=async;"         // non-blocking startup
        + "reconnect_max_duration_millis=86400000;" // outage budget (24h)
        + "sf_max_total_bytes=100g;";

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
- `reconnect_max_duration_millis` is the outage budget for **both** the initial
  connect and later reconnects. If it expires, the sender latches terminal and
  stops; data already in `sf_dir` survives for a future sender on the same slot.

**Error visibility ⚠:** the simplest path (`Sender.fromConfig(...)` + async)
surfaces terminal async failures only *later*, through a producer call or at
`close()`. For production, use `Sender.builder(...)` and install a
`SenderErrorHandler` / `SenderConnectionListener`
([sharp edge #7](#known-sharp-edges)).

### Read client that only reads from replicas

```java
String cfg = "ws::addr=replica-a:9000,replica-b:9000,replica-c:9000;"
        + "target=replica;"   // without this, the client may bind a primary
        + "failover=on;";      // default; affects execute()-time recovery only

try (QuestDB db = QuestDB.connect(cfg)) {
    db.executeSql("select * from telemetry limit 10", myBatchHandler);
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
| `sf_max_bytes` (segment size) | `4 MiB` |
| `sf_max_total_bytes` (SF mode) | `10 GiB` |
| `sf_durability` | `MEMORY` |
| `sf_append_deadline_millis` | `30000` |
| `reconnect_max_duration_millis` | `300000` (`0` ⇒ **give up immediately**, not infinite ⚠) |
| `reconnect_initial_backoff_millis` | `100` |
| `reconnect_max_backoff_millis` | `5000` |
| `close_flush_timeout_millis` | `60000` |
| `auth_timeout_ms` | `15000` |

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

Note the inconsistent `0` convention: `idle_timeout_ms=0`/`max_lifetime_ms=0`
mean *infinite*, but `reconnect_max_duration_millis=0` means *give up now*
([sharp edge #2](#known-sharp-edges)).

---

## Knob availability by surface

Three configuration surfaces exist. Not every knob is reachable from every
surface — this matrix shows where each lives.

- **Conn string**: a `ws`/`wss` config string. Works for `Sender.fromConfig`,
  `QwpQueryClient.fromConfig`, and `QuestDB.connect(...)`.
- **Sender builder**: `Sender.builder(...)` (`LineSenderBuilder`) — direct
  ingest only.
- **Facade builder**: `QuestDB.builder()` (`QuestDBBuilder`) — pool knobs only;
  query/ingest behavior must come from the conn string.

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
| `SenderErrorHandler` | ❌ | ✅ `errorHandler()` | ❌ (not reachable) |
| `SenderConnectionListener` | ❌ | ✅ `connectionListener()` | ❌ (not reachable) |
| `target` | ✅ | n/a | via conn string |
| `failover`/`failover_*` | ✅ | n/a | via conn string |
| `serverInfoTimeoutMs` | ❌ | n/a | ❌ (QwpQueryClient builder only) |
| `sender_pool_*`/`query_pool_*` | ✅ | n/a | ✅ |
| `acquire_timeout_ms`/`idle_timeout_ms`/`max_lifetime_ms` | ✅ | n/a | ✅ |

⚠ Gaps worth noting: the ingest **error handler / connection listener** cannot
be installed through the facade at all, and **`serverInfoTimeoutMs`** has no
config key, so a facade query client cannot tune it
([sharp edge #6](#known-sharp-edges)).

---

## Known sharp edges

These are behaviours still under review as clients are aligned. "Intended" means
a deliberate contract that will be kept; "Candidate" means a likely ergonomic
defect targeted for change. The numbered references throughout this spec point
here.

| # | Sharp edge | Status |
| --- | --- | --- |
| 1 | `initial_connect_retry` is implicitly promoted to `SYNC` when any `reconnect_*` knob is set — a resilience knob silently makes startup block. | Candidate |
| 2 | `reconnect_max_duration_millis` name implies "reconnect only" but also governs initial connect; `0` means "give up now" while sibling `0`s mean "infinite"; no infinite mode exists. | Candidate |
| 3 | `failover` sounds like it covers startup but only affects post-connect query `execute()`. Queries have no async/lazy initial connect at all. | Candidate |
| 4 | No first-class write-only facade: a write-only user must still supply a query config and remember `query_pool_min=0`. | Candidate |
| 5 | A single endpoint returning `401`/`403` is treated as cluster-wide terminal and aborts the whole endpoint walk, even at startup, even if other endpoints would accept the credentials. | Intended (documented), revisit |
| 6 | Ingest `errorHandler`/`connectionListener` and query `serverInfoTimeoutMs` are unreachable from the facade. | Candidate |
| 7 | The simplest API (`fromConfig` + async) has the worst error visibility — terminal async failures surface only on later producer calls or at `close()`. | Candidate |
| 8 | No client-side TCP connect timeout: a black-holed host in `addr` blocks the endpoint walk until the OS connect timeout. | Intended (transport limitation), revisit |

---

## Reference

### Store-and-forward semantics

`sf_dir=...` enables SF. There is no separate boolean enable flag.

- The sender owns one slot: `<sf_dir>/<sender_id>/`. Default `sender_id` is
  `default`.
- Multiple independent senders sharing one `sf_dir` must use distinct
  `sender_id` values, else the second fails because the slot lock is held.
- In pooled `QuestDB` usage, `SenderPool` derives per-slot IDs from the base:
  `<base>-0`, `<base>-1`, … so pooled senders never collide.
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
  failure.
- If a server appears before the budget expires, buffered frames are
  sent/replayed and ACK-driven trimming begins.
- If the budget expires before any connection, the sender latches a terminal
  `SenderError` whose message contains `never-connected-budget-exhausted`.
- If it connected at least once and a later outage exhausts the budget, the
  message contains `connection-lost-budget-exhausted`.
- Terminal async errors go to a configured `SenderErrorHandler`; without one
  they surface on later producer calls or at close-time.

There is no infinite-retry mode. For long maintenance windows, set a large
`reconnect_max_duration_millis`. On budget exhaustion the current sender stops;
persisted `sf_dir` data remains for a future sender on the same slot.

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
| server appears before async budget | async + budget | buffered frames sent and ACKed |
| server appears after async budget | async + exhausted | sender terminal; new sender/restart needed |

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

1. Require both ingest and query configs.
2. Parse + validate both configs without connecting (runs even when mins are
   `0`; malformed pool/ingest/query/TLS/auth/enum/range values fail here).
3. Resolve pool keys: explicit builder setters override conn-string keys;
   conflicting pool values across the two conn strings fail.
4. Construct `SenderPool` and `QueryClientPool`.
5. Eagerly create `min` connections per pool.
6. Start the `PoolHousekeeper`.

### Initial-connect mode resolution (`Sender.java`)

```text
if initialConnectMode set explicitly -> use it (incl. OFF + tuned budget)
else if any reconnect_* set          -> SYNC
else                                 -> OFF
```

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

### Reconnect deadline (`CursorWebSocketSendLoop`)

`deadlineNanos = outageStartNanos + reconnect_max_duration_millis * 1e6`; the
loop runs `while (running && now < deadline)`. Hence `0` ⇒ no iterations ⇒
immediate give-up. `QwpAuthFailedException` / `WebSocketUpgradeException` inside
the loop are terminal across all endpoints.
