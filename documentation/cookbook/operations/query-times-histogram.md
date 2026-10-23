---
title: Query performance histogram
sidebar_label: Query times histogram
description: Create histogram of query execution times using _query_trace table
---

Create a histogram of query execution times using the `_query_trace` system table.


:::note Enable Query Tracing
[Query tracing](/docs/concepts/deep-dive/query-tracing/) needs to be enabled for the `_query_trace` table to be populated.
:::

## Problem

You want to see how query execution times are distributed, for example how
many queries finish within the fastest 10%, 20%, and so on up to 100%.

## Solution: Percentile-based histogram

Compute every bucket threshold in one pass with
[`percentile_disc`](/docs/query/functions/aggregation/#percentile_disc--quantile_disc)
and an array of percentiles. [`UNNEST ... WITH ORDINALITY`](/docs/query/sql/unnest/)
turns the resulting array into one row per bucket, and a `CROSS JOIN` against
`_query_trace` counts the queries at or below each threshold.

```questdb-sql title="Cumulative histogram of query execution times"
WITH thresholds AS (
  SELECT u.bucket * 10 AS bucket, u.micros_threshold
  FROM (
    SELECT percentile_disc(
      execution_micros,
      ARRAY[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    ) AS p
    FROM _query_trace
  ) q, UNNEST(q.p) WITH ORDINALITY u(micros_threshold, bucket)
)
SELECT t.bucket, t.micros_threshold, count() AS frequency
FROM thresholds t
CROSS JOIN _query_trace qt
WHERE qt.execution_micros <= t.micros_threshold
ORDER BY t.bucket;
```

**Output:**

| bucket | micros_threshold | frequency |
| :----- | :--------------- | :-------- |
| 10     | 524.0            | 9         |
| 20     | 567.0            | 17        |
| 30     | 822.0            | 26        |
| 40     | 1588.0           | 34        |
| 50     | 1909.0           | 43        |
| 60     | 4421.0           | 51        |
| 70     | 7419.0           | 60        |
| 80     | 11096.0          | 68        |
| 90     | 15860.0          | 77        |
| 100    | 20787.0          | 85        |

The histogram is cumulative: each bucket includes the queries from the smaller
buckets. `percentile_disc` returns an execution time that actually occurred, so
the `<=` comparison always includes the query at the threshold, and the 100%
bucket counts every query.

For a non-cumulative histogram, subtract the previous bucket's count with
[`lag()`](/docs/query/functions/window-functions/reference/#lag):

```questdb-sql title="Non-cumulative histogram of query execution times"
WITH thresholds AS (
  SELECT u.bucket * 10 AS bucket, u.micros_threshold
  FROM (
    SELECT percentile_disc(
      execution_micros,
      ARRAY[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    ) AS p
    FROM _query_trace
  ) q, UNNEST(q.p) WITH ORDINALITY u(micros_threshold, bucket)
), cumulative_hist AS (
  SELECT t.bucket, t.micros_threshold, count() AS frequency
  FROM thresholds t
  CROSS JOIN _query_trace qt
  WHERE qt.execution_micros <= t.micros_threshold
  ORDER BY t.bucket
)
SELECT
  bucket,
  micros_threshold,
  frequency - coalesce(lag(frequency) OVER (ORDER BY bucket), 0) AS frequency
FROM cumulative_hist;
```

`percentile_disc` keeps every execution time in memory while it computes the
thresholds. On a very large `_query_trace` table, use
[`approx_percentile`](/docs/query/functions/aggregation/#approx_percentile)
with the same array instead, for example
`approx_percentile(execution_micros, ARRAY[0.1, ..., 1.0], 5)`, which uses a
bounded amount of memory.

:::info Related Documentation
- [Query tracing](/docs/concepts/deep-dive/query-tracing/)
- [percentile_disc() function](/docs/query/functions/aggregation/#percentile_disc--quantile_disc)
- [approx_percentile() function](/docs/query/functions/aggregation/#approx_percentile)
- [UNNEST](/docs/query/sql/unnest/)
:::
