---
title: Query performance histogram
sidebar_label: Query times histogram
description: Create histogram of query execution times using _query_trace table
---

Create a histogram of query execution times using the `_query_trace` system table.


:::note Enable Query Tracing
[Query tracing](/docs/concepts/deep-dive/query-tracing/) needs to be enabled for the `_query_trace` table to be populated.
:::

## Solution: Percentile-based histogram

We can create a subquery that first calculates the percentiles for each bucket, in this case at 10% intervals. Then on a second query we can do a `UNION` of 10 subqueries where each is doing a `CROSS JOIN` against the calculated percentiles and finding how many queries are below the threshold for the bucket.

Note in this case the histogram is cumulative, and each bucket includes the results from the smaller buckets as well. If we prefer non-cumulative, the condition would change from less than to `BETWEEN`.

```sql
WITH quantiles AS (
  SELECT
    approx_percentile(execution_micros, 0.10, 5) AS p10,
    approx_percentile(execution_micros, 0.20, 5) AS p20,
    approx_percentile(execution_micros, 0.30, 5) AS p30,
    approx_percentile(execution_micros, 0.40, 5) AS p40,
    approx_percentile(execution_micros, 0.50, 5) AS p50,
    approx_percentile(execution_micros, 0.60, 5) AS p60,
    approx_percentile(execution_micros, 0.70, 5) AS p70,
    approx_percentile(execution_micros, 0.80, 5) AS p80,
    approx_percentile(execution_micros, 0.90, 5) AS p90,
    approx_percentile(execution_micros, 1.0, 5)  AS p100
  FROM _query_trace
), cumulative_hist AS (
SELECT '10' AS bucket, p10 as micros_threshold, count(*) AS frequency
FROM _query_trace CROSS JOIN quantiles
WHERE execution_micros < p10

UNION ALL

SELECT '20', p20 as micros_threshold,  count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE execution_micros < p20

UNION ALL

SELECT '30', p30 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE execution_micros < p30

UNION ALL

SELECT '40', p40 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p40

UNION ALL

SELECT '50', p50 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p50

UNION ALL

SELECT '60', p60 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p60

UNION ALL

SELECT '70', p70 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p70

UNION ALL

SELECT '80', p80 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p80

UNION ALL

SELECT '90', p90 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
WHERE  execution_micros < p90

UNION ALL

SELECT '100', p100 as micros_threshold, count(*)
FROM _query_trace CROSS JOIN quantiles
 )
 SELECT * FROM cumulative_hist;
```

**Output:**

```csv
"bucket","micros_threshold","frequency"
"10",215.0,26
"20",348.0,53
"30",591.0,80
"40",819.0,106
"50",1088.0,133
"60",1527.0,160
"70",2293.0,186
"80",4788.0,213
"90",23016.0,240
"100",1078759.0,267
```


:::info Related Documentation
- [Query tracing](/docs/concepts/deep-dive/query-tracing/)
- [approx_percentile() function](/docs/query/functions/aggregation/#approx_percentile)
:::
