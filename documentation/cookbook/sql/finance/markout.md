---
title: Post-trade markout analysis
sidebar_label: Markout analysis
description: Measure post-trade price reversion using HORIZON JOIN to evaluate execution quality and detect adverse selection
---

Markout analysis measures how the market mid-price moves **after** a trade executes. It is the natural complement to [slippage](slippage.md):

- **Slippage** tells you how much you paid at the moment of execution.
- **Markout** tells you what happened next — did the market move in your favor (reversion) or against you (adverse selection)?

A positive markout means the trade was profitable in hindsight: for buys, the mid-price rose; for sells, it fell. A negative markout means the market moved against you, which may indicate you were trading against informed flow.

By computing markouts at multiple time horizons (e.g., every second for 5 minutes), you build a **markout curve** — the standard tool for evaluating execution quality over time.

## Problem

You want to evaluate whether your fills are subject to adverse selection. For each trade, you need to know how the mid-price evolved over the seconds and minutes following execution, broken down by venue, counterparty, and passive/aggressive.

## Solution

Use `HORIZON JOIN` to compute the mid-price at multiple time offsets after each trade, then aggregate into a markout curve:

```questdb-sql title="Post-trade markout curve by venue and counterparty" demo
SELECT
    t.symbol,
    t.ecn,
    t.counterparty,
    t.passive,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             / t.price * 10000
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             / t.price * 10000
        END
    ) AS avg_markout_bps,
    sum(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             * t.quantity
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             * t.quantity
        END
    ) AS total_pnl
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM 0s TO 30s STEP 5s AS h
WHERE t.timestamp IN '$now-1h..$now'
GROUP BY t.symbol, t.ecn, t.counterparty, t.passive, horizon_sec
ORDER BY t.symbol, t.ecn, t.counterparty, t.passive, horizon_sec;
```

## How it works

[`HORIZON JOIN`](/docs/query/sql/horizon-join/) is the key construct. For each trade and each time offset in the range, it performs an ASOF match against `market_data` at `trade_timestamp + offset`. The `RANGE FROM 0s TO 30s STEP 5s` generates 7 offsets (0s, 5s, 10s, ... 30s), giving you a markout reading every 5 seconds for 30 seconds after each trade.

The two metrics:

- **`avg_markout_bps`** — average price movement in basis points, normalized by fill price. Positive means the market moved in your favor. At offset 0, this is simply the negative of slippage-vs-mid.
- **`total_pnl`** — actual P&L in currency terms (price difference × quantity). This captures the dollar impact, not just the rate — 0.1 bps on $100M of volume is very different from 0.1 bps on $1M.

The markout formula flips the sign convention compared to slippage:

- **For buys**: positive if mid rose after the fill (profit)
- **For sells**: positive if mid fell after the fill (profit)

As the offset increases, you see how the market evolved after each trade.

## Variations

### Markout at specific horizons

Use `LIST` instead of `RANGE` for non-uniform time points — useful when you care about specific benchmarks (e.g., -30s, -5s, 0, 5s, 30s):

```questdb-sql title="Markout at key horizons" demo
SELECT
    t.ecn,
    t.passive,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    round(avg(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             / t.price * 10000
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             / t.price * 10000
        END
    ), 3) AS avg_markout_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (-30s, -5s, 0, 5s, 30s) AS h
WHERE t.timestamp IN '$now-1h..$now'
GROUP BY t.ecn, t.passive, horizon_sec
ORDER BY t.ecn, t.passive, horizon_sec;
```

### Pre- and post-trade analysis

Use negative offsets to detect information leakage — whether the market was already moving before your trade:

```questdb-sql title="Price movement around trade events" demo
SELECT
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    round(avg(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             / t.price * 10000
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             / t.price * 10000
        END
    ), 3) AS avg_markout_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM -30s TO 30s STEP 1s AS h
WHERE t.timestamp IN '$now-1h..$now'
GROUP BY horizon_sec
ORDER BY horizon_sec;
```

If the markout is already trending before offset 0, it suggests the market was moving before your order — a sign of information leakage or that you are reacting to stale signals.

### Markout by side

Add `t.side` to the grouping to detect asymmetry between buy and sell execution. A counterparty might look fine on average but show adverse selection on one side only:

