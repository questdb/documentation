---
title: Order Flow Imbalance (OFI)
sidebar_label: Order flow imbalance
description: Measure top-of-book buying and selling pressure from L1 quote updates using the Cont-Kukanov-Stoikov definition.
---

Quantify net buying pressure at the top of the book from quote-level updates. Order Flow Imbalance (OFI), introduced by Cont, Kukanov, and Stoikov (2014), captures the signed contribution of every L1 quote change (bid arrivals, cancellations, and resizing) into a single number per venue or per symbol.

Unlike trade-based imbalance metrics ([aggressor volume imbalance](aggressor-volume-imbalance.md), [VPIN](vpin.md)), OFI is computed from **quotes, not trades**. It reacts to liquidity providers reshaping the book before any execution happens, making it a leading indicator of short-term price changes on most liquid instruments.

## Problem

You want to measure top-of-book pressure tick by tick, separating buy-side intent (rising bids, growing bid size, ask cancellations) from sell-side intent. Trade-based metrics miss everything that happens between executions. Limit order placement and cancellation at the best price are often the earliest signal of where the market is about to move.

## Solution

For each consecutive pair of quote updates on a given venue, compute the signed change at the best bid and the best ask, then take their difference. Sum the per-event contributions into time buckets.

```questdb-sql demo title="OFI per ECN, bucketed at 1 second"
WITH quote_lag AS (
    SELECT
        timestamp,
        symbol,
        ecn,
        bid_price, bid_volume, ask_price, ask_volume,
        lag(bid_price)  OVER w AS prev_bid_price,
        lag(bid_volume) OVER w AS prev_bid_volume,
        lag(ask_price)  OVER w AS prev_ask_price,
        lag(ask_volume) OVER w AS prev_ask_volume
    FROM core_price
    WHERE symbol = 'EURUSD'
      AND timestamp IN '$yesterday'
    WINDOW w AS (PARTITION BY symbol, ecn ORDER BY timestamp)
),
contributions AS (
    SELECT
        timestamp,
        symbol,
        ecn,
        CASE
            WHEN bid_price > prev_bid_price THEN bid_volume
            WHEN bid_price < prev_bid_price THEN -prev_bid_volume
            ELSE bid_volume - prev_bid_volume
        END
        -
        CASE
            WHEN ask_price < prev_ask_price THEN ask_volume
            WHEN ask_price > prev_ask_price THEN -prev_ask_volume
            ELSE ask_volume - prev_ask_volume
        END AS ofi_event
    FROM quote_lag
    WHERE prev_bid_price IS NOT NULL
)
SELECT
    timestamp,
    symbol,
    ecn,
    sum(ofi_event) AS ofi
FROM contributions
SAMPLE BY 1s;
```

## How it works

### Step 1: Lag each quote against its previous update

The `quote_lag` CTE attaches the previous bid/ask price and volume to every row, partitioned by `symbol` and `ecn` so each venue is compared against its own history. The named window `w` is reused across the four `lag` calls to keep the query readable.

### Step 2: Apply the OFI event rule

Each row contributes a signed value derived from how the best bid and best ask changed since the last quote, following Cont-Kukanov-Stoikov.

**Bid side:**

- Bid price went up: a buyer raised the best bid. The full new size enters as positive pressure.
- Bid price went down: the previous bid was pulled or executed away. The full old size leaves as negative pressure.
- Bid price unchanged: it is a size update. The contribution is `bid_volume - prev_bid_volume`.

**Ask side** mirrors the bid logic with inverted price comparisons. A lower ask is buy pressure (sellers moving toward buyers). A higher ask is sell pressure.

The event-level OFI is `bid contribution − ask contribution`. Positive means net buying pressure, negative means net selling pressure.

### Step 3: Aggregate into time buckets

`SAMPLE BY 1s` sums the per-event contributions into one-second buckets. The bucket size is a tuning knob: it should match the horizon over which you want to relate OFI to price moves. Use 100ms (`SAMPLE BY 100T`) for microstructure work, or longer windows for slower strategies.

## Interpreting results

Sign indicates direction, magnitude indicates intensity. Across a sample of healthy quote flow, OFI should oscillate around zero with the residual being the predictive signal. A persistent one-sided OFI over many buckets indicates a directional regime, either a genuine trend or a market maker stepping back from one side of the book.

OFI typically leads same-bucket mid-price changes on liquid pairs. To validate that your data and parameters produce a usable signal, compute the correlation between OFI and the mid-price change over the same bucket. On real markets this is typically 0.3 to 0.7 for major FX pairs.

## Consolidated OFI across venues

To get a single OFI series across all ECNs, wrap the per-ECN events and sum:

```questdb-sql demo title="Consolidated OFI across ECNs"
WITH quote_lag AS (
    SELECT
        timestamp,
        symbol,
        ecn,
        bid_price, bid_volume, ask_price, ask_volume,
        lag(bid_price)  OVER w AS prev_bid_price,
        lag(bid_volume) OVER w AS prev_bid_volume,
        lag(ask_price)  OVER w AS prev_ask_price,
        lag(ask_volume) OVER w AS prev_ask_volume
    FROM core_price
    WHERE symbol = 'EURUSD'
      AND timestamp IN '$yesterday'
    WINDOW w AS (PARTITION BY symbol, ecn ORDER BY timestamp)
),
contributions AS (
    SELECT
        timestamp,
        symbol,
        CASE
            WHEN bid_price > prev_bid_price THEN bid_volume
            WHEN bid_price < prev_bid_price THEN -prev_bid_volume
            ELSE bid_volume - prev_bid_volume
        END
        -
        CASE
            WHEN ask_price < prev_ask_price THEN ask_volume
            WHEN ask_price > prev_ask_price THEN -prev_ask_volume
            ELSE ask_volume - prev_ask_volume
        END AS ofi_event
    FROM quote_lag
    WHERE prev_bid_price IS NOT NULL
)
SELECT timestamp, symbol, sum(ofi_event) AS ofi
FROM contributions
SAMPLE BY 1s;
```

This treats each ECN's L1 as an independent book and sums their pressures. It is a good proxy for aggregate flow, but it is not the same as OFI on a virtual consolidated top-of-book (which would require building the best bid/ask across venues first, then computing OFI on that series).

## Tuning parameters

- **Bucket size** (`SAMPLE BY 1s`): match this to your prediction horizon. The correlation with mid-change is highest when the OFI bucket and the return horizon are aligned.
- **Symbol filter**: OFI is computed per `(symbol, ecn)`. The `WHERE` clause keeps the example fast on the demo. Drop it to compute OFI across all symbols at once. The `PARTITION BY symbol, ecn` in the window handles separation.
- **Time window**: `$yesterday` covers a full session. For intraday work, narrow to a specific hour to keep result sizes manageable.

:::info Related documentation
- [Window functions](/docs/query/functions/window-functions/overview/)
- [Aggressor volume imbalance recipe](aggressor-volume-imbalance.md)
- [VPIN recipe](vpin.md)
- [Cont, Kukanov & Stoikov (2014) - The Price Impact of Order Book Events](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1712822)
:::
