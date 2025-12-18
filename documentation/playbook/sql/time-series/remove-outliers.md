---
title: Remove Outliers from Time-Series
sidebar_label: Remove outliers
description: Filter anomalous data points using moving averages, standard deviation, percentiles, and z-scores
---

Identify and filter outliers from time-series data using statistical methods. Outliers can skew aggregates, distort visualizations, and trigger false alerts. This guide shows multiple approaches to detect and remove anomalous values.

## Problem: Noisy Sensor Data with Spikes

You have temperature sensor readings with occasional erroneous spikes:

| timestamp | sensor_id | temperature |
|-----------|-----------|-------------|
| 10:00:00  | S001 | 22.5 |
| 10:01:00  | S001 | 22.7 |
| 10:02:00  | S001 | 89.3 | ← Outlier (sensor malfunction)
| 10:03:00  | S001 | 22.6 |
| 10:04:00  | S001 | 22.8 |

The spike at 10:02 should be filtered out before calculating averages or displaying charts.

## Solution 1: Moving Average Filter

Remove values that deviate significantly from the moving average:

```questdb-sql demo title="Filter outliers using moving average"
WITH moving_avg AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    avg(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 5 PRECEDING AND 5 FOLLOWING
    ) as ma,
    stddev(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 5 PRECEDING AND 5 FOLLOWING
    ) as stddev
  FROM sensor_readings
  WHERE timestamp >= dateadd('h', -24, now())
)
SELECT
  timestamp,
  sensor_id,
  temperature,
  ma as moving_average
FROM moving_avg
WHERE ABS(temperature - ma) <= 2 * stddev  -- Within 2 standard deviations
ORDER BY timestamp;
```

**How it works:**
- Calculate 11-point moving average (5 before + current + 5 after)
- Calculate moving standard deviation
- Keep only values within 2σ of moving average
- Typical threshold: 2σ retains ~95% of normal data, 3σ retains ~99.7%

**Results:**

| timestamp | sensor_id | temperature | moving_average |
|-----------|-----------|-------------|----------------|
| 10:00:00  | S001 | 22.5 | 22.6 |
| 10:01:00  | S001 | 22.7 | 22.6 |
| 10:03:00  | S001 | 22.6 | 22.7 | ← 10:02 filtered out
| 10:04:00  | S001 | 22.8 | 22.7 |

## Solution 2: Percentile-Based Filtering

Remove values outside a percentile range (e.g., below 1st or above 99th percentile):

```questdb-sql demo title="Filter extreme values using percentiles"
WITH percentiles AS (
  SELECT
    sensor_id,
    percentile(temperature, 1) as p01,
    percentile(temperature, 99) as p99
  FROM sensor_readings
  WHERE timestamp >= dateadd('d', -7, now())
  GROUP BY sensor_id
)
SELECT
  sr.timestamp,
  sr.sensor_id,
  sr.temperature
FROM sensor_readings sr
INNER JOIN percentiles p ON sr.sensor_id = p.sensor_id
WHERE sr.timestamp >= dateadd('h', -1, now())
  AND sr.temperature BETWEEN p.p01 AND p.p99
ORDER BY sr.timestamp;
```

**Key points:**
- Calculates baseline percentiles from historical data (7 days)
- Filters recent data (1 hour) using those thresholds
- Adaptable: Use p05/p95 for less aggressive filtering
- Useful when distribution is not normal (skewed data)

## Solution 3: Z-Score Method

Calculate z-scores and filter values beyond a threshold:

```questdb-sql demo title="Remove outliers using z-scores"
WITH stats AS (
  SELECT
    sensor_id,
    avg(temperature) as mean_temp,
    stddev(temperature) as stddev_temp
  FROM sensor_readings
  WHERE timestamp >= dateadd('d', -7, now())
  GROUP BY sensor_id
),
z_scores AS (
  SELECT
    sr.timestamp,
    sr.sensor_id,
    sr.temperature,
    ((sr.temperature - stats.mean_temp) / stats.stddev_temp) as z_score
  FROM sensor_readings sr
  INNER JOIN stats ON sr.sensor_id = stats.sensor_id
  WHERE sr.timestamp >= dateadd('h', -1, now())
)
SELECT
  timestamp,
  sensor_id,
  temperature,
  z_score
FROM z_scores
WHERE ABS(z_score) <= 3  -- Within 3 standard deviations
ORDER BY timestamp;
```

**Z-score interpretation:**
- |z| < 2: Normal (95% of data)
- |z| < 3: Acceptable (99.7% of data)
- |z| ≥ 3: Outlier (0.3% of data)

**Results:**

| timestamp | sensor_id | temperature | z_score |
|-----------|-----------|-------------|---------|
| 10:00:00  | S001 | 22.5 | -0.12 |
| 10:01:00  | S001 | 22.7 | +0.15 |
| 10:03:00  | S001 | 22.6 | +0.02 |
| 10:04:00  | S001 | 22.8 | +0.28 |

10:02 (z_score = 15.3) was filtered out.

## Solution 4: Interquartile Range (IQR)

Use IQR method for robust outlier detection (less sensitive to extreme values):

