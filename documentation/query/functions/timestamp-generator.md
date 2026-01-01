---
title: Timestamp generator
sidebar_label: Timestamp generator
description: Timestamp generator function reference documentation.
---

## timestamp_sequence

This function acts similarly to
[`rnd_*`](/docs/query/functions/random-value-generator/) functions. It
generates a single timestamp value (not a pseudo-table), but when used in
combination with the `long_sequence()` pseudo-table function, its output forms a
series of timestamps that monotonically increase.

- `timestamp_sequence(startTimestamp, step)` generates a sequence of `timestamp`
  starting at `startTimestamp`, and incrementing by a `step` set as a `long`
  value in microseconds. The `step` can be either;

  - a fixed value, resulting in a steadily-growing timestamp series
  - a random function invocation, such as
    [rnd_short()](/docs/query/functions/random-value-generator#rnd_short),
    resulting in a timestamp series that grows in random steps

**Arguments:**

- `startTimestamp` — the starting (i.e lowest) generated timestamp in the
  sequence
- `step` — the interval (in microseconds) between 2 consecutive generated
  timestamps

**Return value:**

The default type of the return value is `TIMESTAMP`. If a `TIMESTAMP_NS` or a date literal string with nanosecond
resolution is passed as one of the arguments, the return value will be a `TIMESTAMP_NS`.

**Examples:**

```questdb-sql title="Monotonic timestamp increase"
SELECT x, timestamp_sequence(
            to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
            100000L)
FROM long_sequence(5);
```

| x   | timestamp_sequence          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.200000Z |
| 4   | 2019-10-17T00:00:00.300000Z |
| 5   | 2019-10-17T00:00:00.400000Z |

```questdb-sql title="Randomized timestamp increase"
SELECT x, timestamp_sequence(
            to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
            rnd_short(1,5) * 100000L)
FROM long_sequence(5);
```

| x   | timestamp_sequence          |
| --- | --------------------------- |
| 1   | 2019-10-17T00:00:00.000000Z |
| 2   | 2019-10-17T00:00:00.100000Z |
| 3   | 2019-10-17T00:00:00.600000Z |
| 4   | 2019-10-17T00:00:00.900000Z |
| 5   | 2019-10-17T00:00:01.300000Z |

## generate_series

This function generates a pseudo-table containing an arithmetic series of
timestamps. Use it when you don't need a given number of rows, but a given time
period defined by start, and, and step.

You can call it in isolation (`generate_series(...)`), or as part of a SELECT
statement (`SELECT * FROM generate_series(...)`).

Provide the time step either in microseconds, or in a period string, similar to
`SAMPLE BY`.

The `start` and `end` values are interchangeable; use a negative time step value
to obtain the series in reverse order.

The series is inclusive on both ends.

**Arguments:**

There are two timestamp-generating variants of `generate_series`:

- `generate_series(start, end, step_period)` - generate a series of timestamps
  between `start` and `end`, in periodic steps
- `generate_series(start, end, step_micros)` - generates a series of timestamps
  between `start` and `end`, in microsecond steps

**Return value:**

The default type of the return value is `TIMESTAMP`. If a `TIMESTAMP_NS` or a date literal string with nanosecond
resolution is passed as one of the arguments, the return value will be a `TIMESTAMP_NS`.

**Examples:**

```questdb-sql title="Ascending series using a period" demo
generate_series('2025-01-01', '2025-02-01', '5d');
```

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-06T00:00:00.000000Z |
| 2025-01-11T00:00:00.000000Z |
| 2025-01-16T00:00:00.000000Z |
| 2025-01-21T00:00:00.000000Z |
| 2025-01-26T00:00:00.000000Z |
| 2025-01-31T00:00:00.000000Z |

```questdb-sql title="Descending series using a period" demo
generate_series('2025-01-01', '2025-02-01', '-5d');
```

| generate_series (timestamp) |
| --------------------------- |
| 2025-02-01T00:00:00.000000Z |
| 2025-01-27T00:00:00.000000Z |
| 2025-01-22T00:00:00.000000Z |
| 2025-01-17T00:00:00.000000Z |
| 2025-01-12T00:00:00.000000Z |
| 2025-01-07T00:00:00.000000Z |
| 2025-01-02T00:00:00.000000Z |

```questdb-sql title="Ascending series using microseconds" demo
generate_series(
 '2025-01-01T00:00:00Z'::timestamp,
 '2025-01-01T00:05:00Z'::timestamp,
 60_000_000
);
```

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:00:00.000000Z |
| 2025-01-01T00:01:00.000000Z |
| 2025-01-01T00:02:00.000000Z |
| 2025-01-01T00:03:00.000000Z |
| 2025-01-01T00:04:00.000000Z |
| 2025-01-01T00:05:00.000000Z |

```questdb-sql title="Descending series using microseconds" demo
generate_series(
 '2025-01-01T00:00:00Z'::timestamp,
 '2025-01-01T00:05:00Z'::timestamp,
 -60_000_000
);
```

| generate_series (timestamp) |
| --------------------------- |
| 2025-01-01T00:05:00.000000Z |
| 2025-01-01T00:04:00.000000Z |
| 2025-01-01T00:03:00.000000Z |
| 2025-01-01T00:02:00.000000Z |
| 2025-01-01T00:01:00.000000Z |
| 2025-01-01T00:00:00.000000Z |


```questdb-sql title="Series using nanosecond timestamp" demo
generate_series( '2025-01-01', '2025-02-01T00:00:00.000000000Z', '1s');
```

| generate_series (timestamp_ns) |
| ------------------------------ |
| 2025-01-01T00:00:00.000000000Z |
| 2025-01-06T00:00:00.000000000Z |
| 2025-01-11T00:00:00.000000000Z |
| 2025-01-16T00:00:00.000000000Z |
| 2025-01-21T00:00:00.000000000Z |
| 2025-01-26T00:00:00.000000000Z |
| 2025-01-31T00:00:00.000000000Z |



```questdb-sql title="Series using nanosecond timestamp and nanosecond step" demo
generate_series( to_timestamp_ns('2025-01-01T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
 '2025-01-01T00:00:00.000001', '500n');
 ```

| generate_series                |
| ------------------------------ |
| 2025-01-01T00:00:00.000000000Z |
| 2025-01-01T00:00:00.000000500Z |
| 2025-01-01T00:00:00.000001000Z |
