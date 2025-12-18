---
title: UNPIVOT Table Results
sidebar_label: UNPIVOT
description: Convert wide-format data to long format using UNION ALL to transform column-based data into row-based data
---

Transform wide-format data (multiple columns) into long format (rows) using UNION ALL. This "unpivot" operation is useful for converting column-based data into a row-based format suitable for visualization or further analysis.

## Problem: Wide Format to Long Format

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

## Solution: UNION ALL with Literal Values

Use UNION ALL to stack columns as rows, then filter NULL values:

```questdb-sql demo title="UNPIVOT buy/sell columns to side/price rows"
WITH pivoted AS (
  SELECT
    timestamp,
    symbol,
    CASE WHEN side = 'buy' THEN price END as buy,
    CASE WHEN side = 'sell' THEN price END as sell
  FROM trades
  WHERE timestamp >= dateadd('m', -5, now())
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

## How It Works

### Step 1: Create Wide Format (if needed)

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

## Unpivoting Multiple Columns

Transform multiple numeric columns to name-value pairs:

```questdb-sql demo title="UNPIVOT sensor readings"
WITH sensor_data AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    humidity,
    pressure
  FROM sensors
  WHERE timestamp >= dateadd('h', -1, now())
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

## Simplified Syntax (When All Values Present)

If you know there are no NULL values, skip the filtering:

```sql
SELECT timestamp, symbol, 'buy' as side, buy_price as price
FROM trades_summary

UNION ALL

SELECT timestamp, symbol, 'sell' as side, sell_price as price
FROM trades_summary;
```

## Use Cases

**Grafana visualization:**
```sql
-- Convert wide format to Grafana-friendly long format
SELECT
  timestamp as time,
  metric_name as metric,
  value
FROM (
  SELECT timestamp, 'cpu' as metric_name, cpu_usage as value FROM metrics
  UNION ALL
  SELECT timestamp, 'memory' as metric_name, memory_usage as value FROM metrics
  UNION ALL
  SELECT timestamp, 'disk' as metric_name, disk_usage as value FROM metrics
)
WHERE value IS NOT NULL;
```

**Pivot table to chart:**
```sql
-- From crosstab format to plottable format
SELECT month, 'revenue' as metric, revenue as value FROM monthly_stats
UNION ALL
SELECT month, 'costs' as metric, costs as value FROM monthly_stats
UNION ALL
SELECT month, 'profit' as metric, profit as value FROM monthly_stats;
```

**Multiple symbols analysis:**
```sql
-- Stack different symbols as rows
SELECT timestamp, 'BTC-USDT' as symbol, btc_price as price FROM market_data
UNION ALL
SELECT timestamp, 'ETH-USDT' as symbol, eth_price as price FROM market_data
UNION ALL
SELECT timestamp, 'SOL-USDT' as symbol, sol_price as price FROM market_data;
```

## Performance Considerations

**UNION ALL vs UNION:**
```sql
-- Fast: UNION ALL (no deduplication)
SELECT ... UNION ALL SELECT ...

-- Slower: UNION (deduplicates rows)
SELECT ... UNION SELECT ...
```

Always use `UNION ALL` for unpivoting unless you specifically need deduplication.

**Index usage:**
- Each SELECT in the UNION can use indexes independently
- Filter before UNION for better performance:

```sql
-- Good: Filter in each SELECT
SELECT timestamp, 'buy' as side, price FROM trades WHERE side = 'buy'
UNION ALL
SELECT timestamp, 'sell' as side, price FROM trades WHERE side = 'sell'

-- Less efficient: Filter after UNION
SELECT * FROM (
  SELECT timestamp, 'buy' as side, price_buy as price FROM trades
  UNION ALL
  SELECT timestamp, 'sell' as side, price_sell as price FROM trades
) WHERE price > 0
```

## Alternative: Case-Based Approach

For simple scenarios, use CASE without UNION:

```sql
-- If your source data has a side column already
SELECT
  timestamp,
  symbol,
  side,
  CASE
    WHEN side = 'buy' THEN buy_price
    WHEN side = 'sell' THEN sell_price
  END as price
FROM trades
WHERE price IS NOT NULL;
```

This works when you have a discriminator column (like `side`) that indicates which price column to use.

## Dynamic Unpivoting

For tables with many columns, generate UNION queries programmatically:

```python
# Python example
columns = ['temperature', 'humidity', 'pressure', 'wind_speed']
queries = []

for col in columns:
    query = f"SELECT timestamp, sensor_id, '{col}' as metric, {col} as value FROM sensors WHERE {col} IS NOT NULL"
    queries.append(query)

full_query = " UNION ALL ".join(queries)
```

## Unpivoting with Metadata

Include additional information in unpivoted results:

```sql
WITH source AS (
  SELECT
    timestamp,
    device_id,
    location,
    temperature,
    humidity
  FROM iot_sensors
)
SELECT timestamp, device_id, location, 'temperature' as metric, temperature as value, 'celsius' as unit
FROM source WHERE temperature IS NOT NULL

UNION ALL

SELECT timestamp, device_id, location, 'humidity' as metric, humidity as value, 'percent' as unit
FROM source WHERE humidity IS NOT NULL

ORDER BY timestamp, device_id, metric;
```

## Reverse: Pivot (Long to Wide)

To go back from long to wide format, use aggregation with CASE:

```sql
-- From long format
SELECT
  timestamp,
  sensor_id,
  MAX(CASE WHEN metric = 'temperature' THEN value END) as temperature,
  MAX(CASE WHEN metric = 'humidity' THEN value END) as humidity,
  MAX(CASE WHEN metric = 'pressure' THEN value END) as pressure
FROM sensor_readings_long
GROUP BY timestamp, sensor_id;
```

See the [Pivoting](/playbook/sql/pivoting) guide for more details.

:::tip When to UNPIVOT
Unpivot data when:
- Visualizing multiple metrics on the same chart (Grafana, BI tools)
- Applying the same calculation to multiple columns
- Storing column-based data in a narrow table format
- Preparing data for machine learning (feature columns → feature rows)
:::

:::warning Performance Impact
UNION ALL creates multiple copies of your data. For very large tables:
- Filter early to reduce dataset size
- Consider if unpivoting is necessary (some tools handle wide format well)
- Use indexes on filtered columns
- Test query performance before using in production
:::

:::info Related Documentation
- [UNION](/docs/reference/sql/union/)
- [CASE expressions](/docs/reference/sql/case/)
- [Pivoting (opposite operation)](/playbook/sql/pivoting)
:::
