---
title: FILL PREV with Historical Values
sidebar_label: FILL PREV with history
description: Use FILL(PREV) with a filler row to carry historical values into a filtered time interval
---

When using `FILL(PREV)` with `SAMPLE BY` on a filtered time interval, gaps at the beginning may have null values because `PREV` only uses values from within the filtered interval. This recipe shows how to carry forward the last known value from before the interval.

## Problem

When you filter a time range and use `FILL(PREV)` or `FILL(LINEAR)`, QuestDB only considers values within the filtered interval. If the first sample bucket has no data, it will be null instead of carrying forward the last known value from before the interval.

## Solution

Use a "filler row" by querying the latest value before the filtered interval with `LIMIT -1`, then combine it with your filtered data using `UNION ALL`. The filler row provides the initial value for `FILL(PREV)` to use:

```questdb-sql demo title="FILL with PREV values carried over last row before the time range in the WHERE"
DECLARE
  @start_ts := dateadd('s', -3, now()),
  @end_ts := now()
WITH
filler_row AS (
  SELECT timestamp, open_mid AS open, high_mid AS high, close_mid AS close, low_mid AS low
  FROM core_price_1s
  WHERE timestamp < @start_ts
  LIMIT -1
),
sandwich AS (
  SELECT * FROM (
    SELECT * FROM filler_row
    UNION ALL
    SELECT timestamp, open_mid AS open, high_mid AS high, close_mid AS close, low_mid AS low
    FROM core_price_1s
    WHERE timestamp BETWEEN @start_ts AND @end_ts
  ) ORDER BY timestamp
),
sampled AS (
  SELECT
    timestamp,
    first(open) AS open,
    first(high) AS high,
    first(low) AS low,
    first(close) AS close
  FROM sandwich
  SAMPLE BY 100T
  FILL(PREV, PREV, PREV, PREV, 0)
)
SELECT * FROM sampled WHERE timestamp >= @start_ts;
```

This query:
1. Gets the latest row before the filtered interval using `LIMIT -1` (last row)
2. Combines it with filtered interval data using `UNION ALL`
3. Applies `SAMPLE BY` with `FILL(PREV)` - the filler row provides initial values
4. Filters results to exclude the filler row, keeping only the requested interval

The filler row ensures that gaps at the beginning of the interval carry forward the last known value rather than showing nulls.

:::info Related Documentation
- [SAMPLE BY aggregation](/docs/query/sql/sample-by/)
- [FILL keyword](/docs/query/sql/sample-by/#fill-options)
- [LIMIT keyword](/docs/query/sql/limit/)
:::
