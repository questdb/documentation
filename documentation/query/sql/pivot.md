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
PIVOT (
    aggregateFunc [ AS alias ] [, aggregateFunc [ AS alias ] ...]
    FOR pivotColumn IN ( valueList | selectDistinctQuery )
    [ FOR pivotColumn IN ( valueList | selectDistinctQuery ) ... ]
    [ GROUP BY column [, column ...] ]
)
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
    avg(price),                    -- multiple aggregates
    sum(amount) AS total_amount    -- with optional alias
    FOR ...
)
```

### FOR ... IN clause

Specifies which column values become output columns:

```questdb-sql
-- Static value list
FOR symbol IN ('BTC-USD', 'ETH-USD')

-- With aliases for column names
FOR symbol IN ('BTC-USD' AS bitcoin, 'ETH-USD' AS ethereum)

-- Dynamic from subquery (executed at parse time)
FOR symbol IN (SELECT DISTINCT symbol FROM trades)

-- Multiple FOR clauses create Cartesian product
FOR symbol IN ('BTC-USD', 'ETH-USD')
    side IN ('buy', 'sell')
-- Produces: BTC-USD_buy, BTC-USD_sell, ETH-USD_buy, ETH-USD_sell
```

### GROUP BY (optional, inside PIVOT)

Groups results by additional columns:

```questdb-sql
PIVOT (
    sum(amount)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
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
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
)
ORDER BY side      -- outside PIVOT parentheses
LIMIT 10
```

## Examples

### Basic pivot

Transform rows to columns:

```questdb-sql title="Row-based query"
SELECT symbol, avg(price)
FROM trades
GROUP BY symbol;
```

| symbol  | avg       |
|---------|-----------|
| BTC-USD | 39267.64  |
| ETH-USD | 2615.42   |

Without `PIVOT`, converting rows to columns requires verbose `CASE` expressions:

```questdb-sql title="Manual pivot with CASE"
SELECT
    avg(CASE WHEN symbol = 'BTC-USD' THEN price END) AS "BTC-USD",
    avg(CASE WHEN symbol = 'ETH-USD' THEN price END) AS "ETH-USD"
FROM trades;
```

`PIVOT` simplifies this pattern:

```questdb-sql title="Pivoted to columns"
trades PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
);
```

| BTC-USD   | ETH-USD  |
|-----------|----------|
| 39267.64  | 2615.42  |

### Multiple aggregates

```questdb-sql
trades PIVOT (
    avg(price) AS avg_price,
    sum(amount) AS total
    FOR symbol IN ('BTC-USD', 'ETH-USD')
);
```

| BTC-USD_avg_price | BTC-USD_total | ETH-USD_avg_price | ETH-USD_total |
|-------------------|---------------|-------------------|---------------|
| 39267.64          | 1.25          | 2615.42           | 0.45          |

### Multiple FOR clauses (Cartesian product)

```questdb-sql
trades PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
        side IN ('buy', 'sell')
);
```

| BTC-USD_buy | BTC-USD_sell | ETH-USD_buy | ETH-USD_sell |
|-------------|--------------|-------------|--------------|
| 39300.00    | 39267.64     | 2620.00     | 2615.54      |

### With GROUP BY

Keep additional dimensions as rows:

```questdb-sql
trades PIVOT (
    avg(price)
    FOR symbol IN ('BTC-USD', 'ETH-USD')
    GROUP BY side
) ORDER BY side;
```

| side | BTC-USD   | ETH-USD  |
|------|-----------|----------|
| buy  | 39300.00  | 2620.00  |
| sell | 39267.64  | 2615.54  |

### Dynamic IN list from subquery

Column names determined at query compile time:

```questdb-sql
trades PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM trades ORDER BY symbol)
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

```questdb-sql
WITH recent_trades AS (
    SELECT * FROM trades
    WHERE timestamp > dateadd('d', -1, now())
)
SELECT * FROM recent_trades
PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM recent_trades)
    GROUP BY side
);
```

## Column naming

Output columns are automatically named based on the combination of values and aggregates.

When using **different aggregate functions** (e.g., `avg` and `sum`), the function name is used:

```questdb-sql
PIVOT (avg(price), sum(price) FOR symbol IN ('BTC-USD'))
-- Columns: BTC-USD_avg, BTC-USD_sum
```

When using the **same aggregate function multiple times** (e.g., `avg(price)` and `avg(amount)`), the full expression is used to distinguish them:

```questdb-sql
PIVOT (avg(price), avg(amount) FOR symbol IN ('BTC-USD'))
-- Columns: BTC-USD_avg(price), BTC-USD_avg(amount)
```

Use aliases for cleaner column names:

```questdb-sql
PIVOT (avg(price) AS avg_price, avg(amount) AS avg_amt FOR symbol IN ('BTC-USD'))
-- Columns: BTC-USD_avg_price, BTC-USD_avg_amt
```

| Scenario | Example | Column name |
|----------|---------|-------------|
| Single FOR, single aggregate | `avg(price) FOR symbol IN ('BTC')` | `BTC` |
| Single FOR, different aggregates | `avg(price), sum(price) FOR symbol IN ('BTC')` | `BTC_avg`, `BTC_sum` |
| Single FOR, same aggregate | `avg(price), avg(amount) FOR symbol IN ('BTC')` | `BTC_avg(price)`, `BTC_avg(amount)` |
| Multiple FOR | `avg(price) FOR symbol IN ('BTC') side IN ('buy')` | `BTC_buy` |
| With alias on value | `FOR symbol IN ('BTC-USD' AS btc)` | `btc` |
| With alias on aggregate | `avg(price) AS avg_price FOR symbol IN ('BTC')` | `BTC_avg_price` |

## Limits

PIVOT has a configurable maximum column limit (default: 5000) to prevent excessive memory usage.
The total columns = `(FOR value combinations) × (number of aggregates)`.

```questdb-sql
-- This would fail if combinations × aggregates > 5000
trades PIVOT (
    avg(price)
    FOR symbol IN (SELECT DISTINCT symbol FROM trades)  -- many symbols
        side IN ('buy', 'sell')                         -- × 2
);
```

## Comparison with other databases

| Feature | QuestDB | Oracle/SQL Server | BigQuery |
|---------|---------|-------------------|----------|
| GROUP BY | Optional (inside PIVOT) | Implicit | Implicit |
| Multiple FOR | Yes (separate clauses) | Tuple syntax | Tuple syntax |
| Subquery in IN | Yes | No | Limited |
| Top-level syntax | `table PIVOT(...)` | No | No |

## See also

- [GROUP BY](/docs/query/sql/group-by/) - Row-based aggregation
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [Aggregation functions](/docs/query/functions/aggregation/) - Functions available in PIVOT
- [WITH](/docs/query/sql/with/) - Using PIVOT with common table expressions
