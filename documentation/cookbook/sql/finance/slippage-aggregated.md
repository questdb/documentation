---
title: Aggregated slippage by venue and counterparty
sidebar_label: Slippage (aggregated)
description: Aggregate execution slippage by ECN, counterparty, and passive/aggressive to compare venue and counterparty quality
---

The [per-fill slippage recipe](slippage.md) measures slippage on individual trades. This recipe aggregates those measurements to answer higher-level questions: which ECN gives you the best execution? Which counterparties are cheapest to trade against? Do passive fills outperform aggressive ones?

## Problem

You want to compare average execution quality across different dimensions — venue (ECN), counterparty, and order type (passive vs aggressive) — to identify where you get the best and worst fills.

## Solution

Group slippage calculations by the dimensions of interest and compute averages:

```questdb-sql demo title="Aggregate slippage by ECN, counterparty, and passive/aggressive"
SELECT
    t.symbol,
    t.ecn,
    t.counterparty,
    t.passive,
    count() AS trade_count,
    sum(t.quantity) AS total_qty,
    avg(
        CASE t.side
            WHEN 'buy'  THEN (t.price - (m.bids[1][1] + m.asks[1][1]) / 2)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
            WHEN 'sell' THEN ((m.bids[1][1] + m.asks[1][1]) / 2 - t.price)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
        END
    ) AS avg_slippage_vs_mid_bps,
    avg(
        CASE t.side
            WHEN 'buy'  THEN (t.price - m.asks[1][1]) / m.asks[1][1] * 10000
            WHEN 'sell' THEN (m.bids[1][1] - t.price) / m.bids[1][1] * 10000
        END
    ) AS avg_slippage_vs_tob_bps,
    avg(
        (m.asks[1][1] - m.bids[1][1])
        / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
    ) AS avg_spread_bps
FROM fx_trades t
ASOF JOIN market_data m ON (symbol)
WHERE t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn, t.counterparty, t.passive
ORDER BY avg_slippage_vs_mid_bps DESC;
```

## How it works

This builds on the same `ASOF JOIN` approach from the [per-fill slippage recipe](slippage.md), but wraps the slippage calculations in `avg()` and groups by the dimensions you want to compare.

The three metrics per group:

- **`avg_slippage_vs_mid_bps`** — average cost relative to mid price. Includes half the spread as baseline.
- **`avg_slippage_vs_tob_bps`** — average cost beyond the top of book. Isolates execution quality from spread cost.
- **`avg_spread_bps`** — average spread at the time of each trade. Helps contextualize slippage: high slippage in a wide-spread environment is different from high slippage in a tight market.

Results are ordered worst-first (`DESC`) so the most expensive groups appear at the top.

## Variations

### By ECN only

Drop `counterparty` to get a cleaner venue-level comparison:

```questdb-sql demo title="Slippage by ECN and passive/aggressive"
SELECT
    t.ecn,
    t.passive,
    count() AS trade_count,
    round(avg(
        CASE t.side
            WHEN 'buy'  THEN (t.price - (m.bids[1][1] + m.asks[1][1]) / 2)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
            WHEN 'sell' THEN ((m.bids[1][1] + m.asks[1][1]) / 2 - t.price)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
        END
    ), 3) AS avg_slippage_bps
FROM fx_trades t
ASOF JOIN market_data m ON (symbol)
WHERE t.timestamp IN '$yesterday'
GROUP BY t.ecn, t.passive
ORDER BY t.ecn, t.passive;
```

### Time-bucketed analysis

Add `SAMPLE BY` to see how execution quality changes throughout the day:

```questdb-sql demo title="Hourly slippage by ECN"
SELECT
    t.timestamp,
    t.ecn,
    count() AS trade_count,
    round(avg(
        CASE t.side
            WHEN 'buy'  THEN (t.price - (m.bids[1][1] + m.asks[1][1]) / 2)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
            WHEN 'sell' THEN ((m.bids[1][1] + m.asks[1][1]) / 2 - t.price)
                             / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
        END
    ), 3) AS avg_slippage_bps
FROM fx_trades t
ASOF JOIN market_data m ON (symbol)
WHERE t.timestamp IN '$yesterday'
SAMPLE BY 1h
GROUP BY t.ecn;
```

