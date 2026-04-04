---
title: Finance functions
sidebar_label: Finance
description: Market data and financial functions including l2price, mid, spread_bps, TWAP, VWAP, and wmid for order book, execution benchmarking, and pricing analysis.
---

This page describes functions specific to the financial services domain.

## l2price

Level-2 trade price calculation.

`l2price(target_size, size_array, price_array)`

`l2price(target_size, size_1, price_1, size_2, price_2, ..., size_n, price_n)`

Consider `size_1`, `price_1`, `size_2`, `price_2`, ..., `size_n`,
`price_n` to be either side of an order book with `n` price levels. Then, the
return value of the function is the average trade price of a market order
executed with the size of `target_size` against the book.

Let's take the below order book as an example.

| Size | Bid   | Ask   | Size |
| ---- | ----- | ----- | ---- |
| 10   | 14.10 | 14.50 | 14   |
| 17   | 14.00 | 14.60 | 16   |
| 19   | 13.90 | 14.80 | 23   |
| 21   | 13.70 | 15.10 | 12   |

A _buy market order_ with the size of 50 would wipe out the first two price
levels of the _Ask_ side of the book, and would also trade on the third level.

The full price of the trade:

$$
14 \cdot \$14.50 + 16 \cdot \$14.60 + (50 - 14 - 16) \cdot \$14.80 = \$732.60
$$

The average price of the instrument in this trade:

$$
\$732.60 / 50 = \$14.652
$$

This average trade price is the output of the function when executed with the
parameters taken from the above example:

```questdb-sql
select l2price(50, ARRAY[14.0, 16.0, 23.0, 12.0], ARRAY[14.50, 14.60, 14.80, 15.10]);
```

or

```questdb-sql
select l2price(50, 14, 14.50, 16, 14.60, 23, 14.80, 12, 15.10);
```

| l2price |
| ------- |
| 14.652  |

### Parameters

There are two variants of the function, one accepting arrays of numbers,
and the other accepting individual numbers:

The variant with arrays takes a `target size`, and a pair of arrays of type
`DOUBLE[]`: `size` and `price`. The arrays must match in length. Each
element of the array represents a price level of the order book.

The variant with individual numbers takes a `target size`, and a variable
number of `size`/`price` pairs of type `DOUBLE`, or convertible to `DOUBLE`
(`FLOAT`, `LONG`, `INT`, `SHORT`, `BYTE`).

- `target_size`: The size of a hypothetical market order to be filled.
- `size*`: The sizes of offers available at the corresponding price levels (can
  be fractional).
- `price*`: Price levels of the order book.

### Return value

The function returns a `double`, representing the average trade price.

It returns `NULL` if the price is not calculable. For example, if the target
size cannot be filled, or there is incomplete data in the set (nulls).

### Examples - ARRAY

Test data:

```questdb-sql
CREATE TABLE order_book (
  ts TIMESTAMP,
  bidSize DOUBLE[], bid DOUBLE[],
  askSize DOUBLE[], ask DOUBLE[]
) TIMESTAMP(ts) PARTITION BY DAY;

INSERT INTO order_book VALUES
  ('2024-05-22T09:40:15.006000Z',
    ARRAY[40.0, 47.0, 39.0], ARRAY[14.10, 14.00, 13.90],
    ARRAY[54.0, 36.0, 23.0], ARRAY[14.50, 14.60, 14.80]),
  ('2024-05-22T09:40:15.175000Z',
    ARRAY[42.0, 45.0, 35.0], ARRAY[14.00, 13.90, 13.80],
    ARRAY[16.0, 57.0, 30.0], ARRAY[14.30, 14.50, 14.60]),
  ('2024-05-22T09:40:15.522000Z',
    ARRAY[36.0, 38.0, 31.0], ARRAY[14.10, 14.00, 13.90],
    ARRAY[30.0, 47.0, 34.0], ARRAY[14.40, 14.50, 14.60]);
```

Trading price of instrument when buying 100:

```questdb-sql
SELECT ts, L2PRICE(100, askSize, ask) AS buy FROM order_book;
```

