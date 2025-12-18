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

- [Partitioning](/docs/concept/partitions/)
- [Time-series joins](/docs/reference/sql/join/) (ASOF, LT, SPLICE)
- [Interval scan](/docs/concept/interval-scan/) optimization
- [SAMPLE BY](/docs/reference/sql/sample-by/) queries
- [LATEST ON](/docs/reference/sql/latest-on/) optimization
- [TTL](/docs/concept/ttl/)
- [Deduplication](/docs/concept/deduplication/)
- [Replication](/docs/operations/replication/)

If your data has a time dimension - and for time-series workloads it always
does - define a designated timestamp.

:::note

Static lookup or reference tables with no time dimension are the exception.
These can be created without a designated timestamp.

:::

## How to set it

Use the [`timestamp(columnName)`](/docs/reference/function/timestamp/) function
at table creation:

```questdb-sql
CREATE TABLE readings (
    ts TIMESTAMP,
    sensor_id SYMBOL,
    value DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;
```

If you have multiple timestamp columns, designate the one you'll filter and
aggregate by most often.

Other ways to set a designated timestamp:

- On query results: see [SELECT](/docs/reference/sql/select/#timestamp)
  (`dynamic timestamp`)
- Via InfluxDB Line Protocol: tables created automatically include a `timestamp`
  column as the designated timestamp, partitioned by day by default

For full CREATE TABLE syntax, see the
[reference documentation](/docs/reference/sql/create-table/#designated-timestamp).

## Properties

- Only a column of type `timestamp` or `timestamp_ns` can be elected as a designated timestamp.
- Only one column can be elected for a given table.

:::note

There are two timestamp resolutions available: microseconds and nanoseconds. See
[Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
for details.

:::

## Checking designated timestamp settings

The [meta functions](/docs/reference/function/meta/) `tables()` and
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