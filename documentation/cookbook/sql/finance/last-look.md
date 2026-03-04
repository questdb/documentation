---
title: Last look detection
sidebar_label: Last look detection
description: Detect last-look behavior using millisecond-granularity markout analysis with HORIZON JOIN
---

In FX markets, some liquidity providers operate under a **last look** window — a brief period (typically 1–100ms) after receiving an order during which they can reject or re-price the trade. While last look is a legitimate risk management practice (allowing LPs to verify that prices haven't moved during order transit), it can be exploited through asymmetric rejection — accepting trades only when the price has moved in the LP's favor during the hold window, and rejecting when it hasn't.

This recipe uses millisecond-granularity [markout analysis](markout.md) to detect whether specific counterparties are exploiting last look. The signature is a sharp price movement against you in the first few milliseconds after a fill — if the mid-price consistently moves in the counterparty's favor within their last-look window, they may be selectively accepting only trades that benefit them.

## Problem

You want to detect whether specific counterparties show signs of last-look adverse selection. You need markout measurements at millisecond resolution — much finer than the second-level analysis in the [general markout recipe](markout.md) — to catch behavior that happens within typical last-look windows (1–100ms).

## Solution

Use `HORIZON JOIN` with a `LIST` of millisecond-spaced offsets to build a high-resolution markout curve for the first few seconds after each fill:

```questdb-sql title="Millisecond-granularity markout by counterparty"
SELECT
    t.symbol,
    t.counterparty,
    t.passive,
    h.offset / 1000000 AS horizon_ms,
    count() AS n,
    avg(
        CASE t.side
            WHEN 'buy'  THEN ((m.best_bid + m.best_ask) / 2 - t.price)
                             / t.price * 10000
            WHEN 'sell' THEN (t.price - (m.best_bid + m.best_ask) / 2)
                             / t.price * 10000
        END
    ) AS avg_markout_bps
FROM fx_trades t
HORIZON JOIN market_data m ON (symbol)
    LIST (0, 1T, 5T, 10T, 50T, 100T,
          500T, 1000T, 5000T) AS h
WHERE t.timestamp IN '$yesterday'
GROUP BY t.symbol, t.counterparty, t.passive, horizon_ms
ORDER BY t.symbol, t.counterparty, horizon_ms;
```

The `LIST` offsets are: 0ms, 1ms, 5ms, 10ms, 50ms, 100ms, 500ms, 1s, and 5s — concentrated in the sub-100ms range where last-look behavior is visible.

:::note h.offset resolution
Since `fx_trades` uses nanosecond timestamps (`TIMESTAMP_NS`), `h.offset` is in nanoseconds. Dividing by 1,000,000 converts to milliseconds for readability.
:::

## How it works

The key difference from the [general markout recipe](markout.md) is the time scale. Instead of uniform 1-second steps over minutes, this uses non-uniform `LIST` offsets clustered in the millisecond range where last-look decisions happen.

The `LIST` syntax is ideal here because the offsets are non-uniform — dense at the start (1ms, 5ms, 10ms) where you need precision, and sparse further out (1s, 5s) for context.

## Interpreting results

Compare the markout curve across counterparties at the same symbol:

- **Neutral counterparty**: Markout near zero at 0ms, with gradual random drift. No systematic pattern.
- **Last-look adverse selection**: Sharp negative markout in the 1–100ms range that stabilizes or worsens. The counterparty is filling you only when the market is about to move against you.
- **Last-look with reversion**: Negative markout spike at 5–50ms that then reverts toward zero by 1–5s. This suggests the counterparty rejects trades when the price would move in your favor, but the moves are temporary.
- **Passive vs aggressive**: Last-look behavior primarily affects aggressive orders (taker flow). Passive fills from the same counterparty may show a different pattern.

### What to look for

A counterparty is likely using last look adversely if:

1. **Markout drops sharply in 1–50ms** — faster than you can react
2. **The drop is counterparty-specific** — other counterparties at the same symbol don't show it
3. **The pattern is persistent** — it appears consistently across days, not just in isolated events
4. **Passive fills are unaffected** — the behavior targets your aggressive flow specifically

:::info Related documentation
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [Markout analysis recipe](markout.md)
- [Slippage per fill recipe](slippage.md)
:::
