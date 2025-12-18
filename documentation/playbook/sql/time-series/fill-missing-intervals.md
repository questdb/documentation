---
title: Fill Missing Time Intervals
sidebar_label: Fill missing intervals
description: Create regular time intervals and propagate sparse values using FILL with PREV, NULL, LINEAR, or constant values
---

Transform sparse event data into regular time-series by creating fixed intervals and filling gaps with appropriate values. This is essential for visualization, resampling, and aligning data from multiple sources.

## Problem: Sparse Events Need Regular Intervals

You have configuration changes recorded only when they occur:

| timestamp | config_key | config_value |
|-----------|------------|--------------|
| 08:00:00  | max_connections | 100 |
| 10:30:00  | max_connections | 150 |
| 14:00:00  | max_connections | 200 |

You want hourly intervals showing the active value at each hour:

| timestamp | config_value |
|-----------|--------------|
| 08:00:00  | 100 |
| 09:00:00  | 100 | ← Filled forward
| 10:00:00  | 100 | ← Filled forward
| 11:00:00  | 150 | ← New value
| 12:00:00  | 150 | ← Filled forward
| 13:00:00  | 150 | ← Filled forward
| 14:00:00  | 200 | ← New value

## Solution: SAMPLE BY with FILL(PREV)

Use SAMPLE BY to create intervals and FILL(PREV) to forward-fill values:

```questdb-sql demo title="Forward-fill configuration values"
SELECT
  timestamp,
  first(config_value) as config_value
FROM config_changes
WHERE config_key = 'max_connections'
  AND timestamp >= '2025-01-15T08:00:00'
  AND timestamp < '2025-01-15T15:00:00'
SAMPLE BY 1h FILL(PREV);
```

**Results:**

| timestamp | config_value |
|-----------|--------------|
| 08:00:00  | 100 |
| 09:00:00  | 100 |
| 10:00:00  | 100 |
| 11:00:00  | 150 |
| 12:00:00  | 150 |
| 13:00:00  | 150 |
| 14:00:00  | 200 |

## How It Works

### SAMPLE BY Creates Intervals

```sql
SAMPLE BY 1h
```

Creates hourly buckets regardless of whether data exists in that hour.

### FILL(PREV) Propagates Values

```sql
FILL(PREV)
```

When an interval has no data:
- Copies the value from the previous non-empty interval
- First interval with no data remains NULL (no previous value)

### first() Aggregate

```sql
first(config_value)
```

Takes the first value within each interval. For sparse data with one value per relevant interval, this extracts that value.

## Different FILL Strategies

QuestDB supports multiple fill strategies:

```questdb-sql demo title="Compare FILL strategies"
-- FILL(NULL): Leave gaps as NULL
SELECT timestamp, first(price) as price_null
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 1m FILL(NULL);

-- FILL(PREV): Forward-fill from previous value
SELECT timestamp, first(price) as price_prev
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 1m FILL(PREV);

-- FILL(LINEAR): Linear interpolation between known values
SELECT timestamp, first(price) as price_linear
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 1m FILL(LINEAR);

-- FILL(100.0): Constant value
SELECT timestamp, first(price) as price_const
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 1m FILL(100.0);
```

**When to use each:**

| Strategy | Use Case | Example |
|----------|----------|---------|
| **FILL(NULL)** | Explicit gaps, no assumption | Sparse sensor data where missing = no reading |
| **FILL(PREV)** | State changes, step functions | Configuration values, status flags |
| **FILL(LINEAR)** | Smoothly varying metrics | Temperature, stock prices between trades |
| **FILL(constant)** | Default/baseline values | Filling with zero for missing counters |

## Multiple Columns with Different Strategies

Apply different fill strategies to different columns:

```questdb-sql demo title="Mixed fill strategies"
SELECT
  timestamp,
  first(temperature) as temperature,  -- Will use FILL(LINEAR)
  first(status) as status              -- Will use FILL(PREV)
FROM sensor_events
WHERE sensor_id = 'S001'
  AND timestamp >= dateadd('h', -6, now())
SAMPLE BY 5m
FILL(LINEAR);  -- Applies to ALL numeric columns
```

