---
title: Schema Design Essentials
slug: schema-design-essentials
description:
  Learn how to design efficient schemas in QuestDB. This guide covers best practices for partitioning, indexing, symbols, timestamps, deduplication, retention strategies, and schema modifications to optimize performance in time-series workloads.
---

# Schema Design in QuestDB

This guide covers key concepts and best practices to take full advantage of QuestDB’s performance-oriented architecture, highlighting some important differences with most databases.

## QuestDB’s Single Database Model

QuestDB has a **single database per instance**. Unlike PostgreSQL and other database engines, where you may have multiple databases or multiple schemas within an instance, in QuestDB, you operate within a single namespace. The default database is named `qdb`, and this can be changed via configuration. However, there is no need to issue `USE DATABASE` commands—once connected, you can immediately start querying and inserting data.

### Multi-Tenancy Considerations

If you need **multi-tenancy**, you will need to manage table names manually, often by using **prefixes** for different datasets. Since QuestDB does not support multiple schemas, this is the primary way to segment data. In QuestDB Enterprise, you can enforce permissions per table to restrict access, allowing finer control over multi-tenant environments.

## PostgreSQL Protocol Compatibility

QuestDB is **not** a PostgreSQL database but is **compatible with the PostgreSQL wire protocol**. This means you can connect using PostgreSQL-compatible libraries and clients and execute SQL commands. However, compatibility with PostgreSQL system catalogs, metadata queries, data types,
and functions is limited.

While most PostgreSQL compatible low-level libraries will work with
QuestDB, some higher level components depending heavily on PostgreSQL metadata might fail. If you find one of such use cases, please do report it as an [issue on GitHub](https://github.com/questdb/questdb/issues) so we can track it.

## Creating a Schema in QuestDB

### Recommended Approach

The easiest way to create a schema is through the **web interface** or by sending SQL commands using:

- The **REST API** (`CREATE TABLE` statements)
- The **PostgreSQL wire protocol clients**

### Schema Auto-Creation with ILP Protocol

When using the **Influx Line Protocol (ILP)**, QuestDB can automatically create tables and columns based on incoming data. This is useful for users migrating from InfluxDB or using tools like **InfluxDB client libraries or Telegraf**, as they can send data directly to QuestDB without pre-defining schemas. However, this comes with limitations:

- Auto-created tables and columns **use default settings** (e.g., default partitioning, symbol capacity, and data types).
- **You cannot easily modify partitioning or symbol capacity later**, so it is recommended to explicitly create tables beforehand.
- Auto-creation can be disabled via configuration.

## The Designated Timestamp and Partitioning Strategy

QuestDB is designed for the use case of time-series. Everything on the database engine is optimized to perform exceptionally well for time-series queries. One of the most important optimizations in QuestDB is that data is physically stored ordered by incremental timestamp. It is the responsibility of the user, at table creation time, to decide which timestamp column will be the **designatd timestamp**.

The **designated timestamp** is one of the **most important decision** when creating a table in QuestDB. It determines:

- **Partitioning strategy** (per hour, per day, per week, per month, or per year).
- **Physical data storage order**, as data is always stored **sorted by the designated timestamp**.
- **Query efficiency**, as QuestDB **prunes partitions** based on the timestamp range in your query, reducing disk I/O.
- **Insertion performance**, since data that arrives **out of order** may require rewriting partitions, slowing down ingestion.

### Partitioning Guidelines

When choosing the partition resolution for your tables, keep in mind which is the typical time-ranges that you will be querying most frequently, and consider the following:

- **Avoid very large partitions**: A partition should be at most **a few gigabytes**.
- **Avoid too many small partitions**: Querying more partitions means opening more files.
- **Query efficiency**: When filtering data, QuestDB prunes partitions, but querying many partitions results in more disk operations. If most of your queries span a monthly range, weekly or daily partitioning sounds sensible, but hourly partitioning might slow down your queries.
- **Data ingestion performance**: If data arrives out of order, QuestDB rewrites the active partition, impacting performance.

## Columnar Storage Model and Table Density

QuestDB is **columnar**, meaning:

- **Columns are stored separately**, allowing fast queries on specific columns without loading unnecessary data.
- **Each column is stored in one or two files per partition**: The more columns you include at any part of a `SELECT` and the most partitions the query spans, the more files will need to be open and cached into the working memory.

### Sparse vs. Dense Tables

- **QuestDB handles wide tables efficiently** due to its columnar architecture, as it will open only the column files referenced at each query.
- **Null values take storage space**, so it is recommended to avoid sparse tables where possible.
- **Dense tables** (where most columns have values) are more efficient in terms of storage and query performance. If you cannot design a dense table, you might want to create different tables for each different record structure.

## Data Types and Best Practices

### Symbols (Recommended for Categorical Data)

QuestDB introduces a specialized `Symbol` data type. Symbols are **dictionary-encoded** and optimized for filtering and grouping:

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

### Strings vs. VARCHAR

- Avoid **`STRING`**: It is a legacy data type.
- Use **`VARCHAR`** instead for general string storage.

### UUIDs

- QuestDB has a dedicated **`UUID`** type, which is more efficient than storing UUIDs as `VARCHAR`.

### Other Data Types

- **Booleans**: `true`/`false` values are supported).
- **Bytes**: `BYTES` type allows storing raw binary data.
- **IPv4**" QuestDB has a dedicated `IPv4` type for optimized IP storage and filtering.
- **Several numeric datatypes** are supported.
- **Geo**: QuestDB provides spatial support via geohashes.

