---
title: GROUP BY keyword
sidebar_label: GROUP BY
description: GROUP BY SQL keyword reference documentation.
---

Groups aggregation calculations by one or several keys. In QuestDB, this clause
is [optional](/docs/concepts/deep-dive/sql-extensions/#group-by-is-optional).

## Syntax

```questdb-sql
SELECT column [, column ...], aggregation [, aggregation ...]
FROM tableName
[GROUP BY column [, column ...]];
```

:::note

QuestDB groups aggregation results implicitly and does not require the GROUP BY
keyword. It is only supported for convenience. Using the GROUP BY clause
explicitly will return the same results as if the clause was omitted.

:::

## Examples

The below queries perform aggregations on a single key. Using `GROUP BY`
explicitly or implicitly yields the same results:

```questdb-sql demo title="Single key aggregation, explicit GROUP BY"
SELECT symbol, avg(price), count()
FROM fx_trades
WHERE timestamp IN '$today'
GROUP BY symbol
LIMIT 5;
```

| symbol | avg    | count  |
| ------ | ------ | ------ |
| EURCAD | 1.5956 | 31597  |
| EURUSD | 1.1701 | 315311 |
| USDMXN | 17.243 | 31852  |
| GBPJPY | 212.12 | 31442  |
| AUDJPY | 113.10 | 32153  |

```questdb-sql demo title="Single key aggregation, implicit GROUP BY"
SELECT symbol, avg(price), count()
FROM fx_trades
WHERE timestamp IN '$today'
LIMIT 5;
```

The below queries perform aggregations on multiple keys. Using `GROUP BY`
explicitly or implicitly yields the same results:

```questdb-sql demo title="Multiple key aggregation, explicit GROUP BY"
SELECT symbol, side, avg(price), count()
FROM fx_trades
WHERE timestamp IN '$today'
GROUP BY symbol, side
LIMIT 5;
```

| symbol | side | avg    | count  |
| ------ | ---- | ------ | ------ |
| USDCAD | sell | 1.3601 | 79061  |
| NZDUSD | buy  | 0.5944 | 31364  |
| EURUSD | sell | 1.1697 | 157235 |
| EURCHF | buy  | 0.9149 | 15206  |
| EURUSD | buy  | 1.1705 | 158076 |

```questdb-sql demo title="Multiple key aggregation, implicit GROUP BY"
SELECT symbol, side, avg(price), count()
FROM fx_trades
WHERE timestamp IN '$today'
LIMIT 5;
```

When used explicitly, every non-aggregated column in the `SELECT` clause must
appear in `GROUP BY`, otherwise an error will be returned:

```questdb-sql title="Error - side is missing in the GROUP BY clause"
SELECT symbol, side, avg(price)
FROM fx_trades
GROUP BY symbol;
```

The reverse is allowed. Extra columns in `GROUP BY` that are not in `SELECT`
will produce a valid result, but the same symbol may appear multiple times
(once per value of the extra key). This can be misleading, which is a good
reason to prefer implicit `GROUP BY` where QuestDB always groups by exactly
the non-aggregated columns in `SELECT`:

```questdb-sql demo title="Extra GROUP BY key not in SELECT"
SELECT symbol, avg(price)
FROM fx_trades
WHERE timestamp IN '$today'
GROUP BY symbol, side
ORDER BY symbol
LIMIT 6;
```

| symbol | avg      |
| ------ | -------- |
| AUDCAD | 0.9846   |
| AUDCAD | 0.9838   |
| AUDJPY | 113.1422 |
| AUDJPY | 113.0659 |
| AUDNZD | 1.2127   |
| AUDNZD | 1.2118   |

## See also

- [PIVOT](/docs/query/sql/pivot/) - Transform GROUP BY results from rows to columns
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [Aggregation functions](/docs/query/functions/aggregation/) - Available aggregate functions
