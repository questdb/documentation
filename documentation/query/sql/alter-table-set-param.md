---
title: ALTER TABLE SET PARAM
sidebar_label: SET PARAM
description: SET PARAM SQL keyword reference documentation.
---

`ALTER TABLE SET PARAM` sets a per-table parameter via SQL. Two parameters are
supported:

- [`maxUncommittedRows`](#maxuncommittedrows) - maximum number of uncommitted
  rows kept in memory before a commit is triggered.
- [`o3MaxLag`](#o3maxlag) - maximum expected lag of late-arriving records when
  ingesting out-of-order data.

Only one parameter can be set per statement. To change both, run two
`ALTER TABLE SET PARAM` statements.

:::note

Checking table metadata can be done via the `tables()` and `table_columns()`
functions, as described in the
[meta functions](/docs/query/functions/meta/) documentation page.

:::

## Syntax

```questdb-sql title="maxUncommittedRows"
ALTER TABLE tableName SET PARAM maxUncommittedRows = n;
```

```questdb-sql title="o3MaxLag"
ALTER TABLE tableName SET PARAM o3MaxLag = n { us | s | m | h | d };
```

## maxUncommittedRows

`maxUncommittedRows` defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is `cairo.max.uncommitted.rows`.

### Example

The value can be changed per table with the following SQL:

```questdb-sql title="Altering maxUncommittedRows via SQL"
ALTER TABLE my_table SET PARAM maxUncommittedRows = 10000;
```

Checking the value per table can be done using the `tables()` function:

```questdb-sql title="List table metadata"
SELECT id, name, maxUncommittedRows FROM tables();
```

| id  | name     | maxUncommittedRows |
| --- | -------- | ------------------ |
| 1   | my_table | 10000              |

For more details on retrieving table and column information, see the
[meta functions documentation](/docs/query/functions/meta/).

## o3MaxLag

`o3MaxLag` allows specifying the expected maximum _lag_ of late-arriving
records when ingesting out-of-order data. The purpose of specifying a commit lag
per table is to reduce the occurrences of resource-intensive commits when
ingesting out-of-order data. Incoming records are kept in memory for the
duration specified in _lag_, then all records up to the boundary are ordered
and committed.

`o3MaxLag` expects a value with a modifier to specify the unit of time:

| unit | description  |
| ---- | ------------ |
| us   | microseconds |
| s    | seconds      |
| m    | minutes      |
| h    | hours        |
| d    | days         |

### Example

To set `o3MaxLag` to 20 seconds:

```questdb-sql
ALTER TABLE my_table SET PARAM o3MaxLag = 20s;
```
