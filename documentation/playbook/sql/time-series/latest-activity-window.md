---
title: Query Last N Minutes of Activity
sidebar_label: Latest activity window
description: Get rows from the last N minutes of recorded activity using subqueries with max(timestamp)
---

Query data from the last N minutes of recorded activity in a table, regardless of the current time. This is useful when data collection is intermittent or when you want to analyze recent activity relative to when data was last recorded, not relative to "now".

## Problem: Relative to Latest Data, Not Current Time

You want the last 15 minutes of activity from your table, but:
- Data collection may have stopped hours or days ago
- Using `WHERE timestamp > dateadd('m', -15, now())` would return empty results if no recent data
- You need a query relative to the latest timestamp IN the table

**Example scenario:**
- Latest timestamp in table: `2025-03-23T07:24:37`
- Current time: `2025-03-25T14:30:00` (2 days later)
- You want: Data from `2025-03-23T07:09:37` to `2025-03-23T07:24:37` (last 15 minutes of activity)

## Solution: Subquery with max(timestamp)

Use a subquery to find the latest timestamp, then filter relative to it:

```questdb-sql demo title="Last 15 minutes of recorded activity"
SELECT * FROM trades
WHERE timestamp >= (
  SELECT dateadd('m', -15, timestamp)
  FROM trades
  LIMIT -1
);
```

This query:
1. `LIMIT -1` gets the latest row (by designated timestamp)
2. `dateadd('m', -15, timestamp)` calculates 15 minutes before that
3. Outer query filters all rows from that boundary forward

**Results:**
All rows from the last 15 minutes of activity, regardless of when that activity occurred relative to now.

## How It Works

### The LIMIT -1 Trick

```sql
SELECT timestamp FROM trades LIMIT -1
```

In QuestDB, negative LIMIT returns the last N rows (sorted by designated timestamp in descending order). `LIMIT -1` returns only the single most recent row.

### Correlated Subquery Support

QuestDB supports correlated subqueries in specific contexts, including timestamp comparisons:

```sql
WHERE timestamp >= (SELECT ... FROM table LIMIT -1)
```

The subquery executes once and returns a scalar timestamp value, which is then used in the WHERE clause for all rows.

### Why Not dateadd on the Left?

```sql
-- Less efficient (calculates for every row)
WHERE dateadd('m', -15, now()) < timestamp

-- More efficient (calculates once)
WHERE timestamp >= (SELECT dateadd('m', -15, timestamp) FROM trades LIMIT -1)
```

When the calculation is on the right side, it's evaluated once. On the left side, it would need to be evaluated for every row in the table.

## Different Time Windows

**Last hour of activity:**
```sql
SELECT * FROM trades
WHERE timestamp >= (
  SELECT dateadd('h', -1, timestamp)
  FROM trades
  LIMIT -1
);
```

**Last 30 seconds:**
```sql
SELECT * FROM trades
WHERE timestamp >= (
  SELECT dateadd('s', -30, timestamp)
  FROM trades
  LIMIT -1
);
```

**Last day:**
```sql
SELECT * FROM trades
WHERE timestamp >= (
  SELECT dateadd('d', -1, timestamp)
  FROM trades
  LIMIT -1
);
```

## With Symbol Filtering

Get latest activity for a specific symbol:

```questdb-sql demo title="Last 15 minutes of BTC-USDT activity"
SELECT * FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp >= (
    SELECT dateadd('m', -15, timestamp)
    FROM trades
    WHERE symbol = 'BTC-USDT'
    LIMIT -1
  );
```

Note that the subquery also filters by symbol to find the latest timestamp for that specific symbol.

## Multiple Symbols with Different Latest Times

For each symbol, get its own last 15 minutes:

```sql
WITH latest_per_symbol AS (
  SELECT symbol, max(timestamp) as latest_ts
  FROM trades
  GROUP BY symbol
)
SELECT t.*
FROM trades t
JOIN latest_per_symbol l ON t.symbol = l.symbol
WHERE t.timestamp >= dateadd('m', -15, l.latest_ts);
```

This handles cases where different symbols have different latest timestamps.

## Performance Considerations

**Efficient execution:**
- The subquery with `LIMIT -1` is very fast (O(1) operation on designated timestamp)
- Returns immediately without scanning the table
- The calculated boundary is reused for all rows in the outer query

**Avoid CROSS JOIN approach:**
```sql
-- Less efficient alternative
WITH ts AS (
  SELECT max(timestamp) as latest_ts FROM trades
)
SELECT * FROM trades CROSS JOIN ts
WHERE timestamp > dateadd('m', -15, latest_ts);
```

While this works, the subquery approach is cleaner and equally performant.

## Combining with Aggregations

**Count trades in last 15 minutes of activity:**
```questdb-sql demo title="Trade count in last 15 minutes of activity"
SELECT
  symbol,
  count(*) as trade_count,
  sum(amount) as total_volume
FROM trades
WHERE timestamp >= (
  SELECT dateadd('m', -15, timestamp)
  FROM trades
  LIMIT -1
)
GROUP BY symbol
ORDER BY trade_count DESC;
```

**Average price in latest activity window:**
```sql
SELECT
  symbol,
  avg(price) as avg_price,
  min(timestamp) as window_start,
  max(timestamp) as window_end
FROM trades
WHERE timestamp >= (
  SELECT dateadd('m', -15, timestamp)
  FROM trades
  LIMIT -1
)
GROUP BY symbol;
```

## Alternative: Store Latest Timestamp

For frequently-run queries, consider materializing the latest timestamp:

```sql
-- Create a single-row table
CREATE TABLE latest_activity (
  latest_ts TIMESTAMP
);

-- Update periodically (e.g., every minute)
INSERT INTO latest_activity
SELECT max(timestamp) FROM trades;

-- Use in queries
SELECT * FROM trades
WHERE timestamp >= (
  SELECT dateadd('m', -15, latest_ts)
  FROM latest_activity
  LIMIT 1
);
```

This avoids recalculating `max(timestamp)` on every query.

## Handling Empty Tables

If the table might be empty:

```sql
SELECT * FROM trades
WHERE timestamp >= COALESCE(
  (SELECT dateadd('m', -15, timestamp) FROM trades LIMIT -1),
  '1970-01-01T00:00:00'  -- Fallback for empty table
);
```

This provides a default timestamp if no data exists.

## Use Cases

**Monitoring dashboards:**
- Show recent activity even if data feed has stopped
- Avoid empty charts when data is delayed

**Data quality checks:**
- "Show me the last 10 minutes of received data"
- Works regardless of current time

**Replay analysis:**
- Analyze historical data relative to when it was recorded
- "What happened in the 15 minutes before system shutdown?"

**Testing with old data:**
- Query patterns work on old datasets
- No need to adjust timestamps to "now"

:::tip When to Use This Pattern
Use this pattern when:
- Data collection is intermittent or may have stopped
- Analyzing historical datasets where "now" is not relevant
- Building replay or analysis tools for past events
- Creating dashboards that show "latest activity" regardless of age
:::

:::warning Subquery Performance
The subquery with `LIMIT -1` is efficient because:
- It operates on the designated timestamp index
- Returns immediately without table scan
- Only executes once for the entire outer query

Don't worry about performance - this pattern is optimized in QuestDB.
:::

:::info Related Documentation
- [LIMIT](/docs/reference/sql/select/#limit)
- [dateadd()](/docs/reference/function/date-time/#dateadd)
- [max()](/docs/reference/function/aggregation/#max)
- [Designated timestamp](/docs/concept/designated-timestamp/)
:::
