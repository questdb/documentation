---
title: Join Strategies for Sparse Sensor Data
sidebar_label: Sparse sensor data
description: Compare CROSS JOIN, LEFT JOIN, and ASOF JOIN strategies for combining data from sensors that report at different times
---

Combine data from multiple sensors that report at different times and frequencies. This guide compares three join strategies—CROSS JOIN, LEFT JOIN, and ASOF JOIN—showing when to use each for optimal results.

## Problem: Sensors Report at Different Times

You have three temperature sensors with different reporting schedules:

**Sensor A (every 1 minute):**
| timestamp | temperature |
|-----------|-------------|
| 10:00:00  | 22.5 |
| 10:01:00  | 22.7 |
| 10:02:00  | 22.6 |

**Sensor B (every 2 minutes):**
| timestamp | temperature |
|-----------|-------------|
| 10:00:00  | 23.1 |
| 10:02:00  | 23.3 |

**Sensor C (irregular):**
| timestamp | temperature |
|-----------|-------------|
| 10:00:30  | 21.8 |
| 10:01:45  | 22.0 |

You want to analyze all sensors together, but their timestamps don't align.

## Strategy 1: CROSS JOIN for Complete Combinations

Generate all possible combinations of readings across sensors:

```questdb-sql demo title="CROSS JOIN all sensor combinations"
WITH sensor_a AS (
  SELECT timestamp as ts_a, temperature as temp_a
  FROM sensor_readings
  WHERE sensor_id = 'A'
    AND timestamp >= '2025-01-15T10:00:00'
    AND timestamp < '2025-01-15T10:10:00'
),
sensor_b AS (
  SELECT timestamp as ts_b, temperature as temp_b
  FROM sensor_readings
  WHERE sensor_id = 'B'
    AND timestamp >= '2025-01-15T10:00:00'
    AND timestamp < '2025-01-15T10:10:00'
)
SELECT
  sensor_a.ts_a,
  sensor_a.temp_a,
  sensor_b.ts_b,
  sensor_b.temp_b,
  ABS(sensor_a.ts_a - sensor_b.ts_b) / 1000000 as time_diff_seconds
FROM sensor_a
CROSS JOIN sensor_b
WHERE ABS(sensor_a.ts_a - sensor_b.ts_b) < 30000000  -- Within 30 seconds
ORDER BY sensor_a.ts_a, sensor_b.ts_b;
```

**Results:**

| ts_a | temp_a | ts_b | temp_b | time_diff_seconds |
|------|--------|------|--------|-------------------|
| 10:00:00 | 22.5 | 10:00:00 | 23.1 | 0 |
| 10:01:00 | 22.7 | 10:00:00 | 23.1 | 60 | ← Matched to previous B reading
| 10:02:00 | 22.6 | 10:02:00 | 23.3 | 0 |

**When to use:**
- Small datasets (CROSS JOIN creates N × M rows)
- Need all combinations within a time window
- Analyzing correlation between sensors with tolerance

**Pros:**
- Simple to understand
- Captures all possible pairings
- Can filter by time difference after joining

**Cons:**
- Explodes result set (cartesian product)
- Not scalable for large datasets
- May create duplicate matches

## Strategy 2: LEFT JOIN on Common Intervals

Resample both sensors to common intervals, then join:

```questdb-sql demo title="LEFT JOIN after resampling to common intervals"
WITH sensor_a_resampled AS (
  SELECT timestamp, first(temperature) as temp_a
  FROM sensor_readings
  WHERE sensor_id = 'A'
    AND timestamp >= '2025-01-15T10:00:00'
    AND timestamp < '2025-01-15T10:10:00'
  SAMPLE BY 1m FILL(PREV)
),
sensor_b_resampled AS (
  SELECT timestamp, first(temperature) as temp_b
  FROM sensor_readings
  WHERE sensor_id = 'B'
    AND timestamp >= '2025-01-15T10:00:00'
    AND timestamp < '2025-01-15T10:10:00'
  SAMPLE BY 1m FILL(PREV)
)
SELECT
  sensor_a_resampled.timestamp,
  sensor_a_resampled.temp_a,
  sensor_b_resampled.temp_b,
  (sensor_a_resampled.temp_a - sensor_b_resampled.temp_b) as temp_difference
FROM sensor_a_resampled
LEFT JOIN sensor_b_resampled
  ON sensor_a_resampled.timestamp = sensor_b_resampled.timestamp
ORDER BY sensor_a_resampled.timestamp;
```

**Results:**

| timestamp | temp_a | temp_b | temp_difference |
|-----------|--------|--------|-----------------|
| 10:00:00  | 22.5   | 23.1   | -0.6 |
| 10:01:00  | 22.7   | 23.1   | -0.4 | ← B value filled forward
| 10:02:00  | 22.6   | 23.3   | -0.7 |

