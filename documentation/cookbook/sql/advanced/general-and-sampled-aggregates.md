---
title: General and Sampled Aggregates
sidebar_label: General + sampled aggregates
description: Combine overall statistics with time-bucketed aggregates using CROSS JOIN
---

Combine overall (unsampled) aggregates with sampled aggregates in the same query.

## Problem

You have a query with three aggregates:

```questdb-sql demo title="Max and Min"
SELECT max(price), avg(price), min(price)
FROM trades
WHERE timestamp IN '2024-12-08';
```

This returns:
```
| max(price) | avg(price)         | min(price)  |
| ---------- | ------------------ | ----------- |
| 101464.2   | 15816.513123255792 | 0.000031204 |
```

And another query to get event count per second, then select the maximum:

```questdb-sql demo title="Sample by 1m and get the top result"
SELECT max(count_sec) FROM (
  SELECT count() as count_sec FROM trades
  WHERE timestamp IN '2024-12-08'
  SAMPLE BY 1s
);
```

This returns:
```
| max(count_sec) |
| -------------- |
| 4473           |
```

You want to combine both results in a single row:

```
| max(count_sec) | max(price) | avg(price)         | min(price)  |
| -------------- | ---------- | ------------------ | ----------- |
| 4473           | 101464.2   | 15816.513123255792 | 0.000031204 |
```

## Solution: CROSS JOIN

A `CROSS JOIN` can join every row from the first query (1 row) with every row from the second (1 row), so you get a single row with all the aggregates combined:

```questdb-sql demo title="Combine general and sampled aggregates"
WITH
max_min AS (
SELECT max(price), avg(price), min(price)
FROM trades WHERE timestamp IN '2024-12-08'
)
SELECT max(count_sec), max_min.* FROM (
  SELECT count() as count_sec FROM trades
  WHERE timestamp IN '2024-12-08'
  SAMPLE BY 1s
) CROSS JOIN max_min;
```


:::info Related Documentation
- [CROSS JOIN](/docs/query/sql/join/#cross-join)
- [SAMPLE BY](/docs/query/sql/sample-by/)
:::
