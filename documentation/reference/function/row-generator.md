---
title: Row generator
sidebar_label: Row generator
description: Row generator function reference documentation.
---

The `long_sequence()` function may be used as a row generator to create table
data for testing. Basic usage of this function involves providing the number of
iterations required. Deterministic pseudo-random behavior can be achieved by
providing seed values when calling the function.

This function is commonly used in combination with
[random generator functions](/docs/reference/function/random-value-generator/)
to produce mock data.

## long_sequence

- `long_sequence(iterations)` - generates rows
- `long_sequence(iterations, seed1, seed2)` - generates rows deterministically

**Arguments:**

-`iterations`: is a `long` representing the number of rows to generate. -`seed1`
and `seed2` are `long64` representing both parts of a `long128` seed.

### Row generation

The `long_sequence()` function can be used to generate very large datasets for
testing e.g. billions of rows.

`long_sequence(iterations)` is used to:

- Generate a number of rows defined by `iterations`.
- Generate a column `x:long` of monotonically increasing long integers starting
  from 1, which can be accessed for queries.

### Random number seed

When `long_sequence` is used conjointly with
[random generators](/docs/reference/function/random-value-generator/), these
values are usually generated at random. The function supports a seed to be
passed in order to produce deterministic results.

:::note

Deterministic procedural generation makes it easy to test on vasts amounts of
data without actually moving large files around across machines. Using the same
seed on any machine at any time will consistently produce the same results for
all random functions.

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
use the same seed in long_sequence.

:::

| rnd_double         |
| ------------------ |
| 0.8251337821991485 |
| 0.2714941145110299 |

## generate_series

Rather than generating a fixed number of entries, `generate_series` can instead be used
to generate entries within a bounded range.

This function supports `LONG` and `DOUBLE` generation. There is also a `TIMESTAMP` generating version,
which can be found [here](/documentation/reference/function/timestamp-generator.md)

The `start` and `end` values are interchangeable, and a negative `step` value can be used to
obtain the series in reverse order.

The series is inclusive on both ends.

**Arguments:**

`generate_series(start_long, end_long, step_long)` - generates a series of longs.

`generate_series(start_double, end_double, step_double)` - generates a series of doubles.


**Return value:**

Return value type is `times---
title: Row generator
sidebar_label: Row generator
description: Row generator function reference documentation.
---

The `long_sequence()` function may be used as a row generator to create table
data for testing. Basic usage of this function involves providing the number of
iterations required. Deterministic pseudo-random behavior can be achieved by
providing seed values when calling the function.

This function is commonly used in combination with
[random generator functions](/docs/reference/function/random-value-generator/)
to produce mock data.

## long_sequence

- `long_sequence(iterations)` - generates rows
- `long_sequence(iterations, seed1, seed2)` - generates rows deterministically

**Arguments:**

-`iterations`: is a `long` representing the number of rows to generate. -`seed1`
and `seed2` are `long64` representing both parts of a `long128` seed.

### Row generation

The `long_sequence()` function can be used to generate very large datasets for
testing e.g. billions of rows.

`long_sequence(iterations)` is used to:

- Generate a number of rows defined by `iterations`.
- Generate a column `x:long` of monotonically increasing long integers starting
  from 1, which can be accessed for queries.

### Random number seed

When `long_sequence` is used conjointly with
[random generators](/docs/reference/function/random-value-generator/), these
values are usually generated at random. The function supports a seed to be
passed in order to produce deterministic results.

:::note

Deterministic procedural generation makes it easy to test on vasts amounts of
data without actually moving large files around across machines. Using the same
seed on any machine at any time will consistently produce the same results for
all random functions.

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
use the same seed in long_sequence.

:::

| rnd_double         |
| ------------------ |
| 0.8251337821991485 |
| 0.2714941145110299 |

## generate_series

Rather than generating a fixed number of entries, `generate_series` can instead be used
to generate entries within a bounded range.

This function supports `LONG` and `DOUBLE` generation. There is also a `TIMESTAMP` generating version,
which can be found [here](/documentation/reference/function/timestamp-generator.md)

The `start` and `end` values are interchangeable, and a negative `step` value can be used to
obtain the series in reverse order.

The series is inclusive on both ends.

The final argument is optional, and defaults to `1`.

As a pseudo-table, the function can be called in isolation (`generate_series()`), or as 
part of a select (`SELECT * FROM generate_series()`).

**Arguments:**

`generate_series(start_long, end_long, step_long)` - generates a series of longs.

`generate_series(start_double, end_double, step_double)` - generates a series of doubles.


**Return value:**

Return value type is `long` or `double`.

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