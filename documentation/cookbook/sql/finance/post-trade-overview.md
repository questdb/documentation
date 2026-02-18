---
title: Post-trade analysis overview
sidebar_label: Overview
description:
  Post-trade and transaction cost analysis (TCA) recipes for FX and equities
  in QuestDB — slippage, markout curves, implementation shortfall, venue
  scoring, and VPIN using ASOF JOIN, HORIZON JOIN, PIVOT, and window functions.
---

Post-trade analysis — also called transaction cost analysis (TCA) — measures
execution quality after the fact. Market makers use it to detect adverse
selection on their resting orders. Buy-side desks use it to evaluate broker and
venue performance. Compliance teams use it to demonstrate best execution.

QuestDB is well suited to this workload because TCA is fundamentally a
time-series join problem: pair each trade with the state of the order book at
the time of execution, then again at various points in the future. The key SQL
features used across these recipes are:

- [**ASOF JOIN**](/docs/query/sql/asof-join/) — match each trade to the most
  recent order book snapshot. The foundation of all slippage calculations.
- [**HORIZON JOIN**](/docs/query/sql/horizon-join/) — match each trade to the
  order book at multiple time offsets in a single pass. Powers markout curves,
  implementation shortfall decomposition, and multi-horizon venue scoring.
- [**PIVOT**](/docs/query/sql/pivot/) — reshape horizon offsets from rows into
  columns for dashboard-style wide tables.
- [**Window functions**](/docs/query/functions/window-functions/overview/) —
  cumulative sums and rolling averages for volume-bucketed metrics like VPIN.

## Key concepts

Before diving into the recipes, here are the core TCA metrics in the order
you'll encounter them:

- **Slippage** — the difference between your execution price and a reference
  price (mid or top-of-book) at the time of the fill. The simplest measure of
  execution cost. Positive means you paid more than the reference.
- **Markout** — how the market moves *after* your fill. The complement of
  slippage: slippage tells you what you paid, markout tells you what happened
  next. Negative markout means the market moved against you (adverse selection).
- **Implementation shortfall** — total cost decomposed into *why* you paid it:
  spread cost (the bid-ask spread you crossed), permanent impact (the market
  moved because of your order), and temporary impact (cost that reverted).
- **Adverse selection** — when counterparties or venues systematically trade
  against you just before the market moves in their favor. The central problem
  TCA tries to detect and quantify.
- **VPIN** — Volume-synchronized Probability of Informed Trading. A
  volume-bucketed measure of order flow imbalance that detects informed trading
  activity without relying on post-trade price movement.

## Recipes

The recipes build on each other. Slippage answers "how much did I pay?", markout
answers "what happened after?", implementation shortfall answers "why did I
pay?", venue scoring answers "where should I trade?", and VPIN answers "who is
informed?"

### 1. Slippage — how much did I pay?

Compare each fill to the prevailing order book at the time of execution.

- [**Slippage per fill**](slippage.md) — cost vs mid and top-of-book for
  individual trades
- [**Aggregated slippage**](slippage-aggregated.md) — roll up by ECN,
  counterparty, size bucket, hour of day, or daily P&L

### 2. Markout — what happened after?

Track post-fill price movement at multiple time horizons.

- [**Markout analysis**](markout.md) — markout curves by side, counterparty,
  and passive vs aggressive
- [**Last look detection**](last-look.md) — millisecond-granularity markout to
  identify asymmetric rejection patterns in FX

### 3. Implementation shortfall — why did I pay?

Decompose total cost into spread, permanent impact, and temporary impact.

- [**IS decomposition by symbol**](implementation-shortfall.md) — Perold
  framework separating effective spread, permanent, and temporary components
- [**Order-level IS**](implementation-shortfall-order.md) — per-order cost
  including execution drift, spread cost, and impact breakdown

### 4. Venue scoring — where should I trade?

Compare execution quality across venues and counterparties to inform routing.

- [**ECN scorecard**](ecn-scorecard.md) — fill quality, toxicity by hour,
  passive vs aggressive breakdown, composite toxicity score, and pivoted
  multi-horizon view

### 5. Flow toxicity — who is informed?

Detect informed trading using volume-synchronized metrics instead of
price-based markout.

- [**VPIN**](vpin.md) — Volume-synchronized Probability of Informed Trading,
  including per-ECN variant

## Data schema

All recipes use the [demo dataset](/docs/cookbook/demo-data-schema/). The two
tables are joined by `symbol` and aligned by timestamp:

- **`fx_trades`** — trade executions with `symbol`, `ecn`, `side`, `passive`,
  `price`, `quantity`, `counterparty`, `order_id` (nanosecond timestamps)
- **`market_data`** — order book snapshots with `symbol`, `bids[][]`,
  `asks[][]` where `[1][1]` is the best price (microsecond timestamps)

The tables use different timestamp resolutions. QuestDB's time-series joins
handle
[mixed-precision timestamps](/docs/query/sql/asof-join/#mixed-precision-timestamps)
automatically — no explicit casting is needed.

:::info Related documentation
- [ASOF JOIN](/docs/query/sql/asof-join/)
- [HORIZON JOIN](/docs/query/sql/horizon-join/)
- [PIVOT](/docs/query/sql/pivot/)
- [Window functions](/docs/query/functions/window-functions/overview/)
- [Demo data schema](/docs/cookbook/demo-data-schema/)
:::
