---
title: General and Sampled Aggregates
sidebar_label: General + sampled aggregates
description: Combine overall statistics with time-bucketed aggregates using CROSS JOIN
---

Combine overall (unsampled) aggregates with sampled aggregates in the same query.

## Problem

You have a query with three aggregates:

```sql
SELECT max(price), avg(price), min(price)
FROM trades_2024
WHERE timestamp IN '2024-08';
```

This returns:
```
max      avg          min
======== ===========  ========
61615.43 31598.71891  58402.01
```

And another query to get event count per second, then select the maximum:

```sql
SELECT max(count_sec) FROM (
  SELECT count() as count_sec FROM trades
  WHERE timestamp IN '2024-08'
  SAMPLE BY 1s
);
```

This returns:
```
max
====
1241
```

You want to combine both results in a single row:

```
max      avg          min       max_count
======== ===========  ========  =========
61615.43 31598.71891  58402.01  1241
```

## Solution: CROSS JOIN

A `CROSS JOIN` can join every row from the first query (1 row) with every row from the second (1 row), so you get a single row with all the aggregates combined:

```questdb-sql demo title="Combine general and sampled aggregates"
WITH
sampled AS (
  SELECT timestamp, count() as count_sec FROM trades
  WHERE timestamp IN '2024-08'
  SAMPLE BY 1s
  ORDER BY 2 DESC
  LIMIT -1
)
SELECT max(price), avg(price), min(price), count_sec as max_count
FROM trades_2024 CROSS JOIN sampled
WHERE trades_2024.timestamp IN '2024-08';
```

## Grafana Baseline Visualization

Format for Grafana with baseline reference line:

```questdb-sql demo title="Time-series with baseline for Grafana"
WITH baseline AS (
  SELECT avg(response_time_ms) as avg_response_time
  FROM api_metrics
  WHERE timestamp >= dateadd('d', -7, now())
),
timeseries AS (
  SELECT
    timestamp as time,
    avg(response_time_ms) as current_response_time
  FROM api_metrics
  WHERE $__timeFilter(timestamp)
  SAMPLE BY $__interval
)
SELECT
  timeseries.time,
  timeseries.current_response_time as "Current",
  baseline.avg_response_time as "7-Day Average"
FROM timeseries
CROSS JOIN baseline
ORDER BY timeseries.time;
```

Grafana will plot both series, making it easy to see when current values deviate from baseline.

:::info Related Documentation
- [CROSS JOIN](/docs/query/sql/join/#cross-join)
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Grafana integration](/docs/integrations/visualization/grafana/)
:::
