# Order book analytics using arrays

In the following examples, we'll use the table schema below. The order book is
stored in a 2D array with two rows: the top row are the prices, and the bottom
row are the volumes at each price point.

```questdb-sql
CREATE TABLE market_data (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  bids DOUBLE[][],
  asks DOUBLE[][]
) TIMESTAMP(timestamp) PARTITION BY HOUR;
```

## Basic order book analytics

### What is the bid-ask spread at any moment?

```questdb-sql
SELECT timestamp, spread(bids[1][1], asks[1][1]) spread
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', ARRAY[ [9.3, 9.2], [0, 0] ], ARRAY[ [10.1, 10.2], [0, 0] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', ARRAY[ [9.7, 9.4], [0, 0] ], ARRAY[ [10.3, 10.5], [0, 0] ]);
```

|     timestamp       | spread |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 0.8    |
| 2025-07-01T12:00:01 | 0.6    |

### How much volume is available within 1% of the best price?

```questdb-sql
DECLARE
    @prices := asks[1],
    @volumes := asks[2],
    @best_price := @prices[1],
    @multiplier := 1.01,
    @target_price := @multiplier *  @best_price,
    @relevant_volume_levels := @volumes[1:insertion_point(@prices, @target_price)]
SELECT timestamp, array_sum(@relevant_volume_levels) total_volume
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', NULL, ARRAY[ [10.00, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', NULL, ARRAY[ [20.00, 20.02, 20.04, 20.10, 20.12, 20.14], [1.0, 5, 3, 2, 8, 10] ]);
```

|     timestamp       | volume |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 50.0   |
| 2025-07-01T12:00:01 | 29.0   |

## Liquidity-driven execution

### How much of a large order can be executed without moving the price more than a set amount?

Find the order book level at which the price passes a threshold, and then sum
the sizes up to that level.

```questdb-sql
DECLARE
  @prices := asks[1],
  @volumes := asks[2],
  @best_price := @prices[1],
  @price_delta := 0.1,
  @target_price := @best_price + @price_delta,
  @relevant_volumes := @volumes[1:insertion_point(@prices, @target_price)]
SELECT timestamp, array_sum(@relevant_volumes) volume
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', NULL, ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', NULL, ARRAY[ [10.0, 10.10, 10.12, 10.14, 10.16, 10.18], [1.0, 5, 3, 2, 8, 10] ]);
```

|     timestamp       | volume |
| ------------------- | ------ |
| 2025-07-01T12:00:00 | 50.0   |
| 2025-07-01T12:00:01 | 6.0    |

### What price level will a buy order for the given volume reach?

```questdb-sql
DECLARE
  @prices := asks[1],
  @volumes := asks[2],
  @target_volume := 30.0
SELECT
  timestamp,
  array_cum_sum(@volumes) cum_volumes,
  insertion_point(cum_volumes, @target_volume, true) target_level,
  @prices[target_level] price
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', NULL, ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0, 15, 13, 12, 18, 20] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', NULL, ARRAY[ [10.0, 10.02, 10.04, 10.10, 10.12, 10.14], [10.0,  5,  3, 12, 18, 20] ]);
```

|     timestamp       |            cum_volumes        | target_level | price |
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
  timestamp, bids[2, 1] / asks[2, 1] imbalance
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', ARRAY[ [0.0,0], [20.0, 25] ], ARRAY[ [0.0,0], [10.0, 15] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', ARRAY[ [0.0,0], [14.0, 45] ], ARRAY[ [0.0,0], [15.0,  2] ]);
```

|     timestamp       | imbalance |
| ------------------- | --------- |
| 2025-07-01T12:00:00 | 2.0       |
| 2025-07-01T12:00:01 | 0.93      |

### Cumulative imbalance (Top 3 Levels)

```questdb-sql
DECLARE
  @bid_volumes := bids[2],
  @ask_volumes := asks[2]
SELECT
  timestamp,
  array_sum(@bid_volumes[1:4]) bid_vol,
  array_sum(@ask_volumes[1:4]) ask_vol,
  bid_vol / ask_vol ratio
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', ARRAY[ [0.0,0,0,0], [20.0, 25, 23, 22] ], ARRAY[ [0.0,0,0,0], [10.0, 15, 13, 12] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', ARRAY[ [0.0,0,0,0], [14.0, 45, 22,  5] ], ARRAY[ [0.0,0,0,0], [15.0,  2, 20, 23] ]);
```

|     timestamp       | bid_vol | ask_vol | ratio |
| ------------------- | ------- | ------- | ----- |
| 2025-07-01T12:00:00 | 68.0    | 38.0    | 1.79  |
| 2025-07-01T12:00:01 | 81.0    | 37.0    | 2.19  |

### Detect quote stuffing/fading (Volume dropoff)

Detect where the order book thins out rapidly after the first two levels. This
signals lack of depth (fading) or fake orders (stuffing).

```questdb-sql
DECLARE
  @volumes := asks[2],
  @dropoff_ratio := 3.0
