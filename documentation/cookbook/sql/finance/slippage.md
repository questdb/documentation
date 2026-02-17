---
title: Slippage per fill
sidebar_label: Slippage
description: Measure execution slippage against the prevailing mid price and top-of-book for every trade fill
---

Slippage is the difference between the price at which a trade actually executes and a reference price at the moment of execution. It is a core metric in **Transaction Cost Analysis (TCA)** and tells you how much the market moved against you (or in your favor) on each fill.

There are two common reference points:

- **Mid price** — the midpoint between the best bid and best ask. Slippage against mid captures total implicit cost, including half the spread.
- **Top of book (TOB)** — the best ask for buys, best bid for sells. Slippage against TOB isolates how much worse you did beyond the spread, for example due to latency, order size, or thin liquidity at the top level.

Positive slippage means the fill was worse than the reference (you paid more or received less). Negative slippage means price improvement.

## Problem

You want to evaluate fill quality for every trade execution. For each fill, you need to know the prevailing order book state at the time of execution so you can calculate how much slippage occurred, both relative to mid and relative to the side of the book you were trading against.

## Solution

Use `ASOF JOIN` to pair each trade with the most recent order book snapshot, then calculate slippage in basis points:

```questdb-sql demo title="Slippage per fill"
SELECT
    t.timestamp,
    t.symbol,
    t.ecn,
    t.counterparty,
    t.side,
    t.passive,
    t.price,
    t.quantity,
    m.bids[1][1] AS best_bid,
    m.asks[1][1] AS best_ask,
    (m.bids[1][1] + m.asks[1][1]) / 2 AS mid,
    (m.asks[1][1] - m.bids[1][1]) AS spread,
    CASE t.side
        WHEN 'buy'  THEN (t.price - (m.bids[1][1] + m.asks[1][1]) / 2)
                         / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
        WHEN 'sell' THEN ((m.bids[1][1] + m.asks[1][1]) / 2 - t.price)
                         / ((m.bids[1][1] + m.asks[1][1]) / 2) * 10000
    END AS slippage_bps,
    CASE t.side
        WHEN 'buy'  THEN (t.price - m.asks[1][1]) / m.asks[1][1] * 10000
        WHEN 'sell' THEN (m.bids[1][1] - t.price) / m.bids[1][1] * 10000
    END AS slippage_vs_tob_bps
FROM fx_trades t
ASOF JOIN market_data m ON (symbol)
WHERE t.timestamp IN '$yesterday'
ORDER BY t.timestamp;
```

## How it works

**ASOF JOIN** is the key here. For each row in `fx_trades`, it finds the most recent row in `market_data` with the same `symbol` whose timestamp is at or before the trade timestamp. This gives you the order book that was prevailing when the trade executed.

The two slippage measures:

- **`slippage_bps`** (vs mid) — how far the fill price deviated from the midpoint. A buy at 1.1050 when mid is 1.1048 gives positive slippage (you paid above mid). This includes roughly half the spread as a baseline cost.

- **`slippage_vs_tob_bps`** (vs top of book) — how far the fill price deviated from the relevant side: best ask for buys, best bid for sells. If you buy at the best ask exactly, this is zero. Positive values mean you walked the book or experienced latency; negative values mean you got price improvement.

The sign convention is the same for both sides: positive = worse execution, negative = price improvement.

## Interpreting results

- **Near-zero `slippage_vs_tob_bps`**: Fills are executing at or near the top of book. Typical for passive or well-timed aggressive orders.
- **Positive `slippage_vs_tob_bps`**: The fill walked beyond the best level. Common for large orders that consume top-of-book liquidity and fill at deeper levels.
- **Negative `slippage_vs_tob_bps`**: Price improvement — filled better than the quoted price. Can happen with passive fills or favorable market movement.
- **`slippage_bps` around half-spread**: Expected baseline for aggressive orders. If slippage consistently exceeds half the spread, execution quality may need attention.

:::note Order book timeliness
The accuracy of slippage measurement depends on how frequently order book snapshots are captured. With `ASOF JOIN`, each trade is matched to the most recent snapshot, so higher-frequency snapshots yield more precise results. On the demo dataset, `market_data` updates frequently enough for meaningful analysis.
:::

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [CASE expressions](/docs/query/sql/case/)
- [Arrays in QuestDB](/docs/query/datatypes/array/)
- [Bid-ask spread recipe](bid-ask-spread.md)
:::
