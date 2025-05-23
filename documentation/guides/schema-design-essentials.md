---
title: Schema Design Essentials
slug: schema-design-essentials
description:
 Learn how to design efficient schemas in QuestDB. This guide covers best practices for partitioning, indexing, symbols, timestamps, deduplication, retention strategies, and schema modifications to optimize performance in time-series workloads
---

This guide covers key concepts and best practices to take full advantage of QuestDB's performance-oriented architecture, highlighting some important differences with most databases.

## QuestDB's single database model

QuestDB has a **single database per instance**. Unlike PostgreSQL and other database engines, where you may have multiple databases or multiple schemas within an instance, in QuestDB, you operate within a single namespace.

The default database is named `qdb`, and this can be changed via configuration. However, unlike a standard SQL database, there is no need to issue `USE DATABASE` commands. Once connected, you can immediately start querying and inserting data.

### Multi-tenancy considerations

If you need **multi-tenancy**, you must manage table names manually, often by using **prefixes** for different datasets. Since QuestDB does not support multiple schemas, this is the primary way to segment data. In QuestDB Enterprise, you can [enforce permissions per table to restrict access](/docs/operations/rbac/), allowing finer control over multi-tenant environments.

Here are common patterns for implementing multi-tenancy:

#### Customer-specific tables

```questdb-sql
-- Customer-specific trading data
CREATE TABLE customer1_trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

CREATE TABLE customer2_trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

#### Environment or region-based separation

```questdb-sql
-- Production vs. Development environments
CREATE TABLE prod_metrics (
    timestamp TIMESTAMP,
    metric_name SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp);

CREATE TABLE dev_metrics (
    timestamp TIMESTAMP,
    metric_name SYMBOL,
    value DOUBLE
) TIMESTAMP(timestamp);

-- Regional data separation
CREATE TABLE eu_users (
    timestamp TIMESTAMP,
    user_id SYMBOL,
    action SYMBOL
) TIMESTAMP(timestamp);