| ts                          | buy             |
| --------------------------- | --------------- |
| 2024-05-22T09:40:15.006000Z | 14.565999999999 |
| 2024-05-22T09:40:15.175000Z | 14.495          |
| 2024-05-22T09:40:15.522000Z | 14.493          |

Trading price of instrument when selling 100:

```questdb-sql
SELECT ts, L2PRICE(100, bidSize, bid) AS sell FROM order_book;
```

| ts                          | sell   |
| --------------------------- | ------ |
| 2024-05-22T09:40:15.006000Z | 14.027 |
| 2024-05-22T09:40:15.175000Z | 13.929 |
| 2024-05-22T09:40:15.522000Z | 14.01  |

The spread for target quantity 100:

```questdb-sql
SELECT ts, L2PRICE(100, askSize, ask) - L2PRICE(100, bidSize, bid) AS spread FROM order_book;
```

| ts                          | spread         |
| --------------------------- | -------------- |
| 2024-05-22T09:40:15.006000Z | 0.538999999999 |
| 2024-05-22T09:40:15.175000Z | 0.565999999999 |
| 2024-05-22T09:40:15.522000Z | 0.483          |

### Examples - scalar columns

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
| --------------------------- | --------------- |
| 2024-05-22T09:40:15.006000Z | 14.565999999999 |
| 2024-05-22T09:40:15.175000Z | 14.495          |
| 2024-05-22T09:40:15.522000Z | 14.493          |

Trading price of instrument when selling 100:

```questdb-sql
SELECT ts, L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS sell FROM order_book;
```

| ts                          | sell   |
| --------------------------- | ------ |
| 2024-05-22T09:40:15.006000Z | 14.027 |
| 2024-05-22T09:40:15.175000Z | 13.929 |
| 2024-05-22T09:40:15.522000Z | 14.01  |

The spread for target size of 100:

```questdb-sql
SELECT ts, L2PRICE(100, askSize1, ask1, askSize2, ask2, askSize3, ask3)
  - L2PRICE(100, bidSize1, bid1, bidSize2, bid2, bidSize3, bid3) AS spread FROM order_book;
```

| ts                          | spread         |
| --------------------------- | -------------- |
| 2024-05-22T09:40:15.006000Z | 0.538999999999 |
| 2024-05-22T09:40:15.175000Z | 0.565999999999 |
| 2024-05-22T09:40:15.522000Z | 0.483          |

## mid

`mid(bid, ask)` - calculates the midpoint of a bidding price and asking price.

Returns null if either argument is NaN or null.

### Parameters

