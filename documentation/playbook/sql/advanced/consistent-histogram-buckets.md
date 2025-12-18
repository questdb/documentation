---
title: Consistent Histogram Buckets
sidebar_label: Histogram buckets
description: Generate histogram data with fixed bucket boundaries for consistent time-series distribution analysis
---

Create histograms with consistent bucket boundaries across different time periods. This ensures that distributions are comparable over time, essential for monitoring metric distributions, latency percentiles, and value ranges in dashboards.

## Problem: Inconsistent Histogram Buckets

You want to track the distribution of trade sizes over time:

**Naive approach (inconsistent buckets):**
```sql
SELECT
  CASE
    WHEN amount < 1.0 THEN 'small'
    WHEN amount < 10.0 THEN 'medium'
    ELSE 'large'
  END as bucket,
  count(*) as count
FROM trades
GROUP BY bucket;
```

This works for a single query, but comparing histograms across different time periods or symbols becomes difficult when bucket boundaries aren't precisely defined.

## Solution: Fixed Numeric Buckets

Define consistent bucket boundaries using integer division:

```questdb-sql demo title="Histogram with fixed 0.5 BTC buckets"
SELECT
  (cast(amount / 0.5 AS INT) * 0.5) as bucket_start,
  ((cast(amount / 0.5 AS INT) + 1) * 0.5) as bucket_end,
  count(*) as count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('d', -1, now())
GROUP BY bucket_start, bucket_end
ORDER BY bucket_start;
```

**Results:**

| bucket_start | bucket_end | count |
|--------------|------------|-------|
| 0.0 | 0.5 | 1,234 |
| 0.5 | 1.0 | 890 |
| 1.0 | 1.5 | 456 |
| 1.5 | 2.0 | 234 |
| 2.0 | 2.5 | 123 |

## How It Works

### Bucket Calculation

```sql
cast(amount / 0.5 AS INT) * 0.5
```

**Step by step:**
1. `amount / 0.5`: Divide by bucket width (amount 1.3 → 2.6)
2. `cast(... AS INT)`: Truncate to integer (2.6 → 2)
3. `* 0.5`: Multiply back by bucket width (2 → 1.0)

**Examples:**
- amount = 0.3 → 0.3/0.5=0.6 → INT(0.6)=0 → 0*0.5=0.0
- amount = 1.3 → 1.3/0.5=2.6 → INT(2.6)=2 → 2*0.5=1.0
- amount = 2.7 → 2.7/0.5=5.4 → INT(5.4)=5 → 5*0.5=2.5

### Bucket End

```sql
(cast(amount / 0.5 AS INT) + 1) * 0.5
```

Add 1 before multiplying back to get the upper boundary.

## Dynamic Bucket Width

Use a variable for easy adjustment:

```questdb-sql demo title="Configurable bucket width"
WITH bucketed AS (
  SELECT
    amount,
    0.25 as bucket_width,  -- Change this to adjust granularity
    (cast(amount / 0.25 AS INT) * 0.25) as bucket_start
  FROM trades
  WHERE symbol = 'BTC-USDT'
    AND timestamp >= dateadd('d', -1, now())
)
SELECT
  bucket_start,
  (bucket_start + bucket_width) as bucket_end,
  count(*) as count,
  sum(amount) as total_volume
FROM bucketed
GROUP BY bucket_start, bucket_width
ORDER BY bucket_start;
```

**Bucket widths by use case:**
- Latency (milliseconds): 10ms, 50ms, 100ms
- Trade sizes: 0.1, 0.5, 1.0
- Prices: 100, 500, 1000
- Temperatures: 1°C, 5°C, 10°C

## Time-Series Histogram

Track distribution changes over time:

```questdb-sql demo title="Hourly histogram evolution"
SELECT
  timestamp_floor('h', timestamp) as hour,
  (cast(amount / 0.5 AS INT) * 0.5) as bucket,
  count(*) as count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('d', -7, now())
GROUP BY hour, bucket
ORDER BY hour DESC, bucket;
```

**Results:**

| hour | bucket | count |
|------|--------|-------|
| 2025-01-15 23:00 | 0.0 | 345 |
| 2025-01-15 23:00 | 0.5 | 234 |
| 2025-01-15 23:00 | 1.0 | 123 |
| 2025-01-15 22:00 | 0.0 | 312 |
| 2025-01-15 22:00 | 0.5 | 245 |