CREATE TABLE us_users (
    timestamp TIMESTAMP,
    user_id SYMBOL,
    action SYMBOL
) TIMESTAMP(timestamp);
```

#### Department or team-based separation

```questdb-sql
-- Department-specific analytics
CREATE TABLE sales_daily_stats (
    timestamp TIMESTAMP,
    region SYMBOL,
    revenue DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;

CREATE TABLE marketing_campaign_metrics (
    timestamp TIMESTAMP,
    campaign_id SYMBOL,
    clicks LONG,
    impressions LONG
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

:::tip

When using table prefixes for multi-tenancy:

- Use consistent naming conventions (e.g., always `<tenant>_<table>`)
- Consider using uppercase for tenant identifiers to improve readability
- Document your naming convention in your team's schema design guidelines

:::

## PostgreSQL protocol compatibility

QuestDB is **not** a PostgreSQL database but is **compatible with the [PostgreSQL wire protocol](/docs/reference/api/postgres/)**. This means you can connect using PostgreSQL-compatible libraries and clients and execute SQL commands. However, compatibility with PostgreSQL system catalogs, metadata queries, data types, and functions is limited.

While most PostgreSQL-compatible low-level libraries work with QuestDB, some higher-level components that depend heavily on PostgreSQL metadata might fail. If you encounter such a case, please report it as an [issue on GitHub](https://github.com/questdb/questdb/issues) so we can track it.

## Creating a schema in QuestDB

### Recommended approach

The easiest way to create a schema is through the **[Web Console](/docs/web-console/)** or by sending SQL commands using:

- The [**REST API**](/docs/reference/api/rest/) (`CREATE TABLE` statements)
- The **[PostgreSQL wire protocol](/docs/reference/api/postgres/) clients**

### Schema auto-creation with ILP protocol

When using the **[Influx Line Protocol](/docs/reference/api/ilp/overview/) (ILP)**, QuestDB automatically creates tables and columns based on incoming data. This is useful for users migrating from InfluxDB or using tools like **InfluxDB client libraries or Telegraf**, as they can send data directly to QuestDB without pre-defining schemas. However, this comes with limitations:

- QuestDB applies the **default settings** to auto-created tables and columns (e.g., partitioning, symbol capacity, and data types).
- You **cannot modify [partitioning](/docs/concept/partitions/) or [symbol capacity](/docs/concept/symbol/#usage-of-symbols) later**.
- You cannot auto-create the `IPv4` data type. Sending an IP address as a string will create a `VARCHAR` column.

You can disable column auto-creation [via configuration](/docs/configuration/#influxdb-line-protocol-ilp).

## The designated timestamp and partitioning strategy

QuestDB is designed for time-series workloads. The database engine is optimized to perform exceptionally well for time-series queries. One of the most important optimizations in QuestDB is that data is physically stored and ordered by incremental timestamp. Therefore, the user must choose the **[designated timestamp](/docs/concept/designated-timestamp/)** when creating a table.

The **designated timestamp** is crucial in QuestDB. It directly affects:

- **How QuestDB partitions data** (by hour, day, week, month, or year).
- **Physical data storage order**, as data is always stored **sorted by the designated timestamp**.
- **Query efficiency**, since QuestDB **prunes partitions** based on the timestamp range in your query, reducing disk I/O.
- **Insertion performance**, because **out-of-order data forces QuestDB to rewrite partitions**, slowing down ingestion.

### Partitioning guidelines

When choosing the [partition](/docs/concept/partitions/) resolution for your tables, consider the time ranges you will query most frequently and keep in mind the following:

- **Avoid very large partitions**: A partition should be at most **a few gigabytes**.
- **Avoid too many small partitions**: Querying more partitions means opening more files.
- **Query efficiency**: When filtering data, QuestDB prunes partitions, but querying many partitions results in more disk operations. If most of your queries span a monthly range, weekly or daily partitioning sounds sensible, but hourly partitioning might slow down your queries.
- **Data ingestion performance**: If data arrives out of order, QuestDB rewrites the active partition, impacting performance.

## Columnar storage model and table density

QuestDB is **[columnar](/glossary/columnar-database/)**, meaning:

- **Columns are stored separately**, allowing fast queries on specific columns without loading unnecessary data.
- **Each column is stored in one or two files per partition**: The more columns you include in a `SELECT` and the more partitions the query spans, the more files will need to be opened and cached into working memory.

### Sparse vs. dense tables

- **QuestDB handles wide tables efficiently** due to its columnar architecture, as it will open only the column files referenced in each query.
- **Null values take [storage space](/docs/reference/sql/datatypes/#type-nullability)**, so it is recommended to avoid sparse tables where possible.
- **Dense tables** (where most columns have values) are more efficient in terms of storage and query performance. If you cannot design a dense table, consider creating different tables for distinct record structures.

## Data types and best practices

### Symbols (recommended for categorical data)

QuestDB introduces a specialized [`SYMBOL`](/docs/concept/symbol) data type. Symbols are **dictionary-encoded** and optimized for filtering and grouping:

- Use symbols for **categorical data** with a limited number of unique values (e.g., country codes, stock tickers, factory floor IDs).
- Symbols are fine for **storing up to a few million distinct values** but should be avoided beyond that.
- Avoid using a **`SYMBOL`** for columns that would be considered a `PRIMARY KEY` in other databases.
- **If very high cardinality is expected**, use **`VARCHAR`** instead of **`SYMBOL`**.
- **Symbols are compact on disk**, reducing storage overhead.
- **Symbol capacity defaults to 256**, but it will dynamically expand as needed, causing temporary slowdowns.
- **If you expect high cardinality, define the symbol capacity at table creation time** to avoid performance issues.

### Timestamps

- **All timestamps in QuestDB are stored in UTC** at **Microsecond resolution**: Even if you can ingest data sending timestamps in nanoseconds, nanosecond precision is not retained.
- The **`TIMESTAMP`** type is recommended over **`DATETIME`**, unless you have checked the data types reference and you know what you are doing.
- **At query time, you can apply a time zone conversion for display purposes**.

### Strings vs. varchar

- Avoid **[`STRING`](/docs/reference/sql/datatypes/#varchar-and-string-considerations)**: It is a legacy data type.
- Use **`VARCHAR`** instead for general string storage.

### UUIDs

- QuestDB has a dedicated **[`UUID`](/blog/uuid-coordination-free-unique-keys/)** type, which is more efficient than storing UUIDs as `VARCHAR`.

### Other data types

- **Booleans**: `true`/`false` values are supported.
- **Bytes**: `BYTES` type allows storing raw binary data.
- **IPv4**: QuestDB has a dedicated `IPv4` type for optimized IP storage and filtering.
- **Several [numeric datatypes](/docs/reference/sql/datatypes)** are supported.
- **Geo**: QuestDB provides [spatial support via geohashes](/docs/concept/geohashes/).

## Referential integrity, constraints, and deduplication

- QuestDB **does not enforce** `PRIMARY KEYS`, `FOREIGN KEYS`, or **`NOT NULL`** constraints.
- **Joins between tables work even without referential integrity**, as long as the data types on the [join condition](/docs/reference/sql/join/) are compatible.
- **[Duplicate data](/docs/concept/deduplication/) is allowed by default**, but `UPSERT KEYS` can be defined to **ensure uniqueness**.
- **Deduplication in QuestDB happens on an exact timestamp and optionally a set of other columns (`UPSERT KEYS`)**.
- **Deduplication has no noticeable performance penalty**.

## Retention strategies with TTL and materialized views

Since **individual row deletions are not supported**, data retention is managed via:

- **Setting a [TTL retention](/docs/concept/ttl) period** per table to control partition expiration.
- **Materialized views**: QuestDB **automatically refreshes** [materialized views](/reference/sql/create-mat-view/), storing aggregated data at lower granularity. You can also apply TTL expiration on the base table.

## Schema decisions that cannot be easily changed

Some table properties **cannot be modified after creation**, including:

- **The designated timestamp** (cannot be altered once set).
- **Partitioning strategy** (cannot be changed later).
- **Symbol capacity** (must be defined upfront, otherwise defaults apply).

For changes, the typical workaround is:

1. Create a **new column** with the updated configuration.
2. [Copy data](/reference/sql/update/) from the old column into the new one.
3. Drop the old column and rename the new one.
4. **If changes affect table-wide properties** (e.g., partitioning, timestamp column, or WAL settings), create a new table with the required properties, [insert data from the old table](/reference/sql/insert/#inserting-query-results), drop the old table, and rename the new table.

## Examples of schema translations from other databases

```questdb-sql title="Create sample table with deduplication/upsert for PostgreSQL
-- PostgreSQL
CREATE TABLE metrics (
    timestamp TIMESTAMP PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    unit VARCHAR(50),
    id UUID PRIMARY KEY,
    value DOUBLE PRECISION NOT NULL
);
CREATE INDEX ON metrics (name, timestamp);

-- UPSERT behavior in PostgreSQL
INSERT INTO metrics (timestamp, name, description, unit, id, value)
VALUES (...)
ON CONFLICT (timestamp, name) DO UPDATE
SET description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    value = EXCLUDED.value;
```

```questdb-sql title="Create sample table with deduplication/upsert for Timescale
-- Timescale
CREATE TABLE metrics (
    timestamp TIMESTAMPTZ NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    unit VARCHAR(50),
    id UUID PRIMARY KEY,
    value DOUBLE PRECISION NOT NULL
);
SELECT create_hypertable('metrics', 'timestamp');
CREATE INDEX ON metrics (name, timestamp);

-- UPSERT behavior in Timescale
INSERT INTO metrics (timestamp, name, description, unit, id, value)
VALUES (...)
ON CONFLICT (timestamp, name) DO UPDATE
SET description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    value = EXCLUDED.value;
```

```questdb-sql title="Create sample table with deduplication/upsert for DuckDB"
-- DuckDB
CREATE TABLE metrics (
    timestamp TIMESTAMP NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    unit VARCHAR(50),
    id UUID PRIMARY KEY,
    value DOUBLE NOT NULL
);

CREATE INDEX ON metrics (name, timestamp);

-- UPSERT behavior in DuckDB
INSERT INTO metrics (timestamp, name, description, unit, id, value)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (timestamp, name) DO UPDATE
SET description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    value = EXCLUDED.value;
```

```questdb-sql title="Create sample table with eventual upserts for ClickHouse"
-- ClickHouse
CREATE TABLE metrics (
    timestamp DateTime,
    name String,
    description String,
    unit String,
    id UUID,
    value Float64
) ENGINE = ReplacingMergeTree
ORDER BY (name, timestamp);
```

```questdb-sql title="Create sample measure (table) for InfluxDB"
-- InfluxDB measurement
measurement: metrics
name (tag)
description (tag)
unit (tag)
id (tag)
value (field)
```

```questdb-sql title="Create sample table with deduplication/upsert for QuestDB"
-- QuestDB equivalent
CREATE TABLE metrics (
    timestamp TIMESTAMP,      -- Explicit timestamp for time-series queries
    name SYMBOL CAPACITY 50000,  -- Optimized for high-cardinality categorical values
    description VARCHAR,      -- Free-text description, not ideal for SYMBOL indexing
    unit SYMBOL CAPACITY 256, -- Limited set of unit types, efficient as SYMBOL
    id UUID,                  -- UUID optimized for unique identifiers
    value DOUBLE              -- Numeric measurement field
) TIMESTAMP(timestamp)
PARTITION BY DAY WAL
DEDUP UPSERT KEYS(timestamp, name);
```
