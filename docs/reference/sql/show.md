---
title: SHOW keyword
sidebar_label: SHOW
description: SHOW SQL keyword reference documentation.
---

This keyword provides table, column, and partition information including
metadata. The `SHOW` keyword is useful for checking the
[designated timestamp setting](/docs/concept/designated-timestamp/) column, the
[partition attachment settings](/docs/reference/sql/alter-table-attach-partition/),
and partition storage size on disk.

## Syntax

![Flow chart showing the syntax of the SHOW keyword](/img/docs/diagrams/show.svg)

- `SHOW` returns all the tables.
- `SHOW COLUMNS` returns all the columns and their metadata for the selected
  table.
- `SHOW PARTITIONS` returns the partition information for the selected table.

## Examples

### Show tables

```questdb-sql
SHOW TABLES;
```

| table    |
| -------- |
| weather  |
| my_table |
| ...      |

### Show columns

```questdb-sql
SHOW COLUMNS FROM my_table;
```

| column | type      | indexed | indexBlockCapacity | symbolCached | symbolCapacity | designated |
| ------ | --------- | ------- | ------------------ | ------------ | -------------- | ---------- |
| symb   | SYMBOL    | true    | 1048576            | false        | 256            | false      |
| price  | DOUBLE    | false   | 0                  | false        | 0              | false      |
| ts     | TIMESTAMP | false   | 0                  | false        | 0              | true       |
| s      | STRING    | false   | 0                  | false        | 0              | false      |

### Show partitions

```questdb-sql
SHOW PARTITIONS FROM my_table;
```

| index | partitionBy | name       | minTimestamp          | maxTimestamp          | numRows | diskSize | diskSizeHuman | readOnly | active | attached | detached | attachable |
|-------|-------------|------------|-----------------------|-----------------------| ------- |----------|---------------|----------|--------|----------|----------|------------|
| 0     | WEEK        | 2022-W52   | 2023-01-01 00:36:00.0 | 2023-01-01 23:24:00.0 | 39      | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 1     | WEEK        | 2023-W01   | 2023-01-02 00:00:00.0 | 2023-01-08 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 2     | WEEK        | 2023-W02   | 2023-01-09 00:00:00.0 | 2023-01-15 23:24:00.0 | 280     | 98304    | 96.0 KiB      | false    | false  | true     | false    | false      |
| 3     | WEEK        | 2023-W03   | 2023-01-16 00:00:00.0 | 2023-01-18 12:00:00.0 | 101     | 83902464 | 80.0 MiB      | false    | true   | true     | false    | false      |

## See also

The following functions allow querying tables with filters and using the results as part of a function:

- [table_columns()](/docs/reference/function/meta/#table_columns)
- [tables()](/docs/reference/function/meta/#all_tables)
- [table_partitions()](/docs/reference/function/meta/#table_partitions)