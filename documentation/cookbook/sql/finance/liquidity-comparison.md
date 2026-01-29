---
title: Liquidity comparison across instruments
sidebar_label: Liquidity comparison
description: Compare liquidity across multiple instruments using L2Price to calculate effective spreads at different order sizes
---

Compare liquidity across instruments by calculating the effective spread at a given order size. The effective spread measures the actual cost of executing a round-trip trade (buy then sell) using Level 2 order book data.

## The problem

You have order book snapshots for multiple instruments and want to compare which ones offer better liquidity for a target order size. The quoted spread (best bid vs best ask) does not tell the full story. Larger orders eat through multiple price levels.

## Solution: Use L2Price to calculate effective spread

`L2Price` calculates the average execution price when filling an order against multiple price levels. The effective spread is the difference between the buy and sell execution prices for a given size.

```questdb-sql demo title="Compare effective spread across instruments"
WITH latest_books AS (
  SELECT timestamp, symbol, bids, asks
  FROM market_data
  WHERE timestamp IN '$today'
  LATEST ON timestamp PARTITION BY symbol
)
SELECT
  symbol,
  L2PRICE(100_000, asks[2], asks[1]) AS buy_price,
  L2PRICE(100_000, bids[2], bids[1]) AS sell_price,
  L2PRICE(100_000, asks[2], asks[1]) - L2PRICE(100_000, bids[2], bids[1]) AS effective_spread,
  (L2PRICE(100_000, asks[2], asks[1]) - L2PRICE(100_000, bids[2], bids[1])) /
    ((L2PRICE(100_000, asks[2], asks[1]) + L2PRICE(100_000, bids[2], bids[1])) / 2) * 10_000 AS spread_bps
FROM latest_books
ORDER BY spread_bps;
```

This query:
1. Gets the latest order book snapshot for each symbol using `LATEST ON`
2. Calculates the average execution price for buying and selling 100,000 units
3. Computes the effective spread in absolute terms and basis points
4. Ranks instruments by liquidity (lowest spread = most liquid)

## Effective spread over time

Track how liquidity changes throughout the trading day:

```questdb-sql demo title="Effective spread time-series"
SELECT
  timestamp,
  symbol,
  last((L2PRICE(100_000, asks[2], asks[1]) - L2PRICE(100_000, bids[2], bids[1])) /
    ((L2PRICE(100_000, asks[2], asks[1]) + L2PRICE(100_000, bids[2], bids[1])) / 2)) * 10_000 AS spread_bps
FROM market_data
WHERE timestamp IN '$today'
  AND symbol IN ('EURUSD', 'GBPUSD', 'USDJPY')
SAMPLE BY 1h
ORDER BY timestamp, symbol;
```

## Compare liquidity at different order sizes

See how execution costs scale with order size:

```questdb-sql demo title="Liquidity depth analysis"
WITH latest_books AS (
  SELECT symbol, bids, asks
  FROM market_data
  WHERE timestamp IN '$today'
  LATEST ON timestamp PARTITION BY symbol
)
SELECT
  symbol,
  L2PRICE(10_000, asks[2], asks[1]) - L2PRICE(10_000, bids[2], bids[1]) AS spread_10k,
  L2PRICE(100_000, asks[2], asks[1]) - L2PRICE(100_000, bids[2], bids[1]) AS spread_100k,
  L2PRICE(500_000, asks[2], asks[1]) - L2PRICE(500_000, bids[2], bids[1]) AS spread_500k,
  L2PRICE(1_000_000, asks[2], asks[1]) - L2PRICE(1_000_000, bids[2], bids[1]) AS spread_1m
FROM latest_books
ORDER BY symbol;
```

Instruments with similar spreads across sizes have deeper liquidity.

## Interpreting results

- **Lower spread_bps** = better liquidity, lower trading costs
- **Spread widening with size** = shallow order book, higher market impact
- **NULL values** = insufficient liquidity to fill the target size

:::info Related documentation
- [L2Price function](/docs/query/functions/finance/#l2price)
- [LATEST ON](/docs/query/sql/latest-on/)
- [spread_bps function](/docs/query/functions/finance/#spread_bps)
- [Demo data schema](/docs/cookbook/demo-data-schema/)
:::
