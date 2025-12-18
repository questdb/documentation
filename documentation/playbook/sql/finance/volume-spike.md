---
title: Volume Spike Detection
sidebar_label: Volume spikes
description: Detect volume spikes by comparing current volume against recent historical volume using LAG window function
---

Detect volume spikes by comparing current trading volume against recent historical patterns. Volume spikes often precede significant price moves and can signal accumulation, distribution, or the start of new trends. This pattern helps identify unusual trading activity that may warrant attention.

## Problem: Flag Abnormal Volume

You have aggregated candle data and want to flag trades where volume is significantly higher than recent activity. For this example, a "spike" is defined as volume exceeding twice the previous candle's volume for the same symbol.

## Solution: Use LAG to Access Previous Volume

Use the `LAG` window function to retrieve the previous candle's volume, then compare with a `CASE` statement:

```questdb-sql demo title="Detect volume spikes exceeding 2x previous volume"
DECLARE
  @symbol := 'BTC-USDT'
WITH candles AS (
  SELECT
    timestamp,
    symbol,
    sum(amount) AS volume
  FROM trades
  WHERE timestamp >= dateadd('h', -7, now())
    AND symbol = @symbol
  SAMPLE BY 30s
),
prev_volumes AS (
  SELECT
    timestamp,
    symbol,
    volume,
    LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_volume
  FROM candles
)
SELECT
  timestamp,
  symbol,
  volume,
  prev_volume,
  CASE
    WHEN volume > 2 * prev_volume THEN 'spike'
    ELSE 'normal'
  END AS spike_flag
FROM prev_volumes
WHERE prev_volume IS NOT NULL;
```

**Results:**

| timestamp                    | symbol    | volume | prev_volume | spike_flag |
|------------------------------|-----------|--------|-------------|------------|
| 2024-01-15T10:00:30.000000Z | BTC-USDT  | 10.5   | 12.3        | normal     |
| 2024-01-15T10:01:00.000000Z | BTC-USDT  | 9.8    | 10.5        | normal     |
| 2024-01-15T10:01:30.000000Z | BTC-USDT  | 25.6   | 9.8         | spike      |
| 2024-01-15T10:02:00.000000Z | BTC-USDT  | 11.2   | 25.6        | normal     |
| 2024-01-15T10:02:30.000000Z | BTC-USDT  | 8.9    | 11.2        | normal     |

The spike at 10:01:30 shows volume of 25.6, which is more than double the previous volume of 9.8.

## How It Works

The query uses a multi-step approach:

1. **Aggregate to candles**: Use `SAMPLE BY` to create 30-second candles with volume totals
2. **Access previous value**: `LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp)` retrieves volume from the previous candle
3. **Compare and flag**: `CASE` statement checks if current volume exceeds the threshold (2× previous)
4. **Filter nulls**: The first candle has no previous value, so we filter it out with `WHERE prev_volume IS NOT NULL`

### Understanding LAG

`LAG(column, offset)` accesses the value from a previous row:
- **Without offset** (or offset=1): Gets the immediately previous row
- **With PARTITION BY**: Resets for each group (symbol in this case)
- **Returns NULL**: For the first row in each partition (no previous value exists)

## Alternative: Compare Against Moving Average

Instead of comparing against the previous single candle, you can compare against a moving average to smooth out noise:

```questdb-sql demo title="Detect spikes exceeding 2x the 10-period moving average"
DECLARE
  @symbol := 'BTC-USDT'
WITH candles AS (
  SELECT
    timestamp,
    symbol,
    sum(amount) AS volume
  FROM trades
  WHERE timestamp >= dateadd('h', -7, now())
    AND symbol = @symbol
  SAMPLE BY 30s
),
moving_avg AS (
  SELECT
    timestamp,
    symbol,
    volume,
    AVG(volume) OVER (
      PARTITION BY symbol
      ORDER BY timestamp
      ROWS BETWEEN 9 PRECEDING AND 1 PRECEDING
    ) AS avg_volume_10
  FROM candles
)
SELECT
  timestamp,
  symbol,
  volume,
  round(avg_volume_10, 2) AS avg_volume_10,
  CASE
    WHEN volume > 2 * avg_volume_10 THEN 'spike'
    ELSE 'normal'
  END AS spike_flag
FROM moving_avg
WHERE avg_volume_10 IS NOT NULL;
```