- `bid` is any numeric bidding price value.
- `ask` is any numeric asking price value.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT mid(1.5760, 1.5763)
```

| mid     |
| :------ |
| 1.57615 |

## regr_intercept

`regr_intercept(y, x)` - Calculates the y-intercept of the linear regression line for the given numeric columns y (dependent variable) and x (independent variable).

- The function requires at least two valid (y, x) pairs to compute the intercept.
  - If fewer than two pairs are available, the function returns null.
- Supported data types for x and y include `double`, `float`, and `integer` types.
- The `regr_intercept` function can be used with other statistical aggregation functions like `regr_slope` or `corr`.
- The order of arguments in `regr_intercept(y, x)` matters.
  - Ensure that y is the dependent variable and x is the independent variable.

### Calculation

The y-intercept $b_0$ of the regression line $y = b_0 + b_1 x$ is calculated using the formula:

$$
b_0 = \bar{y} - b_1 \bar{x}
$$

Where:

- $\bar{y}$ is the mean of y values
- $\bar{x}$ is the mean of x values
- $b_1$ is the slope calculated by `regr_slope(y, x)`

### Arguments

- y: A numeric column representing the dependent variable.
- x: A numeric column representing the independent variable.

### Return value

Return value type is `double`.

The function returns the y-intercept of the regression line, indicating the predicted value of y when x is 0.

### Examples

#### Calculate the regression intercept between two variables

Using the same measurements table:

| x   | y   |
| --- | --- |
| 1.0 | 2.0 |
| 2.0 | 3.0 |
| 3.0 | 5.0 |
| 4.0 | 4.0 |
| 5.0 | 6.0 |

Calculate the y-intercept:

```questdb-sql
SELECT regr_intercept(y, x) AS y_intercept FROM measurements;
```

Result:

| y_intercept |
| ----------- |
| 1.4         |

Or: When x is 0, y is predicted to be 1.4 units.

#### Calculate the regression intercept grouped by category

Using the same sales_data table:

| category | advertising_spend | sales |
| -------- | ---------------- | ----- |
| A        | 1000             | 15000 |
| A        | 2000             | 22000 |
| A        | 3000             | 28000 |
| B        | 1500             | 18000 |
| B        | 2500             | 26000 |
| B        | 3500             | 31000 |

```questdb-sql
SELECT category, regr_intercept(sales, advertising_spend) AS base_sales
FROM sales_data
GROUP BY category;
```

Result:

| category | base_sales |
| -------- | ---------- |
| A        | 9500       |
| B        | 12000      |

Or:

- In category A, with no advertising spend, the predicted base sales are 9,500 units
- In category B, with no advertising spend, the predicted base sales are 12,000 units

#### Handling null values

The function ignores rows where either x or y is null:

```questdb-sql
SELECT regr_intercept(y, x) AS y_intercept
FROM (
    SELECT 1 AS x, 2 AS y
    UNION ALL SELECT 2, NULL
    UNION ALL SELECT NULL, 4
    UNION ALL SELECT 4, 5
);
```

Result:

| y_intercept |
| ----------- |
| 1.4         |

Only the rows where both x and y are not null are considered in the calculation.

## regr_slope

`regr_slope(y, x)` - Calculates the slope of the linear regression line for the
given numeric columns y (dependent variable) and x (independent variable).

- The function requires at least two valid (x, y) pairs to compute the slope.
  - If fewer than two pairs are available, the function returns null.
- Supported data types for x and y include `double`, `float`, and `integer`
  types.
- The regr_slope function can be used with other statistical aggregation
  functions like `corr` or `covar_samp`.
- The order of arguments in `regr_slope(y, x)` matters.
  - Ensure that y is the dependent variable and x is the independent variable.

### Calculation

The slope $b_1$ of the regression line $y = b_0 + b_1 x$ is calculated using the
formula:

$$
b_1 = \frac{N \sum (xy) - \sum x \sum y}{N \sum (x^2) - (\sum x)^2}
$$

Where:

- $N$ is the number of valid data points.
- $\sum (xy)$ is the sum of the products of $x$ and $y$.
- $\sum x$ and $\sum y$ is the sums of $x$ and $y$ values, respectively.
- $\sum (x^2)$ is the sum of the squares of $x$ values.

### Arguments

- y: A numeric column representing the dependent variable.
- x: A numeric column representing the independent variable.

### Return value

Return value type is `double`.

The function returns the slope of the regression line, indicating how much y
changes for a unit change in x.

### Examples

#### Calculate the regression slope between two variables

Suppose you have a table measurements with the following data:

| x   | y   |
| --- | --- |
| 1.0 | 2.0 |
| 2.0 | 3.0 |
| 3.0 | 5.0 |
| 4.0 | 4.0 |
| 5.0 | 6.0 |

You can calculate the slope of the regression line between y and x using:

```questdb-sql
SELECT regr_slope(y, x) AS slope FROM measurements;
```

Result:

| slope |
| ----- |
| 0.8   |

Or: The slope of 0.8 indicates that for each unit increase in x, y increases by
0.8 units on average.

#### Calculate the regression slope grouped by a category

Consider a table sales_data:

| category | advertising_spend | sales |
| -------- | ----------------- | ----- |
| A        | 1000              | 15000 |
| A        | 2000              | 22000 |
| A        | 3000              | 28000 |
| B        | 1500              | 18000 |
| B        | 2500              | 26000 |
| B        | 3500              | 31000 |

Calculate the regression slope of `sales` versus `advertising_spend` for each
category:

```questdb-sql
SELECT category, regr_slope(sales, advertising_spend) AS slope FROM sales_data
GROUP BY category;
```

Result:

| category | slope |
| -------- | ----- |
| A        | 8.5   |
| B        | 7.0   |

Or:

- In category A, for every additional unit spent on advertising, sales increase
  by 8.5 units on average.
- In category B, the increase is 7.0 units per advertising unit spent.

#### Handling null values

If your data contains null values, `regr_slope()` will ignore those rows:

```questdb
SELECT regr_slope(y, x) AS slope FROM ( SELECT 1 AS x, 2 AS y UNION ALL SELECT
2, NULL UNION ALL SELECT NULL, 4 UNION ALL SELECT 4, 5 );
```

Result:

| slope |
| ----- |
| 0.8   |

Only the rows where both x and y are not null are considered in the calculation.

#### Calculating beta

Assuming you have a table `stock_returns` with daily returns for a specific
stock and the market index:

| date       | stock_return | market_return |
| ---------- | ------------ | ------------- |
| 2023-01-01 | 0.5          | 0.4           |
| 2023-01-02 | -0.2         | -0.1          |
| 2023-01-03 | 0.3          | 0.2           |
| ...        | ...          | ...           |

Calculate the stock's beta coefficient:

```questdb-sql
SELECT regr_slope(stock_return, market_return) AS beta FROM stock_returns;
```

| beta |
| ---- |
| 1.2  |

Or: A beta of 1.2 suggests the stock is 20% more volatile than the market.

Remember: The order of arguments in `regr_slope(y, x)` matters.

Ensure that y is the dependent variable and x is the independent variable.

## spread_bps

`spread_bps(bid, ask)` - calculates the quoted bid-ask spread, based on the
highest bidding price, and the lowest asking price.

The result is provided in basis points, and the calculation is:

$$
\frac
{\text{spread}\left(\text{bid}, \text{ask}\right)}
{\text{mid}\left(\text{bid}, \text{ask}\right)}
\cdot
10\,000
$$

### Parameters

- `bid` is any numeric bidding price value.
- `ask` is any numeric asking price value.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT spread_bps(1.5760, 1.5763)
```

