# Order book analytics using arrays

In the following examples, we'll use the table schema below. It is a bare-bones
simplification of a realistic table, where we omit the otherwise essential
columns such as the symbol of the financial instrument. The goal is to
demonstrate the essential aspects of the analytical queries.

The order book is stored in a 2D array with two rows: the top row are the
prices, and the bottom row are the volumes at each price point.

```questdb-sql
CREATE TABLE order_book (
  ts TIMESTAMP,
  asks DOUBLE[][],
  bids DOUBLE[][]
) TIMESTAMP(ts) PARTITION BY HOUR;
```

## Basic order book analytics

### What is the bid-ask spread at any moment?

```questdb-sql
SELECT ts, asks[1][1] - bids[1][1] spread FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [10.1, 10.2], [0, 0] ], ARRAY[ [9.3, 9.2], [0, 0] ]),
  ('2025-07-01T12:00:01Z', ARRAY[ [10.3, 10.5], [0, 0] ], ARRAY[ [9.7, 9.4], [0, 0] ]);
```

|         ts          | spread |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 0.8    |
| 2025-07-01T12:00:01 | 0.6    |

### How much volume is available within 1% of the best price?

```questdb-sql
SELECT ts, array_sum(
    asks[2, 1:insertion_point(asks[1], 1.01 * asks[1, 1])]
) volume FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [10.00, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ], NULL),
  ('2025-07-01T12:00:01Z', ARRAY[ [20.00, 20.02, 20.04, 20.10, 20.12, 20.14], [1.0, 5, 3, 2, 8, 10] ], NULL);
```

|         ts          | volume |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 50.0   |
| 2025-07-01T12:00:01 | 29.0   |

## Liquidity-driven execution

### How much of a large order can be executed without moving the price more than a set amount?

Find the order book level at which the price passes a threshold, and then sum
the sizes up to that level.

```questdb-sql
SELECT ts, array_sum(
  asks[2, 1:insertion_point(asks[1], asks[1,1] + 0.1)]) volume
FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ], NULL),
  ('2025-07-01T12:00:01Z', ARRAY[ [10.0, 10.10, 10.12, 10.14, 10.16, 10.18], [1.0, 5, 3, 2, 8, 10] ], NULL);
```

|         ts          | volume |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 50.0   |
| 2025-07-01T12:00:01 | 6.0    |

### What price level will a buy order for the given volume reach?

```questdb-sql
SELECT
  ts,
  array_cum_sum(asks[2]) cum_volumes,
  insertion_point(cum_volumes, 30.0, true) target_level,
  asks[1, target_level] price
FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ], NULL),
  ('2025-07-01T12:00:01Z', ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0,  5,  3, 12, 18, 20] ], NULL);
```

|         ts          |            cum_volumes        | target_level | price |
| ------------------- | ----------------------------- | ------------ | ----- |
| 2025-07-01T12:00:00 | [10.0, 25.0, 38.0, 50.0, ...] | 3            | 10.04 |
| 2025-07-01T12:00:01 | [10.0, 15.0, 18.0, 30.0, ...] | 4            | 10.10 |

## Order book imbalance

### Imbalance at the top level

What is the ratio of bid volume to ask volume at the top level of the order
book?

This indicates pressure in one direction (e.g. buyers heavily outweighing
sellers at the top of the book).

```questdb-sql
SELECT
  ts, bids[2, 1] / asks[2, 1] imbalance
FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [0.0,0], [10.0, 15] ], ARRAY[ [0.0,0], [20.0, 25] ]),
  ('2025-07-01T12:00:01Z', ARRAY[ [0.0,0], [15.0,  2] ], ARRAY[ [0.0,0], [14.0, 45] ]);
```

|         ts          | imbalance |
| ------------------- | --------- |
| 2025-07-01T12:00:00 | 2.0       |
| 2025-07-01T12:00:01 | 0.93      |

### Cumulative imbalance (Top 3 Levels)

```questdb-sql
SELECT
  array_sum(asks[2, 1:4]) ask_vol,
  array_sum(bids[2, 1:4]) bid_vol,
  bid_vol / ask_vol ratio
FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [0.0,0,0,0], [10.0, 15, 13, 12] ], ARRAY[ [0.0,0,0,0], [20.0, 25, 23, 22] ]),
  ('2025-07-01T12:00:01Z', ARRAY[ [0.0,0,0,0], [15.0,  2, 20, 23] ], ARRAY[ [0.0,0,0,0], [14.0, 45, 22,  5] ]);
```

