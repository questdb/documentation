---
title: Cumulative Tick and Trin Indicators
sidebar_label: Tick & Trin
description: Calculate cumulative Tick and Trin (ARMS Index) for market sentiment analysis and breadth indicators
---

Calculate cumulative Tick and Trin (also known as the ARMS Index) to measure market sentiment and breadth. These indicators compare advancing versus declining trades in terms of both count and volume, helping identify overbought/oversold conditions and potential market reversals.

## Problem: Calculate Running Market Breadth

You have a table with trade data including `side` (buy/sell) and `quantity`, and want to calculate cumulative Tick and Trin values throughout the trading day. Tick measures the ratio of upticks to downticks, while Trin (Trading Index) adjusts this ratio by volume to identify divergences between price action and volume.

## Solution: Use Window Functions with CASE Statements

Use `SUM` as a window function combined with `CASE` statements to compute running totals of upticks, downticks, and their respective volumes:

```questdb-sql demo title="Calculate cumulative Tick and Trin indicators"
WITH tick_vol AS (
    SELECT
        timestamp,
        side,
        quantity,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END) OVER (ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END) OVER (ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN quantity END) OVER (ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN quantity END) OVER (ORDER BY timestamp) as upvol
    FROM fx_trades
    WHERE timestamp IN yesterday() AND symbol = 'EURUSD'
)
SELECT
    timestamp,
    side,
    quantity,
    uptick,
    downtick,
    upvol,
    downvol,
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol
LIMIT -8;
```

**Results:**

| timestamp                      | side | quantity | uptick   | downtick | upvol         | downvol       | tick               | trin               |
| ------------------------------ | ---- | -------- | -------- | -------- | ------------- | ------------- | ------------------ | ------------------ |
| 2026-01-11T23:59:58.997072039Z | sell | 98659.0  | 342395.0 | 343426.0 | 45996256659.0 | 46085483999.0 | 0.9969978976548077 | 0.9989319565729681 |
| 2026-01-11T23:59:59.084976043Z | buy  | 99311.0  | 342396.0 | 343426.0 | 45996355970.0 | 46085483999.0 | 0.997000809490254  | 0.9989327172509304 |
| 2026-01-11T23:59:59.085326995Z | buy  | 57591.0  | 342397.0 | 343426.0 | 45996413561.0 | 46085483999.0 | 0.9970037213257005 | 0.9989343839854824 |
| 2026-01-11T23:59:59.085700555Z | buy  | 119667.0 | 342398.0 | 343426.0 | 45996533228.0 | 46085483999.0 | 0.9970066331611468 | 0.9989347025717739 |
| 2026-01-11T23:59:59.642850139Z | sell | 57695.0  | 342398.0 | 343427.0 | 45996533228.0 | 46085541694.0 | 0.9970037300503455 | 0.9989330444221086 |
| 2026-01-11T23:59:59.643380840Z | sell | 130834.0 | 342398.0 | 343428.0 | 45996533228.0 | 46085672528.0 | 0.9970008269564509 | 0.9989329716112184 |
| 2026-01-11T23:59:59.643482764Z | sell | 119573.0 | 342398.0 | 343429.0 | 45996533228.0 | 46085792101.0 | 0.9969979238794627 | 0.9989326547129301 |
| 2026-01-11T23:59:59.643517597Z | sell | 33928.0  | 342398.0 | 343430.0 | 45996533228.0 | 46085826029.0 | 0.996995020819381  | 0.9989304814235689 |

:::warning Handling NULL Values
The first rows will have NULL values for tick and trin until there's at least one trade on each side (buy and sell). You can filter these out with `WHERE uptick IS NOT NULL AND downtick IS NOT NULL` if needed.
:::

Each row shows the cumulative values from the start of the day, with Tick and Trin calculated at every trade.

## How It Works

The indicators are calculated using these formulas:

```
Tick = Upticks / Downticks

Trin = (Upticks / Downticks) / (Upvol / Downvol)
     = Tick / Volume Ratio
```

Where:
- **Upticks**: Cumulative count of buy transactions
- **Downticks**: Cumulative count of sell transactions
- **Upvol**: Cumulative volume of buy transactions
- **Downvol**: Cumulative volume of sell transactions

The query uses:
1. **Window functions**: `SUM(...) OVER (ORDER BY timestamp)` creates running totals from the start of the period
2. **CASE statements**: Conditionally sum only trades matching the specified side
3. **Type casting**: Using `1.0` instead of `1` ensures results are doubles, avoiding explicit casting

### Interpreting the Indicators

**Tick Indicator:**
- **Tick > 1.0**: More buying pressure (bullish sentiment)
- **Tick < 1.0**: More selling pressure (bearish sentiment)
- **Tick = 1.0**: Neutral market (equal buying and selling)

**Trin (ARMS Index):**
- **Trin < 1.0**: Strong market (volume flowing into advancing trades)
- **Trin > 1.0**: Weak market (volume flowing into declining trades)
- **Trin = 1.0**: Balanced market
- **Extreme readings**: Trin > 2.0 suggests oversold conditions; Trin < 0.5 suggests overbought

**Divergences:**
When Tick and Trin move in opposite directions, it can signal important market conditions:
- High Tick + High Trin: Advances lack volume confirmation (bearish divergence)
- Low Tick + Low Trin: Declines lack volume confirmation (bullish divergence)

## Adapting the Query

**Multiple symbols:**
```questdb-sql demo title="Tick and Trin for multiple symbols"
WITH tick_vol AS (
    SELECT
        timestamp,
        symbol,
        side,
        quantity,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN quantity END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN quantity END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as upvol
    FROM fx_trades
    WHERE timestamp IN yesterday()
)
SELECT
    timestamp,
    symbol,
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol;
```

**Intraday periods (reset at intervals):**
```questdb-sql demo title="Tick and Trin reset every hour"
WITH tick_vol AS (
    SELECT
        timestamp,
        side,
        quantity,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN quantity END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN quantity END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as upvol
    FROM fx_trades
    WHERE timestamp IN yesterday() AND symbol = 'EURUSD'
)
SELECT
    timestamp,
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol;
```

**Daily summary values only:**
```questdb-sql demo title="Tick and Trin daily summary"
WITH tick_vol AS (
    SELECT
        SUM(CASE WHEN side = 'sell' THEN 1.0 END) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END) as uptick,
        SUM(CASE WHEN side = 'sell' THEN quantity END) as downvol,
        SUM(CASE WHEN side = 'buy' THEN quantity END) as upvol
    FROM fx_trades
    WHERE timestamp IN yesterday() AND symbol = 'EURUSD'
)
SELECT
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol;
```

:::tip Market Analysis Applications
- **Intraday momentum**: Track Tick throughout the day to identify accumulation/distribution patterns
- **Overbought/oversold**: Extreme Trin readings often precede short-term reversals
- **Market breadth**: Persistently high/low values indicate broad market strength or weakness
- **Divergence trading**: When price makes new highs/lows but Trin doesn't confirm, it suggests weakening momentum
:::

:::info Related Documentation
- [Window functions](/docs/query/sql/over/)
- [SUM aggregate](/docs/query/functions/aggregation/#sum)
- [CASE expressions](/docs/query/sql/case/)
:::
