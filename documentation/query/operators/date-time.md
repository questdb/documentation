---
title: Date and Time Operators
sidebar_label: Date and Time
description: Date and Time operators
---

This page describes the available operators to assist with performing time-based
calculations.

:::note

If an operator's first argument is a table's timestamp, QuestDB may use an
[Interval Scan](/docs/concepts/deep-dive/interval-scan) for optimization.

:::

## `BETWEEN` value1 `AND` value2

The `BETWEEN` operator allows you to specify a non-standard range. It includes
both upper and lower bounds, similar to standard SQL. The order of these bounds
is interchangeable, meaning `BETWEEN X AND Y` is equivalent to
`BETWEEN Y AND X`.

#### Arguments

- `value1` and `value2` can be of `date`, `timestamp`, or `string` type.

#### Examples

```questdb-sql title="Explicit range"
SELECT * FROM trades
WHERE timestamp BETWEEN '2022-01-01T00:00:23.000000Z' AND '2023-01-01T00:00:23.500000Z';
```

This query returns all records within the specified timestamp range:

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:23.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-01T00:00:23.500000Z | 131.5 |

The `BETWEEN` operator can also accept non-constant bounds. For instance, the
following query returns all records older than one year from the current date:

```questdb-sql title="One year before current date" demo
SELECT * FROM trades
WHERE timestamp BETWEEN to_str(now(), 'yyyy-MM-dd')
AND dateadd('y', -1, to_str(now(), 'yyyy-MM-dd'));
```

The result set for this query would be:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

```questdb-sql title="Results between two specific timestamps"
SELECT * FROM trades WHERE ts BETWEEN '2022-05-23T12:15:00.000000Z' AND '2023-05-23T12:16:00.000000Z';
```

This query returns all records from the 15th minute of 12 PM on May 23, 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

## `IN` (timeRange)

Returns results within a defined range of time.

#### Arguments

- `timeRange` is a `string` type representing the desired time range.

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a partial timestamp comparison](/images/docs/diagrams/whereTimestampPartial.svg)

#### Examples

```questdb-sql title="Results in a given year"
SELECT * FROM scores WHERE ts IN '2018';
```

This query returns all records from the year 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

```questdb-sql title="Results in a given minute"
SELECT * FROM scores WHERE ts IN '2018-05-23T12:15';
```

This query returns all records from the 15th minute of 12 PM on May 23, 2018:

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

## `IN` (timeRangeWithModifier)

You can apply a modifier to further customize the range. The modifier extends
the upper bound of the original timestamp based on the modifier parameter. An
optional interval with occurrence can be set, to apply the search in the given
time range repeatedly, for a set number of times.

#### Arguments

- `timeRangeWithModifier` is a string in the format
  `'timeRange;modifier;interval;repetition'`.

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a timestamp/modifier comparison](/images/docs/diagrams/whereTimestampIntervalSearch.svg)

- `timestamp` is the original time range for the query.
- `modifier` is a signed integer modifying the upper bound applying to the
  `timestamp`:

  - A `positive` value extends the selected period.
  - A `negative` value reduces the selected period.

- `interval` is an unsigned integer indicating the desired interval period for
  the time range.
- `repetition` is an unsigned integer indicating the number of times the
  interval should be applied.

#### Examples

Modifying the range:

```questdb-sql title="Results in a given year and the first month of the next year"
SELECT * FROM scores WHERE ts IN '2018;1M';
```

In this example, the range is the year 2018. The modifier `1M` extends the upper
bound (originally 31 Dec 2018) by one month.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2019-01-31T23:59:59.999999Z | 115.8 |

```questdb-sql title="Results in a given month excluding the last 3 days"
SELECT * FROM scores WHERE ts IN '2018-01;-3d';
```

In this example, the range is January 2018. The modifier `-3d` reduces the upper
bound (originally 31 Jan 2018) by 3 days.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-28T23:59:59.999999Z | 113.8 |

Modifying the interval:

```questdb-sql title="Results on a given date with an interval"
SELECT * FROM scores WHERE ts IN '2018-01-01;1d;1y;2';
```

In this example, the range is extended by one day from Jan 1 2018, with a
one-year interval, repeated twice. This means that the query searches for
results on Jan 1-2 in 2018 and in 2019:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-02T23:59:59.999999Z | 110.3 |
| 2019-01-01T00:00:00.000000Z | 128.7 |
| ...                         | ...   |
| 2019-01-02T23:59:59.999999Z | 103.8 |

## `IN` (interval)

Returns results within a defined range of time, as specified by an `interval` value.

#### Arguments

- `interval` is an `interval` type representing the desired time range.

#### Examples

```questdb-sql title="Check if timestamp is in interval success" demo
SELECT true as is_in_interval FROM trades
WHERE '2018-05-17T00:00:00Z'::timestamp IN interval('2018', '2019')
LIMIT -1
```

| is_in_interval |
| -------------- |
| true           |

If we adjust the interval to be not in range, we get no result:

```questdb-sql title="Check if timestamp is in interval failure" demo
SELECT true as is_in_interval FROM trades
WHERE '2018-05-17T00:00:00Z'::timestamp IN interval('2022', '2023')
LIMIT -1;
```

| is_in_interval |
| -------------- |
