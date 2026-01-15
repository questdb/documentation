---
title: Row generator
sidebar_label: Row generator
description: Row generator function reference documentation.
---

## generate_series

Use `generate_series` to generate a pseudo-table with an arithmetic series in a
single column. You can call it in isolation (`generate_series(...)`), or as part of
a SELECT statement (`SELECT * FROM generate_series(...)`).

This function can generate a `LONG` or `DOUBLE` series. There is also a
[variant](/docs/query/functions/timestamp-generator#generate_series)
that generates a `TIMESTAMP` series.

The `start` and `end` values are interchangeable, and you can use a negative
`step` value to obtain a descending arithmetic series.

The series is inclusive on both ends.

The step argument is optional, and defaults to 1.

**Arguments:**

`generate_series(start_long, end_long, step_long)` - generates a series of
longs.

`generate_series(start_double, end_double, step_double)` - generates a series of
doubles.

**Return value:**

The column type of the pseudo-table is either `LONG` or `DOUBLE`, according to
the type of the arguments.

**Examples:**

```questdb-sql title="Ascending LONG series" demo
generate_series(-3, 3, 1);
-- or
generate_series(-3, 3);
```

| generate_series |
| --------------- |
| -3              |
| -2              |
| -1              |
| 0               |
| 1               |
| 2               |
| 3               |

```questdb-sql title="Descending LONG series" demo
generate_series(3, -3, -1);
```

| generate_series |
| --------------- |
| 3               |
| 2               |
| 1               |
| 0               |
| -1              |
| -2              |
| -3              |

```questdb-sql title="Ascending DOUBLE series" demo
generate_series(-3d, 3d, 1d);
-- or
generate_series(-3d, 3d);
```

| generate_series |
| --------------- |
| -3.0            |
| -2.0            |
| -1.0            |
| 0.0             |
| 1.0             |
| 2.0             |
| 3.0             |

```questdb-sql title="Descending DOUBLE series" demo
generate_series(-3d, 3d, -1d);
```

| generate_series |
| --------------- |
| 3.0             |
| 2.0             |
| 1.0             |
| 0.0             |
| -1.0            |
| -2.0            |
| -3.0            |

## long_sequence

Use `long_sequence()` as a row generator to create table data for testing. The
function deals with two concerns:

- generates a pseudo-table with an ascending series of LONG numbers starting at
  1
- serves as the provider of pseudo-randomness to all the
   [random value functions](/docs/query/functions/random-value-generator/)

Basic usage of this function involves providing the number of rows to generate.
You can achieve deterministic pseudo-random behavior by providing the random
seed values.

- `long_sequence(num_rows)` — generates rows with a random seed
- `long_sequence(num_rows, seed1, seed2)` — generates rows deterministically

:::tip

Deterministic procedural generation makes it easy to test on vast amounts of
data without moving large files across machines. Using the same seed on any
machine at any time will consistently produce the same results for all random
functions.

:::

**Arguments:**

- `num_rows` — `long` representing the number of rows to generate
- `seed1` and `seed2` — `long` numbers that combine into a `long128` seed

**Examples:**

```questdb-sql title="Generate multiple rows"
SELECT x, rnd_double()
FROM long_sequence(5);
```

| x   | rnd_double   |
| --- | ------------ |
| 1   | 0.3279246687 |
| 2   | 0.8341038236 |
| 3   | 0.1023834675 |
| 4   | 0.9130602021 |
| 5   | 0.718276777  |

```questdb-sql title="Access row_number using the x column"
SELECT x, x*x
FROM long_sequence(5);
```

| x   | x\*x |
| --- | ---- |
| 1   | 1    |
| 2   | 4    |
| 3   | 9    |
| 4   | 16   |
| 5   | 25   |

```questdb-sql title="Use with a fixed random seed"
SELECT rnd_double()
FROM long_sequence(2,128349234,4327897);
```

:::note

The results below will be the same on any machine at any time as long as they
use the same seed in `long_sequence`.

:::

| rnd_double         |
| ------------------ |
| 0.8251337821991485 |
| 0.2714941145110299 |