**When to use:**
- Sensors can be resampled to common frequency
- Want aligned timestamps for easy comparison
- Need forward-filled or interpolated values

**Pros:**
- Clean aligned results
- Predictable row count (one per interval)
- Works well with Grafana visualization

**Cons:**
- Requires choosing resample interval
- May introduce synthetic data (FILL)
- Less precise than original timestamps

## Strategy 3: ASOF JOIN for Temporal Proximity

Match each sensor A reading with the most recent sensor B reading:

```questdb-sql demo title="ASOF JOIN to match most recent readings"
SELECT
  a.timestamp as ts_a,
  a.temperature as temp_a,
  b.timestamp as ts_b,
  b.temperature as temp_b,
  (a.timestamp - b.timestamp) / 1000000 as seconds_since_b_reading,
  (a.temperature - b.temperature) as temp_difference
FROM sensor_readings a
ASOF JOIN sensor_readings b
  ON a.sensor_id = 'A' AND b.sensor_id = 'B'
WHERE a.sensor_id = 'A'
  AND a.timestamp >= '2025-01-15T10:00:00'
  AND a.timestamp < '2025-01-15T10:10:00'
ORDER BY a.timestamp;
```

**Results:**

| ts_a | temp_a | ts_b | temp_b | seconds_since_b_reading | temp_difference |
|------|--------|------|--------|-------------------------|-----------------|
| 10:00:00 | 22.5 | 10:00:00 | 23.1 | 0 | -0.6 |
| 10:01:00 | 22.7 | 10:00:00 | 23.1 | 60 | -0.4 | ← Most recent B reading
| 10:02:00 | 22.6 | 10:02:00 | 23.3 | 0 | -0.7 |

**When to use:**
- Need point-in-time comparison (what was B when A reported?)
- Sensors report at irregular intervals
- Want actual timestamps, not resampled intervals
- Large datasets (very efficient)

**Pros:**
- Extremely fast (optimized for time-series)
- No data synthesis (uses actual readings)
- Handles irregular timestamps naturally
- Scalable to millions of rows

**Cons:**
- More complex syntax
- May need to filter by max time difference
- Requires understanding of ASOF semantics

## Comparison: Three Sensors Combined

Combine three sensors using ASOF JOIN:

```questdb-sql demo title="ASOF JOIN multiple sensors"
SELECT
  a.timestamp as ts_a,
  a.temperature as temp_a,
  b.timestamp as ts_b,
  b.temperature as temp_b,
  c.timestamp as ts_c,
  c.temperature as temp_c,
  (a.temperature + b.temperature + c.temperature) / 3 as avg_temperature
FROM sensor_readings a
ASOF JOIN sensor_readings b
  ON a.sensor_id = 'A' AND b.sensor_id = 'B'
ASOF JOIN sensor_readings c
  ON a.sensor_id = 'A' AND c.sensor_id = 'C'
WHERE a.sensor_id = 'A'
  AND a.timestamp >= '2025-01-15T10:00:00'
  AND a.timestamp < '2025-01-15T10:10:00'
ORDER BY a.timestamp;
```

Each sensor A reading is matched with the most recent reading from sensors B and C.

## Filtering by Maximum Time Difference

Ensure joined readings aren't too stale:

```questdb-sql demo title="ASOF JOIN with staleness filter"
WITH joined AS (
  SELECT
    a.timestamp as ts_a,
    a.temperature as temp_a,
    b.timestamp as ts_b,
    b.temperature as temp_b,
    (a.timestamp - b.timestamp) as time_diff_micros
  FROM sensor_readings a
  ASOF JOIN sensor_readings b
    ON a.sensor_id = 'A' AND b.sensor_id = 'B'
  WHERE a.sensor_id = 'A'
    AND a.timestamp >= '2025-01-15T10:00:00'
    AND a.timestamp < '2025-01-15T10:10:00'
)
SELECT *
FROM joined
WHERE time_diff_micros <= 120000000  -- B reading not older than 2 minutes
ORDER BY ts_a;
```

This filters out matches where sensor B's reading is too old.

## LT JOIN for Strictly Before

Use LT JOIN when you need readings strictly before (not at the same time):

```questdb-sql demo title="LT JOIN for strictly previous reading"
SELECT
  a.timestamp as ts_a,
  a.temperature as temp_a,
  b.timestamp as ts_b,
  b.temperature as temp_b,
  (a.temperature - b.temperature) as temp_change
FROM sensor_readings a
LT JOIN sensor_readings b
  ON a.sensor_id = 'A' AND b.sensor_id = 'A'  -- Same sensor, previous reading
WHERE a.sensor_id = 'A'
  AND a.timestamp >= '2025-01-15T10:00:00'
  AND a.timestamp < '2025-01-15T10:10:00'
ORDER BY a.timestamp;
```

