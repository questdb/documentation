---
title: Adjust SAMPLE BY Interval Bounds
sidebar_label: Interval bounds
description: Shift SAMPLE BY timestamps to use right interval bound instead of left bound for alignment with period end times
---

Adjust SAMPLE BY timestamps to display the end of each interval rather than the beginning. By default, QuestDB labels aggregated intervals with their start time, but you may want to label them with their end time for reporting or alignment purposes.

## Problem: Need Right Bound Labeling

You aggregate trades into 15-minute intervals:

```sql
SELECT
  timestamp,
  symbol,
  first(price) AS open,
  last(price) AS close
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 15m;
```

**Default output (left bound):**

| timestamp | open | close |
|-----------|------|-------|
| 00:00:00  | 61000 | 61050 | ← Trades from 00:00:00 to 00:14:59
| 00:15:00  | 61050 | 61100 | ← Trades from 00:15:00 to 00:29:59
| 00:30:00  | 61100 | 61150 | ← Trades from 00:30:00 to 00:44:59

You want the timestamp to show **00:15:00**, **00:30:00**, **00:45:00** (the **end** of each period).

## Solution: Add Interval to Timestamp

Use `dateadd()` to shift timestamps by the interval duration:

```questdb-sql demo title="SAMPLE BY with right bound timestamps"
SELECT
  dateadd('m', 15, timestamp) as timestamp,
  symbol,
  first(price) AS open,
  last(price) AS close,
  min(price),
  max(price),
  sum(amount) AS volume
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
SAMPLE BY 15m;
```

**Output (right bound):**

| timestamp | open | close | min | max | volume |
|-----------|------|-------|-----|-----|--------|
| 00:15:00  | 61000 | 61050 | 60990 | 61055 | 123.45 |
| 00:30:00  | 61050 | 61100 | 61040 | 61110 | 98.76 |
| 00:45:00  | 61100 | 61150 | 61095 | 61160 | 145.32 |

Now each row is labeled with the **end** of the interval it represents.

## How It Works

### Default Left Bound

```sql
SAMPLE BY 15m
```

QuestDB internally:
1. Rounds down timestamps to interval boundaries
2. Aggregates data within each [start, end) bucket
3. Labels with the interval start time

### Shifted Right Bound

```sql
dateadd('m', 15, timestamp)
```

Adds 15 minutes to each timestamp:
- Original: `00:00:00` → Shifted: `00:15:00`
- Original: `00:15:00` → Shifted: `00:30:00`

The aggregation still happens over the same data; only the label changes.

## Important Consideration: Designated Timestamp

When you shift the timestamp, it's no longer the "designated timestamp" for the row:

```questdb-sql demo title="Notice timestamp color in web console"
SELECT
  dateadd('m', 15, timestamp) as timestamp,
  symbol,
  first(price) AS open
FROM trades
SAMPLE BY 15m;
```

In the QuestDB web console, the shifted timestamp appears in **regular font**, not **green** (designated timestamp color), because it's now a derived column, not the original designated timestamp.

### Impact on Subsequent Operations

If you use this query as a subquery and need ordering or window functions:

```sql
-- Force ordering by the derived timestamp
(
  SELECT
    dateadd('m', 15, timestamp) as timestamp,
    symbol,
    first(price) AS open
  FROM trades
  SAMPLE BY 15m
) ORDER BY timestamp;
```

The `ORDER BY` ensures the derived timestamp is used for ordering.

## Different Intervals

**1-hour intervals:**
```sql
SELECT
  dateadd('h', 1, timestamp) as timestamp,
  ...
FROM trades
SAMPLE BY 1h;
```

**5-minute intervals:**
```sql
SELECT
  dateadd('m', 5, timestamp) as timestamp,
  ...
FROM trades
SAMPLE BY 5m;
```

**1-day intervals:**
```sql
SELECT
  dateadd('d', 1, timestamp) as timestamp,
  ...
FROM trades
SAMPLE BY 1d;
```