|         ts          | ask_vol | bid_vol | ratio |
| ------------------- | ------- | ------- | ----- |
| 2025-07-01T12:00:00 | 38.0    | 68.0    | 1.79  |
| 2025-07-01T12:00:01 | 37.0    | 81.0    | 2.19  |

### Detect quote stuffing/fading (Volume dropoff)

Detect where the order book thins out rapidly after the first two levels. This
signals lack of depth (fading) or fake orders (stuffing).

```questdb-sql
SELECT * FROM (
  SELECT
    ts,
    array_avg(asks[2, 1:3]) top,
    array_avg(asks[2, 3:6]) deep
  FROM order_book)
WHERE top > 3 * deep;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [0.0,0,0,0,0,0], [20.0, 15, 13, 12, 18, 20] ], NULL),
  ('2025-07-01T12:00:01Z', ARRAY[ [0.0,0,0,0,0,0], [20.0, 25,  3,  7,  5,  2] ], NULL);
```

|         ts          | top  | deep |
| ------------------- | ---- | ---- |
| 2025-07-01T12:00:01 | 22.5 | 5.0  |

### Detect sudden bid/ask drop

Look for cases where the top bid/ask volume dropped compared to the prior
snapshot — potential order withdrawal ahead of adverse movement.

```questdb-sql
SELECT * FROM (
  SELECT
    ts ts,
    lag(asks[2, 1]) OVER () prev_ask_vol,
    asks[2, 1] curr_ask_vol,
    lag(bids[2, 1]) OVER () prev_bid_vol,
    bids[2, 1] curr_bid_vol
  FROM order_book)
WHERE prev_bid_vol > curr_bid_vol * 1.5 OR prev_ask_vol > curr_ask_vol * 1.5;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [0.0], [10.0] ], ARRAY[ [0.0], [10.0] ]),
  ('2025-07-01T12:00:01Z', ARRAY[ [0.0], [ 9.0] ], ARRAY[ [0.0], [ 9.0] ]),
  ('2025-07-01T12:00:02Z', ARRAY[ [0.0], [ 4.0] ], ARRAY[ [0.0], [ 8.0] ]),
  ('2025-07-01T12:00:03Z', ARRAY[ [0.0], [ 4.0] ], ARRAY[ [0.0], [ 4.0] ]);
```

|         ts          | prev_ask_vol | curr_ask_vol | prev_bid_vol | curr_bid_vol |
| ------------------- | ------------ | ------------ | ------------ | ------------ |
| 2025-07-01T12:00:02 | 9.0          | 4.0          | 9.0          | 8.0          |
| 2025-07-01T12:00:03 | 4.0          | 4.0          | 8.0          | 4.0          |

### Price-weighted volume imbalance

For each level, calculate the deviation from the mid price (midpoint between
best bid and best ask), and weight it by the volume at that level. This shows us
whether there's stronger buying or selling interest.

```questdb-sql
SELECT
  round((asks[1][1] + bids[1][1]) / 2, 2) mid_price,
  (asks[1] - mid_price) * asks[2] weighted_ask_pressure,
  (mid_price - bids[1]) * bids[2] weighted_bid_pressure
FROM order_book;
```

#### Sample data and result

```questdb-sql
INSERT INTO order_book VALUES
  ('2025-07-01T12:00:00Z', ARRAY[ [6.0, 6.1], [15.0, 25] ], ARRAY[ [5.0, 5.1], [10.0, 20] ]),
  ('2025-07-01T12:00:01Z', ARRAY[ [6.2, 6.4], [20.0,  9] ], ARRAY[ [5.1, 5.2], [20.0, 25] ]);
```

|         ts          | mid_price | weighted_ask_pressure | weighted_bid_pressure |
| ------------------- | --------- | --------------------- | --------------------- |
| 2025-07-01T12:00:00 | 5.5       | [ 7.5, 15.0]          | [ 5.0,  8.0]          |
| 2025-07-01T12:00:01 | 5.65      | [11.0, 6.75]          | [11.0, 11.25]         |

### Detect Price Wall

:::note

This section is still work in progress. Array filtering is coming up soon.

:::

### Is there a level at which there's much more volume than average volume at all levels?

We want to find an outlier in the record book's volumes.

```sql
SELECT
  asks[2][ vol -> vol > 5 * array_avg(asks[2]) ]
FROM order_book
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
FROM order_book
WHERE dim_length(large_drops, 1) > 0
```