```questdb-sql demo title="IQR-based outlier removal"
WITH quartiles AS (
  SELECT
    sensor_id,
    percentile(temperature, 25) as q1,
    percentile(temperature, 75) as q3,
    (percentile(temperature, 75) - percentile(temperature, 25)) as iqr
  FROM sensor_readings
  WHERE timestamp >= dateadd('d', -7, now())
  GROUP BY sensor_id
)
SELECT
  sr.timestamp,
  sr.sensor_id,
  sr.temperature
FROM sensor_readings sr
INNER JOIN quartiles q ON sr.sensor_id = q.sensor_id
WHERE sr.timestamp >= dateadd('h', -1, now())
  AND sr.temperature >= q.q1 - 1.5 * q.iqr  -- Lower fence
  AND sr.temperature <= q.q3 + 1.5 * q.iqr  -- Upper fence
ORDER BY sr.timestamp;
```

**IQR boundaries:**
- Lower fence = Q1 - 1.5 × IQR
- Upper fence = Q3 + 1.5 × IQR
- More robust than z-scores for skewed distributions
- Standard multiplier is 1.5; use 3.0 for more conservative filtering

## Solution 5: Rate of Change Filter

Remove values with impossible rate of change:

```questdb-sql demo title="Filter based on maximum rate of change"
WITH deltas AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    temperature - lag(temperature) OVER (PARTITION BY sensor_id ORDER BY timestamp) as temp_change,
    timestamp - lag(timestamp) OVER (PARTITION BY sensor_id ORDER BY timestamp) as time_diff_micros
  FROM sensor_readings
  WHERE timestamp >= dateadd('h', -24, now())
)
SELECT
  timestamp,
  sensor_id,
  temperature,
  temp_change,
  (temp_change / (time_diff_micros / 60000000.0)) as change_per_minute
FROM deltas
WHERE temp_change IS NULL  -- Keep first reading
  OR ABS(temp_change / (time_diff_micros / 60000000.0)) <= 5.0  -- Max 5°C per minute
ORDER BY timestamp;
```

**Use case:**
- Temperature can't change by 50°C in 1 minute (physical impossibility)
- Stock prices can't change by 100% in 1 second (circuit breaker rules)
- Sensor readings limited by physical constraints

## Combination: Multi-Method Outlier Detection

Use multiple methods and flag values detected by any:

```questdb-sql demo title="Flag outliers using multiple methods"
WITH stats AS (
  SELECT
    sensor_id,
    avg(temperature) as mean,
    stddev(temperature) as stddev,
    percentile(temperature, 1) as p01,
    percentile(temperature, 99) as p99
  FROM sensor_readings
  WHERE timestamp >= dateadd('d', -7, now())
  GROUP BY sensor_id
),
flagged AS (
  SELECT
    sr.timestamp,
    sr.sensor_id,
    sr.temperature,
    CASE WHEN ABS((sr.temperature - stats.mean) / stats.stddev) > 3 THEN 1 ELSE 0 END as outlier_zscore,
    CASE WHEN sr.temperature < stats.p01 OR sr.temperature > stats.p99 THEN 1 ELSE 0 END as outlier_percentile,
    CASE WHEN sr.temperature < 0 OR sr.temperature > 50 THEN 1 ELSE 0 END as outlier_range
  FROM sensor_readings sr
  INNER JOIN stats ON sr.sensor_id = stats.sensor_id
  WHERE sr.timestamp >= dateadd('h', -1, now())
)
SELECT
  timestamp,
  sensor_id,
  temperature,
  (outlier_zscore + outlier_percentile + outlier_range) as outlier_score,
  CASE
    WHEN (outlier_zscore + outlier_percentile + outlier_range) >= 2 THEN 'OUTLIER'
    WHEN (outlier_zscore + outlier_percentile + outlier_range) = 1 THEN 'SUSPICIOUS'
    ELSE 'NORMAL'
  END as classification
FROM flagged
WHERE (outlier_zscore + outlier_percentile + outlier_range) = 0  -- Keep only clean data
ORDER BY timestamp;
```

Only keep values that pass all three tests.

## Replace Outliers with Interpolation

Instead of removing, replace outliers with interpolated values:

```questdb-sql demo title="Replace outliers with linear interpolation"
WITH moving_avg AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    avg(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 10 PRECEDING AND 10 FOLLOWING
    ) as ma,
    stddev(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 10 PRECEDING AND 10 FOLLOWING
    ) as stddev
  FROM sensor_readings
  WHERE timestamp >= dateadd('h', -24, now())
)
SELECT
  timestamp,
  sensor_id,
  CASE
    WHEN ABS(temperature - ma) > 3 * stddev THEN ma  -- Replace outlier with moving average
    ELSE temperature  -- Keep original value
  END as temperature_cleaned
FROM moving_avg
ORDER BY timestamp;
```

This preserves data density while smoothing anomalies.

## Aggregated Data with Outlier Removal

Calculate clean aggregates by filtering outliers first:

