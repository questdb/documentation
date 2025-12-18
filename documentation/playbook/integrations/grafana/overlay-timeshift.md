---
title: Overlay Yesterday on Today in Grafana
sidebar_label: Overlay with timeshift
description: Compare today's metrics with yesterday's using time-shifted queries to overlay historical data on current charts
---

Overlay yesterday's data on today's chart in Grafana to visually compare current performance against previous periods. This pattern is useful for identifying anomalies, tracking daily patterns, and comparing weekday vs weekend behavior.

## Problem: Compare Current vs Previous Period

You want to see if today's traffic pattern is normal by comparing it to yesterday:

**Without overlay:**
- View today's data
- Mentally remember yesterday's pattern
- Switch to yesterday's timeframe
- Try to compare (difficult!)

**With overlay:**
- See both periods on same chart
- Visual comparison is immediate
- Easily spot deviations

## Solution: Time-Shifted Queries

Use UNION ALL to combine current and shifted historical data:

```sql
-- Today's data
SELECT
  timestamp as time,
  'Today' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', now())
SAMPLE BY 5m

UNION ALL

-- Yesterday's data, shifted forward by 24 hours
SELECT
  dateadd('d', 1, timestamp) as time,  -- Shift forward 24 hours
  'Yesterday' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp < date_trunc('day', now())
SAMPLE BY 5m

ORDER BY time;
```

**Grafana will plot both series:**
- "Today" line shows current data at actual times
- "Yesterday" line shows previous day's data shifted to align with today's timeline

## How It Works

### Time Alignment

```sql
dateadd('d', 1, timestamp) as time
```

Takes yesterday's timestamps and adds 24 hours:
- Yesterday 10:00 → Today 10:00
- Yesterday 14:30 → Today 14:30

This aligns both datasets on the same X-axis (time).

### Separate Series

```sql
'Today' as metric
'Yesterday' as metric
```

Creates two distinct series in Grafana. Configure Grafana to:
- Different colors per series
- Legend shows "Today" vs "Yesterday"

## Full Grafana Query

```questdb-sql title="Today vs Yesterday trade volume"
SELECT
  timestamp as time,
  'Today' as metric,
  sum(amount) as value
FROM trades
WHERE $__timeFilter(timestamp)
  AND timestamp >= date_trunc('day', now())
SAMPLE BY $__interval

UNION ALL

SELECT
  dateadd('d', 1, timestamp) as time,
  'Yesterday' as metric,
  sum(amount) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp < date_trunc('day', now())
SAMPLE BY $__interval

ORDER BY time;
```

**Grafana variables:**
- `$__timeFilter(timestamp)`: Respects dashboard time range
- `$__interval`: Auto-adjusts sample interval based on zoom level

## Week-Over-Week Comparison

Compare same weekday from last week:

```sql
SELECT
  timestamp as time,
  'This Week' as metric,
  avg(price) as value
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= date_trunc('day', now())
SAMPLE BY 1h

UNION ALL

SELECT
  dateadd('d', 7, timestamp) as time,
  'Last Week' as metric,
  avg(price) as value
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= date_trunc('day', dateadd('d', -7, now()))
  AND timestamp < date_trunc('day', dateadd('d', -6, now()))
SAMPLE BY 1h

ORDER BY time;
```

Compares Monday to Monday, Tuesday to Tuesday, etc.

## Multiple Historical Periods

Overlay several previous days:

```sql
-- Today
SELECT timestamp as time, 'Today' as metric, count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', now())
SAMPLE BY 10m

UNION ALL

-- Yesterday
SELECT dateadd('d', 1, timestamp) as time, 'Yesterday' as metric, count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp < date_trunc('day', now())
SAMPLE BY 10m

UNION ALL

-- 2 days ago
SELECT dateadd('d', 2, timestamp) as time, '2 Days Ago' as metric, count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -2, now()))
  AND timestamp < date_trunc('day', dateadd('d', -1, now()))
SAMPLE BY 10m

UNION ALL

-- 3 days ago
SELECT dateadd('d', 3, timestamp) as time, '3 Days Ago' as metric, count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -3, now()))
  AND timestamp < date_trunc('day', dateadd('d', -2, now()))
SAMPLE BY 10m

ORDER BY time;
```

