---
title: Find Local Minimum and Maximum
sidebar_label: Local min and max
description: Find the minimum and maximum values within a time range around each row
---

Find the minimum and maximum values within a time window around each row to detect local peaks, troughs, or price ranges.

## Problem

You want to find the local minimum and maximum bid price within a time range of each row - for example, the min/max within 1 second before and after each data point.

## Solution 1: Window Function (Past Only)

If you only need to look at **past data**, use a window function with `RANGE`:

```questdb-sql demo title="Local min/max from preceding 1 second"
SELECT timestamp, bid_price,
  min(bid_price) OVER (ORDER BY timestamp RANGE 1 second PRECEDING) AS min_price,
  max(bid_price) OVER (ORDER BY timestamp RANGE 1 second PRECEDING) AS max_price
FROM core_price
WHERE timestamp >= dateadd('m', -1, now()) AND symbol = 'EURUSD';
```

This returns the minimum and maximum bid price from the 1 second preceding each row.

## Solution 2: WINDOW JOIN (Past and Future)

If you need to look at **both past and future data**, use a `WINDOW JOIN`. QuestDB window functions don't support `FOLLOWING`, but WINDOW JOIN allows bidirectional lookback:

```questdb-sql demo title="Local min/max from 1 second before and after"
SELECT p.timestamp, p.bid_price,
  min(pp.bid_price) AS min_price,
  max(pp.bid_price) AS max_price
FROM core_price p
WINDOW JOIN core_price pp ON symbol
  RANGE BETWEEN 1 second PRECEDING AND 1 second FOLLOWING
WHERE p.timestamp >= dateadd('m', -1, now()) AND p.symbol = 'EURUSD';
```

This returns the minimum and maximum bid price from 1 second before to 1 second after each row.

## When to Use Each Approach

| Approach | Use When |
|----------|----------|
| Window function | You only need to look at past data |
| WINDOW JOIN | You need to look at both past and future data |

:::info Related Documentation
- [Window functions](/docs/query/sql/over/)
- [WINDOW JOIN](/docs/query/sql/window-join/)
- [MIN/MAX aggregate functions](/docs/query/functions/aggregation/#min)
:::