This approach:
- Calculates the 10-period moving average of volume (excluding current candle)
- Compares current volume against this average
- Provides more robust spike detection by smoothing out single-candle anomalies

## Adapting the Query

**Different spike thresholds:**
```sql
-- 50% increase (1.5x)
WHEN volume > 1.5 * prev_volume THEN 'spike'

-- 3x increase (300%)
WHEN volume > 3 * prev_volume THEN 'spike'

-- Multiple levels
CASE
  WHEN volume > 3 * prev_volume THEN 'extreme_spike'
  WHEN volume > 2 * prev_volume THEN 'spike'
  WHEN volume > 1.5 * prev_volume THEN 'elevated'
  ELSE 'normal'
END AS spike_flag
```

**Different time intervals:**
```sql
-- 1-minute candles
SAMPLE BY 1m

-- 5-minute candles
SAMPLE BY 5m

-- 1-hour candles
SAMPLE BY 1h
```

**Multiple symbols:**
```questdb-sql demo title="Volume spikes across multiple symbols"
WITH candles AS (
  SELECT
    timestamp,
    symbol,
    sum(amount) AS volume
  FROM trades
  WHERE timestamp >= dateadd('h', -7, now())
  SAMPLE BY 30s
),
prev_volumes AS (
  SELECT
    timestamp,
    symbol,
    volume,
    LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_volume
  FROM candles
)
SELECT
  timestamp,
  symbol,
  volume,
  prev_volume,
  CASE
    WHEN volume > 2 * prev_volume THEN 'spike'
    ELSE 'normal'
  END AS spike_flag
FROM prev_volumes
WHERE prev_volume IS NOT NULL
  AND volume > 2 * prev_volume  -- Only show spikes
ORDER BY timestamp DESC
LIMIT 20;
```

**Include price change alongside volume:**
```questdb-sql demo title="Volume spikes with price movement"
DECLARE
  @symbol := 'BTC-USDT'
WITH candles AS (
  SELECT
    timestamp,
    symbol,
    first(price) AS open,
    last(price) AS close,
    sum(amount) AS volume
  FROM trades
  WHERE timestamp >= dateadd('h', -7, now())
    AND symbol = @symbol
  SAMPLE BY 30s
),
with_lags AS (
  SELECT
    timestamp,
    symbol,
    open,
    close,
    ((close - open) / open) * 100 AS price_change_pct,
    volume,
    LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_volume
  FROM candles
)
SELECT
  timestamp,
  symbol,
  round(price_change_pct, 2) AS price_change_pct,
  volume,
  prev_volume,
  CASE
    WHEN volume > 2 * prev_volume THEN 'spike'
    ELSE 'normal'
  END AS spike_flag
FROM with_lags
WHERE prev_volume IS NOT NULL;
```

## Combining Volume and Price Analysis

Volume spikes are most meaningful when analyzed with price action:

```sql
-- Volume spike with price increase (potential breakout)
CASE
  WHEN volume > 2 * prev_volume AND price_change_pct > 1 THEN 'bullish_spike'
  WHEN volume > 2 * prev_volume AND price_change_pct < -1 THEN 'bearish_spike'
  WHEN volume > 2 * prev_volume THEN 'neutral_spike'
  ELSE 'normal'
END AS spike_type
```

:::tip Trading Signals
- **Breakout confirmation**: Volume spikes during breakouts confirm strength and reduce false breakout risk
- **Reversal warning**: Volume spikes at trend extremes often signal exhaustion and potential reversals
- **Distribution**: High volume with minimal price change can indicate institutional distribution
- **Accumulation**: Volume spikes on dips can signal smart money accumulation
:::

:::tip Alert Configuration
Set up alerts for volume spikes to catch important market events:
- **Threshold**: Start with 2-3x average volume
- **Time frame**: Match to your trading style (1m for scalping, 1h for swing trading)
- **Confirmation**: Combine with price movement or technical levels for better signals
:::

:::warning False Positives
Volume spikes can occur due to:
- Market open/close times
- News releases or economic data
- Rollover periods for futures
- Technical glitches or flash crashes

Always confirm with price action and broader market context.
:::

:::info Related Documentation
- [LAG window function](/docs/reference/function/window/#lag)
- [AVG window function](/docs/reference/function/window/#avg)
- [SAMPLE BY](/docs/reference/sql/select/#sample-by)
- [CASE expressions](/docs/reference/sql/case/)
:::
