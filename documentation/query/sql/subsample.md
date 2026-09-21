---
title: SUBSAMPLE keyword
sidebar_label: SUBSAMPLE
description: SUBSAMPLE SQL keyword reference for time-series downsampling using the LTTB, M4, MinMax, uniform, and cadence algorithms.
---

`SUBSAMPLE` reduces the number of rows in a query result while preserving the
visual shape of the data. It selects the most representative points from a
time-ordered dataset, making it ideal for rendering charts at screen resolution
without transferring millions of rows to the client.

Unlike [SAMPLE BY](/docs/query/sql/sample-by/), which computes new aggregate
values at synthetic bucket boundaries, `SUBSAMPLE` selects rows from its
immediate query input and never alters their values. Over a direct table
scan, every output row is a physical table row with its original timestamp,
so output timestamps can be used in joins and users can drill down to the
exact source record behind any point on a chart. After `SAMPLE BY`,
`GROUP BY`, a join, or a computed projection, the selected rows are the
derived rows of that query, which can carry aggregate values or synthetic
timestamps.

The query source must provide a
[designated timestamp](/docs/concepts/designated-timestamp/), and the `SELECT`
list must preserve it. A table with a designated timestamp is not enough if
the projection omits that column or replaces it with an expression that loses
the designation.

## Syntax

```questdb-sql title="Value-based algorithms"
SUBSAMPLE lttb(valueColumn, targetPoints [, gapThreshold])
SUBSAMPLE { m4 | minmax }(valueColumn, targetPoints)
```

```questdb-sql title="Position-based algorithms"
SUBSAMPLE uniform(targetPoints)
SUBSAMPLE cadence(stride [, seed])
```

Where:

- **`valueColumn`** - the numeric column used to decide which points are
  visually significant. Required for `lttb`, `m4`, and `minmax`. Not used
  by `uniform` or `cadence`.
- **`targetPoints`** - target number of output rows. Supports integer
  literals, [DECLARE](/docs/query/sql/declare/) variables, and bind
  variables (`$1`). Must be at least 2. Maximum is 2,147,483,647.
- **`stride`** - (`cadence` only) step distance between emitted rows. This
  is not an output count: `cadence(500)` emits one row out of every 500.