Shows trend over multiple days aligned to current day.

## Hour-by-Hour Overlay

Compare specific hours (e.g., current hour vs same hour yesterday):

```sql
SELECT
  timestamp as time,
  'Current Hour' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('hour', now())
SAMPLE BY 1m

UNION ALL

SELECT
  dateadd('d', 1, timestamp) as time,
  'Same Hour Yesterday' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('hour', dateadd('d', -1, now()))
  AND timestamp < date_trunc('hour', dateadd('d', -1, now())) + 3600000000  -- +1 hour in micros
SAMPLE BY 1m

ORDER BY time;
```

Compares minute-by-minute within same hour across days.

## Weekday vs Weekend Pattern

Overlay weekday average against weekend average:

```sql
WITH weekday_avg AS (
  SELECT
    extract(hour from timestamp) * 3600000000 +
    extract(minute from timestamp) * 60000000 as time_of_day_micros,
    avg(value) as avg_value
  FROM metrics
  WHERE timestamp >= dateadd('d', -30, now())
    AND day_of_week(timestamp) BETWEEN 1 AND 5  -- Monday to Friday
  GROUP BY time_of_day_micros
),
weekend_avg AS (
  SELECT
    extract(hour from timestamp) * 3600000000 +
    extract(minute from timestamp) * 60000000 as time_of_day_micros,
    avg(value) as avg_value
  FROM metrics
  WHERE timestamp >= dateadd('d', -30, now())
    AND day_of_week(timestamp) IN (6, 7)  -- Saturday, Sunday
  GROUP BY time_of_day_micros
)
SELECT
  cast(date_trunc('day', now()) + time_of_day_micros as timestamp) as time,
  'Weekday Average' as metric,
  avg_value as value
FROM weekday_avg

UNION ALL

SELECT
  cast(date_trunc('day', now()) + time_of_day_micros as timestamp) as time,
  'Weekend Average' as metric,
  avg_value as value
FROM weekend_avg

ORDER BY time;
```

Shows typical weekday pattern vs typical weekend pattern.

## Grafana Panel Configuration

**Query settings:**
- Format: Time series
- Min interval: Match your SAMPLE BY interval

**Display settings:**
- Visualization: Time series (line graph)
- Legend: Show (displays "Today", "Yesterday", etc.)
- Line styles: Different colors or dash styles per series
- Tooltip: All series (shows both values on hover)

**Advanced:**
- Series overrides:
  - "Today": Solid line, blue, bold
  - "Yesterday": Dashed line, gray, thin
  - Opacity: 80% for historical, 100% for current

## Use Cases

**Traffic anomaly detection:**
```sql
-- Is today's traffic normal?
-- Overlay last 7 days
```

**Performance regression:**
```sql
-- API latency today vs yesterday
SELECT
  timestamp as time,
  'Today P95' as metric,
  percentile(latency_ms, 95) as value
FROM api_requests
WHERE timestamp >= date_trunc('day', now())
SAMPLE BY 5m

UNION ALL

SELECT
  dateadd('d', 1, timestamp) as time,
  'Yesterday P95' as metric,
  percentile(latency_ms, 95) as value
FROM api_requests
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp < date_trunc('day', now())
SAMPLE BY 5m
ORDER BY time;
```

**Sales comparison:**
```sql
-- Today's sales vs same day last week
-- (Mondays often differ from Tuesdays)
```

**Seasonal patterns:**
```sql
-- Compare today to same date last month/year
SELECT dateadd('M', 1, timestamp) as time  -- Month shift
SELECT dateadd('y', 1, timestamp) as time  -- Year shift
```

## Performance Optimization