SELECT * FROM (
  SELECT
    timestamp,
    array_avg(@volumes[1:3]) top,
    array_avg(@volumes[3:6]) deep
  FROM market_data WHERE symbol='EURUSD')
WHERE top > @dropoff_ratio * deep;
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', NULL, ARRAY[ [0.0,0,0,0,0,0], [20.0, 15, 13, 12, 18, 20] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', NULL, ARRAY[ [0.0,0,0,0,0,0], [20.0, 25,  3,  7,  5,  2] ]);
```

|     timestamp       | top  | deep |
| ------------------- | ---- | ---- |
| 2025-07-01T12:00:01 | 22.5 | 5.0  |

### Detect sudden bid/ask drop

Look for cases where the top bid/ask volume dropped compared to the prior
snapshot — potential order withdrawal ahead of adverse movement.

```questdb-sql
DECLARE
  @top_bid_volume := bids[2, 1],
  @top_ask_volume := asks[2, 1],
  @drop_ratio := 1.5
SELECT * FROM (
  SELECT
    timestamp,
    lag(@top_bid_volume) OVER () prev_bid_vol,
    @top_bid_volume curr_bid_vol,
    lag(@top_ask_volume) OVER () prev_ask_vol,
    @top_ask_volume curr_ask_vol
  FROM market_data WHERE symbol='EURUSD')
WHERE prev_bid_vol > curr_bid_vol * @drop_ratio OR prev_ask_vol > curr_ask_vol * @drop_ratio;
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', ARRAY[ [0.0], [10.0] ], ARRAY[ [0.0], [10.0] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', ARRAY[ [0.0], [ 9.0] ], ARRAY[ [0.0], [ 9.0] ]),
  ('2025-07-01T12:00:02Z', 'EURUSD', ARRAY[ [0.0], [ 8.0] ], ARRAY[ [0.0], [ 4.0] ]),
  ('2025-07-01T12:00:03Z', 'EURUSD', ARRAY[ [0.0], [ 4.0] ], ARRAY[ [0.0], [ 4.0] ]);
```

|     timestamp       | prev_bid_vol | curr_bid_vol | prev_ask_vol | curr_ask_vol |
| ------------------- | ------------ | ------------ | ------------ | ------------ |
| 2025-07-01T12:00:02 | 9.0          | 8.0          | 9.0          | 4.0          |
| 2025-07-01T12:00:03 | 8.0          | 4.0          | 4.0          | 4.0          |

### Price-weighted volume imbalance

For each level, calculate the deviation from the mid price (midpoint between
best bid and best ask), and weight it by the volume at that level. This shows us
whether there's stronger buying or selling interest.

```questdb-sql
DECLARE
  @bid_prices := bids[1],
  @bid_volumes := bids[2],
  @ask_prices := asks[1],
  @ask_volumes := asks[2],
  @best_bid_price := bids[1, 1],
  @best_ask_price := asks[1, 1]
SELECT
  timestamp,
  round((@best_bid_price + @best_ask_price) / 2, 2) mid_price,
  (mid_price - @bid_prices) * @bid_volumes weighted_bid_pressure,
  (@ask_prices - mid_price) * @ask_volumes weighted_ask_pressure
FROM market_data WHERE symbol='EURUSD';
```

#### Sample data and result

```questdb-sql
INSERT INTO market_data VALUES
  ('2025-07-01T12:00:00Z', 'EURUSD', ARRAY[ [5.0, 5.1], [10.0, 20] ], ARRAY[ [6.0, 6.1], [15.0, 25] ]),
  ('2025-07-01T12:00:01Z', 'EURUSD', ARRAY[ [5.1, 5.2], [20.0, 25] ], ARRAY[ [6.2, 6.4], [20.0,  9] ]);
```

|     timestamp       | mid_price | weighted_bid_pressure | weighted_ask_pressure |
| ------------------- | --------- | --------------------- | --------------------- |
| 2025-07-01T12:00:00 | 5.5       | [5.0,  8.0]           | [7.5, 15.0]           |
| 2025-07-01T12:00:01 | 5.65      | [11.0, 11.25]         | [11.0, 6.75]          |
