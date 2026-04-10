---
title: ALTER TABLE DROP PARTITION
sidebar_label: DROP PARTITION
description: DROP PARTITION SQL keyword reference documentation.
---

Drops one or more partitions from an existing table.

Similar to dropping columns, dropping of partitions is a non-blocking and
non-waiting operation. While atomic for single partitions, dropping multiple
partitions is in itself non-atomic. The operation will exit on the first failure
and will not continue through a list of partitions if one fails to be dropped.

:::caution

Use `DROP PARTITION` with care, as QuestDB **cannot recover data from dropped
partitions**! [Backup your database](/docs/operations/backup/) to avoid
unintended data loss.

:::

## Syntax

```questdb-sql title="By partition name list"
ALTER TABLE tableName DROP PARTITION LIST partitionName [, partitionName ...];
```

```questdb-sql title="By WHERE clause on the designated timestamp"
ALTER TABLE tableName DROP PARTITION WHERE booleanExpression;
```

## Drop partition by name

The partition name must match the name of the directory for the given partition.
The naming convention is detailed in [Partitions](/docs/concepts/partitions/).

### Examples

```questdb-sql title="Drop a single partition"
--DAY
ALTER TABLE trades DROP PARTITION LIST '2019-05-18';
--MONTH
ALTER TABLE trades DROP PARTITION LIST '2019-05';
--YEAR
ALTER TABLE trades DROP PARTITION LIST '2019';
```

```questdb-sql title="Drop multiple partitions"
ALTER TABLE trades DROP PARTITION LIST '2018','2019';
```

## Drop partitions using boolean expression

Drops partitions based on a boolean expression on the designated timestamp
column.

### Examples

```questdb-sql title="Drop one partition"
ALTER TABLE trades
DROP PARTITION
WHERE timestamp = to_timestamp('2019-01-01:00:00:00', 'yyyy-MM-dd:HH:mm:ss');
```

```questdb-sql title="Drop all partitions older than 2018"
ALTER TABLE trades
DROP PARTITION
WHERE timestamp < to_timestamp('2018-01-01:00:00:00', 'yyyy-MM-dd:HH:mm:ss');
```
