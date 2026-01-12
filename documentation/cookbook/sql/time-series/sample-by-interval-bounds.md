---
title: Right Interval Bound with SAMPLE BY
sidebar_label: Interval bounds
description: Shift SAMPLE BY timestamps to use right interval bound instead of left bound
---

Use the right interval bound (end of interval) instead of the left bound (start of interval) for SAMPLE BY timestamps.

## Problem

Records are grouped in a 15-minute interval. For example, records between 2025-03-22T00:00:00.000000Z and 2025-03-22T00:15:00.000000Z are aggregated with timestamp 2025-03-22T00:00:00.000000Z.

You want the aggregation to show 2025-03-22T00:15:00.000000Z (the right bound of the interval rather than left).

## Solution

Simply shift the timestamp in the SELECT:

```questdb-sql demo title="SAMPLE BY with right bound"
SELECT
    dateadd('m', 15, timestamp) AS timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
SAMPLE BY 15m;
```

Note that on executing this query, QuestDB is not displaying the timestamp in green on the web console. This is because we are not outputting the original designated timestamp, but a derived column. If you are not going to use this query in a subquery, then you are good to go. But if you want to use the output of this query in a subquery that requires a designated timestamp, you could do something like this to force sort order by the derived timestamp column:

```sql
(
SELECT
    dateadd('m', 15, timestamp) AS timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
SAMPLE BY 15m
) ORDER BY timestamp;
```

:::info Related Documentation
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [dateadd()](/docs/query/functions/date-time/#dateadd)
:::
