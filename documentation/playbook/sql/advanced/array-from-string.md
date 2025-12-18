---
title: Create Arrays from String Literals
sidebar_label: Array from string literal
description: Cast string literals to array types for use in functions requiring array parameters
---

Create array values from string literals for use with functions that accept array parameters. While QuestDB doesn't have native array literals, you can cast string representations to array types like `double[]` or `int[]`.

## Problem: Functions Requiring Array Parameters

Some QuestDB functions accept array parameters:

```sql
-- Hypothetical function signature
percentile_cont(values double[], percentiles double[])
```

But you can't write arrays directly in SQL:

```sql
-- This doesn't work (not valid SQL)
SELECT func([1.0, 2.0, 3.0]);
```

## Solution: Cast String to Array

Use CAST to convert string literals to array types:

```questdb-sql demo title="Cast string to double array"
SELECT cast('[1.0, 2.0, 3.0, 4.0, 5.0]' AS double[]) as numbers;
```

**Result:**
```
numbers: [1.0, 2.0, 3.0, 4.0, 5.0]
```

## Array Type Casting

### Double Array

```sql
SELECT cast('[1.5, 2.7, 3.2]' AS double[]) as decimals;
```

### Integer Array

```sql
SELECT cast('[10, 20, 30]' AS int[]) as integers;
```

### Long Array

```sql
SELECT cast('[1000000, 2000000, 3000000]' AS long[]) as big_numbers;
```

## Using Arrays with Functions

### Custom Percentiles

```sql
-- Calculate multiple percentiles at once (if function supports)
SELECT
  symbol,
  percentiles(price, cast('[0.25, 0.50, 0.75, 0.95, 0.99]' AS double[])) as percentile_values
FROM trades
WHERE timestamp >= dateadd('d', -1, now())
GROUP BY symbol;
```

Note: QuestDB's built-in `percentile()` function takes a single percentile value, not an array. This example shows the pattern for custom or future array-accepting functions.

### Array Aggregation (Example Pattern)

```sql
-- Conceptual: Aggregate values into array
WITH data AS (
  SELECT
    timestamp_floor('h', timestamp) as hour,
    collect_list(price) as prices  -- Hypothetical array aggregation
  FROM trades
  SAMPLE BY 1h
)
SELECT
  hour,
  array_avg(prices) as avg_price,
  array_median(prices) as median_price
FROM data;
```

## Multidimensional Arrays

### 2D Array (Matrix)

```sql
SELECT cast('[[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]' AS double[][]) as matrix;
```

**Result:**
```
matrix: [[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]]
```

### Use Case: Time Series Matrix

```sql
-- Store multiple related time series as matrix
WITH timeseries_matrix AS (
  SELECT cast(
    '[[100.0, 101.0, 102.0],
      [200.0, 201.0, 202.0],
      [300.0, 301.0, 302.0]]'
    AS double[][]
  ) as series_data
)
SELECT
  series_data[0] as series_1,  -- [100.0, 101.0, 102.0]
  series_data[1] as series_2,  -- [200.0, 201.0, 202.0]
  series_data[2] as series_3   -- [300.0, 301.0, 302.0]
FROM timeseries_matrix;
```

## Array Indexing

Access array elements by index (0-based):

```sql
WITH arr AS (
  SELECT cast('[10.5, 20.7, 30.2, 40.9]' AS double[]) as values
)
SELECT
  values[0] as first,   -- 10.5
  values[1] as second,  -- 20.7
  values[3] as fourth   -- 40.9
FROM arr;
```

## Dynamic Array Construction

Build arrays from query results:

### Using String Aggregation

```sql
-- Aggregate values into comma-separated string, then cast
WITH aggregated AS (
  SELECT
    symbol,
    string_agg(cast(price AS STRING), ',') as price_string
  FROM (
    SELECT * FROM trades
    WHERE symbol = 'BTC-USDT'
    LIMIT 10
  )
  GROUP BY symbol
)
SELECT
  symbol,
  cast('[' || price_string || ']' AS double[]) as price_array
FROM aggregated;
```

## Array Literals in WHERE Clauses

Check if value exists in array:

```sql
-- Check if symbol is in list
WITH valid_symbols AS (
  SELECT cast('["BTC-USDT", "ETH-USDT", "SOL-USDT"]' AS string[]) as symbols
)
SELECT *
FROM trades
WHERE symbol IN (SELECT unnest(symbols) FROM valid_symbols)
LIMIT 100;
```

Note: QuestDB's `IN` clause with arrays may have limited support. Use standard `IN (value1, value2, ...)` syntax where possible.

## Array Length

Get number of elements:

```sql
SELECT
  cast('[1, 2, 3, 4, 5]' AS int[]) as arr,
  array_length(cast('[1, 2, 3, 4, 5]' AS int[]), 1) as length;  -- Returns 5
```

## Common Patterns

### Percentile Thresholds

