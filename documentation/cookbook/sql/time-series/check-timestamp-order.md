---
title: Check whether data is sorted by timestamp
sidebar_label: Check timestamp order
description: Detect out-of-order timestamps in QuestDB tables, CSV imports and external Parquet files by comparing each row against the previous one with lag().
---

A table with a designated timestamp is always stored in ascending timestamp order. Data that arrives without a designated timestamp has no such guarantee: a CSV import, an external Parquet file or a non-WAL table can be in any order. This recipe checks the order before you rely on it, which avoids a `TIMESTAMP()` clause that fails at runtime or a time-series query that silently returns the wrong shape.

## Problem

You have a dataset whose ordering you cannot assume, and you need to know whether its timestamp column ascends before applying `TIMESTAMP()`, `SAMPLE BY` or `LATEST ON`.

## Solution

Compare each row's timestamp against the previous row with `lag()`, then count the rows that go backwards:

```questdb-sql demo title="Count out-of-order timestamps"
SELECT count() AS out_of_order_rows
FROM (
  SELECT timestamp AS current_ts, lag(timestamp) OVER () AS previous_ts
  FROM trades
  WHERE timestamp IN '$today'
)
WHERE current_ts < previous_ts;
```

A result of `0` means the data is sorted. The `trades` table has a designated timestamp, so it returns `0`. Run the same query against an unsorted source and the count is the number of positions where the order breaks.

The comparison must be `current_ts < previous_ts`. Testing `current_ts > previous_ts` matches every normal increase instead of the violations, so it returns almost every row of a correctly sorted table.

`lag()` returns `null` for the first row, and comparing against `null` is false, so the first row is never reported as a violation.

:::note Order without ORDER BY
`lag(timestamp) OVER ()` has no `ORDER BY`, so it follows the order in which QuestDB scans the table. That scan order is exactly what this recipe tests, which is why adding an `ORDER BY` here would defeat the check.
:::

## Find the first row that breaks the order

Counting tells you how much data is out of order. To see where it breaks, number the rows and return the first violation:

```questdb-sql demo title="Find the first out-of-order timestamp"
WITH column_and_prev AS (
  SELECT row_number() OVER () AS rownum,
         timestamp AS current_ts,
         lag(timestamp) OVER () AS previous_ts
  FROM trades
  WHERE timestamp IN '$today'
)
SELECT rownum, current_ts, previous_ts
FROM column_and_prev
WHERE current_ts < previous_ts
LIMIT 1;
```

An empty result means the data is sorted. `row_number()` and `lag()` both follow scan order here, so `rownum` is the position of the offending row and `LIMIT 1` returns the earliest one.

## Check another column against timestamp order

The same shape answers whether a non-timestamp column ever decreases as time advances. Swap the timestamp for the column you care about:

```questdb-sql demo title="Check whether price only rises over time"
WITH column_and_prev AS (
  SELECT row_number() OVER () AS rownum,
         price AS current_price,
         lag(price) OVER () AS previous_price
  FROM trades
  WHERE symbol = 'BTC-USDT' AND timestamp IN '$today'
)
SELECT rownum, current_price, previous_price
FROM column_and_prev
WHERE current_price < previous_price
LIMIT 1;
```

This returns a row, because price falls as well as rises. Filtering by a single symbol matters: without it, the comparison runs across interleaved symbols and reports breaks that mean nothing.

To compare a column against something other than the designated timestamp, see [Check whether a column is sorted by another column](/docs/cookbook/sql/advanced/check-column-sort-order/).

## Check an external Parquet file

`read_parquet()` returns no designated timestamp, so its order is unknown until you test it. Check the file before wrapping it in `TIMESTAMP()`:

```questdb-sql demo title="Check timestamp order in a Parquet file"
SELECT count() AS out_of_order_rows
FROM (
  SELECT timestamp AS current_ts, lag(timestamp) OVER () AS previous_ts
  FROM read_parquet('trades.parquet')
)
WHERE current_ts < previous_ts;
```

If the count is `0`, you can apply `TIMESTAMP()` directly. If not, add an `ORDER BY` first.

:::info Related documentation
- [Force a designated timestamp](/docs/cookbook/sql/time-series/force-designated-timestamp/)
- [Check whether a column is sorted by another column](/docs/cookbook/sql/advanced/check-column-sort-order/)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
- [Window functions reference](/docs/query/functions/window-functions/reference/)
- [Parquet functions](/docs/query/functions/parquet/)
:::
