---
slug: /connect/clients/connect-string
title: Connect string reference
description:
  Configuration knobs for QuestDB native clients (QWP over WebSocket).
  Drives ingress, egress, multi-host failover, and store-and-forward.
---

The QuestDB native client is configured with a single connect string. The
same string format drives QWP (QuestDB Wire Protocol) ingress, QWP egress,
multi-host failover, and the store-and-forward substrate. The native-client
contract is a shared option vocabulary: the same connect string can configure
both ingress and egress across language implementations. Implementation-specific
exceptions are called out in the affected key section and client page.

A `ws::` / `wss::` connect string is a single input shared by both the
ingress sender and the egress query client. Each direction reads the keys
relevant to it and ignores keys meant only for the other direction, so one
connect string configures both without edits. The *Applies to:* tag on each
section below marks which direction a key affects.

For legacy InfluxDB Line Protocol (ILP) transports (`http`, `https`, `tcp`,
`tcps`), see the [ILP overview](/docs/connect/compatibility/ilp/overview/).

**On this page:**

- [Syntax](#syntax)
- [Common patterns](#common-patterns)
- [Recipes](#recipes)
- [Protocols and transports](#protocols-and-transports)
- [Authentication](#auth)
- [TLS](#tls)
- [Auto-flushing](#auto-flush)
- [Buffer sizing](#buffer)
- [Multi-host failover](#failover-keys)
- [Store-and-forward](#sf-keys)
- [Reconnect and failover](#reconnect-keys)
- [Durable ACK](#durable-ack)
- [Query client keys](#egress-keys)
- [Error handling](#error-handling)
- [Key index](#key-index)

## Syntax {#syntax}

A connect string has the form:

```
schema::key1=value1;key2=value2;
```

The `schema` selects the wire protocol and transport. The remaining
`key=value` pairs configure it. The trailing semicolon is optional but
recommended.

For example:

```
ws::addr=localhost:9000;username=admin;password=secret;
```

This selects the QWP WebSocket transport, connects to `localhost:9000`, and
provides basic-auth credentials.

For the list of supported schemas, see
[Protocols and transports](#protocols-and-transports).

### Grammar

- **Schema** — alphanumeric ASCII characters and underscore. Terminated by
  `::`.
- **Key** — alphanumeric ASCII characters and underscore. Terminated by `=`.
  Keys are case-sensitive; the canonical form is lowercase `snake_case`.
- **Value** — any character except control characters
  (U+0000–U+001F, U+007F–U+009F). Terminated by `;`.
- **Escaping** — to include a literal `;` in a value, double it (`;;`).

Example with an escaped semicolon in a password (the actual password value
is `p;ssw;rd`):

```
ws::addr=localhost:9000;username=admin;password=p;;ssw;;rd;
```

### Loading a connect string

The Java client accepts a connect string in three ways:

- From a string literal:

  ```java
  Sender sender = Sender.fromConfig("ws::addr=localhost:9000;");
  ```

- From an environment variable (reads `QDB_CLIENT_CONF`):

  ```java
  Sender sender = Sender.fromEnv();
  ```

- From the builder, which accepts the same option keys programmatically:

  ```java
  Sender sender = Sender.builder(Transport.WS)
      .address("localhost:9000")
      .build();
  ```

Other language clients expose equivalent entry points; see each
[client library page](/docs/connect/overview/#client-libraries) for the
per-language syntax.

## Common patterns {#common-patterns}

Canonical shapes for typical deployments. Each can be extended with
auth, failover, or store-and-forward options from the sections below.

### Local development (no auth, no TLS)

```
ws::addr=localhost:9000;
```

### Production with basic auth (TLS)

```
wss::addr=questdb.example.com:443;username=admin;password=secret;
```

### Production with a custom trust store

```
wss::addr=questdb.example.com:443;username=admin;password=secret;tls_roots=/etc/questdb/ca-roots;tls_roots_password=changeit;
```

### Ingest with store-and-forward across multiple nodes

```
ws::addr=node-a:9000,node-b:9000;sf_dir=/var/lib/myapp/qdb-sf;sender_id=ingest-1;
```

### Query (egress) preferring a replica in your zone

```
wss::addr=node-a:443,node-b:443;target=replica;zone=eu-west-1a;
```

### Tolerate a slow or restarting server at startup

```
ws::addr=node-a:9000;reconnect_max_duration_millis=120000;
```

The 2-minute reconnect budget covers both the *first* connect and any
subsequent reconnect: setting any explicit `reconnect_*` key implicitly
turns on `initial_connect_retry`. See
[Ingress reconnect](#reconnect-keys).

## Recipes {#recipes}

Goal-to-keys mapping. For complete connect-string templates, see
[Common patterns](#common-patterns). For per-key details (type, default,
caveats), follow the section links from the [Key index](#key-index).

| Goal                                              | Direction | Required keys                          | Optional / related                                                                          |
| ------------------------------------------------- | --------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Minimal connect string                            | both      | `addr`                                 | —                                                                                           |
| Enable TLS                                        | both      | `addr` with `wss` schema               | `tls_verify`, `tls_roots`, `tls_roots_password`                                             |
| Basic-auth credentials                            | both      | `username`, `password`                 | `auth_timeout_ms`                                                                           |
| Bearer-token credentials                          | both      | `token`                                | `auth_timeout_ms`                                                                           |
| Multi-host failover                               | both      | `addr=h1,h2,…`                         | `target`, `zone`, `reconnect_*` (ingress), `failover_*` (egress)                            |
| Query only the primary (freshest data)            | egress    | `target=primary`                       | —                                                                                           |
| Query only replicas (offload primary)             | egress    | `target=replica`                       | —                                                                                           |
| Zone-aware routing with DR last-resort            | egress    | `zone=<id>`                            | `target`                                                                                    |
| Tune ingest batching                              | ingress   | —                                      | Clients with auto-flush: `auto_flush_rows`, `auto_flush_interval`, `auto_flush_bytes`       |
| Disable auto-flush (manual `flush()` only)        | ingress   | `auto_flush=off`                       | —                                                                                           |
| Memory-buffered ingest (no disk durability)       | ingress   | (omit `sf_dir`)                        | `init_buf_size`, `max_buf_size`                                                             |
| Durable store-and-forward ingest                  | ingress   | `sf_dir`                               | `sender_id`, `sf_max_bytes`, `sf_max_total_bytes`, `sf_append_deadline_millis`              |
| Run multiple senders sharing one `sf_dir`         | ingress   | `sf_dir`, `sender_id`                  | unique `sender_id` per sender                                                               |
| Orphan recovery for crashed senders               | ingress   | `drain_orphans=on`                     | `max_background_drainers`                                                                   |
| End-to-end durable acknowledgement                | ingress   | `request_durable_ack=on`               | `durable_ack_keepalive_interval_millis`                                                     |
| Tune ingress reconnect backoff                    | ingress   | —                                      | `reconnect_initial_backoff_millis`, `reconnect_max_backoff_millis`, `reconnect_max_duration_millis` (any of these also implies `initial_connect_retry=on`) |
| Force fail-fast on initial connect                | ingress   | `initial_connect_retry=off`            | overrides the implicit promotion from any explicit `reconnect_*` key                        |
| Retry initial connect in background               | ingress   | `initial_connect_retry=async`          | `reconnect_*`                                                                               |
| Fast `close()` without drain                      | ingress   | `close_flush_timeout_millis=0`         | —                                                                                           |
| Disable per-query egress failover                 | egress    | `failover=off`                         | —                                                                                           |
| Tune per-query egress failover                    | egress    | —                                      | `failover_max_attempts`, `failover_backoff_initial_ms`, `failover_backoff_max_ms`, `failover_max_duration_ms` |
| Configure async error inbox                       | both      | —                                      | `error_inbox_capacity`                                                                      |

## Protocols and transports {#protocols-and-transports}

*Applies to: ingress and egress.*

The schema prefix selects the QWP transport.

| Schema | Transport       | Default port | Notes                                                                                                                |
| ------ | --------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `ws`   | WebSocket       | `9000`       | QWP over plain WebSocket. Use for development or trusted networks.                                                   |
| `wss`  | WebSocket + TLS | `9000`       | QWP over TLS-secured WebSocket. Recommended for production.                                                          |
| `udp`  | UDP             | `9007`       | Fire-and-forget metrics ingest, single table per datagram. |

The default port is applied when `addr` omits `:port`. Note that `wss` does
**not** default to `443`: both `ws` and `wss` use `9000` unless overridden.

QWP negotiates its protocol version during the WebSocket upgrade — clients
do not need to configure it.

## Authentication {#auth}

*Applies to: ingress and egress.*

QWP runs over WebSocket and uses HTTP-style credentials sent on the
WebSocket upgrade request.

- `username` — username for HTTP basic authentication.
- `password` — password for HTTP basic authentication.
- `token` — bearer token sent as `Authorization: Bearer <token>`. Mutually
  exclusive with `username` / `password`. Token auth avoids the per-request
  overhead of basic auth and is the recommended path for Enterprise
  deployments.
- `auth_timeout_ms` — per-host upper bound on the upgrade response read.
  Does not cover TCP connect, TLS handshake, or post-upgrade frame reads —
  those use OS or hard-coded defaults. Default: `15000` (15 s).

**Mutual TLS (mTLS).** Not supported. The client validates the server's
certificate against a trust store but cannot present a client certificate;
the TLS handshake is server-authenticated only. `tls_roots` /
`tls_roots_password` configure server-cert trust, not client identity. Use
`token=<token>` or `username=` / `password=` for client authentication.

## TLS {#tls}

*Applies to: ingress and egress.*

TLS is enabled by selecting the `wss` schema.

- `tls_verify` — controls server certificate verification. Options: `on`,
  `unsafe_off`. Default: `on`. `unsafe_off` disables verification; **use
  only for testing** — bypassing verification makes the connection
  vulnerable to MITM attacks.
- `tls_roots` — path to a file of trusted root certificates, used instead
  of the system trust store. The on-disk format is client-specific — the
  Java client loads a JKS keystore, the .NET client a PKCS#12 / PFX
  bundle, and some clients a PEM file. If omitted, the system default
  trust store is used.
- `tls_roots_password` — password for the `tls_roots` file, for clients
  whose trust-store format requires one. Clients that load a passwordless
  format (for example, PEM) reject this key.

:::note Client support varies

`tls_roots` / `tls_roots_password` support — and the trust-store file
format expected — vary by client. Some clients (for example, Go) verify
against the operating-system trust store only and **reject these keys at
parse time**; to trust a private CA there, install it in the host trust
store. Check the relevant
[client library page](/docs/connect/overview/#client-libraries) for
specifics.

Mutual TLS (client certificates) is not supported by QuestDB — the server
does not negotiate client certificates regardless of client. See
[Authentication](#auth) for the supported credential paths.

:::

See also the [server-side TLS configuration](/docs/security/tls/).

## Auto-flushing {#auto-flush}

*Applies to: ingress.*

The client buffers rows in memory and flushes them to the server in batches.
For clients that implement auto-flushing, these keys control when the buffer
is sent without an explicit `flush()` call. The three triggers below are OR'd:
whichever threshold trips first sends the batch.

- `auto_flush` — global enable. Options: `on`, `off`. Default where supported:
  `on`.
  When `off`, the application must call `flush()` explicitly to send
  buffered rows.
- `auto_flush_rows` — flush when the buffered row count reaches this
  threshold. Set to `off` to disable. Default where supported: `1000`.
- `auto_flush_interval` — flush when this many milliseconds have elapsed
  since the first buffered row. Evaluated on the next `at()` / `flush()`
  call (not driven by a wall-clock timer). Set to `off` to disable.
  Default where supported: `100` (100 ms).
- `auto_flush_bytes` — flush when the encode buffer reaches this byte
  size. Set to `off` to disable. Default where supported: `8m` (8 MiB). Accepts
  [size suffixes](#size-suffixes). When set to a positive value, the
  client clamps the effective threshold down to 90% of the server-
  advertised `X-QWP-Max-Batch-Size` at handshake (one-way: a configured
  value smaller than the advertised cap is kept as-is). The 10% margin
  absorbs encoding overhead such as schema and dict-delta bytes.
  Setting `off` opts out of byte-based auto-flush entirely — the
  handshake clamp does not re-enable it, and the application takes
  responsibility for not producing oversized batches. Older servers
  that do not advertise the header leave the configured value
  untouched.

:::note Rust support

The Rust client currently does not implement auto-flushing. It accepts
`auto_flush=off` for compatibility and rejects `auto_flush=on`,
`auto_flush_rows`, `auto_flush_interval`, and `auto_flush_bytes`. Rust
applications must call `flush()` explicitly; see the
[Rust client page](/docs/connect/clients/rust/#sending-data-column-major).

:::

## Buffer sizing {#buffer}

*Applies to: ingress (encode buffer).*

These keys control the in-memory row buffer that the client uses before
flushing.

- `init_buf_size` — initial buffer size in bytes. Default: `65536`
  (64 KiB). Accepts [size suffixes](#size-suffixes).
- `max_buf_size` — maximum buffer size; the buffer grows up to this cap.
  Default: `104857600` (100 MiB). Accepts size suffixes.
- `max_name_len` — maximum allowed length of a table or column name in
  bytes. Default: `127`.
- `max_datagram_size` — UDP only. Maximum datagram size; defaults to a
  value below typical Ethernet MTU.

### Size suffixes {#size-suffixes}

Size-typed values (`init_buf_size`, `max_buf_size`, `sf_max_bytes`,
`sf_max_total_bytes`) accept JVM-style unit suffixes. Suffixes are
case-insensitive and 1024-based, matching `-Xmx` conventions:

| Suffix         | Meaning           | Example      |
| -------------- | ----------------- | ------------ |
| *(none)*       | bytes             | `65536`      |
| `k` or `kb`    | KiB (× 1024)      | `64k`        |
| `m` or `mb`    | MiB (× 1024²)     | `4m`, `4mb`  |
| `g` or `gb`    | GiB (× 1024³)     | `1g`, `10gb` |
| `t` or `tb`    | TiB (× 1024⁴)     | `1t`         |

## Multi-host failover {#failover-keys}

*Applies to: ingress and egress. The [Role filter and zone preference](#role-filter-and-zone-preference)
sub-section is egress only.*

:::note QuestDB Enterprise

Multi-host failover requires QuestDB Enterprise. OSS is single-node — there
is no secondary server to fail over to.

:::

The connect string accepts multiple `host:port` pairs in `addr`. Two
syntaxes are accepted and accumulate:

```
ws::addr=node-a:9000,node-b:9000,node-c:9000;
```

```
ws::addr=node-a:9000;addr=node-b:9000;addr=node-c:9000;
```

Empty entries (`,,`, or leading / trailing commas) are rejected.

The I/O loop rotates through the endpoints on every reconnect attempt
within a single outage budget. When the server rejects the connection
because the current host is in the wrong role, the client treats it as
failover input and immediately tries the next endpoint without waiting for
backoff.

### Role filter and zone preference

Both `target` and `zone` apply to **egress only**. QuestDB is currently a
single-primary cluster: ingress automatically follows the primary across
the host list and adapts when the primary moves to another node. These
keys are silently accepted on ingress but have no effect.

- `target` — server-role filter applied per endpoint after the upgrade
  reads `SERVER_INFO`. Options:
  - `any` (default) — no preference; route to any healthy endpoint.
  - `primary` — route only to the writer. Use when queries must see the
    most recent data; replicas are eventually consistent and may lag the
    primary.
  - `replica` — route only to replicas. Use for historical or analytical
    queries to avoid contending with the ingest traffic the primary is
    handling.

  Endpoints whose role does not match the filter are skipped.

- `zone` — client zone identifier (opaque, case-insensitive — e.g.
  `eu-west-1a`, `dc-amsterdam`). When set, egress prefers endpoints whose
  server-advertised `zone_id` matches the client's. Mismatched-zone
  endpoints — typically a remote DR replica — drop to a lower priority
  tier; the client routes to them only as a last resort, when every
  same-zone endpoint is unhealthy. With `target=primary`, zone preference
  collapses: the writer is followed regardless of zone.

The full behavioural model — host picker policy, host-health states, error
classification, and backoff schedule — is documented under
[Client failover](/docs/high-availability/client-failover/concepts/).
Server-side HA is covered separately under the
[High Availability section](/docs/high-availability/overview/).

Related: [Reconnect and failover](#reconnect-keys),
[Store-and-forward](#sf-keys).

:::warning Enable DEDUP on tables ingested through failover

On unplanned failover — when the primary dies before issuing a durable
ACK — the client replays unacknowledged frames against the new primary.
Without [DEDUP](/docs/concepts/deduplication/) on the target table, those
replays can produce duplicate rows. Tables ingested through a multi-host
failover connect string **must** declare `DEDUP UPSERT KEYS(...)` covering
row identity. See [Delivery semantics](/docs/concepts/delivery-semantics/)
for the full at-least-once / exactly-once model.

:::

## Store-and-forward {#sf-keys}

*Applies to: ingress.*

Store-and-forward (SF) is an opt-in durability substrate available on QWP /
WebSocket. The client persists outgoing frames to disk before sending; the
server's cumulative ACK trims acknowledged segments. If the connection drops
or the client process restarts, the I/O thread silently reconnects and
replays whatever is still on disk.

To enable SF mode, set `sf_dir`. Without it, the client runs a memory-only
equivalent — same architecture, no durability across restarts.

### Storage

- `sf_dir` — parent directory under which the slot lives. The slot path is
  `<sf_dir>/<sender_id>/`. Required for SF mode; omit for memory-only mode.
  Path handling:
  - Taken verbatim. Absolute paths recommended for production; relative
    paths resolve against the process working directory.
  - Shell-style expansions like `~` are **not** expanded by the client.
  - The leaf directory is created automatically if missing, but its parent
    must already exist — the client does not create paths recursively.
- `sender_id` — slot identity. The slot lives at `<sf_dir>/<sender_id>/`,
  used verbatim as the directory name. Allowed characters: letters,
  digits, `_`, `-`. No path separators, no `.`, no spaces. Two senders
  sharing the same `sender_id` collide on the slot lock — the second one
  fails fast. Default: `default`.
- `sf_durability` — disk durability mode. Currently only `memory` is
  shipping. (`flush` and `append` per-write fsync modes are planned.)
- `sf_max_bytes` — per-segment rotation threshold. Must be ≥ the largest
  single flushed frame. Default: `4 MiB` (`4m`). Accepts
  [size suffixes](#size-suffixes).
- `sf_max_total_bytes` — hard cap on per-slot storage. When the cap is
  reached, append blocks until ACKs trim space (see
  `sf_append_deadline_millis`). Defaults: `10 GiB` (`10g`) in SF mode,
  `128 MiB` (`128m`) in memory mode. Accepts size suffixes.

### Sender restart and replay

SF persists outgoing frames and the durable-ack watermark to disk under
`<sf_dir>/<sender_id>/`.

**Recovery is triggered at Sender creation.** When the application
instantiates a new sender — `Sender.fromConfig(...)`, `Sender.fromEnv()`,
or the builder — the client analyses the on-disk state under `sf_dir`
before returning control. There is no background daemon; replay is part
of the Sender lifecycle.

To resume from the previous session's buffer after a restart — clean
exit, SIGKILL, host crash, or reboot — instantiate a new sender with the
**same** `sf_dir` and `sender_id`:

1. The new sender acquires the slot's POSIX `flock` (`LockFileEx` on
   Windows). If the previous process is still alive and holds the lock,
   the new sender fails fast with `sf slot already in use`. The kernel
   releases the lock on process exit, even after SIGKILL, so a crashed
   sender does not leave the slot stuck.
2. Recovery reads the persisted ack watermark and replays every on-disk
   segment past it against the server. Replay runs on the I/O thread in
   parallel with the application's new `append()` calls — the application
   is not blocked.

If `sf_dir` is a relative path, ensure the process resolves it the same
way after restart (typically: use an absolute path).

For an **abandoned** slot to be picked up by a *different* sender — the
original is never coming back — see [Orphan recovery](#orphan-recovery)
below.

**At-least-once delivery.** Replay can re-send frames the server already
accepted but did not durable-acknowledge before the previous sender died.
To prevent duplicate rows in the target table, declare
[DEDUP](/docs/concepts/deduplication/) `UPSERT KEYS(...)` covering row
identity. See [Delivery semantics](/docs/concepts/delivery-semantics/) for
the full model and recipe.

### Backpressure

- `sf_append_deadline_millis` — maximum time `append()` waits for trim to
  free space when the cap is hit. If the deadline fires, the call throws.
  Default: `30000` (30 s).

### Orphan recovery

When `drain_orphans=on`, the new sender scans `<sf_dir>/*` at startup for
sibling slots that are unlocked and contain unacked data. The scan runs
as part of Sender creation (alongside the same-slot recovery above). Each
orphan slot is locked, drained on its own dedicated connection, and
released — **multiple orphans drain in parallel**, up to
`max_background_drainers` concurrent drains.

- `drain_orphans` — `on` enables the orphan drainer pool. Default: `off`.
- `max_background_drainers` — maximum concurrent drainers. Default: `4`.

For delivery semantics, architecture, and tradeoffs (at-least-once
guarantees, DEDUP requirements, segment-granular trim), see
[Store-and-forward concepts](/docs/high-availability/store-and-forward/concepts/).

## Reconnect and failover {#reconnect-keys}

*Applies to: ingress and egress (separate key families).*

QWP / WebSocket has two distinct recovery loops, each with its own knob
family. The **ingress** cursor-engine reconnect loop runs continuously for
the lifetime of the sender. The **egress** per-`Execute()` failover loop
runs once per query.

### Ingress reconnect

These keys control the cursor-engine reconnect loop used by QWP ingest.
SF mode and memory-only mode share the same loop. A **running** sender
retries a transport outage indefinitely with capped exponential backoff —
there is no wall-clock give-up: the whole point of the buffering
architecture is that a producer survives an arbitrarily long outage.

- `reconnect_initial_backoff_millis` — initial wait between reconnect
  attempts. Backoff grows exponentially up to `reconnect_max_backoff_millis`.
  Default: `100`. Setting this enables `initial_connect_retry=on` implicitly;
  see below.
- `reconnect_max_backoff_millis` — cap on per-attempt backoff.
  Default: `5000` (5 s). Setting this enables
  `initial_connect_retry=on` implicitly; see below.
- `reconnect_max_duration_millis` — time budget for the **blocking sync
  initial connect** (`initial_connect_retry=on`): once exceeded, the
  constructor gives up and returns the error. The running loop and the
  `async` initial connect never consult it. Default: `300000` (5 min).
  Setting this enables `initial_connect_retry=on` implicitly; see below.
- `initial_connect_retry` — whether the initial connect attempt is retried
  on failure.
  - `off` (default, alias `false`) — fail fast on initial connect failure.
  - `on` (aliases `sync`, `true`) — retry synchronously on the user
    thread, up to `reconnect_max_duration_millis`.
  - `async` — return the `Sender` immediately; the I/O thread retries in
    the background indefinitely, surfacing only genuine terminal failures
    (auth reject, durable-ack mismatch) via the error inbox.

  **Implicit promotion.** Setting any explicit `reconnect_*` key without
  also choosing an `initial_connect_retry` mode promotes
  `initial_connect_retry` to `on` automatically, so the budget also covers
  the *first* connect attempt — without the promotion,
  `reconnect_max_duration_millis` would be inert. To keep the historical
  fail-fast behaviour on first connect while still tuning the backoff, set
  `initial_connect_retry=off` explicitly; the override is preserved.
- `close_flush_timeout_millis` — `close()` blocks up to this many
  milliseconds waiting for buffered frames to drain. Default: `5000` (5 s).
  Set to `0` or `-1` for fast close (skip the drain).

Auth failures during reconnect (authentication rejected, version mismatch,
durable-ack mismatch, non-101 upgrade without a role hint) are immediately
terminal — the loop does not retry them.

### Egress failover {#egress-failover}

These keys control the per-`Execute()` reconnect loop on the QWP query
client. Each query has its own budget; the loop resets between queries.
Requires QuestDB Enterprise (multi-host).

- `failover` — master switch. `on` (default) or `off`. When `off`,
  transport errors surface directly through `onError` without retry.
- `failover_max_attempts` — cap on reconnects per `Execute()` (initial
  attempt + `N − 1` failovers). Default: `8`.
- `failover_backoff_initial_ms` — first post-failure sleep. Default: `50`.
- `failover_backoff_max_ms` — cap on per-attempt sleep. Default: `1000`
  (1 s).
- `failover_max_duration_ms` — total wall-clock budget per `Execute()`.
  Default: `30000` (30 s). Set to `0` for unbounded.

## Durable ACK {#durable-ack}

*Applies to: ingress.*

:::note QuestDB Enterprise

Durable ACK requires QuestDB Enterprise. OSS is single-node and does not
ship WALs off-box, so the server-side durability-acknowledgement signal
that drives this protocol is enterprise-only.

:::

QuestDB Enterprise ships Write-Ahead Logs (WALs) from the primary to an
object store or another file system — typically over the network. Once a
WAL is durably shipped, the server emits a `STATUS_DURABLE_ACK` frame to
the store-and-forward client; the client marks that frame's FSN as durable
only after this acknowledgement arrives.

The benefit: if the primary dies before shipping a WAL, the client still
holds the corresponding frames in its SF buffer and replays them against
the new primary on failover — closing the data-loss window that a
transport-level OK ACK alone cannot close.

- `request_durable_ack` — when `on`, the client gates trim on
  `STATUS_DURABLE_ACK` frames from the server, suppressing OK-driven trim.
  Default: `off`.
- `durable_ack_keepalive_interval_millis` — interval at which the client
  emits keepalive PINGs while waiting for durable-ack frames. Required
  because the server only flushes pending durable acks on inbound recv
  events. Default: `200` (ms). Set to `0` or a negative value to disable.

See the [QWP Egress (WebSocket)](/docs/connect/wire-protocols/qwp-egress-websocket/)
wire protocol for the underlying mechanism.

## Query client keys {#egress-keys}

*Applies to: egress (query client).*

These keys are accepted by the QWP query client's connect string (the
egress / `QwpQueryClient` path). The Sender (ingress) silently consumes
the same keys so that a single connect string can be shared between the
Sender and the `QwpQueryClient` without an "unknown configuration key"
error — the Sender does not interpret the values. Range, enum, and
type checks happen on the egress side; a value the `QwpQueryClient`
parser would reject is still silently accepted by the Sender.

- `compression` — result-batch compression the client advertises. Options:
  `raw` (default — no compression, the accept-encoding header is omitted so
  pre-compression servers see an unchanged handshake), `zstd` (demand
  zstd), `auto` (accept zstd if the server offers it).
- `compression_level` — zstd level hint. Range `1`–`22` (server clamps to
  `1`–`9`). Default `1` — the cheapest server-side CPU; raise it if you
  measure a meaningful ratio improvement on your payload and the server has
  the headroom. Ignored when `compression=raw`.
- `initial_credit` — byte-credit flow-control budget. `0` (default) means
  unbounded: the server streams as fast as the network allows. Set a
  non-zero budget to bound server push on a memory-constrained client.
- `max_batch_rows` — upper bound on rows per result batch.
- `query_close_timeout_ms` — bounds the close-path cleanup drain (closing a
  cursor mid-result-set, breaking out of iteration) before the connection
  is declared desynced and discarded. Positive integer milliseconds;
  default `5000` (5 s).
- `buffer_pool_size` — number of decoded result-batch buffers the I/O
  thread keeps in rotation. Sets the in-flight window between the
  receive/decode loop and the user's `onBatch` callback: at most this many
  batches are decoded ahead of the consumer. Default: `4`. Minimum: `1`
  (no read-ahead — the I/O thread waits for each `releaseBuffer()` call
  before decoding the next batch). Each buffer reserves about 64 KiB of
  native scratch, so raising the value grows pinned memory linearly. When
  the pool drains, the I/O thread parks and the TCP receive window closes,
  applying back-pressure to the server. Must be set before `connect()`.

Equivalent options exist on the query client's builder API (for example,
`WithQwpQueryCompression`, `WithQwpQueryCompressionLevel`,
`WithQwpQueryInitialCredit` in the Go client). See the
[client library page](/docs/connect/overview/#client-libraries) for the
per-language names.

## Error handling {#error-handling}

*Applies to: ingress and egress.*

The QWP / WebSocket I/O loop reports errors via an asynchronous inbox
consumed by the application.

- `error_inbox_capacity` — bounded capacity for async error notifications.
  Must be ≥ `16`. Overflow drops the oldest entry and bumps a
  `droppedErrorNotifications` counter. Default: `256`.

The following per-category keys select the **error policy** — whether the
I/O loop halts the sender (`halt`) or drops the rejected batch and continues
(`drop`) — for each class of error. They are **defined by the spec but not yet
implemented in the Java client**: the connect-string parser does not recognise
them and there is no builder equivalent. The only error-handling surface wired
today is the async `errorHandler(...)` callback and `error_inbox_capacity`
(both WebSocket/QWP only — see [Error handling](#error-handling)). New client
implementations should accept the keys below in the connect string per the spec.

- `on_server_error` — global default for server-reject status frames.
  Accepts `auto` \| `halt` \| `drop`. Default: `auto` (applies the built-in
  per-category defaults listed below).
- `on_schema_error` — schema-validation errors. `halt` \| `drop`. Default: `drop`.
- `on_parse_error` — client-side parse errors. `halt` \| `drop`. Default: `halt`.
- `on_internal_error` — unexpected server-side faults. `halt` \| `drop`. Default: `halt`.
- `on_security_error` — auth / TLS errors. `halt` \| `drop`. Default: `halt`.
- `on_write_error` — transport / table write failures. `halt` \| `drop`. Default: `drop`.

**Specified resolution precedence**, from highest to lowest (as documented on
`SenderError.Policy`):

1. Builder `errorPolicyResolver(...)` — full programmatic control. _(not yet
   implemented in the Java client)_
2. Builder per-category `errorPolicy(category, policy)`. _(not yet implemented
   in the Java client)_
3. The connect-string per-category key (e.g. `on_schema_error`) — overrides
   the global default when set.
4. `on_server_error` — the global default; when left at `auto` the built-in
   per-category defaults above apply.

`PROTOCOL_VIOLATION` and `UNKNOWN` errors are always fatal (forced `halt`)
and cannot be overridden. For the full model see the public
[QWP error-handling spec](https://github.com/questdb/java-questdb-client/blob/main/design/qwp-cursor-error-api.md)
and the `SenderError.Policy` Javadoc in the client source.

## Key index {#key-index}

Alphabetical list of every option. The Section column links to the full
description and behaviour notes.

| Key                                     | Type                          | Default                       | Section                                                       |
| --------------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `addr`                                  | `host:port[,host:port…]`      | required                      | [Multi-host failover](#failover-keys)                         |
| `auth_timeout_ms`                       | int (ms)                      | `15000`                       | [Authentication](#auth)                                       |
| `auto_flush`                            | enum (`on` / `off`)           | `on` (Rust: only `off`)       | [Auto-flushing](#auto-flush)                                  |
| `auto_flush_bytes`                      | size                          | `8m` (Rust: rejected)         | [Auto-flushing](#auto-flush)                                  |
| `auto_flush_interval`                   | int (ms) / `off`              | `100` (Rust: rejected)        | [Auto-flushing](#auto-flush)                                  |
| `auto_flush_rows`                       | int / `off`                   | `1000` (Rust: rejected)       | [Auto-flushing](#auto-flush)                                  |
| `buffer_pool_size`                      | int (≥ 1)                     | `4`                           | [Query client keys](#egress-keys)                             |
| `close_flush_timeout_millis`            | int (ms)                      | `5000`                        | [Ingress reconnect](#reconnect-keys)                          |
| `compression`                           | enum (`raw` / `zstd` / `auto`) | `raw`                        | [Query client keys](#egress-keys)                             |
| `compression_level`                     | int (`1`–`22`)                | `1`                           | [Query client keys](#egress-keys)                             |
| `drain_orphans`                         | enum (`on` / `off`)           | `off`                         | [Store-and-forward](#sf-keys)                                 |
| `durable_ack_keepalive_interval_millis` | int (ms)                      | `200`                         | [Durable ACK](#durable-ack)                                   |
| `error_inbox_capacity`                  | int (≥ 16)                    | `256`                         | [Error handling](#error-handling)                             |
| `failover`                              | enum (`on` / `off`)           | `on`                          | [Egress failover](#reconnect-keys)                            |
| `failover_backoff_initial_ms`           | int (ms)                      | `50`                          | [Egress failover](#reconnect-keys)                            |
| `failover_backoff_max_ms`               | int (ms)                      | `1000`                        | [Egress failover](#reconnect-keys)                            |
| `failover_max_attempts`                 | int                           | `8`                           | [Egress failover](#reconnect-keys)                            |
| `failover_max_duration_ms`              | int (ms)                      | `30000`                       | [Egress failover](#reconnect-keys)                            |
| `init_buf_size`                         | size                          | `65536` (64 KiB)              | [Buffer sizing](#buffer)                                      |
| `initial_connect_retry`                 | enum (`off` / `on` / `async`) | `off` (auto-promoted to `on` when any explicit `reconnect_*` key is set) | [Ingress reconnect](#reconnect-keys)                          |
| `initial_credit`                        | int (bytes)                   | `0` (unbounded)               | [Query client keys](#egress-keys)                             |
| `max_background_drainers`               | int                           | `4`                           | [Store-and-forward](#sf-keys)                                 |
| `max_batch_rows`                        | int                           | server default                | [Query client keys](#egress-keys)                             |
| `max_buf_size`                          | size                          | `104857600` (100 MiB)         | [Buffer sizing](#buffer)                                      |
| `max_datagram_size`                     | size                          | (UDP) below typical MTU       | [Buffer sizing](#buffer)                                      |
| `max_name_len`                          | int                           | `127`                         | [Buffer sizing](#buffer)                                      |
| `on_internal_error` *                   | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `on_parse_error` *                      | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `on_schema_error` *                     | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `on_security_error` *                   | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `on_server_error` *                     | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `on_write_error` *                      | enum                          | — (reserved)                  | [Error handling](#error-handling)                             |
| `password`                              | string                        | unset                         | [Authentication](#auth)                                       |
| `query_close_timeout_ms`                | int (ms)                      | `5000`                        | [Query client keys](#egress-keys)                             |
| `reconnect_initial_backoff_millis`      | int (ms)                      | `100`                         | [Ingress reconnect](#reconnect-keys)                          |
| `reconnect_max_backoff_millis`          | int (ms)                      | `5000`                        | [Ingress reconnect](#reconnect-keys)                          |
| `reconnect_max_duration_millis`         | int (ms)                      | `300000` (5 min)              | [Ingress reconnect](#reconnect-keys)                          |
| `request_durable_ack`                   | enum (`on` / `off`)           | `off`                         | [Durable ACK](#durable-ack)                                   |
| `sender_id`                             | string                        | `default`                     | [Store-and-forward](#sf-keys)                                 |
| `sf_append_deadline_millis`             | int (ms)                      | `30000` (30 s)                | [Store-and-forward](#sf-keys)                                 |
| `sf_dir`                                | path                          | unset (memory mode)           | [Store-and-forward](#sf-keys)                                 |
| `sf_durability`                         | enum (`memory`)               | `memory`                      | [Store-and-forward](#sf-keys)                                 |
| `sf_max_bytes`                          | size                          | `4 MiB`                       | [Store-and-forward](#sf-keys)                                 |
| `sf_max_total_bytes`                    | size                          | `128 MiB` mem / `10 GiB` SF   | [Store-and-forward](#sf-keys)                                 |
| `target`                                | enum (`any` / `primary` / `replica`) | `any`                  | [Multi-host failover](#failover-keys)                         |
| `tls_roots`                             | path                          | system trust store            | [TLS](#tls)                                                   |
| `tls_roots_password`                    | string                        | — (client-specific)           | [TLS](#tls)                                                   |
| `tls_verify`                            | enum (`on` / `unsafe_off`)    | `on`                          | [TLS](#tls)                                                   |
| `token`                                 | string                        | unset                         | [Authentication](#auth)                                       |
| `username`                              | string                        | unset                         | [Authentication](#auth)                                       |
| `zone`                                  | string                        | unset                         | [Multi-host failover](#failover-keys)                         |

\* Reserved by the spec; the Java connect-string parser does not yet
recognise these — they are currently wired only via the fluent builder
API. New client implementations should accept them. See
[Error handling](#error-handling).
