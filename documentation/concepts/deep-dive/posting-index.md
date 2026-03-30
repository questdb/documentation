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

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING,
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

### With covering columns (INCLUDE)

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING INCLUDE (exchange, price, timestamp),
    exchange SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

The `INCLUDE` clause specifies which columns are stored in the index sidecar
files. Queries that only read these columns plus the indexed symbol column
can be served entirely from the index.

### On an existing table

```questdb-sql
ALTER TABLE trades
  ALTER COLUMN symbol ADD INDEX TYPE POSTING INCLUDE (exchange, price);
```

## Covering index

The covering index is the most powerful feature of the posting index. When all
columns in a query's `SELECT` list are either:

- The indexed symbol column itself (from the `WHERE` clause)
- Listed in the `INCLUDE` clause

...the query engine reads data directly from the index sidecar files, bypassing
the main column files entirely. This is significantly faster for selective
queries on wide tables.

### Supported column types in INCLUDE

| Type | Supported | Notes |
|------|-----------|-------|
| BOOLEAN, BYTE, SHORT, CHAR | Yes | Fixed-width, 1-2 bytes per value |
| INT, FLOAT, IPv4 | Yes | Fixed-width, 4 bytes per value |
| LONG, DOUBLE, TIMESTAMP, DATE | Yes | Fixed-width, 8 bytes per value |
| GEOBYTE, GEOSHORT, GEOINT, GEOLONG | Yes | Fixed-width, 1-8 bytes depending on precision |
| DECIMAL8, DECIMAL16, DECIMAL32, DECIMAL64 | Yes | Fixed-width, 1-8 bytes depending on precision |
| SYMBOL | Yes | Stored as integer key, resolved at query time |
| VARCHAR | Yes | Variable-width, FSST compressed in sealed partitions |
| STRING | Yes | Variable-width, FSST compressed in sealed partitions |
| BINARY | No | Not yet supported |
| UUID, LONG256 | No | Not yet supported (requires multi-long sidecar format) |
| DECIMAL128, DECIMAL256 | No | Not yet supported |
| Arrays (DOUBLE[][], etc.) | No | Not supported |

### How to choose INCLUDE columns

Include columns that you frequently select together with the indexed symbol:

```questdb-sql
-- If your typical queries look like this:
SELECT timestamp, price, quantity FROM trades WHERE symbol = 'AAPL';

-- Then include those columns:
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL INDEX TYPE POSTING INCLUDE (timestamp, price, quantity),
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

- Fixed-width columns (DOUBLE, INT, etc.): exact column size, compressed
  with ALP (Adaptive Lossless floating-Point) and Frame-of-Reference bitpacking
- Variable-width columns (VARCHAR, STRING): FSST compressed in sealed
  partitions, typically 2-5x smaller than raw column data
- The sidecar is typically 0.5-5% of the total column file size for the
  included columns

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

- **Delta mode**: per-key delta encoding with bitpacking
- **Flat mode**: stride-wide Frame-of-Reference with contiguous bitpacking

The encoder trial-encodes both modes and picks the smaller one per stride.

### FSST compression for strings

VARCHAR and STRING columns in the INCLUDE list are compressed using FSST
(Fast Static Symbol Table) compression during sealing. FSST replaces
frequently occurring 1-8 byte patterns with single-byte codes, typically
achieving 2-5x compression on string data with repetitive patterns.

The FSST symbol table is trained per stride block and stored inline in the
sidecar file. Decompression is transparent to the query engine.

## Limitations

:::warning

- INCLUDE is only supported for POSTING index type (not BITMAP)
- Array columns (DOUBLE[][], etc.) cannot be included
- BINARY, UUID, LONG256, DECIMAL128, and DECIMAL256 columns cannot yet be included
- SAMPLE BY queries do not currently use the covering index
  (they fall back to the regular index path)
- REINDEX on WAL tables requires dropping and re-adding the index
  (this applies to all index types, not just posting)

:::
