---
title: QWP ingress (WebSocket)
description:
  Wire-protocol specification for QuestDB's WebSocket-based columnar binary
  ingest protocol.
---

import QwpMessageHeader from "../partials/_qwp.message-header.partial.mdx"

:::info Audience

This is a **wire-protocol specification** for client implementers building a
new QuestDB ingest client from scratch. End users should see the
[language client guides](/docs/ingestion/overview) and the
[connect string reference](/docs/client-configuration/connect-string).

:::

QuestWire Protocol (QWP) is QuestDB's columnar binary protocol for
high-throughput data ingestion over WebSocket. Each message carries one or more
table blocks, where every column's values are stored contiguously. Batched
messages, schema references, and Gorilla-compressed timestamps reduce wire
overhead for sustained streaming workloads.

This page covers WebSocket ingress only. Related specifications:
[QWP ingress (UDP)](/docs/protocols/qwp-ingress-udp/) for fire-and-forget
datagram ingestion, and
[QWP egress (WebSocket)](/docs/protocols/qwp-egress-websocket/) for streaming
query results back to clients.

## Overview

QWP encodes data in a column-major layout: all values for a single column are
packed together before the next column begins. This allows the server to
decompress and commit each column independently, avoiding row-by-row
deserialization.

Design goals:

- **Column-oriented**: values for each column are contiguous in the message.
- **Batch-oriented**: a single message can carry rows for multiple tables.
- **Schema-referencing**: after the first batch, subsequent batches reference a
  previously sent schema by numeric ID, avoiding redundant column definitions.
- **Timestamp compression**: designated timestamp columns can use
  Gorilla delta-of-delta encoding, reducing 8 bytes per timestamp to as
  little as 1 bit for steady-rate streams.

Every QWP message begins with a 4-byte magic:

| Magic  | Hex value      | Description           |
|--------|----------------|-----------------------|
| `QWP1` | `0x31505751`   | Standard data message |

## Transport and versioning

### WebSocket endpoints

