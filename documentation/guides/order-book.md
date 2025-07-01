# Order book analytics using arrays

In the following examples, we'll use the table schema below. The order book is
stored in a 2D array with two rows: the top row are the prices, and the bottom
row are the volumes at each price point.

```sql
CREATE TABLE fx_order_book (
    ts TIMESTAMP,
    symbol SYMBOL,
    bids DOUBLE[][],  -- bids[1]: prices, bids[2]: volumes
    asks DOUBLE[][]
);
```

## Basic order book analytics

### What is the bid-ask spread at any moment?

```sql
SELECT ts, symbol, asks[1][1] - bids[1][1] FROM fx_order_book
```

### How much volume is available within 1% of the best price?

```sql
SELECT array_sum(
    asks[2, 1:insertion_point(asks[1], 1.01 * asks[1, 1])]
) volume FROM fx_order_book
```

## Liquidity-driven execution

**How much of a large order can be executed without moving the price more than a
set amount?**

Find the order book level at which the price passes a threshold, and then sum
the sizes up to that level.

```sql
SELECT array_sum(
  asks[2, 1:insertion_point(asks[1], asks[1,1] + 5.0)]) volume
FROM fx_order_book
```

**What price level will a buy order for the given volume reach?**

```sql
WITH
    q1 AS (SELECT asks, array_cum_sum(asks[2]) cum_volumes FROM fx_order_book),
    q2 AS (SELECT asks, cum_volumes, insertion_point(cum_volumes, 30.0, true) target_level FROM q1)
SELECT cum_volumes, target_level, asks[1, target_level] price
FROM q2
```

## Order book imbalance

### Imbalance at the top level

What is the ratio of bid volume to ask volume at the top level of the order
book?

This indicates pressure in one direction (e.g. buyers heavily outweighing
sellers at the top of the book).

```sql
SELECT
  bids[2, 1] / asks[2, 1]
FROM fx_order_book
```

### Cumulative imbalance (Top 3 Levels)

```sql
WITH q1 AS (
    SELECT
        array_sum(asks[2, 1:4]) ask_vol,
        array_sum(bids[2, 1:4]) bid_vol
    FROM fx_order_book
)
SELECT ask_vol, bid_vol, bid_vol / ask_vol ratio
FROM q1
```

### Detect quote stuffing/fading (Volume dropoff)

Detect where the order book thins out rapidly after the first two levels. This
signals lack of depth (fading) or fake orders (stuffing).

```sql
SELECT
  avg(asks[2, 1:3]) top,
  avg(asks[2, 3:6]) deep
FROM fx_order_book
WHERE top > 3 * deep
```

### Detect sudden bid/ask drop

Look for cases where the top bid/ask volume dropped compared to the prior
snapshot — potential order withdrawal ahead of adverse movement.

```sql
SELECT * FROM (
    SELECT
        t2.ts,
        t2.symbol,
        t1.asks[2, 1] prev_ask_vol,
        t2.asks[2, 1] curr_ask_vol,
        t1.bids[2, 1] prev_bid_vol,
        t2.bids[2, 1] curr_bid_vol
    FROM fx_order_book t1 JOIN fx_order_book t2
    ON t1.symbol = t2.symbol AND t2.ts = t1.ts + 1_000_000)
WHERE prev_bid_vol > curr_bid_vol * 1.5 OR prev_ask_vol > curr_ask_vol * 1.5
```

### Price-weighted volume imbalance

For each level, calculate the deviation from the mid price (midpoint between
best bid and best ask), and weight it by the volume at that level. This shows us
whether there's stronger buying or selling interest.

```sql
WITH q1 AS (
    SELECT *, round((asks[1][1] + bids[1][1]) / 2, 2) mid_price
    FROM fx_order_book
)
SELECT
    ts, symbol,
    mid_price,
    (asks[1] - mid_price) * asks[2] weighted_ask_pressure,
    (mid_price - bids[1]) * bids[2] weighted_bid_pressure
FROM q1
```

### Detect Price Wall

We want to find an outlier in the record book's volumes.

**Is there a level at which there's much more volume than average volume at all
levels?**

```sql
SELECT
  asks[2][ vol -> vol > 5*array_avg(asks[2]) ]
FROM fx_order_book
```

LIMITATION: the above syntax does not give us the index (i.e., the order book
level) at which an outlier was found.

## Place a smart limit order at hidden liquidity gaps

Identify weak support/resistance and use it to place the limit order.

Query: Detect a price level where volume sharply drops from the previous one.

```sql
SELECT
  asks[1] AS price,
  asks[2] AS volume,
  shift(ask_volume, 1) AS volume_shr,
  transpose(ARRAY[price, volume, volume / volume_shr]) AS with_drop_ratio,
  with_drop_ratio[ x -> x[3] > 2 ] AS large_drops
FROM fx_order_book
WHERE dim_length(large_drops, 1) > 0
```
