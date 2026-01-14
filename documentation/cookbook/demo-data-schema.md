---
title: Demo data schema
sidebar_label: Demo data schema
description: Schema and structure of the FX market data and cryptocurrency trades available on demo.questdb.io
---

The [QuestDB demo instance at demo.questdb.com](https://demo.questdb.io) contains two datasets that you can query directly: simulated FX market data and real cryptocurrency trades. This page describes the available tables and their structure.

:::tip
The demo instance is read-only. For testing write operations (INSERT, UPDATE, DELETE), you'll need to run QuestDB locally. See the [Quick Start guide](/docs/getting-started/quick-start/) for installation instructions.
:::

## Overview

The demo instance provides two independent datasets:

1. **FX Market Data (Simulated)** - Foreign exchange prices and order books
2. **Cryptocurrency Trades (Real)** - Live cryptocurrency trades from OKX exchange

---

## FX market data (simulated)

The FX dataset contains simulated foreign exchange market data for 30 currency pairs. We fetch real reference prices from Yahoo Finance every few seconds, but all order book levels and price updates are generated algorithmically based on these reference prices.

### core_price table

The `core_price` table contains individual FX price updates from various liquidity providers. Each row represents a bid/ask quote update for a specific currency pair from a specific ECN.

#### Schema

```sql title="core_price table structure"
CREATE TABLE 'core_price' (
    timestamp TIMESTAMP,
    symbol SYMBOL CAPACITY 16384 CACHE,
    ecn SYMBOL CAPACITY 256 CACHE,
    bid_price DOUBLE,
    bid_volume LONG,
    ask_price DOUBLE,
    ask_volume LONG,
    reason SYMBOL CAPACITY 256 CACHE,
    indicator1 DOUBLE,
    indicator2 DOUBLE
) timestamp(timestamp) PARTITION BY HOUR TTL 3 DAYS WAL;
```

#### Columns

- **`timestamp`** - Time of the price update (designated timestamp)
- **`symbol`** - Currency pair from the 30 tracked symbols (see list below)
- **`ecn`** - Electronic Communication Network providing the quote: **LMAX**, **EBS**, **Currenex**, or **Hotspot**
- **`bid_price`** - Bid price (price at which market makers are willing to buy)
- **`bid_volume`** - Volume available at the bid price
- **`ask_price`** - Ask price (price at which market makers are willing to sell)
- **`ask_volume`** - Volume available at the ask price
- **`reason`** - Reason for the price update: "normal", "liquidity_event", or "news_event"
- **`indicator1`**, **`indicator2`** - Additional market indicators

The table tracks **30 currency pairs**: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, EURJPY, GBPJPY, EURGBP, AUDJPY, CADJPY, NZDJPY, EURAUD, EURNZD, AUDNZD, GBPAUD, GBPNZD, AUDCAD, NZDCAD, EURCAD, EURCHF, GBPCHF, USDNOK, USDSEK, USDZAR, USDMXN, USDSGD, USDHKD, USDTRY.

#### Sample data

```questdb-sql demo title="Recent core_price updates"
SELECT * FROM core_price
WHERE timestamp IN today()
LIMIT -10;
```

**Results:**

| timestamp                   | symbol | ecn      | bid_price | bid_volume | ask_price | ask_volume | reason          | indicator1 | indicator2 |
| --------------------------- | ------ | -------- | --------- | ---------- | --------- | ---------- | --------------- | ---------- | ---------- |
| 2025-12-18T11:46:13.059566Z | USDCHF | LMAX     | 0.7959    | 219884     | 0.7971    | 223174     | liquidity_event | 0.641      |            |
| 2025-12-18T11:46:13.060542Z | USDSGD | Currenex | 1.291     | 295757049  | 1.2982    | 301215620  | normal          | 0.034      |            |
| 2025-12-18T11:46:13.061853Z | EURAUD | LMAX     | 1.7651    | 6207630    | 1.7691    | 5631029    | liquidity_event | 0.027      |            |
| 2025-12-18T11:46:13.064138Z | AUDNZD | LMAX     | 1.1344    | 227668     | 1.1356    | 212604     | liquidity_event | 0.881      |            |
| 2025-12-18T11:46:13.065041Z | GBPNZD | LMAX     | 2.3307    | 2021166    | 2.3337    | 1712096    | normal          | 0.308      |            |
| 2025-12-18T11:46:13.065187Z | USDCAD | EBS      | 1.3837    | 2394978    | 1.3869    | 2300556    | normal          | 0.084      |            |
| 2025-12-18T11:46:13.065722Z | USDZAR | EBS      | 16.7211   | 28107021   | 16.7263   | 23536519   | liquidity_event | 0.151      |            |
| 2025-12-18T11:46:13.066128Z | EURAUD | EBS      | 1.763     | 810471822  | 1.7712    | 883424752  | news_event      | 0.027      |            |
| 2025-12-18T11:46:13.066700Z | CADJPY | Currenex | 113.63    | 20300827   | 114.11    | 19720915   | normal          | 0.55       |            |
| 2025-12-18T11:46:13.071607Z | NZDJPY | Currenex | 89.95     | 35284228   | 90.46     | 30552528   | liquidity_event | 0.69       |            |

### market_data table

The `market_data` table contains order book snapshots for currency pairs. Each row represents a complete view of the order book at a specific timestamp, with bid and ask prices and volumes stored as 2D arrays.

#### Schema

```sql title="market_data table structure"
CREATE TABLE 'market_data' (
    timestamp TIMESTAMP,
    symbol SYMBOL CAPACITY 16384 CACHE,
    bids DOUBLE[][],
    asks DOUBLE[][]
) timestamp(timestamp) PARTITION BY HOUR TTL 3 DAYS;
```

#### Columns

- **`timestamp`** - Time of the order book snapshot (designated timestamp)
- **`symbol`** - Currency pair (e.g., EURUSD, GBPJPY)
- **`bids`** - 2D array containing bid prices and volumes: `[[price1, price2, ...], [volume1, volume2, ...]]`
- **`asks`** - 2D array containing ask prices and volumes: `[[price1, price2, ...], [volume1, volume2, ...]]`

The arrays are structured so that:
- `bids[1]` contains bid prices (descending order - highest first)
- `bids[2]` contains corresponding bid volumes
- `asks[1]` contains ask prices (ascending order - lowest first)
- `asks[2]` contains corresponding ask volumes

#### Sample query

```questdb-sql demo title="Recent order book snapshots"
SELECT timestamp, symbol,
       array_count(bids[1]) as bid_levels,
       array_count(asks[1]) as ask_levels
FROM market_data
WHERE timestamp IN today()
LIMIT -5;
```

**Results:**

| timestamp                   | symbol | bid_levels | ask_levels |
| --------------------------- | ------ | ---------- | ---------- |
| 2025-12-18T12:04:07.071512Z | EURAUD | 40         | 40         |
| 2025-12-18T12:04:07.072060Z | USDJPY | 40         | 40         |
| 2025-12-18T12:04:07.072554Z | USDMXN | 40         | 40         |
| 2025-12-18T12:04:07.072949Z | USDCAD | 40         | 40         |
| 2025-12-18T12:04:07.073002Z | USDSEK | 40         | 40         |

Each order book snapshot contains 40 bid levels and 40 ask levels.

### fx_trades table

The `fx_trades` table contains simulated FX trade executions. Each row represents a trade that executed against the order book, with realistic partial fills and level walking.

#### Schema

```sql title="fx_trades table structure"
CREATE TABLE 'fx_trades' (
    timestamp TIMESTAMP_NS,
    symbol SYMBOL,
    ecn SYMBOL,
    trade_id UUID,
    side SYMBOL,
    passive BOOLEAN,
    price DOUBLE,
    quantity DOUBLE,
    counterparty SYMBOL,
    order_id UUID
) timestamp(timestamp) PARTITION BY HOUR TTL 1 MONTH WAL;
```

#### Columns

- **`timestamp`** - Time of trade execution with nanosecond precision (designated timestamp)
- **`symbol`** - Currency pair (same 30 pairs as `core_price`)
- **`ecn`** - ECN where trade executed: **LMAX**, **EBS**, **Currenex**, or **Hotspot**
- **`trade_id`** - Unique identifier for this specific trade
- **`side`** - Trade direction: **buy** or **sell**
- **`passive`** - Whether this was a passive (limit) or aggressive (market) order
- **`price`** - Execution price
- **`quantity`** - Trade size
- **`counterparty`** - 20-character LEI (Legal Entity Identifier) of the counterparty
- **`order_id`** - Parent order identifier (multiple trades can share the same `order_id` for partial fills)

#### Sample data

```questdb-sql demo title="Recent FX trades"
SELECT * FROM fx_trades
WHERE timestamp IN today()
LIMIT -10;
```

**Results:**

| timestamp                      | symbol | ecn      | trade_id                             | side | passive | price   | quantity | counterparty         | order_id                             |
| ------------------------------ | ------ | -------- | ------------------------------------ | ---- | ------- | ------- | -------- | -------------------- | ------------------------------------ |
| 2026-01-12T12:18:57.138282586Z | EURUSD | LMAX     | d14e6e54-6c6b-495d-865d-47311a36519b | sell | false   | 1.1705  | 193615.0 | 004409EA0ED5B9FF954B | db3cd1e6-c3e7-4909-8a64-31a2b6f0f9c0 |
| 2026-01-12T12:18:57.138912209Z | EURUSD | LMAX     | be857ed7-848f-4d23-83ff-3e5636cbc9de | sell | false   | 1.1707  | 107749.0 | 000A4FB276D1BE98F143 | db3cd1e6-c3e7-4909-8a64-31a2b6f0f9c0 |
| 2026-01-12T12:18:57.259555330Z | GBPUSD | EBS      | 446cac16-9b25-4205-b1e1-3eda4a3bb539 | sell | false   | 1.3401  | 192701.0 | 00119FEF98D9EC079D15 | d0d74987-8929-4c48-bc18-7164b1a956e3 |
| 2026-01-12T12:18:57.303333947Z | GBPUSD | EBS      | 27515a12-9ab6-4175-8fa3-422d4529f365 | sell | true    | 1.3404  | 66295.0  | 00363EC8480C058FD36C | 239eae98-fc45-4e1c-bd45-8933909a67fc |
| 2026-01-12T12:18:57.334406432Z | USDTRY | EBS      | c82453b3-9961-40ea-a6ac-43c33fe0f235 | sell | true    | 43.1001 | 65849.0  | 002A80CCE4AFD37D0642 | 2ce77a03-0f21-4241-8ca7-903080848dc0 |
| 2026-01-12T12:18:57.365445776Z | USDJPY | LMAX     | bf918a88-60c2-4a20-8f53-65298b5a10fe | buy  | false   | 156.82  | 55548.0  | 00EB428CCC1C1C240F71 | 7458b51d-65fa-4ffb-8fa8-840e88d2c316 |
| 2026-01-12T12:18:57.479674129Z | USDJPY | EBS      | c7c902bd-7075-4952-88d1-76d39ba4c706 | buy  | false   | 156.82  | 98591.0  | 00A10D27678CC03A0161 | 5992296a-684f-4783-9e8c-7206519a85f8 |
| 2026-01-12T12:18:57.480051522Z | USDJPY | EBS      | a20b6f91-7148-4b64-8a36-85da5bec66f9 | buy  | false   | 156.85  | 178152.0 | 00CBD8490AE2844C8554 | 5992296a-684f-4783-9e8c-7206519a85f8 |
| 2026-01-12T12:18:57.509773474Z | GBPUSD | Currenex | ae6b771b-5abd-44c7-9e0e-3527ce6fb5b4 | sell | false   | 1.3404  | 62305.0  | 006728CF215E44412D18 | 54ff8191-1891-4a5c-8b67-d5cd961ec5e8 |
| 2026-01-12T12:18:57.334732460Z | USDTRY | EBS      | 469637a5-6553-4aad-aad9-f7114c8a442d | sell | true    | 43.1    | 101177.0 | 002CAC92E93AB4B3D30C | 2ce77a03-0f21-4241-8ca7-903080848dc0 |

### FX materialized views

The FX dataset includes several materialized views providing pre-aggregated data at different time intervals:

#### Best bid/offer (BBO) views

- **`bbo_1s`** - Best bid and offer aggregated every 1 second
- **`bbo_1m`** - Best bid and offer aggregated every 1 minute
- **`bbo_1h`** - Best bid and offer aggregated every 1 hour
- **`bbo_1d`** - Best bid and offer aggregated every 1 day

#### Core price aggregations

- **`core_price_1s`** - Core prices aggregated every 1 second
- **`core_price_1d`** - Core prices aggregated every 1 day

#### Market data OHLC

- **`market_data_ohlc_1m`** - Open, High, Low, Close candlesticks at 1-minute intervals
- **`market_data_ohlc_15m`** - OHLC candlesticks at 15-minute intervals
- **`market_data_ohlc_1d`** - OHLC candlesticks at 1-day intervals

#### FX trades OHLC

- **`fx_trades_ohlc_1m`** - OHLC candlesticks from trade executions at 1-minute intervals
- **`fx_trades_ohlc_1h`** - OHLC candlesticks from trade executions at 1-hour intervals

These views are continuously updated and optimized for dashboard and analytics queries on FX data.

### FX data volume

- **`market_data`**: Approximately **160 million rows** per day (order book snapshots)
- **`core_price`**: Approximately **73 million rows** per day (price updates across all ECNs and symbols)
- **`fx_trades`**: Approximately **5.1 million rows** per day (trade executions)

---

## Cryptocurrency trades (real)

The cryptocurrency dataset contains **real market data** streamed live from the OKX exchange using FeedHandler. These are actual executed trades, not simulated data.

### trades table

The `trades` table contains real cryptocurrency trade data. Each row represents an actual executed trade for a cryptocurrency pair.

#### Schema

```sql title="trades table structure"
CREATE TABLE 'trades' (
    symbol SYMBOL CAPACITY 256 CACHE,
    side SYMBOL CAPACITY 256 CACHE,
    price DOUBLE,
    amount DOUBLE,
    timestamp TIMESTAMP
) timestamp(timestamp) PARTITION BY DAY WAL;
```

#### Columns

- **`timestamp`** - Time when the trade was executed (designated timestamp)
- **`symbol`** - Cryptocurrency trading pair from the 12 tracked symbols (see list below)
- **`side`** - Trade side: **buy** or **sell**
- **`price`** - Execution price of the trade
- **`amount`** - Trade size (volume in base currency)

The table tracks **12 cryptocurrency pairs**: ADA-USDT, AVAX-USDT, BTC-USDT, DAI-USDT, DOT-USDT, ETH-BTC, ETH-USDT, LTC-USDT, SOL-BTC, SOL-USDT, UNI-USDT, XLM-USDT.

#### Sample data

```questdb-sql demo title="Recent cryptocurrency trades"
SELECT * FROM trades
LIMIT -10;
```

**Results:**

| symbol   | side | price   | amount     | timestamp                   |
| -------- | ---- | ------- | ---------- | --------------------------- |
| BTC-USDT | buy  | 85721.6 | 0.00045714 | 2025-12-18T19:31:11.203000Z |
| BTC-USDT | buy  | 85721.6 | 0.00045714 | 2025-12-18T19:31:11.203000Z |
| BTC-USDT | buy  | 85726.6 | 0.00001501 | 2025-12-18T19:31:11.206000Z |
| BTC-USDT | buy  | 85726.6 | 0.00001501 | 2025-12-18T19:31:11.206000Z |
| BTC-USDT | buy  | 85726.9 | 0.000887   | 2025-12-18T19:31:11.206000Z |
| BTC-USDT | buy  | 85726.9 | 0.000887   | 2025-12-18T19:31:11.206000Z |
| BTC-USDT | buy  | 85731.3 | 0.00004393 | 2025-12-18T19:31:11.206000Z |
| BTC-USDT | buy  | 85731.3 | 0.00004393 | 2025-12-18T19:31:11.206000Z |
| ETH-USDT | sell | 2827.54 | 0.006929   | 2025-12-18T19:31:11.595000Z |
| ETH-USDT | sell | 2827.54 | 0.006929   | 2025-12-18T19:31:11.595000Z |

### Cryptocurrency materialized views

The cryptocurrency dataset includes materialized views for aggregated trade data:

#### Trades aggregations

- **`trades_latest_1d`** - Latest trade data aggregated daily
- **`trades_OHLC_15m`** - OHLC candlesticks for cryptocurrency trades at 15-minute intervals

These views are continuously updated and provide faster query performance for cryptocurrency trade analysis.

### Cryptocurrency data volume

- **`trades`**: Approximately **3.7 million rows** per day (real cryptocurrency trades)

---

## Data retention

**FX tables** (`core_price` and `market_data`) use a **3-day TTL (Time To Live)**, meaning data older than 3 days is automatically removed. This keeps the demo instance responsive while providing sufficient recent data.

**Cryptocurrency trades table** has **no retention policy** and contains historical data dating back to **March 8, 2022**. This provides over 3 years of real cryptocurrency trade history for long-term analysis and backtesting.

## Using the demo data

You can run queries against both datasets directly on [demo.questdb.com](https://demo.questdb.io). Throughout the Cookbook, recipes using demo data will include a direct link to execute the query.



:::info Related Documentation
- [SYMBOL type](/docs/concepts/symbol/)
- [Arrays in QuestDB](/docs/query/datatypes/array/)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
- [Time-series aggregations](/docs/query/functions/aggregation/)
:::
