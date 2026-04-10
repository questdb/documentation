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
index when an `INCLUDE` clause is present — you do not need to list it
explicitly. This means timestamp-filtered covering queries work out of the
box.

:::

:::note

The `INCLUDE` clause is only supported with inline column syntax and
`ALTER TABLE`. The out-of-line `INDEX(col TYPE POSTING)` syntax does not
support `INCLUDE`.

:::

### On an existing table

```questdb-sql
ALTER TABLE trades
  ALTER COLUMN symbol ADD INDEX TYPE POSTING INCLUDE (exchange, price);
```

### Encoding options

The posting index supports three row ID encoding options with different
compression and query performance characteristics:

| Syntax | Encoding | Best for |
|--------|----------|----------|
| `INDEX TYPE POSTING` | Adaptive (default) | General purpose — trial-encodes both EF and delta per stride, picks the smaller |
| `INDEX TYPE POSTING EF` | Elias-Fano | Irregular data distributions, point queries and selective lookups |
| `INDEX TYPE POSTING DELTA` | Delta | Regular, evenly-distributed data, large sequential scans |

**Delta encoding** stores per-key deltas between consecutive row IDs with
Frame-of-Reference bitpacking. It compresses best when row IDs for each
symbol key are evenly spaced (e.g. round-robin or time-ordered ingestion
of a fixed set of symbols) and is faster for queries that scan large
ranges of matching rows.

**Elias-Fano (EF) encoding** uses a stride-wide flat layout with
Frame-of-Reference bitpacking across all keys in a stride. It compresses
better for irregular data distributions (e.g. bursty or skewed symbol
frequencies) and is faster for point queries and selective lookups.

The **adaptive (default)** encoding trial-encodes both EF and delta modes
per stride and picks whichever produces the smaller output. This is the
best choice when you are unsure about your data distribution or have a
mixed query workload.

