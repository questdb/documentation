---
title: WITH keyword
sidebar_label: WITH
description: WITH SQL keyword reference documentation.
---

Supports Common Table Expressions (CTEs), e.i., naming one or several
sub-queries to be used with a [`SELECT`](/docs/query/sql/select/),
[`INSERT`](/docs/query/sql/insert/), or
[`UPDATE`](/docs/query/sql/update/) query.

Using a CTE makes it easy to simplify large or complex statements which involve
sub-queries, particularly when such sub-queries are used several times.

## Syntax

```questdb-sql
WITH alias AS (subQuery) [, alias AS (subQuery) ...]
mainQuery;
```

Where:

- `alias` is the name given to the sub-query for ease of reusing
- `subQuery` is a SQL query (e.g `SELECT * FROM table`)

## Examples

```questdb-sql title="Single alias" demo
WITH recent_eurusd AS (
    SELECT timestamp, price FROM fx_trades
    WHERE symbol = 'EURUSD'
    LIMIT -10
)
SELECT * FROM recent_eurusd;
```

```questdb-sql title="Using recursively" demo
WITH recent_eurusd AS (
    SELECT timestamp, price FROM fx_trades
    WHERE symbol = 'EURUSD'
    LIMIT -10
),
last_5 AS (SELECT * FROM recent_eurusd LIMIT -5)
SELECT * FROM last_5;
```

```questdb-sql title="Find EURUSD trades above today's average price" demo
WITH eurusd_today AS (
    SELECT timestamp, price,
           avg(price) OVER () AS avg_price
    FROM fx_trades
    WHERE symbol = 'EURUSD'
      AND timestamp IN '$today'
)
SELECT timestamp, price, avg_price
FROM eurusd_today
WHERE price > avg_price;
```

The CTE is required here because window functions cannot be referenced
directly in the same query's `WHERE` clause. The outer query reads the
materialized `avg_price` column and filters on it.

```questdb-sql title="Update with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
UPDATE spreads s
SET spread = up.spread
FROM up
WHERE up.ts = s.ts AND s.symbol = up.symbol;
```

```questdb-sql title="Insert with a sub-query"
WITH up AS (
    SELECT symbol, spread, ts
    FROM temp_spreads
    WHERE timestamp between '2022-01-02' and '2022-01-03'
)
INSERT INTO spreads
SELECT * FROM up;
```
