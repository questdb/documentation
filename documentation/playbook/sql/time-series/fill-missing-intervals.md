---
title: Fill Missing Time Intervals
sidebar_label: Fill missing intervals
description: Create regular time intervals and propagate sparse values using FILL with PREV
---

Transform sparse event data into regular time-series by creating fixed intervals and filling gaps with previous values.

## Problem

You have a query like this:

```sql
SELECT timestamp, id, sum(price) as price, sum(dayVolume) as dayVolume
FROM nasdaq_trades
WHERE id = 'NVDA'
SAMPLE BY 1s FILL(PREV, PREV);
```

When there is an interpolation, instead of getting the PREV value for `price` and previous for `dayVolume`, you want both the price and the volume to show the PREV known value for the `dayVolume`. Imagine this SQL was valid:

```sql
SELECT timestamp, id, sum(price) as price, sum(dayVolume) as dayVolume
FROM nasdaq_trades
WHERE id = 'NVDA'
SAMPLE BY 1s FILL(PREV(dayVolume), PREV);
```

## Solution

The `FILL` keyword applies the same strategy to all columns in the result set. QuestDB does not currently support column-specific fill strategies in a single `SAMPLE BY` clause.

To achieve different fill strategies for different columns, you would need to use separate queries with UNION ALL, or handle the conditional filling logic in your application layer.

:::info Related Documentation
- [SAMPLE BY](/docs/reference/sql/sample-by/)
- [FILL keyword](/docs/reference/sql/select/#fill)
:::
