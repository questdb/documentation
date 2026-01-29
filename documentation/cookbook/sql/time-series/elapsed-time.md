---
title: Elapsed time between rows
sidebar_label: Elapsed time
description: Calculate the time elapsed between consecutive rows using lag() and datediff()
---

Calculate the time gap between consecutive events. Useful for detecting delays, measuring inter-arrival times, or identifying gaps in data streams.

## Problem

You want to know how much time passed between each row and the previous one, for example to spot gaps in a data feed or measure event frequency.

## Solution

```questdb-sql demo title="Elapsed time between consecutive trades"
SELECT
  timestamp,
  lag(timestamp) OVER (ORDER BY timestamp) AS prev_timestamp,
  datediff('T', timestamp, lag(timestamp) OVER (ORDER BY timestamp)) AS elapsed_millis
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN '$today'
LIMIT 20;
```

The `datediff('T', timestamp, prev_timestamp)` function returns the difference in milliseconds. Change the unit to control precision:

| Unit | Description |
|------|-------------|
| `'s'` | Seconds |
| `'T'` | Milliseconds |
| `'U'` | Microseconds |

## Raw timestamp subtraction

If you subtract timestamps directly instead of using `datediff`, the result is in the **native resolution of the column** (microseconds for `TIMESTAMP`, nanoseconds for `TIMESTAMP_NS`):

```questdb-sql demo title="Raw difference in microseconds"
SELECT
  timestamp,
  timestamp - lag(timestamp) OVER (ORDER BY timestamp) AS elapsed_micros
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN '$today'
LIMIT 20;
```

:::note TIMESTAMP vs TIMESTAMP_NS
The `trades` table uses `TIMESTAMP` (microsecond precision), so subtraction gives microseconds. Tables like `fx_trades` use `TIMESTAMP_NS` (nanosecond precision), where subtraction gives nanoseconds.
:::

:::info Related documentation
- [lag() function](/docs/query/functions/window-functions/reference/#lag)
- [datediff() function](/docs/query/functions/date-time/#datediff)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
:::