```sql
-- Define alert thresholds as array
WITH thresholds AS (
  SELECT cast('[50.0, 100.0, 500.0, 1000.0]' AS double[]) as latency_thresholds
),
counts AS (
  SELECT
    count(CASE WHEN latency_ms < thresholds[0] THEN 1 END) as under_50ms,
    count(CASE WHEN latency_ms >= thresholds[0] AND latency_ms < thresholds[1] THEN 1 END) as ms_50_100,
    count(CASE WHEN latency_ms >= thresholds[1] AND latency_ms < thresholds[2] THEN 1 END) as ms_100_500,
    count(CASE WHEN latency_ms >= thresholds[2] THEN 1 END) as over_500ms
  FROM api_requests, thresholds
  WHERE timestamp >= dateadd('h', -1, now())
)
SELECT * FROM counts;
```

### Price Levels

```sql
-- Support/resistance levels
WITH levels AS (
  SELECT cast('[60000.0, 61000.0, 62000.0, 63000.0]' AS double[]) as price_levels
)
SELECT
  timestamp,
  price,
  CASE
    WHEN price < price_levels[0] THEN 'Below Support 1'
    WHEN price >= price_levels[0] AND price < price_levels[1] THEN 'Support 1-2'
    WHEN price >= price_levels[1] AND price < price_levels[2] THEN 'Support 2-3'
    WHEN price >= price_levels[2] AND price < price_levels[3] THEN 'Resistance 1-2'
    ELSE 'Above Resistance 2'
  END as price_zone
FROM trades, levels
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('h', -1, now());
```

## Limitations and Workarounds

### No Array Literals

**Problem:** Can't write arrays directly in standard SQL syntax

**Workaround:** Use CAST with string literals as shown above

### Limited Array Functions

**Problem:** QuestDB has limited built-in array manipulation functions

**Workaround:** Use CASE expressions and indexing to process arrays

### Array Comparison

**Problem:** Can't directly compare arrays with `=` operator

**Workaround:** Compare element-by-element or convert to strings

```sql
SELECT
  CASE
    WHEN cast('[1, 2, 3]' AS int[])[0] = cast('[1, 2, 4]' AS int[])[0]
      AND cast('[1, 2, 3]' AS int[])[1] = cast('[1, 2, 4]' AS int[])[1]
    THEN 'First two elements match'
    ELSE 'Different'
  END as comparison;
```

## Alternative: Use Individual Columns

For many use cases, separate columns are cleaner than arrays:

```sql
-- Instead of: [p50, p90, p95, p99]
SELECT
  percentile(price, 50) as p50,
  percentile(price, 90) as p90,
  percentile(price, 95) as p95,
  percentile(price, 99) as p99
FROM trades;
```

This avoids array casting and is often more readable.

## Type Coercion Rules

```sql
-- String to double[]
cast('[1, 2, 3]' AS double[])  -- [1.0, 2.0, 3.0]

-- String to int[]
cast('[1.5, 2.5, 3.5]' AS int[])  -- [1, 2, 3] (truncates decimals)

-- String to long[]
cast('[1000000, 2000000]' AS long[])  -- [1000000, 2000000]
```

## JSON Alternative

For complex nested structures, consider using STRING columns with JSON:

```sql
-- Store as JSON string
SELECT '{"prices": [100.0, 101.0, 102.0], "volumes": [10, 20, 30]}' as data;

-- Parse with custom logic or external tools
```

QuestDB focuses on time-series performance, so complex nested structures are often better handled in application code.

## Practical Example: Multiple Symbol Filter

```sql
-- Define symbols to track
WITH watched_symbols AS (
  SELECT cast('["BTC-USDT", "ETH-USDT", "SOL-USDT", "AVAX-USDT"]' AS string[]) as symbols
)
SELECT
  trades.*
FROM trades
CROSS JOIN watched_symbols
WHERE symbol IN (
  -- Expand array to rows
  SELECT symbols[0] FROM watched_symbols
  UNION ALL SELECT symbols[1] FROM watched_symbols
  UNION ALL SELECT symbols[2] FROM watched_symbols
  UNION ALL SELECT symbols[3] FROM watched_symbols
)
  AND timestamp >= dateadd('h', -1, now())
LIMIT 100;
```

**Simpler alternative:**
```sql
SELECT * FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'AVAX-USDT')
LIMIT 100;
```

The array approach is useful when the list is dynamically generated or reused across queries.

:::tip When to Use Arrays
Use arrays when:
- Working with functions that require array parameters
- Storing fixed-size sequences (coordinates, RGB values, etc.)
- Defining reusable threshold or configuration arrays
- Interfacing with external systems expecting array format

Avoid arrays when:
- Simple column-based representation works fine
- You need frequent element-wise operations (use separate columns instead)
- Data structure is deeply nested (consider JSON or denormalization)
:::

:::warning Array Support Limited
QuestDB's array support is focused on specific use cases. For extensive array manipulation:
1. Prefer separate columns for better query performance
2. Handle complex array logic in application code
3. Consider alternative databases if arrays are core to your data model
:::

:::info Related Documentation
- [CAST function](/docs/reference/sql/cast/)
- [Data types](/docs/reference/sql/datatypes/)
- [String functions](/docs/reference/function/text/)
:::
