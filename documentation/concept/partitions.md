---
title: Time Partitions
sidebar_label: Partitions
description:
  Overview of QuestDB's partition system for time-series. This is an important
  feature that will help you craft more efficient queries.
---

[Database partitioning](/glossary/database-partitioning/) is the technique that
splits data in a large database into smaller chunks in order to improve the
performance and scalability of the database system.

QuestDB offers the option to partition tables by intervals of time. Data for
each interval is stored in separate sets of files.

import Screenshot from "@theme/Screenshot"

<Screenshot
  alt="Diagram of data column files and how they are partitioned to form a table"
  height={373}
  src="images/docs/concepts/partitionModel.webp"
  width={700}
  forceTheme="dark"
/>

## Properties

- Partitioning is only possible on tables with a
  [designated timestamp](/docs/concept/designated-timestamp/).
- Available partition intervals are `NONE`, `YEAR`, `MONTH`, `WEEK`, `DAY`, and
  `HOUR`.
- Default behavior is`PARTITION BY NONE` when using
  [CREATE TABLE](/docs/reference/sql/create-table/).
- Default behavior is `PARTITION BY DAY` via
  [InfluxDB Line Protocol ingestion](/docs/reference/api/ilp/overview/). This is
  set by `line.default.partition.by`.
- Partitions are defined at table creation. For more information, refer to the
  [CREATE TABLE section](/docs/reference/sql/create-table/).
- The naming convention for partition directories is as follows:

| Table Partition | Partition format |
| --------------- | ---------------- |
| `HOUR`          | `YYYY-MM-DD-HH`  |
| `DAY`           | `YYYY-MM-DD`     |
| `WEEK`          | `YYYY-Www`       |
| `MONTH`         | `YYYY-MM`        |
| `YEAR`          | `YYYY`           |

## Advantages of adding time partitions

We recommend partitioning tables to benefit from the following advantages:

- Reducing disk IO for timestamp interval searches. This is because our SQL
  optimizer leverages partitioning.
- Significantly improving calculations and seek times. This is achieved by
  leveraging the chronology and relative immutability of data for previous
  partitions.
- Separating data files physically. This makes it easy to implement file
  retention policies or extract certain intervals.
