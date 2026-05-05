---
title: Posting index and covering index
sidebar_label: Posting index
description:
  The posting index is a compact, high-performance index for symbol columns
  that supports covering queries. Learn how it works, when to use it, and
  how to optimize queries with INCLUDE columns.
---

The **posting index** is an advanced index type for
[symbol](/docs/concepts/symbol/) columns that provides better compression,
faster reads, and **covering index** support compared to the default bitmap
index.

A **covering index** stores additional column values alongside the index
entries, so queries that only need those columns can be answered entirely from
the index without reading the main column files.

## When to use the posting index

Use the posting index when:

- You frequently filter on a symbol column (`WHERE symbol = 'X'`)
- Your queries select a small set of columns alongside the symbol filter
- You want to reduce I/O by reading from compact sidecar files instead of
  full column files
- You need efficient `DISTINCT` queries on a symbol column
- You need efficient `LATEST ON` queries partitioned by a symbol column

The posting index is especially effective for high-cardinality symbol columns
(hundreds to thousands of distinct values) and wide tables where reading full
column files is expensive.

## Creating a posting index

### At table creation

Inline syntax (index defined alongside the column):

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING,
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

Out-of-line syntax (index defined separately):

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE
), INDEX(symbol TYPE POSTING)
TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

### With covering columns (INCLUDE)

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING INCLUDE (exchange, price),
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

The `INCLUDE` clause specifies which columns are stored in the index sidecar
files. Queries that only read these columns plus the indexed symbol column
can be served entirely from the index.

:::tip

The designated timestamp column is automatically included in the covering
index — even when no explicit `INCLUDE` clause is given. So a bare
`INDEX TYPE POSTING` already covers `SELECT timestamp, sym FROM t WHERE
sym = 'X'`. The expanded list is what `SHOW CREATE TABLE` round-trips, so
`INCLUDE (exchange, price)` renders back as
`INCLUDE (exchange, price, timestamp)` after creation. Controlled by the
`cairo.posting.index.auto.include.timestamp` server property
(default `true`).

:::

:::note

The `INCLUDE` clause is only supported with inline column syntax and
`ALTER TABLE`. The out-of-line `INDEX(col TYPE POSTING)` syntax does not
support `INCLUDE`.

Writing `INDEX INCLUDE (...)` (no explicit `TYPE`) is also accepted and
implicitly creates a posting index — `INCLUDE` is only valid with
`POSTING`, so the parser promotes the type for you.

:::

### On an existing table

```questdb-sql
ALTER TABLE trades
  ALTER COLUMN symbol ADD INDEX TYPE POSTING INCLUDE (exchange, price);
```

### Encoding options

The posting index supports three row ID encoding options with different
compression and query performance characteristics:

| Syntax | Encoding | Notes |
|--------|----------|-------|
| `INDEX TYPE POSTING` | Adaptive (default) | Trials delta + Frame-of-Reference and Elias-Fano per key per stride and keeps the smaller output |
| `INDEX TYPE POSTING EF` | Elias-Fano only | Forces Elias-Fano even when delta + FoR would be smaller — useful for benchmarking |
| `INDEX TYPE POSTING DELTA` | Delta + Frame-of-Reference only | Forces delta + FoR even when Elias-Fano would be smaller — useful for benchmarking |

**Delta + Frame-of-Reference encoding** stores each key's row IDs as
per-key deltas, split into blocks of 64 with per-block Frame-of-Reference
bitpacking. Round-robin or periodic distributions produce constant
deltas (bitwidth 0), so this mode compresses them to near-zero. The
trade-off is a per-key block-header overhead that hurts low-cardinality
keys.

**Elias-Fano (EF) encoding** is a classic monotonic-sequence encoding:
each key's sorted row IDs are split into low and high bit halves, with
the high half stored as a unary-coded bit array and the low half as a
fixed-width packed array. This typically produces denser output for
keys with few values per stride and avoids the block-header overhead.

The **adaptive (default)** encoding trial-encodes each key with both
delta + Frame-of-Reference and Elias-Fano per stride and picks whichever
produces the smaller output. This is the right choice for almost all
workloads — the explicit `DELTA` / `EF` variants exist mainly for
benchmarking.

```questdb-sql
-- Default adaptive encoding (recommended for most workloads)
CREATE TABLE t1 (ts TIMESTAMP, s SYMBOL INDEX TYPE POSTING)
    TIMESTAMP(ts) PARTITION BY DAY WAL;

-- Force Elias-Fano only (benchmarking)
CREATE TABLE t2 (ts TIMESTAMP, s SYMBOL INDEX TYPE POSTING EF)
    TIMESTAMP(ts) PARTITION BY DAY WAL;

-- Force delta + Frame-of-Reference only (benchmarking)
CREATE TABLE t3 (ts TIMESTAMP, s SYMBOL INDEX TYPE POSTING DELTA)
    TIMESTAMP(ts) PARTITION BY DAY WAL;
```