| spread_bps     |
| :------------- |
| 1.903372140976 |

## VWAP (Volume-Weighted Average Price)

For VWAP calculations, use window functions with the typical price formula. This approach is more flexible and works well with high-frequency market data.

See the [VWAP example in Window Functions](/docs/query/functions/window-functions/overview#vwap-volume-weighted-average-price) for the recommended implementation using `SAMPLE BY` and `CUMULATIVE` window frames.

## TWAP (Time-Weighted Average Price)

QuestDB provides a native `twap(price, timestamp)` aggregate function that computes the time-weighted average price using step-function integration. Unlike VWAP, TWAP gives equal weight to every time interval, making it the preferred benchmark for illiquid instruments or when volume data is unavailable. It supports `GROUP BY`, `SAMPLE BY`, and `FILL` modes.

- [Function reference](/docs/query/functions/aggregation#twap) — syntax, parameters, and formula
- [Cookbook recipe](/docs/cookbook/sql/finance/twap/) — practical examples with TWAP-vs-VWAP comparison

## wmid

`wmid(bidSize, bidPrice, askPrice, askSize)` - calculates the weighted mid-price
for a sized bid/ask pair.

It is calculated with these formulae:

$$
\text{imbalance} =
\frac
{ \text{bidSize} }
{ \left(  \text{bidSize} + \text{askSize} \right) }
$$

$$
\text{wmid} = \text{askPrice} \cdot \text{imbalance}
+ \text{bidPrice}
\cdot \left( 1 - \text{imbalance} \right)
$$

### Parameters

- `bidSize` is any numeric value representing the size of the bid offer.
- `bidPrice` is any numeric value representing the bidding price.
- `askPrice` is any numeric value representing the asking price.
- `askSize` is any numeric value representing the size of the ask offer.

### Return value

Return value type is `double`.

### Examples

```questdb-sql
SELECT wmid(100, 5, 6, 100)
```

| wmid |
| :--- |
| 5.5  |
