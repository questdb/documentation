---
title: Order-level implementation shortfall
sidebar_label: Implementation shortfall (order)
description: Calculate total implementation shortfall per order by comparing volume-weighted execution price against arrival mid
---

The [fill-level IS decomposition](implementation-shortfall.md) breaks down cost into spread, permanent, and temporary components per symbol. This recipe calculates **total implementation shortfall per order** — comparing the volume-weighted average execution price across all fills against the mid-price at the time the first fill arrived.

This is the headline TCA metric: how much did the entire order cost relative to where the market was when you started executing?

## Problem

Orders in `fx_trades` are often split into multiple partial fills (rows sharing the same `order_id`). You want to compute a single cost metric per order that accounts for all fills, weighted by size, and benchmarked against the arrival price (the mid at the time of the first fill).

## Solution

Use `ASOF JOIN` to capture the mid-price at each fill, then aggregate by `order_id` to get the volume-weighted average execution price and arrival mid:

```questdb-sql demo title="Total implementation shortfall per order"
WITH fills_enriched AS (
    SELECT
        f.order_id,
        f.symbol,
        f.side,
        f.price,
        f.quantity,
        f.timestamp,
        (m.best_bid + m.best_ask) / 2 AS mid_at_fill
    FROM fx_trades f
    ASOF JOIN market_data m ON (symbol)
    WHERE f.timestamp IN '$yesterday'
),
order_summary AS (
    SELECT
        order_id,
        symbol,
        side,
        first(mid_at_fill) AS arrival_mid,
        sum(price * quantity) / sum(quantity) AS avg_exec_price,
        sum(quantity) AS total_qty,
        count() AS n_fills,
        min(timestamp) AS first_fill_ts,
        max(timestamp) AS last_fill_ts
    FROM fills_enriched
    GROUP BY order_id, symbol, side
)
SELECT
    order_id,
    symbol,
    side,
    n_fills,
    total_qty,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (avg_exec_price - arrival_mid)
        / arrival_mid * 10000 AS total_is_bps
FROM order_summary
ORDER BY total_is_bps DESC;
```

## How it works

### Step 1: Enrich fills with market state

The `ASOF JOIN` pairs each fill with the most recent order book snapshot to compute the mid-price at execution time.

### Step 2: Aggregate to order level

The `order_summary` CTE groups fills by `order_id` and computes:

- **`arrival_mid`** — `first(mid_at_fill)` gives the mid at the time of the earliest fill, which serves as the arrival price benchmark
- **`avg_exec_price`** — volume-weighted average price across all fills: `sum(price * quantity) / sum(quantity)`
- **`n_fills`** and **`total_qty`** — order size context

### Step 3: Compute IS

The final SELECT calculates the shortfall in basis points:

```
IS = direction * (avg_exec_price - arrival_mid) / arrival_mid * 10000
```

Where `direction` is +1 for buys, -1 for sells — so positive IS always means you paid more than the arrival benchmark.

Results are ordered worst-first (`DESC`) so the most expensive orders appear at the top.

## Interpreting results

- **Near-zero IS**: The order executed close to the arrival price. Good execution for the order size.
- **Positive IS (cost)**: The order executed worse than the arrival mid. For multi-fill orders, later fills may have walked the book or the market moved during execution.
- **Negative IS (savings)**: The order beat the arrival benchmark. Can happen with patient limit orders or favorable market movement during execution.
- **High `n_fills`**: Orders with many partial fills are more likely to show IS due to market movement between fills. Compare IS against `n_fills` and `last_fill_ts - first_fill_ts` to understand whether cost came from market impact or execution duration.

## Execution drift (delay cost)

Total IS tells you *how much* an order cost, but not *when* that cost accrued. Execution drift measures how much the mid-price moved against you between the first and last fill — isolating the cost of taking time to complete the order:

```questdb-sql demo title="Mid-price drift during order execution"
WITH fills_enriched AS (
    SELECT
        f.order_id,
        f.symbol,
        f.side,
        f.price,
        f.quantity,
        f.timestamp,
        (m.best_bid + m.best_ask) / 2 AS mid_at_fill
    FROM fx_trades f
    ASOF JOIN market_data m ON (symbol)
    WHERE f.timestamp IN '$yesterday'
),
order_bounds AS (
    SELECT
        order_id,
        symbol,
        side,
        first(mid_at_fill) AS arrival_mid,
        last(mid_at_fill) AS mid_at_last_fill,
        min(timestamp) AS first_fill_ts,
        max(timestamp) AS last_fill_ts
    FROM fills_enriched
    GROUP BY order_id, symbol, side
)
SELECT
    order_id,
    symbol,
    side,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (mid_at_last_fill - arrival_mid)
        / arrival_mid * 10000 AS execution_drift_bps,
    last_fill_ts - first_fill_ts AS execution_duration
FROM order_bounds
ORDER BY execution_drift_bps DESC;
```