- **`seed`** - (`cadence` only) optional integer seed or `NULL`. See
  [cadence](#cadence---every-nth-row).
- **`gapThreshold`** - (`lttb` only) optional interval that enables
  gap-preserving mode. See [gap-preserving LTTB](#gap-preserving-lttb).

### Execution order

`SUBSAMPLE` runs after `SAMPLE BY`, `GROUP BY`, and window functions, but
before `ORDER BY` and `LIMIT`. All value computations are complete before
downsampling decides which rows to keep, and a final `ORDER BY` or `LIMIT`
operates on the selected rows. `SUBSAMPLE` only selects rows. It never
modifies computed values.

Internally, `SUBSAMPLE` computes a keep-or-drop flag for every input row,
the same way a window function computes one value per row, and then filters
the input down to the flagged rows. This selection stage makes two passes
over its input and runs serially. It does not block upstream parallel
execution. For example, a parallel `SAMPLE BY` completes before `SUBSAMPLE`
reads its output.

### Output order

Every algorithm computes its selection against an ascending
designated-timestamp traversal of the input, but the query returns the
selected rows in the order of the incoming query. A descending timestamp
input stays descending, and an input explicitly ordered by another column
keeps that order. Add a final `ORDER BY` when you need a specific output
order.

### Supported value types

The value column of `lttb`, `m4`, and `minmax` must be a numeric type:
`DOUBLE`, `FLOAT`, `INT`, `LONG`, `SHORT`, or `BYTE`. For these three
methods, a row is not eligible for selection when its value is `NULL` or
non-finite, or when its timestamp is `NULL`. Rows skipped this way still
count toward the [input row limit](#configuration).

`uniform` and `cadence` take no value column. `NULL` values in any projected
column do not prevent a row from being selected.

## Algorithms

Five algorithms are available. The first three (`lttb`, `minmax`, `m4`)
inspect values to decide which rows are visually significant. The last two
(`uniform`, `cadence`) ignore values and select rows purely by position.
They are useful when the input is dense or as a baseline.

All five select existing rows from their input. No values are ever
interpolated or computed. The diagrams below use a 24-point series as input
(think 24 hourly bars over one day):

![Raw time series](/images/docs/subsample/raw.svg)

### lttb - Largest Triangle Three Buckets

Divides the data into equal-sized row-count buckets and selects the point in
each bucket that forms the largest triangle with its neighbors. The idea is
that points where the line changes direction sharply (a spike, a valley, a
sudden trend shift) form large triangles and get kept, while points in the
middle of a smooth trend form small triangles and get dropped. The first and
last points are always kept. Output is exactly N points when at least N
[eligible rows](#supported-value-types) exist. With fewer eligible rows, all
of them are returned.

Best for line charts where the visual shape matters most - a chart drawn
from the LTTB output looks nearly identical to one drawn from the full
dataset, despite using far fewer points.

![LTTB downsampling](/images/docs/subsample/lttb.svg)

How it works:

1. First and last points are always selected.
2. Remaining data is divided into N-2 equal-sized buckets by row count.
3. For each bucket, the point creating the largest triangle area with the
   previously selected point and the average of the next bucket is chosen.

When the input is much larger than the target (more than about 8 eligible
rows per target point), QuestDB uses a two-stage variant known as
MinMaxLTTB. It first preselects the local minima and maxima from row-count
bins, then runs the triangle stage on those candidates only. The output
count is the same, but the selected points can differ from classic LTTB run
over every raw row. Smaller inputs use classic LTTB directly.

```questdb-sql title="Aggregate to hourly bars, then pick the 8 most representative" demo
SELECT timestamp, avg(price) avg_price
FROM fx_trades
WHERE symbol = 'EURUSD'
  AND timestamp IN '$today'
SAMPLE BY 1h
SUBSAMPLE lttb(avg_price, 8)
```

#### Gap-preserving LTTB

Standard LTTB divides data by row count, so it connects across time gaps. An
optional third parameter sets a gap threshold:

```questdb-sql
SUBSAMPLE lttb(price, 12, '6h')
```

When specified, LTTB scans for gaps where consecutive timestamps are further
apart than the threshold. Gaps below the threshold are ignored - the data is
treated as continuous. Gaps above the threshold split the data into separate
segments, each downsampled independently. Each segment receives an integer
share of the target proportional to its row count, with a minimum of two
points (one for a single-row segment) so that a multi-row segment keeps its
endpoints.

The diagrams below show a dataset with two gaps - a small one (3 hours) and
a large one (24 hours):

![Raw data with gaps](/images/docs/subsample/gap-raw.svg)

Without gap detection, LTTB treats all points as continuous and connects
across both gaps:

![LTTB without gap detection](/images/docs/subsample/gap-no-detect.svg)

With a threshold of `'6h'`, the small gap (3h) is below the threshold so
segments A and B are treated as continuous. The large gap (24h) exceeds the
threshold, so segment C is downsampled separately and both edges of the gap
are retained:

![LTTB with gap detection](/images/docs/subsample/gap-detect.svg)

The diagram draws each segment as a separate line, which is what a client
that breaks lines on large timestamp gaps would render. The SQL result
itself is a flat list of rows with no `NULL` separator row and no segment
identifier, so a renderer that connects consecutive points still joins the
last point of one segment to the first point of the next. To show the
discontinuity on a chart, apply a timestamp-gap or segment-breaking rule in
the client.

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

Gap-preserving LTTB treats `targetPoints` as a goal, not an exact count.
Integer rounding of the proportional shares can leave part of the target
unused, so the output can be below `targetPoints`. When many segments are
detected, the per-segment minimum can push the total output above
`targetPoints`. This is by design so that the same query does not fail for
one time range and succeed for another. Non-gap LTTB, M4, and MinMax treat
`targetPoints` as a hard maximum.

:::

### minmax - Min/Max per time interval

Divides the time range into equal time intervals and selects up to 2 points
per interval: the row with the minimum value and the row with the maximum
value. This creates a visual envelope - at any point on the chart, you can
see the full range the data covered during that interval. The minimum and
maximum rows of every non-empty interval are always retained, and when both
resolve to the same row it is emitted once.

Empty intervals emit no rows, so the result retains the absence of samples
in those intervals. That alone does not make a line renderer break the line
across the gap. As with
[gap-preserving LTTB](#gap-preserving-lttb), the client must apply a
timestamp-gap rule to show the discontinuity.

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

Empty intervals emit no rows, with the same rendering caveat as MinMax and
[gap-preserving LTTB](#gap-preserving-lttb): a line renderer can still
bridge the gap unless the client breaks the line.

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

`targetPoints` is a row budget, not a bucket count: N/4 gives the number of
time buckets. `SUBSAMPLE m4(col, 1920)` creates 480 time buckets and returns
up to 1,920 rows. For one time bucket per pixel column on a 1920-pixel-wide
chart, use `SUBSAMPLE m4(col, 7680)`. Empty buckets and role deduplication
can reduce the returned row count.

:::

### uniform - Evenly spaced rows

Selects a target number of rows spaced evenly across the input. First and
last rows are always kept, interior rows are picked at regular positions
between them. Unlike the previous algorithms, `uniform` does not inspect
values. It reduces row count purely by position in the timestamp-ordered
traversal of the input.

Use `uniform` when the input is dense and you care about reducing transfer
size more than preserving spikes or troughs. Because it ignores values, it
can visibly miss spikes and troughs. For a line chart where visual fidelity
matters, `lttb` or `m4` produce better results at the same target count.
`uniform` fits a heatmap, scatter plot, or tabular display where every row
looks similar. It avoids value inspection and the timestamp/value buffer of
the value-based methods, but full-query performance depends on the
surrounding plan.

![Uniform downsampling](/images/docs/subsample/uniform.svg)

How it works:

1. The first and last rows in timestamp order are always selected.
2. Remaining `targetPoints - 2` rows are selected at evenly spaced positions
   between first and last. Fractional positions round half up, so the
   selection is deterministic.
3. Output is exactly `targetPoints` rows when the input is larger than the
   target, otherwise all input rows are returned unchanged.

```questdb-sql title="500 evenly spaced rows from a dense tick table" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE uniform(500)
```

### cadence - Every Nth row

Selects one row out of every N, starting from a configurable offset. Like
`uniform`, `cadence` does not inspect values. It reduces row count by
stepping through the timestamp-ordered traversal of the input at a fixed
rhythm. An optional second parameter
sets the starting offset, either as a fixed seed for reproducible results or
as `NULL` for a fresh random offset each run.

The `stride` parameter is the step distance, not the output count. To keep
500 rows, use `uniform(500)` or `lttb(col, 500)`. `cadence(500)` emits one
row out of every 500, which is a different (and input-dependent) number.

![Cadence downsampling](/images/docs/subsample/cadence.svg)

How it works:

1. When `stride` is greater than 1 and no larger than the input row count,
   the first and last rows in timestamp order are always selected.
2. Between them, one row is selected every `stride` rows, starting from the
   offset position.
3. `cadence(1)` returns every row.
4. When `stride` exceeds the input row count, only the first row is
   selected. The last row is not pinned in this case.

| Form | Behavior |
|------|----------|
| `cadence(N)` | Every Nth row, deterministic, offset 0 |
| `cadence(N, seed)` | Random offset in [0, N), reproducible given seed |
| `cadence(N, NULL)` | Random offset in [0, N), fresh each run |

The seeded and NULL forms exist to avoid phase-lock with periodic signals.
If the input has a 1000-row period and you stride by 1000 with offset 0,
every emitted row hits the same phase of the period and the chart loses the
periodic structure. A random offset breaks this alignment.

:::note

Randomizing the offset helps with aliasing on periodic signals, but it does
not make `cadence` a statistical sampler. It does not produce unbiased
estimates of aggregates like mean or percentile. For those, use
[SAMPLE BY](/docs/query/sql/sample-by/) with the appropriate aggregate
function.

:::

```questdb-sql title="Every 1000th row - simple decimation" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE cadence(1000)
```

```questdb-sql title="Anti-aliasing with reproducible seed"
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE cadence(1000, 42)
```

### Algorithm comparison

| Property | lttb | minmax | m4 | uniform | cadence |
|----------|------|--------|-----|---------|---------|
| Parameter | targetPoints | targetPoints | targetPoints | targetPoints | stride |
| Inspects values | Yes | Yes | Yes | No | No |
| Bucket type | Equal row count | Equal time intervals | Equal time intervals | Equal row spacing | Fixed row stride |
| Points per bucket | Exactly 1 | Up to 2 (min, max) | Up to 4 (first, last, min, max) | N/A | N/A |
| Output count | Exactly N when N or more eligible rows exist, otherwise all eligible rows. Gap mode can return fewer or more than N | Up to N | Up to N | Exactly N (or all rows if fewer) | ~rowCount/stride |
| Gap handling | Connects across. With a threshold, segments are selected independently; a line renderer may still bridge the gap | Empty buckets emit no rows; a line renderer may still bridge the gap | Empty buckets emit no rows; a line renderer may still bridge the gap | Connects across | Connects across |
| Best use case | Line charts | Value range overview | Dashboards, SLA | Dense uniform data | Decimation, anti-aliasing |

## Examples

### Chart-ready downsampling

```questdb-sql title="LTTB: 500 representative points for a line chart" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 500)
```

```questdb-sql title="LTTB with gap detection: preserve gaps larger than 1 hour" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, 500, '1h')
```

```questdb-sql title="M4: first/last/min/max envelope in up to 1,920 rows" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE m4(price, 1920)
```

```questdb-sql title="MinMax: min/max envelope in up to 500 rows" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE minmax(price, 500)
```

```questdb-sql title="Uniform: 500 evenly spaced rows for a dense table" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE uniform(500)
```

```questdb-sql title="Cadence: every 1000th row for quick decimation" demo
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE cadence(1000)
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

Because `SUBSAMPLE` selects existing rows rather than computing new ones,
every selected row retains all the values of its immediate input row. The
query below reads directly from a table, so although `side` and `quantity`
are not involved in the downsampling decision, each output row is a trade
with the side and quantity recorded at that timestamp. When the input is an
aggregation, a join, or a computed projection, the pass-through values are
those of the derived row, not of a physical source record.

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

```questdb-sql title="Parameterized target point count" demo
DECLARE @points := 500
SELECT timestamp, price
FROM fx_trades
WHERE symbol = 'EURUSD'
SUBSAMPLE lttb(price, @points)
```

### With bind variable

```questdb-sql title="Programmatic integration - target as bind variable"
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

- For the target-based methods (`lttb`, `minmax`, `m4`, `uniform`), if the
  input has fewer eligible rows than the target, all of them are returned
  unchanged. `cadence` uses a stride rather than a target.
- Selected rows are returned in the order of the incoming query, not
  necessarily in timestamp-ascending order. See
  [output order](#output-order).
- All columns from the `SELECT` clause pass through for selected rows.
- `SUBSAMPLE` works with `WHERE`, `SAMPLE BY`, `GROUP BY`, `PIVOT`, joins,
  `UNION`, CTEs, subqueries, window functions, `ORDER BY`, and `LIMIT`.
- A final `ORDER BY` and `LIMIT` operate on the selected rows.
- `SUBSAMPLE` inside a parenthesized subquery applies inside that subquery,
  not the outer query.

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `cairo.sql.subsample.max.rows` | 100,000,000 | Maximum number of input rows `SUBSAMPLE` accepts. Exceeding this limit returns an error. |

The limit counts every input row, including rows that `lttb`, `m4`, or
`minmax` skip because of a `NULL` or non-finite value. It is independent of
the `targetPoints` maximum.

Memory use depends on the method:

- `uniform` and `cadence` count the input rows and store only the positions
  of the selected rows. They do not buffer a timestamp/value pair per row.
- `lttb`, `m4`, and `minmax` buffer a 16-byte timestamp/value entry for each
  eligible row, plus bookkeeping for skipped rows and selected positions.

Depending on input order and query shape, the query can need additional row
or sort storage, so no single bytes-per-row figure describes a whole query.

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
