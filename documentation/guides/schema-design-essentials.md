---
title: Schema Design Essentials
slug: schema-design-essentials
description:
  Learn how to design efficient schemas in QuestDB. Covers timestamps,
  partitioning, data types, deduplication, and retention strategies.
---

New to QuestDB? This guide covers the essential concepts for designing efficient time-series tables.

## Your first table

Here's a minimal, well-designed QuestDB table:

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    side SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

Key elements:
- **`TIMESTAMP(timestamp)`** — designates the time column (required for time-series)
- **`PARTITION BY DAY`** — splits data into daily partitions for efficient queries
- **`SYMBOL`** — optimized type for categorical data like tickers

## Designated timestamp

Every time-series table needs a **designated timestamp**. This column:

- Determines physical storage order (data is sorted by this column)
- Enables partition pruning (queries skip irrelevant time ranges)
- Powers time-series functions like `SAMPLE BY` and `LATEST ON`

```questdb-sql
CREATE TABLE market_data (
    ts TIMESTAMP,        -- Will be the designated timestamp
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;
```

Without a designated timestamp, you lose most of QuestDB's performance benefits.

See [Designated Timestamp](/docs/concept/designated-timestamp/) for details.

## Partitioning

Partitioning splits your table into time-based chunks. Choose based on your data volume:

| Data volume | Recommended partition |
|-------------|----------------------|
| < 100K rows/day | `MONTH` or `YEAR` |
| 100K - 10M rows/day | `DAY` |
| 10M - 100M rows/day | `HOUR` |
| > 100M rows/day | `HOUR` (consider multiple tables) |

**Guidelines:**
- Each partition should be a few hundred MB to a few GB
- Too many small partitions = more file operations
- Too few large partitions = slower queries and more memory usage

```questdb-sql
-- High-volume tick data
CREATE TABLE trades (...)
TIMESTAMP(ts) PARTITION BY HOUR;

-- Lower-volume end-of-day prices
CREATE TABLE eod_prices (...)
TIMESTAMP(ts) PARTITION BY MONTH;
```

See [Partitions](/docs/concept/partitions/) for details.

## Data types

### SYMBOL vs VARCHAR

**When to use SYMBOL:**
- Repetitive string values (stock tickers, country codes, status flags)
- Up to tens of millions of distinct values
- Columns used in `WHERE` filters or `GROUP BY`

**When to use VARCHAR:**
- Unique/high-cardinality values (hundreds of millions of distinct)
- User-generated text (comments, log messages)
- UUIDs (though the `UUID` type is better)

**Why it matters:**
- SYMBOL uses dictionary encoding (integer lookups vs string comparisons)
- Faster filtering, faster grouping, less storage

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,       -- Stock ticker: AAPL, GOOGL, etc.
    side SYMBOL,         -- BUY or SELL
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

See [Symbol](/docs/concept/symbol/) for details.

### Timestamps

QuestDB stores all timestamps in **UTC** with microsecond precision.

```questdb-sql
CREATE TABLE trades (
    ts TIMESTAMP,              -- Microsecond precision (recommended)
    exchange_ts TIMESTAMP_NS,  -- Nanosecond precision (if needed)
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(ts);
```

Use `TIMESTAMP` unless you specifically need nanosecond precision.

For timezone handling at query time, see
[Working with Timestamps and Timezones](/docs/guides/working-with-timestamps-timezones/).

### Other types

| Type | Use case |
|------|----------|
| `VARCHAR` | Free-text strings |
| `DOUBLE` / `FLOAT` | Floating point numbers |
| `DECIMAL(precision, scale)` | Exact decimal numbers (financial data) |
| `LONG` / `INT` / `SHORT` | Integers |
| `BOOLEAN` | True/false flags |
| `UUID` | Unique identifiers (more efficient than VARCHAR) |
| `IPv4` | IP addresses |
| `BINARY` | Binary data |
| `ARRAY` | N-dimensional arrays (e.g. `DOUBLE[3][4]`) |

**Numeric type storage sizes:**

| Type | Storage | Range |
|------|---------|-------|
| `BYTE` | 8 bits | -128 to 127 |
| `SHORT` | 16 bits | -32,768 to 32,767 |
| `INT` | 32 bits | -2.1B to 2.1B |
| `LONG` | 64 bits | -9.2E18 to 9.2E18 |
| `FLOAT` | 32 bits | Single precision IEEE 754 |
| `DOUBLE` | 64 bits | Double precision IEEE 754 |

Choose the smallest type that fits your data to save storage.

For arrays and geospatial data, see [Data Types](/docs/reference/sql/datatypes/).

## Deduplication

QuestDB allows duplicates by default. To enforce uniqueness, use `DEDUP UPSERT KEYS`:

```questdb-sql
CREATE TABLE quotes (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    bid DOUBLE,
    ask DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol);
```

When a row arrives with the same `timestamp` and `symbol`, the old row is replaced.

**Deduplication has no noticeable performance penalty.**

See [Deduplication](/docs/concept/deduplication/) for details.

## Data retention with TTL

QuestDB doesn't support individual row deletes. Instead, use TTL to automatically
drop old partitions:

```questdb-sql
CREATE TABLE tick_data (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    size LONG
) TIMESTAMP(timestamp) PARTITION BY DAY TTL 90 DAYS;
```

