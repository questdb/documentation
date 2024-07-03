---
title: ALTER TABLE SQUASH PARTITIONS
sidebar_label: SQUASH PARTITIONS
description: ALTER TABLE SQUASH PARTITIONS SQL keyword reference documentation.
---

Merges partition parts back into the physical partition.

This SQL keyword is designed to use for downgrading QuestDB to a version earlier
than 7.2, when
[partition split](/docs/concept/partitions/#splitting-and-squashing-time-partitions)
is introduced. Squashing partition parts makes the database compatible with
earlier QuestDB versions.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/img/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SQUASH PARTITIONS keyword](/img/docs/diagrams/alterTableSquashPartitions.svg)

## Examples

The SQL keyword [SHOW PARTITIONS](/docs/reference/sql/show/) can be used to
display partition split details.

For example, Let's consider the following table `x` containing split partitions:

```
SHOW PARTITIONS FROM x;
```

| index | partitionBy | name                     | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ------------------------ | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04               | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05               | 2023-02-05T00:00:00.000000Z | 2023-02-05T20:59:59.880000Z | 1259999 | 65388544 | 62.4 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 2     | DAY         | 2023-02-05T205959-880001 | 2023-02-05T20:59:59.940000Z | 2023-02-05T21:59:59.940000Z | 60002   | 83886080 | 80.0 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |

The table is partition by day and there are two partitions for `2023-02-05` as a
result of partition split.

To merge the two partitions:

```questdb-sql
ALTER TABLE x SQUASH PARTITIONS;

SHOW PARTITIONS FROM x;
```

| index | partitionBy | name       | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ---------- | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04 | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05 | 2023-02-05T00:00:00.000000Z | 2023-02-05T21:59:59.940000Z | 1320001 | 65388544 | 62.4 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |
