---
title: Visualization functions
sidebar_label: Visualization
description: SQL functions for rendering inline charts in query results using Unicode block characters.
---

Visualization functions render numeric data as compact Unicode block charts
directly in query results. The output is a `varchar` cell that works everywhere:
psql, the web console, JDBC clients, CSV exports, ...

| Function | Type | Description |
| :------- | :--- | :---------- |
| [bar](#bar) | Scalar | Horizontal bar proportional to a value within a range |
| [depth_chart](#depth_chart) | Scalar | Market depth profile from bid/ask volume arrays |
| [depth_chart_labels](#depth_chart_labels) | Scalar | Market depth profile with volume statistics |
| [ohlc_bar](#ohlc_bar) | Aggregate or Scalar | OHLC candlestick bar from price data or precomputed values |
| [ohlc_bar_labels](#ohlc_bar_labels) | Aggregate or Scalar | OHLC candlestick bar with labeled values |
| [sparkline](#sparkline) | Aggregate | Vertical block chart of values within a group |

## Resolution and rendering

Visualization functions render data as Unicode text characters. Each character
position represents a range of values, not a single precise point. A bar
rendered at width 40 can only distinguish 40 distinct levels across its scale
range. Values that fall within the same character-width bucket are
indistinguishable in the output.

These functions are designed for quick visual inspection of trends, relative
magnitudes, and data structure directly in query results. They are not a
replacement for pixel-level charting tools. For precise values, query the
underlying numbers directly or use the `_labels` variants where available.

Some monospaced fonts render Unicode characters from different blocks at
slightly different pixel widths, which can cause minor horizontal misalignment.
For best results, use a font with consistent Unicode coverage such as JetBrains
Mono, Fira Code, or Cascadia Code.

## bar

`bar(value, min, max, width)` - Renders a single numeric value as a horizontal
bar. The bar is made of full block characters with a fractional block at the end
for sub-character precision.

Characters used (varying width):

```
▏▎▍▌▋▊▉█
```

Characters range from `▏` (1/8 fill, U+258F) to `█` (full fill, U+2588). A
`width` of 20 characters gives 160 discrete levels of resolution (20 x 8).

Since `bar` is a scalar function, it can wrap aggregates like `sum()`, `avg()`,
or `count()` to visualize their results inline.

The web console can
[rotate](#rotating-to-vertical-chart) `bar` output to a vertical chart when the
query returns exactly two columns (timestamp + bar).

#### Parameters

All four arguments are required:

- `value` is any numeric value. Implicitly cast to `double`. `NULL` produces
  `NULL` output.
- `min` (`double`): the value that maps to an empty bar (zero length).
- `max` (`double`): the value that maps to a full bar (`width` characters).
- `width` (`int`): the number of characters at `max` value.

Values below `min` are clamped to an empty bar. Values above `max` are clamped
to a full bar of `width` characters. If `min`, `max`, or `width` are `NULL`, or
if `min >= max`, the function returns `NULL`.

#### Return value

Return value type is `varchar`.

#### Examples

```questdb-sql demo title="Visualize aggregated volume per minute"
SELECT timestamp, symbol,
       round(sum(amount), 2) total,
       bar(sum(amount), 0, 50, 30)
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
SAMPLE BY 1m
LIMIT -10;
```

```questdb-sql demo title="Per-symbol scaling with window functions"
SELECT timestamp, symbol, round(total, 2) total,
       bar(total, min(total) OVER (PARTITION BY symbol),
                  max(total) OVER (PARTITION BY symbol), 30)
FROM (
  SELECT timestamp, symbol, sum(amount) total
  FROM trades
  WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
  SAMPLE BY 1m
)
LIMIT -10;
```

| timestamp                   | symbol   | total  | bar                |
| :-------------------------- | :------- | :----- | :----------------- |
| 2026-03-06T17:18:00.000000Z | ETH-USDT | 72.94  | ██                 |
| 2026-03-06T17:18:00.000000Z | BTC-USDT | 6.76   | ██████             |
| 2026-03-06T17:19:00.000000Z | ETH-USDT | 118.19 | ███                |
| 2026-03-06T17:19:00.000000Z | BTC-USDT | 1.59   | █                  |
| 2026-03-06T17:20:00.000000Z | ETH-USDT | 246.87 | ███████            |
| 2026-03-06T17:20:00.000000Z | BTC-USDT | 14.36  | █████████████      |
| 2026-03-06T17:21:00.000000Z | BTC-USDT | 2.9    | ██                 |
| 2026-03-06T17:21:00.000000Z | ETH-USDT | 375.3  | ██████████         |
| 2026-03-06T17:22:00.000000Z | BTC-USDT | 8.07   | ███████            |
| 2026-03-06T17:22:00.000000Z | ETH-USDT | 529.74 | ███████████████    |

Each symbol's bars scale independently because `PARTITION BY symbol` gives each
its own min/max range.

```questdb-sql demo title="Global scaling across all symbols"
SELECT timestamp, symbol, round(total, 2) total,
       bar(total, min(total) OVER (),
                  max(total) OVER (), 30)
FROM (
  SELECT timestamp, symbol, sum(amount) total
  FROM trades
  WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
  SAMPLE BY 1m
)
LIMIT -10;
```

All symbols share the same min/max, making bars comparable across groups.

```questdb-sql demo title="Inline with row-level data"
SELECT symbol, price,
       bar(price, 0, 100000, 25)
FROM trades
LATEST ON timestamp PARTITION BY symbol;
```

#### See also

- [sparkline](#sparkline) - Aggregate trend chart
- [Web console features](#web-console-features) - rotation to vertical chart

## depth_chart

`depth_chart(bid_volumes[], ask_volumes[] [, width])` - Renders a market depth
profile from bid and ask volume arrays as a single-line sparkline-style chart.
Bids appear on the left (tallest at the edges representing deepest liquidity),
asks on the right, with a spread marker (`╎`) in the center.

See also [depth_chart_labels](#depth_chart_labels), which appends volume
statistics after the chart.

The web console [colorizes](#colorizing) bid and ask sides in green and red.

Characters used:

| Purpose | Character | Code point |
| :------ | :-------- | :--------- |
| Depth levels | `▁▂▃▄▅▆▇█` | U+2581 through U+2588 |
| Spread marker | `╎` | U+254E |

#### Parameters

| Parameter | Type | Description |
| :-------- | :--- | :---------- |
| bid_volumes | DOUBLE[] | Per-level bid volumes, ordered best-to-worst |
| ask_volumes | DOUBLE[] | Per-level ask volumes, ordered best-to-worst |
| width | INT (optional) | Total chart width in characters. Default: array lengths + 1. Minimum: 3. |

Arrays must be one-dimensional. They can have different lengths (asymmetric
books are valid).

#### Return value

Return value type is `varchar`.

#### How scaling works

The function computes cumulative sums from each array, then applies `log1p()` to
compress the dynamic range. This is necessary because cumulative depth grows
exponentially - without log scale, only the deepest levels would be visible and
all near-spread levels would appear as the lowest character.

The log-scaled values are mapped to sparkline characters (`▁` through `█`)
relative to the global min/max across both sides.

#### Width behavior

- **Default**: one character per array element plus the spread marker. A 30-level
  book on each side produces a 61-character chart.
- **Explicit width**: the cumulative curve is subsampled if the width is smaller
  than the arrays. If the width is larger, remaining positions are padded with
  `▁` on the far sides (bids pad on the left, asks pad on the right), keeping
  real data adjacent to the spread.

#### NULL handling

- NULL or empty arrays return NULL
- Non-finite elements (NaN, Infinity) throw an error
- Negative volumes throw an error
- Zero volumes are valid and render as `▁`

#### Examples

```questdb-sql demo title="Latest depth for multiple symbols"
SELECT timestamp, symbol,
       depth_chart(bids[2], asks[2])
FROM market_data
WHERE timestamp IN '$today'
  AND symbol IN ('EURUSD', 'GBPUSD',
    'USDJPY', 'USDCAD', 'USDCHF')
LATEST ON timestamp PARTITION BY symbol;
```

| timestamp | symbol | depth_chart |
| :-------- | :----- | :---------- |
| 2026-04-29T12:11:46.703189Z | USDCAD | █▇▇▇▇▇▆▆▆▆▆▅▅▅▅▅▄▄▄▄▄▃▃▃▃▃▂▂▁▁╎▁▁▂▂▂▃▃▃▃▄▄▄▄▅▅▅▅▅▅▆▆▆▆▆▇▇▇▇▇▇ |
| 2026-04-29T12:11:47.128542Z | USDJPY | ▇▇▇▇▇▇▆▆▆▆▆▅▅▅▅▅▄▄▄▄▄▃▃▃▃▂▂▂▁▁╎▁▁▂▂▂▃▃▃▃▄▄▄▄▄▅▅▅▅▅▆▆▆▆▆▇▇▇▇▇█ |
| 2026-04-29T12:11:47.139327Z | USDCHF | ▇▇▇▇▇▆▆▆▆▆▅▅▅▅▄▄▄▄▄▃▃▃▃▂▂▁▁╎▁▁▂▂▂▃▃▃▄▄▄▄▅▅▅▅▅▆▆▆▆▆▇▇▇▇█ |
| 2026-04-29T12:11:47.188192Z | GBPUSD | ▇▇▇▇▇▇▆▆▆▆▆▅▅▅▅▅▅▄▄▄▄▄▃▃▃▃▃▂▂▂▁▁╎▁▁▂▂▂▃▃▃▃▃▄▄▄▄▄▅▅▅▅▅▅▆▆▆▆▆▇▇▇▇▇█ |
| 2026-04-29T12:11:47.189339Z | EURUSD | ▇▇▆▅▃▁╎▁▃▅▆▇█ |

Each symbol has a different number of depth levels. The chart width adjusts
automatically. Symmetric shapes indicate balanced books; one side taller than the
other indicates a liquidity imbalance.

```questdb-sql demo title="Fixed-width comparison"
SELECT symbol,
       depth_chart(bids[2], asks[2], 21)
FROM market_data
WHERE timestamp IN '$today'
  AND symbol IN ('EURUSD', 'GBPUSD',
    'USDJPY')
LATEST ON timestamp PARTITION BY symbol;
```

| symbol | depth_chart |
| :----- | :---------- |
| EURUSD | ▇▇▆▅▅▄▃▃▂▁╎▁▂▃▃▄▅▅▆▇█ |
| GBPUSD | ▇▇▆▆▅▄▄▃▂▁╎▁▂▃▄▄▅▆▆▇█ |
| USDJPY | ▁▁▁▁█▇▇▇▇▆╎▆▇▇▇▇▇▁▁▁▁ |

At a fixed width, books with different numbers of levels are directly
comparable. The shape reveals structural differences: USDJPY shows an unusual
profile with thin liquidity near the spread and heavy volume at the edges.

#### See also

- [depth_chart_labels](#depth_chart_labels) - same chart with volume statistics
- [sparkline](#sparkline) - for time-series trends rather than point-in-time depth
- [Web console features](#web-console-features) - colorizing of bid/ask sides

## depth_chart_labels

`depth_chart_labels(bid_volumes[], ask_volumes[] [, width])` - Identical to
[depth_chart](#depth_chart) but appends volume statistics after the chart:
`bb:<best_bid_vol> ba:<best_ask_vol> tb:<total_bid_vol> ta:<total_ask_vol>`.

Labels show:

- `bb` - best bid volume (first element of bid array)
- `ba` - best ask volume (first element of ask array)
- `tb` - total bid volume (sum of all bid levels)
- `ta` - total ask volume (sum of all ask levels)

See [depth_chart](#depth_chart) for parameters, scaling behavior, and additional
examples.

#### Examples

```questdb-sql demo title="Depth with volume labels"
SELECT timestamp, symbol,
       depth_chart_labels(bids[2], asks[2])
FROM market_data
WHERE timestamp IN '$today'
  AND symbol IN ('EURUSD', 'GBPUSD')
LATEST ON timestamp PARTITION BY symbol;
```

| timestamp | symbol | depth_chart_labels |
| :-------- | :----- | :----------------- |
| 2026-04-29T12:11:47.188192Z | GBPUSD | ▇▇▇▇▇▇▆▆▆▆▆▅▅▅▅▅▅▄▄▄▄▄▃▃▃▃▃▂▂▂▁▁╎▁▁▂▂▂▃▃▃▃▃▄▄▄▄▄▅▅▅▅▅▅▆▆▆▆▆▇▇▇▇▇█ bb:61656.0 ba:93520.0 tb:6.33657709E8 ta:6.7937576E8 |
| 2026-04-29T12:11:47.189339Z | EURUSD | ▇▇▆▅▃▁╎▁▃▅▆▇█ bb:55648.0 ba:70550.0 tb:973577.0 ta:1009598.0 |

#### See also

- [depth_chart](#depth_chart) - same chart without labels
- [Web console features](#web-console-features) - colorizing of bid/ask sides

## ohlc_bar

Renders OHLC (Open, High, Low, Close) candlestick data as horizontal Unicode
bars. Each row produces a text candlestick showing wick (high-low range) and
body (open-close range), directly in query results.

See also [ohlc_bar_labels](#ohlc_bar_labels), which appends OHLC values after the
bar.

The web console [colorizes](#colorizing) bullish bodies green and bearish bodies
red, and can [rotate](#rotating-to-vertical-chart) the output to a vertical
candlestick chart.

Visual encoding:

| Purpose | Character | Code point |
| :------ | :-------- | :--------- |
| Blank (padding) | `⠀` | U+2800 |
| Wick | `─` | U+2500 |
| Bullish body (close >= open) | `█` | U+2588 |
| Bearish body (close < open) | `░` | U+2591 |
| Doji (close == open at bar resolution) | `│` | U+2502 |

All candles in a result set are scaled against the same min/max bounds, so their
horizontal positions are directly comparable across rows.

### Aggregate variant

`ohlc_bar(price, min, max [, width])` - A GROUP BY / SAMPLE BY aggregate.
Computes Open (first value by row order), High (max), Low (min), and Close (last
value by row order) from raw price observations within each group. Renders using
the supplied min/max bounds for scaling.

**When to use:** raw tick or trade data where you want OHLC candles computed and
rendered in one step with SAMPLE BY.

#### Parameters

| Parameter | Type | Description |
| :-------- | :--- | :---------- |
| price | DOUBLE | Value column to aggregate into OHLC |
| min | DOUBLE | Lower bound for scaling (left edge of bar) |
| max | DOUBLE | Upper bound for scaling (right edge of bar) |
| width | INT (optional) | Bar width in characters, default 40 |

The min and max parameters accept column references, lateral join results,
constants, and bind variables.

#### Bounds

Both variants require explicit min and max bounds for scaling. These bounds
define what price maps to the left edge (position 0) and what price maps to the
right edge (position width-1).

The bounds are not auto-computed from the data. This is deliberate:
auto-computing global bounds inside an aggregate function would be
non-deterministic in QuestDB's parallel execution engine.

Common patterns for supplying bounds:

- **Constants or DECLARE variables** for known price ranges
- **CROSS JOIN subquery** for single-symbol dynamic bounds
- **LATERAL JOIN** for per-symbol bounds in multi-symbol queries

#### FILL support

The aggregate variant supports `FILL(NULL)`, `FILL(PREV)`, and `FILL(NONE)`.
`FILL(LINEAR)` is not supported (interpolating OHLC is undefined).

#### Examples

```questdb-sql demo title="OHLC candles with dynamic bounds"
SELECT timestamp,
       ohlc_bar(price, lo, hi, 50)
FROM fx_trades
CROSS JOIN (
  SELECT min(price) lo, max(price) hi
  FROM fx_trades
  WHERE symbol = 'EURUSD'
)
WHERE symbol = 'EURUSD'
SAMPLE BY 1h
LIMIT -10;
```

| timestamp | ohlc_bar |
| :-------- | :------- |
| 2026-01-27T00:00:00.000000Z | ⠀⠀⠀───────────────────────███──────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ |
| 2026-01-27T01:00:00.000000Z | ⠀⠀⠀⠀───────────░░░░░░░░░░░░░────────────────⠀⠀⠀⠀⠀⠀ |
| 2026-01-27T02:00:00.000000Z | ──────░░░░░░░░░░░░░░░░░░────────────────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ |
| 2026-01-27T03:00:00.000000Z | ────░░░───────────────────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ |
| 2026-01-27T04:00:00.000000Z | ───██████████───────────────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ |
| 2026-01-27T05:00:00.000000Z | ──────────███████────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ |

Bullish candles (`█`) show close above open, bearish candles (`░`) show close
below open. The wick (`─`) extends from high to low.

```questdb-sql title="Candles with constant bounds"
DECLARE @lo := 1.05, @hi := 1.15

SELECT timestamp,
       ohlc_bar(price, @lo, @hi, 50)
FROM fx_trades
WHERE symbol = 'EURUSD'
SAMPLE BY 30m
LIMIT -10;
```

### Scalar variant

`ohlc_bar(open, high, low, close, min, max [, width])` - A per-row scalar
function. Takes precomputed OHLC values and explicit bounds. Does not
aggregate - renders one candle per input row.

**When to use:** OHLC values are already computed (from a subquery, materialized
view, or external source) and you want to render them with precise control over
the scaling bounds.

#### Parameters

| Parameter | Type | Description |
| :-------- | :--- | :---------- |
| open | DOUBLE | Opening price |
| high | DOUBLE | Highest price |
| low | DOUBLE | Lowest price |
| close | DOUBLE | Closing price |
| min | DOUBLE | Lower bound for scaling (left edge) |
| max | DOUBLE | Upper bound for scaling (right edge) |
| width | INT (optional) | Bar width in characters, default 40 |

#### Examples

```questdb-sql demo title="Render precomputed OHLC with window bounds"
SELECT timestamp,
       ohlc_bar(o, h, l, c, mn, mx, 50)
FROM (
  SELECT timestamp, o, h, l, c,
    min(l) OVER () mn,
    max(h) OVER () mx
  FROM (
    SELECT timestamp,
      first(price) o, max(price) h,
      min(price) l, last(price) c
    FROM fx_trades
    WHERE symbol = 'EURUSD'
    SAMPLE BY 1h
  )
)
LIMIT -10;
```

### NULL handling and validation

**Aggregate variant:**

- NULL price values are skipped. If all prices in a group are NULL, the result
  is NULL.
- If either min or max is NULL after reconciliation, the function throws an
  error.
- If `min > max`, the function throws an error.

**Scalar variant:**

- If any OHLC parameter (open, high, low, close) is NULL, the result is NULL.
- If either min or max is NULL, the function throws an error.
- If `low > high`, the function throws an error (catches invalid upstream data).
- If `min > max`, the function throws an error.
- Validation order: NULL check first, then `low > high`, then `min > max`.

#### See also

- [bar](#bar) - simpler single-value horizontal bar
- [ohlc_bar_labels](#ohlc_bar_labels) - same chart with labeled OHLC values
- [Web console features](#web-console-features) - colorizing and rotation

## ohlc_bar_labels

Identical to [ohlc_bar](#ohlc_bar) but appends `O:<val> H:<val> L:<val>
C:<val>` after each candlestick bar. Available in both aggregate and scalar
forms:

- `ohlc_bar_labels(price, min, max [, width])` - aggregate
- `ohlc_bar_labels(open, high, low, close, min, max [, width])` - scalar

See [ohlc_bar](#ohlc_bar) for parameters, bounds, FILL support, NULL handling,
and additional examples.

#### Examples

```questdb-sql demo title="Per-symbol candles with labels"
SELECT timestamp, symbol,
       ohlc_bar_labels(price, lo, hi, 30)
FROM fx_trades t
JOIN LATERAL (
  SELECT min(price) lo, max(price) hi
  FROM fx_trades t2
  WHERE t.symbol = t2.symbol
)
WHERE symbol IN ('EURUSD', 'GBPUSD')
SAMPLE BY 1h
LIMIT -10;
```

| timestamp | symbol | ohlc_bar_labels |
| :-------- | :----- | :-------------- |
| 2026-01-27T00:00:00.000000Z | EURUSD | ⠀⠀─────────────██────⠀⠀⠀⠀⠀⠀⠀⠀⠀ O:1.1982 H:1.2025 L:1.1864 C:1.1992 |
| 2026-01-27T01:00:00.000000Z | EURUSD | ⠀⠀───────░░░░░░░░─────────⠀⠀⠀⠀ O:1.1987 H:1.207 L:1.1868 C:1.1927 |
| 2026-01-27T02:00:00.000000Z | EURUSD | ────░░░░░░░░░░──────────⠀⠀⠀⠀⠀⠀ O:1.1966 H:1.2052 L:1.1851 C:1.1883 |
| 2026-01-27T03:00:00.000000Z | EURUSD | ──░░────────────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ O:1.1879 H:1.1977 L:1.1851 C:1.1868 |
| 2026-01-27T04:00:00.000000Z | EURUSD | ──██████─────────⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ O:1.1867 H:1.1987 L:1.185 C:1.191 |
| 2026-01-27T05:00:00.000000Z | EURUSD | ──────████───⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀ O:1.1903 H:1.1955 L:1.1851 C:1.1932 |

#### See also

- [ohlc_bar](#ohlc_bar) - same chart without labels
- [Web console features](#web-console-features) - colorizing and rotation

## sparkline

`sparkline(value)` or `sparkline(value, min, max, width)` - Collects numeric
values within a group and renders them as a compact vertical block chart. Each
value maps to one character. Best for showing trends, cycles, and spikes.

Characters used (varying height):

```
▁▂▃▄▅▆▇█
```

Characters range from `▁` (lowest, U+2581) to `█` (highest, U+2588), giving 8
levels of vertical resolution per character.

Since `sparkline` is an aggregate, it pairs naturally with
[SAMPLE BY](/docs/query/sql/sample-by/) to show intra-bucket trends.

The input can be any numeric type (`double`, `int`, `long`, `short`, `float`) -
it is implicitly cast to `double`.

#### Parameters

- `value` is any numeric value. Each value produces one character in the output.
- `min` (optional, `double`): lower bound for scaling. Pass `NULL` to
  auto-compute from data. Values below `min` are clamped to the lowest
  character.
- `max` (optional, `double`): upper bound for scaling. Pass `NULL` to
  auto-compute from data. Values above `max` are clamped to the highest
  character.
- `width` (optional, `int`, constant): maximum number of output characters. When
  the group has more values than `width`, the function sub-samples by dividing
  values into equal buckets and averaging each bucket. Must be a positive
  integer.

`min` and `max` can each independently be `NULL`, allowing partial auto-scaling.
For example, `sparkline(price, 0, NULL, 24)` fixes the floor at 0 but
auto-computes the ceiling from the data.

#### Return value

Return value type is `varchar`.

#### Null handling

- `NULL` input values are silently skipped.
- If all values in a group are `NULL`, the function returns `NULL`.
- An empty group (no rows) also returns `NULL`.
- When all values are identical (`min` equals `max`), every character renders as
  `█`, signaling "no variation".

#### Examples

```questdb-sql demo title="Hourly price trends with sub-sampling"
SELECT timestamp, symbol,
       round(avg(price), 0) avg_price,
       sparkline(price, NULL, NULL, 20)
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
  AND timestamp IN '2026-03-07'
SAMPLE BY 1h
LIMIT 10;
```

| timestamp                   | symbol   | avg_price | sparkline            |
| :-------------------------- | :------- | :-------- | :------------------- |
| 2026-03-07T00:00:00.000000Z | BTC-USDT | 68229     | ▄▄▄▄▄▄▃▂▁▁▂▃▃▄▆▇▇▇▇▇ |
| 2026-03-07T00:00:00.000000Z | ETH-USDT | 1981      | ▆▅▄▅▅▄▅▅▆▆▆▄▂▂▂▄▇▆▇▇ |
| 2026-03-07T01:00:00.000000Z | BTC-USDT | 68239     | ▇▅▃▃▂▃▃▂▂▂▂▁▁▁▂▃▃▃▅▅ |
| 2026-03-07T01:00:00.000000Z | ETH-USDT | 1979      | ▇▅▃▃▃▃▂▁▁▃▄▃▂▂▃▂▂▁▂▅ |
| 2026-03-07T02:00:00.000000Z | BTC-USDT | 68182     | ▇▇▇▆▆▆▄▃▂▃▂▂▂▁▂▄▅▆▆▆ |
| 2026-03-07T02:00:00.000000Z | ETH-USDT | 1978      | ▆▆▅▄▃▃▃▃▃▂▂▂▃▅▅▆▆▇▇▇ |
| 2026-03-07T03:00:00.000000Z | BTC-USDT | 68286     | ▇▆▆▆▅▅▅▅▅▄▄▃▂▂▃▃▃▁▁▁ |
| 2026-03-07T03:00:00.000000Z | ETH-USDT | 1986      | ▁▄▇▇▇▆▆▅▅▅▅▅▃▃▃▄▃▂▂▂ |
| 2026-03-07T04:00:00.000000Z | ETH-USDT | 1973      | ▁▁▂▂▃▃▃▄▄▅▇▇▇▇▇▇▆▆▆▆ |
| 2026-03-07T04:00:00.000000Z | BTC-USDT | 68026     | ▁▃▃▃▃▄▄▄▄▅▅▅▇▇▇▇▇▇▆▆ |

The `width` of 20 sub-samples each hour's tick data into 20 characters,
regardless of how many ticks exist within each bucket.

```questdb-sql demo title="Compare intra-day trends across symbols"
SELECT symbol, sparkline(price)
FROM trades
WHERE timestamp IN '2026-03-07'
SAMPLE BY 1h;
```

```questdb-sql demo title="Fixed scale for cross-symbol comparison"
SELECT symbol, sparkline(amount, 0, 1000000, 24)
FROM trades
SAMPLE BY 1d
LIMIT -5;
```

This ensures 0 is always `▁` and 1,000,000 is always `█` across all symbols,
making the sparklines visually comparable.

```questdb-sql demo title="Partial auto-scaling with fixed floor"
SELECT symbol, sparkline(price, 0, NULL, 24)
FROM trades
SAMPLE BY 1d
LIMIT -5;
```

Fixes the floor at 0 but auto-computes the ceiling from the data.

#### Clamping

When explicit `min`/`max` are provided, out-of-range values are clamped:

- A value below `min` renders as `▁` (clamped to floor)
- A value above `max` renders as `█` (clamped to ceiling)
- Values are never silently dropped

#### Limitations

- **Sub-sampling averages buckets.** When `width` is smaller than the number of
  collected values, the function divides values into equal buckets and averages
  each. This smooths spikes. If preserving peaks is important, use a `width`
  equal to or greater than the expected number of values.

- **Limited FILL support.** When used with `SAMPLE BY`, `sparkline` supports
  `FILL(NULL)`, `FILL(NONE)`, and `FILL(PREV)`. `FILL(LINEAR)` and
  `FILL(value)` are not supported.

#### See also

- [bar](#bar) - Scalar horizontal bar
- [Aggregate functions](/docs/query/functions/aggregation/) - Full aggregate
  reference
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation

## Web console features

The QuestDB web console automatically detects visualization function output and
enhances the display with coloring, monospace font rendering, and an interactive
rotation feature.

Detection is automatic: the console checks that the SQL query text contains a
visualization function call, then validates that the output column matches the
expected Unicode signature.

### Colorizing

The web console colorizes output from `ohlc_bar`, `ohlc_bar_labels`,
`depth_chart`, and `depth_chart_labels`. Coloring applies regardless of how many
columns the query returns.

**OHLC coloring** (`ohlc_bar` / `ohlc_bar_labels`):

- Bullish bodies (`█`, close >= open) are displayed in green
- Bearish bodies (`░`, close < open) are displayed in red
- Wick, doji, and padding characters remain in the default text color
- For `ohlc_bar_labels`, the label prefixes (`O:`, `H:`, `L:`, `C:`) are
  displayed in orange

**Market depth coloring** (`depth_chart` / `depth_chart_labels`):

- Bid side (characters before the spread separator `╎`) is displayed in green
- Ask side (characters after the spread separator) is displayed in red
- The spread separator itself remains in the default text color
- For `depth_chart_labels`, the label prefixes (`bb:`, `ba:`, `tb:`, `ta:`) are
  displayed in orange

`bar` and `sparkline` output is not colorized.

### Rotating to vertical chart

The web console can rotate `bar` and `ohlc_bar` / `ohlc_bar_labels` output into
a vertical chart view. This feature is available when all of these conditions are
met:

- The query result has exactly two columns
- One column is TIMESTAMP or TIMESTAMP_NS
- The other column is VARCHAR containing `bar` or `ohlc_bar` output

When these conditions are met, a rotate icon appears at the right side of the
VARCHAR column header. Clicking it toggles between:

- **Normal (horizontal) view**: the default grid layout. Rows are listed
  vertically with bars rendered horizontally.
- **Rotated (vertical) view**: a transposed layout where time flows
  left-to-right along a horizontal scroll axis, and bars are rendered
  vertically, resembling a traditional candlestick or bar chart. Timestamps
  appear at the bottom of each column (time in green, date in gray). OHLC
  green/red coloring is preserved.

The rotate icon turns cyan when the rotated view is active.

The rotation state persists across consecutive queries that produce rotatable
results. If you run a query that does not meet the rotation conditions (different
functions, extra columns, or no visualization function), the state resets.

For `ohlc_bar_labels`, labels are shown inline in normal view and as a tooltip
on hover in rotated view.

:::note
In rotated view, `bar()` output replaces fractional block characters
(U+2589 through U+258F) with full blocks, as partial-width characters do not
render correctly when the text flow is vertical.
:::

`depth_chart` and `sparkline` do not support rotation.

## Configuration

All visualization functions enforce a maximum output size controlled by an
existing server property:

```ini
# server.conf
cairo.sql.string.function.buffer.max.size=1048576
```

Default is 1,048,576 bytes (1 MB). This is the same property used by
`string_agg()`, `lpad()`, and `rpad()`.

Each output character is 3 bytes in UTF-8, so the default allows up to 349,525
characters of output. For `sparkline`, this limits the number of values
accumulated per group. For `bar` and `ohlc_bar`, this limits the `width`
parameter. If the limit is exceeded, the function throws a non-critical error.

In practice these limits are generous - a sparkline or bar of 349K characters
would be unusable. The limit exists to prevent accidental memory exhaustion.
