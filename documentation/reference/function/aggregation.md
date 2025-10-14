---
title: Aggregate functions
sidebar_label: Aggregate
description: Aggregate functions reference documentation.
---

This page describes the available functions to assist with performing aggregate
calculations.


:::note 

QuestDB does not support using aggregate functions as arguments to other functions. For example, this is not allowed:

```questdb-sql
SELECT datediff('d', min(timestamp), max(timestmap)) FROM trades;
```

Running it will result in the following error:

`Aggregate function cannot be passed as an argument`

You can work around this limitation by using CTEs or subqueries:

```questdb-sql title="aggregates as function args workaround" demo
-- CTE
WITH minmax AS (
    SELECT min(timestamp) as min_date, max(timestamp) as max_date FROM trades     
)
SELECT datediff('d', min_date, max_date) FROM minmax;

-- Subquery
SELECT datediff('d', min_date, max_date) FROM (
    SELECT min(timestamp) as min_date, max(timestamp) as max_date FROM trades    
);
```

:::

## approx_count_distinct

`approx_count_distinct(column_name, precision)` - estimates the number of
distinct non-`null` values in `IPv4`, `int`, or `long` columns using the
[HyperLogLog](/glossary/HyperLogLog/) data structure, which provides an
approximation rather than an exact count.

The precision of HyperLogLog can be controlled via the optional `precision`
parameter, typically between 4 and 16. A higher precision leads to more accurate
results with increased memory usage. The default is 1.

This function is useful within [high cardinality](/glossary/high-cardinality/)
datasets where an exact count is not required. Thus consider it the higher
cardinality alternative to
[`count_distinct`](/docs/reference/function/aggregation/#count_distinct).

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

```questdb-sql title="Estimate count of distinct IPv4 addresses with precision 5"
SELECT approx_count_distinct(ip_address, 5) FROM logs;
```

| approx_count_distinct |
| :-------------------- |
| 1234567               |

---

```questdb-sql title="Estimate count of distinct user_id (int) values by date"
SELECT date, approx_count_distinct(user_id) FROM sessions GROUP BY date;
```

| date       | approx_count_distinct |
| :--------- | :-------------------- |
| 2023-01-01 | 2358                  |
| 2023-01-02 | 2491                  |
| ...        | ...                   |

---

```questdb-sql title="Estimate count of distinct product_id values by region"
SELECT region, approx_count_distinct(product_id) FROM sales GROUP BY region;
```

| region | approx_count_distinct |
| :----- | :-------------------- |
| North  | 1589                  |
| South  | 1432                  |
| East   | 1675                  |
| West   | 1543                  |

---

```questdb-sql title="Estimate count of distinct order_ids with precision 8"
SELECT approx_count_distinct(order_id, 8) FROM orders;
```

| approx_count_distinct |
| :-------------------- |
| 3456789               |

---

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
SELECT approx_percentile(latency, 0.99) FROM request_logs;
```

| approx_percentile |
| :---------------- |
| 101.5             |

## approx_median

`approx_median(value, precision)` calculates the approximate median (50th percentile) of a set of non-negative numeric values using the [HdrHistogram](http://hdrhistogram.org/) algorithm. This is equivalent to calling `approx_percentile(value, 0.5, precision)`.

The function will throw an error if any negative values are encountered in the input. All input values must be non-negative.

#### Parameters

- `value` is any non-negative numeric value.
- `precision` (optional) is an `int` value between 0 and 5, inclusive. This is the number of significant decimal digits to which the histogram will maintain value resolution and separation. Higher precision leads to more accurate results with increased memory usage. Defaults to 1 (lower accuracy, high efficiency).

#### Return value

Return value type is `double`.

#### Examples

```questdb-sql title="Calculate approximate median price by symbol" demo
SELECT symbol, approx_median(price) FROM trades GROUP BY symbol;
```

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.31     |
| ETH-USD | 2615.46      |

```questdb-sql title="Calculate approximate median with higher precision" demo
SELECT symbol, approx_median(price, 3) FROM trades GROUP BY symbol;
```

| symbol  | approx_median |
| :------ | :----------- |
| BTC-USD | 39265.312    |
| ETH-USD | 2615.459     |

## avg

`avg(value)` calculates simple average of values ignoring missing data (e.g
`null` values).

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
| null         | 18.02 |

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

| payment_type | avg  |
| :----------- | :--- |
| cash         | 0.85 |
| card         | 0.92 |
| null         | 0.78 |

## count

- `count()` or `count(*)` - counts the number of rows irrespective of underlying
  data.
- `count(column_name)` - counts the number of non-null values in a given column.

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
| null         | 5     |

Count non-null transaction amounts:

```questdb-sql
SELECT count(amount) FROM transactions;
```

| count |
| :---- |
| 95    |

Count non-null transaction amounts by `payment_type`:

```questdb-sql
SELECT payment_type, count(amount) FROM transactions;
```

| payment_type | count |
| :----------- | :---- |
| cash         | 24    |
| card         | 67    |
| null         | 4     |

:::note

`null` values are aggregated with `count()`, but not with `count(column_name)`

:::

## count_distinct

`count_distinct(column_name)` - counts distinct non-`null` values in `varchar`,
`symbol`, `long256`, `UUID`, `IPv4`, `long`, `int` or `string` columns.

#### Return value

Return value type is `long`.

#### Examples

- Count of distinct sides in the transactions table. Side column can either be
  `BUY` or `SELL` or `null`.

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
| null         | 5              |

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
| null         | 13.5      |

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
| null         | 14.1       |

## first

- `first(column_name)` - returns the first value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `character`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar` and
`uuid`.

If a table has a [designated timestamp](/docs/concept/designated-timestamp/),
then the first row is always the row with the lowest timestamp (oldest). For a table
without a designated timestamp column, `first` returns the first row regardless of any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `sensors`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns oldest value for the `device_id` column:

```questdb-sql
SELECT first(device_id) FROM sensors;
```

| first      |
| :--------- |
| arduino-01 |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`sensors_unordered`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the first record for the `device_id` column:

```questdb-sql
SELECT first(device_id) FROM sensors_unordered;
```

| first      |
| :--------- |
| arduino-01 |

## first_not_null

- `first_not_null(column_name)` - returns the first non-null value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `char`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar` and
`uuid`.

If a table has a designated timestamp, then the first non-null row is always the
row with the lowest timestamp (oldest). For a table without a designated
timestamp column, `first_not_null` returns the first non-null row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `sensors`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns oldest non-null value for the device_id column:

```questdb-sql
SELECT first_not_null(device_id) FROM sensors;
```

| first_not_null |
| :------------- |
| arduino-02     |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`sensors_unordered`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the first non-null record for the device_id column:

```questdb-sql
SELECT first_not_null(device_id) FROM sensors_unordered;
```

| first_not_null |
| :------------- |
| arduino-03     |

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
  FROM table rides
```

## ksum

`ksum(value)` - adds values ignoring missing data (e.g `null` values). Values
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
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar` and
`uuid`.

If a table has a [designated timestamp](/docs/concept/designated-timestamp/), the
last row is always the one with the highest (latest) timestamp.

For a table without a designated timestamp column, `last`
returns the last inserted row, regardless of any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `sensors`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns the latest symbol value for the `device_id` column:

```questdb-sql
SELECT last(device_id) FROM sensors;
```

| last       |
| :--------- |
| arduino-03 |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`sensors_unordered`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| arduino-01 | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the last record for the `device_id` column:

```questdb-sql
SELECT last(device_id) FROM sensors_unordered;
```

| last       |
| :--------- |
| arduino-02 |


## last_not_null

- `last_not_null(column_name)` - returns the last non-null value of a column.

Supported column datatype: `double`, `float`, `integer`, `IPv4`, `char`,
`short`, `byte`, `timestamp`, `date`, `long`, `geohash`, `symbol`, `varchar` and
`uuid`.

If a table has a designated timestamp, then the last non-null row is always the
row with the highest timestamp (most recent). For a table without a designated
timestamp column, `last_not_null` returns the last non-null row, regardless of
any timestamp column.

#### Return value

Return value type is the same as the type of the argument.

#### Examples

Given a table `sensors`, which has a designated timestamp column:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |

The following query returns most recent non-null value for the device_id column:

```questdb-sql
SELECT last_not_null(device_id) FROM sensors;
```

| last_not_null |
| :------------ |
| arduino-03    |

Without selecting a designated timestamp column, the table may be unordered and
the query may return different result. Given an unordered table
`sensors_unordered`:

| device_id  | temperature | ts                          |
| :--------- | :---------- | :-------------------------- |
| null       | 12          | 2021-06-02T14:33:19.970258Z |
| arduino-03 | 18          | 2021-06-02T14:33:23.707013Z |
| arduino-02 | 10          | 2021-06-02T14:33:21.703934Z |

The following query returns the last non-null record for the `device_id` column:

```questdb-sql
SELECT last_not_null(device_id) FROM sensors_unordered;
```

| last_not_null |
| :------------ |
| arduino-02    |




## max

`max(value)` - returns the highest value ignoring missing data (e.g `null`
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

| payment_type | amount |
| :----------- | :----- |
| cash         | 31.5   |
| card         | 55.3   |
| null         | 29.2   |

## min

`min(value)` - returns the lowest value ignoring missing data (e.g `null`
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
| null         | 22.2 |


## mode

`mode(value)` - calculates the mode (most frequent) value out of a particular dataset.

For `mode(B)`, if there are an equal number of `true` and `false` values, `true` will be returned as a tie-breaker.

For other modes, if there are equal mode values, the returned value will be whichever the code identifies first.

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

`nsum(value)` - adds values ignoring missing data (e.g `null` values). Values
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
values, ignoring missing data (e.g., null values). The sample standard deviation
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

| stddev_samp       |
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

`string_distinct_agg(value, delimiter)` - concatenates distinct non-null string
values into a single string, using the specified delimiter to separate the
values.

- `string_distinct_agg` ignores null values and only concatenates non-null
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

Suppose we want to find all the distinct sky cover types observed in the weather
tablein our public demo:

```questdb-sql title="string_distinct_agg example" demo
SELECT string_distinct_agg(skyCover, ',') AS distinct_sky_covers
FROM weather;
```

This query will return a single string containing all the distinct skyCover
values separated by commas. The skyCover column contains values such as OVC
(Overcast), BKN (Broken clouds), SCT (Scattered clouds), and CLR (Clear skies).
Even though the skyCover column may have many rows with repeated values,
`string_distinct_agg` aggregates only the unique non-null values. The result is a
comma-separated list of all distinct sky cover conditions observed.

Result:

| distinct_sky_covers |
| ------------------- |
| OVC,BKN,SCT,CLR,OBS |

You can also group the aggregation by another column.

To find out which sky cover conditions are observed for each wind direction:

```questdb-sql title="string_distinct_agg example with GROUP BY" demo
SELECT windDir, string_distinct_agg(skyCover, ',') AS distinct_sky_covers
FROM weather
GROUP BY windDir;
```

| windDir | distinct_sky_covers |
| ------- | ------------------- |
| 30      | OVC,BKN             |
| 45      | BKN,SCT             |
| 60      | OVC,SCT,CLR         |

## sum

`sum(value)` - adds values ignoring missing data (e.g `null` values).

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

| item   | count |
| :----- | :---- |
| apple  | 53    |
| orange | 47    |

#### Overflow

`sum` does not perform overflow check. To avoid overflow, you can cast the
argument to wider type.

```questdb-sql title="Cast as long to avoid overflow"
SELECT sum(cast(a AS LONG)) FROM table;
```

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

| stddev_samp      |
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

| stddev_samp |
| :---------- |
| 833.25      |
