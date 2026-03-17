---
title: Unpivoting query results
sidebar_label: Unpivoting results
description: Convert wide-format data to long format using UNION ALL
---

Transform wide-format data (multiple columns) into long format (rows) using UNION ALL.

## Problem: Wide format to long format

You have query results with multiple columns where only one column has a value per row:

**Wide format (sparse):**

| timestamp | symbol    | buy    | sell   |
|-----------|-----------|--------|--------|
| 08:10:00  | ETH-USDT  | NULL   | 3678.25|
| 08:10:00  | ETH-USDT  | NULL   | 3678.25|
| 08:10:00  | ETH-USDT  | 3678.01| NULL   |
| 08:10:00  | ETH-USDT  | NULL   | 3678.00|

You want to convert this to a format where side and price are explicit:

**Long format (dense):**

| timestamp | symbol    | side | price   |
|-----------|-----------|------|---------|
| 08:10:00  | ETH-USDT  | sell | 3678.25 |
| 08:10:00  | ETH-USDT  | sell | 3678.25 |
| 08:10:00  | ETH-USDT  | buy  | 3678.01 |
| 08:10:00  | ETH-USDT  | sell | 3678.00 |

## Solution: UNION ALL with literal values

Use UNION ALL to stack columns as rows, then filter NULL values:

```questdb-sql demo title="UNPIVOT buy/sell columns to side/price rows"
WITH pivoted AS (
  SELECT
    timestamp,
    symbol,
    CASE WHEN side = 'buy' THEN price END as buy,
    CASE WHEN side = 'sell' THEN price END as sell
  FROM trades
  WHERE timestamp IN '$now - 5m..$now'
    AND symbol = 'ETH-USDT'
),
unpivoted AS (
  SELECT timestamp, symbol, 'buy' as side, buy as price
  FROM pivoted

  UNION ALL

  SELECT timestamp, symbol, 'sell' as side, sell as price
  FROM pivoted
)
SELECT * FROM unpivoted
WHERE price IS NOT NULL
ORDER BY timestamp;
```

**Results:**

| timestamp | symbol    | side | price   |
|-----------|-----------|------|---------|
| 08:10:00  | ETH-USDT  | sell | 3678.25 |
| 08:10:00  | ETH-USDT  | sell | 3678.25 |
| 08:10:00  | ETH-USDT  | buy  | 3678.01 |
| 08:10:00  | ETH-USDT  | sell | 3678.00 |

## How it works

### Step 1: Create wide format (if needed)

If your data is already in narrow format, you may need to pivot first:

```sql
CASE WHEN side = 'buy' THEN price END as buy,
CASE WHEN side = 'sell' THEN price END as sell
```

This creates NULL values for the opposite side.

### Step 2: UNION ALL

```sql
SELECT timestamp, symbol, 'buy' as side, buy as price FROM pivoted
UNION ALL
SELECT timestamp, symbol, 'sell' as side, sell as price FROM pivoted
```

This creates two copies of every row:
- First copy: Has 'buy' literal with buy column value
- Second copy: Has 'sell' literal with sell column value

### Step 3: Filter NULLs

```sql
WHERE price IS NOT NULL
```

Removes rows where the price column is NULL (the opposite side).

## Unpivoting multiple columns

Transform multiple numeric columns to name-value pairs:

```questdb-sql title="UNPIVOT sensor readings"
WITH sensor_data AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    humidity,
    pressure
  FROM sensors
  WHERE timestamp IN '$now - 1h..$now'
)
SELECT timestamp, sensor_id, 'temperature' as metric, temperature as value FROM sensor_data
WHERE temperature IS NOT NULL

UNION ALL

SELECT timestamp, sensor_id, 'humidity' as metric, humidity as value FROM sensor_data
WHERE humidity IS NOT NULL

UNION ALL

SELECT timestamp, sensor_id, 'pressure' as metric, pressure as value FROM sensor_data
WHERE pressure IS NOT NULL

ORDER BY timestamp, sensor_id, metric;
```

**Results:**

| timestamp | sensor_id | metric      | value |
|-----------|-----------|-------------|-------|
| 10:00:00  | S001      | humidity    | 65.2  |
| 10:00:00  | S001      | pressure    | 1013.2|
| 10:00:00  | S001      | temperature | 22.5  |

## Performance considerations

**UNION ALL vs UNION:**
```sql
-- Fast: UNION ALL (no deduplication)
SELECT ... UNION ALL SELECT ...

-- Slower: UNION (deduplicates rows)
SELECT ... UNION SELECT ...
```

Always use `UNION ALL` for unpivoting unless you specifically need deduplication.



:::info Related Documentation
- [UNION](/docs/query/sql/union-except-intersect/)
- [CASE expressions](/docs/query/sql/case/)
- [Pivoting (opposite operation)](/docs/query/sql/pivot/)
- [Pivoting with an 'Others' column](/docs/cookbook/sql/advanced/pivot-with-others/)

:::