This shows how the distribution shifts over time.

## Grafana Heatmap Visualization

Format for Grafana heatmap:

```questdb-sql demo title="Heatmap data for Grafana"
SELECT
  timestamp_floor('5m', timestamp) as time,
  (cast(latency_ms / 10 AS INT) * 10) as bucket,
  count(*) as count
FROM api_requests
WHERE $__timeFilter(timestamp)
GROUP BY time, bucket
ORDER BY time, bucket;
```

**Grafana configuration:**
- Visualization: Heatmap
- X-axis: time
- Y-axis: bucket (latency range)
- Cell value: count

Creates a heatmap showing latency distribution evolution over time.

## Logarithmic Buckets

For data spanning multiple orders of magnitude:

```questdb-sql demo title="Logarithmic buckets for wide value ranges"
SELECT
  POWER(10, cast(log10(amount) AS INT)) as bucket_start,
  POWER(10, cast(log10(amount) AS INT) + 1) as bucket_end,
  count(*) as count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND amount > 0
  AND timestamp >= dateadd('d', -1, now())
GROUP BY bucket_start, bucket_end
ORDER BY bucket_start;
```

**Results:**

| bucket_start | bucket_end | count |
|--------------|------------|-------|
| 0.01 | 0.1 | 1,234 |
| 0.1 | 1.0 | 4,567 |
| 1.0 | 10.0 | 2,345 |
| 10.0 | 100.0 | 123 |

**Use cases:**
- Response times (1ms to 10s)
- File sizes (1KB to 1GB)
- Memory usage (1MB to 10GB)

## Percentile Buckets

Create buckets representing percentile ranges:

```questdb-sql demo title="Percentile-based buckets"
WITH percentiles AS (
  SELECT
    percentile(price, 10) as p10,
    percentile(price, 25) as p25,
    percentile(price, 50) as p50,
    percentile(price, 75) as p75,
    percentile(price, 90) as p90
  FROM trades
  WHERE symbol = 'BTC-USDT'
    AND timestamp >= dateadd('d', -30, now())
)
SELECT
  CASE
    WHEN price < p10 THEN '< P10'
    WHEN price < p25 THEN 'P10-P25'
    WHEN price < p50 THEN 'P25-P50'
    WHEN price < p75 THEN 'P50-P75'
    WHEN price < p90 THEN 'P75-P90'
    ELSE '> P90'
  END as percentile_bucket,
  count(*) as count,
  (count(*) * 100.0 / sum(count(*)) OVER ()) as percentage
FROM trades, percentiles
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('d', -1, now())
GROUP BY percentile_bucket, p10, p25, p50, p75, p90
ORDER BY
  CASE percentile_bucket
    WHEN '< P10' THEN 1
    WHEN 'P10-P25' THEN 2
    WHEN 'P25-P50' THEN 3
    WHEN 'P50-P75' THEN 4
    WHEN 'P75-P90' THEN 5
    ELSE 6
  END;
```

This shows what percentage of recent trades fall into each historical percentile range.

## Cumulative Distribution

Calculate cumulative counts for CDF visualization:

```questdb-sql demo title="Cumulative distribution function"
WITH histogram AS (
  SELECT
    (cast(amount / 0.5 AS INT) * 0.5) as bucket,
    count(*) as count
  FROM trades
  WHERE symbol = 'BTC-USDT'
    AND timestamp >= dateadd('d', -1, now())
  GROUP BY bucket
)
SELECT
  bucket,
  count,
  sum(count) OVER (ORDER BY bucket) as cumulative_count,
  (sum(count) OVER (ORDER BY bucket) * 100.0 /
   sum(count) OVER ()) as cumulative_percentage
FROM histogram
ORDER BY bucket;
```

**Results:**

| bucket | count | cumulative_count | cumulative_percentage |
|--------|-------|------------------|----------------------|
| 0.0 | 1,234 | 1,234 | 40.2% |
| 0.5 | 890 | 2,124 | 69.1% |
| 1.0 | 456 | 2,580 | 84.0% |
| 1.5 | 234 | 2,814 | 91.6% |

Shows that 84% of trades are 1.5 BTC or less.

## Multi-Dimensional Histogram

