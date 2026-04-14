---
title: ORDER BY keyword
sidebar_label: ORDER BY
description: ORDER BY SQL keyword reference documentation.
---

Sort the results of a query in ascending or descending order.

## Syntax

```questdb-sql
SELECT ...
ORDER BY columnName [ASC | DESC] [, columnName [ASC | DESC] ...];
```

Default order is `ASC`. You can omit to order in ascending order.

## Notes

Ordering data requires holding it in RAM. For large operations, we suggest you
check you have sufficient memory to perform the operation.

## Examples

```questdb-sql title="Omitting ASC will default to ascending order" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1m..$now'
ORDER BY symbol;
```

```questdb-sql title="Ordering in descending order" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1m..$now'
ORDER BY symbol DESC;
```

```questdb-sql title="Multi-level ordering" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1m..$now'
ORDER BY symbol, side DESC;
```
