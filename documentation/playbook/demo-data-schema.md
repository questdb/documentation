---
title: Demo Data Schema
sidebar_label: Demo data schema
description: Schema and structure of the FX market data available on demo.questdb.io
---

The [QuestDB demo instance at demo.questdb.io](https://demo.questdb.io) contains simulated FX market data that you can query directly. This page describes the available tables and their structure.

## Overview

The demo instance provides two main tables representing different types of foreign exchange market data:

- **`core_price`** - Individual price updates from multiple ECNs (Electronic Communication Networks)
- **`market_data`** - Order book snapshots with bid/ask prices and volumes stored as 2D arrays

Additionally, several materialized views provide pre-aggregated data at different time intervals.

:::info Simulated Data
The FX data on the demo instance is **simulated**, not real market data. We fetch real reference prices from Yahoo Finance every few seconds for 30 currency pairs, but all order book levels and core price updates are generated algorithmically based on these reference prices. This provides realistic patterns and data volumes for testing queries without actual market data costs.
:::

## core_price Table

The `core_price` table contains individual FX price updates from various liquidity providers. Each row represents a bid/ask quote update for a specific currency pair from a specific ECN.

### Schema

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

### Columns

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

### Sample Data

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

## market_data Table

The `market_data` table contains order book snapshots for currency pairs. Each row represents a complete view of the order book at a specific timestamp, with bid and ask prices and volumes stored as 2D arrays.

### Schema

```sql title="market_data table structure"
CREATE TABLE 'market_data' (
    timestamp TIMESTAMP,
    symbol SYMBOL CAPACITY 16384 CACHE,
    bids DOUBLE[][],
    asks DOUBLE[][]
) timestamp(timestamp) PARTITION BY HOUR TTL 3 DAYS;
```

### Columns

- **`timestamp`** - Time of the order book snapshot (designated timestamp)
- **`symbol`** - Currency pair (e.g., EURUSD, GBPJPY)
- **`bids`** - 2D array containing bid prices and volumes: `[[price1, price2, ...], [volume1, volume2, ...]]`
- **`asks`** - 2D array containing ask prices and volumes: `[[price1, price2, ...], [volume1, volume2, ...]]`

The arrays are structured so that:
- `bids[1]` contains bid prices (descending order - highest first)
- `bids[2]` contains corresponding bid volumes
- `asks[1]` contains ask prices (ascending order - lowest first)
- `asks[2]` contains corresponding ask volumes

### Sample Query

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

## Materialized Views

Several materialized views provide pre-aggregated data at different time intervals, optimized for dashboard and analytics queries:

### Best Bid/Offer (BBO) Views

- **`bbo_1s`** - Best bid and offer aggregated every 1 second
- **`bbo_1m`** - Best bid and offer aggregated every 1 minute
- **`bbo_1h`** - Best bid and offer aggregated every 1 hour
- **`bbo_1d`** - Best bid and offer aggregated every 1 day

### Core Price Aggregations

- **`core_price_1s`** - Core prices aggregated every 1 second
- **`core_price_1d`** - Core prices aggregated every 1 day

### Market Data OHLC

- **`market_data_ohlc_1m`** - Open, High, Low, Close candlesticks at 1-minute intervals
- **`market_data_ohlc_15m`** - OHLC candlesticks at 15-minute intervals
- **`market_data_ohlc_1d`** - OHLC candlesticks at 1-day intervals

These materialized views are continuously updated and provide faster query performance for common time-series aggregations.

## Data Retention and Volume

Both tables use a **3-day TTL (Time To Live)**, meaning data older than 3 days is automatically removed. This keeps the demo instance responsive while providing sufficient data for testing and examples.

**Data volume per day:**
- **`market_data`**: Approximately **160 million rows** per day (order book snapshots)
- **`core_price`**: Approximately **73 million rows** per day (price updates across all ECNs and symbols)

These volumes provide realistic scale for testing time-series queries and aggregations.

## Using the Demo Data

You can run queries against this data directly on [demo.questdb.io](https://demo.questdb.io). Throughout the Playbook, recipes using demo data will include a direct link to execute the query.

:::tip
The demo instance is read-only. For testing write operations (INSERT, UPDATE, DELETE), you'll need to run QuestDB locally. See the [Quick Start guide](/docs/quick-start/) for installation instructions.
:::

:::info Related Documentation
- [SYMBOL type](/docs/concept/symbol/)
- [Arrays in QuestDB](/docs/concept/array/)
- [Designated timestamp](/docs/concept/designated-timestamp/)
- [Time-series aggregations](/docs/reference/function/aggregation/)
:::
