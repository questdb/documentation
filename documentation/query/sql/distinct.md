---
title: DISTINCT keyword
sidebar_label: DISTINCT
description: DISTINCT SQL keyword reference documentation.
---

`SELECT DISTINCT` is used to return only distinct (i.e different) values from a
column as part of a [SELECT statement](/docs/query/sql/select/).

## Syntax

```questdb-sql
SELECT DISTINCT columnName [, columnName ...]
FROM tableName;
```

## Examples

The following query returns every unique symbol traded in the last hour.

```questdb-sql demo title="Distinct symbols"
SELECT DISTINCT symbol
FROM fx_trades
WHERE timestamp IN '$now - 1h..$now';
```

`SELECT DISTINCT` can be used with aggregation functions and filters.

```questdb-sql demo title="With aggregate"
SELECT DISTINCT symbol, count()
FROM fx_trades
WHERE timestamp IN '$today';
```

```questdb-sql demo title="With filter"
SELECT DISTINCT symbol, side, count()
FROM fx_trades
WHERE timestamp IN '$today'
  AND price > 1;
```
