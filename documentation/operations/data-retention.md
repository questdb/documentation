---
title: Data retention
description: How to employ a data retention strategy to delete old data and save disk space
---

## Background

The nature of [time-series data](/blog/what-is-time-series-data/) is that the relevance of information diminishes
over time. If stale data is no longer required, users can delete old data from
QuestDB to either save disk space or adhere to a data retention policy. This is
achieved in QuestDB by removing data partitions from a table.

QuestDB offers two approaches for data retention:

- **Automatic**: Use [Time To Live (TTL)](/docs/concepts/ttl/) to automatically
  drop partitions when data ages beyond a specified threshold. This is the
  simplest approach for most use cases.
- **Manual**: Use `DROP PARTITION` commands as described on this page for
  explicit control over which partitions to remove and when.

This page provides a high-level overview of partitioning with examples to drop
data by date. For more details on partitioning, see the
[partitioning](/docs/concepts/partitions/) page.

## Manual partition management

This section covers the manual approach to removing stale data by dropping
partitions. A table must have a
[designated timestamp](/docs/concepts/designated-timestamp/) assigned and a
partitioning strategy specified during a `CREATE TABLE` operation to achieve
this.

:::note

Users cannot alter the partitioning strategy after a table is created.

:::

Tables can be partitioned by one of the following:

- `YEAR`
- `MONTH`
- `WEEK`
- `DAY`
- `HOUR`

```questdb-sql title="Creating a table and partitioning by DAY"
CREATE TABLE my_table(ts TIMESTAMP, symb SYMBOL, price DOUBLE) timestamp(ts)
PARTITION BY DAY;
```

### Dropping partitions

:::caution

Use `DROP PARTITION` with care, as QuestDB **cannot recover data from dropped
partitions**.

:::

To drop partitions, users can use the
[ALTER TABLE DROP PARTITION](/docs/query/sql/alter-table-drop-partition/)
syntax. Partitions may be dropped by:

- `DROP PARTITION LIST` - specifying a comma-separated list of partitions to
  drop

  ```questdb-sql
  --Delete a partition
  ALTER TABLE my_table DROP PARTITION LIST '2021-01-01';

  --Delete a list of two partitions
  ALTER TABLE my_table DROP PARTITION LIST '2021-01-01', '2021-01-02';
  ```

- `WHERE timestamp =` - exact date matching by timestamp

  ```questdb-sql
  ALTER TABLE my_table DROP PARTITION
  WHERE timestamp = to_timestamp('2021-01-01', 'yyyy-MM-dd');
  ```

- `WHERE timestamp <` - using comparison operators (`<` / `>`) to delete by time
  range relative to a timestamp. Note that the `now()` function may be used to
  automate dropping of partitions relative to the current time, i.e.:

  ```questdb-sql
  --Drop partitions older than 30 days
  ALTER TABLE my_table DROP PARTITION
  WHERE timestamp < dateadd('d', -30, now());
  ```

**Usage notes:**

- The most chronologically recent partition cannot be deleted
- Arbitrary partitions may be dropped, which means they may not be the oldest
  chronologically. Depending on the types of queries users are performing on a
  dataset, it may not be desirable to have gaps caused by dropped partitions.
- Unlike TTL, `DROP PARTITION` commands must be triggered manually or via
  external scheduling (e.g., cron jobs). For fully automated retention, consider
  using [TTL](/docs/concepts/ttl/) instead.

### Example

The following example demonstrates how to create a table with partitioning and
to drop partitions based on time. This example produces 5 days' worth of data
with one incrementing `LONG` value inserted per hour.

```questdb-sql title="Create a partitioned table and generate data"
CREATE TABLE my_table (timestamp TIMESTAMP, x LONG) timestamp(timestamp)
PARTITION BY DAY;

INSERT INTO my_table
SELECT timestamp_sequence(
    to_timestamp('2021-01-01T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),100000L * 36000), x
FROM long_sequence(120);
```

For reference, the following functions are used to generate the example data:

- [timestamp sequence](/docs/query/functions/timestamp-generator/#timestamp_sequence)
  with 1 hour stepping
- [row generator](/docs/query/functions/row-generator/#long_sequence) with
  `long_sequence()` function which creates a `x:long` column

The result of partitioning is visible when listing as directories on disk:

```bash title="path/to/<QuestDB-root>/db"
my_table
├── 2021-01-01
├── 2021-01-02
├── 2021-01-03
├── 2021-01-04
└── 2021-01-05
```

Partitions can be dropped using the following query:

```
--Delete days before 2021-01-03
ALTER TABLE my_table DROP PARTITION
WHERE timestamp < to_timestamp('2021-01-03', 'yyyy-MM-dd');
```
