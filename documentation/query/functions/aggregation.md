---
title: Aggregate functions
sidebar_label: Aggregate
description: SQL aggregate functions for summarizing data including count, sum, avg, min, max, statistical functions, and more.
---

This page describes the available functions to assist with performing aggregate
calculations. Functions are organized by category below.

## Function categories

### Basic aggregates

| Function | Description |
| :------- | :---------- |
| [count](#count) | Count rows or non-NULL values |
| [sum](#sum) | Sum of values |
| [avg](#avg) | Arithmetic mean |
| [geomean](#geomean) | Geometric mean |
| [min](#min) | Minimum value |
| [max](#max) | Maximum value |

### Positional aggregates

| Function | Description |
| :------- | :---------- |
| [first](#first) | First value (by designated timestamp or insertion order) |
| [first_not_null](#first_not_null) | First non-NULL value |
| [last](#last) | Last value (by designated timestamp or insertion order) |
| [last_not_null](#last_not_null) | Last non-NULL value |
| [arg_min](#arg_min) | Value at the row where another column is minimum |
| [arg_max](#arg_max) | Value at the row where another column is maximum |

### Statistical aggregates

| Function | Description |
| :------- | :---------- |
| [stddev / stddev_samp](#stddev--stddev_samp) | Sample standard deviation |
| [stddev_pop](#stddev_pop) | Population standard deviation |
| [variance / var_samp](#variance--var_samp) | Sample variance |
| [var_pop](#var_pop) | Population variance |
| [corr](#corr) | Pearson correlation coefficient |
| [covar_pop](#covar_pop) | Population covariance |
| [covar_samp](#covar_samp) | Sample covariance |
| [mode](#mode) | Most frequent value |

### Approximate aggregates

| Function | Description |
| :------- | :---------- |
| [approx_count_distinct](#approx_count_distinct) | Estimated distinct count using HyperLogLog |
| [approx_percentile](#approx_percentile) | Approximate percentile using HdrHistogram |
| [approx_median](#approx_median) | Approximate median (50th percentile) |

### String aggregates

| Function | Description |
| :------- | :---------- |
| [string_agg](#string_agg) | Concatenate values with delimiter |
| [string_distinct_agg](#string_distinct_agg) | Concatenate distinct values with delimiter |

### Boolean aggregates

| Function | Description |
| :------- | :---------- |
| [bool_and](#bool_and) | True if all values are true |
| [bool_or](#bool_or) | True if any value is true |

### Bitwise aggregates

| Function | Description |
| :------- | :---------- |
| [bit_and](#bit_and) | Bitwise AND of all non-NULL values |
| [bit_or](#bit_or) | Bitwise OR of all non-NULL values |
| [bit_xor](#bit_xor) | Bitwise XOR of all non-NULL values |

### Specialized aggregates

| Function | Description |
| :------- | :---------- |
| [count_distinct](#count_distinct) | Exact count of distinct values |
| [ksum](#ksum) | Kahan compensated sum (for floating-point precision) |
| [nsum](#nsum) | Neumaier sum (for floating-point precision) |
| [haversine_dist_deg](#haversine_dist_deg) | Total traveled distance from lat/lon points |
| [weighted_avg](#weighted_avg) | Weighted arithmetic mean |
| [weighted_stddev](#weighted_stddev) | Weighted standard deviation (reliability weights) |
| [weighted_stddev_freq](#weighted_stddev_freq) | Weighted standard deviation (frequency weights) |
| [weighted_stddev_rel](#weighted_stddev_rel) | Weighted standard deviation (reliability weights) |

---

## Usage notes

:::note Implicit GROUP BY

QuestDB supports implicit `GROUP BY`. When you use aggregate functions alongside
non-aggregated columns, QuestDB automatically groups by the non-aggregated
columns. These two queries are equivalent:

```questdb-sql
-- Explicit GROUP BY (standard SQL)
SELECT symbol, avg(price) FROM trades GROUP BY symbol;

-- Implicit GROUP BY (QuestDB shorthand)
SELECT symbol, avg(price) FROM trades;
```

Examples in this documentation often use implicit `GROUP BY` for brevity.

:::

:::note NULL value handling

Most aggregate functions ignore `NULL` values during computation. For example,
`sum(column)` adds only non-NULL values, and `avg(column)` calculates the mean
of non-NULL values only.

Exceptions and special cases:
- `count(*)` counts all rows including those with NULL values
- `count(column)` counts only non-NULL values in the specified column
- `first()` and `last()` may return NULL if the first/last row contains NULL
- `first_not_null()` and `last_not_null()` skip NULL values

For functions with multiple arguments (like `arg_min`, `arg_max`), NULL handling
is documented in each function's description.

:::

---

## approx_count_distinct

`approx_count_distinct(column_name, precision)` - estimates the number of
distinct non-`NULL` values in `IPv4`, `int`, or `long` columns using the
[HyperLogLog](/glossary/HyperLogLog/) data structure, which provides an
approximation rather than an exact count.

The precision of HyperLogLog can be controlled via the optional `precision`
parameter, typically between 4 and 16. A higher precision leads to more accurate
results with increased memory usage. The default is 1.

This function is useful within [high cardinality](/glossary/high-cardinality/)
datasets where an exact count is not required. Thus consider it the higher
cardinality alternative to
[`count_distinct`](/docs/query/functions/aggregation/#count_distinct).

#### Parameters

- `column_name`: The name of the column for which to estimate the count of
  distinct values.
- `precision` (optional): A number specifying the precision of the
  [HyperLogLog](/glossary/hyperloglog/) algorithm, which influences the
  trade-off between accuracy and memory usage. A higher precision gives a more
  accurate estimate, but consumes more memory. Defaults to 1 (lower accuracy,
  high efficiency).

#### Return value

Return value type is `long`.

#### Examples

_Please note that exact example values will vary as they are approximations
derived from the HyperLogLog algorithm._

```questdb-sql title="Estimate count of distinct symbols with precision 5"
SELECT approx_count_distinct(symbol, 5) FROM trades;
```

| approx_count_distinct |
| :-------------------- |
| 1234567               |

```questdb-sql title="Estimate count of distinct user_id (int) values by date"
SELECT date, approx_count_distinct(user_id) FROM sessions GROUP BY date;
```

| date       | approx_count_distinct |
| :--------- | :-------------------- |
| 2023-01-01 | 2358                  |
| 2023-01-02 | 2491                  |
| ...        | ...                   |

```questdb-sql title="Estimate count of distinct product_id values by region"
SELECT region, approx_count_distinct(product_id) FROM sales GROUP BY region;
```

| region | approx_count_distinct |
| :----- | :-------------------- |
| North  | 1589                  |
| South  | 1432                  |
| East   | 1675                  |
| West   | 1543                  |

```questdb-sql title="Estimate count of distinct order_ids with precision 8"
SELECT approx_count_distinct(order_id, 8) FROM orders;
```

| approx_count_distinct |
| :-------------------- |
| 3456789               |

```questdb-sql title="Estimate count of distinct transaction_ids by store_id"
SELECT store_id, approx_count_distinct(transaction_id) FROM transactions GROUP BY store_id;
```

| store_id | approx_count_distinct |
| :------- | :-------------------- |
| 1        | 56789                 |
| 2        | 67890                 |
| ...      | ...                   |

## approx_percentile

`approx_percentile(value, percentile, precision)` calculates the approximate
value for the given non-negative column and percentile using the
[HdrHistogram](http://hdrhistogram.org/) algorithm.

#### Parameters

- `value` is any numeric non-negative value.
- `percentile` is a `double` value between 0.0 and 1.0, inclusive.
- `precision` is an optional `int` value between 0 and 5, inclusive. This is the
  number of significant decimal digits to which the histogram will maintain
  value resolution and separation. For example, when the input column contains
  integer values between 0 and 3,600,000,000 and the precision is set to 3,
  value quantization within the range will be no larger than 1/1,000th (or 0.1%)
  of any value. In this example, the function tracks and analyzes the counts of
  observed response times ranging between 1 microsecond and 1 hour in magnitude,
  while maintaining a value resolution of 1 microsecond up to 1 millisecond, a
  resolution of 1 millisecond (or better) up to one second, and a resolution of
  1 second (or better) up to 1,000 seconds. At its maximum tracked value (1
  hour), it would still maintain a resolution of 3.6 seconds (or better).

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Approximate percentile"
SELECT approx_percentile(price, 0.99) FROM trades;
```

| approx_percentile |
| :---------------- |
| 101.5             |

#### See also

- [approx_median](#approx_median) - Shorthand for 50th percentile

## approx_median

`approx_median(value, precision)` calculates the approximate median (50th
percentile) of a set of non-negative numeric values using the
[HdrHistogram](http://hdrhistogram.org/) algorithm. This is equivalent to
calling `approx_percentile(value, 0.5, precision)`.

The function will throw an error if any negative values are encountered in the
input. All input values must be non-negative.

#### Parameters

- `value` is any non-negative numeric value.
- `precision` (optional) is an `int` value between 0 and 5, inclusive. This is
  the number of significant decimal digits to which the histogram will maintain
  value resolution and separation. Higher precision leads to more accurate
  results with increased memory usage. Defaults to 1 (lower accuracy, high
  efficiency).

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Calculate approximate median price by symbol" demo
SELECT symbol, approx_median(price) FROM trades
WHERE timestamp in today()
GROUP BY symbol;
```

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.31     |
| ETH-USD | 2615.46      |

```questdb-sql title="Calculate approximate median with higher precision" demo
SELECT symbol, approx_median(price, 3) FROM trades
WHERE timestamp in today()
GROUP BY symbol;
```

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.312    |
| ETH-USD | 2615.459     |

#### See also

- [approx_percentile](#approx_percentile) - Approximate percentile for any quantile

## arg_max

`arg_max(value, key)` returns the value of the first argument at the row where
the second argument reaches its maximum value. This function is useful for
finding values at extreme points in time-series and grouped data.

#### Parameters

- `value` is the column or expression whose value to return.
- `key` is the column or expression used to determine which row to select (the
  row with the maximum key value).

#### Return value

Return value type matches the type of the `value` argument.

#### Null handling

- Rows where `key` is `NULL` are ignored during aggregation.
- If the value at the maximum key row is `NULL`, the result is `NULL`.
- If all keys in a group are `NULL`, the result is `NULL`.

#### Supported type combinations

The function supports the following type combinations for `value` and `key`:

| Value Type | Key Types                   |
| :--------- | :-------------------------- |
| double     | double, long, timestamp     |
| long       | double, timestamp           |
| timestamp  | double, long, uuid          |
| uuid       | timestamp                   |

#### Examples

```questdb-sql title="Find the timestamp when the highest price occurred"
SELECT arg_max(timestamp, price) AS peak_time FROM trades;
```

| peak_time                   |
| :-------------------------- |
| 2024-03-14T09:32:15.000000Z |

```questdb-sql title="Find when each symbol hit its all-time high"
SELECT symbol, arg_max(timestamp, price) AS ath_time
FROM trades
GROUP BY symbol;
```

| symbol  | ath_time                    |
| :------ | :-------------------------- |
| BTC-USD | 2024-03-14T09:32:15.000000Z |
| ETH-USD | 2024-03-12T14:05:22.000000Z |

```questdb-sql title="Find the order_id of the largest trade for each symbol"
SELECT symbol, arg_max(order_id, amount) AS largest_order
FROM trades
GROUP BY symbol;
```

| symbol  | largest_order                        |
| :------ | :----------------------------------- |
| BTC-USD | 550e8400-e29b-41d4-a716-446655440000 |
| ETH-USD | 6ba7b810-9dad-11d1-80b4-00c04fd430c8 |

#### See also

- [arg_min](#arg_min) - Value at the row where another column is minimum
- [max](#max) - Returns the maximum value itself
- [last](#last) - Returns the last value by timestamp order

## arg_min

`arg_min(value, key)` returns the value of the first argument at the row where
the second argument reaches its minimum value. This function is useful for
finding values at extreme points in time-series and grouped data.

#### Parameters

- `value` is the column or expression whose value to return.
- `key` is the column or expression used to determine which row to select (the
  row with the minimum key value).

#### Return value

Return value type matches the type of the `value` argument.

#### Null handling

- Rows where `key` is `NULL` are ignored during aggregation.
- If the value at the minimum key row is `NULL`, the result is `NULL`.
- If all keys in a group are `NULL`, the result is `NULL`.

#### Supported type combinations

The function supports the following type combinations for `value` and `key`:

| Value Type | Key Types                   |
| :--------- | :-------------------------- |
| double     | double, long, timestamp     |
| long       | double, timestamp           |
| timestamp  | double, long, uuid          |
| uuid       | timestamp                   |

#### Examples

```questdb-sql title="Find the timestamp when the lowest price occurred"
SELECT arg_min(timestamp, price) AS bottom_time FROM trades;
```

| bottom_time                 |
| :-------------------------- |
| 2024-01-15T04:23:00.000000Z |

```questdb-sql title="Find when each symbol hit its all-time low"
SELECT symbol, arg_min(timestamp, price) AS atl_time
FROM trades
GROUP BY symbol;
```

| symbol  | atl_time                    |
| :------ | :-------------------------- |
| BTC-USD | 2024-01-15T04:23:00.000000Z |
| ETH-USD | 2024-01-22T08:15:33.000000Z |

```questdb-sql title="Find the sensor_id that recorded the coldest temperature"
SELECT arg_min(sensor_id, temperature) AS coldest_sensor
FROM weather_data;
```

| coldest_sensor |
| :------------- |
| 47             |

#### See also

- [arg_max](#arg_max) - Value at the row where another column is maximum
- [min](#min) - Returns the minimum value itself
- [first](#first) - Returns the first value by timestamp order

## avg

`avg(value)` calculates simple average of values ignoring missing data (e.g
`NULL` values).

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Average transaction amount"
SELECT avg(amount) FROM transactions;
```

| avg  |
| :--- |
| 22.4 |

```questdb-sql title="Average transaction amount by payment_type"
SELECT payment_type, avg(amount) FROM transactions;
```

| payment_type | avg   |
| :----------- | :---- |
| cash         | 22.1  |
| card         | 27.4  |
| NULL         | 18.02 |

#### See also

- [sum](#sum) - Sum of values
- [weighted_avg](#weighted_avg) - Weighted arithmetic mean

## bit_and

`bit_and(value)` returns the bitwise AND of all non-NULL values in an integer
column.

#### Parameters

- `value` is a `byte`, `short`, `int`, or `long` column.

#### Return value

Return value type matches the type of the argument.

#### Examples

```questdb-sql title="Bitwise AND of all status flags"
SELECT bit_and(flags) FROM events;
```

| bit_and |
| :------ |
| 4       |

```questdb-sql title="Bitwise AND of status flags by category"
SELECT category, bit_and(status_flags) FROM items;
```

| category | bit_and |
| :------- | :------ |
| A        | 1       |
| B        | 0       |
| C        | 5       |

#### See also

- [bit_or](#bit_or) - Bitwise OR of all non-NULL values
- [bit_xor](#bit_xor) - Bitwise XOR of all non-NULL values

## bit_or

`bit_or(value)` returns the bitwise OR of all non-NULL values in an integer
column.

#### Parameters

- `value` is a `byte`, `short`, `int`, or `long` column.

#### Return value

Return value type matches the type of the argument.

#### Examples

```questdb-sql title="Bitwise OR of all permissions"
SELECT bit_or(permissions) FROM users;
```

| bit_or |
| :----- |
| 15     |

```questdb-sql title="Bitwise OR of permissions by role"
SELECT role, bit_or(permissions) FROM users;
```

| role    | bit_or |
| :------ | :----- |
| admin   | 255    |
| editor  | 31     |
| viewer  | 1      |

#### See also

- [bit_and](#bit_and) - Bitwise AND of all non-NULL values
- [bit_xor](#bit_xor) - Bitwise XOR of all non-NULL values

## bit_xor

`bit_xor(value)` returns the bitwise XOR of all non-NULL values in an integer
column.

#### Parameters

- `value` is a `byte`, `short`, `int`, or `long` column.

#### Return value

Return value type matches the type of the argument.

#### Examples

```questdb-sql title="Bitwise XOR of all checksums"
SELECT bit_xor(checksum) FROM data;
```

| bit_xor |
| :------ |
| 42      |

```questdb-sql title="Bitwise XOR by partition"
SELECT partition_id, bit_xor(value) FROM records;
```

| partition_id | bit_xor |
| :----------- | :------ |
| 1            | 170     |
| 2            | 85      |

#### See also

- [bit_and](#bit_and) - Bitwise AND of all non-NULL values
- [bit_or](#bit_or) - Bitwise OR of all non-NULL values

## bool_and

`bool_and(value)` returns `true` if all non-NULL values in the group are `true`,
otherwise returns `false`. This function is useful for checking if a condition
holds across all rows in a group.

#### Parameters

- `value` is a boolean column or expression.

#### Return value

Return value type is `boolean`.

#### Examples

```questdb-sql title="Check if all orders are fulfilled"
SELECT bool_and(is_fulfilled) FROM orders;
```

| bool_and |
| :------- |
| false    |

```questdb-sql title="Check if all items passed QA by batch"
SELECT batch_id, bool_and(passed_qa) FROM items;
```

| batch_id | bool_and |
| :------- | :------- |
| 1        | true     |
| 2        | false    |
| 3        | true     |

```questdb-sql title="Check if all prices are above threshold"
SELECT symbol, bool_and(price > 100) FROM trades;
```

| symbol  | bool_and |
| :------ | :------- |
| BTC-USD | true     |
| ETH-USD | false    |

#### See also

- [bool_or](#bool_or) - True if any value is true

## bool_or

`bool_or(value)` returns `true` if any non-NULL value in the group is `true`,
otherwise returns `false`. This function is useful for checking if a condition
holds for at least one row in a group.

#### Parameters

- `value` is a boolean column or expression.

#### Return value

Return value type is `boolean`.

#### Examples

```questdb-sql title="Check if any order has errors"
SELECT bool_or(has_error) FROM orders;
```

| bool_or |
| :------ |
| true    |

```questdb-sql title="Check if any item failed QA by batch"
SELECT batch_id, bool_or(failed_qa) FROM items;
```

| batch_id | bool_or |
| :------- | :------ |
| 1        | false   |
| 2        | true    |
| 3        | false   |

```questdb-sql title="Check if any trade exceeded volume threshold"
SELECT symbol, bool_or(volume > 1000000) FROM trades;
```

| symbol  | bool_or |
| :------ | :------ |
| BTC-USD | true    |
| ETH-USD | true    |

#### See also

- [bool_and](#bool_and) - True if all values are true

## corr

`corr(arg0, arg1)` is a function that measures how closely two sets of numbers
move in the same direction. It does this by comparing how much each number in
each set differs from the average of its set. This calculation is based on
[Welford's Algorithm](https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance#Welford's_online_algorithm).

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a value close to 1.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a value close to -1.

- If there's no clear pattern, the function will return a value close to 0.

#### Parameters

- `arg0` is any numeric value representing the first variable
- `arg1` is any numeric value representing the second variable

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Correlation between price and quantity"
SELECT corr(price, quantity) FROM transactions;
```

| corr |
| :--- |
| 0.89 |

```questdb-sql title="Correlation between price and quantity grouped by payment type"
SELECT payment_type, corr(price, quantity) FROM transactions GROUP BY payment_type;
```

| payment_type | corr |
| :----------- | :--- |
| cash         | 0.85 |
| card         | 0.92 |
| NULL         | 0.78 |

## count

- `count()` or `count(*)` - counts the number of rows irrespective of underlying
  data.
- `count(column_name)` - counts the number of non-NULL values in a given column.

#### Parameters

- `count()` does not require arguments.
- `count(column_name)` - supports the following data types:
  - `double`
  - `float`
  - `integer`
  - `character`
  - `short`
  - `byte`
  - `timestamp`
  - `date`
  - `long`
  - `long256`
  - `geohash`
  - `varchar`
  - `string`
  - `symbol`

#### Return value

Return value type is `long`.

#### Examples

Count of rows in the `transactions` table:

```questdb-sql
SELECT count() FROM transactions;
```

| count |
| :---- |
| 100   |

Count of rows in the `transactions` table aggregated by the `payment_type`
value:

```questdb-sql
SELECT payment_type, count() FROM transactions;
```

| payment_type | count |
| :----------- | :---- |
| cash         | 25    |
| card         | 70    |
| NULL         | 5     |

Count non-NULL transaction amounts:

```questdb-sql
SELECT count(amount) FROM transactions;
```

| count |
| :---- |
| 95    |

Count non-NULL transaction amounts by `payment_type`:

```questdb-sql
SELECT payment_type, count(amount) FROM transactions;
```

| payment_type | count |
| :----------- | :---- |
| cash         | 24    |
| card         | 67    |
| NULL         | 4     |

:::note

`NULL` values are aggregated with `count()`, but not with `count(column_name)`

:::

#### See also

- [count_distinct](#count_distinct) - Exact count of distinct values
- [approx_count_distinct](#approx_count_distinct) - Estimated distinct count for large datasets

## count_distinct

`count_distinct(column_name)` - counts distinct non-`NULL` values in `varchar`,
`symbol`, `long256`, `UUID`, `IPv4`, `long`, `int` or `string` columns.

#### Return value

Return value type is `long`.

#### Examples

- Count of distinct sides in the transactions table. Side column can either be
  `BUY` or `SELL` or `NULL`.

```questdb-sql
SELECT count_distinct(side) FROM transactions;
```

| count_distinct |
| :------------- |
| 2              |

- Count of distinct counterparties in the transactions table aggregated by
  `payment_type` value.

```questdb-sql
SELECT payment_type, count_distinct(counterparty) FROM transactions;
```

| payment_type | count_distinct |
| :----------- | :------------- |
| cash         | 3              |
| card         | 23             |
| NULL         | 5              |

#### See also

- [count](#count) - Count all rows or non-NULL values
- [approx_count_distinct](#approx_count_distinct) - Estimated distinct count for large datasets

## covar_pop

`covar_pop(arg0, arg1)` is a function that measures how much two sets of numbers
change together. It does this by looking at how much each number in each set
differs from the average of its set. It multiplies these differences together,
adds them all up, and then divides by the total number of pairs. This gives a
measure of the overall trend.

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a positive number.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a negative number.

- The closer the result is to zero, the less relationship there is between the
  two sets of numbers.

#### Parameters

- `arg0` is any numeric value representing the first variable
- `arg1` is any numeric value representing the second variable.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Population covariance between price and quantity"
SELECT covar_pop(price, quantity) FROM transactions;
```

| covar_pop |
| :-------- |
| 15.2      |

```questdb-sql title="Population covariance between price and quantity grouped by payment type"
SELECT payment_type, covar_pop(price, quantity) FROM transactions GROUP BY payment_type;
```

| payment_type | covar_pop |
| :----------- | :-------- |
| cash         | 14.8      |
| card         | 16.2      |
| NULL         | 13.5      |

## covar_samp

`covar_samp(arg0, arg1)` is a function that finds the relationship between two
sets of numbers. It does this by looking at how much the numbers vary from the
average in each set.

- If the numbers in both sets tend to be above or below their average values at
  the same time, the function will return a positive number.

- If one set of numbers tends to be above its average value when the other set
  is below its average, the function will return a negative number.

- The closer the result is to zero, the less relationship there is between the
  two sets of numbers.

#### Parameters

- `arg0` is any numeric value representing the first variable.
- `arg1` is any numeric value representing the second variable.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Sample covariance between price and quantity"
SELECT covar_samp(price, quantity) FROM transactions;
```

| covar_samp |
| :--------- |
| 15.8       |

```questdb-sql title="Sample covariance between price and quantity grouped by payment type"
SELECT payment_type, covar_samp(price, quantity) FROM transactions GROUP BY payment_type;
```

| payment_type | covar_samp |
| :----------- | :--------- |
| cash         | 15.4       |
| card         | 16.8       |
| NULL         | 14.1       |

## first

- `first(column_name)` - returns the first value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `character`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar`,
`uuid` and `array`.

If a table has a [designated timestamp](/docs/concepts/designated-timestamp/),
then the first row is always the row with the lowest timestamp (oldest). For a
table without a designated timestamp column, `first` returns the first row
regardless of any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `trades`, which has a designated timestamp column:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| AAPL   | 142   | 2021-06-02T14:33:19.970258Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |

The following query returns oldest value for the `symbol` column:

```questdb-sql
SELECT first(symbol) FROM trades;
```

| first |
| :---- |
| AAPL  |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`trades_unordered`:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| AAPL   | 142   | 2021-06-02T14:33:19.970258Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |

The following query returns the first record for the `symbol` column:

```questdb-sql
SELECT first(symbol) FROM trades_unordered;
```

| first |
| :---- |
| AAPL  |

#### See also

- [first_not_null](#first_not_null) - First non-NULL value
- [last](#last) - Last value by timestamp order
- [arg_min](#arg_min) - Value at the row where another column is minimum

## first_not_null

- `first_not_null(column_name)` - returns the first non-NULL value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `char`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar`,
`uuid` and `array`.

If a table has a designated timestamp, then the first non-NULL row is always the
row with the lowest timestamp (oldest). For a table without a designated
timestamp column, `first_not_null` returns the first non-NULL row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `trades`, which has a designated timestamp column:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| NULL   | 142   | 2021-06-02T14:33:19.970258Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |

The following query returns oldest non-NULL value for the symbol column:

```questdb-sql
SELECT first_not_null(symbol) FROM trades;
```

| first_not_null |
| :------------- |
| GOOGL          |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`trades_unordered`:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| NULL   | 142   | 2021-06-02T14:33:19.970258Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |

The following query returns the first non-NULL record for the symbol column:

```questdb-sql
SELECT first_not_null(symbol) FROM trades_unordered;
```

| first_not_null |
| :------------- |
| MSFT           |

#### See also

- [first](#first) - First value (may be NULL)
- [last_not_null](#last_not_null) - Last non-NULL value

## geomean

`geomean(value)` calculates the geometric mean of a set of positive values. The
geometric mean is computed using the formula `exp(avg(ln(x)))`, which prevents
overflow issues with large products by using logarithms.

The geometric mean is useful for calculating average growth rates, ratios, and
other multiplicative quantities.

#### Parameters

- `value` is a `double` column or expression. Other numeric types are implicitly
  converted to `double`.

#### Return value

Return value type is `double`.

#### Null and edge case handling

| Input           | Result | Reason                           |
| :-------------- | :----- | :------------------------------- |
| Negative values | `NULL` | Geometric mean undefined         |
| Zero values     | `NULL` | `ln(0)` is undefined             |
| NULL values     | Skipped | Standard aggregate behavior     |
| Empty group     | `NULL` | Standard aggregate behavior      |

#### Examples

```questdb-sql title="Geometric mean of growth rates"
SELECT geomean(growth_rate) FROM quarterly_data;
```

| geomean |
| :------ |
| 1.12    |

```questdb-sql title="Geometric mean of returns by asset"
SELECT asset, geomean(return_factor) FROM portfolio;
```

| asset  | geomean |
| :----- | :------ |
| stocks | 1.08    |
| bonds  | 1.03    |
| crypto | 1.25    |

```questdb-sql title="Comparing arithmetic and geometric means"
SELECT avg(return_factor) AS arithmetic_mean,
       geomean(return_factor) AS geometric_mean
FROM investments;
```

| arithmetic_mean | geometric_mean |
| :-------------- | :------------- |
| 1.15            | 1.12           |

#### See also

- [avg](#avg) - Arithmetic mean

## haversine_dist_deg

`haversine_dist_deg(lat, lon, ts)` - calculates the traveled distance for a
series of latitude and longitude points.

#### Parameters

- `lat` is the latitude expressed as degrees in decimal format (`double`)
- `lon` is the longitude expressed as degrees in decimal format (`double`)
- `ts` is the `timestamp` for the data point

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Calculate the aggregate traveled distance for each car_id"
SELECT car_id, haversine_dist_deg(lat, lon, k)
FROM rides;
```

## ksum

`ksum(value)` - adds values ignoring missing data (e.g `NULL` values). Values
are added using the

[Kahan compensated sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm).
This is only beneficial for floating-point values such as `float` or `double`.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

```questdb-sql
SELECT ksum(a)
FROM (SELECT rnd_double() a FROM long_sequence(100));
```

| ksum              |
| :---------------- |
| 52.79143968514029 |

## last

- `last(column_name)` - returns the last value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `character`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar`,
`uuid` and `array`.

If a table has a [designated timestamp](/docs/concepts/designated-timestamp/),
the last row is always the one with the highest (latest) timestamp.

For a table without a designated timestamp column, `last` returns the last
inserted row, regardless of any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `trades`, which has a designated timestamp column:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| AAPL   | 142   | 2021-06-02T14:33:19.970258Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |

The following query returns the latest value for the `symbol` column:

```questdb-sql
SELECT last(symbol) FROM trades;
```

| last |
| :--- |
| MSFT |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`trades_unordered`:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| AAPL   | 142   | 2021-06-02T14:33:19.970258Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |

The following query returns the last record for the `symbol` column:

```questdb-sql
SELECT last(symbol) FROM trades_unordered;
```

| last  |
| :---- |
| GOOGL |

#### See also

- [last_not_null](#last_not_null) - Last non-NULL value
- [first](#first) - First value by timestamp order
- [arg_max](#arg_max) - Value at the row where another column is maximum

## last_not_null

- `last_not_null(column_name)` - returns the last non-NULL value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `char`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar`,
`uuid` and `array`.

If a table has a designated timestamp, then the last non-NULL row is always the
row with the highest timestamp (most recent). For a table without a designated
timestamp column, `last_not_null` returns the last non-NULL row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `trades`, which has a designated timestamp column:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| NULL   | 142   | 2021-06-02T14:33:19.970258Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |

The following query returns most recent non-NULL value for the symbol column:

```questdb-sql
SELECT last_not_null(symbol) FROM trades;
```

| last_not_null |
| :------------ |
| MSFT          |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`trades_unordered`:

| symbol | price | ts                          |
| :----- | :---- | :-------------------------- |
| NULL   | 142   | 2021-06-02T14:33:19.970258Z |
| MSFT   | 285   | 2021-06-02T14:33:23.707013Z |
| GOOGL  | 2750  | 2021-06-02T14:33:21.703934Z |

The following query returns the last non-NULL record for the `symbol` column:

```questdb-sql
SELECT last_not_null(symbol) FROM trades_unordered;
```

| last_not_null |
| :------------ |
| GOOGL         |

#### See also

- [last](#last) - Last value (may be NULL)
- [first_not_null](#first_not_null) - First non-NULL value

## max

`max(value)` - returns the highest value ignoring missing data (e.g `NULL`
values).

#### Parameters

- `value` is any numeric or string value

#### Return value

Return value type is the same as the type of the argument.

#### Examples

```questdb-sql title="Highest transaction amount"
SELECT max(amount) FROM transactions;
```

| max  |
| :--- |
| 55.3 |

```questdb-sql title="Highest transaction amount by payment_type"
SELECT payment_type, max(amount) FROM transactions;
```

| payment_type | max  |
| :----------- | :--- |
| cash         | 31.5 |
| card         | 55.3 |
| NULL         | 29.2 |

#### See also

- [min](#min) - Returns the minimum value
- [arg_max](#arg_max) - Returns another column's value at the row where this column is maximum

## min

`min(value)` - returns the lowest value ignoring missing data (e.g `NULL`
values).

#### Parameters

- `value` is any numeric or string value

#### Return value

Return value type is the same as the type of the argument.

#### Examples

```questdb-sql title="Lowest transaction amount"
SELECT min(amount) FROM transactions;
```

| min  |
| :--- |
| 12.5 |

```questdb-sql title="Lowest transaction amount, by payment_type"
SELECT payment_type, min(amount) FROM transactions;
```

| payment_type | min  |
| :----------- | :--- |
| cash         | 12.5 |
| card         | 15.3 |
| NULL         | 22.2 |

#### See also

- [max](#max) - Returns the maximum value
- [arg_min](#arg_min) - Returns another column's value at the row where this column is minimum

## mode

`mode(value)` - calculates the mode (most frequent) value out of a particular
dataset.

For `mode(B)`, if there are an equal number of `true` and `false` values, `true`
will be returned as a tie-breaker.

For other modes, if there are equal mode values, the returned value will be
whichever the code identifies first.

To make the result deterministic, you must enforce an underlying sort order.

#### Parameters

- `value` - one of (LONG, DOUBLE, BOOLEAN, STRING, VARCHAR, SYMBOL)

#### Return value

Return value type is the same as the type of the input `value`.

#### Examples

With this dataset:

| symbol    | value |
|-----------|-------|
| A         | alpha |
| A         | alpha |
| A         | alpha |
| A         | omega |
| B         | beta  |
| B         | beta  |
| B         | gamma |

```questdb-sql
SELECT symbol, mode(value) as mode FROM dataset;
```

| symbol | mode  |
|--------|-------|
| A      | alpha |
| B      | beta  |

On demo:

```questdb-sql title="mode() on demo" demo
SELECT symbol, mode(side)
FROM trades
WHERE timestamp IN today()
ORDER BY symbol ASC;
```

| symbol    | mode(side) |
|-----------|------------|
| ADA-USD   | buy        |
| ADA-USDT  | buy        |
| AVAX-USD  | sell       |
| AVAX-USDT | sell       |
| BTC-USD   | sell       |
| BTC-USDT  | sell       |
| ...       | ...        |

## nsum

`nsum(value)` - adds values ignoring missing data (e.g `NULL` values). Values
are added using the
[Neumaier sum algorithm](https://en.wikipedia.org/wiki/Kahan_summation_algorithm#Further_enhancements).
This is only beneficial for floating-point values such as `float` or `double`.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql
SELECT nsum(a)
FROM (SELECT rnd_double() a FROM long_sequence(100));
```

| nsum             |
| :--------------- |
| 49.5442334742831 |

## stddev / stddev_samp

`stddev_samp(value)` - Calculates the sample standard deviation of a set of
values, ignoring missing data (e.g., NULL values). The sample standard deviation
is a measure of the amount of variation or dispersion in a sample of a
population. A low standard deviation indicates that the values tend to be close
to the mean of the set, while a high standard deviation indicates that the
values are spread out over a wider range.

`stddev` is an alias for `stddev_samp`.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql
SELECT stddev_samp(x)
FROM (SELECT x FROM long_sequence(100));
```

| stddev_samp     |
| :-------------- |
| 29.011491975882 |

## stddev_pop

`stddev_pop(value)` - Calculates the population standard deviation of a set of
values. The population standard deviation is a measure of the amount of
variation or dispersion of a set of values. A low standard deviation indicates
that the values tend to be close to the mean of the set, while a high standard
deviation indicates that the values are spread out over a wider range.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql
SELECT stddev_pop(x)
FROM (SELECT x FROM long_sequence(100));
```

| stddev_pop        |
| :---------------- |
| 28.86607004772212 |

## string_agg

`string_agg(value, delimiter)` - Concatenates the given string values into a
single string with the delimiter used as a value separator.

#### Parameters

- `value` is a `varchar` value.
- `delimiter` is a `char` value.

#### Return value

Return value type is `varchar`.

#### Examples

```questdb-sql
SELECT string_agg(x::varchar, ',')
FROM (SELECT x FROM long_sequence(5));
```

| string_agg |
| :--------- |
| 1,2,3,4,5  |

## string_distinct_agg

`string_distinct_agg(value, delimiter)` - concatenates distinct non-NULL string
values into a single string, using the specified delimiter to separate the
values.

- `string_distinct_agg` ignores NULL values and only concatenates non-NULL
  distinct values.

- Order is guaranteed.

- Does not support `ORDER BY`.

#### Parameters

- `value`: A varchar or string column containing the values to be aggregated.
- `delimiter`: A char value used to separate the distinct values in the
  concatenated string.

#### Return value

Return value type is `string`.

#### Examples

Suppose we want to find all the distinct symbols observed in the trades
table in our public demo:

```questdb-sql title="string_distinct_agg example" demo
SELECT string_distinct_agg(symbol, ',') AS distinct_symbols
FROM trades
WHERE timestamp in today();
```

This query will return a single string containing all the distinct symbol values
separated by commas. Even though the `symbol` column may have many rows with
repeated values, `string_distinct_agg` aggregates only the unique non-NULL
values. The result is a comma-separated list of all distinct symbols observed.

Result:

| distinct_symbols                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BTC-USDT,BTC-USD,ETH-USDT,ETH-USD,SOL-USDT,SOL-USD,ADA-USDT,ADA-USD,XLM-USDT,XLM-USD,LTC-USDT,LTC-USD,UNI-USDT,UNI-USD,AVAX-USDT,AVAX-USD,DOT-USDT,DOT-USD,SOL-BTC,SOL-ETH,ETH-BTC,LTC-BTC,DAI-USDT,DAI-USD |

You can also group the aggregation by another column.

To find out which symbols are observed for each side:

```questdb-sql title="string_distinct_agg example with GROUP BY" demo
SELECT side, string_distinct_agg(symbol, ',') AS distinct_symbols
FROM trades
WHERE timestamp in today();
```

| side | distinct_symbols                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| buy  | BTC-USDT,BTC-USD,ETH-USDT,ETH-USD,ADA-USDT,ADA-USD,SOL-USDT,SOL-USD,LTC-USDT,LTC-USD,UNI-USDT,UNI-USD,DOT-USDT,DOT-USD,XLM-USDT,XLM-USD,SOL-BTC,AVAX-USDT,AVAX-USD,SOL-ETH,ETH-BTC,LTC-BTC,DAI-USDT,DAI-USD |
| sell | ETH-USDT,ETH-USD,SOL-USDT,SOL-USD,XLM-USDT,XLM-USD,BTC-USDT,BTC-USD,LTC-USDT,LTC-USD,AVAX-USDT,AVAX-USD,DOT-USDT,DOT-USD,SOL-BTC,ADA-USDT,ADA-USD,SOL-ETH,ETH-BTC,UNI-USDT,UNI-USD,DAI-USDT,DAI-USD,LTC-BTC |

Note we don't need to add `GROUP BY side` as it is implicit. But you can add it,
if you prefer that syntax.

## sum

`sum(value)` - adds values ignoring missing data (e.g `NULL` values).

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

```questdb-sql title="Sum all quantities in the transactions table"
SELECT sum(quantity) FROM transactions;
```

| sum |
| :-- |
| 100 |

```questdb-sql title="Sum all quantities in the transactions table, aggregated by item"
SELECT item, sum(quantity) FROM transactions;
```

| item   | sum |
| :----- | :-- |
| apple  | 53  |
| orange | 47  |

#### Overflow

`sum` does not perform overflow check. To avoid overflow, you can cast the
argument to wider type.

```questdb-sql title="Cast as long to avoid overflow"
SELECT sum(cast(a AS LONG)) FROM my_table;
```

#### See also

- [ksum](#ksum) - Kahan compensated sum for floating-point precision
- [nsum](#nsum) - Neumaier sum for floating-point precision
- [avg](#avg) - Arithmetic mean

## variance / var_samp

`var_samp(value)` - Calculates the sample variance of a set of values. The
sample variance is a measure of the amount of variation or dispersion of a set
of values in a sample from a population. A low variance indicates that the
values tend to be very close to the mean, while a high variance indicates that
the values are spread out over a wider range.

`variance()` is an alias for `var_samp`.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql
SELECT var_samp(x)
FROM (SELECT x FROM long_sequence(100));
```

| var_samp         |
| :--------------- |
| 841.666666666666 |

## var_pop

`var_pop(value)` - Calculates the population variance of a set of values. The
population variance is a measure of the amount of variation or dispersion of a
set of values. A low variance indicates that the values tend to be very close to
the mean, while a high variance indicates that the values are spread out over a
wider range.

#### Parameters

- `value` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql
SELECT var_pop(x)
FROM (SELECT x FROM long_sequence(100));
```

| var_pop |
| :------ |
| 833.25  |

## weighted_avg

`weighted_avg(value, weight)` - Calculates the weighted mean (average) of a set
of observations (database rows). It calculates the equivalent of:

$$
\bar{x}_w = \frac{\sum w_i x_i}{\sum w_i}
$$

Where:

- $x_i$ are the values
- $w_i$ are the weights

If the value is `NULL`, that observation is ignored.

If the weight is `NULL` or zero, that observation is ignored.

If there are no observations, the result is `NULL`.

If the weights sum to zero, the result is `NULL`.

Weights should be non-negative to make sense, but this isn't enforced.

#### Parameters

- `value` is any numeric value.
- `weight` is any numeric value.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Weighted average of transaction prices"
SELECT weighted_avg(price, quantity) FROM transactions;
```

| weighted_avg |
|:-------------|
| 25.3         |

## weighted_stddev

`weighted_stddev(value, weight)` - Calculates the unbiased weighted standard
deviation of a set of observations using reliability weights.

This is an alias for [weighted_stddev_rel](#weighted_stddev_rel).

## weighted_stddev_freq

`weighted_stddev_freq(value, weight)` - Calculates the unbiased weighted
standard deviation of a set of observations using frequency weights.

A **frequency weight** represents the number of occurrences of each observation
in the dataset. This variant uses the frequency-weighted estimator for the
population variance. It calculates the equivalent of:

$$
\sqrt{
  \frac{
    \sum w_i x_i^2 - \frac{(\sum w_i x_i)^2}{\sum w_i}
  }{
    \sum w_i - 1
  }
}
$$

Where:

- $x_i$ are the values
- $w_i$ are the frequency weights

If the value is `NULL`, that observation is ignored.

If the weight is `NULL` or zero, that observation is ignored.

If there are fewer than two observations, the result is `NULL`.

Weights should be positive integers to make sense, but this isn't enforced.

Weights must not be normalized. If they sum to one, the result is `NULL`.

If the sum of weights is negative, the result is `NULL`.

#### Parameters

- `value` is any numeric value.
- `weight` is any numeric value representing the frequency weight (typically an
  integer).

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Weighted standard deviation of binned prices"
SELECT weighted_stddev_freq(price_bucket, trade_count) FROM price_histogram;
```

| weighted_stddev_freq |
| :------------------- |
| 3.42                 |

```questdb-sql title="Weighted standard deviation of bucketed trade data by symbol"
SELECT symbol, weighted_stddev_freq(price_bucket, trade_count)
FROM trade_histogram
GROUP BY symbol;
```

| symbol  | weighted_stddev_freq |
| :------ | :------------------- |
| BTC-USD | 115.67               |
| ETH-USD | 22.18                |

## weighted_stddev_rel

`weighted_stddev_rel(value, weight)` - Calculates the unbiased weighted standard
deviation of a set of observations using reliability weights. You can also use
the shorthand name `weighted_stddev`.

A **reliability weight** represents the "importance" or "trustworthiness" of
each observation. This variant uses the reliability-weighted estimator for the
population variance. It calculates the equivalent of:

$$
\sqrt{
  \frac{
    \sum w_i x_i^2 - \frac{(\sum w_i x_i)^2}{\sum w_i}
  }{
    \sum w_i - \frac{\sum w_i^2}{\sum w_i}
  }
}
$$

Where:

- $x_i$ are the values
- $w_i$ are the reliability weights

If the value is `NULL`, that observation is ignored.

If the weight is `NULL` or zero, that observation is ignored.

If there are fewer than two observations, the result is `NULL`.

Weights should be positive to make sense, but this isn't enforced.

If the sum of weights is not positive, the result is `NULL`.

#### Parameters

- `value` is any numeric value.
- `weight` is any numeric value representing the reliability weight.

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Weighted standard deviation of prices by trade volume"
SELECT weighted_stddev(price, volume) FROM trades;
```

| weighted_stddev |
| :-------------- |
| 2.45            |

```questdb-sql title="Weighted standard deviation grouped by symbol"
SELECT symbol, weighted_stddev(price, volume)
FROM trades
GROUP BY symbol;
```

| symbol  | weighted_stddev |
| :------ | :-------------- |
| BTC-USD | 125.34          |
| ETH-USD | 18.92           |

## See also

- [GROUP BY](/docs/query/sql/group-by/) - Group rows for aggregation
- [SAMPLE BY](/docs/query/sql/sample-by/) - Time-series aggregation
- [PIVOT](/docs/query/sql/pivot/) - Transform aggregation results from rows to columns