:::note

`CAPACITY` is only supported for bitmap indexes. Using `CAPACITY` with a
posting index will produce an error.

:::

## Covering index

The covering index is the most powerful feature of the posting index. When all
columns in a query's `SELECT` list are either:

- The indexed symbol column itself (from the `WHERE` clause)
- Listed in the `INCLUDE` clause

...the query engine reads data directly from the index sidecar files, bypassing
the main column files entirely. This is significantly faster for selective
queries on wide tables.

### Supported column types in INCLUDE

All column types except the indexed symbol column itself can be included:

| Type | Compression | Notes |
|------|-------------|-------|
| BOOLEAN, BYTE, GEOBYTE, DECIMAL8 | Frame-of-Reference bitpacking | ≤1 byte per value (worst case) |
| SHORT, CHAR, GEOSHORT, DECIMAL16 | Frame-of-Reference bitpacking | ≤2 bytes per value |
| INT, IPv4, GEOINT, DECIMAL32 | Frame-of-Reference bitpacking | ≤4 bytes per value |
| FLOAT | ALP (Adaptive Lossless floating-Point) | Lossless float compression |
| LONG, DATE, GEOLONG, DECIMAL64 | Frame-of-Reference bitpacking | ≤8 bytes per value |
| TIMESTAMP | Linear-prediction + Frame-of-Reference | Designed for monotonic timestamps |
| DOUBLE | ALP (Adaptive Lossless floating-Point) | Lossless float compression |
| SYMBOL | Frame-of-Reference bitpacking | Stored as integer key, resolved at query time |
| UUID, DECIMAL128 | Raw copy | 16 bytes per value |
| LONG256, DECIMAL256 | Raw copy | 32 bytes per value |
| VARCHAR, STRING | FSST compressed (≥4 KB strides) | Typically 2–5× compression on repetitive text |
| BINARY | Length-prefixed raw bytes | Variable-width, no compression |
| Arrays (DOUBLE[], INT[], etc.) | Length-prefixed raw bytes | Variable-width, no compression |

### How to choose INCLUDE columns

Include columns that you frequently select together with the indexed symbol:

```questdb-sql
-- If your typical queries look like this:
SELECT timestamp, price, quantity FROM trades WHERE symbol = 'AAPL';

-- Then include those columns (timestamp is auto-included as designated timestamp):
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING INCLUDE (price, quantity),
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE,
    -- other columns not needed in hot queries
    raw_data VARCHAR,
    metadata VARCHAR
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

:::tip

Only include columns that appear in your most frequent queries. Each included
column adds storage overhead and slows down writes slightly. Columns not in
the `INCLUDE` list can still be queried — they just won't benefit from the
covering optimization and will be read from column files.

:::

### Inspecting indexes with SHOW COLUMNS

`SHOW COLUMNS` displays index metadata for each column, including the index
type and covered columns:

```questdb-sql
SHOW COLUMNS FROM trades;
```

| column    | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | symbolTableSize | designated | upsertKey | indexType | indexInclude              |
|-----------|-----------|---------|--------------------|--------------|----------------|-----------------|------------|-----------|-----------|---------------------------|
| timestamp | TIMESTAMP | false   | 0                  | false        | 0              | 0               | true       | false     |           |                           |
| symbol    | SYMBOL    | true    | 256                | true         | 256            | 0               | false      | false     | POSTING   | exchange,price,timestamp  |
| exchange  | SYMBOL    | false   | 256                | true         | 256            | 0               | false      | false     |           |                           |
| price     | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |           |                           |
| quantity  | DOUBLE    | false   | 0                  | false        | 0              | 0               | false      | false     |           |                           |

The `indexType` column shows `POSTING`, `POSTING DELTA`, `POSTING EF`,
`BITMAP`, or is empty for non-indexed columns. The `indexInclude` column
lists covered column names — note the auto-included designated timestamp.

### Verifying covering index usage

Use `EXPLAIN` to verify that a query uses the covering index:

```questdb-sql
EXPLAIN SELECT timestamp, price FROM trades WHERE symbol = 'AAPL';
```

If the covering index is used, the plan shows `CoveringIndex`:

```
SelectedRecord
    CoveringIndex on: symbol with: timestamp, price
      filter: symbol='AAPL'
```

`IN`-list filters render as `filter: symbol IN ['AAPL','GOOGL','MSFT']`.
`LATEST ON` queries that hit the covering path show an `op: latest`
annotation and have no `SelectedRecord` wrapper:

```
CoveringIndex op: latest on: symbol with: timestamp, price
  filter: symbol='AAPL'