**Limitation:** FILL applies to all columns identically. For per-column control, use separate queries with UNION ALL.

## Forward-Fill with Limits

Limit how far forward to propagate values:

```questdb-sql demo title="Forward-fill with maximum gap"
WITH sampled AS (
  SELECT
    timestamp,
    first(sensor_value) as value
  FROM sensor_readings
  WHERE sensor_id = 'S001'
    AND timestamp >= dateadd('h', -24, now())
  SAMPLE BY 10m FILL(PREV)
),
with_gap_check AS (
  SELECT
    timestamp,
    value,
    timestamp - lag(timestamp) OVER (ORDER BY timestamp) as gap_micros
  FROM sampled
  WHERE value IS NOT NULL  -- Only include intervals with actual or filled data
)
SELECT
  timestamp,
  CASE
    WHEN gap_micros > 1800000000 THEN NULL  -- Gap > 30 minutes: don't trust fill
    ELSE value
  END as value_with_limit
FROM with_gap_check
ORDER BY timestamp;
```

This prevents filling forward after large gaps where the value is likely stale.

## Interpolate Between Sparse Updates

Use LINEAR fill for numeric values that change gradually:

```questdb-sql demo title="Linear interpolation between price updates"
SELECT
  timestamp,
  first(price) as price
FROM market_snapshots
WHERE symbol = 'BTC-USDT'
  AND timestamp >= '2025-01-15T00:00:00'
  AND timestamp < '2025-01-15T01:00:00'
SAMPLE BY 1m FILL(LINEAR);
```

**Example:**
- 00:00: price = 100
- 00:10: price = 110
- Result: 00:01→101, 00:02→102, ..., 00:09→109

Linear interpolation assumes constant rate of change between known points.

## Fill State Changes for Grafana

Create step charts in Grafana by forward-filling status values:

```questdb-sql demo title="Service status for Grafana step chart"
SELECT
  timestamp as time,
  first(status) as "Service Status"
FROM service_events
WHERE $__timeFilter(timestamp)
SAMPLE BY $__interval FILL(PREV);
```

Configure Grafana to:
- Use "Staircase" line style
- Shows clear state transitions
- No misleading interpolation between discrete states

## Align Multiple Sensors to Common Timeline

Fill sparse data from multiple sensors to create aligned time-series:

```questdb-sql demo title="Align multiple sensors to common intervals"
SELECT
  timestamp,
  symbol,
  first(temperature) as temperature
FROM sensor_readings
WHERE sensor_id IN ('S001', 'S002', 'S003')
  AND timestamp >= dateadd('h', -1, now())
SAMPLE BY 1m FILL(PREV);
```

**Results:**

| timestamp | sensor_id | temperature |
|-----------|-----------|-------------|
| 10:00:00  | S001 | 22.5 |
| 10:00:00  | S002 | 23.1 |
| 10:00:00  | S003 | 22.8 |
| 10:01:00  | S001 | 22.5 | ← Filled forward
| 10:01:00  | S002 | 23.2 | ← New reading
| 10:01:00  | S003 | 22.8 | ← Filled forward

Now all sensors have values at the same timestamps, enabling cross-sensor analysis.

## Fill with Context from Another Column

Propagate one column while aggregating another differently:

```questdb-sql demo title="Fill status while summing events"
SELECT
  timestamp,
  first(current_status) as status,  -- Forward-fill status
  count(*) as event_count            -- Count events (0 if none)
FROM system_events
WHERE timestamp >= dateadd('h', -6, now())
SAMPLE BY 10m FILL(PREV);
```

**Results:**

| timestamp | status | event_count |
|-----------|--------|-------------|
| 10:00 | running | 15 |
| 10:10 | running | 0 | ← Status filled, but no events
| 10:20 | running | 23 |
| 10:30 | stopped | 1 | ← Status changed
| 10:40 | stopped | 0 | ← Status filled forward

## NULL for First Interval with No Data

FILL(PREV) can't fill the first interval if it has no data:

