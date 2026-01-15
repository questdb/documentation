---
title: Designated timestamp
sidebar_label: Designated timestamp
description:
  Why every QuestDB table should have a designated timestamp and how to set one.
---

Every table in QuestDB should have a designated timestamp. This column defines
the time axis for your data and unlocks QuestDB's core time-series capabilities
including partitioning, time-series joins, and optimized interval scans.

Without a designated timestamp, a table behaves like a generic append-only
store - you lose partitioning, efficient time-range queries, and most
time-series SQL features.

## Why it matters

The designated timestamp is not just metadata - it determines how QuestDB
physically organizes and queries your data. These features require it:

- [Partitioning](/docs/concepts/partitions/)
- [Time-series joins](/docs/query/sql/join/) (ASOF, LT, SPLICE)
- [Interval scan](/docs/concepts/deep-dive/interval-scan/) optimization
- [SAMPLE BY](/docs/query/sql/sample-by/) queries
- [LATEST ON](/docs/query/sql/latest-on/) optimization
- [TTL](/docs/concepts/ttl/)
- [Deduplication](/docs/concepts/deduplication/)
- [Replication](/docs/high-availability/setup/)

If your data has a time dimension - and for time-series workloads it always
does - define a designated timestamp.

:::note

Static lookup or reference tables with no time dimension are the exception.
These can be created without a designated timestamp.

:::

## How to set it

Use the [`timestamp(columnName)`](/docs/query/functions/timestamp/) function
at table creation:

```questdb-sql
CREATE TABLE trades (
    ts TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    amount DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;
```

If you have multiple timestamp columns, designate the one you'll filter and
aggregate by most often.

Other ways to set a designated timestamp:

- On query results: see [SELECT](/docs/query/sql/select/#timestamp)
  (`dynamic timestamp`)
- Via InfluxDB Line Protocol: tables created automatically include a `timestamp`
  column as the designated timestamp, partitioned by day by default

For full CREATE TABLE syntax, see the
[reference documentation](/docs/query/sql/create-table/#designated-timestamp).

## Properties

- Only a column of type `timestamp` or `timestamp_ns` can be elected as a designated timestamp.
- Only one column can be elected for a given table.

## Resolution

QuestDB supports two timestamp resolutions:

| Type | Resolution | Precision | Use case |
|------|------------|-----------|----------|
| `timestamp` | microseconds | 10⁻⁶ s | Most applications |
| `timestamp_ns` | nanoseconds | 10⁻⁹ s | High-frequency trading, scientific data |

Use `timestamp` unless you need nanosecond precision. Both types work identically
with all time-series features.

For more on working with timestamps, see
[Timestamps and time zones](/docs/concepts/timestamps-timezones/).

## Checking designated timestamp settings

The [meta functions](/docs/query/functions/meta/) `tables()` and
`table_columns()` show the designated timestamp settings for a table.

## FAQ

**What if my data arrives out of order?**

QuestDB handles out-of-order data automatically during ingestion. No special
configuration is required.

**Can I change the designated timestamp later?**

No. The designated timestamp is set at table creation and cannot be changed.
To use a different column, create a new table and migrate your data.

**Can I add a designated timestamp to an existing table?**

No. You must define the designated timestamp when creating the table. If you
have an existing table without one, create a new table with the designated
timestamp and use `INSERT INTO ... SELECT` to migrate your data.

**Can the designated timestamp contain NULL values?**

No. The designated timestamp column cannot contain NULL values. Every row must
have a valid timestamp.