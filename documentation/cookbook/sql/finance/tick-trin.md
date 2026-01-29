---
title: TICK and TRIN indicators
sidebar_label: TICK & TRIN
description: Calculate TICK and TRIN (ARMS Index) for market breadth analysis
---

Calculate TICK and TRIN (Trading Index, also known as the ARMS Index) to measure market breadth. These indicators count how many symbols are advancing versus declining across a market.

## TICK

**TICK** measures market direction by counting symbols:
- For each symbol, check if its last trade price > previous trade price (uptick) or < (downtick)
- TICK = number of symbols on uptick - number of symbols on downtick
- Positive TICK = more symbols rising, negative = more falling

### TICK snapshot

Calculate a single market-wide TICK value. For each symbol, compare the last trade price to the previous trade price to determine if it's on an uptick or downtick. The final result is one row showing how many symbols are rising versus falling.

```questdb-sql demo title="TICK - market breadth snapshot"
WITH with_previous AS (
  SELECT timestamp, symbol, price,
    LAG(price) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_price
  FROM fx_trades
  WHERE timestamp IN '$today'
),
classified AS (
  SELECT  symbol,
    CASE WHEN price > prev_price THEN 1 ELSE 0 END AS is_uptick,
    CASE WHEN price < prev_price THEN 1 ELSE 0 END AS is_downtick
  FROM with_previous
  WHERE prev_price IS NOT NULL
  LATEST ON timestamp PARTITION BY symbol -- use only the latest entry per symbol, together with the previous price
)
SELECT
  SUM(is_uptick) AS uptick_symbols,
  SUM(is_downtick) AS downtick_symbols,
  SUM(is_uptick) - SUM(is_downtick) AS tick
FROM classified;
```

### Interpreting TICK

- **Positive**: More symbols on uptick (bullish)
- **Negative**: More symbols on downtick (bearish)
- **Near zero**: Balanced market

## TRIN

**TRIN** (ARMS Index) adds volume weighting:
- TRIN = (advancing symbols / declining symbols) / (advancing volume / declining volume)
- TRIN < 1.0 = volume favoring advances (bullish)
- TRIN > 1.0 = volume favoring declines (bearish)
- TRIN = 1.0 = neutral

### TRIN snapshot

Calculate a single market-wide TRIN value. For each symbol, aggregate intraday volume and classify it as advancing or declining based on whether the current price is above or below the day's open. The final result is one row showing overall market breadth.

```questdb-sql demo title="TRIN - daily breadth snapshot"
WITH daily_stats AS (
  SELECT symbol,
    first(price) AS open_price,
    last(price) AS current_price,
    sum(quantity) AS total_volume
  FROM fx_trades
  WHERE timestamp IN '$today'
  SAMPLE BY 1d
),
classified AS (
  SELECT *,
    CASE WHEN current_price > open_price THEN 1 ELSE 0 END AS is_advancing,
    CASE WHEN current_price < open_price THEN 1 ELSE 0 END AS is_declining
  FROM daily_stats
)
SELECT
  SUM(is_advancing) AS advancing,
  SUM(is_declining) AS declining,
  SUM(CASE WHEN is_advancing = 1 THEN total_volume ELSE 0 END) AS advancing_volume,
  SUM(CASE WHEN is_declining = 1 THEN total_volume ELSE 0 END) AS declining_volume,
  (SUM(is_advancing)::double / NULLIF(SUM(is_declining), 0)) /
  (SUM(CASE WHEN is_advancing = 1 THEN total_volume ELSE 0 END)::double /
   NULLIF(SUM(CASE WHEN is_declining = 1 THEN total_volume ELSE 0 END), 0)) AS trin
FROM classified;
```

### TRIN time-series

Track how market breadth evolves throughout the day. For each candle interval, compare each symbol's close to its previous close to classify it as advancing or declining. Each row returns the market-wide TRIN at that point in time.

```questdb-sql demo title="TRIN time-series with 5-minute candles"
WITH candles AS (
  SELECT timestamp, symbol,
    last(price) AS close_price,
    sum(quantity) AS total_volume
  FROM fx_trades
  WHERE timestamp IN '$today'
  SAMPLE BY 5m
),
with_previous AS (
  SELECT timestamp, symbol, total_volume, close_price,
    LAG(close_price) OVER (PARTITION BY symbol ORDER BY timestamp) AS last_close
  FROM candles
),
classified AS (
  SELECT timestamp, symbol, total_volume,
    CASE WHEN close_price > last_close THEN 1 ELSE 0 END AS is_advancing,
    CASE WHEN close_price < last_close THEN 1 ELSE 0 END AS is_declining
  FROM with_previous
  WHERE last_close IS NOT NULL
)
SELECT
  timestamp,
  SUM(is_advancing) AS advancing,
  SUM(is_declining) AS declining,
  SUM(CASE WHEN is_advancing = 1 THEN total_volume ELSE 0 END) AS advancing_volume,
  SUM(CASE WHEN is_declining = 1 THEN total_volume ELSE 0 END) AS declining_volume,
  (SUM(is_advancing)::double / NULLIF(SUM(is_declining), 0)) /
  (SUM(CASE WHEN is_advancing = 1 THEN total_volume ELSE 0 END)::double /
   NULLIF(SUM(CASE WHEN is_declining = 1 THEN total_volume ELSE 0 END), 0)) AS trin
FROM classified;
```

### Interpreting TRIN

- **< 1.0**: Volume favoring advances (bullish)
- **> 1.0**: Volume favoring declines (bearish)
- **= 1.0**: Neutral

:::note
TRIN can produce counterintuitive results. If advances outnumber declines 2:1 and advancing volume also leads 2:1, TRIN equals 1.0 (neutral) despite bullish conditions. Always consider TRIN alongside the raw advancing/declining counts.
:::

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/syntax/)
- [LAG function](/docs/query/functions/window-functions/reference/#lag)
- [SAMPLE BY](/docs/query/sql/sample-by/)
:::
