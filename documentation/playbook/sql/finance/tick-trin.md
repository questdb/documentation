---
title: Cumulative Tick and Trin Indicators
sidebar_label: Tick & Trin
description: Calculate cumulative Tick and Trin (ARMS Index) for market sentiment analysis and breadth indicators
---

Calculate cumulative Tick and Trin (also known as the ARMS Index) to measure market sentiment and breadth. These indicators compare advancing versus declining trades in terms of both count and volume, helping identify overbought/oversold conditions and potential market reversals.

## Problem: Calculate Running Market Breadth

You have a table with trade data including `side` (buy/sell) and `amount`, and want to calculate cumulative Tick and Trin values throughout the trading day. Tick measures the ratio of upticks to downticks, while Trin (Trading Index) adjusts this ratio by volume to identify divergences between price action and volume.

**Sample data:**

| timestamp                    | side | amount |
|------------------------------|------|--------|
| 2023-12-01T10:00:00.000000Z | sell | 100    |
| 2023-12-01T10:01:00.000000Z | buy  | 50     |
| 2023-12-01T10:02:00.000000Z | sell | 150    |
| 2023-12-01T10:03:00.000000Z | buy  | 100    |
| 2023-12-01T10:04:00.000000Z | buy  | 200    |

## Solution: Use Window Functions with CASE Statements

Use `SUM` as a window function combined with `CASE` statements to compute running totals of upticks, downticks, and their respective volumes:

```questdb-sql demo title="Calculate cumulative Tick and Trin indicators"
WITH tick_vol AS (
    SELECT
        timestamp,
        side,
        amount,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END) OVER (ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END) OVER (ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN amount END) OVER (ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN amount END) OVER (ORDER BY timestamp) as upvol
    FROM trades
    WHERE timestamp IN yesterday() AND symbol = 'BTC-USDT'
)
SELECT
    timestamp,
    side,
    amount,
    uptick,
    downtick,
    upvol,
    downvol,
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol;
```

**Results:**

| timestamp                    | side | amount | downtick | uptick | downvol | upvol | tick | trin           |
|------------------------------|------|--------|----------|--------|---------|-------|------|----------------|
| 2023-12-01T10:00:00.000000Z | sell | 100.0  | 1.0      | NULL   | 100.0   | NULL  | NULL | NULL           |
| 2023-12-01T10:01:00.000000Z | buy  | 50.0   | 1.0      | 1.0    | 100.0   | 50.0  | 1.0  | 2.0            |
| 2023-12-01T10:02:00.000000Z | sell | 150.0  | 2.0      | 1.0    | 250.0   | 50.0  | 0.5  | 2.5            |
| 2023-12-01T10:03:00.000000Z | buy  | 100.0  | 2.0      | 2.0    | 250.0   | 150.0 | 1.0  | 1.666666666666 |
| 2023-12-01T10:04:00.000000Z | buy  | 200.0  | 2.0      | 3.0    | 250.0   | 350.0 | 1.5  | 1.071428571428 |

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
        amount,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN amount END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN amount END)
            OVER (PARTITION BY symbol ORDER BY timestamp) as upvol
    FROM trades
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
        amount,
        SUM(CASE WHEN side = 'sell' THEN 1.0 END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as uptick,
        SUM(CASE WHEN side = 'sell' THEN amount END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as downvol,
        SUM(CASE WHEN side = 'buy' THEN amount END)
            OVER (PARTITION BY timestamp_floor('h', timestamp) ORDER BY timestamp) as upvol
    FROM trades
    WHERE timestamp IN yesterday() AND symbol = 'BTC-USDT'
)
SELECT
    timestamp,
    uptick / downtick as tick,
    (uptick / downtick) / (upvol / downvol) as trin
FROM tick_vol;
```

**Daily summary values only:**
```sql
WITH tick_vol AS (
    SELECT
        SUM(CASE WHEN side = 'sell' THEN 1.0 END) as downtick,
        SUM(CASE WHEN side = 'buy' THEN 1.0 END) as uptick,
        SUM(CASE WHEN side = 'sell' THEN amount END) as downvol,
        SUM(CASE WHEN side = 'buy' THEN amount END) as upvol
    FROM trades
    WHERE timestamp IN yesterday()
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

:::warning Handling NULL Values
The first buy or sell transaction will produce NULL values for some calculations since there's no previous opposite-side transaction yet. You can filter these out with `WHERE uptick IS NOT NULL AND downtick IS NOT NULL` if needed.
:::

:::info Related Documentation
- [Window functions](/docs/reference/sql/over/)
- [SUM aggregate](/docs/reference/function/aggregation/#sum)
- [CASE expressions](/docs/reference/sql/case/)
:::
