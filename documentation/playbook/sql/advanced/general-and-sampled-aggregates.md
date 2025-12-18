---
title: General and Sampled Aggregates
sidebar_label: General + sampled aggregates
description: Combine overall statistics with time-bucketed aggregates using CROSS JOIN to show baseline comparisons
---

Calculate both overall (baseline) aggregates and time-bucketed aggregates in the same query using CROSS JOIN. This pattern is essential for comparing current values against historical averages, showing percentage of total, or displaying baseline metrics alongside time-series data.

## Problem: Need Both Total and Time-Series Aggregates

You want to show hourly trade volumes alongside the daily average:

**Without baseline (incomplete picture):**

| hour | volume |
|------|--------|
| 00:00 | 45.6 |
| 01:00 | 34.2 |
| 02:00 | 28.9 |

**With baseline (shows context):**

| hour | volume | daily_avg | vs_avg |
|------|--------|-----------|--------|
| 00:00 | 45.6 | 38.2 | +19.4% |
| 01:00 | 34.2 | 38.2 | -10.5% |
| 02:00 | 28.9 | 38.2 | -24.3% |

## Solution: CROSS JOIN with General Aggregates

Use CROSS JOIN to attach overall statistics to each time-bucketed row:

```questdb-sql demo title="Hourly volumes with daily baseline"
WITH general AS (
  SELECT
    avg(volume_hourly) as daily_avg_volume,
    sum(volume_hourly) as daily_total_volume
  FROM (
    SELECT sum(amount) as volume_hourly
    FROM trades
    WHERE timestamp IN today()
      AND symbol = 'BTC-USDT'
    SAMPLE BY 1h
  )
),
sampled AS (
  SELECT
    timestamp,
    sum(amount) as volume
  FROM trades
  WHERE timestamp IN today()
    AND symbol = 'BTC-USDT'
  SAMPLE BY 1h
)
SELECT
  sampled.timestamp,
  sampled.volume as hourly_volume,
  general.daily_avg_volume,
  (sampled.volume - general.daily_avg_volume) as diff_from_avg,
  ((sampled.volume - general.daily_avg_volume) / general.daily_avg_volume * 100) as pct_diff,
  (sampled.volume / general.daily_total_volume * 100) as pct_of_total
FROM sampled
CROSS JOIN general
ORDER BY sampled.timestamp;
```

**Results:**

| timestamp | hourly_volume | daily_avg_volume | diff_from_avg | pct_diff | pct_of_total |
|-----------|---------------|------------------|---------------|----------|--------------|
| 2025-01-15 00:00 | 45.6 | 38.2 | +7.4 | +19.4% | 4.98% |
| 2025-01-15 01:00 | 34.2 | 38.2 | -4.0 | -10.5% | 3.73% |
| 2025-01-15 02:00 | 28.9 | 38.2 | -9.3 | -24.3% | 3.15% |

## How It Works

### Step 1: Calculate General Aggregates

```sql
WITH general AS (
  SELECT
    avg(volume_hourly) as daily_avg_volume,
    sum(volume_hourly) as daily_total_volume
  FROM (...)
)
```

Creates a CTE with single-row summary statistics (overall average, total, etc.).

### Step 2: Calculate Time-Bucketed Aggregates

```sql
sampled AS (
  SELECT timestamp, sum(amount) as volume
  FROM trades
  SAMPLE BY 1h
)
```

Creates time-series data with one row per interval.

### Step 3: CROSS JOIN

```sql
FROM sampled CROSS JOIN general
```

Attaches the single general row to every sampled row. Since `general` has exactly one row, this repeats that row's values for each time bucket.

## Performance Metrics vs Baseline

Compare recent performance against historical averages:

```questdb-sql demo title="API latency vs 7-day baseline"
WITH baseline AS (
  SELECT
    avg(latency_ms) as avg_latency,
    percentile(latency_ms, 95) as p95_latency,
    percentile(latency_ms, 99) as p99_latency
  FROM api_requests
  WHERE timestamp >= dateadd('d', -7, now())
),
recent AS (
  SELECT
    timestamp,
    avg(latency_ms) as current_latency,
    percentile(latency_ms, 95) as current_p95,
    count(*) as request_count
  FROM api_requests
  WHERE timestamp >= dateadd('h', -1, now())
  SAMPLE BY 5m
)
SELECT
  recent.timestamp,
  recent.request_count,
  recent.current_latency,
  baseline.avg_latency as baseline_latency,
  (recent.current_latency - baseline.avg_latency) as latency_diff,
  recent.current_p95,
  baseline.p95_latency as baseline_p95,
  CASE
    WHEN recent.current_latency > baseline.avg_latency * 1.5 THEN 'WARNING'
    WHEN recent.current_latency > baseline.avg_latency * 2.0 THEN 'CRITICAL'
    ELSE 'OK'
  END as status
FROM recent
CROSS JOIN baseline
ORDER BY recent.timestamp DESC;
```