This matches each reading with the strictly previous reading from the same sensor (useful for calculating deltas).

## Handling NULL Results

ASOF JOIN returns NULL when no previous reading exists:

```questdb-sql demo title="Handle NULL from ASOF JOIN"
SELECT
  a.timestamp as ts_a,
  a.temperature as temp_a,
  COALESCE(b.temperature, a.temperature) as temp_b,  -- Use A if B is NULL
  CASE
    WHEN b.timestamp IS NULL THEN 'NO_PREVIOUS_READING'
    ELSE 'OK'
  END as status
FROM sensor_readings a
ASOF JOIN sensor_readings b
  ON a.sensor_id = 'A' AND b.sensor_id = 'B'
WHERE a.sensor_id = 'A'
ORDER BY a.timestamp;
```

## Performance Comparison

| Strategy | Rows Generated | Query Speed | Memory Usage | Best For |
|----------|----------------|-------------|--------------|----------|
| **CROSS JOIN** | N × M | Slow | High | Small datasets, all combinations |
| **LEFT JOIN** | N | Medium | Medium | Regular intervals, visualization |
| **ASOF JOIN** | N | Fast | Low | Large datasets, irregular data |

**Benchmark example (1M rows each):**
- CROSS JOIN: ~30 seconds, creates 1T rows (filtered to 1M)
- LEFT JOIN: ~5 seconds, creates 1M rows
- ASOF JOIN: ~0.5 seconds, creates 1M rows

## Combining Strategies

Use resampling + ASOF for best of both worlds:

```questdb-sql demo title="Resample then ASOF JOIN"
WITH sensor_a_minute AS (
  SELECT timestamp, first(temperature) as temp_a
  FROM sensor_readings
  WHERE sensor_id = 'A'
  SAMPLE BY 1m
)
SELECT
  a.timestamp,
  a.temp_a,
  b.temperature as temp_b_asof
FROM sensor_a_minute a
ASOF JOIN sensor_readings b
  ON b.sensor_id = 'B'
WHERE a.timestamp >= '2025-01-15T10:00:00'
ORDER BY a.timestamp;
```

- Resample sensor A for regular intervals
- Use ASOF JOIN to find sensor B readings without resampling B

## Grafana Multi-Sensor Dashboard

Format for Grafana with multiple series:

```questdb-sql demo title="Multi-sensor data for Grafana"
WITH sensor_a AS (
  SELECT timestamp, first(temperature) as temperature
  FROM sensor_readings
  WHERE sensor_id = 'A'
    AND $__timeFilter(timestamp)
  SAMPLE BY $__interval FILL(PREV)
),
sensor_b AS (
  SELECT timestamp, first(temperature) as temperature
  FROM sensor_readings
  WHERE sensor_id = 'B'
    AND $__timeFilter(timestamp)
  SAMPLE BY $__interval FILL(PREV)
)
SELECT timestamp as time, 'Sensor A' as metric, temperature as value FROM sensor_a
UNION ALL
SELECT timestamp as time, 'Sensor B' as metric, temperature as value FROM sensor_b
ORDER BY time;
```

Creates separate series for each sensor in Grafana.

## Decision Matrix

**Choose CROSS JOIN when:**
- Datasets are small (< 10K rows each)
- You need all possible combinations
- Time tolerance is flexible (e.g., "within 1 minute")
- Analyzing correlation between sensors

**Choose LEFT JOIN when:**
- You can resample to common intervals
- Clean, aligned timestamps are important
- Visualizing in Grafana with multiple sensors
- Forward-filling is acceptable

**Choose ASOF JOIN when:**
- Datasets are large (> 100K rows)
- Timestamps are irregular
- Point-in-time accuracy matters
- Query performance is critical
- You want actual readings, not interpolated values

:::tip ASOF JOIN is Usually Best
For most real-world sensor data scenarios, ASOF JOIN offers the best combination of performance, accuracy, and simplicity. It's specifically designed for time-series data and handles irregular intervals naturally.
:::

:::warning CROSS JOIN Explosion
Never use CROSS JOIN without a strong WHERE filter on large tables. A CROSS JOIN of two 1M-row tables creates 1 trillion rows before filtering!

Safe: `CROSS JOIN ... WHERE ABS(a.ts - b.ts) < threshold`
Dangerous: `CROSS JOIN ... ` (without WHERE on time difference)
:::

:::info Related Documentation
- [ASOF JOIN](/docs/reference/sql/join/#asof-join)
- [LT JOIN](/docs/reference/sql/join/#lt-join)
- [LEFT JOIN](/docs/reference/sql/join/#left-join)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [FILL strategies](/docs/reference/sql/select/#fill)
:::