```sql
SELECT timestamp, first(value) as value
FROM sparse_data
WHERE timestamp >= '2025-01-15T00:00:00'
SAMPLE BY 1h FILL(PREV);
```

If first interval (00:00-01:00) has no data, it will be NULL (no previous value to copy).

**Solution:** Start range from a timestamp you know has data, or use COALESCE with a default:

```sql
SELECT
  timestamp,
  COALESCE(first(value), 0) as value  -- Use 0 if NULL
FROM sparse_data
SAMPLE BY 1h FILL(PREV);
```

## Performance: FILL vs Window Functions

**FILL is optimized for SAMPLE BY:**

```sql
-- Fast: Native FILL implementation
SELECT timestamp, first(value)
FROM data
SAMPLE BY 1h FILL(PREV);

-- Slower: Manual implementation with LAG
SELECT
  timestamp,
  COALESCE(
    first(value),
    lag(first(value)) OVER (ORDER BY timestamp)
  ) as value
FROM data
SAMPLE BY 1h;
```

Use FILL when possible for better performance.

## Creating Complete Time Range

Ensure coverage of full time range even if no data exists:

```questdb-sql demo title="Generate intervals for full day"
SELECT
  timestamp,
  first(temperature) as temperature
FROM sensor_readings
WHERE timestamp >= '2025-01-15T00:00:00'
  AND timestamp < '2025-01-16T00:00:00'
  AND sensor_id = 'S001'
SAMPLE BY 1h FILL(PREV);
```

Even if sensor reported no data for some hours, you'll get 24 rows (one per hour).

## FILL with LATEST ON

Combine with LATEST ON for efficient queries on large tables:

```questdb-sql demo title="Fill recent data efficiently"
SELECT
  timestamp,
  first(price) as price
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= dateadd('h', -6, now())
LATEST ON timestamp PARTITION BY symbol
SAMPLE BY 1m FILL(PREV);
```

LATEST ON optimizes retrieval of recent data before sampling and filling.

## Common Pitfalls

**Wrong aggregate with FILL(PREV):**

```sql
-- Bad: sum() with FILL(PREV) doesn't make sense
SELECT timestamp, sum(trade_count) FROM trades SAMPLE BY 1h FILL(PREV);
-- Fills missing hours with previous hour's sum (misleading!)

-- Good: Use FILL(0) for counts/sums
SELECT timestamp, sum(trade_count) FROM trades SAMPLE BY 1h FILL(0);
```

**FILL(LINEAR) with non-numeric types:**

```sql
-- Error: Can't interpolate strings
SELECT timestamp, first(status_text) FROM events SAMPLE BY 1h FILL(LINEAR);

-- Correct: Use FILL(PREV) for strings/symbols
SELECT timestamp, first(status_text) FROM events SAMPLE BY 1h FILL(PREV);
```

## Comparison with NULL Handling

| Approach | Result | Use Case |
|----------|--------|----------|
| **No FILL** | Fewer rows (sparse) | Raw data export, missing data is meaningful |
| **FILL(NULL)** | All intervals, NULLs for gaps | Explicit gap tracking, Grafana shows breaks |
| **FILL(PREV)** | All intervals, forward-filled | Step functions, state that persists |
| **FILL(LINEAR)** | All intervals, interpolated | Smooth metrics, estimated intermediate values |
| **FILL(0)** | All intervals, zeros for gaps | Counts, volumes (missing = zero activity) |

:::tip When to Use FILL(PREV)
Perfect for:
- Configuration values (persist until changed)
- Status/state (remains until transition)
- Categorical data (can't interpolate)
- Creating step charts in Grafana
- Aligning sparse data from multiple sources
:::

:::warning Data Interpretation
FILL(PREV) creates synthetic data points. Distinguish between:
- **Actual measurements**: Sensor reported a value
- **Filled values**: Value propagated from previous interval

Consider adding a flag column to mark filled vs actual data if this distinction matters.
:::

:::info Related Documentation
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [FILL keyword](/docs/reference/sql/select/#fill)
- [first() aggregate](/docs/reference/function/aggregation/#first)
- [LATEST ON](/docs/reference/sql/select/#latest-on)
:::
