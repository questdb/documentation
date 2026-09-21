---
title: PIVOT keyword
sidebar_label: PIVOT
description: PIVOT SQL keyword reference documentation.
---

`PIVOT` transforms rows into columns, converting narrow-schema data into wide-schema format.
This is useful for analytics, charting, and transforming time-series sensor data.

## Syntax

```
( selectQuery | tableName )
[ WHERE condition ]
PIVOT (
    aggregateExpression [ AS alias ] [, aggregateExpression [ AS alias ] ...]
    FOR pivotExpression IN ( valueList | selectDistinctQuery )
    [ pivotExpression IN ( valueList | selectDistinctQuery ) ... ]
    [ GROUP BY column [, column ...] ]
) [ AS alias ]
[ ORDER BY column [, column ...] ]
[ LIMIT n ]
```

Where `valueList` is: `constant [ AS alias ] [, constant [ AS alias ] ...]`

## Components

### Source data

A `PIVOT` query begins with a result set:

```questdb-sql
-- From a table name
trades PIVOT ( ... )

-- From a SELECT
SELECT * FROM trades PIVOT ( ... )

-- From a subquery
(SELECT * FROM trades WHERE timestamp > '2024-01-01') PIVOT ( ... )
```

### Aggregate functions

Define one or more aggregations, separated by commas:

```questdb-sql
PIVOT (
    avg(price),                          -- multiple aggregates
    sum(price * amount) / 2 AS half_value  -- expressions supported
    FOR ...
)
```

### FOR ... IN clause

Specifies which column values become output columns:

```questdb-sql
-- Static value list
FOR symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')

-- With aliases for column names
FOR symbol IN ('BTC-USDT' AS bitcoin, 'ETH-USDT' AS ethereum)

-- Dynamic from subquery (executed at parse time)
FOR symbol IN (SELECT DISTINCT symbol FROM trades WHERE timestamp IN '$today')

-- Multiple FOR clauses create Cartesian product
FOR symbol IN ('BTC-USDT', 'ETH-USDT')
    side IN ('buy', 'sell')
-- Produces: BTC-USDT_buy, BTC-USDT_sell, ETH-USDT_buy, ETH-USDT_sell
```

### GROUP BY (optional, inside PIVOT)

Groups results by additional columns:

```questdb-sql
PIVOT (
    sum(price * amount) / 2
    FOR symbol IN ('BTC-USDT', 'ETH-USDT')
    GROUP BY side    -- inside PIVOT parentheses
)
```

:::note
Positional `GROUP BY` (e.g., `GROUP BY 1, 2`) is not supported inside PIVOT.
Use explicit column names instead.
:::

### ORDER BY / LIMIT (outside PIVOT)

Sort and limit the final result set:

```questdb-sql
trades PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USDT', 'ETH-USDT')
    GROUP BY side
)
ORDER BY side      -- outside PIVOT parentheses
LIMIT 10
```

## Examples

### Basic pivot

Transform rows to columns:

```questdb-sql demo title="Row-based query"
SELECT symbol, avg(price)
FROM trades
WHERE timestamp IN '$today'
GROUP BY symbol;
```

| symbol    | avg       |
| --------- | --------- |
| BTC-USDT  | 81690.81  |
| ETH-USDT  | 2388.09   |
| SOL-USDT  | 88.10     |
| ADA-USDT  | 0.27      |
| AVAX-USDT | 9.60      |
| LTC-USDT  | 57.17     |
| DOT-USDT  | 1.31      |
| UNI-USDT  | 3.45      |
| XLM-USDT  | 0.16      |
| ETH-BTC   | 0.03      |
| SOL-BTC   | 0.001     |

Without `PIVOT`, converting rows to columns requires verbose `CASE` expressions:

```questdb-sql demo title="Manual pivot with CASE"
SELECT
    avg(CASE WHEN symbol = 'BTC-USDT' THEN price END) AS "BTC-USDT",
    avg(CASE WHEN symbol = 'ETH-USDT' THEN price END) AS "ETH-USDT",
    avg(CASE WHEN symbol = 'SOL-USDT' THEN price END) AS "SOL-USDT",
    avg(CASE WHEN symbol = 'ADA-USDT' THEN price END) AS "ADA-USDT",
    avg(CASE WHEN symbol = 'AVAX-USDT' THEN price END) AS "AVAX-USDT"
FROM trades
WHERE timestamp IN '$today';
```

| BTC-USDT | ETH-USDT | SOL-USDT | ADA-USDT | AVAX-USDT |
| -------- | -------- | -------- | -------- | --------- |
| 81690.82 | 2388.09  | 88.10    | 0.27     | 9.60      |

`PIVOT` simplifies this pattern:

```questdb-sql demo title="Pivoted to columns"
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price)
    FOR symbol IN (
        'BTC-USDT', 'ETH-USDT', 'SOL-USDT',
        'ADA-USDT', 'AVAX-USDT'
    )
);
```

| BTC-USDT | ETH-USDT | SOL-USDT | ADA-USDT | AVAX-USDT |
| -------- | -------- | -------- | -------- | --------- |
| 81683.77 | 2387.93  | 88.09    | 0.27     | 9.60      |

### Multiple aggregates

```questdb-sql demo title="Multiple aggregates per symbol"
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price) AS avg_price,
    sum(price * amount) / 2 AS half_value
    FOR symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')
);
```

| BTC-USDT_avg_price | BTC-USDT_half_value | ETH-USDT_avg_price | ETH-USDT_half_value | SOL-USDT_avg_price | SOL-USDT_half_value |
| ------------------ | ------------------- | ------------------ | ------------------- | ------------------ | ------------------- |
| 81683.99           | 154998570.76        | 2387.94            | 80641109.01         | 88.09              | 24492519.72         |

