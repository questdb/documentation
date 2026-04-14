---
title: Visualization functions
sidebar_label: Visualization
description: SQL functions for rendering inline charts in query results using Unicode block characters.
---

Visualization functions render numeric data as compact Unicode block charts
directly in query results. The output is a `varchar` cell that works everywhere:
psql, the web console, JDBC clients, CSV exports.

| Function | Type | Description |
| :------- | :--- | :---------- |
| [bar](#bar) | Scalar | Horizontal bar proportional to a value within a range |
| [sparkline](#sparkline) | Aggregate | Vertical block chart of values within a group |

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

- **No parallel GROUP BY.** `sparkline` requires row-order preservation. It runs
  on the single-threaded group-by path. This is typically not a bottleneck
  because visualization queries operate on pre-aggregated or moderately-sized
  data.

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

## Configuration

Both functions enforce a maximum output size controlled by an existing server
property:

```ini
# server.conf
cairo.sql.string.function.buffer.max.size=1048576
```

Default is 1,048,576 bytes (1 MB). This is the same property used by
`string_agg()`, `lpad()`, and `rpad()`.

Each output character is 3 bytes in UTF-8, so the default allows up to 349,525
characters of output. For `sparkline`, this limits the number of values
accumulated per group. For `bar`, this limits the `width` parameter. If the
limit is exceeded, the function throws a non-critical error.

In practice these limits are generous - a sparkline or bar of 349K characters
would be unusable. The limit exists to prevent accidental memory exhaustion.
