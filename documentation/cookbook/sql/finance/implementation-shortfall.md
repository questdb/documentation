---
title: Implementation shortfall decomposition
sidebar_label: Implementation shortfall
description: Decompose total execution cost into effective spread, permanent impact, and temporary impact using HORIZON JOIN and PIVOT
---

Implementation Shortfall (IS) is a standard Transaction Cost Analysis framework originally developed for equities (the Perold framework), where it is widely used to evaluate broker and algo execution quality. The same decomposition applies to FX and other asset classes — the underlying idea of separating spread cost from market impact is universal. The example below uses FX trade data, but the approach works for any instrument with order book snapshots.

IS decomposes total execution cost into three components:

- **Effective spread** — the immediate cost of crossing the spread. Measures how far the fill price deviated from the mid at the time of execution.
- **Permanent impact** — the portion of price movement that persists after the trade. This reflects the information content of the trade — if the market permanently moves against you, your trade may have been informed (or was perceived as such).
- **Temporary impact** — the portion that reverts. This is the transient market impact caused by your order consuming liquidity, which fades as the book replenishes.

The relationship is: **effective spread = permanent impact + temporary impact**.

## Problem

You want to break down trading costs beyond simple slippage. For each symbol and side, you need to know how much of the execution cost was due to the spread, how much was genuine market impact, and how much was temporary dislocation that reverted.

## Solution

Use `HORIZON JOIN` to capture the mid-price at execution time and 30 minutes later, then `PIVOT` to reshape the offsets into columns for the decomposition:

```questdb-sql title="Implementation shortfall decomposition by symbol"
WITH markouts AS (
    SELECT
        f.symbol,
        f.price,
        f.quantity,
        f.side,
        h.offset,
        (m.bids[1][1] + m.asks[1][1]) / 2 AS mid
    FROM fx_trades f
    HORIZON JOIN market_data m ON (f.symbol = m.symbol)
        LIST (0, 1800s) AS h
    WHERE f.timestamp IN '$yesterday'
),
pivoted AS (
    SELECT * FROM markouts
    PIVOT (
        avg(mid) AS mid,
        avg(price) AS px,
        sum(quantity) AS vol
        FOR offset IN (
            0          AS at_fill,
            1800000000000 AS at_30m
        )
        GROUP BY symbol, side
    )
)
SELECT
    symbol,
    side,
    at_fill_vol AS total_volume,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (at_fill_px - at_fill_mid) / at_fill_mid * 10000   AS effective_spread_bps,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (at_30m_mid - at_fill_mid) / at_fill_mid * 10000   AS permanent_bps,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (at_fill_px - at_30m_mid) / at_fill_mid * 10000    AS temporary_bps
FROM pivoted
ORDER BY symbol, side;
```

## How it works

The query has three stages:

### 1. HORIZON JOIN — capture mid at two points in time

```sql
HORIZON JOIN market_data m ON (f.symbol = m.symbol)
    LIST (0, 1800s) AS h
```

For each trade, this produces two rows:
- **Offset 0** — the mid-price at the moment of execution (arrival price)
- **Offset 1800s** — the mid-price 30 minutes later (the "settled" price)

### 2. PIVOT — reshape offsets into columns

```sql
PIVOT (
    avg(mid) AS mid, avg(price) AS px, sum(quantity) AS vol
    FOR offset IN (0 AS at_fill, 1800000000000 AS at_30m)
    GROUP BY symbol, side
)
```

This turns the two offset rows into columns: `at_fill_mid`, `at_fill_px`, `at_fill_vol`, `at_30m_mid`, `at_30m_px`, `at_30m_vol`. The offset values in `FOR ... IN` are in nanoseconds (since `fx_trades` uses `TIMESTAMP_NS`), so 30 minutes = 1,800,000,000,000 ns.

### 3. Decomposition — compute the three components

The sign convention uses `CASE WHEN side = 'buy' THEN 1 ELSE -1 END` to normalize both sides so that positive values always mean cost (worse execution):

| Component | Formula | Meaning |
|-----------|---------|---------|
| **Effective spread** | `fill_price - fill_mid` | Immediate cost of crossing the spread |
| **Permanent impact** | `30m_mid - fill_mid` | How much the market permanently moved against you |
| **Temporary impact** | `fill_price - 30m_mid` | How much of the initial cost reverted |

## Interpreting results

- **High effective spread, low permanent**: You're paying to cross the spread but the market isn't moving against you. This is the normal cost of aggressive execution.
- **High permanent impact**: Your trades carry information (or the market perceives them as informed). Consider reducing order size or using more passive execution.
- **High temporary impact**: You're moving the market temporarily but it reverts. This suggests your orders are large relative to available liquidity but not information-driven.
- **Negative temporary impact**: The market moved further against you after the fill. This is worse than expected — your initial impact understated the true cost.

:::tip Choosing the horizon
The 30-minute horizon (`1800s`) is a common choice for FX, but the right value depends on your market and trading style. For highly liquid pairs, 5–10 minutes may be sufficient for the price to settle. For less liquid instruments, you may need 1 hour or more. Adjust the `LIST` offset to match your market's typical recovery time.
:::

:::info Related documentation
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [PIVOT](/docs/query/sql/pivot/)
- [Slippage per fill recipe](slippage.md)
- [Markout analysis recipe](markout.md)
:::
