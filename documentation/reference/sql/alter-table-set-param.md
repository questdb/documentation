---
title: ALTER TABLE SET PARAM
sidebar_label: SET PARAM
description: SET PARAM SQL keyword reference documentation.
---

`ALTER TABLE SET PARAM` sets table parameters via SQL.

:::note

- Checking table metadata can be done via the `tables()` and `table_columns()`
  functions, as described in the
  [meta functions](/docs/reference/function/meta/) documentation page.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE SET PARA keywords](/images/docs/diagrams/alterTableSetParam.svg)

`maxUncommittedRows` - defines the maximum number of uncommitted rows per-table
to keep in memory before triggering a commit for a specific table.

The purpose of specifying maximum uncommitted rows per table is to reduce the
occurrences of resource-intensive commits when ingesting out-of-order data.

The global setting for the same parameter is `cairo.max.uncommitted.rows`.

## Example

The values for `maximum uncommitted rows` can be changed per each table with the
following SQL:

```questdb-sql title="Altering out-of-order parameters via SQL"
ALTER TABLE my_table SET PARAM maxUncommittedRows = 10000
```

Checking the values per-table may be done using the `tables()` function:

```questdb-sql title="List table metadata"
SELECT id, name, maxUncommittedRows FROM tables();
```

| id  | name     | maxUncommittedRows |
| --- | -------- | ------------------ |
| 1   | my_table | 10000              |

For more details on retrieving table and column information, see the
[meta functions documentation](/docs/reference/function/meta/).

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of the ALTER TABLE SET PARA with commit lag keywords](/images/docs/diagrams/alterTableSetParamCommitLag.svg)

`o3MaxLag` allows for specifying the expected maximum _lag_ of late-arriving
records when ingesting out-of-order data. The purpose of specifying a commit lag
per table is to reduce the occurrences of resource-intensive commits when
ingesting out-of-order data. Incoming records will be kept in memory until for
the duration specified in _lag_, then all records up to the boundary will be
ordered and committed.

`o3MaxLag` expects a value with a modifier to specify the unit of time for the
value:

| unit | description  |
| ---- | ------------ |
| us   | microseconds |
| s    | seconds      |
| m    | minutes      |
| h    | hours        |
| d    | days         |

To specify `o3MaxLag` value to 20 seconds:

```questdb-sql
ALTER TABLE my_table SET PARAM o3MaxLag = 20s;
```
