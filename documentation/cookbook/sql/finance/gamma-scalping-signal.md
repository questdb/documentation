---
title: Gamma scalping signal
sidebar_label: Gamma scalping signal
description: Assess gamma scalping conditions by comparing realized volatility against bid-ask spread cost
---

The vol-spread ratio compares realized price movement against the cost of crossing the bid-ask spread. A high ratio means the market is moving significantly relative to transaction costs; a low ratio means spread costs will likely eat into rebalancing profits.

## Problem

You want to assess whether market conditions favor gamma scalping by comparing realized price movement against the cost of crossing the bid-ask spread.

## Solution

```questdb-sql demo title="Gamma scalping signal: vol-spread ratio"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1d..$now'

WITH sampled AS (
  SELECT
    timestamp,
    symbol,
    last((bid_price + ask_price) / 2) AS close_mid,
    avg((ask_price - bid_price) /
        ((bid_price + ask_price) / 2)) AS avg_rel_spread
  FROM core_price
  WHERE symbol = @symbol
    AND timestamp IN @lookback
  SAMPLE BY 1m ALIGN TO CALENDAR
),
returns AS (
  SELECT
    timestamp,
    symbol,
    close_mid,
    avg_rel_spread,
    LN(close_mid / LAG(close_mid)
        OVER (PARTITION BY symbol ORDER BY timestamp))
        AS log_ret
  FROM sampled
)
SELECT
  timestamp,
  symbol,
  round(AVG(avg_rel_spread) OVER w * 10000, 2)
      AS rel_spread_1h_bps,
  round(SQRT(
    (AVG(log_ret * log_ret) OVER w -
        AVG(log_ret) OVER w * AVG(log_ret) OVER w) * 1440 * 365
  ) * 100, 2) AS realized_vol_1h_ann,
  CASE
    WHEN AVG(avg_rel_spread) OVER w > 0 THEN
      round(SQRT(
        (AVG(log_ret * log_ret) OVER w -
            AVG(log_ret) OVER w
            * AVG(log_ret) OVER w) * 1440
      ) / AVG(avg_rel_spread) OVER w, 2)
    ELSE NULL
  END AS vol_spread_ratio
FROM returns
WHERE log_ret IS NOT NULL
WINDOW w AS (
  PARTITION BY symbol ORDER BY timestamp ROWS 59 PRECEDING
);
```

## How it works

Gamma scalping is an options strategy where traders buy a straddle or strangle and continuously rebalance by buying and selling the underlying as the price moves. Each rebalance crosses the bid-ask spread. The strategy only works if the market moves enough for the scalping profits to exceed two costs: theta decay (the daily loss from holding the options) and the spread cost of each rebalancing trade.

This recipe addresses the spread cost side. The `vol_spread_ratio` measures how much the mid-price is moving per unit of transaction cost over a rolling one-hour window:

- `realized_vol_1h_ann` is the annualized realized volatility, computed from one-minute log returns using the same method as the [realized volatility](/docs/cookbook/sql/finance/realized-volatility/) recipe
- `rel_spread_1h_bps` is the average relative bid-ask spread over the same rolling hour, expressed in basis points. Using relative spread (spread divided by mid-price) makes it dimensionless, matching the units of log-return volatility
- `vol_spread_ratio` divides the non-annualized daily volatility by the average relative spread - both are dimensionless, so the ratio is a pure number. Higher values mean more price movement per unit of spread cost

The query computes both the spread and the mid-price in the same `SAMPLE BY` pass, so the spread is the average across all ticks within each one-minute bar, not just the closing snapshot.

The named `WINDOW w` clause avoids repeating the frame definition, which is important for readability given three output columns sharing the same window.

When interpreting the ratio: if it is consistently low (quiet market, wide spreads, or both), gamma scalping is unlikely to cover its spread costs. Periods of elevated ratio, often around economic data releases or session overlaps, indicate favorable conditions for rebalancing. However, a high vol-spread ratio is necessary but not sufficient - the strategy must also overcome theta decay (the daily cost of holding the options), which depends on implied volatility and option pricing. This recipe only addresses the spread cost side.

:::note Annualization factor
The demo FX data is simulated continuously (24/7, including weekends), so the annualization factor uses `1440 * 365` (1,440 minutes per day times 365 days per year). For real FX markets (24/5), use `1440 * 260` (see the [realized volatility](/docs/cookbook/sql/finance/realized-volatility/) recipe for why FX uses 260 rather than 252). The `vol_spread_ratio` uses non-annualized daily volatility (factor `1440`, i.e. minutes per day, without yearly scaling) since both numerator and denominator are dimensionless.
:::

:::info Related documentation
- [Realized Volatility](/docs/cookbook/sql/finance/realized-volatility/) - the volatility component of this recipe
- [Log returns](/docs/cookbook/sql/finance/log-returns/) - the building block for realized volatility
- [Bid-Ask Spread](/docs/cookbook/sql/finance/bid-ask-spread/) - the spread component of this recipe
- [Liquidity Comparison](/docs/cookbook/sql/finance/liquidity-comparison/) - related microstructure analysis
:::