Bucket by two dimensions:

```questdb-sql demo title="2D histogram: amount vs price range"
SELECT
  (cast(amount / 0.5 AS INT) * 0.5) as amount_bucket,
  (cast(price / 1000 AS INT) * 1000) as price_bucket,
  count(*) as count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('d', -1, now())
GROUP BY amount_bucket, price_bucket
HAVING count > 10  -- Filter sparse buckets
ORDER BY amount_bucket, price_bucket;
```

**Results:**

| amount_bucket | price_bucket | count |
|---------------|--------------|-------|
| 0.0 | 61000 | 234 |
| 0.0 | 62000 | 345 |
| 0.5 | 61000 | 123 |
| 0.5 | 62000 | 156 |

## Adaptive Bucketing

Adjust bucket width based on data density:

```questdb-sql demo title="Fine-grained buckets for common ranges"
SELECT
  CASE
    WHEN amount < 1.0 THEN cast(amount / 0.1 AS INT) * 0.1  -- 0.1 BTC buckets
    WHEN amount < 10.0 THEN cast(amount / 1.0 AS INT) * 1.0  -- 1 BTC buckets
    ELSE cast(amount / 10.0 AS INT) * 10.0  -- 10 BTC buckets
  END as bucket,
  count(*) as count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('d', -1, now())
GROUP BY bucket
ORDER BY bucket;
```

Provides more detail in common ranges, broader buckets for rare large trades.

## Comparison Across Symbols

Compare distributions using consistent buckets:

```questdb-sql demo title="Compare trade size distributions"
SELECT
  symbol,
  (cast(amount / 0.5 AS INT) * 0.5) as bucket,
  count(*) as count,
  avg(price) as avg_price
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
  AND timestamp >= dateadd('d', -1, now())
GROUP BY symbol, bucket
ORDER BY symbol, bucket;
```

Shows whether trade size patterns differ between assets.

## Performance Optimization

**Index usage:**
```sql
-- Ensure timestamp and symbol are indexed
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL INDEX,  -- SYMBOL type has implicit index
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**Pre-aggregate for dashboards:**
```sql
-- Create hourly histogram summary
CREATE TABLE trade_histogram_hourly AS
SELECT
  timestamp_floor('h', timestamp) as hour,
  symbol,
  (cast(amount / 0.5 AS INT) * 0.5) as bucket,
  count(*) as count,
  sum(amount) as total_volume
FROM trades
SAMPLE BY 1h;

-- Query summary instead of raw data
SELECT * FROM trade_histogram_hourly WHERE hour >= dateadd('d', -7, now());
```

**Limit bucket range:**
```sql
-- Exclude extreme outliers
WHERE amount BETWEEN 0.01 AND 100
```

Prevents single extreme values from creating many empty buckets.

## Common Pitfalls

**Empty buckets not shown:**
```sql
-- This only returns buckets with data
SELECT bucket, count(*) FROM ... GROUP BY bucket;

-- To include empty buckets, use generate_series or CROSS JOIN
```

**Floating point precision:**
```sql
-- Bad: May have precision issues
cast(amount / 0.1 AS INT) * 0.1

-- Better: Use integers where possible
cast(amount * 10 AS INT) / 10.0
```

**Negative values:**
```sql
-- Handle negative values correctly
SIGN(value) * (cast(ABS(value) / bucket_width AS INT) * bucket_width)
```

:::tip Choosing Bucket Width
Select bucket width based on:
- **Data range**: 10-50 buckets typically ideal for visualization
- **Precision needed**: Smaller buckets for detailed analysis
- **Query performance**: Fewer buckets = faster aggregation
- **Visual clarity**: Too many buckets create cluttered charts

Formula: `bucket_width = (max - min) / target_bucket_count`
:::

:::warning Grafana Heatmap Requirements
Grafana heatmaps require:
1. Time column named `time`
2. Numeric bucket column
3. Count/value column
4. Data sorted by time, then bucket
5. Consistent bucket boundaries across all time periods
:::

:::info Related Documentation
- [Aggregate functions](/docs/reference/function/aggregation/)
- [CAST function](/docs/reference/sql/cast/)
- [percentile()](/docs/reference/function/aggregation/#approx_percentile)
- [Window functions](/docs/reference/sql/over/)
:::