**30-second intervals:**
```sql
SELECT
  dateadd('s', 30, timestamp) as timestamp,
  ...
FROM trades
SAMPLE BY 30s;
```

## With Time Range Filtering

Combine with Grafana macros:

```sql
SELECT
  dateadd('m', 15, timestamp) as timestamp,
  symbol,
  first(price) AS open,
  last(price) AS close
FROM trades
WHERE $__timeFilter(timestamp)
SAMPLE BY 15m;
```

Or with explicit time range:

```sql
SELECT
  dateadd('m', 15, timestamp) as timestamp,
  ...
FROM trades
WHERE timestamp >= '2025-01-15T00:00:00'
  AND timestamp < '2025-01-16T00:00:00'
SAMPLE BY 15m;
```

## Alternative: Keep Both Boundaries

Show both start and end of each interval:

```questdb-sql demo title="Show both interval start and end"
SELECT
  timestamp as interval_start,
  dateadd('m', 15, timestamp) as interval_end,
  symbol,
  first(price) AS open,
  last(price) AS close
FROM trades
WHERE symbol = 'BTC-USDT'
SAMPLE BY 15m;
```

**Output:**

| interval_start | interval_end | open | close |
|----------------|--------------|------|-------|
| 00:00:00       | 00:15:00     | 61000 | 61050 |
| 00:15:00       | 00:30:00     | 61050 | 61100 |

This makes it explicit which period each row represents.

## Use Cases

**Financial reporting:**
- Trading periods often labeled by close time
- "End of day" reports use day's end timestamp
- Quarterly reports labeled Q1 end, Q2 end, etc.

**Billing periods:**
- Monthly usage from Jan 1 to Jan 31 labeled as "Jan 31"
- Hourly electricity usage labeled by hour end

**SLA monitoring:**
- Availability windows labeled by period end
- "99.9% uptime for hour ending at 14:00"

**Compliance:**
- Some regulations require end-of-period timestamps
- Audit trails with closing timestamps

## Grafana Visualization

When using with Grafana time-series charts, the shifted timestamp aligns with the period represented:

```sql
SELECT
  dateadd('m', 15, timestamp) as time,
  avg(price) as value,
  symbol as metric
FROM trades
WHERE $__timeFilter(timestamp)
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 15m;
```

The chart will show data points at 00:15, 00:30, 00:45, etc., representing the aggregated values for the 15 minutes ending at those times.

## Center of Interval

For some visualizations, you may want to label with the interval midpoint:

```sql
SELECT
  dateadd('m', 7.5, timestamp) as timestamp,  -- 7.5 minutes = halfway through 15min
  ...
FROM trades
SAMPLE BY 15m;
```

Use decimal minutes for fractional intervals (7.5 minutes = 7 minutes 30 seconds).

## Alignment with Calendar

For calendar-aligned intervals:

```sql
SELECT
  dateadd('d', 1, timestamp) as timestamp,
  ...
FROM trades
SAMPLE BY 1d ALIGN TO CALENDAR;
```

With `ALIGN TO CALENDAR`, day boundaries align to midnight UTC (or configured timezone). The shifted timestamp then represents the end of each calendar day.

:::tip Left vs Right Bound
- **Left bound (default)**: Common in databases and programming - interval [start, end)
- **Right bound (shifted)**: Common in business reporting - "value as of end of period"
- **Choose based on domain**: Financial data often uses right bound, technical data often uses left bound
:::

:::warning Timestamp in Green
When QuestDB web console displays timestamp in green, it indicates the designated timestamp column. After applying `dateadd()`, the timestamp is no longer "designated" - it's a derived column. This doesn't affect query correctness, only console display.
:::

:::info Related Documentation
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [dateadd()](/docs/reference/function/date-time/#dateadd)
- [ALIGN TO CALENDAR](/docs/reference/sql/select/#align-to-calendar-time-zones)
- [Designated timestamp](/docs/concept/designated-timestamp/)
:::