**Results show current performance with baseline context and alerts.**

## Percentage of Daily Total

Show each hour's contribution to the daily total:

```questdb-sql demo title="Hourly volume as percentage of daily total"
WITH daily_total AS (
  SELECT
    sum(amount) as total_volume,
    count(*) as total_trades
  FROM trades
  WHERE timestamp IN today()
    AND symbol = 'BTC-USDT'
),
hourly AS (
  SELECT
    timestamp,
    sum(amount) as hourly_volume,
    count(*) as hourly_trades
  FROM trades
  WHERE timestamp IN today()
    AND symbol = 'BTC-USDT'
  SAMPLE BY 1h
)
SELECT
  hourly.timestamp,
  hourly.hourly_volume,
  daily_total.total_volume,
  (hourly.hourly_volume / daily_total.total_volume * 100) as volume_pct,
  hourly.hourly_trades,
  (hourly.hourly_trades * 100.0 / daily_total.total_trades) as trade_count_pct
FROM hourly
CROSS JOIN daily_total
ORDER BY hourly.timestamp;
```

**Results:**

| timestamp | hourly_volume | total_volume | volume_pct | hourly_trades | trade_count_pct |
|-----------|---------------|--------------|------------|---------------|-----------------|
| 00:00 | 45.6 | 916.8 | 4.97% | 1,234 | 4.23% |
| 01:00 | 34.2 | 916.8 | 3.73% | 987 | 3.38% |

## Multiple Symbol Comparison with Overall Average

Compare each symbol's volume against the cross-symbol average:

```questdb-sql demo title="Symbol volumes vs market average"
WITH market_avg AS (
  SELECT
    avg(symbol_volume) as avg_volume_per_symbol,
    sum(symbol_volume) as total_market_volume
  FROM (
    SELECT
      symbol,
      sum(amount) as symbol_volume
    FROM trades
    WHERE timestamp >= dateadd('d', -1, now())
    GROUP BY symbol
  )
),
symbol_volumes AS (
  SELECT
    symbol,
    sum(amount) as volume,
    count(*) as trade_count
  FROM trades
  WHERE timestamp >= dateadd('d', -1, now())
  GROUP BY symbol
)
SELECT
  sv.symbol,
  sv.volume,
  sv.trade_count,
  ma.avg_volume_per_symbol,
  (sv.volume / ma.avg_volume_per_symbol) as vs_avg_ratio,
  (sv.volume / ma.total_market_volume * 100) as market_share
FROM symbol_volumes sv
CROSS JOIN market_avg ma
ORDER BY sv.volume DESC
LIMIT 10;
```

**Results:**

| symbol | volume | trade_count | avg_volume_per_symbol | vs_avg_ratio | market_share |
|--------|--------|-------------|-----------------------|--------------|--------------|
| BTC-USDT | 1,234.56 | 45,678 | 234.56 | 5.26 | 45.2% |
| ETH-USDT | 567.89 | 34,567 | 234.56 | 2.42 | 20.8% |

## Z-Score Anomaly Detection

Calculate how many standard deviations current values are from the mean:

```questdb-sql demo title="Anomaly detection with z-scores"
WITH stats AS (
  SELECT
    avg(volume_5m) as mean_volume,
    stddev(volume_5m) as stddev_volume
  FROM (
    SELECT sum(amount) as volume_5m
    FROM trades
    WHERE timestamp >= dateadd('d', -7, now())
      AND symbol = 'BTC-USDT'
    SAMPLE BY 5m
  )
),
recent AS (
  SELECT
    timestamp,
    sum(amount) as volume
  FROM trades
  WHERE timestamp >= dateadd('h', -1, now())
    AND symbol = 'BTC-USDT'
  SAMPLE BY 5m
)
SELECT
  recent.timestamp,
  recent.volume,
  stats.mean_volume,
  stats.stddev_volume,
  ((recent.volume - stats.mean_volume) / stats.stddev_volume) as z_score,
  CASE
    WHEN ABS((recent.volume - stats.mean_volume) / stats.stddev_volume) > 3 THEN 'ANOMALY'
    WHEN ABS((recent.volume - stats.mean_volume) / stats.stddev_volume) > 2 THEN 'UNUSUAL'
    ELSE 'NORMAL'
  END as classification
FROM recent
CROSS JOIN stats
ORDER BY recent.timestamp DESC;
```

**Key points:**
- Z-score > 2: Unusual (95th percentile)
- Z-score > 3: Anomaly (99.7th percentile)
- Works for any metric (volume, latency, error rate, etc.)

## Time-of-Day Comparison

Compare current hour against historical average for same hour of day:

```questdb-sql demo title="Current hour vs historical same-hour average"
WITH historical_by_hour AS (
  SELECT
    hour(timestamp) as hour_of_day,
    avg(hourly_volume) as avg_volume_this_hour,
    stddev(hourly_volume) as stddev_volume_this_hour
  FROM (
    SELECT
      timestamp,
      sum(amount) as hourly_volume
    FROM trades
    WHERE timestamp >= dateadd('d', -30, now())
      AND symbol = 'BTC-USDT'
    SAMPLE BY 1h
  )
  GROUP BY hour_of_day
),
current_hour AS (
  SELECT
    timestamp,
    hour(timestamp) as hour_of_day,
    sum(amount) as volume
  FROM trades
  WHERE timestamp IN today()
    AND symbol = 'BTC-USDT'
  SAMPLE BY 1h
)
SELECT
  current_hour.timestamp,
  current_hour.volume as current_volume,
  historical_by_hour.avg_volume_this_hour as historical_avg,
  ((current_hour.volume - historical_by_hour.avg_volume_this_hour) /
   historical_by_hour.avg_volume_this_hour * 100) as pct_diff_from_historical
FROM current_hour
LEFT JOIN historical_by_hour
  ON current_hour.hour_of_day = historical_by_hour.hour_of_day
ORDER BY current_hour.timestamp;
```

Note: This uses LEFT JOIN instead of CROSS JOIN because we're matching on hour_of_day.

## Grafana Baseline Visualization

Format for Grafana with baseline reference line:

```questdb-sql demo title="Time-series with baseline for Grafana"
WITH baseline AS (
  SELECT avg(response_time_ms) as avg_response_time
  FROM api_metrics
  WHERE timestamp >= dateadd('d', -7, now())
),
timeseries AS (
  SELECT
    timestamp as time,
    avg(response_time_ms) as current_response_time
  FROM api_metrics
  WHERE $__timeFilter(timestamp)
  SAMPLE BY $__interval
)
SELECT
  timeseries.time,
  timeseries.current_response_time as "Current",
  baseline.avg_response_time as "7-Day Average"
FROM timeseries
CROSS JOIN baseline
ORDER BY timeseries.time;
```

Grafana will plot both series, making it easy to see when current values deviate from baseline.

## Simplification: Single Query Without CTE

For simple cases, you can inline the general aggregate:

```sql
SELECT
  timestamp,
  sum(amount) as volume,
  (SELECT avg(sum(amount)) FROM trades WHERE timestamp IN today() SAMPLE BY 1h) as daily_avg
FROM trades
WHERE timestamp IN today()
SAMPLE BY 1h;
```

However, CTE with CROSS JOIN is more readable and efficient when you need multiple baseline metrics.

## Performance Considerations

**General CTE is calculated once:**

```sql
WITH general AS (
  SELECT expensive_aggregate FROM large_table  -- Calculated ONCE
)
SELECT * FROM timeseries CROSS JOIN general;  -- General reused for all rows
```

**Filter data in both CTEs:**

```sql
WITH general AS (
  SELECT avg(value) as baseline
  FROM metrics
  WHERE timestamp >= dateadd('d', -7, now())  -- Same filter
),
recent AS (
  SELECT timestamp, value
  FROM metrics
  WHERE timestamp >= dateadd('d', -7, now())  -- Same filter
  SAMPLE BY 1h
)
```

Both queries benefit from the same timestamp index usage.

## Alternative: Window Functions

For running comparisons, window functions can be more appropriate:

```sql
-- CROSS JOIN pattern: Compare against fixed baseline
WITH baseline AS (SELECT avg(value) FROM metrics)
SELECT value, baseline FROM timeseries CROSS JOIN baseline;

-- Window function: Compare against moving average
SELECT
  value,
  avg(value) OVER (ORDER BY timestamp ROWS BETWEEN 10 PRECEDING AND CURRENT ROW) as moving_avg
FROM timeseries;
```

Use CROSS JOIN when you want a **fixed baseline** (e.g., "7-day average").
Use window functions for **dynamic baselines** (e.g., "10-period moving average").

:::tip When to Use This Pattern
Use CROSS JOIN with general aggregates when you need:
- Percentage of total calculations
- Baseline comparisons (current vs historical average)
- Context for time-series data (is this value high or low?)
- Z-scores or statistical anomaly detection
- Reference lines in Grafana dashboards
:::

:::warning CROSS JOIN Behavior
CROSS JOIN creates a cartesian product. This only works efficiently when one side has exactly **one row** (the general aggregates). Never CROSS JOIN two multi-row tables - it will explode your result set.

Safe: `SELECT * FROM timeseries CROSS JOIN (SELECT avg(...))` ← Second table has 1 row
Dangerous: `SELECT * FROM table1 CROSS JOIN table2` ← Both have many rows
:::

:::info Related Documentation
- [CROSS JOIN](/docs/reference/sql/join/#cross-join)
- [Common Table Expressions (WITH)](/docs/reference/sql/with/)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [Window functions (for alternative approaches)](/docs/reference/sql/select/#window-functions)
:::