**Filter early:**
```sql
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp < date_trunc('day', dateadd('d', 2, now()))
```

Only query relevant dates (yesterday + today + small buffer).

**Use SAMPLE BY:**
```sql
SAMPLE BY $__interval
```

Let Grafana determine appropriate resolution based on zoom level.

**Partition pruning:**
```sql
-- If partitioned by day, this efficiently accesses only 2 partitions
WHERE timestamp IN today()
UNION ALL
WHERE timestamp >= dateadd('d', -1, now()) AND timestamp < date_trunc('day', now())
```

## Alternative: Grafana Built-in Timeshift

**Note:** Some Grafana panels support native timeshift transformations.

**Using transformation:**
1. Query normal time-series data
2. Add transformation: "Add field from calculation"
3. Mode: "Reduce row"
4. Calculation: "Difference"
5. Apply timeshift transformation (if available in your Grafana version)

However, SQL-based approach gives more control and works reliably across Grafana versions.

## Dynamic Period Selection

Use Grafana variables for flexible comparison:

**Variable `compare_period`:**
- `1d` = Yesterday
- `7d` = Last week
- `30d` = Last month

**Query:**
```sql
SELECT timestamp as time, 'Current' as metric, value FROM metrics
WHERE $__timeFilter(timestamp)

UNION ALL

SELECT
  dateadd('d', $compare_period, timestamp) as time,
  'Previous' as metric,
  value
FROM metrics
WHERE timestamp >= dateadd('d', -$compare_period, now())
  AND timestamp < now()
ORDER BY time;
```

User can switch comparison period via dropdown.

## Handling Incomplete Current Day

Only show overlay up to current time of day:

```sql
SELECT
  timestamp as time,
  'Today' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', now())
  AND timestamp <= now()  -- Don't show future of today
SAMPLE BY 10m

UNION ALL

SELECT
  dateadd('d', 1, timestamp) as time,
  'Yesterday' as metric,
  count(*) as value
FROM trades
WHERE timestamp >= date_trunc('day', dateadd('d', -1, now()))
  AND timestamp <= dateadd('d', -1, now())  -- Yesterday at same time
SAMPLE BY 10m
ORDER BY time;
```

This prevents showing empty future time slots for today.

## Combining with Alerts

Trigger alert when today's value deviates significantly from yesterday:

```sql
WITH today_value AS (
  SELECT avg(latency_ms) as latency FROM api_requests
  WHERE timestamp >= dateadd('m', -5, now())
),
yesterday_same_time AS (
  SELECT avg(latency_ms) as latency FROM api_requests
  WHERE timestamp >= dateadd('d', -1, dateadd('m', -5, now()))
    AND timestamp < dateadd('d', -1, now())
)
SELECT
  (today_value.latency - yesterday_same_time.latency) / yesterday_same_time.latency * 100 as pct_change
FROM today_value, yesterday_same_time;
```

Alert if `pct_change > 50` (today is 50% slower than yesterday).

:::tip Best Practices
1. **Match sample intervals**: Use same SAMPLE BY for all series
2. **Label clearly**: Use descriptive metric names ("Today", "Yesterday (Shifted)")
3. **Limit historical depth**: Too many overlays clutter the chart (2-3 periods max)
4. **Adjust colors**: Make current period prominent, historical periods muted
5. **Consider patterns**: Week-over-week often more meaningful than day-over-day
:::

:::warning Time Zone Considerations
Ensure both queries use the same timezone:
- Use UTC for consistency
- Or explicitly set timezone in date_trunc(): `date_trunc('day', now(), 'America/New_York')`

Mismatched timezones will misalign the overlay.
:::

:::info Related Documentation
- [dateadd() function](/docs/reference/function/date-time/#dateadd)
- [date_trunc() function](/docs/reference/function/date-time/#date_trunc)
- [UNION ALL](/docs/reference/sql/union-except-intersect/)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [Grafana time series](/docs/third-party-tools/grafana/)
:::