### Cost by size bucket

How does execution cost scale with order size? Bucket fills by quantity, then use [HORIZON JOIN](/docs/query/sql/horizon-join/) with `PIVOT` to see markout and spread at multiple horizons in a single wide row per symbol and bucket:

```questdb-sql title="Cost by size bucket — pivoted (buy side)"
WITH fills AS (
    SELECT
        t.symbol,
        t.price,
        t.quantity,
        h.offset,
        (m.bids[1][1] + m.asks[1][1]) / 2 AS mid,
        m.asks[1][1] - m.bids[1][1] AS spread,
        CASE
            WHEN t.quantity < 100000    THEN 'S'
            WHEN t.quantity < 1000000   THEN 'M'
            WHEN t.quantity < 10000000  THEN 'L'
            ELSE 'XL'
        END AS size_bucket
    FROM fx_trades t
    HORIZON JOIN market_data m ON (symbol)
        LIST (0, 5s, 1m) AS h
    WHERE t.side = 'buy'
        AND t.timestamp IN '$yesterday'
)
SELECT * FROM fills
PIVOT (
    count() AS n,
    avg((mid - price) / price * 10000) AS markout_bps,
    avg(spread / mid * 10000) AS spread_bps
    FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m)
    GROUP BY symbol, size_bucket
)
ORDER BY symbol, size_bucket;
```

The result has columns like `at_fill_n`, `at_fill_markout_bps`, `t_5s_markout_bps`, `t_1m_spread_bps`, etc. Compare across size buckets:

- **Markout degradation with size**: If `t_5s_markout_bps` becomes more negative as bucket size increases, larger fills are systematically more toxic — the market moves against you more after big trades.
- **Spread widening with size**: If `at_fill_spread_bps` increases for larger buckets, you're trading in wider markets when you trade big — possibly because you only get filled on large clips when spreads are wide.
- **Sample size caveat**: XL buckets may have very few fills. Check `at_fill_n` before drawing conclusions.

Adjust the bucket thresholds to match your typical trade sizes. The boundaries above (100K / 1M / 10M) are reasonable for major FX pairs.

### Counterparty cost attribution

Which counterparties are the most expensive to trade with, all-in? Group by counterparty, ECN, and passive/aggressive, then pivot across horizons to see whether the cost is immediate (spread) or delayed (adverse selection):

```questdb-sql title="Counterparty cost attribution — pivoted (buy side)"
WITH cp_costs AS (
    SELECT
        t.symbol,
        t.counterparty,
        t.ecn,
        t.passive,
        t.price,
        t.quantity,
        h.offset,
        m.bids[1][1] AS best_bid,
        m.asks[1][1] AS best_ask,
        (m.bids[1][1] + m.asks[1][1]) / 2 AS mid
    FROM fx_trades t
    HORIZON JOIN market_data m ON (symbol)
        LIST (0, 5s, 1m) AS h
    WHERE t.side = 'buy'
        AND t.timestamp IN '$yesterday'
)
SELECT * FROM cp_costs
PIVOT (
    count() AS fills,
    sum(quantity) AS volume,
    avg((mid - price) / price * 10000) AS markout_bps
    FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m)
    GROUP BY symbol, counterparty, ecn, passive
)
ORDER BY t_1m_markout_bps;
```

Ordered by `t_1m_markout_bps` ascending, the most toxic counterparties appear first. Read the results across horizons:

- **Large negative `at_fill_markout_bps` that stays flat**: You paid a wide spread upfront but the market didn't move further. The cost is the spread, not adverse selection — this counterparty is expensive but not toxic.
- **Small negative `at_fill_markout_bps` that deepens at `t_5s` and `t_1m`**: The initial fill looked reasonable, but the market moved against you afterwards. This counterparty is delivering informed or toxic flow.
- **Passive rows with deepening negative markout**: The counterparty is systematically picking off your resting orders just before the market moves. This is the most actionable signal — consider tightening or withdrawing quotes to this counterparty on the affected ECN.

### Intraday cost profile

When is it cheapest to trade? Group by `hour(t.timestamp)` and pivot across horizons to build a heatmap of execution cost throughout the day:

```questdb-sql title="Intraday cost profile — hourly heatmap (buy side)"
WITH hourly AS (
    SELECT
        t.symbol,
        t.price,
        t.quantity,
        hour(t.timestamp) AS hour_utc,
        h.offset,
        m.bids[1][1] AS best_bid,
        m.asks[1][1] AS best_ask,
        (m.bids[1][1] + m.asks[1][1]) / 2 AS mid
    FROM fx_trades t
    HORIZON JOIN market_data m ON (symbol)
        LIST (0, 5s, 1m) AS h
    WHERE t.side = 'buy'
        AND t.timestamp IN '$yesterday'
)
SELECT * FROM hourly
PIVOT (
    count() AS n,
    avg((mid - price) / price * 10000) AS markout_bps,
    avg((best_ask - best_bid) / mid * 10000) AS spread_bps
    FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m)
    GROUP BY symbol, hour_utc
)
ORDER BY symbol, hour_utc;
```

Each row is one symbol-hour combination with fill count, markout, and spread at each horizon. Look for:

- **Spread spikes**: Hours with high `at_fill_spread_bps` are wide-market periods (typically Asia session for EUR/USD, or around fixes and rollovers). Execution during these windows is inherently more expensive.
- **Markout divergence**: If `t_1m_markout_bps` is significantly worse during certain hours while `at_fill_spread_bps` is similar, the problem isn't wider spreads — it's adverse selection concentrated in those hours. Route less flow or quote wider during those windows.
- **Session boundaries**: The London/NY overlap (12:00–16:00 UTC) typically shows the tightest spreads and flattest markouts for major pairs. Deviations from this pattern are worth investigating.

### Daily P&L attribution

Roll up execution costs into a daily P&L view per symbol and ECN. Unlike the bps-based metrics above, this uses absolute P&L (`(mid - price) * quantity`) so you can see dollar impact:

```questdb-sql title="Daily P&L attribution (buy side)"
WITH daily AS (
    SELECT
        t.symbol,
        t.ecn,
        t.price,
        t.quantity,
        t.timestamp::date AS trade_date,
        h.offset,
        (m.bids[1][1] + m.asks[1][1]) / 2 AS mid
    FROM fx_trades t
    HORIZON JOIN market_data m ON (symbol)
        LIST (0, 1m, 5m) AS h
    WHERE t.side = 'buy'
        AND t.timestamp IN '$yesterday'
)
SELECT * FROM daily
PIVOT (
    count() AS fills,
    sum(quantity) AS volume,
    sum((mid - price) * quantity) AS pnl
    FOR offset IN (0 AS at_fill, 60000000000 AS t_1m, 300000000000 AS t_5m)
    GROUP BY trade_date, symbol, ecn
)
ORDER BY trade_date, symbol, ecn;
```

Each row is one date-symbol-ECN combination. The three P&L columns tell different stories:

- **`at_fill_pnl`** — immediate spread cost. How much you lost to the bid-ask spread at the moment of execution.
- **`t_5m_pnl`** — realized P&L including short-term market impact. This is the more complete measure of execution cost.
- **`t_5m_pnl - at_fill_pnl`** — post-fill market movement. Positive means the market moved in your favor after the fill (mean reversion); negative means adverse selection eroded your position further.

Track these daily to spot trends. A venue that shows deteriorating `t_5m_pnl` over several days may be attracting more informed flow, even if `at_fill_pnl` stays stable.

## Interpreting results

- **Passive vs aggressive**: Passive fills (limit orders) typically show lower or negative slippage since they provide liquidity. Aggressive fills (market orders) cross the spread and show higher slippage.
- **ECN differences**: Venues with deeper liquidity tend to show lower slippage for large orders. Differences in latency and matching engine behavior also play a role.
- **Counterparty patterns**: Some counterparties may consistently offer better or worse fills. Persistent adverse slippage from a counterparty may indicate information asymmetry.
- **Spread context**: Always consider `avg_spread_bps` alongside slippage. An ECN with higher slippage but tighter spreads may still offer better all-in execution cost.

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [PIVOT](/docs/query/sql/pivot/)
- [GROUP BY](/docs/query/sql/group-by/)
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Slippage per fill recipe](slippage.md)
:::
