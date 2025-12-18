---
title: Volume Profile
sidebar_label: Volume profile
description: Calculate volume profile to identify key price levels with high trading activity for support and resistance analysis
---

Calculate volume profile to identify price levels where significant trading volume occurred. Volume profile shows the distribution of trading activity across different price levels, helping identify strong support/resistance zones, value areas, and potential breakout levels.

## Problem: Distribute Volume Across Price Levels

You want to aggregate all trades into price bins and see the total volume traded at each price level. This reveals where most trading activity occurred during a specific period, which often indicates important price levels for future trading.

## Solution: Use FLOOR to Create Price Bins

Group trades into price bins using `FLOOR` with a tick size parameter, then sum the volume for each bin:

```questdb-sql demo title="Calculate volume profile with $1 tick size"
DECLARE @tick_size := 1.0
SELECT
  floor(price / @tick_size) * @tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN today()
ORDER BY price_bin;
```

**Results:**

| price_bin | volume    |
|-----------|-----------|
| 61000.0   | 12.45     |
| 61001.0   | 8.23      |
| 61002.0   | 15.67     |
| 61003.0   | 23.89     |
| 61004.0   | 11.34     |
| ...       | ...       |

Each row shows the total volume traded within that price bin during the period.

## How It Works

The volume profile calculation uses:

1. **`floor(price / @tick_size) * @tick_size`**: Rounds each trade's price down to the nearest tick size, creating discrete price bins
2. **`SUM(amount)`**: Aggregates all volume that occurred within each price bin
3. **Implicit GROUP BY**: QuestDB automatically groups by all non-aggregated columns (price_bin)

### Understanding Tick Size

The `@tick_size` parameter controls the granularity of your price bins:
- **Small tick size** (e.g., 0.01): Very detailed profile with many bins - useful for intraday analysis
- **Large tick size** (e.g., 100): Broader view with fewer bins - useful for longer-term patterns
- **Dynamic tick size**: Adjust based on the asset's typical price range

## Dynamic Tick Size for Consistent Bins

For assets with different price ranges, a fixed tick size may produce too many or too few bins. This query dynamically calculates the tick size to always produce approximately 50 bins:

```questdb-sql demo title="Volume profile with dynamic 50-bin distribution"
WITH raw_data AS (
   SELECT price, amount FROM trades
   WHERE symbol = 'BTC-USDT' AND timestamp IN today()
),
tick_size AS (
  SELECT (max(price) - min(price)) / 49 as tick_size FROM raw_data
)
SELECT
    floor(price / tick_size) * tick_size AS price_bin,
    round(SUM(amount), 2) AS volume
FROM raw_data CROSS JOIN tick_size
ORDER BY price_bin;
```

This query:
1. Finds the maximum and minimum prices in the dataset
2. Divides the price range by 49 (to create 50 bins)
3. Uses `CROSS JOIN` to apply the calculated tick size to every row
4. Groups trades into evenly-distributed price bins

The result is a volume profile with approximately 50 bars regardless of the asset's price range or volatility.

## Adapting the Query

**Different time periods:**
```sql
-- Specific date
WHERE timestamp IN '2024-09-05'

-- Last hour
WHERE timestamp >= dateadd('h', -1, now())

-- Last week
WHERE timestamp >= dateadd('w', -1, now())

-- Between specific times
WHERE timestamp BETWEEN '2024-09-05T09:30:00' AND '2024-09-05T16:00:00'
```

**Multiple symbols:**
```questdb-sql demo title="Volume profile for multiple symbols"
DECLARE @tick_size := 1.0
SELECT
  symbol,
  floor(price / @tick_size) * @tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM trades
WHERE symbol IN ('BTC-USDT', 'ETH-USDT')
  AND timestamp IN today()
ORDER BY symbol, price_bin;
```

**Filter by minimum volume threshold:**
```sql
-- Only show price levels with significant volume
DECLARE @tick_size := 1.0
SELECT
  floor(price / @tick_size) * @tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN today()
HAVING SUM(amount) > 10  -- Only bins with volume > 10
ORDER BY price_bin;
```

**Show top N price levels by volume:**
```questdb-sql demo title="Top 10 price levels by volume"
DECLARE @tick_size := 1.0
SELECT
  floor(price / @tick_size) * @tick_size AS price_bin,
  round(SUM(amount), 2) AS volume
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN today()
ORDER BY volume DESC
LIMIT 10;
```

## Interpreting Volume Profile

**Point of Control (POC):**
The price level with the highest volume is called the Point of Control. This is typically the fairest price where most participants agreed to trade, and often acts as a strong magnet for price.

```sql
-- Find the POC (price with highest volume)
DECLARE @tick_size := 1.0
SELECT
  floor(price / @tick_size) * @tick_size AS poc_price,
  round(SUM(amount), 2) AS poc_volume
FROM trades
WHERE symbol = 'BTC-USDT'
  AND timestamp IN today()
ORDER BY poc_volume DESC
LIMIT 1;
```

**Value Area:**
The price range where approximately 70% of the volume traded. Prices outside this area are considered "low volume" zones where price tends to move quickly.

**High Volume Nodes (HVN):**
Price levels with significantly higher volume than surrounding levels. These act as strong support or resistance.

**Low Volume Nodes (LVN):**
Price levels with minimal volume. Price often moves quickly through these zones.

:::tip Trading Applications
- **Support/Resistance**: High volume nodes indicate strong support or resistance levels
- **Value Area**: Price tends to return to high-volume areas (mean reversion opportunity)
- **Breakouts**: Low volume nodes above/below current price suggest potential quick moves if broken
- **Acceptance**: Sustained trading at a new price level builds volume profile and establishes new value
:::

:::tip Visualization
Volume profile is best visualized as a horizontal histogram on a price chart, showing volume distribution across price levels. This can be created in Grafana or other charting tools by rotating the volume axis.
:::

:::info Related Documentation
- [FLOOR function](/docs/reference/function/numeric/#floor)
- [SUM aggregate](/docs/reference/function/aggregation/#sum)
- [DECLARE variables](/docs/reference/sql/declare/)
- [GROUP BY (implicit)](/docs/reference/sql/select/#implicit-group-by)
:::
