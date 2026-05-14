---
title: QWP egress (WebSocket)
description:
  Wire-protocol specification for QuestDB's WebSocket-based streaming
  query-result protocol.
---

import QwpMessageHeader from "../partials/_qwp.message-header.partial.mdx"

:::info Audience

This is a **wire-protocol specification** for client implementers building a
new QuestDB query client from scratch. End users should see the
[language client guides](/docs/query/overview) and the
[connect string reference](/docs/client-configuration/connect-string).

:::

QWP egress streams SQL query results to clients over
[WebSocket](https://datatracker.ietf.org/doc/html/rfc6455), reusing the same
columnar binary encoding as
[QWP ingress](/docs/protocols/qwp-ingress-websocket/). The column types, null
handling, and per-column data encodings are identical. Egress adds a message
kind byte at the start of each payload, eight new message kinds for the
request/response lifecycle, and byte-credit flow control.

For data ingestion, see
[QWP ingress (WebSocket)](/docs/protocols/qwp-ingress-websocket/).

## Why implement a QWP query client

If your language already has a QuestDB client, use it — the
[language client guides](/docs/query/overview) list what's available. The
rest of this section is for implementers writing a new one (e.g., to bring
QWP query support to JavaScript, Rust, .NET, or runtimes that the existing
clients don't cover).

Compared with the row-oriented HTTP `/exec` JSON endpoint, QWP egress trades
a denser binary encoding for higher throughput and lower CPU on both ends:

- **Columnar result batches.** Each batch is a single QWP table block — the
  same shape QuestDB uses on disk. No per-row type tags, no JSON parsing.
- **Server-driven schemas.** After the first batch carries the schema in
  full mode, subsequent batches reference it by integer ID. No repeated
  column metadata on the wire.
- **Per-connection symbol dictionary.** Repeated queries on the same
  connection (BI dashboards refreshing identical SELECTs) reuse prior
  symbol IDs without retransmitting strings.
- **Byte-credit flow control.** The client tells the server how many bytes
  it's ready to receive; the server pauses production when the window is
  exhausted. Bounded memory for arbitrarily large result sets.
- **zstd compression (optional).** Negotiated at the upgrade,
  applied per-batch when it shrinks the payload.
- **Bind parameters.** Typed binds prevent SQL injection and let the
  server reuse plans without re-parsing.
- **Multi-host failover (Enterprise).** Connect strings can list multiple
  endpoints with role/zone preferences; clients reconnect and replay
  on transport failure.

A minimum-viable client that supports SELECTs with the common column types
(BOOLEAN, LONG, DOUBLE, TIMESTAMP, VARCHAR, SYMBOL) plus simple binds is
on the order of ~600 lines in a typed language, plus a WebSocket library
and (optionally) a zstd dependency.

The authoritative reference implementation is
[`java-questdb-client`](https://github.com/questdb/java-questdb-client). It's
worth keeping open in a tab as you read this page.

## Overview

Key properties:

- **Columnar result batches.** Each batch is a single QWP table block (schema
  section followed by per-column data with null bitmaps). The decoder is the
  same code path as ingress.
- **Server-driven schemas.** The server assigns connection-scoped schema IDs.
  Full mode (0x00) on the first batch of a query; reference mode (0x01) on
  subsequent batches with the same column set.
- **Per-connection symbol dictionary.** The server accumulates symbol entries
  across all queries on the connection. Repeated queries reuse prior IDs
  without retransmitting the strings.
- **Byte-credit flow control.** The client grants the server permission to
  send up to N bytes of result data. The server pauses once the credit window
  is exhausted. A row floor guarantees forward progress.
- **One result set per request.** One `QUERY_REQUEST` produces zero or more
  `RESULT_BATCH` frames followed by exactly one terminator (`RESULT_END`,
  `EXEC_DONE`, or `QUERY_ERROR`).

## Transport and versioning

### Endpoint

Egress uses a dedicated endpoint, separate from ingress:

```text
GET /read/v1
```

This separation lets operators route, scale, and authorize ingest and query
workloads independently. Mixed-mode clients open one connection per direction.

### Version negotiation

Version and compression are negotiated at the HTTP upgrade:

**Client request headers:**

| Header                  | Required | Description                                                                 |
|-------------------------|----------|-----------------------------------------------------------------------------|
| `X-QWP-Max-Version`     | No       | Maximum QWP version the client supports. Defaults to 1 if absent.           |
| `X-QWP-Client-Id`       | No       | Free-form client identifier (e.g., `java-egress/1.0.0`).                   |
| `X-QWP-Accept-Encoding` | No       | Comma-separated list of acceptable result batch body encodings (see below). |
| `X-QWP-Max-Batch-Rows`  | No       | Client-preferred per-batch row cap; the server clamps to its own hard limit, so this only ever asks for *smaller* batches (lower latency to first row, more per-batch overhead). `0` or absent = server default. |

**Server response headers:**

| Header                   | Description                                                              |
|--------------------------|--------------------------------------------------------------------------|
| `X-QWP-Version`          | Negotiated version = `min(clientMax, serverMax)`.                        |
| `X-QWP-Content-Encoding` | Server's selected encoding from the client's accept list. Absent = raw. |

The connection-level contract from the ingress spec applies: every message's
header version byte must equal the negotiated version.

### Authentication

Authentication is handled at the HTTP level during the WebSocket upgrade,
identical to ingress. See the
[ingress authentication section](/docs/protocols/qwp-ingress-websocket/#authentication)
for supported methods.

### Batch body compression

`X-QWP-Accept-Encoding` is a comma-separated list of tokens. First match wins.

| Token    | Description                                                                     |
|----------|---------------------------------------------------------------------------------|
| `raw`    | No compression (also accepted as `identity`).                                   |
| `zstd`   | Whole-batch zstd compression. Optional `level=N` hint; server clamps to [1,9]. |

When `zstd` is negotiated, individual `RESULT_BATCH` frames set `FLAG_ZSTD`
on a per-batch basis. A batch whose compressed form is larger than raw ships
uncompressed. The region before the payload (msg_kind + request_id +
batch_seq) is never compressed so the client can dispatch frames without
decompressing first.

Absent `X-QWP-Accept-Encoding`, the server defaults to `raw`.

### Current version

Version 1 is the initial egress release. Version 2 adds an unsolicited
`SERVER_INFO` frame (see [SERVER_INFO](#server_info-0x18)) delivered as the first
WebSocket frame after the upgrade. A v1 client never sees it.

## Client lifecycle

The end-to-end shape of a QWP query client session, before the encoding
details:

1. **Open WebSocket to `/read/v1`.** Standard `Upgrade: websocket` headers,
   plus:
   - `X-QWP-Max-Version: 2` — request v2 to receive `SERVER_INFO`; the
     server downgrades to v1 if it doesn't support v2.
   - `X-QWP-Client-Id: <name>/<version>` — recommended.
   - `X-QWP-Accept-Encoding: zstd, raw` — optional; opt into compression.
   - `X-QWP-Max-Batch-Rows: <n>` — optional; request smaller batches than
     the server default (for lower latency to first row).
   - Authentication header (`Authorization: Basic …` or `Authorization: Bearer …`).
2. **Verify the upgrade.** On `101 Switching Protocols`:
   - `X-QWP-Version` is the negotiated version. Use it as the `version`
     byte in every outgoing message header.
   - `X-QWP-Content-Encoding` is the server's chosen compression (absent
     means `raw`).
3. **(v2 only) Read `SERVER_INFO`.** The first WebSocket binary frame
   carries the server's role, cluster/node identity, and zone (if
   advertised). Apply your `target=` / `zone=` filter before sending a
   `QUERY_REQUEST`; if the role doesn't match, close and try the next
   endpoint.
4. **Send `QUERY_REQUEST`.** Assign a fresh `request_id` (client-owned,
   unique within the connection), include SQL text, bind parameters, and
   `initial_credit` (`0` for unbounded streaming).
5. **Drain frames demuxed by `request_id`.** The server streams
   `RESULT_BATCH(seq=0, schema mode 0x00)`, then
   `RESULT_BATCH(seq=1+, schema mode 0x01)`, until a terminator:
   - `RESULT_END` — cursor exhausted, success.
   - `EXEC_DONE` — non-SELECT statement, no rows; carries `rows_affected`.
   - `QUERY_ERROR` — failure at any point in the lifecycle; terminal.
   The server may interpose a `CACHE_RESET` between a terminator and the
   next query's first frame; clients must process it before assuming
   schema-ID or symbol-dict continuity.
6. **Flow control.** If you set a non-zero `initial_credit`, send
   `CREDIT(request_id, additional_bytes)` frames to keep the byte window
   open. The server pauses production when the budget reaches zero (with
   a one-batch row floor to guarantee progress).
7. **Cancel (optional).** Send `CANCEL(request_id)` to abort. Continue
   draining in-flight `RESULT_BATCH` frames until the terminator
   (`QUERY_ERROR(CANCELLED)` or, if it raced, `RESULT_END`).
8. **Close.** Send a WebSocket `Close` frame after the last expected
   terminator has been drained.

Reconnects reset connection-scoped state on both sides: schema registry,
symbol dictionary, and `batch_seq` (which restarts at `0` for any replayed
query on the new connection).

## Message structure

The egress header is byte-identical to the
[ingress header](/docs/protocols/qwp-ingress-websocket/#message-structure)
(12 bytes, little-endian):

<QwpMessageHeader />

The **first byte of the payload** is the message kind. The remaining payload
depends on the kind.

```text
+------------------------------------------+
| Header (12 bytes)                        |
+------------------------------------------+
| Payload                                  |
|   msg_kind: uint8                        |
|   (kind-specific body)                   |
+------------------------------------------+
```

Placing `msg_kind` in the payload (rather than the header) keeps the header
codec shared with ingress. Endpoint disambiguation is sufficient because
connections are direction-pure.

### Flags byte

For `RESULT_BATCH` frames, the flags byte uses the ingress bit definitions
plus one egress-specific bit:

| Bit    | Name                     | Description                                                           |
|--------|--------------------------|-----------------------------------------------------------------------|
| `0x04` | `FLAG_GORILLA`           | Gorilla delta-of-delta encoding on timestamp columns.                 |
| `0x08` | `FLAG_DELTA_SYMBOL_DICT` | Connection-scoped delta symbol dictionary section present.            |
| `0x10` | `FLAG_ZSTD`              | Payload after msg_kind/request_id/batch_seq is zstd-compressed.       |

`FLAG_GORILLA` and `FLAG_DELTA_SYMBOL_DICT` are always set on `RESULT_BATCH`
frames in the current implementation. When `FLAG_GORILLA` is set, every
TIMESTAMP, TIMESTAMP_NANOS, and DATE column carries a 1-byte encoding flag
before its value region: `0x00` = raw int64 values, `0x01` = Gorilla
bitstream. The server picks Gorilla when the column has at least three
non-null values and the delta-of-delta bitstream is smaller than
`nonNullCount * 8` bytes; unordered or jumpy columns fall back to raw.

## Message kinds

| Code   | Name          | Direction | Description                             |
|--------|---------------|-----------|-----------------------------------------|
| `0x10` | QUERY_REQUEST | C -> S    | SQL query plus bind parameters          |
| `0x11` | RESULT_BATCH  | S -> C    | One table block of result rows          |
| `0x12` | RESULT_END    | S -> C    | Cursor exhausted (success)              |
| `0x13` | QUERY_ERROR   | S -> C    | Mid-stream or parse-time error          |
| `0x14` | CANCEL        | C -> S    | Stop a running query                    |
| `0x15` | CREDIT        | C -> S    | Extend the byte-credit window           |
| `0x16` | EXEC_DONE     | S -> C    | Non-SELECT statement acknowledgement    |
| `0x17` | CACHE_RESET   | S -> C    | Clear connection-scoped caches          |
| `0x18` | SERVER_INFO   | S -> C    | Server role and identity (v2 only)      |

Codes `0x00` and `0x01` are the ingress DATA_BATCH and RESPONSE kinds
(not used on the egress endpoint). Codes `0x19` through `0x1F` are reserved
for future egress kinds. `0x20+` is reserved for protocol extensions.

## QUERY_REQUEST (0x10)

Client to server. Initiates a new query cursor.

```text
+----------------------------------------------------------+
| msg_kind:        uint8       0x10                        |
| request_id:      int64       Client-assigned, unique     |
|                              within the connection       |
| sql_length:      varint      UTF-8 byte length           |
| sql_bytes:       bytes       SQL text                    |
| initial_credit:  varint      Bytes; 0 = unbounded        |
| bind_count:      varint      Number of bind parameters   |
| For each bind parameter (in declaration order):          |
|   type_code:     uint8       Column type code            |
|   bind_block:    column_data Ingress column encoding     |
|                              with row_count = 1          |
+----------------------------------------------------------+
```

### request_id

64-bit client-assigned identifier. It is echoed back by every server-to-client
frame related to the query (`RESULT_BATCH`, `RESULT_END`, `QUERY_ERROR`). The
client may reuse a `request_id` only after observing the terminator for the
previous use.

### Bind parameters

A bind parameter is encoded exactly as a one-row column under the
[ingress column data encoding](/docs/protocols/qwp-ingress-websocket/#column-data-encoding).
Each block begins with a `type_code` (uint8), followed by the standard
`null_flag` byte and either zero or one value.

A NULL bind parameter is: `type_code` + `null_flag = 0x01` + bitmap byte
`0x01`, with no value bytes following.

DECIMAL binds carry the 1-byte scale prefix. ARRAY binds carry the per-row
dimension header. Symbol bind parameters are encoded as VARCHAR (no dictionary
for a single value).

:::note Server leniency

The current server decoder accepts a SYMBOL wire type code for a bind
parameter and treats it identically to VARCHAR. Compliant clients should still
send VARCHAR. A future revision may reject SYMBOL bind type codes.

:::

### Concurrency

:::note Phase 1 limitation

The current implementation supports a single in-flight query per connection.
The server rejects a second `QUERY_REQUEST` before the active query terminates.
The wire protocol allows multiple in-flight queries (demultiplexed by
`request_id`); multi-query support is planned for a future release.

:::

## RESULT_BATCH (0x11)

Server to client. Carries one table block of result rows.

```text
+----------------------------------------------------------+
| msg_kind:        uint8       0x11                        |
| request_id:      int64       From the originating        |
|                              QUERY_REQUEST               |
| batch_seq:       varint      Monotonic per request,      |
|                              starting at 0               |
| (rest of payload: optional delta symbol dictionary,      |
|  then exactly one table block)                           |
+----------------------------------------------------------+
```

The header's `table_count` is `1`. The table block format is identical to
ingress: schema section followed by per-column data. The table name is empty
(`name_length = 0`); result sets have no table name.

**Schema handling:**

- First batch for a query: schema mode 0x00 (full) with a server-assigned
  schema_id.
- Subsequent batches with the same columns: schema mode 0x01 (reference).

If the result set is empty, the server still sends one `RESULT_BATCH` with
`row_count = 0` so the client receives the schema, followed by `RESULT_END`.

## RESULT_END (0x12)

Server to client. Signals successful end of stream.

```text
+----------------------------------------------------------+
| msg_kind:    uint8        0x12                           |
| request_id:  int64                                       |
| final_seq:   varint       Sequence of last RESULT_BATCH  |
|                           (or 0 if none)                 |
| total_rows:  varint       Total rows produced; 0 if not  |
|                           tracked by the server          |
+----------------------------------------------------------+
```

The header's `table_count` is `0`. After `RESULT_END`, the server has no
further state for this `request_id` and the client may reuse it.

## QUERY_ERROR (0x13)

Server to client. Signals failure at any point in the lifecycle: before any
`RESULT_BATCH` (parse or security failure) or mid-stream (storage failure,
cancellation, server shutdown).

```text
+----------------------------------------------------------+
| msg_kind:    uint8        0x13                           |
| request_id:  int64                                       |
| status:      uint8        See Status codes below         |
| msg_length:  uint16       UTF-8 byte length              |
| msg_bytes:   bytes        Human-readable error message   |
+----------------------------------------------------------+
```

The header's `table_count` is `0`. `QUERY_ERROR` is terminal: the client must
not expect any further frames for this `request_id`.

## CANCEL (0x14)

Client to server. Requests termination of a running query.

```text
+---------------------------+
| msg_kind:    uint8   0x14 |
| request_id:  int64        |
+---------------------------+
```

The server acknowledges by emitting either `RESULT_END` (if the cursor
finished first) or `QUERY_ERROR` with status `CANCELLED`. The client must
continue to drain any in-flight `RESULT_BATCH` frames the server sent before
processing the cancel; the terminator is the synchronization point.

If `request_id` does not refer to an active query, the server silently drops
the cancel.

## CREDIT (0x15)

Client to server. Extends the byte-credit window for a specific query.

```text
+----------------------------------------------+
| msg_kind:        uint8     0x15              |
| request_id:      int64                       |
| additional_bytes: varint   Bytes to add      |
+----------------------------------------------+
```

See [Flow control](#flow-control) for the credit model.

## EXEC_DONE (0x16)

Server to client. Terminates a non-SELECT `QUERY_REQUEST` (DDL, INSERT,
UPDATE, ALTER, DROP, TRUNCATE, CREATE TABLE, CREATE MATERIALIZED VIEW). No
`RESULT_BATCH` frames are sent for these statements.

```text
+----------------------------------------------------------+
| msg_kind:      uint8    0x16                             |
| request_id:    int64                                     |
| op_type:       uint8    Statement type discriminator     |
| rows_affected: varint   Row count for INSERT/UPDATE;     |
|                         0 for DDL                        |
+----------------------------------------------------------+
```

The header's `table_count` is `0`. `EXEC_DONE` is terminal: the client must
not expect any further frames for this `request_id`. If the statement fails,
the server sends `QUERY_ERROR` instead.

## CACHE_RESET (0x17)

Server to client. Instructs the client to clear one or both connection-scoped
caches: the symbol delta dictionary and the schema registry. Emitted at a
query boundary (between the previous query's terminator and the next query's
first `RESULT_BATCH` or `EXEC_DONE`); never mid-stream.

```text
+----------------------------------------------+
| msg_kind:    uint8    0x17                   |
| reset_mask:  uint8    Bit 0 = symbol dict    |
|                       Bit 1 = schema cache   |
|                       Bits 2-7 reserved (0)  |
+----------------------------------------------+
```

The header's `table_count` is `0`. No `request_id`: the frame targets
connection state, not a specific query.

**Semantics by bit:**

- **Bit 0 (RESET_MASK_DICT)**: clear the connection-scoped symbol dictionary.
  After the reset, the dictionary is empty. The next `RESULT_BATCH` with
  `FLAG_DELTA_SYMBOL_DICT` must start its delta section at `deltaStart = 0`.
- **Bit 1 (RESET_MASK_SCHEMAS)**: clear the connection-scoped schema
  registry. All previously assigned schema IDs are discarded. The next
  `RESULT_BATCH` must use full schema mode (0x00) with freshly allocated IDs.

Both bits may be set in the same frame. Clients must ignore unknown reserved
bits.

**Default soft caps:**

| Cap                              | Default   | Triggers          |
|----------------------------------|-----------|--------------------|
| Symbol dict entries              | 100,000   | `RESET_MASK_DICT`  |
| Symbol dict UTF-8 heap bytes     | 8 MiB     | `RESET_MASK_DICT`  |
| Distinct registered schemas      | 4,096     | `RESET_MASK_SCHEMAS` |

Actual cap values are implementation-defined. Clients must accept any cap
policy and must be prepared to receive `CACHE_RESET` after any query
terminator.

**Why never mid-stream:** resetting the dictionary or schema registry while a
`RESULT_BATCH` is in flight would invalidate IDs already referenced in that
batch's payload. The server postpones the reset until a natural query
boundary. Under a saturating workload, the server may temporarily exceed its
soft caps for the duration of a single query; the caps are self-healing and
bounded by any one query's distinct symbol/schema footprint.

**Wire-level example:**

```text
client -> QUERY_REQUEST(request_id=42, ...)
server -> CACHE_RESET(reset_mask=0x01)       # dict bit only
server -> RESULT_BATCH(request_id=42, batch_seq=0, deltaStart=0, ...)
server -> RESULT_BATCH(request_id=42, batch_seq=1, ...)
server -> RESULT_END(request_id=42, ...)
```

If the schema cache is also over cap, the server emits a single
`CACHE_RESET(reset_mask=0x03)` and the client clears both caches in one hop.

## SERVER_INFO (0x18)

Server to client. Unsolicited frame delivered as the first WebSocket frame
after the HTTP upgrade, only when the negotiated version is 2 or above. A v1
client never sees it.

```text
+----------------------------------------------------------+
| msg_kind:        uint8    0x18                           |
| role:            uint8    See role table                 |
| epoch:           uint64   Monotonic role epoch           |
| capabilities:    uint32   Bitfield                       |
| server_wall_ns:  int64    Server wall-clock (ns since    |
|                           Unix epoch)                    |
| cluster_id_len:  uint16   UTF-8 byte length              |
| cluster_id:      bytes    Cluster identifier             |
| node_id_len:     uint16   UTF-8 byte length              |
| node_id:         bytes    Node identifier                |
| (if capabilities & 0x01):                                |
|   zone_id_len:   uint16   UTF-8 byte length              |
|   zone_id:       bytes    Geographic/logical zone        |
+----------------------------------------------------------+
```

**Role values:**

| Value  | Role             | Description                                              |
|--------|------------------|----------------------------------------------------------|
| `0x00` | STANDALONE       | No replication configured. Behaves like a primary.       |
| `0x01` | PRIMARY          | Authoritative write node; reads see latest commits.      |
| `0x02` | REPLICA          | Read-only replica; reads may lag the primary.            |
| `0x03` | PRIMARY_CATCHUP  | Promotion in flight; behaves like a primary.             |

**Capabilities:**

| Bit          | Name     | Description                                              |
|--------------|----------|----------------------------------------------------------|
| `0x00000001` | CAP_ZONE | `zone_id` fields are appended after `node_id`.           |

Clients encountering unknown capability bits must ignore them. Trailing fields
gated by unset bits are absent from the frame.

**epoch:** monotonic across role transitions on the same node (e.g., replica
promoted to primary). Clients tracking a specific primary can use it to refuse
a stale reconnect that lands on a node which no longer holds the primary role
at the current cluster epoch. The field is 0 on releases where fencing has not
been wired up yet; clients may treat it as a hint.

**Delivery timing:** `SERVER_INFO` is included in the same TCP send buffer as
the 101 upgrade response, so on a healthy connection the frame is already in
the client's kernel recv buffer by the time the client parses the upgrade. If
the server negotiates v1, it omits the frame entirely and clients fall back to
treating the server as `STANDALONE`.

### Client routing

Egress clients that support v2 can accept multiple endpoints plus role and
zone preferences on the connect string:

```text
ws::addr=db-a:9000,db-b:9000,db-c:9000;target=any;zone=eu-west-1a;failover=on;
```

| Key        | Values                    | Default | Description                                   |
|------------|---------------------------|---------|-----------------------------------------------|
| `target`   | `any`, `primary`, `replica` | `any`   | Role filter applied per endpoint after reading `SERVER_INFO`. |
| `zone`     | free-form string          |         | Compared case-insensitively against `zone_id` from `SERVER_INFO`. |
| `failover` | `on`, `off`               | `on`    | Master switch for per-query reconnect loop. `off` surfaces transport errors directly. |

When `target=primary`, zone preference is still recorded but every host's zone
tier is treated as equivalent (the primary must be followed across zones).

The `421 + X-QuestDB-Role` (and optional `X-QuestDB-Zone`) upgrade-reject
convention is shared with ingress: the server returns HTTP 421 when the
connecting client's role filter does not match, allowing the client to try the
next endpoint without completing the WebSocket handshake.

## Null sentinel conventions

Egress inherits QuestDB's internal null sentinel conventions. When the server
writes a null value into the dense values array, it uses the type's sentinel
and also sets the corresponding null bitmap bit. Clients consuming egress
results should treat these sentinels as indistinguishable from explicit NULL:

| Type                                         | Null sentinel       |
|----------------------------------------------|---------------------|
| INT, IPv4                                    | `Integer.MIN_VALUE` (INT); `0` (IPv4) |
| LONG, DATE, TIMESTAMP, TIMESTAMP_NANOS, DECIMAL64 | `Long.MIN_VALUE`    |
| FLOAT                                        | any `NaN` (incl. `0.0f / 0.0f`) |
| DOUBLE                                       | any `NaN` (incl. `0.0 / 0.0`) |
| GEOHASH (all widths)                         | All-ones (`-1`)     |
| UUID                                         | Both halves `Long.MIN_VALUE` |
| LONG256                                      | All four longs `Long.MIN_VALUE` |
| BOOLEAN, BYTE, SHORT, CHAR                   | No null sentinel; these types cannot carry NULL in QuestDB |

A consequence of reusing in-engine sentinels on the wire is that some bit
patterns cannot be expressed as non-null:

- **IPv4 `0.0.0.0`** is the IPv4 null sentinel; a non-null `0.0.0.0` cannot be
  round-tripped and decodes as NULL.
- **GEOHASH "all ones"** is the geohash null sentinel; a geohash whose bit
  pattern is all-ones cannot be round-tripped and decodes as NULL.
- **FLOAT / DOUBLE `NaN`** of any bit pattern (including non-canonical NaNs
  like `0.0 / 0.0`) decodes as NULL. There is no separate "QWP NaN".

### Array element nulls

Array columns (`DOUBLE_ARRAY`, `LONG_ARRAY`) have no per-element null bitmap.
Element-level NULL uses the element type's row-level sentinel:

- `DOUBLE_ARRAY` element: `NaN` (a non-null `NaN` is indistinguishable from NULL)
- `LONG_ARRAY` element: `Long.MIN_VALUE` (cannot be represented as non-null)

The row-level null bitmap bit signals "the array itself is NULL", distinct
from "an array of zero or more elements where some may be element-NULL."

## Schema and symbol dictionary scope

### Schema registry

The server maintains a per-connection schema registry. The first
`RESULT_BATCH` for a query registers a new schema in full mode (0x00);
subsequent batches with the same column set use reference mode (0x01).

Connections that accumulate many distinct column shapes may cross the server's
schema soft cap. When that happens, the server emits `CACHE_RESET` with
`RESET_MASK_SCHEMAS` at a query boundary and both sides clear the registry.
Schema IDs after the reset may collide with previously used values.

On disconnect, both sides reset the registry.

### Symbol dictionary

Egress uses a connection-scoped delta dictionary (the same
`FLAG_DELTA_SYMBOL_DICT` mechanic as ingress). The server maintains a global
mapping of symbol strings to sequential integer IDs starting at 0, shared
across every query on the connection. Each `RESULT_BATCH` carries a delta
section listing newly added symbols.

Per-connection scope benefits repeated queries (e.g. BI dashboards refreshing
the same SELECTs). The server enforces soft caps on entry count and heap bytes.
When either cap is crossed, the server emits `CACHE_RESET` with
`RESET_MASK_DICT` and both sides clear the dictionary; the next delta section
starts at `deltaStart = 0`.

On disconnect, both sides reset the dictionary.

## Cursor lifecycle

```text
                     QUERY_REQUEST
 client  ---------------------------------> server
                                              |
                                        (parse, plan,
                                         open cursor)
                                              |
 client  <---------- RESULT_BATCH(seq=0) -----  schema mode 0x00
 client  <---------- RESULT_BATCH(seq=1) -----  schema mode 0x01
 client  <---------- RESULT_BATCH(seq=N) -----
                                              |
 client  <----------- RESULT_END --------------
```

**Error path:**

```text
 client  <---------- RESULT_BATCH(seq=K) -----
 client  <----------- QUERY_ERROR ------------- (terminal)
```

**Cancel path:**

```text
 client  ----------- CANCEL ------------------>
 client  <--- (any in-flight RESULT_BATCH) ----
 client  <----------- QUERY_ERROR ------------- status = CANCELLED
                                          (or RESULT_END if it raced)
```

**Non-SELECT path:**

```text
                     QUERY_REQUEST (DDL/INSERT/UPDATE)
 client  ---------------------------------> server
 client  <----------- EXEC_DONE ---------------
```

**Cache reset at query boundary:**

```text
 client  <----------- RESULT_END -------------- (query N)
 client  <----------- CACHE_RESET ------------- (optional)
                     QUERY_REQUEST
 client  ---------------------------------> server  (query N+1)
 client  <---------- RESULT_BATCH(seq=0) -----  deltaStart=0 after reset
```

A connection-level error (malformed header, authentication failure) closes the
WebSocket. The server's last frame before close should be a `QUERY_ERROR` with
`request_id = -1` if the failure is not attributable to a specific request.

## Failover and high availability

Egress clients can drive a per-query reconnect loop across multiple endpoints.
When a transport error occurs mid-stream, the client reconnects to the next
healthy endpoint, reads `SERVER_INFO` to verify the role filter, and replays
the query. `batch_seq` restarts at 0 on the new connection.

The connect-string keys that control egress failover
(`failover_max_attempts`, `failover_backoff_initial_ms`,
`failover_backoff_max_ms`, `failover_max_duration_ms`) are documented in the
[reconnect and failover](/docs/client-configuration/connect-string#reconnect-keys)
section of the connect string reference. The shared failover primitives
(host-health model, backoff, role filter, error classification) are covered in
[multi-host failover](/docs/client-configuration/connect-string#failover-keys).

Key behaviors:

- Authentication errors are terminal at any host; the reconnect loop does not
  continue past them.
- A `CANCEL` acknowledged with `QUERY_ERROR(CANCELLED)` routes through the
  normal error path, not the transport-error path, so it never triggers
  failover.
- An upgrade-time version mismatch is per-endpoint, not terminal. A host
  whose upgrade response advertises a QWP version outside the client's
  supported range is recorded as a transport error and the walk continues.

:::note Enterprise

Multi-host failover with automatic reconnect requires QuestDB Enterprise.

:::

## Flow control

:::note Byte credits

Egress uses byte-credit flow control to prevent the server from overwhelming
the client with result data. The client tells the server how many bytes it is
willing to receive, and the server pauses when the budget is exhausted.

:::

### Initial credit

The client sets `initial_credit` in `QUERY_REQUEST`. A value of `0` means
unbounded: the server streams without waiting for credit. A nonzero value is
the byte budget the server may emit before pausing.

### Granting more credit

The client sends `CREDIT` frames to extend the window. The server adds
`additional_bytes` to the remaining budget. There is no upper bound on a
single grant.

### Accounting

The server decrements the budget by the total wire length of each
`RESULT_BATCH` (header + payload). When the budget would go non-positive, the
server pauses production for that `request_id`.

### Row floor

To prevent deadlock on rows larger than the remaining window, the server may
send one additional `RESULT_BATCH` of at least one row even if doing so drives
the budget negative. The next batch will not be sent until credit returns to a
positive value.

This guarantees forward progress for any well-formed query regardless of
credit size. Clients should size buffers to absorb up to one extra batch.

### Independence per request

Each `request_id` has its own credit accounting. Granting credit on one
request does not unblock another.

## Status codes

`QUERY_ERROR` reuses the ingress status code namespace and adds two
egress-specific codes:

| Code | Hex    | Name            | Description                                       |
|------|--------|-----------------|---------------------------------------------------|
| 3    | `0x03` | SCHEMA_MISMATCH | Bind parameter type incompatible with placeholder |
| 5    | `0x05` | PARSE_ERROR     | Malformed message or SQL syntax error             |
| 6    | `0x06` | INTERNAL_ERROR  | Server-side execution failure                     |
| 8    | `0x08` | SECURITY_ERROR  | Authorization failure                             |
| 10   | `0x0A` | CANCELLED       | Query terminated in response to CANCEL            |
| 11   | `0x0B` | LIMIT_EXCEEDED  | A protocol limit was hit (see Protocol limits)    |

OK (0x00) is not used in egress; success terminates with `RESULT_END` or
`EXEC_DONE`.

## Protocol limits

| Limit                            | Default value | Notes                                              |
|----------------------------------|---------------|----------------------------------------------------|
| Max in-flight queries            | 1             | Per connection. Wire protocol allows more; Phase 1 enforces 1. |
| Max SQL text length              | 1 MiB         | UTF-8 bytes.                                       |
| Max bind parameters              | 1,024         | Per QUERY_REQUEST.                                 |
| Max RESULT_BATCH wire size       | 16 MiB        | Same as ingress batch ceiling.                     |
| Symbol dict soft cap (entries)   | 100,000       | Per connection. Exceeding triggers CACHE_RESET.    |
| Symbol dict soft cap (heap)      | 8 MiB         | Per connection, UTF-8 bytes.                       |
| Schema registry soft cap         | 4,096         | Per connection. Exceeding triggers CACHE_RESET.    |

Soft caps are implementation-defined and may be tuned by the server operator.

### Practical WebSocket frame cap

The 16 MiB `RESULT_BATCH` limit and 1 MiB SQL limit are **QWP protocol
ceilings**, not effective server-side caps. The HTTP receive buffer for the
`/read/v1` endpoint applies to **client → server** frames (`QUERY_REQUEST`,
`CANCEL`, `CREDIT`) and is checked before the QWP parser sees the payload:

| Server config key       | Default | Effect                                                                                     |
|-------------------------|---------|--------------------------------------------------------------------------------------------|
| `http.recv.buffer.size` | 2 MiB   | Maximum WebSocket frame the server will accept on `/read/v1`.                              |

A client-side frame larger than this is rejected with WebSocket close code
`1009 MESSAGE_TOO_BIG` and the connection is dropped — the client observes an
abrupt disconnect (`ECANCELED`, `EPIPE`, or similar) before any
`QUERY_ERROR` arrives.

**For client implementers:** a `QUERY_REQUEST` carries SQL text plus all bind
parameter values. Keep the total under `http.recv.buffer.size` minus
WebSocket frame overhead (≤ 14 bytes). With the default 2 MiB recv buffer,
~1.9 MiB of SQL + binds is a safe ceiling. Long SQL or large array binds are
the realistic triggers.

`RESULT_BATCH` frames (server → client) are bounded by the server's own
producer-side configuration; sizing the client's WebSocket library to handle
up to 16 MiB receive frames covers any well-configured server.

## Examples

### Simple unbounded query

Client sends `SELECT id, value FROM sensors LIMIT 2` with no bind parameters
and unbounded credit.

```text
QUERY_REQUEST:
  Header:
    51 57 50 31              # Magic: "QWP1"
    01                       # Version: 1
    00                       # Flags
    00 00                    # table_count = 0
    XX XX XX XX              # payload_length

  Payload:
    10                       # msg_kind = QUERY_REQUEST
    01 00 00 00 00 00 00 00  # request_id = 1
    24                       # sql_length = 36
    53 45 4C 45 43 54 20 69  # "SELECT i"
    64 2C 20 76 61 6C 75 65  # "d, value"
    20 46 52 4F 4D 20 73 65  # " FROM se"
    6E 73 6F 72 73 20 4C 49  # "nsors LI"
    4D 49 54 20 32           # "MIT 2"
    00                       # initial_credit = 0 (unbounded)
    00                       # bind_count = 0
```

Server responds with one result batch and end-of-stream:

```text
RESULT_BATCH (seq=0):
  Header:
    51 57 50 31              # Magic: "QWP1"
    01                       # Version: 1
    00                       # Flags
    01 00                    # table_count = 1
    XX XX XX XX              # payload_length

  Payload:
    11                       # msg_kind = RESULT_BATCH
    01 00 00 00 00 00 00 00  # request_id = 1
    00                       # batch_seq = 0

    Table block:
      00                     # name_length = 0 (anonymous)
      02                     # row_count = 2
      02                     # column_count = 2

      Schema (full mode):
        00                   # schema_mode = FULL
        00                   # schema_id = 0
        02 69 64  05         # "id" : LONG
        05 76 61 6C 75 65  07  # "value" : DOUBLE

      Column 0 (LONG):
        00                   # null_flag = 0
        01 00 00 00 00 00 00 00  # 1
        02 00 00 00 00 00 00 00  # 2

      Column 1 (DOUBLE):
        00                   # null_flag = 0
        CD CC CC CC CC CC F4 3F  # 1.3
        9A 99 99 99 99 99 01 40  # 2.2

RESULT_END:
  Header:
    51 57 50 31  01  00  00 00  XX XX XX XX

  Payload:
    12                       # msg_kind = RESULT_END
    01 00 00 00 00 00 00 00  # request_id = 1
    00                       # final_seq = 0
    02                       # total_rows = 2
```

### Bind parameter

A LONG bind parameter with value `42`:

```text
05                       # type_code = LONG
00                       # null_flag = 0 (no nulls)
2A 00 00 00 00 00 00 00  # value = 42
```

A NULL LONG bind parameter:

```text
05                       # type_code = LONG
01                       # null_flag = nonzero (bitmap follows)
01                       # bitmap byte: bit 0 set = NULL
                         # (no value bytes)
```

### Credit-controlled streaming

Client opens a query with a 64 KiB initial credit:

```text
QUERY_REQUEST: initial_credit = 65536, request_id = 7
```

Server emits `RESULT_BATCH` frames totaling 60 KiB, then pauses. Client
grants more credit:

```text
CREDIT:
  15                           # msg_kind = CREDIT
  07 00 00 00 00 00 00 00      # request_id = 7
  80 80 04                     # additional_bytes = 65536
```

Server resumes streaming.

## Reference implementation

The reference client implementation is
[`java-questdb-client`](https://github.com/questdb/java-questdb-client)
at commit
[`67bb5e4`](https://github.com/questdb/java-questdb-client/commit/67bb5e49feea7e63b813ea08189c23ea11486131).

The server-side egress handler lives in the QuestDB server repository.

## Version history

| Version    | Description                                                |
|------------|------------------------------------------------------------|
| 1 (`0x01`) | Initial egress release.                                    |
| 2 (`0x02`) | Adds unsolicited SERVER_INFO frame after upgrade (v2 only).|
