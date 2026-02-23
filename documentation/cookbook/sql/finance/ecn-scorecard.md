---
title: ECN scorecard
sidebar_label: ECN scorecard
description: Compare venue fill quality with a single dashboard query combining spread, slippage, fill size, and passive ratio
---

When evaluating execution across multiple venues, you often need several metrics side by side: spread conditions, slippage, fill sizes, and order type mix. Rather than running separate queries, this recipe produces a single **ECN scorecard** that summarizes fill quality per venue and symbol.

## Problem

You want a single dashboard-ready query that ranks venues by execution quality, combining spread at fill time, slippage against mid and top of book, average fill size, and what proportion of fills were passive.

## Solution

Use `ASOF JOIN` to pair each fill with the prevailing order book, then aggregate multiple metrics per ECN and symbol:

```questdb-sql demo title="ECN fill quality scorecard (buy side)"
SELECT
    t.symbol,
    t.ecn,
    count() AS fill_count,
    sum(t.quantity) AS total_volume,
    avg(t.quantity) AS avg_fill_size,
    avg((m.best_ask - m.best_bid)
        / ((m.best_bid + m.best_ask) / 2) * 10000) AS avg_spread_bps,
    avg(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000) AS avg_slippage_bps,
    avg((m.best_ask - t.price)
        / t.price * 10000) AS avg_slippage_vs_ask_bps,
    avg(CASE WHEN t.passive THEN 1.0 ELSE 0.0 END) AS passive_ratio
FROM fx_trades t
ASOF JOIN market_data m ON (symbol)
WHERE t.side = 'buy'
    AND t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn
ORDER BY t.symbol, avg_slippage_bps;
```

## How it works

Each row is one symbol-ECN combination. The metrics in each row:

- **`fill_count`** and **`total_volume`** — how much activity the ECN sees for this symbol. Context for statistical significance.
- **`avg_fill_size`** — average quantity per fill. Venues with larger average fills may show more slippage simply due to size.
- **`avg_spread_bps`** — average spread at the time of each fill. Tells you what market conditions looked like when you traded on this venue.
- **`avg_slippage_bps`** — average slippage vs mid. Since this is buy-side, negative means you bought below mid (price improvement), positive means you paid above mid.
- **`avg_slippage_vs_ask_bps`** — average slippage vs the best ask. Isolates how much worse than the quoted ask you actually paid. Negative means you got price improvement vs the ask.
- **`passive_ratio`** — fraction of fills that were passive (limit orders). Higher passive ratio typically correlates with better slippage.

Results are ordered by `avg_slippage_bps` so the best-performing ECN for each symbol appears first.

:::note Buy-side only
This query filters to `side = 'buy'` because the slippage formulas are direction-specific (no `CASE` expression). For a sell-side scorecard, flip the slippage formulas: use `(t.price - mid) / t.price` for slippage vs mid, and `(t.price - m.best_bid) / t.price` for slippage vs bid.
:::

## Interpreting results

Compare rows for the same symbol across different ECNs:

- **Low spread + low slippage**: The best combination — tight market and good fills.
- **Low spread + high slippage**: Tight quotes but fills executing poorly. May indicate latency issues or thin top-of-book liquidity.
- **High passive ratio + negative slippage**: Expected — passive fills provide liquidity and often get price improvement.
- **Large `avg_fill_size` + high slippage**: Size-driven impact. The venue may have less depth, causing larger orders to walk the book.
- **Low `fill_count`**: Treat metrics with caution — small sample sizes can be misleading.

## ECN markout curves

The scorecard above is a static snapshot. To see how fill quality evolves over time after execution, overlay markout curves per ECN. An ECN where markouts go steeply negative is delivering toxic flow — informed traders are picking you off there:

```questdb-sql title="ECN markout curves side by side (buy side)"
SELECT
    t.symbol,
    t.ecn,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000) AS avg_markout_bps,
    sum(((m.best_bid + m.best_ask) / 2 - t.price)
        * t.quantity) AS total_pnl
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    RANGE FROM 0s TO 5m STEP 5s AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn, horizon_sec
ORDER BY t.symbol, t.ecn, horizon_sec;
```

Plot these curves overlaid per ECN for each symbol. Compare the shapes:

- **Flat near zero**: Neutral flow — no systematic post-trade price movement. This is healthy.
- **Rising (positive)**: Mean-reverting flow — the market comes back after the fill. You're providing liquidity at good levels on this venue.
- **Falling (negative)**: Toxic flow — the market moves against you after fills on this ECN. Informed traders may be concentrated there.
- **Sharp initial drop then flat**: The initial cost is the spread, and the market doesn't move further. Normal for aggressive fills on a well-functioning venue.

Combine with the scorecard's `passive_ratio` and `avg_fill_size` to understand *why* a venue shows toxicity — it may simply be where your largest aggressive orders execute, rather than a venue-specific problem.

## Toxicity by time of day

Toxicity isn't static — an ECN may show clean markouts during London hours but turn toxic during Asia when liquidity thins out. Grouping by hour reveals intraday patterns:

```questdb-sql title="ECN toxicity by hour (buy side)"
SELECT
    t.symbol,
    t.ecn,
    hour(t.timestamp) AS hour_utc,
    h.offset,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000) AS markout_5s_bps,
    avg((m.best_ask - m.best_bid)
        / ((m.best_bid + m.best_ask) / 2) * 10000) AS avg_spread_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (5s) AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn, hour(t.timestamp), h.offset
ORDER BY t.symbol, t.ecn, hour_utc;
```