```

`SELECT DISTINCT` does not need to read covered values, so it shows up as
`PostingIndex op: distinct` rather than `CoveringIndex`:

```
PostingIndex op: distinct on: symbol
    Frame forward scan on: trades
```

When you add a filter on a covered column, an `Async Filter` is layered
above the covering index — the predicate values are read from the sidecar,
not the column file:

```
SelectedRecord
    Async Filter workers: N
      filter: 100<price
        CoveringIndex on: symbol with: price
          filter: symbol='AAPL'
```

If you see `DeferredSingleSymbolFilterPageFrame` or `PageFrame` instead, the
query is reading from column files. This happens when the `SELECT` list
includes columns not in the `INCLUDE` list, or when the `WHERE` clause
doesn't filter on the indexed symbol.

## Comparison with bitmap index

| Feature | Bitmap index | Posting index |
|---------|-------------|---------------|
| Storage size | ~15 bytes/value | ~1 byte/value |
| Covering index (INCLUDE) | No | Yes |
| DISTINCT acceleration | No | Yes |
| Write overhead | Low | Low (without INCLUDE), moderate with INCLUDE |
| LATEST ON optimization | Yes | Yes |
| `CAPACITY` clause | Yes | No (parse error) |
| Syntax | `INDEX` or `INDEX TYPE BITMAP` | `INDEX TYPE POSTING` |

In end-to-end benchmarks (geomean across five workloads, sealed indexes), the
posting index is roughly 13× smaller than the bitmap index and 1.3–1.5×
faster on point, range, and full-scan reads. Writes are ~9% slower than the
bitmap index for the index part itself; sidecar writes add overhead
proportional to the number and type of `INCLUDE` columns.

## Query patterns accelerated

### Point queries (WHERE symbol = 'X')

```questdb-sql
-- Reads from sidecar if price is in INCLUDE
SELECT price FROM trades WHERE symbol = 'AAPL';
```

### Point queries with additional filters

If the additional filter columns are also in `INCLUDE`, the covering index
streams matching rows and an `Async Filter` applies the extra predicate on
top — the predicate values are read from the sidecar, not the column file:

```questdb-sql
-- Covering index + filter on covered column
SELECT price FROM trades WHERE symbol = 'AAPL' AND price > 100;
```

### IN-list queries

```questdb-sql
-- Multiple keys, still uses covering index
SELECT price FROM trades WHERE symbol IN ('AAPL', 'GOOGL', 'MSFT');
```

### LATEST ON queries

```questdb-sql
-- Latest row per symbol, reads from sidecar
SELECT timestamp, symbol, price
FROM trades
WHERE symbol = 'AAPL'
LATEST ON timestamp PARTITION BY symbol;
```

### DISTINCT queries

```questdb-sql
-- Enumerates keys from index metadata, O(keys x partitions) instead of full scan
SELECT DISTINCT symbol FROM trades;

