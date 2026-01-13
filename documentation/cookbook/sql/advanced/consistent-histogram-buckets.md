---
title: Consistent Histogram Buckets
sidebar_label: Histogram buckets
description: Generate histogram data with fixed bucket boundaries for consistent distribution analysis
---

Create histograms with consistent bucket boundaries for distribution analysis. Different approaches suit different data characteristics.

## Problem

A fixed bucket size works well for some data but poorly for others. For example, a bucket size of 0.5 produces a nice histogram for BTC trade amounts, but may produce just one or two buckets for assets with smaller typical values.

## Solution 1: Fixed Bucket Size

When you know your data range, use a fixed bucket size:

```questdb-sql demo title="Histogram with fixed 0.5 buckets"
DECLARE @bucket_size := 0.5
SELECT
  floor(amount / @bucket_size) * @bucket_size AS bucket,
  count(*) AS count
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
GROUP BY bucket
ORDER BY bucket;
```

### How It Works

```sql
floor(amount / 0.5) * 0.5
```

1. `amount / 0.5`: Divide by bucket width (1.3 → 2.6)
2. `floor(...)`: Truncate to integer (2.6 → 2)
3. `* 0.5`: Multiply back (2 → 1.0)

Examples:
- 0.3 → floor(0.6) × 0.5 = 0.0
- 1.3 → floor(2.6) × 0.5 = 1.0
- 2.7 → floor(5.4) × 0.5 = 2.5

:::note
You must tune `@bucket_size` for your data range. A size that works for one symbol may not work for another.
:::

## Solution 2: Fixed Bucket Count (Dynamic Size)

To always get approximately N buckets regardless of the data range, calculate the bucket size dynamically:

```questdb-sql demo title="Always ~50 buckets"
DECLARE @bucket_count := 50

WITH raw_data AS (
  SELECT price, amount FROM trades
  WHERE symbol = 'BTC-USDT' AND timestamp IN today()
),
bucket_size AS (
  SELECT (max(price) - min(price)) / (@bucket_count - 1) AS bucket_size FROM raw_data
)
SELECT
  floor(price / bucket_size) * bucket_size AS price_bin,
  round(sum(amount), 2) AS volume
FROM raw_data CROSS JOIN bucket_size
GROUP BY 1
ORDER BY 1;
```

This calculates `(max - min) / 49` to create 50 evenly distributed buckets. The `CROSS JOIN` makes the calculated bucket_size available to each row.

:::tip
If there are fewer distinct values than requested buckets, or if some buckets have no data, you'll get fewer than 50 results.
:::

## Solution 3: Logarithmic Buckets

For data spanning multiple orders of magnitude:

```questdb-sql demo title="Logarithmic buckets for wide value ranges"
SELECT
  power(10, floor(log(amount))) AS bucket,
  count(*) AS count
FROM trades
WHERE symbol = 'BTC-USDT'
  AND amount > 0.000001 -- optional. Just adding here for easier visualization
  AND timestamp IN today()
GROUP BY bucket
ORDER BY bucket;
```

Each bucket covers one order of magnitude (0.001-0.01, 0.01-0.1, 0.1-1.0, etc.).

## Solution 4: Manual Buckets

For simple categorical grouping:

```questdb-sql demo title="Manual category buckets"
SELECT
  CASE
    WHEN amount < 0.01 THEN 'micro'
    WHEN amount < 0.1 THEN 'small'
    WHEN amount < 1.0 THEN 'medium'
    ELSE 'large'
  END AS bucket,
  count(*) AS count
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
GROUP BY bucket;
```

## Time-Series Histogram

Track distribution changes over time by combining with `SAMPLE BY`:

```questdb-sql demo title="Hourly histogram evolution"
DECLARE @bucket_size := 0.5
SELECT
  timestamp,
  floor(amount / @bucket_size) * @bucket_size AS bucket,
  count(*) AS count
FROM trades
WHERE symbol = 'BTC-USDT' AND timestamp IN today()
SAMPLE BY 1h
ORDER BY timestamp, bucket;
```

:::info Related Documentation
- [Aggregate functions](/docs/query/functions/aggregation/)
- [DECLARE](/docs/query/sql/declare/)
- [SAMPLE BY](/docs/query/sql/sample-by/)
:::
