---
title: Misc Operators
sidebar_label: Misc
description: Misc operators
---

## `.` Prefix

The `.` operator is used to prefix columns with a table name, for example when performing joins.

#### Example

```questdb-sql
SELECT *
FROM a, b
WHERE a.id = b.id;
```

## `::` Cast

`::` performs Postgres-style casts.

We recommend the use of [`CAST`](/docs/query/sql/cast/) instead of this operator.

This operator is returned for compatibility with Postgres syntax, so not all conversions will occur as you'd expect.

For example, `5::FLOAT` will return a `DOUBLE`, not a `FLOAT`.

#### Example

```questdb-sql
SELECT 5::float, cast(5 as float)
```

| cast | cast1 |
| ---- | ----- |
| 5.0  | 5.0   |