`execution_drift_bps` measures how much the mid moved against you from first fill to last fill. `execution_duration` shows how long the order took to complete.

:::note Arrival price vs first fill
In this dataset, the arrival price and first fill are effectively the same moment. In a real trading system, the arrival price would be the mid at decision time (before the order was sent), and **delay cost** would be the drift from decision to first fill. With `fx_trades`, the best available proxy is drift during execution — from first fill to last fill.
:::

High drift on long-duration orders suggests the market is moving against you while you execute. This can indicate that order sizes are too large for the available liquidity, or that execution is too slow. Compare with total IS — if drift accounts for most of the IS, faster execution would reduce costs.

## Spread cost per order

Isolate the spread component of execution cost — the quantity-weighted half-spread paid across all fills in an order:

```questdb-sql demo title="Spread cost per order"
WITH fills_enriched AS (
    SELECT
        f.order_id,
        f.symbol,
        f.side,
        f.price,
        f.quantity,
        m.best_ask - m.best_bid AS spread_at_fill
    FROM fx_trades f
    ASOF JOIN market_data m ON (symbol)
    WHERE f.timestamp IN '$yesterday'
)
SELECT
    order_id,
    symbol,
    sum(0.5 * spread_at_fill * quantity)
        / sum(quantity) AS avg_halfspread,
    sum(0.5 * spread_at_fill / price * 10000 * quantity)
        / sum(quantity) AS spread_cost_bps,
    sum(quantity) AS total_qty
FROM fills_enriched
GROUP BY order_id, symbol
ORDER BY spread_cost_bps DESC;
```

Two spread metrics per order:

- **`avg_halfspread`** — quantity-weighted average half-spread in price terms. This is the baseline cost of crossing the spread, weighted by how much volume went through at each spread level.
- **`spread_cost_bps`** — the same in basis points, normalized by fill price.

Compare `spread_cost_bps` against total IS to understand how much of the execution cost was simply the spread vs. market impact. If spread cost accounts for most of the IS, execution quality is reasonable — you're paying the market price for immediacy. If total IS significantly exceeds spread cost, the excess is market impact or adverse drift.

## Permanent vs temporary impact per order

Decompose each order's total IS into permanent impact (information content) and temporary impact (transient dislocation that reverts). This uses `HORIZON JOIN` to capture the mid at fill time and 30 minutes later, then `PIVOT` to reshape into columns:

```questdb-sql title="Order-level IS decomposition into permanent and temporary impact" demo
WITH order_markouts AS (
    SELECT
        f.order_id,
        f.symbol,
        f.side,
        h.offset,
        sum((m.best_bid + m.best_ask) / 2 * f.quantity)
            / sum(f.quantity) AS weighted_mid,
        sum(f.price * f.quantity) / sum(f.quantity) AS avg_exec_price,
        sum(f.quantity) AS total_qty
    FROM fx_trades f
    HORIZON JOIN market_data m ON (f.symbol = m.symbol)
        LIST (0s, 30m) AS h
    WHERE f.timestamp IN '$yesterday'
),
pivoted AS (
    SELECT * FROM order_markouts
    PIVOT (
        first(weighted_mid) AS mid
        FOR offset IN (
            0               AS at_fill,
            1800000000000   AS at_30m
        )
        GROUP BY order_id, symbol, side, avg_exec_price, total_qty
    )
)
SELECT
    order_id,
    symbol,
    side,
    total_qty,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (avg_exec_price - at_fill_mid)
        / at_fill_mid * 10000 AS total_is_bps,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (at_30m_mid - at_fill_mid)
        / at_fill_mid * 10000 AS permanent_bps,
    CASE WHEN side = 'buy' THEN 1 ELSE -1 END
        * (avg_exec_price - at_30m_mid)
        / at_fill_mid * 10000 AS temporary_bps
FROM pivoted
ORDER BY total_is_bps DESC;
```

The first CTE does the heavy lifting — it computes the quantity-weighted mid and quantity-weighted average execution price per order *at each horizon offset*, so the aggregation happens before the PIVOT. The PIVOT then simply reshapes the two offsets (0s and 30m) into columns.

This gives you three metrics per order:

- **`total_is_bps`** — same as the headline IS above, for reference
- **`permanent_bps`** — how much the mid moved permanently (arrival mid vs mid 30 minutes after execution). High permanent impact suggests your order carried information or was perceived as informed.
- **`temporary_bps`** — how much of the cost reverted (fill price vs post-execution mid). High temporary impact means you moved the market but it bounced back — you paid for liquidity consumption, not information.

The identity holds: **total IS = permanent + temporary**. An order with mostly permanent impact is genuinely moving the market. An order with mostly temporary impact is just paying for immediacy.

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [PIVOT](/docs/query/sql/pivot/)
- [GROUP BY](/docs/query/sql/group-by/)
- [Implementation shortfall decomposition recipe](implementation-shortfall.md)
- [Slippage per fill recipe](slippage.md)
:::
