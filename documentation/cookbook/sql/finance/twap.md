---
title: Time-weighted average price (TWAP)
sidebar_label: TWAP
description: Calculate the time-weighted average price using the native twap() aggregate function for execution benchmarking, fair value reference, and algorithmic trading analysis.
---

Calculate the Time-Weighted Average Price (TWAP) for execution benchmarking and
price analysis. TWAP represents the average price of an instrument over a time
period where each price observation is weighted by how long it persists — not by
how much volume traded at that price. This makes it particularly useful for
illiquid markets, algorithmic order slicing, and scenarios where volume data is
unavailable or unreliable.

## When to use TWAP vs VWAP

| | TWAP | [VWAP](/docs/cookbook/sql/finance/vwap/) |
|---|---|---|
| **Weights by** | Time (equal weight per interval) | Volume |
| **Best for** | Illiquid instruments, algo execution | Liquid instruments, intraday benchmarking |
| **Volume data needed?** | No | Yes |
| **Sensitive to volume spikes?** | No | Yes — large prints dominate |
| **Typical users** | Algo desks, compliance, exotic FX | Institutional execution, equity trading |

Choose TWAP when volume is concentrated in a few bursts (so VWAP would be
skewed), when volume data is not available, or when your execution algorithm
splits an order evenly over time.

## Problem: Calculate TWAP over a time window

You want to calculate the average price of a trading instrument over a time
window, giving equal weight to every moment in time rather than weighting by
trade volume. This is the standard benchmark for TWAP execution algorithms that
slice a parent order into equal-sized child orders spread evenly over time.

## Solution: Use the `twap()` aggregate function

QuestDB's built-in `twap(price, timestamp)` function computes the time-weighted
average using step-function integration — each observed price is held constant
until the next trade, and the result is the area under this step curve divided
by the total time span.

```questdb-sql demo title="TWAP for a single symbol"
SELECT twap(price, timestamp) AS twap
FROM trades
WHERE symbol = 'ETH-USDT'
  AND timestamp IN '$yesterday';
```

## How it works

Under the hood, `twap()` treats prices as a step function (also called
forward-fill or last-observation-carried-forward): each price persists until a
new observation arrives.

```
Price
  |     ┌─────┐
  |     │     │  ┌──────────┐
  |─────┘     │  │          │
  |           └──┘          └─────
  └──────────────────────────────── Time
  t1    t2    t3 t4         t5
```

The TWAP is the total area of these rectangles divided by the time span from the
first to the last observation:

$$
\text{TWAP} = \frac{\sum_{i=1}^{n-1} p_i \cdot (t_{i+1} - t_i)}{t_n - t_1}
$$

When all observations share the same timestamp (e.g., a single row or
simultaneous prints), the function falls back to a simple arithmetic mean.

## TWAP per symbol

```questdb-sql demo title="TWAP across multiple symbols"
SELECT symbol, twap(price, timestamp) AS twap
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT', 'SOL-USDT')
  AND timestamp IN '$yesterday';
```

## Hourly TWAP with SAMPLE BY

Use `SAMPLE BY` to compute TWAP over fixed intervals — useful for comparing
execution prices against the benchmark in each time bucket:

```questdb-sql demo title="Hourly TWAP"
SELECT timestamp, symbol, twap(price, timestamp) AS twap
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN '$yesterday'
SAMPLE BY 1h;
```

## TWAP vs VWAP comparison

Compare the two benchmarks side-by-side to see how volume concentration affects
VWAP while leaving TWAP unchanged:

```questdb-sql demo title="TWAP vs VWAP comparison per hour"
SELECT
  timestamp,
  symbol,
  twap(price, timestamp) AS twap,
  sum(price * amount) / sum(amount) AS vwap,
  twap(price, timestamp) - sum(price * amount) / sum(amount) AS twap_vwap_diff
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN '$yesterday'
SAMPLE BY 1h;
```

:::note VWAP formula
This query computes tick-level VWAP directly from individual trades:
`sum(price * amount) / sum(amount)`. This is the exact VWAP. The
[VWAP cookbook recipe](/docs/cookbook/sql/finance/vwap/) uses a different
approach — the typical-price approximation `(high + low + close) / 3` from OHLC
candles — because it works with materialized views for better performance on
large datasets. Both are valid; the tick-level formula is more accurate when
individual trade data is available.
:::

When the difference is large, it indicates that volume was concentrated at
prices far from the time-weighted average — a sign of clustered liquidity or
large block prints.

## Execution quality analysis

Compare individual trade fill prices against the TWAP benchmark over the
order's time horizon:

```questdb-sql demo title="Fill price vs TWAP benchmark"
WITH benchmark AS (
  SELECT twap(price, timestamp) AS twap_price
  FROM trades
  WHERE symbol = 'ETH-USDT'
    AND timestamp IN '$yesterday'
)
SELECT
  t.timestamp,
  t.price AS fill_price,
  b.twap_price,
  t.price - b.twap_price AS slippage
FROM trades t
CROSS JOIN benchmark b
WHERE t.symbol = 'ETH-USDT'
  AND t.side = 'buy'
  AND t.timestamp IN '$yesterday'
ORDER BY t.timestamp
LIMIT 20;
```

Positive slippage means the fill was worse than the benchmark (for a buy);
negative means it was better.

:::tip Trading use cases
- **Compliance reporting**: Some best-execution frameworks (e.g., MiFID II) use TWAP as a benchmark alongside VWAP and arrival price
- **TWAP vs VWAP divergence**: Large differences signal volume concentration, which may indicate block trades or liquidity events
- **Irregular tick spacing**: TWAP naturally handles unevenly spaced trades — no need to resample or fill gaps before computing the average
- **Multi-day benchmarks**: Combine with `SAMPLE BY` and `FILL(prev)` to compute TWAP across sessions, carrying forward the last price over overnight gaps
:::

:::info Related documentation
- [twap() function reference](/docs/query/functions/aggregation#twap) — syntax, parameters, and NULL handling
- [VWAP (Volume-Weighted Average Price)](/docs/cookbook/sql/finance/vwap/) — the volume-weighted counterpart
- [SAMPLE BY](/docs/query/sql/sample-by/) — time-based aggregation
- [Finance functions](/docs/query/functions/finance/) — other financial functions
:::
