---
title: Schema Design Essentials
slug: schema-design-essentials
description:
  Learn how to design efficient schemas in QuestDB. Covers timestamps,
  partitioning, data types, deduplication, and retention strategies.
---

This guide covers how to design tables that take full advantage of QuestDB's
time-series architecture.

## Your first table

Here's a minimal, well-designed QuestDB table:

```questdb-sql
CREATE TABLE readings (
    timestamp TIMESTAMP,
    sensor_id SYMBOL,
    temperature DOUBLE,
    humidity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
```

Key elements:
- **`TIMESTAMP(timestamp)`** — designates the time column (required for time-series)
- **`PARTITION BY DAY`** — splits data into daily partitions for efficient queries
- **`WAL`** — enables write-ahead log for concurrent writes
- **`SYMBOL`** — optimized type for categorical data like IDs

## Designated timestamp

Every time-series table needs a **designated timestamp**. This column:

- Determines physical storage order (data is sorted by this column)
- Enables partition pruning (queries skip irrelevant time ranges)
- Powers time-series functions like `SAMPLE BY` and `LATEST ON`

```questdb-sql
CREATE TABLE events (
    ts TIMESTAMP,        -- Will be the designated timestamp
    event_type SYMBOL,
    payload VARCHAR
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
-- High-volume IoT data
CREATE TABLE sensor_data (...)
TIMESTAMP(ts) PARTITION BY HOUR;

-- Lower-volume business metrics
CREATE TABLE daily_metrics (...)
TIMESTAMP(ts) PARTITION BY MONTH;
```

See [Partitions](/docs/concept/partitions/) for details.

## Data types

### SYMBOL (for categorical data)

Use `SYMBOL` for columns with repeated string values:

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,       -- Stock ticker: AAPL, GOOGL, etc.
    side SYMBOL,         -- BUY or SELL
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**When to use SYMBOL:**
- Limited set of values (country codes, status flags, device IDs)
- Column is used in `WHERE` filters or `GROUP BY`
- Up to a few million distinct values

**When to use VARCHAR instead:**
- Truly unique values (user-generated content, log messages)
- Very high cardinality (> millions of distinct values)
- Values that won't be filtered or grouped

Symbol capacity expands automatically as needed.

### Timestamps

QuestDB stores all timestamps in **UTC** with microsecond precision.

```questdb-sql
CREATE TABLE events (
    ts TIMESTAMP,              -- Microsecond precision (recommended)
    ts_nano TIMESTAMP_NS,      -- Nanosecond precision (if needed)
    created_at TIMESTAMP
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
CREATE TABLE metrics (
    timestamp TIMESTAMP,
    name SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, name);
```

When a row arrives with the same `timestamp` and `name`, the old row is replaced.

**Deduplication has no noticeable performance penalty.**

See [Deduplication](/docs/concept/deduplication/) for details.

## Data retention with TTL

QuestDB doesn't support individual row deletes. Instead, use TTL to automatically
drop old partitions:

```questdb-sql
CREATE TABLE logs (
    timestamp TIMESTAMP,
    level SYMBOL,
    message VARCHAR
) TIMESTAMP(timestamp) PARTITION BY DAY TTL 30 DAYS;
```

This keeps the last 30 days of data and automatically removes older partitions.

See [TTL](/docs/concept/ttl/) for details.

## Materialized views

For frequently-run aggregations, pre-compute results with materialized views:

```questdb-sql
CREATE MATERIALIZED VIEW hourly_stats AS
  SELECT
    timestamp,
    sensor_id,
    avg(temperature) as avg_temp,
    max(temperature) as max_temp
  FROM readings
  SAMPLE BY 1h;
```

QuestDB automatically refreshes the view as new data arrives. Queries against
the view are instant regardless of base table size.

See [Materialized Views](/docs/concept/mat-views/) for details.

## Common mistakes

### Using VARCHAR for categorical data

```questdb-sql
-- Bad: VARCHAR for repeated values
CREATE TABLE events (
    timestamp TIMESTAMP,
    event_type VARCHAR,     -- Slow filtering and grouping
    ...
);

-- Good: SYMBOL for categorical data
CREATE TABLE events (
    timestamp TIMESTAMP,
    event_type SYMBOL,      -- Fast filtering and grouping
    ...
);
```

### Wrong partition size

```questdb-sql
-- Bad: Yearly partitions for high-volume data
CREATE TABLE sensor_data (...)
PARTITION BY YEAR;          -- Partitions will be huge

-- Good: Match partition size to data volume
CREATE TABLE sensor_data (...)
PARTITION BY HOUR;
```

### Forgetting the designated timestamp

```questdb-sql
-- Bad: No designated timestamp
CREATE TABLE readings (
    ts TIMESTAMP,
    value DOUBLE
);

-- Good: Explicit designated timestamp
CREATE TABLE readings (
    ts TIMESTAMP,
    value DOUBLE
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
CREATE TABLE readings_new (...) PARTITION BY HOUR;

-- 2. Copy data
INSERT INTO readings_new SELECT * FROM readings;

-- 3. Swap tables
DROP TABLE readings;
RENAME TABLE readings_new TO readings;
```

## Multi-tenancy

QuestDB uses a **single database per instance**. For multi-tenant applications,
use table name prefixes:

```questdb-sql
CREATE TABLE tenant1_events (...);
CREATE TABLE tenant2_events (...);
```

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
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, name);
```

</details>

<details>
<summary>InfluxDB</summary>

```
-- InfluxDB measurement
measurement: metrics
tags: name, region
fields: value

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
) TIMESTAMP(timestamp) PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, name);
```

</details>

## Schema management

For schema migrations, QuestDB supports [Flyway](https://documentation.red-gate.com/fd/questdb-305791448.html).

You can also use ILP auto-creation for dynamic schemas, though this applies
default settings. See [ILP Overview](/docs/reference/api/ilp/overview/) for details.
