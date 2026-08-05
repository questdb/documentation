---
title: ALTER TABLE SET FORMAT
sidebar_label: SET FORMAT
description: ALTER TABLE SET FORMAT SQL keyword reference documentation.
---

Sets the storage format for a table's partitions to `NATIVE` or `PARQUET`.

## Syntax

```questdb-sql
ALTER TABLE tableName SET FORMAT { NATIVE | PARQUET };
```

## Description

`ALTER TABLE SET FORMAT` changes the storage format used for a table's
partitions:

- `NATIVE` (default): QuestDB's native column format.
- `PARQUET`: partitions are stored as [Parquet](/docs/concepts/parquet/).

The new format applies to partitions written after the statement runs.
**Existing partitions are not converted.** To convert specific existing
partitions in place, use
[in-place Parquet conversion](/docs/concepts/parquet/#in-place-conversion).

`FORMAT PARQUET` is only supported on partitioned
[WAL](/docs/concepts/write-ahead-log/) tables.

:::note

Out-of-order writes into a Parquet partition are more expensive than into a
native partition.

:::

## Examples

Store new partitions as Parquet:

```questdb-sql
ALTER TABLE trades SET FORMAT PARQUET;
```

Switch back to the native format:

```questdb-sql
ALTER TABLE trades SET FORMAT NATIVE;
```

To set the format when creating a table, see
[CREATE TABLE — Partition format](/docs/query/sql/create-table/#partition-format).