### Multiple FOR clauses (Cartesian product)

```questdb-sql demo title="Pivot by symbol and side"
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price)
    FOR symbol IN (
        'BTC-USDT', 'ETH-USDT', 'SOL-USDT',
        'ADA-USDT', 'AVAX-USDT'
    )
        side IN ('buy', 'sell')
);
```

| BTC-USDT_buy | BTC-USDT_sell | ETH-USDT_buy | ETH-USDT_sell | SOL-USDT_buy | SOL-USDT_sell | ADA-USDT_buy | ADA-USDT_sell | AVAX-USDT_buy | AVAX-USDT_sell |
| ------------ | ------------- | ------------ | ------------- | ------------ | ------------- | ------------ | ------------- | ------------- | -------------- |
| 81717.80     | 81645.93      | 2387.97      | 2387.92       | 88.13        | 88.05         | 0.2668       | 0.2671        | 9.6085        | 9.5972         |

### With GROUP BY

Keep additional dimensions as rows:

```questdb-sql demo title="Pivot with GROUP BY"
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price)
    FOR symbol IN (
        'BTC-USDT', 'ETH-USDT', 'SOL-USDT',
        'ADA-USDT', 'AVAX-USDT'
    )
    GROUP BY side
) ORDER BY side;
```

| side | BTC-USDT | ETH-USDT | SOL-USDT | ADA-USDT | AVAX-USDT |
| ---- | -------- | -------- | -------- | -------- | --------- |
| buy  | 81717.85 | 2387.97  | 88.13    | 0.2668   | 9.6085    |
| sell | 81645.99 | 2387.92  | 88.05    | 0.2671   | 9.5972    |

:::note
When a GROUP BY key has no matching FOR values in the data, the entire row is
excluded from results rather than appearing with NULL pivot columns. This is
due to filter optimization that pushes `FOR column IN (values)` to the WHERE clause.

For example, if `side = 'hold'` exists but has no matching symbols, that row won't appear.
:::

### Dynamic IN list from subquery

Column names determined at query compile time:

```questdb-sql demo title="Dynamic pivot columns from subquery"
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price)
    FOR symbol IN (
        SELECT DISTINCT symbol FROM trades
        WHERE timestamp IN '$today'
        ORDER BY symbol
    )
    GROUP BY side
);
```

:::warning
Subqueries in the `IN` clause are executed at parse time, not at runtime.
Changes to the source table after query compilation won't affect column names.
:::

:::note
Subqueries in the `IN` clause must:
- Return exactly one column
- Return at least one row (empty result sets cause an error)
:::

:::tip
If the subquery runs on a large table, it can slow down the overall `PIVOT` query.
For exploratory analysis, dynamic subqueries are convenient. For production queries,
use a constant list or store keys in a small dimension table for better performance.
:::

### With CTEs

```questdb-sql demo title="Pivot with CTE"
WITH recent_trades AS (
    SELECT * FROM trades
    WHERE timestamp IN '$today'
)
SELECT * FROM recent_trades
PIVOT (
    avg(price)
    FOR symbol IN (
        SELECT DISTINCT symbol FROM recent_trades
        ORDER BY symbol
    )
    GROUP BY side
);
```

## Column naming

Output columns are automatically named based on the combination of FOR values and aggregates.

With a **single aggregate**, columns are named using just the FOR value:

```questdb-sql demo title="Single aggregate column names"
-- Columns: BTC-USDT, ETH-USDT
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USDT', 'ETH-USDT')
);
```

With **multiple aggregates**, the full function expression is included:

```questdb-sql demo title="Multiple aggregate column names"
-- Columns: BTC-USDT_avg(price), BTC-USDT_sum(price), ...
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price), sum(price)
    FOR symbol IN ('BTC-USDT', 'ETH-USDT')
);
```

Use **aliases** for cleaner column names:

```questdb-sql demo title="Aliased column names"
-- Columns: BTC-USDT_avg_price, BTC-USDT_total_price, ...
SELECT * FROM trades
WHERE timestamp IN '$today'
PIVOT (
    avg(price) AS avg_price, sum(price) AS total_price
    FOR symbol IN ('BTC-USDT', 'ETH-USDT')
);
```

| Scenario                | Example                                              | Column name                            |
| ----------------------- | ---------------------------------------------------- | -------------------------------------- |
| Single aggregate        | `avg(price) FOR symbol IN ('BTC-USDT')`              | `BTC-USDT`                             |
| Multiple aggregates     | `avg(price), sum(price) FOR symbol IN ('BTC-USDT')`  | `BTC-USDT_avg(price)`, `BTC-USDT_sum(price)` |
| Multiple FOR            | `avg(price) FOR symbol IN ('BTC-USDT') side IN ('buy')` | `BTC-USDT_buy`                      |
| With alias on value     | `FOR symbol IN ('BTC-USDT' AS btc)`                  | `btc`                                  |
| With alias on aggregate | `avg(price) AS avg_price FOR symbol IN ('BTC-USDT')` | `BTC-USDT_avg_price`                   |

## Limits

PIVOT has a configurable maximum column limit (default: 5000) to prevent excessive memory usage.
The total columns = `(FOR value combinations) × (number of aggregates)`.

```questdb-sql
-- Fails if combinations × aggregates exceeds 5000
trades PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM trades)  -- many symbols
        side IN ('buy', 'sell')                         -- x 2
);
```

## See also

- [GROUP BY](/docs/query/sql/group-by/) - Row-based aggregation
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [Aggregation functions](/docs/query/functions/aggregation/) - Functions available in PIVOT
- [WITH](/docs/query/sql/with/) - Using PIVOT with common table expressions
