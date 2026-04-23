---
title: SUBSAMPLE keyword
sidebar_label: SUBSAMPLE
description: SUBSAMPLE SQL keyword reference for time-series downsampling using LTTB, M4, and MinMax algorithms.
---

`SUBSAMPLE` reduces the number of rows in a query result while preserving the
visual shape of the data. It selects the most representative points from a
time-ordered dataset, making it ideal for rendering charts at screen resolution
without transferring millions of rows to the client.

Unlike [SAMPLE BY](/docs/query/sql/sample-by/), which computes new aggregate
values at synthetic bucket boundaries, `SUBSAMPLE` selects actual rows from
the input. Every output row exists in the source table with its original
timestamp and values. This means output timestamps match real rows (useful for
joins), and users can drill down to the exact source record behind any point
on a chart.

Requires a [designated timestamp](/docs/concepts/designated-timestamp/) column.

## Syntax

```questdb-sql
SELECT columns
FROM table
[WHERE conditions]
[SAMPLE BY ...]
SUBSAMPLE { lttb | m4 | minmax }(valueColumn, targetPoints [, gapThreshold])
[ORDER BY ...]
[LIMIT ...]
```

Where:

- **`valueColumn`** - the numeric column used to decide which points are
  visually significant. All other columns pass through for selected rows.
- **`targetPoints`** - target number of output rows. Supports integer
  literals, [DECLARE](/docs/query/sql/declare/) variables, and bind
  variables (`$1`). Must be at least 2. Maximum is 2,147,483,647.