This keeps the last 90 days of data and automatically removes older partitions.

See [TTL](/docs/concept/ttl/) for details.

## Materialized views

For frequently-run aggregations, pre-compute results with materialized views:

```questdb-sql
CREATE MATERIALIZED VIEW ohlc_1h AS
  SELECT
    timestamp,
    symbol,
    first(price) as open,
    max(price) as high,
    min(price) as low,
    last(price) as close,
    sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h;
```

QuestDB automatically refreshes the view as new data arrives. Queries against
the view are instant regardless of base table size.

See [Materialized Views](/docs/concept/mat-views/) for details.

## Common mistakes

### Using VARCHAR for categorical data

```questdb-sql
-- Bad: VARCHAR for repeated values
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol VARCHAR,        -- Slow filtering and grouping
    ...
);

-- Good: SYMBOL for categorical data
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,         -- Fast filtering and grouping
    ...
);
```

### Wrong partition size

```questdb-sql
-- Bad: Yearly partitions for high-volume data
CREATE TABLE trades (...)
PARTITION BY YEAR;          -- Partitions will be huge

-- Good: Match partition size to data volume
CREATE TABLE trades (...)
PARTITION BY HOUR;
```

### Forgetting the designated timestamp

```questdb-sql
-- Bad: No designated timestamp
CREATE TABLE trades (
    ts TIMESTAMP,
    price DOUBLE
);

-- Good: Explicit designated timestamp
CREATE TABLE trades (
    ts TIMESTAMP,
    price DOUBLE
) TIMESTAMP(ts);
```

## Schema changes

Some properties **cannot be changed** after table creation:

| Property | Can modify? |
|----------|-------------|
| Designated timestamp column | No |
| Partitioning strategy | No |
| Add new columns | Yes |
| Drop columns | Yes |
| Rename columns | Yes |
| Change column type | Limited |

To change immutable properties, create a new table and migrate data:

```questdb-sql
-- 1. Create new table with desired schema
CREATE TABLE trades_new (...) PARTITION BY HOUR;

-- 2. Copy data
INSERT INTO trades_new SELECT * FROM trades;

-- 3. Swap tables
DROP TABLE trades;
RENAME TABLE trades_new TO trades;
```

## Multi-tenancy

QuestDB uses a **single database per instance**. For multi-tenant applications,
use table name prefixes:

```questdb-sql
-- Client-specific tables
CREATE TABLE acme_trades (...);
CREATE TABLE globex_trades (...);

-- Environment and region tables
CREATE TABLE prod_us_trades (...);
CREATE TABLE prod_eu_trades (...);
CREATE TABLE staging_trades (...);

-- Asset class tables
CREATE TABLE equities_trades (...);
CREATE TABLE fx_trades (...);
CREATE TABLE crypto_trades (...);
```

**Naming conventions:**
- Use consistent prefixes: `{client}_`, `{env}_{region}_`, `{asset_class}_`
- Keep names lowercase with underscores
- Consider query patterns when choosing prefix granularity

With [QuestDB Enterprise](/docs/operations/rbac/), you can enforce per-table
permissions for access control.

## PostgreSQL compatibility

QuestDB supports the [PostgreSQL wire protocol](/docs/pgwire/pgwire-intro/),
so most PostgreSQL client libraries work. However, QuestDB is not PostgreSQL:

- No `PRIMARY KEY`, `FOREIGN KEY`, or `NOT NULL` constraints
- Limited system catalog compatibility
- Some PostgreSQL functions may not be available

## Migrating from other databases

<details>
<summary>PostgreSQL / TimescaleDB</summary>

```questdb-sql
-- PostgreSQL
CREATE TABLE metrics (
    timestamp TIMESTAMP PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL
);
INSERT INTO metrics VALUES (...)
ON CONFLICT (timestamp) DO UPDATE SET value = EXCLUDED.value;

-- QuestDB equivalent
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, name);
```

</details>

<details>
<summary>InfluxDB</summary>

```text
# InfluxDB line protocol
metrics,name=cpu,region=us value=0.64
```

```questdb-sql
-- QuestDB equivalent
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name SYMBOL,
    region SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

</details>

<details>
<summary>ClickHouse</summary>

```questdb-sql
-- ClickHouse
CREATE TABLE metrics (
    timestamp DateTime,
    name String,
    value Float64
) ENGINE = ReplacingMergeTree
ORDER BY (name, timestamp);

-- QuestDB equivalent
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, name);
```

</details>

<details>
<summary>DuckDB</summary>

```questdb-sql
-- DuckDB
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name VARCHAR,
    value DOUBLE
);

-- QuestDB equivalent
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name SYMBOL,          -- Use SYMBOL for repeated strings
    value DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

</details>

## Schema management

For schema migrations, QuestDB supports [Flyway](https://documentation.red-gate.com/fd/questdb-305791448.html).

You can also use ILP auto-creation for dynamic schemas, though this applies
default settings. See [ILP Overview](/docs/reference/api/ilp/overview/) for details.

## Next steps

- [Quick Start](/docs/quick-start/) — Create your first table and run queries
- [Capacity Planning](/docs/operations/capacity-planning/) — Size your deployment for production
- [Connect & Ingest](/docs/ingestion-overview/) — Load data into QuestDB
- [Materialized Views](/docs/concept/mat-views/) — Pre-compute aggregations for fast dashboards
