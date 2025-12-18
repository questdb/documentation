---
title: Expand Average Power Over Time
sidebar_label: Expand power over time
description: Distribute average power values across hourly intervals using sessions and window functions for IoT energy data
---

Expand discrete energy measurements across time intervals to visualize average power consumption. When IoT devices report cumulative energy (watt-hours) at irregular intervals, you need to distribute that energy across the hours it was consumed.

## Problem: Sparse Energy Readings to Hourly Distribution

You have IoT devices reporting watt-hour (Wh) values at discrete timestamps. You want to:
1. Calculate average power (W) between readings
2. Distribute that power across each hour in the period
3. Visualize hourly energy consumption

**Sample data:**

| timestamp | operationId | wh  |
|-----------|-------------|-----|
| 14:10:59  | 1001        | 0   |
| 18:18:05  | 1001        | 200 |
| 14:20:01  | 1002        | 0   |
| 22:20:10  | 1002        | 300 |

For operation 1001: 200 Wh consumed over 4 hours 7 minutes → needs to be distributed across hours 14:00, 15:00, 16:00, 17:00, 18:00.

## Solution: Session-Based Distribution

Use SAMPLE BY to create hourly intervals, then use sessions to identify and distribute energy across attributable hours:

```questdb-sql demo title="Distribute average power across hours"
WITH
sampled AS (
  SELECT timestamp, operationId, sum(wh) as wh
  FROM meter
  SAMPLE BY 1h
  FILL(0)
),
sessions AS (
  SELECT *,
    SUM(CASE WHEN wh > 0 THEN 1 END)
      OVER (PARTITION BY operationId ORDER BY timestamp DESC) as session
  FROM sampled
),
counts AS (
  SELECT timestamp, operationId,
    FIRST_VALUE(wh) OVER (PARTITION BY operationId, session ORDER BY timestamp DESC) as wh,
    COUNT(*) OVER (PARTITION BY operationId, session) as attributable_hours
  FROM sessions
)
SELECT
  timestamp,
  operationId,
  wh / attributable_hours as wh_avg
FROM counts;
```

**Results:**

| timestamp | operationId | wh_avg |
|-----------|-------------|--------|
| 14:00:00  | 1001        | 39.67  |
| 15:00:00  | 1001        | 48.56  |
| 16:00:00  | 1001        | 48.56  |
| 17:00:00  | 1001        | 48.56  |
| 18:00:00  | 1001        | 14.64  |
| 14:00:00  | 1002        | 24.98  |
| 15:00:00  | 1002        | 37.49  |
| ...       | ...         | ...    |

## How It Works

The query uses a four-step approach:

### 1. Sample by Hour (`sampled`)

```sql
SELECT timestamp, operationId, sum(wh) as wh
FROM meter
SAMPLE BY 1h
FILL(0)
```

Creates hourly buckets with:
- Sum of wh values if data exists in that hour
- 0 for hours with no data (via FILL(0))

This ensures we have a row for every hour in the time range.

### 2. Identify Sessions (`sessions`)

```sql
SUM(CASE WHEN wh > 0 THEN 1 END)
  OVER (PARTITION BY operationId ORDER BY timestamp DESC)
```

Working backwards in time (DESC order), increment a counter whenever we see a non-zero wh value. This creates "sessions" where:
- Each session = one energy reading
- Session includes all preceding zero-value hours
- Sessions are numbered: 1, 2, 3, ... (higher numbers are earlier in time)

**Example for operation 1001:**

| timestamp | wh  | session |
|-----------|-----|---------|
| 18:00     | 200 | 1       | ← Reading at 18:00
| 17:00     | 0   | 1       | ← Part of session 1
| 16:00     | 0   | 1       | ← Part of session 1
| 15:00     | 0   | 1       | ← Part of session 1
| 14:00     | 0   | 1       | ← Part of session 1

### 3. Calculate Attributable Hours (`counts`)

```sql
FIRST_VALUE(wh) OVER (PARTITION BY operationId, session ORDER BY timestamp DESC)
```

For each session, get the wh value (which appears in the first row when sorted DESC).

```sql
COUNT(*) OVER (PARTITION BY operationId, session)
```

Count how many hours are in each session (how many hours to distribute energy across).

### 4. Distribute Energy

```sql
wh / attributable_hours
```

Divide the total energy by the number of hours to get average energy per hour.

## Handling Partial Hours

The query distributes energy evenly across hours, but actual consumption may not be uniform. For more accuracy with partial hours:

