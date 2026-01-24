---
title: Random value generator
sidebar_label: Random value generator
description: Random value generator function reference documentation.
---

These functions generate random values for creating test datasets that mimic the
structure of real data. They are used together with
[row generators](/docs/query/functions/row-generator/) like `long_sequence()`.

## Quick start

```questdb-sql title="Generate 1 million rows of time series data"
SELECT
    timestamp_sequence('2024-01-01', 100000L) AS ts,
    rnd_symbol('AAPL', 'GOOGL', 'MSFT', 'AMZN') AS ticker,
    rnd_symbol('BUY', 'SELL') AS side,
    rnd_double() * 1000 AS price,
    rnd_int(1, 10000, 0) AS quantity
FROM long_sequence(1000000);
```

This generates trades with monotonically increasing timestamps (100ms apart).
For timestamp generation options, see
[timestamp_sequence](/docs/query/functions/row-generator/#timestamp_sequence).

Values can be generated either:

- Pseudo-randomly
- [Deterministically](/docs/query/functions/row-generator/#long_sequence) when
  specifying a `seed` to `long_sequence()`

## Function reference

- [rnd_boolean](#rnd_boolean)
- [rnd_byte](#rnd_byte)
- [rnd_short](#rnd_short)
- [rnd_int](#rnd_int)
- [rnd_long](#rnd_long)
- [rnd_long256](#rnd_long256)
- [rnd_float](#rnd_float)
- [rnd_double](#rnd_double)
- [rnd_date](#rnd_date)
- [rnd_timestamp](#rnd_timestamp)
- [rnd_char](#rnd_char)
- [rnd_symbol](#rnd_symbol)
- [rnd_symbol_zipf](#rnd_symbol_zipf)
- [rnd_symbol_weighted](#rnd_symbol_weighted)
- [rnd_varchar](#rnd_varchar)
- [rnd_str](#rnd_str)
- [rnd_bin](#rnd_bin)
- [rnd_uuid4](#rnd_uuid4)
- [rnd_ipv4](#rnd_ipv4)
- [rnd_double_array](#rnd_double_array)
- [rnd_decimal](#rnd_decimal)

## Usage

:::warning

Random functions generate a new value **every time they are evaluated**, not
once per row. This causes unexpected results when the same column is referenced
multiple times in a query.

:::

For example, this query filters on `val` and also returns it:

```questdb-sql title="Problematic: val is evaluated twice with different results"
SELECT val FROM (
    SELECT rnd_int(1, 100, 0) AS val FROM long_sequence(10)
) WHERE val > 50;
```

The `val` in the `WHERE` clause is a **different random value** than the `val`
in the `SELECT`. This means rows may be included or excluded based on one value,
but display a completely different value.

**Solution:** Persist data to a table first, then query it:

```questdb-sql title="Correct: persist first, then query"
CREATE TABLE test AS (
    SELECT
        timestamp_sequence('2024-01-01', 100000L) AS ts,
        rnd_int(1, 100, 0) AS val
    FROM long_sequence(10)
) TIMESTAMP(ts);

SELECT * FROM test WHERE val > 50;
```

This also applies to calculations like `SELECT round(a, 2), a FROM ...` where
`a` would be rounded and displayed as different values.

## rnd_boolean

`rnd_boolean()` - generates a random `boolean` value, either `true` or `false`,
both having equal probability.

**Return value:**

Return value type is `boolean`.

**Examples:**

```questdb-sql title="Random boolean"
SELECT
    value a,
    count() b
FROM (SELECT rnd_boolean() value FROM long_sequence(100));
```

| a     | b   |
| ----- | --- |
| true  | 47  |
| false | 53  |

## rnd_byte

- `rnd_byte()` - returns a random integer which can take any value between `0`
  and `127`.
- `rnd_byte(min, max)` - generates byte values in a specific range (for example
  only positive, or between 1 and 10).

**Arguments:**

- `min`: is a `byte` representing the lowest possible generated value
  (inclusive).
- `max`: is a `byte` representing the highest possible generated value
  (inclusive).

**Return value:**

Return value type is `byte`.

**Examples:**

```questdb-sql title="Random byte"
SELECT rnd_byte() FROM long_sequence(5);
SELECT rnd_byte(-1,1) FROM long_sequence(5);
```

```
122,34,17,83,24
0,1,-1,-1,0
```

## rnd_short

- `rnd_short()` - returns a random integer which can take any value between
  `-32768` and `32767`.
- `rnd_short(min, max)` - returns short values in a specific range (for example
  only positive, or between 1 and 10). Supplying `min` above `max` will result
  in an `invalid range` error.

**Arguments:**

- `min`: is a `short` representing the lowest possible generated value
  (inclusive).
- `max`: is a `short` representing the highest possible generated value
  (inclusive).

**Return value:**

Return value type is `short`.

**Examples:**

```questdb-sql title="Random short"
SELECT rnd_short() FROM long_sequence(5);
SELECT rnd_short(-1,1) FROM long_sequence(5);
```

```
-27434,234,-12977,8843,24
0,1,-1,-1,0
```

## rnd_int

- `rnd_int()` is used to return a random integer which can take any value
  between `-2147483648` and `2147483647`.
- `rnd_int(min, max, nanRate)` is used to generate int values in a specific
  range (for example only positive, or between 1 and 10), or to get occasional
  `NaN` values along with int values.

**Arguments:**

- `min`: is an `int` representing the lowest possible generated value
  (inclusive).
- `max`: is an `int` representing the highest possible generated value
  (inclusive).
- `nanRate` is an `int` defining the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is `int`.

**Examples:**

```questdb-sql title="Random int"
SELECT rnd_int() FROM long_sequence(5)
SELECT rnd_int(1,4,0) FROM long_sequence(5);
SELECT rnd_int(1,4,1) FROM long_sequence(5);
SELECT rnd_int(1,4,2) FROM long_sequence(5);
```

```
1822685476, 1173192835, -2808202361, 78121757821, 44934191
1,4,3,1,2
null,null,null,null,null
1,null,4,null,2
```

## rnd_long

- `rnd_long()` is used to return a random signed integer between
  `0x8000000000000000L` and `0x7fffffffffffffffL`.
- `rnd_long(min, max, nanRate)` is used to generate long values in a specific
  range (for example only positive, or between 1 and 10), or to get occasional
  `NaN` values along with int values.

**Arguments:**

- `min`: is a `long` representing the lowest possible generated value
  (inclusive).
- `max`: is a `long` representing the highest possible generated value
  (inclusive).
- `nanRate` is an `int` defining the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be `NaN`.

**Return value:**

Return value type is `long`.

**Examples:**

```questdb-sql title="Random long"
SELECT rnd_long() FROM long_sequence(5);
SELECT rnd_long(1,4,0) FROM long_sequence(5);
SELECT rnd_long(1,4,1) FROM long_sequence(5);
SELECT rnd_long(-10000000,10000000,2) FROM long_sequence(5);
```

```
1,4,3,1,2
null,null,null,null,null
-164567594, -323331140, 26846334, -892982893, -351053301
300291810703592700, 2787990010234796000, 4305203476273459700, -8518907563589124000, 8443756723558216000
```

## rnd_long256

- `rnd_long256()` - generates a random `long256` value between 0 and 2^256.

**Return value:**

Return value type is `long256`.

**Examples:**

```questdb-sql title="Random long256"
SELECT rnd_long256() FROM long_sequence(5);
```

```
0x5dd94b8492b4be20632d0236ddb8f47c91efc2568b4d452847b4a645dbe4871a,
0x55f256188b3474aca83ccc82c597668bb84f36d3f5b25afd9e194c1867625918,
0x630c6f02c1c2e0c2aa4ac80ab684aa36d91dd5233cc185bb7097400fa12e7de0,
0xa9eeaa5268f911f4bcac2e89b621bd28bba90582077fc9fb9f14a53fcf6368b7,
0x7c80546eea2ec093a5244e39efad3f39c5489d2337007fd0b61d8b141058724d
```

## rnd_float

- `rnd_float()` - generates a random **positive** `float` between 0 and 1.
- `rnd_float(nanRate)` - generates a random **positive** `float` between 0 and 1
  which will be `NaN` at a frequency defined by `nanRate`.

**Arguments:**

- `nanRate` is an `int` defining the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be `NaN`.

**Return value:**

Return value type is `float`.

**Examples:**

```questdb-sql title="Random float"
SELECT rnd_float() FROM long_sequence(5);
SELECT rnd_float(2) FROM long_sequence(6);
```

```
0.3821478, 0.5162148, 0.22929084, 0.03736937, 0.39675003
0.08108246, 0.7082644, null, 0.6784522, null, 0.5711276
```

## rnd_double

- `rnd_double()` - generates a random **positive** `double` between 0 and 1.
- `rnd_double(nanRate)` - generates a random **positive** `double` between 0 and
  1 which will be `NaN` at a frequency defined by `nanRate`.

**Arguments:**

- `nanRate` is an `int` defining the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be `NaN`.

**Return value:**

Return value type is `double`.

**Examples:**

```questdb-sql title="Random double"
SELECT rnd_double() FROM long_sequence(5);
SELECT rnd_double(2) FROM long_sequence(5);
```

```
0.99115364871, 0.31011470271, 0.10776479191, 0.53938281731, 0.89820403511
0.99115364871, null, null, 0.53938281731, 0.89820403511
```

## rnd_date

- `rnd_date(start, end, nanRate)` - generates a random date between `start` and
  `end` dates (both inclusive). It will also generate `NaN` values at a
  frequency defined by `nanRate`. When `start` or `end` are invalid dates, or
  when `start` is superior to `end`, it will return `invalid range` error. When
  `nanRate` is inferior to 0, it will return `invalid NAN rate` error.

**Arguments:**

- `start` is a `date` defining the minimum possible generated date (inclusive)
- `end` is a `date` defining the maximum possible generated date (inclusive)
- `nanRate` defines the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is `date`.

**Examples:**

```questdb-sql title="Random date"
SELECT rnd_date(
    to_date('2015', 'yyyy'),
    to_date('2016', 'yyyy'),
    0)
FROM long_sequence(5);
```

```
2015-01-29T18:00:17.402Z, 2015-11-15T20:22:14.112Z,
2015-12-08T09:26:04.483Z, 2015-05-28T02:22:47.022Z,
2015-10-13T19:16:37.034Z
```

## rnd_timestamp

- `rnd_timestamp(start, end, nanRate)` - generates a random timestamp between
  `start` and `end` timestamps (both inclusive). It will also generate `NaN`
  values at a frequency defined by `nanRate`. When `start` or `end` are invalid
  timestamps, or when `start` is superior to `end`, it will return
  `invalid range` error. When `nanRate` is inferior to 0, it will return
  `invalid NAN rate` error.

**Arguments:**

- `start` is a `timestamp` defining the minimum possible generated timestamp
  (inclusive)
- `end` is a `timestamp` defining the maximum possible generated timestamp
  (inclusive)
- `nanRate` defines the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be NaN.

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql title="Random timestamp"
SELECT rnd_timestamp(
    to_timestamp('2015', 'yyyy'),
    to_timestamp('2016', 'yyyy'),
    0)
FROM long_sequence(5);
```

```
2015-01-29T18:00:17.402762Z, 2015-11-15T20:22:14.112744Z,
2015-12-08T09:26:04.483039Z, 2015-05-28T02:22:47.022680Z,
2015-10-13T19:16:37.034203Z
```

:::tip

To generate increasing timestamps, refer to the page about
[row generators](/docs/query/functions/row-generator/).

:::

## rnd_char

- `rnd_char()` is used to generate a random `char` which will be an uppercase
  character from the 26-letter A to Z alphabet. Letters from A to Z will be
  generated with equal probability.

**Return value:**

Return value type is `char`.

**Examples:**

```questdb-sql title="Random char"
SELECT rnd_char() FROM long_sequence(5);
```

```
G, P, E, W, K
```

## rnd_symbol

- `rnd_symbol(symbolList)` - chooses a random `symbol` from a list defined by
  the user. It is useful when looking to generate specific symbols from a finite
  list (e.g., `BUY, SELL` or `AUTUMN, WINTER, SPRING, SUMMER`). Symbols are
  randomly chosen from the list with equal probability. When only one symbol is
  provided in the list, this symbol will be chosen with 100% probability, in
  which case it is more efficient to use `cast('your_symbol' as symbol)`.
- `rnd_symbol(list_size, minLength, maxLength, nullRate)` - generates a finite
  list of distinct random symbols and chooses one symbol from the list at
  random. The finite list is of size `list_size`. The generated symbols length
  is between `minLength` and `maxLength` (both inclusive). The function will
  also generate `null` values at a rate defined by `nullRate`.

**Arguments:**

- `symbolList` is a variable-length list of possible `symbol` values expressed
  as a comma-separated list of strings. For example,
  `'a', 'bcd', 'efg123', '行'`
- `list_size` is the number of distinct `symbol` values to generate.
- `minLength` is an `int` defining the minimum length of a generated symbol
  (inclusive).
- `maxLength` is an `int` defining the maximum length of a generated symbol
  (inclusive).
- `nullRate` is an `int` defining the frequency of occurrence of `null` values:
  - `0`: No `null` will be returned.
  - `1`: Will only return `null`.
  - `N > 1`: On average, one in N generated values will be `null`.

**Return value:**

Return value type is `symbol`.

**Examples:**

```questdb-sql title="Random symbol from a list"
SELECT rnd_symbol('ABC','def', '123')
FROM long_sequence(5);
```

```
'ABC', '123', 'def', '123', 'ABC'
```

```questdb-sql title="Random symbol, randomly generated"
SELECT rnd_symbol(2, 3, 4, 0)
FROM long_sequence(5);
```

```
'ABC', 'DEFG', 'ABC', 'DEFG', 'DEFG'
```

## rnd_symbol_zipf

Generates random symbols following a Zipf (Power Law) distribution. This is
useful for creating test data that mimics real-world scenarios where some values
occur much more frequently than others (e.g., stock tickers, user IDs, product
categories).

- `rnd_symbol_zipf(symbol1, symbol2, ..., alpha)` - chooses symbols from a
  provided list with Zipf distribution. The probability of each symbol decays
  from left to right based on the `alpha` parameter. Higher alpha values create
  more skewed distributions where the first symbols appear much more frequently.
- `rnd_symbol_zipf(count, alpha)` - generates `count` distinct auto-generated
  symbols (named `S0`, `S1`, `S2`, etc.) with Zipf distribution. Useful for
  testing with high-cardinality symbols that have skewed row distribution.

:::note

QuestDB distinguishes between these two forms by checking if the first argument
is an integer. If calling `rnd_symbol_zipf(5, 2.0)`, it generates 5 auto-named
symbols. To select from a list starting with a number-like symbol, use explicit
string syntax: `rnd_symbol_zipf('5', '10', '15', 2.0)`.

:::

**Arguments:**

For the list form (`rnd_symbol_zipf(symbol1, symbol2, ..., alpha)`):

- `symbol1, symbol2, ...` is a variable-length list of `string` or `symbol`
  values. The first symbol has the highest probability of being selected.
- `alpha` is a positive `double` controlling the distribution skew. Higher
  values create steeper probability decay. Must be greater than `0`.

For the count form (`rnd_symbol_zipf(count, alpha)`):

- `count` is an `int` specifying how many distinct symbols to generate. Must be
  positive.
- `alpha` is a positive `double` controlling the distribution skew. Must be
  greater than `0`.

**Return value:**

Return value type is `symbol`.

**Examples:**

```questdb-sql title="Zipf distribution from a list of symbols"
SELECT rnd_symbol_zipf('AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 2.0) AS ticker
FROM long_sequence(5);
```

```
AAPL
AAPL
MSFT
AAPL
AAPL
```

```questdb-sql title="Verify Zipf distribution (alpha=2.0)"
SELECT
    ticker,
    count() AS cnt
FROM (
    SELECT rnd_symbol_zipf('AAPL', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 2.0) AS ticker
    FROM long_sequence(100000)
)
GROUP BY ticker
ORDER BY cnt DESC;
```

| ticker | cnt   |
| ------ | ----- |
| AAPL   | 60654 |
| MSFT   | 15265 |
| GOOGL  | 6823  |
| TSLA   | 3838  |
| AMZN   | 2420  |

```questdb-sql title="High-cardinality auto-generated symbols"
SELECT rnd_symbol_zipf(1000, 1.5) AS sym
FROM long_sequence(5);
```

```
S0
S2
S0
S1
S0
```

## rnd_symbol_weighted

Generates random symbols with explicit weights. Each symbol is paired with a
weight that determines its relative probability of being selected.

- `rnd_symbol_weighted(symbol1, weight1, symbol2, weight2, ...)` - takes
  symbol-weight pairs. Weights are relative, so `('A', 50, 'B', 50)` and
  `('A', 1, 'B', 1)` produce the same 50/50 distribution.

**Arguments:**

- Arguments must be provided in pairs: a symbol followed by its weight.
- `symbol` is a `string` or `symbol` value.
- `weight` is a non-negative number (`int` or `double`) representing the
  relative weight. A weight of `0` means the symbol will never be selected.

**Return value:**

Return value type is `symbol`.

**Examples:**

```questdb-sql title="Weighted symbol distribution"
SELECT rnd_symbol_weighted('AAPL', 50, 'MSFT', 30, 'GOOGL', 15, 'TSLA', 5) AS ticker
FROM long_sequence(5);
```

```
AAPL
MSFT
AAPL
AAPL
GOOGL
```

```questdb-sql title="Verify weighted distribution"
SELECT
    ticker,
    count() AS cnt
FROM (
    SELECT rnd_symbol_weighted('AAPL', 50, 'MSFT', 30, 'GOOGL', 15, 'TSLA', 5) AS ticker
    FROM long_sequence(100000)
)
GROUP BY ticker
ORDER BY cnt DESC;
```

| ticker | cnt   |
| ------ | ----- |
| AAPL   | 50021 |
| MSFT   | 29894 |
| GOOGL  | 15052 |
| TSLA   | 5033  |

## rnd_varchar

- `rnd_varchar(stringList)` - chooses a random `varchar` string from a list
  defined by the user. It is useful when looking to generate specific strings
  from a finite list (e.g., `BUY, SELL` or `AUTUMN, WINTER, SPRING, SUMMER`).
  Strings are randomly chosen from the list with equal probability. When only
  one string is provided in the list, this string will be chosen with 100%
  probability.
- `rnd_varchar(minLength, maxLength, nullRate)` - generates strings of a length
  between `minLength` and `maxLength` (both inclusive). The function
  will also generate `null` values at a rate defined by `nullRate`.

**Arguments:**

- `stringList` is a variable-length list of possible `string` values expressed
  as a comma-separated list of strings. For example, `'a', 'bcd', 'efg123', '行'`
- `minLength` is an `int` defining the minimum length of a generated string
  (inclusive).
- `maxLength` is an `int` defining the maximum length of a generated string
  (inclusive).
- `nullRate` is an `int` defining the frequency of occurrence of `null` values:
  - `0`: No `null` will be returned.
  - `1`: Will only return `null`.
  - `N > 1`: On average, one in N generated values will be `null`.

**Return value:**

Return value type is `varchar`.

**Examples:**

```questdb-sql title="Random string from a list"
SELECT rnd_varchar('ABC','def', '123')
FROM long_sequence(5);
```

```
'ABC', '123', 'def', '123', 'ABC'
```

```questdb-sql title="Random strings, including null, between min and max length."
SELECT rnd_varchar(2, 2, 4)
FROM long_sequence(4);
```

```text
'潃', 'Ԓ㠗', '콻薓', '8>'
```

## rnd_str

- `rnd_str(stringList)` - chooses a random `string` from a list defined by the
  user. It is useful when looking to generate specific strings from a finite
  list (e.g., `BUY, SELL` or `AUTUMN, WINTER, SPRING, SUMMER`). Strings are
  randomly chosen from the list with equal probability. When only one string is
  provided in the list, this string will be chosen with 100% probability.
- `rnd_str(minLength, maxLength, nullRate)` - generates strings of a length
  between `minLength` and `maxLength` (both inclusive). The function will also
  generate `null` values at a rate defined by `nullRate`.
- `rnd_str(list_size, minLength, maxLength, nullRate)` - generates a finite list
  of distinct random strings and chooses one string from the list at random.

**Arguments:**

- `stringList` is a variable-length list of possible `string` values expressed
  as a comma-separated list of strings. For example, `'a', 'bcd', 'efg123', '行'`
- `list_size` is an optional `int` declaring the number of distinct `string`
  values to generate.
- `minLength` is an `int` defining the minimum length of a generated string
  (inclusive).
- `maxLength` is an `int` defining the maximum length of a generated string
  (inclusive).
- `nullRate` is an `int` defining the frequency of occurrence of `null` values:
  - `0`: No `null` will be returned.
  - `1`: Will only return `null`.
  - `N > 1`: On average, one in N generated values will be `null`.

**Return value:**

Return value type is `string`.

**Examples:**

```questdb-sql title="Random string from a list"
SELECT rnd_str('ABC','def', '123')
FROM long_sequence(5);
```

```
'ABC', '123', 'def', '123', 'ABC'
```

```questdb-sql title="Random strings, including null, between min and max length."
SELECT rnd_str(2, 2, 4)
FROM long_sequence(8);
```

```
'AB', 'CD', null, 'EF', 'CD', 'EF', null, 'AB'
```

```questdb-sql title="5 strings from a set of 3 distinct strings, each 2 characters long, no nulls."
SELECT rnd_str(3, 2, 2, 0) FROM long_sequence(5);
```

```
'DS', 'GG', 'XS', 'GG', 'XS'
```

## rnd_bin

- `rnd_bin()` generates random binary data of a size up to `32` bytes.
- `rnd_bin(minBytes, maxBytes, nullRate)` generates random binary data of a size
  between `minBytes` and `maxBytes` and returns `null` at a rate defined by
  `nullRate`.

**Arguments:**

- `minBytes` is a `long` defining the minimum size in bytes of a generated
  binary (inclusive).
- `maxBytes` is a `long` defining the maximum size in bytes of a generated
  binary (inclusive).
- `nullRate` is an `int` defining the frequency of occurrence of `null` values:
  - `0`: No `null` will be returned.
  - `1`: Will only return `null`.
  - `N > 1`: On average, one in N generated values will be `null`.

**Return value:**

Return value type is `binary`.

**Examples:**

```questdb-sql title="Random binary"
SELECT rnd_bin() FROM long_sequence(5);
SELECT rnd_bin(2, 5, 2) FROM long_sequence(5);
```

## rnd_uuid4

- `rnd_uuid4()` is used to generate a random
  [UUID](/docs/query/datatypes/overview/#the-uuid-type).
- The generated UUIDs are
  [version 4](<https://en.wikipedia.org/wiki/Universally_unique_identifier#Version_4_(random)>)
  as per the [RFC 4122](https://tools.ietf.org/html/rfc4122#section-4.4)
  specification.
- Generated UUIDs do not use a cryptographically strong random generator and
  should not be used for security purposes.

**Return value:**

Return value type is `uuid`.

**Examples:**

```questdb-sql title="Random UUID"
SELECT rnd_uuid4() FROM long_sequence(3);
```

```
deca0b0b-b14b-4d39-b891-9e1e786a48e7
2f113ebb-d36e-4e58-b804-6ece2263abe4
6eddd24a-8889-4345-8001-822cc2d41951
```

## rnd_ipv4

- `rnd_ipv4()` - generates a random IPv4 address between `0.0.0.1` and
  `255.255.255.255`.
- `rnd_ipv4(subnet, nullRate)` - generates a random IPv4 address within the
  bounds of a given subnet.

**Arguments:**

- `subnet` is a `string` defining the subnet in CIDR notation (e.g.,
  `'192.168.1.0/24'`).
- `nullRate` is an `int` defining the frequency of occurrence of `null` values:
  - `0`: No `null` will be returned.
  - `1`: Will only return `null`.
  - `N > 1`: On average, one in N generated values will be `null`.

**Return value:**

Return value type is `ipv4`.

**Examples:**

```questdb-sql title="Random IPv4 address"
SELECT rnd_ipv4() FROM long_sequence(3);
```

```
97.29.14.22
182.43.9.117
45.192.88.3
```

```questdb-sql title="Random IPv4 within a subnet"
SELECT rnd_ipv4('22.43.0.0/16', 0) FROM long_sequence(3);
```

```
22.43.200.12
22.43.55.189
22.43.101.7
```

## rnd_double_array

Generates a `double` array with random elements.

- `rnd_double_array(nDims)` - generates an array with the specified
  dimensionality, random dimension lengths (up to 16), and random elements.
- `rnd_double_array(nDims, nanRate)` - same as above, with `NaN` values at the
  specified rate.
- `rnd_double_array(nDims, nanRate, maxDimLength)` - same as above, with a
  custom maximum dimension length.
- `rnd_double_array(nDims, nanRate, 0, dim1Len, dim2Len, ...)` - generates an
  array of fixed size with random elements. The `0` is a placeholder needed to
  disambiguate from other forms.

**Arguments:**

- `nDims` is an `int` specifying the number of dimensions.
- `nanRate` is an `int` defining the frequency of `NaN` values (default: `0`):
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be `NaN`.
- `maxDimLength` is an `int` specifying the maximum length of each dimension
  (default: `16`).
- `dim1Len, dim2Len, ...` are `int` values specifying exact lengths for each
  dimension when using fixed-size form.

**Return value:**

Return value type is `double[]` (array).

**Examples:**

Generate a 2-dimensional array with 50% NaNs and max dimension length 2:

```questdb-sql
SELECT rnd_double_array(2, 2, 2);
```

```text
[
  [NaN, 0.45738551710910846],
  [0.7702337472360304, NaN]
]
```

Generate a random 2x5 array with no NaNs:

```questdb-sql
SELECT rnd_double_array(2, 0, 0, 2, 5);
```

```text
[
  [0.316129098879942,  0.8662158040337894, 0.8642568676265672,  0.6470407728977403, 0.4740048603478647],
  [0.2928431722534959, 0.4269209916086062, 0.08520276767101154, 0.5371988206397026, 0.5786689751730609]
]
```

## rnd_decimal

- `rnd_decimal(precision, scale, nanRate)` - generates a random **positive**
  `decimal` between `0` and the maximum value representable by the given
  precision and scale.

**Arguments:**

- `precision` is an `int` defining the total number of digits.
- `scale` is an `int` defining the number of digits after the decimal point.
- `nanRate` is an `int` defining the frequency of occurrence of `NaN` values:
  - `0`: No `NaN` will be returned.
  - `1`: Will only return `NaN`.
  - `N > 1`: On average, one in N generated values will be `NaN`.

**Return value:**

Return value type is `decimal`.

**Examples:**

```questdb-sql title="Random decimal"
SELECT rnd_decimal(8, 2, 0) FROM long_sequence(5);
SELECT rnd_decimal(8, 2, 4) FROM long_sequence(5);
```

```
6618.97 5037.02 7118.16 9024.15 537.05
null 734.74 787.93 null 789.92
```