- Enables out-of-order indexing. From QuestDB 7.2, heavily out-of-order commits
  can [split the partitions](#splitting-and-squashing-time-partitions) into
  parts to reduce
  [write amplification](/docs/operations/capacity-planning/#write-amplification).

## Checking time partition information

The following SQL keyword and function are implemented to present the partition
information of a table:

- The SQL keyword [SHOW PARTITIONS](/docs/reference/sql/show/#show-partitions)
  returns general partition information for the selected table.
- The function [table_partitions('tableName')](/docs/reference/function/meta/)
  returns the same information as `SHOW PARTITIONS` and can be used in a
  `SELECT` statement to support more complicated queries such as `WHERE`,
  `JOIN`, and `UNION`.

## Splitting and squashing time partitions

From QuestDB 7.2, heavily out-of-order commits can split the partitions into
parts to reduce write amplification. When data is merged into an existing
partition as a result of an out-of-order insert, the partition will be split
into two parts: the prefix sub-partition and the suffix sub-partition.

A partition split happens when both of the following are true:

- The prefix size is bigger than the combination of the suffix and the rows to
  be merged.
- The estimated prefix size on disk is higher than
  `cairo.o3.partition.split.min.size` (50MB by default).

Partition split is iterative and therefore a partition can be split into more
than two parts after several commits. To control the number of parts QuestDB
squashes them together following the following principles:

- For the last (yearly, ..., hourly) partition, its parts are squashed together
  when the number of parts exceeds `cairo.o3.last.partition.max.splits` (20 by
  default).
- For all the partitions except the last one, the QuestDB engine squashes them
  aggressively to maintain only one physical partition at the end of every
  commit.

All partition operations (ALTER TABLE
[ATTACH](/docs/reference/sql/alter-table-attach-partition/)/
[DETACH](/docs/reference/sql/alter-table-detach-partition/)/
[DROP](/docs/reference/sql/alter-table-drop-partition/) PARTITION) do not
consider partition splits as individual partitions and work on the table
partitioning unit (year, week, ..., hour).

For example, when a daily partition consisting of several parts is dropped, all
the parts belonging to the given date are dropped. Similarly, when the multipart
daily partition is detached, it is squashed into a single piece first and then
detached.

### Examples

For example, Let's consider the following table `x`:

```questdb-sql
CREATE TABLE x AS (
  SELECT
    cast(x as int) i,
    - x j,
    rnd_str(5, 16, 2) as str,
    timestamp_sequence('2023-02-04T00', 60 * 1000L) ts
  FROM
    long_sequence(60 * 23 * 2 * 1000)
) timestamp (ts) PARTITION BY DAY WAL;
```

```questdb-sql
SHOW PARTITIONS FROM x;
```

| index | partitionBy | name       | minTimestamp                | maxTimestamp                | numRows | diskSize  | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ---------- | --------------------------- | --------------------------- | ------- | --------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04 | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136  | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05 | 2023-02-05T00:00:00.000000Z | 2023-02-05T21:59:59.940000Z | 1320000 | 100663296 | 96.0 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |

Inserting an out-of-order row:

```questdb-sql
INSERT INTO
  x(ts)
VALUES
  ('2023-02-05T21');


SHOW PARTITIONS FROM x;
```

| index | partitionBy | name                     | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ------------------------ | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04               | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05               | 2023-02-05T00:00:00.000000Z | 2023-02-05T20:59:59.880000Z | 1259999 | 65388544 | 62.4 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 2     | DAY         | 2023-02-05T205959-880001 | 2023-02-05T20:59:59.940000Z | 2023-02-05T21:59:59.940000Z | 60002   | 83886080 | 80.0 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |

To merge the new partition part back to the main partition for downgrading:

```questdb-sql
ALTER TABLE x SQUASH PARTITIONS;

SHOW PARTITIONS FROM x;
```

| index | partitionBy | name       | minTimestamp                | maxTimestamp                | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
| ----- | ----------- | ---------- | --------------------------- | --------------------------- | ------- | -------- | ------------- | -------- | ------ | -------- | -------- | ---------- |
| 0     | DAY         | 2023-02-04 | 2023-02-04T00:00:00.000000Z | 2023-02-04T23:59:59.940000Z | 1440000 | 71281136 | 68.0 MiB      | FALSE    | FALSE  | TRUE     | FALSE    | FALSE      |
| 1     | DAY         | 2023-02-05 | 2023-02-05T00:00:00.000000Z | 2023-02-05T21:59:59.940000Z | 1320001 | 65388544 | 62.4 MiB      | FALSE    | TRUE   | TRUE     | FALSE    | FALSE      |

## Storage example

Each partition effectively is a directory on the host machine corresponding to
the partitioning interval. In the example below, we assume a table `trips` that
has been partitioned using `PARTITION BY MONTH`.

```
[quest-user trips]$ dir
2017-03     2017-10   2018-05     2019-02
2017-04     2017-11   2018-06     2019-03
2017-05     2017-12   2018-07     2019-04
2017-06     2018-01   2018-08   2019-05
2017-07     2018-02   2018-09   2019-06
2017-08     2018-03   2018-10
2017-09     2018-04   2018-11
```

Each partition on the disk contains the column data files of the corresponding
timestamp interval.

```
[quest-user 2019-06]$ dir
_archive    cab_type.v              dropoff_latitude.d     ehail_fee.d
cab_type.d  congestion_surcharge.d  dropoff_location_id.d  extra.d
cab_type.k  dropoff_datetime.d      dropoff_longitude.d    fare_amount.d
```
