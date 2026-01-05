---
title: GROUP BY keyword
sidebar_label: GROUP BY
description: GROUP BY SQL keyword reference documentation.
---

Groups aggregation calculations by one or several keys. In QuestDB, this clause
is [optional](/docs/concepts/deep-dive/sql-extensions/#group-by-is-optional).

## Syntax

![Flow chart showing the syntax of the GROUP BY keyword](/images/docs/diagrams/groupBy.svg)

:::note

QuestDB groups aggregation results implicitly and does not require the GROUP BY
keyword. It is only supported for convenience. Using the GROUP BY clause
explicitly will return the same results as if the clause was omitted.

:::

## Examples

The below queries perform aggregations on a single key. Using `GROUP BY`
explicitly or implicitly yields the same results:

```questdb-sql title="Single key aggregation, explicit GROUP BY"
SELECT symbol, avg(price)
FROM trades
GROUP BY symbol;
```

```questdb-sql title="Single key aggregation, implicit GROUP BY"
SELECT symbol, avg(price)
FROM trades;
```

The below queries perform aggregations on multiple keys. Using `GROUP BY`
explicitly or implicitly yields the same results:

```questdb-sql title="Multiple key aggregation, explicit GROUP BY"
SELECT symbol, side, avg(price)
FROM trades
GROUP BY symbol, side;
```

```questdb-sql title="Multiple key aggregation, implicit GROUP BY"
SELECT symbol, side, avg(price)
FROM trades;
```

When used explicitly, the list of keys in the `GROUP BY` clause must match the
list of keys in the `SELECT` clause, otherwise an error will be returned:

```questdb-sql title="Error - Column b is missing in the GROUP BY clause"
SELECT a, b, avg(temp)
FROM tab
GROUP BY a;
```

```questdb-sql title="Error - Column b is missing in the SELECT clause"
SELECT a, avg(temp)
FROM tab
GROUP BY a, b;
```

```questdb-sql title="Success - Columns match"
SELECT a, b, avg(temp)
FROM tab
GROUP BY a, b;
```

## See also

- [PIVOT](/docs/query/sql/pivot/) - Transform GROUP BY results from rows to columns
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [Aggregation functions](/docs/query/functions/aggregation/) - Available aggregate functions
