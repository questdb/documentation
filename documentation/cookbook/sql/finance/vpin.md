---
title: VPIN (Volume-synchronized Probability of Informed Trading)
sidebar_label: VPIN
description: Estimate the probability of informed trading using volume-bucketed order flow imbalance
---

VPIN measures the probability that informed traders are active in the market by looking at order flow imbalance across fixed-volume buckets. Unlike time-based metrics, VPIN synchronizes to volume — each bucket contains the same total traded quantity, so high-activity and low-activity periods are weighted equally.

## Problem

You want to detect when informed traders are likely active. Time-based imbalance metrics can be noisy — a 1-minute window during a quiet period captures very different market dynamics than a 1-minute window during a news event. VPIN normalizes by volume instead of time, giving a more consistent signal.

## Solution

Split the trade stream into fixed-volume buckets, compute the buy/sell imbalance within each bucket, then take a rolling average over the last N buckets:

```questdb-sql demo title="VPIN — volume-synchronized informed trading probability"
WITH bucketed AS (
    SELECT
        t.timestamp,
        t.symbol,
        t.side,
        t.price,
        t.quantity,
        floor(
            sum(t.quantity) OVER (PARTITION BY symbol ORDER BY timestamp)
            / 1000000
        ) AS vol_bucket
    FROM fx_trades t
    WHERE t.symbol = 'EURUSD'
        AND t.timestamp IN '$yesterday'
),
bucket_stats AS (
    SELECT
        symbol,
        vol_bucket,
        min(timestamp) AS bucket_start,
        max(timestamp) AS bucket_end,
        count() AS trade_count,
        sum(quantity) AS total_vol,
        sum(CASE WHEN side = 'buy' THEN quantity ELSE 0.0 END) AS buy_vol,
        sum(CASE WHEN side = 'sell' THEN quantity ELSE 0.0 END) AS sell_vol,
        abs(
            sum(CASE WHEN side = 'buy' THEN quantity ELSE 0.0 END)
            - sum(CASE WHEN side = 'sell' THEN quantity ELSE 0.0 END)
        ) / sum(quantity) AS bucket_imbalance
    FROM bucketed
    GROUP BY symbol, vol_bucket
)
SELECT
    symbol,
    vol_bucket,
    bucket_start,
    bucket_end,
    total_vol,
    buy_vol,
    sell_vol,
    bucket_imbalance,
    avg(bucket_imbalance) OVER (
        PARTITION BY symbol
        ORDER BY vol_bucket
        ROWS BETWEEN 49 PRECEDING AND CURRENT ROW
    ) AS vpin
FROM bucket_stats
ORDER BY vol_bucket;
```

## How it works

### Step 1 — Volume bucketing

The first CTE assigns a `vol_bucket` ID to each trade using a cumulative volume sum divided by the bucket size (1,000,000 units). All trades within the same bucket share the same ID. This is the key difference from time-based analysis — each bucket represents the same amount of market activity regardless of how long it took.

### Step 2 — Bucket imbalance

For each bucket, compute the absolute imbalance between buy and sell volume as a fraction of total volume. A bucket where 90% of the volume was buy-initiated has an imbalance of 0.8 (|0.9 − 0.1|). A perfectly balanced bucket has imbalance 0.0.

### Step 3 — Rolling VPIN

Average the bucket imbalance over a rolling window of 50 buckets. This is the VPIN estimate. The window size controls the trade-off between responsiveness and noise — fewer buckets react faster but are noisier.

## Interpreting results

VPIN ranges from 0 to 1:

- **VPIN near 0**: Order flow is balanced — roughly equal buying and selling. Low probability of informed trading.
- **VPIN near 0.5**: Moderate imbalance. Normal for trending markets.
- **VPIN above 0.7**: Heavily one-sided flow. Informed traders are likely dominating. This is the danger zone for market makers — consider widening quotes or reducing exposure.

Watch for **VPIN spikes** — sudden jumps from a stable baseline indicate a regime change, often preceding large price moves. The 2010 Flash Crash, for example, was preceded by elevated VPIN readings.

## Tuning parameters

- **Bucket size** (`1000000`): Adjust per symbol to get a reasonable number of buckets per day. For major FX pairs with billions in daily volume, 1M per bucket is fine. For less liquid instruments, reduce the bucket size.
- **Rolling window** (`50 buckets`): The original VPIN paper uses 50 buckets. Shorter windows (20–30) are more responsive but noisier. Longer windows (100+) give a smoother signal but lag.
- **Symbol filter**: VPIN is computed per symbol. The `WHERE t.symbol = 'EURUSD'` filter ensures volume bucketing doesn't mix symbols. To compute VPIN for multiple symbols, remove the filter — the `PARTITION BY symbol` in the window function handles separation.

## VPIN per ECN

Partition by ECN to see which venues carry more informed flow. An ECN with consistently higher VPIN is attracting (or routing) more informed traders:

```questdb-sql demo title="VPIN per ECN"
WITH bucketed AS (
    SELECT
        t.timestamp,
        t.symbol,
        t.ecn,
        t.side,
        t.quantity,
        floor(
            sum(t.quantity) OVER (PARTITION BY symbol, ecn ORDER BY timestamp)
            / 1000000
        ) AS vol_bucket
    FROM fx_trades t
    WHERE t.symbol = 'EURUSD'
        AND t.timestamp IN '$yesterday'
),
bucket_stats AS (
    SELECT
        symbol,
        ecn,
        vol_bucket,
        min(timestamp) AS bucket_start,
        max(timestamp) AS bucket_end,
        sum(quantity) AS total_vol,
        abs(
            sum(CASE WHEN side = 'buy' THEN quantity ELSE 0.0 END)
            - sum(CASE WHEN side = 'sell' THEN quantity ELSE 0.0 END)
        ) / sum(quantity) AS bucket_imbalance
    FROM bucketed
    GROUP BY symbol, ecn, vol_bucket
)
SELECT
    symbol,
    ecn,
    vol_bucket,
    bucket_start,
    bucket_end,
    total_vol,
    bucket_imbalance,
    avg(bucket_imbalance) OVER (
        PARTITION BY symbol, ecn
        ORDER BY vol_bucket
        ROWS BETWEEN 49 PRECEDING AND CURRENT ROW
    ) AS vpin
FROM bucket_stats
ORDER BY ecn, vol_bucket;
```

Compare VPIN time series across ECNs. An ECN that shows elevated VPIN while others stay flat is where informed flow is concentrated. Combine with the [ECN scorecard](ecn-scorecard.md) to cross-reference against markout-based toxicity — the two signals should align. When they diverge (high VPIN but flat markouts), the imbalance may be from correlated retail flow rather than informed trading.

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/overview/)
- [Aggressor volume imbalance recipe](aggressor-volume-imbalance.md)
- [ECN scorecard recipe](ecn-scorecard.md)
:::
