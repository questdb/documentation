---
title: Distribute Discrete Values Across Time Intervals
sidebar_label: Distribute discrete values
description: Spread cumulative measurements across time intervals using sessions and window functions
---

Distribute discrete cumulative measurements across the time intervals between observations. When devices report cumulative values at irregular timestamps, you can spread those values proportionally across the intervals to get per-period averages.

This pattern is useful for scenarios like energy consumption, data transfer volumes, accumulated costs, or any metric where a cumulative value needs to be attributed to the intervals that contributed to it.

## Problem

You have IoT devices reporting watt-hour (Wh) values at irregular timestamps, identified by an `operationId`. You want to plot the sum of average power per operation, broken down by hour.

When an IoT device sends a `wh` value at discrete timestamps, you need to distribute that energy across the hours between measurements to visualize average power consumption per hour.

Raw data:

| timestamp                   | operationId | wh  |
|-----------------------------|-------------|-----|
| 2025-04-01T14:10:59.000000Z | 1001        | 0   |
| 2025-04-01T14:20:01.000000Z | 1002        | 0   |
| 2025-04-01T15:06:29.000000Z | 1003        | 0   |
| 2025-04-01T18:18:05.000000Z | 1001        | 200 |
| 2025-04-01T20:06:36.000000Z | 1003        | 200 |
| 2025-04-01T22:20:10.000000Z | 1002        | 300 |

For operation 1001: 200 Wh consumed between 14:10:59 and 18:18:05 should be distributed across hours 14:00, 15:00, 16:00, 17:00, 18:00.

## Solution

```questdb-sql demo title="Distribute watt-hours across hourly intervals"
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

**How it works:**

The `sampled` subquery creates an entry for each operationId and missing hourly interval, filling with 0 wh for interpolated rows.

The key trick is dividing the data into "sessions". A session is defined by all the rows with no value for wh before a row with a value for wh. Or, if we reverse the timestamp order, a session would be defined by a row with a value for wh, followed by several rows with zero value for the same operationId:

```sql
SUM(CASE WHEN wh > 0 THEN 1 END) OVER (PARTITION BY operationId ORDER BY timestamp DESC) as session
```

For each operationId we get multiple sessions (1, 2, 3...). If we did:

```sql
COUNT() as attributable_hours GROUP BY operationId, session
```

We would get how many attributable rows each session has.

The `counts` subquery uses a window function to `COUNT` the number of rows per session (notice the count window function is not using `order by` so this will not be a running count, but all rows for the same session will have the same value as `attributable_hours`).

It also gets `FIRST_VALUE` for the session sorted by reverse timestamp, which is the `wh` value for the only row with value in each session.

The final query divides the `wh` reported in the session by the number of `attributable_hours`.

:::info Filtering Results
 If you want to filter the results by timestamp or operationId, you should add the filter at the first query (the one named `sampled`), so the rest of the process is done on the relevant subset of data.
:::

:::info Related Documentation
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [FILL](/docs/query/sql/select/#fill)
- [Window functions](/docs/query/sql/over/)
- [FIRST_VALUE](/docs/query/functions/window/#first_value)
:::
