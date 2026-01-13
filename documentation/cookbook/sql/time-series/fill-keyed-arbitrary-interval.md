---
title: FILL on keyed queries with arbitrary intervals
sidebar_label: FILL keyed arbitrary interval
description: Use FILL with keyed queries across arbitrary time intervals by sandwiching data with null boundary rows
---

When using `SAMPLE BY` with `FILL` on keyed queries (queries with non-aggregated columns like symbol), the `FROM/TO` syntax doesn't work. This recipe shows how to fill gaps across an arbitrary time interval for keyed queries.

## Problem

Keyed queries - queries that include non-aggregated columns beyond the timestamp - do not support the `SAMPLE BY FROM x TO y` syntax when using `FILL`. Without this feature, gaps are only filled between the first and last existing row in the filtered results, not across your desired time interval.

For example, if you want to sample by symbol and timestamp bucket with `FILL` for a specific time range, standard approaches will not fill gaps at the beginning or end of your interval.

## Solution

"Sandwich" your data by adding artificial boundary rows at the start and end of your time interval using `UNION ALL`. These rows contain your target timestamps with nulls for all other columns:

```questdb-sql demo title="FILL arbitrary interval with keyed SAMPLE BY"

DECLARE
  @start_ts := dateadd('m', -2, now()),
  @end_ts := dateadd('m', 2, now())
WITH
sandwich AS (
  SELECT * FROM (
    SELECT @start_ts AS timestamp, null AS symbol, null AS open, null AS high, null AS close, null AS low
    UNION ALL
    SELECT timestamp, symbol, open_mid AS open, high_mid AS high, close_mid AS close, low_mid AS low
    FROM core_price_1s
    WHERE timestamp BETWEEN @start_ts AND @end_ts
    UNION ALL
    SELECT @end_ts AS timestamp, null AS symbol, null AS open, null AS high, null AS close, null AS low
  ) ORDER BY timestamp
),
sampled AS (
  SELECT
    timestamp,
    symbol,
    first(open) AS open,
    first(high) AS high,
    first(low) AS low,
    first(close) AS close
  FROM sandwich
  SAMPLE BY 30s
  FILL(PREV, PREV, PREV, PREV, 0)
)
SELECT * FROM sampled WHERE open IS NOT NULL AND symbol IN ('EURUSD', 'GBPUSD');
```

This query:
1. Creates boundary rows with null values at the start and end timestamps
2. Combines them with filtered data using `UNION ALL`
3. Applies `ORDER BY timestamp` to preserve the designated timestamp
4. Performs `SAMPLE BY` with `FILL` - gaps are filled across the full interval
5. Filters out the artificial boundary rows using `open IS NOT NULL`

The boundary rows ensure that gaps are filled from the beginning to the end of your specified interval, not just between existing data points.

:::info Related Documentation
- [SAMPLE BY aggregation](/docs/query/sql/sample-by/)
- [FILL keyword](/docs/query/sql/sample-by/#fill-options)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
:::
