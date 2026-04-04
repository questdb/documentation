---
title: Bid-ask spread
sidebar_label: Bid-ask spread
description: Calculate bid-ask spread metrics for transaction cost analysis and liquidity measurement
---

The bid-ask spread is the difference between the best ask (lowest sell price) and best bid (highest buy price). It represents the cost of immediately executing a round-trip trade and is a key measure of market liquidity.

## Problem

You want to measure market liquidity and transaction costs. Narrow spreads indicate liquid markets with low trading costs, while wide spreads suggest illiquidity or market stress.

## Solution

```questdb-sql demo title="Calculate bid-ask spread metrics"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1h..$now'

SELECT
  timestamp,
  symbol,
  round(bid_price, 5) AS bid,
  round(ask_price, 5) AS ask,
  round(ask_price - bid_price, 6) AS spread_absolute,
  round((ask_price - bid_price) / ((bid_price + ask_price) / 2) * 10000, 2) AS spread_bps,
  round((bid_price + ask_price) / 2, 5) AS mid_price
FROM core_price
WHERE symbol = @symbol
  AND timestamp IN @lookback
ORDER BY timestamp;
```

The query calculates:
- **Absolute spread**: ask - bid
- **Spread in basis points**: spread / mid_price × 10,000
- **Mid price**: (bid + ask) / 2

## Aggregated spread analysis

```questdb-sql demo title="Average spread by time period"
DECLARE
  @symbol := 'EURUSD',
  @lookback := '$now - 1d..$now'

SELECT
  timestamp,
  symbol,
  round(avg((ask_price - bid_price) / ((bid_price + ask_price) / 2) * 10000), 2) AS avg_spread_bps,
  round(min((ask_price - bid_price) / ((bid_price + ask_price) / 2) * 10000), 2) AS min_spread_bps,
  round(max((ask_price - bid_price) / ((bid_price + ask_price) / 2) * 10000), 2) AS max_spread_bps,
  count() AS quote_count
FROM core_price
WHERE symbol = @symbol
  AND timestamp IN @lookback
SAMPLE BY 1h
ORDER BY timestamp;
```

## Interpreting results

- **Tight spread**: Highly liquid market conditions and lower immediate transaction costs
- **Wide spread**: Illiquid or volatile period, higher transaction costs
- **Spread widening**: Often precedes or accompanies volatility
- **Intraday patterns**: Spreads typically widen during off-hours and narrow during active sessions

:::note Spread conventions (venue-dependent)
Typical spreads vary a lot by venue, instrument, and session:

- FX majors: often around sub-pip to a few pips in liquid hours (roughly sub-1 to several bps)
- FX minors/emerging pairs: typically wider than majors
- Crypto: can range from tight to very wide depending on pair and exchange
- Equities: often quoted in ticks/cents rather than bps

Treat these as rough guidelines, not fixed thresholds.
:::

:::info Related documentation
- [SAMPLE BY](/docs/query/sql/sample-by/)
- [Aggregation functions](/docs/query/functions/aggregation/)
:::