## Referential Integrity, Constraints, and Deduplication

- QuestDB **does not enforce** `primary keys`, `foreign keys`, or **`NOT NULL`** constraints.
- **Joins between tables work even without referential integrity**, as long as the data types on the join condition are compatible.
- **Duplicate data is allowed by default**, but `UPSERT` keys can be defined to **ensure uniqueness**.
- **Deduplication in QuestDB happens on an exact timestamp and optionally a set of other columns (`UPSERT KEYS`)**.
- **Deduplication has no noticeable performance penalty**.


## Retention Strategies with TTL and Materialized Views

Since **individual row deletions are not supported**, data retention is managed via:

- **Partition expiration**: Define a **TTL (Time-To-Live)** retention period per table.
- **Materialized Views**: QuestDB allows creating **auto-refreshing materialized views** to store aggregated data at lower granularity while applying optional expiration via TTL on the base table. Materialized Views can also define a TTL for their data.

## Schema Decisions That Cannot Be Easily Changed

Some table properties **cannot be modified after creation**, including:

- **The designated timestamp** (cannot be altered once set).
- **Partitioning strategy** (cannot be changed later).
- **Symbol capacity** (must be defined upfront, otherwise defaults apply).

For changes, the typical workaround is:

1. Create a **new column** with the updated configuration.
2. Copy data from the old column into the new one.
3. Drop the old column and rename the new one.
4. **If changes affect table-wide properties** (e.g., partitioning, timestamp column, or WAL settings), create a new table with the required properties, insert data from the old table, drop the old table, and rename the new table.

## Examples of Schema Translations from Other Databases

```sql
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

```sql
-- TimescaleDB
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

-- UPSERT behavior in TimescaleDB
INSERT INTO metrics (timestamp, name, description, unit, id, value)
VALUES (...)
ON CONFLICT (timestamp, name) DO UPDATE
SET description = EXCLUDED.description,
    unit = EXCLUDED.unit,
    value = EXCLUDED.value;
```

```sql
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
```

```sql
-- ClickHouse
CREATE TABLE metrics (
    timestamp DateTime,
    name String,
    description String,
    unit String,
    id UUID,
    value Float64
) ENGINE = MergeTree()
ORDER BY (name, timestamp);

-- InfluxDB Measurement
measurement: metrics
name (tag)
description (tag)
unit (tag)
id (tag)
value (field)
```

```questdb-sql
-- QuestDB Equivalent
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