-- Also works with timestamp filters
SELECT DISTINCT symbol FROM trades WHERE timestamp > '2024-01-01';
```

### COUNT queries

```questdb-sql
-- Uses index to scan only matching rows instead of full table
SELECT COUNT(*) FROM trades WHERE symbol = 'AAPL';
```

### Aggregate queries on covered columns

```questdb-sql
-- Aggregates over a covered column read from the sidecar instead of
-- the column file
SELECT count(*), min(price), max(price)
FROM trades
WHERE symbol = 'AAPL';
```

## SQL optimizer hints

Two hints control index usage:

### no_covering

Forces the query to read from column files instead of the covering index
sidecar. Useful for benchmarking or when the covering path has an issue.

```questdb-sql
SELECT /*+ no_covering */ price FROM trades WHERE symbol = 'AAPL';
```

### no_index

Completely disables index usage, falling back to a full table scan with
filter. Also implies `no_covering`.

```questdb-sql
SELECT /*+ no_index */ price FROM trades WHERE symbol = 'AAPL';
```

## Trade-offs

### Storage

The posting index itself is very compact (~1 byte per indexed value, vs.
~15 bytes per value for the bitmap index). The covering sidecar adds
storage proportional to the included columns:

- **DOUBLE, FLOAT**: ALP (Adaptive Lossless floating-Point), backed by
  Frame-of-Reference bitpacking with an exception list for outliers.
- **TIMESTAMP**: linear-prediction header with Frame-of-Reference residual
  bitpacking — designed for monotonic timestamp data.
- **Other fixed-width integer types** (BOOLEAN, BYTE, SHORT, CHAR, INT,
  LONG, DATE, IPv4, GEO\*, DECIMAL8–DECIMAL64, SYMBOL keys):
  Frame-of-Reference bitpacking sized to the column's natural width, so
  the worst case is the column-file byte size and typical case is much
  smaller.
- **UUID, LONG256, DECIMAL128, DECIMAL256**: stored raw at full width
  with a small count header.
- **VARCHAR, STRING**: FSST-compressed once a stride exceeds 4 KB of raw
  data; typically 2–5× smaller than the column file.
- **BINARY and arrays**: length-prefixed raw bytes (no compression).

### Write performance

Write overhead depends on the number and type of `INCLUDE` columns:

- **Posting index without INCLUDE**: ~9% slower than the bitmap index for
  the index path itself (delta + Frame-of-Reference encoding vs. simple
  append).
- **Posting index with fixed-width INCLUDE**: additional sidecar write cost
  proportional to the number of columns; values are batched and compressed
  at seal time.
- **Posting index with VARCHAR / STRING / BINARY / ARRAY INCLUDE**: pays
  the full variable-width copy cost per row plus an FSST symbol-table
  rebuild per seal for VARCHAR / STRING.

Query performance improvements typically far outweigh the write cost for
read-heavy workloads.

### Memory

The posting index uses native memory for encoding/decoding buffers. Each
FSST-compressed `VARCHAR` or `STRING` column carries a ~2.3 KB symbol
table that is loaded alongside the sidecar at read time and easily fits
in L1 cache; per-reader decompression buffers are also small.

## Architecture

The posting index stores data in three file types per partition:

- **`.pk`** — Key file: double-buffered metadata pages with the per-key
  generation directory; readers see consistent snapshots via a seqlock
  protocol.
- **`.pv`** — Value file: row IDs encoded as either delta +
  Frame-of-Reference bitpacking or Elias-Fano (depending on the index's
  encoding variant), organised into stride-indexed generations.
- **`.pci` + `.pc0`, `.pc1`, …** — Sidecar files: covered column values
  stored alongside the posting list. `.pci` holds the per-column header
  (including the `coverCount`); each `.pcN` (with txn-segment suffix on
  disk, e.g. `s.pc0.0.0`) holds the encoded data for one `INCLUDE`
  column. The auto-included designated timestamp counts as one of the
  covered columns and gets its own `.pcN` file.

### Generations and sealing

Data is written incrementally as **generations** (one per commit). Each
generation contains a sparse block of key→rowID mappings. Periodically,
generations are **sealed** into a single dense generation with stride-indexed
layout for optimal read performance.

Sealing happens automatically when the active generation count reaches a
threshold (`cairo.posting.seal.gen.threshold`, default 16) or when a
partition is closed. Sealed data is written stride-by-stride (256 keys per
stride). Within the delta + Frame-of-Reference family, the writer
trial-encodes each stride in two sub-layouts and keeps whichever produces
fewer bytes:

- **Delta sub-layout** — per-key delta encoding, then per-block
  Frame-of-Reference bitpacking. Wins when there are roughly ten or more
  values per key, where the delta distribution lets each block use a
  small bitwidth.
- **Flat sub-layout** — stride-wide Frame-of-Reference with a single base
  and bitwidth, plus a prefix-count array for per-key slicing. Wins when
  keys are sparse (roughly eight or fewer values per key) by eliminating
  per-key metadata.

These are internal to delta + Frame-of-Reference and are independent of the
SQL `DELTA` / `EF` encoding variants described above. When the resulting
bitwidth is 8, 16, or 32, decoding uses a native AVX2 fast path; other
bit widths fall back to a Java decoder.

### FSST compression for strings

VARCHAR and STRING columns in the INCLUDE list are compressed using FSST
(Fast Static Symbol Table) compression during sealing once a stride exceeds
4 KB of raw data. FSST replaces frequently occurring 1–8 byte patterns
with single-byte codes, typically achieving 2–5× compression on string data
with repetitive patterns. The 2.3 KB symbol table fits in L1 cache and
gives stateless O(1) per-value decode.

The FSST symbol table is trained per seal and stored inline in the sidecar
file. Decompression is transparent to the query engine.

## Limitations

:::warning

- `INCLUDE` is only supported for the posting index type (not bitmap).
  Writing `INDEX TYPE BITMAP INCLUDE (...)` errors with
  `INCLUDE is only supported for POSTING index type`.
- `INCLUDE` cannot list the indexed symbol column itself.
- `INCLUDE` is not supported with out-of-line `INDEX(col ...)` syntax —
  use inline column syntax or `ALTER TABLE` instead.
- `CAPACITY` is not supported for posting indexes (bitmap only).
- The covering path engages only when the query filters on the indexed
  symbol (single key, `IN`-list, or bind variable). Queries without such
  a filter — including unfiltered `LATEST ON … PARTITION BY sym`,
  unfiltered `SAMPLE BY`, and unfiltered `GROUP BY` — fall back to a
  regular page-frame scan.
- `REINDEX` on WAL tables requires dropping and re-adding the index
  (this applies to all index types, not just posting).

:::
