---
title: Row generator
sidebar_label: Row generator
description: Row generator function reference documentation.
---

## generate_series

Use `generate_series` to generate a pseudo-table with an arithmetic series in
a single column.

This function can generate a `LONG` or `DOUBLE` series. There is also a
`TIMESTAMP` generating version, which can be found
[here](/documentation/reference/function/timestamp-generator.md)

The `start` and `end` values are interchangeable, and you can use a negative
`step` value to obtain a descending arithmetic series.

The series is inclusive on both ends.

The step argument is optional, and defaults to 1.

As a pseudo-table, the function can be called in isolation
(`generate_series()`), or as part of a select
(`SELECT * FROM generate_series()`).

**Arguments:**

`generate_series(start_long, end_long, step_long)` - generates a series of
longs.

`generate_series(start_double, end_double, step_double)` - generates a series of
doubles.

**Return value:**

The column type of the pseudo-table is either `LONG` or `DOUBLE`, according to
the type of the arguments.

**Examples:**

```questdb-sql title="fwd long generation" demo
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

```questdb-sql title="bwd long generation" demo
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

```questdb-sql title="fwd double generation" demo
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

```questdb-sql title="bwd double generation" demo
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

Use `long_sequence()` as a row generator to create table data for testing. Basic
usage of this function involves providing the number of rows to generate. You
can achieve deterministic pseudo-random behavior by providing the random seed
values.

- `long_sequence(num_rows)` - generates rows with a random seed
- `long_sequence(num_rows, seed1, seed2)` - generates rows deterministically

This function is commonly used in combination with
[random generator functions](/docs/reference/function/random-value-generator/)
to produce mock data.

**Arguments:**

-`num_rows` is a `long` representing the number of rows to generate.
-`seed1` and `seed2` are `long` representing the two parts of a `long128` seed.

### Row generation

Use `long_sequence()` to generate very large datasets for testing e.g. billions
of rows.

`long_sequence(num_rows)` is used to:

- Generate a number of rows defined by `num_rows`.
- Generate a column `x:long` of monotonically increasing long integers starting
  from 1, which can be accessed for queries.

### Random number seed

When using `long_sequence` in combination with
[random generators](/docs/reference/function/random-value-generator/), these
values are usually generated at random. You can pass a random generator seed in
order to produce deterministic results.

:::tip

Deterministic procedural generation makes it easy to test on vast amounts of
data without moving large files across machines. Using the same seed on any
machine at any time will consistently produce the same results for all random
functions.

:::

**Examples:**

```questdb-sql title="Generating multiple rows"
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

```questdb-sql title="Accessing row_number using the x column"
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

```questdb-sql title="Using with a seed"
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
