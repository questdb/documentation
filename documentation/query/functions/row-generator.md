---
title: Sequence generators
sidebar_label: Sequence generators
description: Sequence generator function reference documentation.
---

These functions generate rows and sequences for creating test data. Use them
together with [random value generators](/docs/query/functions/random-value-generator/)
to populate tables with test data.

## Choosing the right function

| Function | Use when... | Example |
|----------|-------------|---------|
| `long_sequence(n)` | You need exactly N rows | Generate 1 million test records |
| `generate_series(start, end, step)` | You need values in a specific range | Generate hourly timestamps for January 2025 |
| `timestamp_sequence(start, step)` | You need timestamps with `long_sequence` (supports random steps) | Generate N rows with varying intervals |

**Key difference for timestamps:**
- `generate_series` is standalone and range-based: "give me timestamps from A to B"
- `timestamp_sequence` requires `long_sequence` and is count-based: "give me N timestamps starting at A"

## Function reference

- [long_sequence](#long_sequence) - generate N rows for use with random functions
- [generate_series](#generate_series) - generate arithmetic series (long, double, or timestamp)
- [timestamp_sequence](#timestamp_sequence) - generate monotonically increasing timestamps

## long_sequence

Generates a pseudo-table with a specified number of rows. This is the primary
function for creating test data in QuestDB.

- `long_sequence(num_rows)` - generates rows with a random seed.
- `long_sequence(num_rows, seed1, seed2)` - generates rows deterministically
  using the provided seed values.

The function serves two purposes:

1. Generates a pseudo-table with an ascending series of `LONG` numbers starting
   at 1 (accessible via column `x`)
2. Provides the seed for pseudo-randomness to all
   [random value functions](/docs/query/functions/random-value-generator/)

:::tip

Deterministic procedural generation makes it easy to test on vast amounts of
data without moving large files across machines. Using the same seed on any
machine at any time will consistently produce the same results for all random
functions.

:::

**Arguments:**

- `num_rows` is a `long` representing the number of rows to generate.
- `seed1` and `seed2` are `long` numbers that combine into a `long128` seed for
  deterministic generation.

**Return value:**

Returns a pseudo-table with a single column `x` of type `long`, containing
values from 1 to `num_rows`.

**Examples:**

```questdb-sql title="Generate rows with random values"
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

```questdb-sql title="Access row number using the x column"
SELECT x, x * x AS square
FROM long_sequence(5);
```

| x   | square |
| --- | ------ |
| 1   | 1      |
| 2   | 4      |
| 3   | 9      |
| 4   | 16     |
| 5   | 25     |

```questdb-sql title="Deterministic generation with fixed seed"
SELECT rnd_double()
FROM long_sequence(2, 128349234, 4327897);
```

:::note

The results below will be the same on any machine at any time as long as they
use the same seed in `long_sequence`.

:::

| rnd_double         |
| ------------------ |
| 0.8251337821991485 |
| 0.2714941145110299 |

## generate_series

Generates a pseudo-table containing an arithmetic series in a single column.
Use it when you need a specific range of values rather than a specific number
of rows.

You can call it in isolation (`generate_series(...)`) or as part of a SELECT
statement (`SELECT * FROM generate_series(...)`).

The `start` and `end` values are interchangeable. Use a negative `step` value
to obtain a descending series. The series is inclusive on both ends.

**Variants:**

- `generate_series(start_long, end_long)` - generates a series of longs with
  step 1.
- `generate_series(start_long, end_long, step_long)` - generates a series of
  longs with custom step.
- `generate_series(start_double, end_double)` - generates a series of doubles
  with step 1.
- `generate_series(start_double, end_double, step_double)` - generates a series
  of doubles with custom step.
- `generate_series(start_timestamp, end_timestamp, step_period)` - generates a
  series of timestamps with a period step.
- `generate_series(start_timestamp, end_timestamp, step_micros)` - generates a
  series of timestamps with microsecond step.

QuestDB determines which variant to use based on the argument types.

**Arguments:**

- `start` is the first value in the series (inclusive).
- `end` is the last value in the series (inclusive).
- `step` is the increment between values (default: `1` for numeric types).

For timestamp variants, `step_period` is a string using the format:

| Unit | Example | Description |
|------|---------|-------------|
| `n` | `'500n'` | nanoseconds |
| `U` | `'100U'` | microseconds |
| `s` | `'30s'` | seconds |
| `m` | `'5m'` | minutes |
| `h` | `'1h'` | hours |
| `d` | `'1d'` | days |

Use negative values for descending series (e.g., `'-1d'`).

**Return value:**

The column type of the pseudo-table matches the argument types: `LONG`,
`DOUBLE`, `TIMESTAMP`, or `TIMESTAMP_NS` (if nanosecond timestamps are provided).

**Examples:**

**Long series:**

```questdb-sql title="Ascending LONG series" demo
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

**Double series:**

```questdb-sql title="Ascending DOUBLE series" demo
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

```questdb-sql title="Descending DOUBLE series with custom step" demo
generate_series(3d, -3d, -1.5d);
```

| generate_series |
| --------------- |
| 3.0             |
| 1.5             |
| 0.0             |
| -1.5            |
| -3.0            |

**Timestamp series:**

```questdb-sql title="Timestamp series using a period" demo
generate_series('2025-01-01', '2025-02-01', '5d');
```

| generate_series             |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-06T00:00:00.000000Z |
| 2025-01-11T00:00:00.000000Z |
| 2025-01-16T00:00:00.000000Z |
| 2025-01-21T00:00:00.000000Z |
| 2025-01-26T00:00:00.000000Z |
| 2025-01-31T00:00:00.000000Z |

```questdb-sql title="Descending timestamp series" demo
generate_series('2025-01-01', '2025-02-01', '-5d');
```

| generate_series             |
| --------------------------- |
| 2025-02-01T00:00:00.000000Z |
| 2025-01-27T00:00:00.000000Z |
| 2025-01-22T00:00:00.000000Z |
| 2025-01-17T00:00:00.000000Z |
| 2025-01-12T00:00:00.000000Z |
| 2025-01-07T00:00:00.000000Z |
| 2025-01-02T00:00:00.000000Z |

```questdb-sql title="Timestamp series using microseconds" demo
generate_series(
    '2025-01-01T00:00:00Z'::timestamp,
    '2025-01-01T00:05:00Z'::timestamp,
    60_000_000 -- 1 minute in microseconds
);
```

| generate_series             |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-01T00:01:00.000000Z |
| 2025-01-01T00:02:00.000000Z |
| 2025-01-01T00:03:00.000000Z |
| 2025-01-01T00:04:00.000000Z |
| 2025-01-01T00:05:00.000000Z |

```questdb-sql title="Nanosecond timestamp series" demo
generate_series(
    to_timestamp_ns('2025-01-01T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
    '2025-01-01T00:00:00.000001',
    '500n'
);
```

| generate_series                |
| ------------------------------ |
| 2025-01-01T00:00:00.000000000Z |
| 2025-01-01T00:00:00.000000500Z |
| 2025-01-01T00:00:00.000001000Z |

## timestamp_sequence

Generates monotonically increasing timestamps when used with `long_sequence()`.
Unlike `generate_series`, this function generates a single value per row and
requires `long_sequence()` to produce multiple rows.

- `timestamp_sequence(startTimestamp, step)` - generates timestamps starting at
  `startTimestamp`, incrementing by `step` microseconds per row.

The `step` can be:
- A fixed value, resulting in evenly-spaced timestamps
- A random function invocation (e.g., `rnd_short(1, 5) * 100000L`), resulting in
  timestamps that grow by random intervals

**Arguments:**

- `startTimestamp` is the starting (lowest) timestamp in the sequence.
- `step` is the interval in microseconds between consecutive timestamps.

**Return value:**

Return type is `TIMESTAMP`. If a `TIMESTAMP_NS` or a date literal with
nanosecond resolution is provided, the return type is `TIMESTAMP_NS`.

**Examples:**

```questdb-sql title="Evenly-spaced timestamps (100ms apart)"
SELECT x, timestamp_sequence(
    to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
    100000L -- 100ms in microseconds
) AS ts
FROM long_sequence(5);
```

| x   | ts                          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.200000Z |
| 4   | 2019-10-17T00:00:00.300000Z |
| 5   | 2019-10-17T00:00:00.400000Z |

```questdb-sql title="Random intervals between timestamps"
SELECT x, timestamp_sequence(
    to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
    rnd_short(1, 5) * 100000L -- 100-500ms random intervals
) AS ts
FROM long_sequence(5);
```

| x   | ts                          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.600000Z |
| 4   | 2019-10-17T00:00:00.900000Z |
| 5   | 2019-10-17T00:00:01.300000Z |
