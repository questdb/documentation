---
title: Use Grafana time range in DECLARE variables
sidebar_label: DECLARE with time range
description: Pass Grafana's dashboard time range into QuestDB DECLARE variables for parameterized queries
---

Pass Grafana's dashboard time range into QuestDB `DECLARE` variables.
This is useful when you combine time range filtering with other declared
parameters, override
[parameterized views](/docs/concepts/views/#parameterized-views), or derive
additional time boundaries from the dashboard range.

## Problem

The QuestDB Grafana plugin provides `$__fromTime` and `$__toTime` macros,
but they expand to `cast(... as timestamp)`, which `DECLARE` does not
support:

```sql
-- What you write
DECLARE @from := $__fromTime, @to := $__toTime
SELECT * FROM trades WHERE timestamp >= @from AND timestamp <= @to;

-- What the plugin sends to QuestDB (fails)
DECLARE @from := cast(1654380000000000 as timestamp), ...
-- Error: table and column names that are SQL keywords have to be
-- enclosed in double quotes, such as "cast"
```

## Solution

Use `$__from` and `$__to` instead. These are
[Grafana global variables](https://grafana.com/docs/grafana/latest/dashboards/variables/add-template-variables/#global-variables)
that expand to plain epoch **milliseconds**, which `DECLARE` accepts.

Convert milliseconds to the precision your table uses:

- **TIMESTAMP** (microseconds): multiply by `1000`
- **TIMESTAMP_NS** (nanoseconds): multiply by `1000000`

```sql title="TIMESTAMP table (microseconds)"
DECLARE
  @from := $__from * 1000,
  @to := $__to * 1000,
  @symbol := 'BTC-USDT'
SELECT timestamp, symbol, avg(price) AS avg_price
FROM trades
WHERE symbol = @symbol
  AND timestamp >= @from
  AND timestamp <= @to
SAMPLE BY $__interval;
```

```sql title="TIMESTAMP_NS table (nanoseconds)"
DECLARE
  @from := $__from * 1000000,
  @to := $__to * 1000000,
  @symbol := 'EURUSD'
SELECT timestamp, symbol, avg(price) AS avg_price
FROM fx_trades
WHERE symbol = @symbol
  AND timestamp >= @from
  AND timestamp <= @to
SAMPLE BY $__interval;
```

No `cast()` is needed when the multiplier matches the table's timestamp
precision. QuestDB compares the `LONG` value directly against the timestamp
column.

### Using cast as a safety net

If you are unsure whether your table uses `TIMESTAMP` or `TIMESTAMP_NS`,
you can multiply by `1000` (microseconds) and wrap the comparison in
`cast(... AS timestamp)`. QuestDB auto-promotes `TIMESTAMP` to
`TIMESTAMP_NS` when comparing against a nanosecond column, so this works
for both types:

```sql title="Works for both TIMESTAMP and TIMESTAMP_NS tables"
DECLARE
  @from := $__from * 1000,
  @to := $__to * 1000
SELECT timestamp, avg(price) AS avg_price
FROM fx_trades
WHERE timestamp >= cast(@from AS timestamp)
  AND timestamp <= cast(@to AS timestamp)
SAMPLE BY $__interval;
```

## When to use this instead of `$__timeFilter`

`$__timeFilter(timestamp)` is simpler for straightforward queries:

```sql
SELECT timestamp, price FROM trades
WHERE $__timeFilter(timestamp)
SAMPLE BY $__interval;
```

The `DECLARE` approach is needed when:

- You combine the time range with other `DECLARE` variables in a single block
- You override a parameterized view whose time range variables must be set
- You derive additional time boundaries from the dashboard range
  (for example, a lookback window for a moving average)

:::info Related documentation
- [DECLARE](/docs/query/sql/declare/)
- [Parameterized views](/docs/concepts/views/#parameterized-views)
- [Grafana integration](/docs/integrations/visualization/grafana/)
:::