The 5-second markout is used as a quick toxicity signal — long enough for informed flow to show up, short enough to stay responsive.

Compare `markout_5s_bps` against `avg_spread_bps` for each hour. If an ECN shows tight spreads but deeply negative markouts during certain hours, the tight spreads are bait — you're earning a small spread but losing much more to adverse selection. Consider reducing or withdrawing liquidity on that venue during those hours.

## Passive vs aggressive toxicity

The aggregate markout curves above blend passive and aggressive fills together. Splitting by `t.passive` reveals a critical distinction — toxicity on passive fills means your resting orders are being picked off, while toxicity on aggressive fills means you're crossing into a market that moves against you immediately:

```questdb-sql title="Passive vs aggressive toxicity per ECN (buy side)"
SELECT
    t.symbol,
    t.ecn,
    t.passive,
    h.offset / 1000000000 AS horizon_sec,
    count() AS n,
    avg(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000) AS avg_markout_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (0, 1s, 5s, 10s, 1m) AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn, t.passive, horizon_sec
ORDER BY t.symbol, t.ecn, t.passive, horizon_sec;
```

Compare the markout curves for `passive = true` vs `passive = false` on each ECN:

- **Healthy passive fills**: Positive markout at offset 0 (you earned the spread), gradually decaying toward zero. You rested at a good level and the market didn't move against you.
- **Toxic passive fills**: Markout turns negative quickly. Someone on that ECN is systematically sniping your resting orders — they trade against you just before the market moves in their direction.
- **Healthy aggressive fills**: Small negative markout at offset 0 (you paid the spread), staying flat or recovering. Normal cost of crossing.
- **Toxic aggressive fills**: Markout becomes increasingly negative. The market continues to move against you after you cross, suggesting you're consistently late or trading against informed flow.

An ECN showing clean aggregate markouts can still have a problem if passive fills are deeply toxic while aggressive fills look fine — the two patterns cancel out in the blend. Always check both sides separately.

## Composite toxicity score

Rank ECNs by a single toxicity metric — the volume-weighted 5-second markout — alongside an `adverse_fill_ratio` that shows what fraction of fills moved against you:

```questdb-sql title="Composite toxicity score per ECN (buy side)"
SELECT
    t.symbol,
    t.ecn,
    h.offset,
    count() AS fill_count,
    sum(t.quantity) AS total_volume,
    sum(((m.best_bid + m.best_ask) / 2 - t.price)
        / t.price * 10000 * t.quantity)
        / sum(t.quantity) AS vw_markout_5s_bps,
    avg(CASE
        WHEN (m.best_bid + m.best_ask) / 2 < t.price THEN 1.0
        ELSE 0.0
    END) AS adverse_fill_ratio
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (5s) AS h
WHERE t.side = 'buy'
    AND t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.ecn, h.offset
ORDER BY t.symbol, vw_markout_5s_bps;
```

The two metrics complement each other:

- **`vw_markout_5s_bps`** — volume-weighted 5-second markout in basis points. Negative means the market moved against you after fills on this ECN. Volume-weighting ensures large fills dominate the score.
- **`adverse_fill_ratio`** — fraction of fills where the mid-price at 5 seconds was worse than the execution price. Tells you whether toxicity is driven by a few large bad fills or is systemic across the board.

An ECN with a mildly negative `vw_markout_5s_bps` but 80%+ `adverse_fill_ratio` is fundamentally hostile — nearly every fill moves against you, even if the average magnitude is small. Conversely, a deeply negative `vw_markout_5s_bps` with a low `adverse_fill_ratio` suggests a few large toxic fills are dragging down the average, which may be addressable by adjusting size limits on that venue.

## Pivoted ECN scorecard

The sections above produce one row per ECN per horizon offset. Using `PIVOT`, you can reshape the results into a wide format — one row per symbol-ECN combination with fill count, average size, volume, and markout at each horizon as separate columns:

```questdb-sql title="Pivoted ECN scorecard (buy side)"
WITH markouts AS (
    SELECT
        t.symbol,
        t.ecn,
        t.price,
        t.quantity,
        h.offset,
        m.best_bid,
        m.best_ask
    FROM fx_trades t
    HORIZON JOIN market_data m ON (symbol)
        LIST (0, 5s, 1m) AS h
    WHERE t.side = 'buy'
        AND t.timestamp IN '$yesterday'
)
SELECT * FROM markouts
PIVOT (
    count() AS fills,
    avg(quantity) AS avg_size,
    sum(quantity) AS volume,
    avg(((best_bid + best_ask) / 2 - price) / price * 10000) AS markout_bps
    FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m)
    GROUP BY symbol, ecn
)
ORDER BY t_5s_markout_bps;
```

The result has columns like `at_fill_fills`, `at_fill_markout_bps`, `t_5s_markout_bps`, `t_1m_markout_bps`, etc. — one set per horizon. This is useful for dashboard views where you want a single wide table rather than long-form output.

Raw markouts can be misleading if an ECN rejects most of your flow and only fills the toxic orders. Compare `at_fill_fills` and `at_fill_avg_size` across ECNs — an ECN that fills fewer, smaller orders but shows clean markouts may simply be rejecting the hard-to-fill flow. A more complete picture requires comparing fill sizes against quoted sizes or incorporating reject rates from an orders table.

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [Slippage per fill recipe](slippage.md)
- [Markout analysis recipe](markout.md)
- [Bid-ask spread recipe](bid-ask-spread.md)
:::
