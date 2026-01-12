---
title: SAMPLE BY keyword
sidebar_label: SAMPLE BY
description: SAMPLE BY SQL keyword reference documentation.
---

`SAMPLE BY` is used on [time-series data](/blog/what-is-time-series-data/) to summarize large datasets into
aggregates of homogeneous time chunks as part of a
[SELECT statement](/docs/query/sql/select/).

To use `SAMPLE BY`, a table column needs to be specified as a
[designated timestamp](/docs/concepts/designated-timestamp/).

Users performing `SAMPLE BY` queries on datasets **with missing data** may make
use of the [FILL](#fill-options) keyword to specify a fill behavior.

## Syntax

### SAMPLE BY keywords

![Flow chart showing the syntax of the SAMPLE BY keywords](/images/docs/diagrams/sampleBy.svg)

### FROM-TO keywords

![Flow chart showing the syntax of the FROM-TO keywords](/images/docs/diagrams/fromTo.svg)

### FILL keywords

![Flow chart showing the syntax of the FILL keyword](/images/docs/diagrams/fill.svg)

### ALIGN TO keywords

![Flow chart showing the syntax of the ALIGN TO keywords](/images/docs/diagrams/alignToCalTimeZone.svg)

## Sample units

The size of sampled groups are specified with the following syntax:

```questdb-sql
SAMPLE BY n{units}
```

Where the unit for sampled groups may be one of the following:

| unit | description |
| ---- | ----------- |
| `U`  | microsecond |
| `T`  | millisecond |
| `s`  | second      |
| `m`  | minute      |
| `h`  | hour        |
| `d`  | day         |
| `w`  | week        |
| `M`  | month       |
| `y`  | year        |

For example, given a table `trades`, the following query returns the number of
trades per hour:

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1h;
```

## FROM-TO

:::note

Versions prior to QuestDB 8.1.0 do not have access to this extension.

Please see the new blog for more information.

:::

When using `SAMPLE BY` with `FILL`, you can fill missing rows within the result set with pre-determined values.

However, this method will only fill rows between existing data in the data set and cannot fill rows outside of this range.

To fill outside the bounds of the existing data, you can specify a fill range using a `FROM-TO` clause. The boundary
timestamps are expected in UTC.

Note that `FROM-TO` clause can be used only on non-keyed SAMPLE BY queries, i.e. queries that have no grouping columns
other than the timestamp.

#### Syntax

Specify the shape of the query using `FROM` and `TO`:

```questdb-sql title='Pre-filling trade data' demo
SELECT timestamp as ts, count()
FROM trades
SAMPLE BY 1d FROM '2009-01-01' TO '2009-01-10' FILL(NULL);
```

If no rows exist at the start of the range, QuestDB automatically fills in these rows.

This is distinct from the `WHERE` clause with a simple rule of thumb -
`WHERE` controls what data flows in, `FROM-TO` controls what data flows out.

Use both `FROM` and `TO` in isolation to pre-fill or post-fill data. If `FROM` is not provided, then the lower bound is the start of the dataset, aligned to calendar. The opposite is true omitting `TO`.

#### `WHERE` clause optimisation

If the user does not provide a `WHERE` clause, or the `WHERE` clause does not consider the designated timestamp,
QuestDB will add one for you, matching the `FROM-TO` interval.

This means that the query will run optimally, and avoid touching data not relevant to the result.

Therefore, we compile the prior query into something similar to this:

```questdb-sql title='Pre-filling trade data with WHERE optimisation' demo
SELECT timestamp as ts, count()
FROM trades
WHERE timestamp >= '2009-01-01'
  AND timestamp <  '2009-01-10'
SAMPLE BY 1d FROM '2009-01-01' TO '2009-01-10' FILL(NULL);
```

#### Limitations

Here are the current limits to this feature.

- This syntax is not compatible with `FILL(PREV)` or `FILL(LINEAR)`.
- This syntax is for `ALIGN TO CALENDAR` only (default alignment).
- Does not consider any specified `OFFSET`.
- This syntax is for non-keyed `SAMPLE BY` i.e. only designated timestamp and aggregate columns.

## Fill options

The `FILL` keyword is optional and expects one or more `fillOption` strategies
which will be applied to one or more aggregate columns. The following
restrictions apply:

- Keywords denoting fill strategies may not be combined. Only one option from
  `NONE`, `NULL`, `PREV`, `LINEAR` and constants may be used.
- `LINEAR` strategy is not supported for keyed queries, i.e. queries that
  contain non-aggregated columns other than the timestamp in the SELECT clause.
- The `FILL` keyword must precede alignment described in the
  [sample calculation section](#sample-calculation), i.e.:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(LINEAR)
ALIGN TO ...
```

| fillOption | Description                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NONE`     | No fill applied. If there is no data, the time sample will be skipped in the results. A table could be missing intervals. |
| `NULL`     | Fills with `NULL` values.                                                                                                 |
| `PREV`     | Fills using the previous value.                                                                                           |
| `LINEAR`   | Fills by linear interpolation of the 2 surrounding points.                                                                |
| `x`        | Fills with a constant value - where `x` is the desired value, for example `FILL(100.05)`.                                 |

Consider an example table named `prices` which has no records during the entire
third hour (`2021-01-01T03`):

| ts                          | price |
| --------------------------- | ----- |
| 2021-01-01T01:00:00.000000Z | p1    |
| 2021-01-01T02:00:00.000000Z | p2    |
| 2021-01-01T04:00:00.000000Z | p4    |
| 2021-01-01T05:00:00.000000Z | p5    |

The following query returns the maximum price per hour. As there are missing
values, an aggregate cannot be calculated:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h;
```

A row is missing for the `2021-01-01T03:00:00.000000Z` sample:

| ts                          | max  |
| --------------------------- | ---- |
| 2021-01-01T01:00:00.000000Z | max1 |
| 2021-01-01T02:00:00.000000Z | max2 |
| 2021-01-01T04:00:00.000000Z | max4 |
| 2021-01-01T05:00:00.000000Z | max5 |

A `FILL` strategy can be employed which fills with the previous value using
`PREV`:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(PREV);
```

| ts                              | max      |
| ------------------------------- | -------- |
| 2021-01-01T01:00:00.000000Z     | max1     |
| 2021-01-01T02:00:00.000000Z     | max2     |
| **2021-01-01T03:00:00.000000Z** | **max2** |
| 2021-01-01T04:00:00.000000Z     | max4     |
| 2021-01-01T05:00:00.000000Z     | max5     |

Linear interpolation is done using the `LINEAR` fill option:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(LINEAR);
```

| ts                              | max               |
| ------------------------------- | ----------------- |
| 2021-01-01T01:00:00.000000Z     | max1              |
| 2021-01-01T02:00:00.000000Z     | max2              |
| **2021-01-01T03:00:00.000000Z** | **(max2+max4)/2** |
| 2021-01-01T04:00:00.000000Z     | max4              |
| 2021-01-01T05:00:00.000000Z     | max5              |

A constant value can be used as a `fillOption`:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(100.5);
```

| ts                              | max       |
| ------------------------------- | --------- |
| 2021-01-01T01:00:00.000000Z     | max1      |
| 2021-01-01T02:00:00.000000Z     | max2      |
| **2021-01-01T03:00:00.000000Z** | **100.5** |
| 2021-01-01T04:00:00.000000Z     | max4      |
| 2021-01-01T05:00:00.000000Z     | max5      |

Finally, `NULL` may be used as a `fillOption`:

```questdb-sql
SELECT ts, max(price) max
FROM prices
SAMPLE BY 1h FILL(NULL);
```

| ts                              | max      |
| ------------------------------- | -------- |
| 2021-01-01T01:00:00.000000Z     | max1     |
| 2021-01-01T02:00:00.000000Z     | max2     |
| **2021-01-01T03:00:00.000000Z** | **null** |
| 2021-01-01T04:00:00.000000Z     | max4     |
| 2021-01-01T05:00:00.000000Z     | max5     |

### Multiple fill values

`FILL()` accepts a list of values where each value corresponds to a single
aggregate column in the SELECT clause order:

```questdb-sql
SELECT min(price), max(price), avg(price), ts
FROM prices
SAMPLE BY 1h
FILL(NULL, 10, PREV);
```

In the above query `min(price)` aggregate will get `FILL(NULL)` strategy
applied, `max(price)` will get `FILL(10)`, and `avg(price)` will get
`FILL(PREV)`.

## Sample calculation

The default time calculation of sampled groups is an absolute value, in other
words, sampling by one day is a 24 hour range which is not bound to calendar
dates. To align sampled groups to calendar dates, the `ALIGN TO` keywords can be
used and are described in the [ALIGN TO CALENDAR](#align-to-calendar) section
below.

:::note

Since QuestDB v7.4.0, the default behaviour for `ALIGN TO` has changed. If you do not specify
an explicit alignment, `SAMPLE BY` expressions will use `ALIGN TO CALENDAR` behaviour.

The prior default behaviour can be retained by specifying `ALIGN TO FIRST OBSERVATION` on a `SAMPLE BY` query.

Alternatively, one can set the `cairo.sql.sampleby.default.alignment.calendar` option to `false` in `server.conf`.

:::

## ALIGN TO FIRST OBSERVATION

Consider a table `trades` with the following data spanning three calendar days:

```questdb-sql
CREATE TABLE trades (
  ts TIMESTAMP,
  price DOUBLE
) TIMESTAMP(ts) PARTITION BY DAY WAL;

INSERT INTO trades (ts, price) VALUES
  ('2021-05-31T23:10:00.000000Z', 100.5),
  ('2021-06-01T01:10:00.000000Z', 101.2),
  ('2021-06-01T07:20:00.000000Z', 100.8),
  ('2021-06-01T13:20:00.000000Z', 101.0),
  ('2021-06-01T19:20:00.000000Z', 102.1),
  ('2021-06-02T01:10:00.000000Z', 101.5),
  ('2021-06-02T07:20:00.000000Z', 100.9);
```

The following query can be used to sample the table by day.

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d
ALIGN TO FIRST OBSERVATION;
```

This query will return two rows:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:10:00.000000Z | 5     |
| 2021-06-01T23:10:00.000000Z | 2     |

The timestamp value for the 24 hour groups start at the first-observed
timestamp, and continue in `1d` intervals.

## ALIGN TO CALENDAR

The default behaviour for SAMPLE BY, this option aligns data to calendar dates, with two optional parameters:

- [TIME ZONE](#time-zone)
- [WITH OFFSET](#with-offset)

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d;
```

or:

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR;
```

Gives the following result:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T00:00:00.000000Z | 1     |
| 2021-06-01T00:00:00.000000Z | 4     |
| 2021-06-02T00:00:00.000000Z | 2     |

In this case, the timestamps are floored to the nearest UTC day, and grouped. The counts correspond
to the number of entries occurring within each UTC day.

This is particularly useful for summarising data for charting purposes; see the [candlestick chart](https://dashboard.questdb.io/d-solo/fb13b4ab-b1c9-4a54-a920-b60c5fb0363f/public-dashboard-questdb-io-use-cases-crypto?orgId=1&refresh=750ms&panelId=6) from the example [crypto dashboard](https://questdb.com/dashboards/crypto/).

### TIME ZONE

A time zone may be provided for sampling with calendar alignment. Details on the
options for specifying time zones with available formats are provided in the
guide for
[working with timestamps and time zones](/docs/concepts/timestamps-timezones/).

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin';
```

In this case, the 24 hour samples begin at `2021-05-31T22:00:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T22:00:00.000000Z | 5     |
| 2021-06-01T22:00:00.000000Z | 2     |

Additionally, an offset may be applied when aligning sample calculation to
calendar

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin' WITH OFFSET '00:45';
```

In this case, the 24 hour samples begin at `2021-05-31T22:45:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T22:45:00.000000Z | 5     |
| 2021-06-01T22:45:00.000000Z | 1     |

#### Local timezone output

The timestamp values output from `SAMPLE BY` queries is in UTC. To have UTC
values converted to specific timezones, the
[to_timezone() function](/docs/query/functions/date-time/#to_timezone) should
be used.

```questdb-sql
SELECT to_timezone(ts, 'PST') ts, count
FROM (
  SELECT ts, count()
  FROM trades
  SAMPLE BY 2h
  ALIGN TO CALENDAR TIME ZONE 'PST'
);
```

#### Time zone transitions

Calendar dates may contain historical time zone transitions or may vary in the
total number of hours due to daylight savings time. Considering the 31st October
2021, in the `Europe/London` calendar day which consists of 25 hours:

> - Sunday, 31 October 2021, 02:00:00 clocks are turned backward 1 hour to
> - Sunday, 31 October 2021, 01:00:00 local standard time

When a `SAMPLE BY` operation crosses time zone transitions in cases such as
this, the first sampled group which spans a transition will include aggregates
by full calendar range. Consider a table `trades` with one trade per hour
spanning five calendar hours:

| ts                          | price |
| --------------------------- | ----- |
| 2021-10-31T00:10:00.000000Z | 100.5 |
| 2021-10-31T01:10:00.000000Z | 101.2 |
| 2021-10-31T02:10:00.000000Z | 100.8 |
| 2021-10-31T03:10:00.000000Z | 101.5 |
| 2021-10-31T04:10:00.000000Z | 102.0 |

The following query will sample by hour with the `Europe/London` time zone and
align to calendar ranges:

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1h
ALIGN TO CALENDAR TIME ZONE 'Europe/London';
```

The record count for the hour which encounters a time zone transition will
contain two records for both hours at the time zone transition:

| ts                          | count |
| --------------------------- | ----- |
| 2021-10-31T00:00:00.000000Z | 2     |
| 2021-10-31T01:00:00.000000Z | 1     |
| 2021-10-31T02:00:00.000000Z | 1     |
| 2021-10-31T03:00:00.000000Z | 1     |

Similarly, given one data point per hour on this table, running `SAMPLE BY 1d`
will have a count of `25` for this day when aligned to calendar time zone
`Europe/London`.

### WITH OFFSET

Aligning sampling calculation can be provided an arbitrary offset in the format
`'+/-HH:mm'`, for example:

- `'00:30'` plus thirty minutes
- `'+00:30'` plus thirty minutes
- `'-00:15'` minus 15 minutes

The query uses the default offset '00:00' if the parameter is not set.

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR WITH OFFSET '02:00';
```

In this case, the 24 hour samples begin at `2021-05-31T02:00:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T02:00:00.000000Z | 2     |
| 2021-06-01T02:00:00.000000Z | 4     |
| 2021-06-02T02:00:00.000000Z | 1     |

### TIME ZONE WITH OFFSET

The `TIME ZONE` and `WITH OFFSET` options can be combined.

```questdb-sql
SELECT ts, count()
FROM trades
SAMPLE BY 1h
ALIGN TO CALENDAR TIME ZONE 'Europe/London' WITH OFFSET '02:00';
```

The sample then begins from `Europe/London` at `2021-10-31T02:00:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-10-31T02:00:00.000000Z | 1     |
| 2021-10-31T03:00:00.000000Z | 1     |
| 2021-10-31T04:00:00.000000Z | 3     |
| 2021-10-31T05:00:00.000000Z | 2     |

## Examples

Assume the following table `trades`:

| ts                          | quantity | price  |
| --------------------------- | -------- | ------ |
| 2021-05-31T23:45:10.000000Z | 10       | 100.05 |
| 2021-06-01T00:01:33.000000Z | 5        | 100.05 |
| 2021-06-01T00:15:14.000000Z | 200      | 100.15 |
| 2021-06-01T00:30:40.000000Z | 300      | 100.15 |
| 2021-06-01T00:45:20.000000Z | 10       | 100    |
| 2021-06-01T01:00:50.000000Z | 50       | 100.15 |

This query will return the number of trades per hour:

```questdb-sql title="Hourly interval"
SELECT ts, count()
FROM trades
SAMPLE BY 1h;
```

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:45:10.000000Z | 3     |
| 2021-06-01T00:45:10.000000Z | 1     |
| 2021-05-31T23:45:10.000000Z | 1     |
| 2021-06-01T00:45:10.000000Z | 1     |

The following will return the trade volume in 30 minute intervals

```questdb-sql title="30 minute interval"
SELECT ts, sum(quantity*price)
FROM trades
SAMPLE BY 30m;
```

| ts                          | sum    |
| --------------------------- | ------ |
| 2021-05-31T23:45:10.000000Z | 1000.5 |
| 2021-06-01T00:15:10.000000Z | 16024  |
| 2021-06-01T00:45:10.000000Z | 8000   |
| 2021-06-01T00:15:10.000000Z | 8012   |
| 2021-06-01T00:45:10.000000Z | 8000   |

The following will return the average trade notional (where notional is = q \*
p) by day:

```questdb-sql title="Daily interval"
SELECT ts, avg(quantity*price)
FROM trades
SAMPLE BY 1d;
```

| ts                          | avg               |
| --------------------------- | ----------------- |
| 2021-05-31T23:45:10.000000Z | 6839.416666666667 |

To make this sample align to calendar dates:

```questdb-sql title="Calendar alignment"
SELECT ts, avg(quantity*price)
FROM trades
SAMPLE BY 1d
ALIGN TO CALENDAR;
```

| ts                          | avg    |
| --------------------------- | ------ |
| 2021-05-31T00:00:00.000000Z | 1000.5 |
| 2021-06-01T00:00:00.000000Z | 8007.2 |

## Performance optimization

For frequently executed `SAMPLE BY` queries, consider using [materialized views](/docs/concepts/materialized-views/) to pre-compute aggregates. This can significantly improve query performance, especially for complex sampling operations on large datasets.

```questdb-sql
CREATE MATERIALIZED VIEW hourly_metrics AS
SELECT 
    timestamp_floor('h', ts) as hour,
    symbol,
    avg(price) as avg_price,
    sum(volume) as total_volume
FROM trades
SAMPLE BY 1h;
```

## See also

This section includes links to additional information such as tutorials:

- [PIVOT](/docs/query/sql/pivot/) - Transform SAMPLE BY results from rows to columns
- [Materialized Views](/docs/concepts/materialized-views/) - Pre-compute SAMPLE BY queries for better performance
- [SQL Extensions for Time-Series Data in QuestDB](/blog/2022/11/23/sql-extensions-time-series-data-questdb-part-ii/)
- [Three SQL Keywords for Finding Missing Data](/blog/three-sql-keywords-for-finding-missing-data/)