```questdb-sql demo title="Calculate mean power between readings using LAG"
SELECT
  timestamp AS end_time,
  cast(prev_ts AS timestamp) AS start_time,
  operationId,
  (wh - prev_wh) / ((cast(timestamp AS DOUBLE) - prev_ts) / 3600000000.0) AS mean_power_w
FROM (
  SELECT
    timestamp,
    wh,
    operationId,
    lag(wh) OVER (PARTITION BY operationId ORDER BY timestamp) AS prev_wh,
    lag(cast(timestamp AS DOUBLE)) OVER (PARTITION BY operationId ORDER BY timestamp) AS prev_ts
  FROM meter
)
WHERE prev_ts IS NOT NULL
ORDER BY timestamp;
```

This calculates true average power (W) between consecutive readings, accounting for exact time differences.

## Adapting the Pattern

**Different time intervals:**
```sql
-- 15-minute intervals
SAMPLE BY 15m

-- Daily intervals
SAMPLE BY 1d
```

**Multiple devices:**
```sql
-- Already handled by PARTITION BY operationId
-- Works automatically for any number of devices
```

**Filter by time range:**
```sql
WITH sampled AS (
  SELECT timestamp, operationId, sum(wh) as wh
  FROM meter
  WHERE timestamp >= '2025-01-01' AND timestamp < '2025-02-01'
  SAMPLE BY 1h
  FILL(0)
)
...
```

**Include device metadata:**
```sql
WITH sampled AS (
  SELECT
    timestamp,
    operationId,
    first(location) as location,
    first(device_type) as device_type,
    sum(wh) as wh
  FROM meter
  SAMPLE BY 1h
  FILL(0)
)
...
```

## Visualization in Grafana

This query output is perfect for Grafana time-series charts:

```sql
SELECT
  timestamp as time,
  operationId as metric,
  wh / attributable_hours as value
FROM (
  -- ... full query from above ...
)
WHERE $__timeFilter(timestamp)
ORDER BY timestamp;
```

Configure Grafana to:
- Group by `metric` (operationId)
- Stack series to show total consumption
- Use area chart for energy visualization

## Alternative: Pre-calculated Power

If you calculate power at ingestion time, queries become simpler:

```sql
-- At ingestion, calculate instantaneous power
INSERT INTO power_readings
SELECT
  timestamp,
  operationId,
  (wh - prev_wh) / seconds_elapsed as power_w
FROM meter;

-- Then query is simple
SELECT
  timestamp_floor('h', timestamp) as hour,
  operationId,
  avg(power_w) as avg_power
FROM power_readings
GROUP BY hour, operationId
ORDER BY hour;
```

## Performance Considerations

**Filter by operationId:**
```sql
-- For specific devices
WHERE operationId IN ('1001', '1002', '1003')
```

**Limit time range:**
```sql
-- Only recent data
WHERE timestamp >= dateadd('d', -30, now())
```

**Pre-aggregate if querying frequently:**
```sql
-- Create materialized hourly view
CREATE TABLE hourly_power AS
SELECT ... FROM meter ... SAMPLE BY 1h;

-- Refresh periodically
-- (manual or scheduled)
```

## Common Issues

**Negative power values:**
- Occurs when devices report decreasing wh (meter reset, rollover)
- Filter with `WHERE wh_avg > 0` or handle resets explicitly

**Large gaps in data:**
- Long sessions distribute energy over many hours
- Consider adding a maximum session duration filter
- Or handle gaps differently (mark as "unknown" rather than distribute)

**First reading has no previous value:**
- LAG returns NULL for first reading
- Filter with `WHERE prev_ts IS NOT NULL`

:::tip Energy vs Power
- **Energy** (Wh): Cumulative, reported by meter
- **Power** (W): Rate of energy consumption (Wh per hour)
- **Average power** = Energy difference / Time elapsed

This pattern converts from sparse energy readings to continuous power timeline.
:::

:::warning Session Direction
The query uses `ORDER BY timestamp DESC` to work backwards in time. This is because we want to group zero-hours that occur BEFORE each reading. If you reverse the order, the distribution won't work correctly.
:::

:::info Related Documentation
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [FILL](/docs/reference/sql/select/#fill)
- [Window functions](/docs/reference/sql/select/#window-functions)
- [FIRST_VALUE](/docs/reference/function/window/#first_value)
- [LAG](/docs/reference/function/window/#lag)
:::