```questdb-sql demo title="Hourly average with outliers removed"
WITH filtered AS (
  SELECT
    timestamp,
    sensor_id,
    temperature
  FROM sensor_readings sr
  WHERE timestamp >= dateadd('d', -1, now())
    AND temperature BETWEEN (
      SELECT percentile(temperature, 1) FROM sensor_readings
      WHERE sensor_id = sr.sensor_id AND timestamp >= dateadd('d', -7, now())
    ) AND (
      SELECT percentile(temperature, 99) FROM sensor_readings
      WHERE sensor_id = sr.sensor_id AND timestamp >= dateadd('d', -7, now())
    )
)
SELECT
  timestamp,
  sensor_id,
  avg(temperature) as avg_temp,
  min(temperature) as min_temp,
  max(temperature) as max_temp,
  count(*) as reading_count
FROM filtered
SAMPLE BY 1h
ORDER BY timestamp;
```

**Results show clean aggregates without spike distortion.**

## Grafana Visualization: Before and After

Show both raw and cleaned data for comparison:

```questdb-sql demo title="Overlay raw and cleaned data for Grafana"
WITH moving_avg AS (
  SELECT
    timestamp,
    sensor_id,
    temperature,
    avg(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 10 PRECEDING AND 10 FOLLOWING
    ) as ma,
    stddev(temperature) OVER (
      PARTITION BY sensor_id
      ORDER BY timestamp
      ROWS BETWEEN 10 PRECEDING AND 10 FOLLOWING
    ) as stddev
  FROM sensor_readings
  WHERE timestamp >= dateadd('h', -6, now())
    AND sensor_id = 'S001'
)
SELECT
  timestamp as time,
  temperature as "Raw Data",
  CASE
    WHEN ABS(temperature - ma) <= 2 * stddev THEN temperature
    ELSE NULL
  END as "Cleaned Data"
FROM moving_avg
ORDER BY timestamp;
```

Grafana will show both series, making outliers visually obvious as gaps in the "Cleaned Data" series.

## Performance Considerations

**Pre-calculate thresholds for repeated queries:**

```sql
-- Create table with outlier thresholds
CREATE TABLE sensor_thresholds AS
SELECT
  sensor_id,
  avg(temperature) as mean,
  stddev(temperature) as stddev,
  percentile(temperature, 1) as p01,
  percentile(temperature, 99) as p99
FROM sensor_readings
WHERE timestamp >= dateadd('d', -30, now())
GROUP BY sensor_id;

-- Fast filtering using pre-calculated thresholds
SELECT sr.*
FROM sensor_readings sr
INNER JOIN sensor_thresholds st ON sr.sensor_id = st.sensor_id
WHERE ABS((sr.temperature - st.mean) / st.stddev) <= 3;
```

**Use SYMBOL type for sensor_id:**

```sql
CREATE TABLE sensor_readings (
  timestamp TIMESTAMP,
  sensor_id SYMBOL,  -- Fast lookups and joins
  temperature DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

## Choosing the Right Method

| Method | Best For | Pros | Cons |
|--------|----------|------|------|
| **Moving Average** | Smoothly varying data with occasional spikes | Adaptive to local trends | Requires window tuning |
| **Percentiles** | Skewed distributions | Robust to outliers | Less sensitive to mild anomalies |
| **Z-Score** | Normally distributed data | Simple, well-understood | Assumes normal distribution |
| **IQR** | Robust detection needed | Not affected by extreme outliers | May miss subtle anomalies |
| **Rate of Change** | Physical constraints known | Catches impossible values | Requires domain knowledge |

## Common Pitfalls

**Don't calculate stats on already-filtered data:**

```sql
-- Bad: Circular logic
WITH filtered AS (
  SELECT * FROM data WHERE value < (SELECT avg(value) FROM data)
)
SELECT avg(value) FROM filtered;  -- Not meaningful!

-- Good: Calculate stats on full historical dataset
WITH stats AS (
  SELECT avg(value) as baseline FROM data WHERE timestamp >= dateadd('d', -30, now())
)
SELECT * FROM recent_data WHERE value < baseline.value;
```

**Consider seasonality:**

```sql
-- Bad: Compare summer temps to winter average
SELECT * FROM readings WHERE temp < (SELECT avg(temp) FROM readings);

-- Good: Compare to same time of year
SELECT * FROM readings r
WHERE temp < (
  SELECT avg(temp)
  FROM readings
  WHERE month(timestamp) = month(r.timestamp)
);
```

:::tip When to Remove vs Flag Outliers
- **Remove**: For clean aggregates, visualizations, or ML training data
- **Flag**: For monitoring, alerts, or investigating sensor malfunctions
- **Replace**: When data density must be preserved (e.g., for resampling)
:::

:::warning False Positives
Aggressive outlier removal can filter legitimate extreme events:
- Legitimate price movements during market crashes
- Actual temperature spikes during equipment failure
- Real traffic surges during viral events

Balance cleanliness with preserving genuine anomalies worth investigating.
:::

:::info Related Documentation
- [Window functions](/docs/reference/sql/select/#window-functions)
- [stddev()](/docs/reference/function/aggregation/#stddev)
- [percentile()](/docs/reference/function/aggregation/#percentile)
- [LAG()](/docs/reference/function/window/#lag)
:::