- **`gapThreshold`** - (LTTB only) optional interval that enables
  gap-preserving mode. See [gap-preserving LTTB](#gap-preserving-lttb).

### Execution order

`SUBSAMPLE` runs after `SAMPLE BY`, `GROUP BY`, and window functions, but
before `ORDER BY` and `LIMIT`. All value computations are complete before
downsampling decides which rows to keep. `SUBSAMPLE` only selects rows - it
never modifies computed values.

All three algorithms execute serially. `SUBSAMPLE` buffers its entire input,
runs the selected algorithm, then emits the chosen rows. It does not block
upstream parallel execution - for example, a parallel `SAMPLE BY` completes
before `SUBSAMPLE` buffers its output.

### Supported value types

The value column must be a numeric type: `DOUBLE`, `FLOAT`, `INT`, `LONG`,
`SHORT`, or `BYTE`. `NULL` values in the value column are skipped during
downsampling.

## Algorithms

Three algorithms are available. Each one selects real rows from the input -
no values are ever interpolated or computed. The diagrams below all use the
same 24-point series as input (think 24 hourly bars over one day):

![Raw time series](/images/docs/subsample/raw.svg)

### lttb - Largest Triangle Three Buckets

Divides the data into equal-sized row-count buckets and selects the point in
each bucket that forms the largest triangle with its neighbors. The idea is
that points where the line changes direction sharply (a spike, a valley, a
sudden trend shift) form large triangles and get kept, while points in the
middle of a smooth trend form small triangles and get dropped. The first and
last points are always kept. Output is exactly N points.

Best for line charts where the visual shape matters most - a chart drawn
from the LTTB output looks nearly identical to one drawn from the full
dataset, despite using far fewer points.

![LTTB downsampling](/images/docs/subsample/lttb.svg)

How it works:

1. First and last points are always selected.
2. Remaining data is divided into N-2 equal-sized buckets by row count.
3. For each bucket, the point creating the largest triangle area with the
   previously selected point and the average of the next bucket is chosen.
4. Output preserves the original timestamp order.

```questdb-sql title="Aggregate to hourly bars, then pick the 8 most representative" demo
SELECT timestamp, avg(price) avg_price
FROM fx_trades
WHERE symbol = 'EURUSD'
  AND timestamp IN '$today'
SAMPLE BY 1h
SUBSAMPLE lttb(avg_price, 8)
```

### minmax - Min/Max per time interval

Divides the time range into equal time intervals and selects up to 2 points
per interval: the row with the minimum value and the row with the maximum
value. This creates a visual envelope - at any point on the chart, you can
see the full range the data covered during that interval. No spike or drop
is ever hidden, even under heavy compression. Empty intervals produce no
output, naturally preserving data gaps.

![MinMax downsampling](/images/docs/subsample/minmax.svg)

How it works:

1. The total time range is divided into N/2 equal time intervals.
2. For each interval, up to 2 points are selected: min, max.
3. Duplicate points are removed (if min and max are the same row).
4. Empty intervals produce no output.

Output is up to N points (N/2 buckets, up to 2 points each).

```questdb-sql title="Hourly bars reduced to 8 with MinMax - min/max per bucket" demo
SELECT timestamp, avg(price) avg_price
FROM fx_trades
WHERE symbol = 'EURUSD'
  AND timestamp IN '$today'
SAMPLE BY 1h
SUBSAMPLE minmax(avg_price, 8)
```

### m4 - Min/Max/First/Last per time interval

Builds on MinMax by also capturing the first and last rows in each time
interval. Where MinMax shows you the range of values in a bucket, M4 also
shows you where the data entered and exited - the opening and closing levels.
This matters when trends within a bucket are important: a price that opens
high, dips, then recovers looks different from one that opens low and climbs.
MinMax would show the same min/max range for both; M4 distinguishes them.

Empty intervals produce no output, naturally preserving data gaps.

![M4 downsampling](/images/docs/subsample/m4.svg)

How it works:

1. The total time range is divided into N/4 equal time intervals.
2. For each interval, up to 4 points are selected: first, last, min, max.
3. When multiple roles resolve to the same physical row (e.g., the minimum
   value is also the first row), duplicates are removed. A bucket emits
   between 1 and 4 rows depending on the data.
4. Empty intervals produce no output.

Output is up to N points (N/4 buckets, up to 4 points each). In the diagram
above, compare the right side with MinMax: M4 captures the exit at i=23
(the pullback after the late spike), while MinMax ends at the peak. M4
gives a more faithful picture of where the data actually settled.

```questdb-sql title="Hourly bars reduced to 8 with M4 - captures entry/exit levels" demo
SELECT timestamp, avg(price) avg_price
FROM fx_trades
WHERE symbol = 'EURUSD'
  AND timestamp IN '$today'
SAMPLE BY 1h
SUBSAMPLE m4(avg_price, 8)
```

:::tip

When sizing `targetPoints` for a pixel-wide chart, remember that N/4 gives
the number of time buckets. A 1920-pixel-wide chart needs
`SUBSAMPLE m4(col, 1920)` to get 480 time buckets with up to 4 points each.

:::

### Gap-preserving LTTB

Standard LTTB divides data by row count, so it connects across time gaps. An
optional third parameter sets a gap threshold:

```questdb-sql
SUBSAMPLE lttb(price, 12, '6h')
```

When specified, LTTB scans for gaps where consecutive timestamps are further
apart than the threshold. Gaps below the threshold are ignored - the data is
treated as continuous. Gaps above the threshold split the data into separate
segments, each downsampled independently with its proportional share of the
target points.

The diagrams below show a dataset with two gaps - a small one (3 hours) and
a large one (24 hours):

![Raw data with gaps](/images/docs/subsample/gap-raw.svg)

Without gap detection, LTTB treats all points as continuous and connects
across both gaps:

![LTTB without gap detection](/images/docs/subsample/gap-no-detect.svg)

With a threshold of `'6h'`, the small gap (3h) is below the threshold so
segments A and B are treated as continuous. The large gap (24h) exceeds the
threshold, so segment C is downsampled separately and the gap is preserved:

![LTTB with gap detection](/images/docs/subsample/gap-detect.svg)

Supported interval units: `s` (seconds), `m` (minutes), `h` (hours),
`d` (days).

Examples: `'30s'`, `'5m'`, `'1h'`, `'7d'`

```questdb-sql title="Preserve gaps larger than 6 hours in the output" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 12, '6h')
```

:::note

Gap-preserving LTTB uses a soft target. Each segment receives at least its
first and last points. When many segments are detected, the total output may
exceed `targetPoints`. This is by design so that the same query does not fail
for one time range and succeed for another. Non-gap LTTB, M4, and MinMax
treat `targetPoints` as a hard maximum.

:::

### Algorithm comparison

| Property | lttb | minmax | m4 |
|----------|------|--------|-----|
| Bucket type | Equal row count | Equal time intervals | Equal time intervals |
| Points per bucket | Exactly 1 | Up to 2 (min, max) | Up to 4 (first, last, min, max) |
| Output count | Exactly N (non-gap mode) | Up to N | Up to N |
| Gap handling | Connects across gaps (use 3rd parameter to preserve) | Naturally preserves gaps | Naturally preserves gaps |
| Best use case | Line charts, shape preservation | Quick value range overview | Dashboards, SLA compliance |

## Examples

### Chart-ready downsampling

```questdb-sql title="LTTB: 500 representative points for a line chart" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 500)
```

```questdb-sql title="M4: pixel-accurate envelope for a 1920px-wide chart" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE m4(price, 1920)
```

```questdb-sql title="MinMax: lightweight envelope at half the output of M4" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE minmax(price, 500)
```

### Composing with SAMPLE BY

```questdb-sql title="Aggregate to 1-minute bars, then downsample" demo
SELECT timestamp, avg(price) avg_price
FROM fx_trades
WHERE symbol = 'EURUSD'
SAMPLE BY 1m
SUBSAMPLE lttb(avg_price, 500)
```

`SAMPLE BY` computes aggregate values at bucket boundaries. `SUBSAMPLE` then
selects the most representative rows from that output. The two operations
complement each other: aggregate first, then reduce for display.

### Multiple columns pass through

```questdb-sql title="LTTB selects rows by price; all columns emit" demo
SELECT timestamp, symbol, side, price, quantity
FROM fx_trades
WHERE symbol = 'GBPUSD'
SUBSAMPLE lttb(price, 500)
```

### After window functions

```questdb-sql title="Window functions see all rows before SUBSAMPLE selects" demo
SELECT timestamp, price,
    avg(price) OVER (ROWS 10 PRECEDING) ma
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 500)
```

Window functions compute on the full dataset. `SUBSAMPLE` then selects from
the result, so the moving average values are accurate.

### With DECLARE variable

```questdb-sql title="Parameterized target point count"
DECLARE @points := 500
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, @points)
```

### With bind variable

```questdb-sql title="Grafana integration - screen width as bind variable"
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, $1)
```

### With ORDER BY and LIMIT

```questdb-sql title="Downsample, then sort by price" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 100)
ORDER BY price DESC
LIMIT 10
```

### Inside subqueries

```questdb-sql title="SUBSAMPLE works inside parenthesized subqueries" demo
SELECT count() FROM (
    SELECT timestamp, price
    FROM fx_trades
    WHERE symbol = 'EURUSD'
    SUBSAMPLE lttb(price, 500)
)
```

## Behavior notes

- If the input has fewer rows than the target, all rows are returned unchanged.
- Output rows are always in timestamp-ascending order.
- All columns from the `SELECT` clause pass through for selected rows.
- `SUBSAMPLE` works with `WHERE`, `SAMPLE BY`, `GROUP BY`, CTEs, subqueries,
  `ORDER BY`, and `LIMIT`.
- `SUBSAMPLE` inside a parenthesized subquery applies inside that subquery,
  not the outer query.

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `cairo.sql.subsample.max.rows` | 100,000,000 | Maximum input rows SUBSAMPLE will buffer. Exceeding this limit returns an error. |

`SUBSAMPLE` buffers its entire input before running the algorithm. For direct
table scans, memory usage is 24 bytes per row. For queries involving
`SAMPLE BY`, `GROUP BY`, or subqueries, memory also scales with the projected
row width. At the default limit, the base buffer is approximately 2.4 GB.

## See also

- [SAMPLE BY](/docs/query/sql/sample-by/) - time-based aggregation
  (computes new values at bucket boundaries, while `SUBSAMPLE` selects
  existing rows)
- [Designated timestamp](/docs/concepts/designated-timestamp/) - required
  for `SUBSAMPLE` to operate
- [Steinarsson, S. (2013). "Downsampling Time Series for Visual Representation"](https://github.com/sveinn-steinarsson/flot-downsample) -
  the original LTTB algorithm and thesis reference
- [Jugel, U. et al. (2014). "M4: A Visualization-Oriented Time Series Data Aggregation"](https://www.vldb.org/pvldb/vol7/p797-jugel.pdf) -
  the M4 paper