```questdb-sql
-- Default adaptive encoding (recommended for most workloads)
CREATE TABLE t1 (ts TIMESTAMP, s SYMBOL INDEX TYPE POSTING)
    TIMESTAMP(ts) PARTITION BY DAY WAL;

-- EF encoding (irregular data, point queries)
CREATE TABLE t2 (ts TIMESTAMP, s SYMBOL INDEX TYPE POSTING EF)
    TIMESTAMP(ts) PARTITION BY DAY WAL;

-- Delta-only encoding (regular data, large scans)
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
| BOOLEAN, BYTE, GEOBYTE, DECIMAL8 | Raw copy | 1 byte per value |
| SHORT, CHAR, GEOSHORT, DECIMAL16 | Frame-of-Reference | 2 bytes uncompressed |
| INT, FLOAT, IPv4, GEOINT, DECIMAL32 | FoR (int) / ALP (float) | 4 bytes uncompressed |
| LONG, DOUBLE, TIMESTAMP, DATE, GEOLONG, DECIMAL64 | FoR / ALP / linear prediction | 8 bytes uncompressed |
| SYMBOL | Frame-of-Reference | Stored as integer key, resolved at query time |
| UUID, DECIMAL128 | Raw copy | 16 bytes per value |
| LONG256, DECIMAL256 | Raw copy | 32 bytes per value |
| VARCHAR, STRING | FSST compressed | Variable-width, typically 2-5x compression |
| BINARY | Variable-width sidecar | Stored in offset-based format |
| Arrays (DOUBLE[], INT[], etc.) | Variable-width sidecar | Stored in offset-based format |

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

| column | type | indexed | indexBlockCapacity | indexType | indexInclude | symbolCached | symbolCapacity | designated | upsertKey |
|--------|------|---------|-------------------|-----------|-------------|-------------|----------------|------------|-----------|
| timestamp | TIMESTAMP | false | 0 | | | false | 0 | true | false |
| symbol | SYMBOL | true | 256 | POSTING | exchange,price | true | 128 | false | false |
| exchange | SYMBOL | false | 0 | | | true | 128 | false | false |
| price | DOUBLE | false | 0 | | | false | 0 | false | false |
| quantity | DOUBLE | false | 0 | | | false | 0 | false | false |

The `indexType` column shows `POSTING`, `BITMAP`, or is empty for
non-indexed columns. The `indexInclude` column lists covered column names.

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

If you see `DeferredSingleSymbolFilterPageFrame` or `PageFrame` instead, the
query is reading from column files. This happens when the `SELECT` list
includes columns not in the `INCLUDE` list.

## Comparison with bitmap index

| Feature | Bitmap index | Posting index |
|---------|-------------|---------------|
| Storage size | 8-16 bytes/value | ~1 byte/value |
| Covering index (INCLUDE) | No | Yes |
| DISTINCT acceleration | No | Yes |
| Write overhead | Minimal | Minimal (without INCLUDE) |
| Write overhead with INCLUDE | N/A | Moderate (depends on INCLUDE columns) |
| LATEST ON optimization | Yes | Yes |
| Syntax | `INDEX` or `INDEX TYPE BITMAP` | `INDEX TYPE POSTING` |

## Query patterns accelerated

### Point queries (WHERE symbol = 'X')

```questdb-sql
-- Reads from sidecar if price is in INCLUDE
SELECT price FROM trades WHERE symbol = 'AAPL';
```

### Point queries with additional filters

If the additional filter columns are also in INCLUDE, the covering index
is still used with a filter applied on top:

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
-- Vectorized GROUP BY reads from sidecar page frames
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

The posting index itself is very compact (~1 byte per indexed value).
The covering sidecar adds storage proportional to the included columns:

- **Numeric columns** (DOUBLE, FLOAT): compressed with ALP (Adaptive
  Lossless floating-Point) and Frame-of-Reference bitpacking
- **Integer columns** (INT, LONG, etc.): Frame-of-Reference bitpacking;
  TIMESTAMP additionally uses linear-prediction encoding
- **Small fixed-width types** (BYTE, BOOLEAN, etc.): stored as raw copies
- **Wide fixed-width types** (UUID, LONG256, DECIMAL128/256): stored as
  raw copies with a count header
- **Variable-width columns** (VARCHAR, STRING): FSST compressed in sealed
  partitions, typically 2-5x smaller than raw column data
- **BINARY and arrays**: stored in an offset-based variable-width sidecar

### Write performance

Write overhead depends on the number and type of INCLUDE columns. Typical
ranges (measured with 100K row inserts, 50 symbol keys):

- **Posting index without INCLUDE**: ~15-20% slower than no index
- **Posting index with fixed-width INCLUDE** (DOUBLE, INT): ~40-50% slower
- **Posting index with VARCHAR INCLUDE**: ~2x slower

Actual overhead varies with row size, cardinality, and hardware. Query
performance improvements typically far outweigh the write cost for
read-heavy workloads.

### Memory

The posting index uses native memory for encoding/decoding buffers.
The covering index's FSST symbol tables use ~70KB of native memory per
compressed column per active reader.

## Architecture

The posting index stores data in three file types per partition:

- **`.pk`** — Key file: double-buffered metadata pages with generation
  directory (32 bytes per generation entry)
- **`.pv`** — Value file: delta + Frame-of-Reference bitpacked row IDs,
  organized into stride-indexed generations
- **`.pci` + `.pc0`, `.pc1`, ...** — Sidecar files: covered column values
  stored alongside the posting list, one file per INCLUDE column

### Generations and sealing

Data is written incrementally as **generations** (one per commit). Each
generation contains a sparse block of key→rowID mappings. Periodically,
generations are **sealed** into a single dense generation with stride-indexed
layout for optimal read performance.

Sealing happens automatically when the generation count reaches the maximum
(125) or when the partition is closed. Sealed data uses two encoding modes
per stride (256 keys):

- **Delta mode** (`POSTING DELTA`): per-key delta encoding with bitpacking —
  compresses best for regular, evenly-distributed row IDs and is faster for
  large sequential scans
- **Elias-Fano mode** (`POSTING EF`): stride-wide Frame-of-Reference with
  contiguous bitpacking — compresses better for irregular distributions and
  is faster for point queries

With the default adaptive encoding (`POSTING`), the encoder trial-encodes
both modes per stride and picks the smaller one.

### FSST compression for strings

VARCHAR and STRING columns in the INCLUDE list are compressed using FSST
(Fast Static Symbol Table) compression during sealing. FSST replaces
frequently occurring 1-8 byte patterns with single-byte codes, typically
achieving 2-5x compression on string data with repetitive patterns.

The FSST symbol table is trained per stride block and stored inline in the
sidecar file. Decompression is transparent to the query engine.

## Limitations

:::warning

- `INCLUDE` is only supported for the posting index type (not bitmap)
- `INCLUDE` cannot list the indexed symbol column itself
- `INCLUDE` is not supported with out-of-line `INDEX(col ...)` syntax —
  use inline column syntax or `ALTER TABLE` instead
- `CAPACITY` is not supported for posting indexes (bitmap only)
- `SAMPLE BY` queries do not currently use the covering index
  (they fall back to the regular index path)
- `REINDEX` on WAL tables requires dropping and re-adding the index
  (this applies to all index types, not just posting)

:::