```questdb-sql title="Markout curve by side" demo
SELECT
    t.ecn,
    t.side,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    round(avg(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             / t.price * 10000
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             / t.price * 10000
        END
    ), 3) AS avg_markout_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (-30s, -5s, 0, 5s, 30s) AS h
WHERE t.timestamp IN '$now-1h..$now'
GROUP BY t.ecn, t.side, horizon_sec
ORDER BY t.ecn, t.side, horizon_sec;
```

If buy markouts diverge significantly from sell markouts at the same venue, it may indicate directional information leakage or asymmetric adverse selection.

### Single-side markout

When analyzing one side at a time, you can drop the `CASE` entirely for a simpler formula:

```questdb-sql title="Buy-side markout — positive means price moved up after you bought" demo
SELECT
    t.symbol,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price) / t.price * 10000) AS avg_markout_bps,
    sum(((m.best_bid + m.best_ask) / 2 - t.price) * t.quantity) AS total_pnl
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM 0s TO 10m STEP 10s AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$now-1h..$now'
GROUP BY t.symbol, horizon_sec
ORDER BY t.symbol, horizon_sec;
```

```questdb-sql title="Sell-side markout — positive means price moved down after you sold" demo
SELECT
    t.symbol,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg((t.price - (m.best_bid + m.best_ask) / 2) / t.price * 10000) AS avg_markout_bps,
    sum((t.price - (m.best_bid + m.best_ask) / 2) * t.quantity) AS total_pnl
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM 0s TO 10m STEP 10s AS h
WHERE t.side = 'sell'
    AND t.timestamp IN '$now-1h..$now'
GROUP BY t.symbol, horizon_sec
ORDER BY t.symbol, horizon_sec;
```

This approach is useful when you want to run separate analyses per side, or when feeding results into dashboards that track buy and sell P&L independently.

### Counterparty toxicity

Group by counterparty to identify which LPs are sending you toxic flow — trades that consistently move against you shortly after execution:

```questdb-sql title="Counterparty toxicity markout (buy side)" demo
SELECT
    t.symbol,
    t.counterparty,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price) / t.price * 10000) AS avg_markout_bps,
    sum(t.quantity) AS total_volume
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (0, 5s, 30s, 1m, 5m) AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$now-1h..$now'
GROUP BY t.symbol, t.counterparty, horizon_sec
ORDER BY t.symbol, t.counterparty, horizon_sec;
```

A counterparty whose markout is persistently negative across horizons is likely trading on information you don't have. Compare `total_volume` alongside markout — a small counterparty with terrible markout may not matter, but a large one warrants flow management.

### Passive vs aggressive with spread context

Compare markout between passive (limit) and aggressive (market) orders, with the half-spread as a baseline. Aggressive fills should cost roughly half the spread; if the markout is worse than that, execution quality needs attention:

```questdb-sql title="Passive vs aggressive markout with half-spread baseline (buy side)" demo
SELECT
    t.symbol,
    t.ecn,
    t.passive,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000) AS avg_markout_bps,
    avg((m.best_ask - m.best_bid)
        / ((m.best_bid + m.best_ask) / 2) * 10000) / 2 AS avg_half_spread_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM 0s TO 5m STEP 5s AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$now-1h..$now'
GROUP BY t.symbol, t.ecn, t.passive, horizon_sec
ORDER BY t.symbol, t.ecn, t.passive, horizon_sec;
```

At offset 0, aggressive fills typically show `avg_markout_bps` close to negative `avg_half_spread_bps` (you crossed the spread). If markout recovers toward zero over subsequent offsets, execution is healthy — you paid the spread but the market didn't move further against you. If markout stays flat or worsens, it signals adverse selection beyond the spread cost.

## Interpreting the markout curve

- **Flat near zero**: No significant post-trade price impact. Fills are neutral.
- **Rising markout (positive trend)**: Price reverts in your favor after the fill. This is the ideal scenario — it suggests you are capturing spread or providing liquidity at good levels.
- **Falling markout (negative trend)**: Adverse selection — the market moves against you after the fill. This may indicate you are being picked off by informed counterparties or reacting too slowly.
- **Passive vs aggressive**: Passive fills typically show better markouts because they provide liquidity. Aggressive fills often show initial negative markout equal to the spread cost, which may or may not revert.
- **Counterparty differences**: Persistent negative markout against specific counterparties is a strong signal of adverse selection and may warrant flow management.

:::info Related documentation
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [Slippage per fill recipe](slippage.md)
- [Slippage (aggregated) recipe](slippage-aggregated.md)
:::
