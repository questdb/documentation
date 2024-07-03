---
title: Finance functions
sidebar_label: Finance
description: Finance functions reference documentation.
---

This page describes functions specific to the financial services domain.

## l2price

Trade price calculation.

`l2price(target_quantity, quantity_1, price_1, quantity_2, price_2, ..., quantity_n, price_n)`

Consider `quantity_1`, `price_1`, `quantity_2`, `price_2`, ..., `quantity_n`, `price_n` to be either
side of an order book with `n` price levels. Then, the return value of the function is the average trade price of a market order executed with the size of `target_quantity` against the book.

Let's take the below order book as an example.

| Size | Bid   | Ask   | Size |
|------|-------|-------|------|
| 10   | 14.10 | 14.50 | 14   |
| 17   | 14.00 | 14.60 | 16   |
| 19   | 13.90 | 14.80 | 23   |
| 21   | 13.70 | 15.10 | 12   |
| 18   | 13.40 |       |      |

A _buy market order_ with the size of 50 would wipe out the first two price levels of
the _Ask_ side of the book, and would also trade on the third level.

The full price of the trade: `14 * $14.50 + 16 * $14.60 + (50 - 14 - 16) * $14.80 = $732.6`

The average price of the instrument in this trade: `$732.6 / 50 = $14.652`

This average trade price is the output of the function when executed with the parameters taken from
the above example:

```questdb-sql
select l2price(50, 14, 14.50, 16, 14.60, 23, 14.80, 12, 15.10);
```

| l2price   |
|-----------|
| 14.652    |

### Parameters

The function takes a `target quantity`, and a variable number of `quantity`/`price` pairs. Each
represents a price level of the order book.

Each parameter is expected to be a double, or convertible to double (float, long, int, short, byte).

- `target_quantity`: The size of a hypothetical market order to be filled.
- `quantity*`: The number of instruments available at the corresponding price levels.
- `price*`: Price levels of the order book.

### Return value

The function returns with a `double`, representing the average trade price.

Returns null if the price is not calculable. For example, if the target quantity cannot be filled,
or there is incomplete data in the set (nulls).

### Examples

Test data:

```questdb-sql
CREATE TABLE order_book (
  ts TIMESTAMP,
  bidSize1 DOUBLE, bid1 DOUBLE, bidSize2 DOUBLE, bid2 DOUBLE, bidSize3 DOUBLE, bid3 DOUBLE,
  askSize1 DOUBLE, ask1 DOUBLE, askSize2 DOUBLE, ask2 DOUBLE, askSize3 DOUBLE, ask3 DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO order_book VALUES
  ('2024-05-22T09:40:15.006000Z', 40, 14.10, 47, 14.00, 39, 13.90, 54, 14.50, 36, 14.60, 23, 14.80),
  ('2024-05-22T09:40:15.175000Z', 42, 14.00, 45, 13.90, 35, 13.80, 16, 14.30, 57, 14.50, 30, 14.60),
  ('2024-05-22T09:40:15.522000Z', 36, 14.10, 38, 14.00, 31, 13.90, 30, 14.40, 47, 14.50, 34, 14.60);
```

Trading price of instrument when buying 100:

```questdb-sql
SELECT ts, L2PRICE(100, askSize1, ask1, askSize2, ask2, askSize3, ask3) AS buy FROM order_book;
```

| ts                          | buy             |
|-----------------------------|-----------------|
| 2024-05-22T09:40:15.006000Z | 14.565999999999 |
| 2024-05-22T09:40:15.175000Z | 14.495          |
| 2024-05-22T09:40:15.522000Z | 14.493          |


Trading price of instrument when selling 100:

```questdb-sql
SELECT ts, L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS sell FROM order_book;
```
| ts                          | sell   |
|-----------------------------|--------|
| 2024-05-22T09:40:15.006000Z | 14.027 |
| 2024-05-22T09:40:15.175000Z | 13.929 |
| 2024-05-22T09:40:15.522000Z | 14.01  |

The spread for target quantity 100:

```questdb-sql
SELECT ts, L2PRICE(100, askSize1, ask1, askSize2, ask2, askSize3, ask3)
  - L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS spread FROM order_book;
```

| ts                          | spread         |
|-----------------------------|----------------|
| 2024-05-22T09:40:15.006000Z | 0.538999999999 |
| 2024-05-22T09:40:15.175000Z | 0.565999999999 |
| 2024-05-22T09:40:15.522000Z | 0.483          |

## vwap

`vwap(price, quantity)` - Calculates the volume-weighted average price (VWAP)
based on the given price and quantity columns. This is a handy replacement for
the `sum(price * quantity) / sum(quantity)` expression.

### Parameters

- `price` is any numeric price value.
- `quantity` is any numeric quantity value.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT vwap(x, x)
FROM (SELECT x FROM long_sequence(100));
```

| vwap |
| :--- |
| 67   |