The client initiates an HTTP GET request to either `/write/v4` or `/api/v4/write`
with standard [WebSocket](https://datatracker.ietf.org/doc/html/rfc6455) upgrade
headers. After the server responds with `101 Switching Protocols`, all
communication uses binary WebSocket frames.

### Version negotiation

During the HTTP upgrade, the client and server negotiate the protocol version
using custom headers.

**Client request headers:**

| Header              | Required | Description                                                                          |
|---------------------|----------|--------------------------------------------------------------------------------------|
| `X-QWP-Max-Version` | No       | Maximum QWP version the client supports (positive integer). Defaults to 1 if absent. |
| `X-QWP-Client-Id`   | No       | Free-form client identifier (e.g., `java/1.0.2`, `zig/0.1.0`).                      |

**Server response header:**

| Header          | Description                                   |
|-----------------|-----------------------------------------------|
| `X-QWP-Version` | The QWP version selected for this connection. |

The server selects the version as `min(clientMax, serverMax)`. The selected
version is never higher than either side's maximum.

### Connection-level contract

All messages on a connection must carry the negotiated version in the version
byte (offset 4) of the message header. The server validates every incoming
message against the negotiated version and rejects mismatches with a parse
error.

### Current version

Ingress is pinned to version 1. No v2 ingest semantics exist. Ingress
clients advertise `X-QWP-Max-Version: 1`.

## Authentication

Authentication is handled at the HTTP level during the WebSocket upgrade
handshake, before any QWP binary frames are exchanged.

Supported methods:

- **HTTP basic auth** (OSS and Enterprise): see
  [Authentication in QuestDB Open Source](/docs/query/rest-api/#authentication-in-questdb-open-source).
- **Token-based auth** (Enterprise only): see
  [Authentication (RBAC)](/docs/query/rest-api/#authentication-rbac).
- **OIDC** (Enterprise only): see [OpenID Connect](/docs/security/oidc/).

A failed authentication results in a `401` or `403` HTTP response before the
WebSocket connection is established. No QWP-level auth handshake exists.

## Encoding primitives

### Byte ordering

All multi-byte numeric values are **little-endian**. Variable-length integers
use unsigned LEB128 (see below).

### Variable-length integer encoding (varint)

:::note LEB128

LEB128 (Little Endian Base 128) is a variable-length integer encoding from the
[DWARF debugging format](https://en.wikipedia.org/wiki/LEB128), also used by
Protocol Buffers and WebAssembly. It encodes small values in fewer bytes than
fixed-width integers.

:::

QWP uses **unsigned LEB128** for variable-length integers. Values are split into
7-bit groups, least significant first. The high bit of each byte is a
continuation flag: set (1) means more bytes follow, clear (0) means this is the
last byte. A 64-bit value requires at most 10 bytes.

**Encoding:**

```python
while (value & ~0x7F) != 0:
    output_byte((value & 0x7F) | 0x80)
    value >>= 7
output_byte(value)
```

**Decoding:**

```python
result = 0
shift = 0
while True:
    b = read_byte()
    result |= (b & 0x7F) << shift
    shift += 7
    if (b & 0x80) == 0:
        break
return result
```

**Examples:**

| Value | Encoded bytes      |
|-------|--------------------|
| 0     | `0x00`             |
| 1     | `0x01`             |
| 127   | `0x7F`             |
| 128   | `0x80 0x01`        |
| 255   | `0xFF 0x01`        |
| 300   | `0xAC 0x02`        |
| 16384 | `0x80 0x80 0x01`   |

### ZigZag encoding

:::note ZigZag encoding

ZigZag encoding maps signed integers to unsigned integers so that values with
small absolute values produce small varints. It was popularized by
[Protocol Buffers](https://protobuf.dev/programming-guides/encoding/#signed-ints).

:::

```python
def zigzag_encode(n):
    return (n << 1) ^ (n >> 63)

def zigzag_decode(n):
    return (n >> 1) ^ -(n & 1)
```

| Signed | Unsigned |
|--------|----------|
|  0     | 0        |
| -1     | 1        |
|  1     | 2        |
| -2     | 3        |
|  2     | 4        |

## Message structure

### Message header (12 bytes, fixed)

<QwpMessageHeader />

### Flags byte

| Bit | Mask   | Name                       | Description                                           |
|-----|--------|----------------------------|-------------------------------------------------------|
| 0-1 |        | Reserved                   | Must be 0                                             |
| 2   | `0x04` | `FLAG_GORILLA`             | Gorilla delta-of-delta encoding for timestamp columns |
| 3   | `0x08` | `FLAG_DELTA_SYMBOL_DICT`   | Delta symbol dictionary mode enabled                  |
| 4-7 |        | Reserved                   | Must be 0                                             |

### Complete message layout

```text
+---------------------------------------------+
| Message Header (12 bytes)                   |
+---------------------------------------------+
| Payload (variable)                          |
|   +- [Delta Symbol Dictionary] (if 0x08)    |
|   +- Table Block 0                          |
|   +- Table Block 1                          |
|   +- ... Table Block N-1                    |
+---------------------------------------------+
```

### Delta symbol dictionary

Present only when `FLAG_DELTA_SYMBOL_DICT` (0x08) is set. Appears at the start
of the payload, before any table blocks.

```text
+------------------------------------------------------------+
| delta_start:    varint   Starting global ID for this delta |
| delta_count:    varint   Number of new entries             |
| For each new entry:                                        |
|   name_length:  varint   UTF-8 byte length                 |
|   name_bytes:   bytes    UTF-8 encoded symbol string       |
+------------------------------------------------------------+
```

The client maintains a global symbol dictionary mapping symbol strings to
sequential integer IDs starting from 0. On each batch, only newly added
symbols (the "delta") are transmitted. The server accumulates these entries
across batches for the lifetime of the connection.

WebSocket clients set `FLAG_DELTA_SYMBOL_DICT` on every message and use global
delta dictionaries exclusively. Symbol columns then contain varint-encoded
global IDs instead of per-column dictionaries.

On connection loss, both sides reset the dictionary.

## Table blocks

Each table block contains data for a single table.

```text
+----------------------------------+
| Table Header (variable)          |
+----------------------------------+
| Schema Section (variable)        |
+----------------------------------+
| Column Data (variable)           |
|   +- Column 0 data               |
|   +- Column 1 data               |
|   +- ... Column N-1 data         |
+----------------------------------+
```

### Table header

| Field        | Type   | Description                        |
|--------------|--------|------------------------------------|
| name_length  | varint | Table name length in bytes         |
| name         | UTF-8  | Table name (max 127 bytes)         |
| row_count    | varint | Number of rows in this block       |
| column_count | varint | Number of columns                  |

## Schema definition

The schema section immediately follows the table header and defines the columns
in the block.

### Schema mode byte

| Value  | Mode      | Description                                    |
|--------|-----------|------------------------------------------------|
| `0x00` | Full      | Schema ID + complete column definitions inline |
| `0x01` | Reference | Schema ID only (lookup from registry)          |

### Full schema mode (0x00)

Sent the first time a table's schema appears on a connection, or whenever the
column set changes.

```text
+----------------------------------+
| mode_byte: 0x00                  |
+----------------------------------+
| schema_id: varint                |
+----------------------------------+
| Column Definition 0              |
|   +- name_length: varint         |
|   +- name: UTF-8 bytes           |
|   +- type_code: uint8            |
+----------------------------------+
| Column Definition 1 ...          |
+----------------------------------+
```

Schema IDs are non-negative integers assigned by the client and scoped to the
lifetime of a single connection. They are global across all tables on the
connection (not per-table). Clients typically assign them sequentially starting
at 0, but the server does not require any particular ordering.

A column with an **empty name** (length 0) and type TIMESTAMP denotes the
[designated timestamp](/docs/concepts/designated-timestamp/) column, the
per-table column that QuestDB uses for time-based partitioning and ordering.

### Reference schema mode (0x01)

Used for subsequent batches when the server has already registered the schema.

```text
+-------------------------+
| mode_byte: 0x01         |
+-------------------------+
| schema_id: varint       |
+-------------------------+
```

The server looks up the schema by its ID in the per-connection schema registry.

### Schema registry lifecycle

1. First batch for a table: full schema mode with a new schema ID.
2. Subsequent batches with the same columns: reference mode with the same ID.
3. When a table gains a column, the client assigns a new schema ID and sends
   it in full mode.
4. Full-mode schemas may re-register an existing ID; the server accepts any ID
   within the per-connection schema-ID limit.
5. On reconnect, both sides reset: the client reassigns IDs from 0 and the
   server clears its registry.

## Column types

| Code | Hex    | Type            | Size    | Description                        |
|------|--------|-----------------|---------|------------------------------------|
| 1    | `0x01` | BOOLEAN         | 1 bit   | Bit-packed boolean                 |
| 2    | `0x02` | BYTE            | 1       | Signed 8-bit integer               |
| 3    | `0x03` | SHORT           | 2       | Signed 16-bit integer              |
| 4    | `0x04` | INT             | 4       | Signed 32-bit integer              |
| 5    | `0x05` | LONG            | 8       | Signed 64-bit integer              |
| 6    | `0x06` | FLOAT           | 4       | IEEE 754 single precision          |
| 7    | `0x07` | DOUBLE          | 8       | IEEE 754 double precision          |
| 9    | `0x09` | SYMBOL          | var     | Dictionary-encoded string          |
| 10   | `0x0A` | TIMESTAMP       | 8       | Microseconds since Unix epoch      |
| 11   | `0x0B` | DATE            | 8       | Milliseconds since Unix epoch      |
| 12   | `0x0C` | UUID            | 16      | RFC 4122 UUID                      |
| 13   | `0x0D` | LONG256         | 32      | 256-bit integer                    |
| 14   | `0x0E` | GEOHASH         | var     | Geospatial hash                    |
| 15   | `0x0F` | VARCHAR         | var     | Length-prefixed UTF-8              |
| 16   | `0x10` | TIMESTAMP_NANOS | 8       | Nanoseconds since Unix epoch       |
| 17   | `0x11` | DOUBLE_ARRAY    | var     | N-dimensional double array         |
| 18   | `0x12` | LONG_ARRAY      | var     | N-dimensional long array           |
| 19   | `0x13` | DECIMAL64       | 8       | Decimal (18 digits precision)      |
| 20   | `0x14` | DECIMAL128      | 16      | Decimal (38 digits precision)      |
| 21   | `0x15` | DECIMAL256      | 32      | Decimal (77 digits precision)      |
| 22   | `0x16` | CHAR            | 2       | Single UTF-16 code unit            |
| 23   | `0x17` | BINARY          | var     | Length-prefixed opaque bytes       |
| 24   | `0x18` | IPv4            | 4       | 32-bit IPv4 address                |

Code `0x08` is unassigned. It was previously STRING, which has been removed.
Use VARCHAR (`0x0F`) for text columns.

TIMESTAMP and TIMESTAMP_NANOS may use Gorilla encoding when `FLAG_GORILLA` is
set. See [Timestamp encoding](#timestamp-encoding) below.

## Null handling

Each column's data section begins with a 1-byte **null flag**. The flag tells
the decoder how nulls are represented in the data that follows.

### Sentinel mode (null flag = 0x00)

No bitmap follows. The column data contains one value per row (`row_count`
values total). Null rows are represented by a reserved marker value (a
"sentinel") that falls outside the column's valid range. For example, `0x00`
for BYTE or `0x0000` for SHORT. The decoder recognizes these values as null
rather than as real data.

Sentinel mode requires the type to have a dedicated null representation. Types
whose full value range is meaningful payload (e.g., VARCHAR, SYMBOL) cannot use
sentinel mode.

### Bitmap mode (null flag != 0x00)

A null bitmap follows immediately after the flag byte. The column data then
contains only non-null values, densely packed
(`value_count = row_count - null_count`).

**Bitmap format:**

- **Size**: `ceil(row_count / 8)` bytes
- **Bit order**: LSB first within each byte
- **Semantics**: bit = 1 means the row is NULL, bit = 0 means the row has a value

```text
Byte 0:  [row7][row6][row5][row4][row3][row2][row1][row0]
Byte 1:  [row15][row14][row13][row12][row11][row10][row9][row8]
...
```

**Accessing null status:**

```python
byte_index = row_index // 8
bit_index  = row_index % 8
is_null    = (bitmap[byte_index] & (1 << bit_index)) != 0
```

**Example:** 10 rows where rows 0, 2, and 9 are null:

```text
Byte 0: 0b00000101 = 0x05  (bits 0 and 2 set)
Byte 1: 0b00000010 = 0x02  (bit 1 set = row 9)
```

### Complete column data layout

```text
+------------------------------------------------------------+
| null_flag:     uint8     0 = sentinel, nonzero = bitmap    |
| [null bitmap:  ceil(row_count/8) bytes if flag != 0]       |
| Column values:                                             |
|   flag == 0 : row_count entries (null rows use sentinels)  |
|   flag != 0 : value_count non-null entries, densely packed |
|               (value_count = row_count - null_count)       |
+------------------------------------------------------------+
```

The encoder chooses the strategy per column. The decoder must support both.

### Sentinel values

When the reference implementation emits sentinel mode (null flag = 0x00), null
rows are encoded as:

| Type    | Sentinel                                                                          |
|---------|-----------------------------------------------------------------------------------|
| BOOLEAN | bit `0` (false)                                                                   |
| BYTE    | `0x00`                                                                            |
| SHORT   | `0x0000`                                                                          |
| CHAR    | `0x0000`                                                                          |
| GEOHASH | All-ones (`0xFF...FF`), truncated to `ceil(precision_bits / 8)` bytes             |

### Reference implementation null strategy

The reference Java client uses these strategies per type:

| Strategy | Types                                                                                                                                     |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------|
| Sentinel | BOOLEAN, BYTE, SHORT, CHAR, GEOHASH                                                                                                      |
| Bitmap   | INT, LONG, FLOAT, DOUBLE, VARCHAR, SYMBOL, TIMESTAMP, TIMESTAMP_NANOS, DATE, UUID, LONG256, DECIMAL64, DECIMAL128, DECIMAL256, DOUBLE_ARRAY, LONG_ARRAY |

Alternative implementations may make different per-column choices as long as
the null flag accurately describes the data that follows. A column with no null
rows produces identical output under either strategy (null flag = 0x00,
`row_count` values).

## Column data encoding

### Fixed-width types

For BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, DATE, CHAR, and IPv4: values are
written as contiguous arrays of their respective sizes in little-endian byte
order.

```text
+------------------------------------------------------+
| [Null flag + bitmap (see Null handling)]             |
+------------------------------------------------------+
| Values:                                              |
|   value[0], value[1], ... value[N-1]                 |
|   N = row_count              if null_flag == 0       |
|   N = row_count - null_count if null_flag != 0       |
+------------------------------------------------------+
```

### Boolean

Values are bit-packed, 8 per byte, LSB-first. `ceil(N/8)` bytes are written
where `N = row_count` in sentinel mode or `N = row_count - null_count` in
bitmap mode. The reference implementation uses sentinel mode for BOOLEAN: null
rows appear as bit `0` (false).

```text
Values [true, false, true, true, false, false, false, true]:
  0b10001101 = 0x8D
```

### VARCHAR and BINARY

VARCHAR, and BINARY share the same wire format:

```text
+------------------------------------------------+
| [Null flag + bitmap (see Null handling)]       |
+------------------------------------------------+
| Offset array: (value_count + 1) x uint32       |
|   offset[0] = 0                                |
|   offset[i+1] = end of value[i]                |
+------------------------------------------------+
| Data: concatenated bytes                       |
+------------------------------------------------+
```

- `value_count = row_count - null_count`
- Offsets are uint32, little-endian
- Value `i` spans bytes `[offset[i], offset[i+1])`
- For VARCHAR, the bytes are valid UTF-8. For BINARY, the bytes are opaque.
- The uint32 offsets bound individual values to 2^31 - 1 bytes.

### Symbol

Dictionary-encoded strings for low-cardinality columns. The wire format depends
on the dictionary mode.

#### Per-table dictionary mode

Used by UDP because datagrams cannot rely on a connection-scoped dictionary
persisting across messages.

```text
+----------------------------------------------+
| [Null flag + bitmap (see Null handling)]     |
+----------------------------------------------+
| dictionary_size: varint                      |
+----------------------------------------------+
| Dictionary entries:                          |
|   For each entry:                            |
|     entry_length: varint                     |
|     entry_data: UTF-8 bytes                  |
+----------------------------------------------+
| Value indices:                               |
|   For each non-null row:                     |
|     dict_index: varint                       |
+----------------------------------------------+
```

Dictionary indices are 0-based. When a null bitmap is present, only non-null
rows have indices written.

#### Global delta dictionary mode (WebSocket)

When `FLAG_DELTA_SYMBOL_DICT` (0x08) is set, symbol columns use global integer
IDs instead of per-table dictionaries. The dictionary entries are sent in the
message-level [delta symbol dictionary](#delta-symbol-dictionary) section.
Column data consists of varint-encoded global IDs only:

```text
+--------------------------------------------+
| For each non-null row:                     |
|   global_id:   varint   Global symbol ID   |
+--------------------------------------------+
```

WebSocket clients set `FLAG_DELTA_SYMBOL_DICT` on every message and use this
mode exclusively.

### Timestamp encoding

:::note Gorilla compression

Gorilla is a time-series compression scheme from the
[Facebook/Meta Gorilla paper](https://www.vldb.org/pvldb/vol8/p1816-teller.pdf)
(Pelkonen et al., VLDB 2015). It exploits the regularity of timestamps in
time-series data by encoding the delta-of-deltas between consecutive values,
which are often zero or very small.

:::

When `FLAG_GORILLA` (0x04) is **not** set, timestamp columns are written as
plain int64 arrays with no encoding flag:

```text
+----------------------------------------------+
| [Null flag + bitmap (see Null handling)]     |
+----------------------------------------------+
| Timestamp values (non-null only):            |
|   value_count x int64                        |
+----------------------------------------------+
```

When `FLAG_GORILLA` (0x04) **is** set, a 1-byte encoding flag follows the null
handling section:

| Flag   | Mode         | Description                                    |
|--------|--------------|------------------------------------------------|
| `0x00` | Uncompressed | Array of int64 values (non-null only)          |
| `0x01` | Gorilla      | Delta-of-delta compressed                      |

**Uncompressed mode (0x00):**

```text
+----------------------------------------------+
| [Null flag + bitmap (see Null handling)]     |
+----------------------------------------------+
| encoding_flag: uint8 (0x00)                  |
+----------------------------------------------+
| Timestamp values (non-null only):            |
|   value_count x int64                        |
+----------------------------------------------+
```

**Gorilla mode (0x01):**

```text
+----------------------------------------------+
| [Null flag + bitmap (see Null handling)]     |
+----------------------------------------------+
| encoding_flag: uint8 (0x01)                  |
+----------------------------------------------+
| first_timestamp: int64                       |
+----------------------------------------------+
| second_timestamp: int64                      |
+----------------------------------------------+
| Bit-packed delta-of-deltas:                  |
|   For timestamps 3..N                        |
+----------------------------------------------+
```

#### Gorilla delta-of-delta algorithm

```python
delta_i = t[i] - t[i - 1]
dod_i   = delta_i - delta_prev
```

Encoding buckets (bits are written LSB-first):

| Condition            | Prefix | Value bits  | Total bits |
|----------------------|--------|-------------|------------|
| DoD == 0             | `0`    | 0           | 1          |
| DoD in [-64, 63]     | `10`   | 7 (signed)  | 9          |
| DoD in [-256, 255]   | `110`  | 9 (signed)  | 12         |
| DoD in [-2048, 2047] | `1110` | 12 (signed) | 16         |
| Otherwise            | `1111` | 32 (signed) | 36         |

The bit stream is padded to a byte boundary at the end. If any DoD value
exceeds the 32-bit signed integer range, the encoder falls back to
uncompressed mode.

### UUID

16 bytes per value: 8 bytes for the low 64 bits, then 8 bytes for the high
64 bits, both little-endian.

### LONG256

32 bytes per value: four int64 values, least significant first, all
little-endian.

### GeoHash

```text
+------------------------------------------------------+
| [Null flag + bitmap (see Null handling)]             |
+------------------------------------------------------+
| precision_bits: varint (1-60)                        |
+------------------------------------------------------+
| Packed geohash values:                               |
|   bytes_per_value = ceil(precision_bits / 8)         |
|   total = bytes_per_value x N                        |
|   N = row_count              if null_flag == 0       |
|   N = row_count - null_count if null_flag != 0       |
+------------------------------------------------------+
```

The reference implementation uses sentinel mode for GEOHASH: null rows are
encoded as all-ones truncated to `bytes_per_value`.

### Array types (DOUBLE_ARRAY, LONG_ARRAY)

N-dimensional arrays, row-major order:

```text
+------------------------------------------------------+
| For each non-null row:                               |
|   n_dims:      uint8          Number of dimensions   |
|   dim_lengths: n_dims x int32 Length per dimension   |
|   values:      product(dims) x element               |
|                (float64 for DOUBLE_ARRAY,            |
|                 int64 for LONG_ARRAY)                |
+------------------------------------------------------+
```

### Decimal types (DECIMAL64, DECIMAL128, DECIMAL256)

Decimal values are stored as two's complement integers. A 1-byte scale prefix
is shared by all values in the column.

```text
+----------------------------------------------+
| [Null flag + bitmap (see Null handling)]     |
+----------------------------------------------+
| scale: uint8                                 |
+----------------------------------------------+
| Unscaled values:                             |
|   DECIMAL64:  8 bytes x value_count          |
|   DECIMAL128: 16 bytes x value_count         |
|   DECIMAL256: 32 bytes x value_count         |
+----------------------------------------------+
```

| Type        | Value size | Precision  |
|-------------|------------|------------|
| DECIMAL64   | 8 bytes    | 18 digits  |
| DECIMAL128  | 16 bytes   | 38 digits  |
| DECIMAL256  | 32 bytes   | 77 digits  |

## Server responses

Every response starts with a 1-byte status code. OK and error responses include
an 8-byte sequence number that correlates the response with the original
request.

### OK response

```text
+------------------------------------------------------+
| status:      uint8   (0x00)                          |
| sequence:    int64          Request sequence number  |
| tableCount:  uint16         Number of table entries  |
| Repeated tableCount times:                           |
|   nameLen:   uint16         Table name length        |
|   name:      bytes          UTF-8 table name         |
|   seqTxn:    int64          Sequencer txn for table  |
+------------------------------------------------------+
```

The per-table entries report the
[sequencer transaction](/docs/query/functions/meta/#wal_tables) assigned to each
table that committed data in the acknowledged batch. `tableCount` is 0 when no
[WAL](/docs/concepts/write-ahead-log/) (Write-Ahead Log) tables committed
(e.g., non-WAL tables or empty batches).

### Error response

```text
+-----------------------------------------------------+
| status:    uint8          Status code               |
| sequence:  int64          Request sequence number   |
| msg_len:   uint16         Error message length      |
| msg_bytes: bytes          UTF-8 error message       |
+-----------------------------------------------------+
```

### Status codes

| Code | Hex    | Name            | Description                                      |
|------|--------|-----------------|--------------------------------------------------|
| 0    | `0x00` | OK              | Batch accepted (written to WAL)                  |
| 2    | `0x02` | DURABLE_ACK     | Batch WAL uploaded to object store (Enterprise)  |
| 3    | `0x03` | SCHEMA_MISMATCH | Column type incompatible with existing table     |
| 5    | `0x05` | PARSE_ERROR     | Malformed message                                |
| 6    | `0x06` | INTERNAL_ERROR  | Server-side error                                |
| 8    | `0x08` | SECURITY_ERROR  | Authorization failure                            |
| 9    | `0x09` | WRITE_ERROR     | Write failure (e.g., table not accepting writes) |

### Durable acknowledgement

:::note Enterprise

Durable acknowledgement (status code 0x02) is available in QuestDB Enterprise
with primary replication configured. Open source QuestDB returns OK (0x00) or
error responses only.

:::

A standard OK confirms the batch was committed to the server's local WAL. To
receive a second acknowledgement after the WAL has been durably uploaded to the
configured object store, include `X-QWP-Request-Durable-Ack: true`
(case-insensitive) in the WebSocket upgrade request.

If the server accepts the opt-in, it echoes `X-QWP-Durable-Ack: enabled` in
the 101 response. Clients that opt in **must** verify this header is present
and fail the connect attempt if it is absent.

**Durable-ack response format:**

```text
+------------------------------------------------------+
| status:      uint8   (0x02)                          |
| tableCount:  uint16         Number of table entries  |
| Repeated tableCount times:                           |
|   nameLen:   uint16         Table name length        |
|   name:      bytes          UTF-8 table name         |
|   seqTxn:    int64          Durably-uploaded seqTxn  |
+------------------------------------------------------+
```

The durable-ack has no sequence field. It carries cumulative per-table
watermarks that advance as uploads complete. Only tables whose durable
watermark advanced since the last durable-ack are included.

Servers without replication silently ignore the request header and never emit
durable-ack frames. There is no durable-failure status; persistent upload
failures surface only as absence of a durable-ack frame.

## Protocol limits

| Limit                         | Default value |
|-------------------------------|---------------|
| Max batch size                | 16 MB         |
| Max tables per connection     | 10,000        |
| Max rows per table block      | 1,000,000     |
| Max columns per table         | 2,048         |
| Max table name length         | 127 bytes     |
| Max column name length        | 127 bytes     |
| Max in-flight batches         | 128           |
| Max symbol dictionary entries | 1,000,000     |

The header's `table_count` field is a uint16, so the protocol ceiling for
tables per message is 65,535 regardless of the configured limit. Individual
string values have no dedicated length limit; they are bounded only by the max
batch size.

The symbol dictionary limit applies per column in per-table dictionary mode and
per connection in global delta dictionary mode. Exceeding it causes the server
to reject the message with `PARSE_ERROR`.

## Client operation

This section describes the high-level batching and I/O behavior a client
implements. The full client-side substrate (on-disk store-and-forward, frame
sequence numbers, ACK-driven trim, reconnect/replay semantics) is specified in
the [connect string reference](/docs/client-configuration/connect-string).

### Double-buffered async I/O

The client uses double-buffered microbatches:

1. The user thread writes rows to the **active** buffer.
2. When a buffer reaches its threshold (row count, byte size, or age), the
   client seals it and enqueues it for sending.
3. A dedicated I/O thread sends batches over the WebSocket.
4. The client swaps to the other buffer so writing can continue without
   blocking.

### Auto-flush triggers

| Trigger              | Default    |
|----------------------|------------|
| Row count            | 1,000 rows |
| Byte size            | disabled   |
| Time since first row | 100 ms     |

### Failover and high availability

Ingress senders use a reconnect loop regardless of whether store-and-forward
is configured. The two storage modes share identical failover semantics; they
differ only in where unacknowledged data lives:

- **`sf_dir` set** (store-and-forward): segments are memory-mapped files under
  `sf_dir`. Unacknowledged data survives sender restarts and is replayed by
  the next sender bound to the same slot.
- **`sf_dir` unset** (memory mode): segments are allocated in process memory.
  Unacknowledged data is lost if the sender process dies. The reconnect loop
  still spans transient server outages such as rolling upgrades, but the RAM
  buffer caps how much data can accumulate during the outage.

Connect-string keys that control ingress failover are documented in the
[reconnect and failover](/docs/client-configuration/connect-string#reconnect-keys)
section of the connect string reference:

| Key                              | Default   | Description                               |
|----------------------------------|-----------|-------------------------------------------|
| `reconnect_max_duration_millis`  | `300000`  | Total outage budget before giving up.     |
| `reconnect_initial_backoff_millis` | `100`   | First post-failure sleep.                 |
| `reconnect_max_backoff_millis`   | `5000`    | Cap on per-attempt sleep.                 |
| `initial_connect_retry`          | `off`     | Retry on first connect (`on`, `sync`, `async`). |

Key behaviors:

- **Ingress is zone-blind.** It pins QWP v1 and never reads `SERVER_INFO`, so
  every host's zone tier is equivalent and selection is based on health state
  only. The `zone=` connect-string key is accepted but silently ignored, so a
  connect string shared with egress clients works unchanged on ingress.
- **Authentication errors are terminal** at any host (`401`/`403`). The
  reconnect loop does not continue past them.
- **`421 + X-QuestDB-Role`** is a role reject: transient if the role is
  `PRIMARY_CATCHUP`, topology-level otherwise.
- **All other upgrade errors are transient** and feed into the reconnect loop,
  including `404`, `426`, `503`, generic 4xx/5xx, TCP/TLS failures,
  mid-stream send/recv errors, and an upgrade response that advertises a QWP
  version outside the client's supported range (per-endpoint, so a host on a
  rolling upgrade does not lock the client out of compatible peers).

:::note Enterprise

Multi-host failover with automatic reconnect requires QuestDB Enterprise.

:::

## Examples

### Single table with three columns

Table `sensors`, 2 rows, 3 columns: `id` (LONG), `value` (DOUBLE), `ts`
(TIMESTAMP). No nulls, no Gorilla compression, no delta symbol dictionary.

```text
# Header (12 bytes)
51 57 50 31              # Magic: "QWP1"
01                       # Version: 1
00                       # Flags: none
01 00                    # Table count: 1
XX XX XX XX              # Payload length

# Table Block
07                       # Table name length: 7
73 65 6E 73 6F 72 73     # "sensors" UTF-8
02                       # Row count: 2
03                       # Column count: 3

# Schema (full mode)
00                       # Schema mode: full
00                       # Schema ID: 0

# Column 0: id (LONG)
02                       # Name length: 2
69 64                    # "id" UTF-8
05                       # Type: LONG

# Column 1: value (DOUBLE)
05                       # Name length: 5
76 61 6C 75 65           # "value" UTF-8
07                       # Type: DOUBLE

# Column 2: ts (TIMESTAMP, designated)
00                       # Name length: 0 (designated timestamp)
0A                       # Type: TIMESTAMP

# Column 0 data (LONG, 2 values)
00                       # null_flag: 0x00 (no bitmap)
01 00 00 00 00 00 00 00  # id = 1
02 00 00 00 00 00 00 00  # id = 2

# Column 1 data (DOUBLE, 2 values)
00                       # null_flag: 0x00 (no bitmap)
CD CC CC CC CC CC F4 3F  # value = 1.3
9A 99 99 99 99 99 01 40  # value = 2.2

# Column 2 data (TIMESTAMP, uncompressed, 2 values)
00                       # null_flag: 0x00 (no bitmap)
00 E4 0B 54 02 00 00 00  # ts = 10000000000 microseconds
80 1A 06 00 00 00 00 00  # ts = 400000 microseconds
```

### Nullable VARCHAR column

4 rows where row 1 is null:

```text
# Null flag + bitmap
01                       # null_flag: nonzero = bitmap follows
02                       # 0b00000010 (bit 1 set = row 1 is null)

# Offset array (3 non-null values = 4 offsets)
00 00 00 00              # offset[0] = 0  (start of "foo")
03 00 00 00              # offset[1] = 3  (end of "foo")
06 00 00 00              # offset[2] = 6  (end of "bar")
09 00 00 00              # offset[3] = 9  (end of "baz")

# String data (concatenated UTF-8)
66 6F 6F                 # "foo" (row 0)
62 61 72                 # "bar" (row 2)
62 61 7A                 # "baz" (row 3)
```

### Symbol column with per-table dictionary

3 rows with values: "us", "eu", "us":

```text
# Null flag
00                       # null_flag: 0x00 (no nulls)

# Dictionary
02                       # Dictionary size: 2 entries

02                       # Entry 0 length: 2
75 73                    # "us"

02                       # Entry 1 length: 2
65 75                    # "eu"

# Value indices
00                       # Row 0: index 0 ("us")
01                       # Row 1: index 1 ("eu")
00                       # Row 2: index 0 ("us")
```

### Gorilla timestamps with delta symbol dictionary

Table `sensors`, 2 rows, 3 columns: `host` (SYMBOL), `temp` (DOUBLE),
designated TIMESTAMP. Both `FLAG_GORILLA` and `FLAG_DELTA_SYMBOL_DICT` are set.

```text
# Header (12 bytes)
51 57 50 31              # Magic: "QWP1"
01                       # Version: 1
0C                       # Flags: 0x04 (Gorilla) | 0x08 (Delta Symbol Dict)
01 00                    # Table count: 1
XX XX XX XX              # Payload length

# Delta Symbol Dictionary
00                       # delta_start = 0
02                       # delta_count = 2
07 73 65 72 76 65 72 31  # "server1" (length = 7)
07 73 65 72 76 65 72 32  # "server2" (length = 7)

# Table Block
07 73 65 6E 73 6F 72 73  # Table name "sensors" (length = 7)
02                       # row_count = 2
03                       # column_count = 3

# Schema (full mode)
00                       # schema_mode = FULL
00                       # schema_id = 0
04 68 6F 73 74  09       # "host" : SYMBOL
04 74 65 6D 70  07       # "temp" : DOUBLE
00              0A       # "" : TIMESTAMP (designated)

# Column 0 (SYMBOL, global delta IDs)
00                       # null_flag: no nulls
00                       # Row 0: global ID 0
01                       # Row 1: global ID 1

# Column 1 (DOUBLE, 2 values)
00                       # null_flag: no nulls
66 66 66 66 66 E6 56 40  # 91.6
9A 99 99 99 99 19 57 40  # 92.4

# Column 2 (TIMESTAMP, Gorilla)
00                       # null_flag: no nulls
01                       # encoding = Gorilla
[8 bytes: first timestamp]
[8 bytes: second timestamp]
# (only 2 values, so no delta-of-delta bit stream follows)
```

## Reference implementation

The reference client implementation is
[`java-questdb-client`](https://github.com/questdb/java-questdb-client)
at commit
[`67bb5e4`](https://github.com/questdb/java-questdb-client/commit/67bb5e49feea7e63b813ea08189c23ea11486131).

The server-side protocol parser lives in the QuestDB server repository under
`core/src/main/java/io/questdb/cutlass/qwp/protocol/`.

## Version history

| Version    | Description                     |
|------------|---------------------------------|
| 1 (`0x01`) | Initial binary protocol release |
