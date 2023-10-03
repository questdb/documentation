---
title: SAMPLE BY keyword
sidebar_label: SAMPLE BY
description: SAMPLE BY SQL keyword reference documentation.
---

`SAMPLE BY` is used on time-series data to summarize large datasets into
aggregates of homogeneous time chunks as part of a
[SELECT statement](/docs/reference/sql/select/).

To use `SAMPLE BY`, a table column needs to be specified as a
[designated timestamp](/docs/concept/designated-timestamp/).

Users performing `SAMPLE BY` queries on datasets **with missing data** may make
use of the [FILL](#fill-options) keyword to specify a fill behavior.

## Syntax

![Flow chart showing the syntax of the SAMPLE BY keywords](/img/docs/diagrams/sampleBy.svg)
![Flow chart showing the syntax of the ALIGN TO keywords](/img/docs/diagrams/alignToCalTimeZone.svg)
![Flow chart showing the syntax of the FILL keyword](/img/docs/diagrams/fill.svg)

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
| `M`  | month       |
| `y`  | year        |

For example, given a table `trades`, the following query returns the number of
trades per hour:

```questdb-sql
SELECT ts, count() FROM trades SAMPLE BY 1h
```

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
  SELECT ts, max(price) max FROM prices
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
SELECT ts, max(price) max FROM prices SAMPLE BY 1h;
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
SELECT ts, max(price) max FROM prices SAMPLE BY 1h FILL(PREV);
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
SELECT ts, max(price) max FROM prices SAMPLE BY 1h FILL(LINEAR);
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
SELECT ts, max(price) max FROM prices SAMPLE BY 1h FILL(100.5);
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
SELECT ts, max(price) max FROM prices SAMPLE BY 1h FILL(NULL);
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

Consider a table `sensors` with the following data spanning three calendar days:

| ts                          | val |
| --------------------------- | --- |
| 2021-05-31T23:10:00.000000Z | 10  |
| 2021-06-01T01:10:00.000000Z | 80  |
| 2021-06-01T07:20:00.000000Z | 15  |
| 2021-06-01T13:20:00.000000Z | 10  |
| 2021-06-01T19:20:00.000000Z | 40  |
| 2021-06-02T01:10:00.000000Z | 90  |
| 2021-06-02T07:20:00.000000Z | 30  |

The following query can be used to sample the table by day. Note that the
default sample calculation can be made explicit in a query using
`ALIGN TO FIRST OBSERVATION`:

```questdb-sql
SELECT ts, count() FROM sensors
SAMPLE BY 1d

-- Equivalent to
SELECT ts, count() FROM sensors
SAMPLE BY 1d
ALIGN TO FIRST OBSERVATION
```

This query will return two rows:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:10:00.000000Z | 5     |
| 2021-06-01T23:10:00.000000Z | 2     |

The timestamp value for the 24 hour groups start at the first-observed
timestamp.

## ALIGN TO CALENDAR

The option aligns data to calendar dates, with two optional parameters:

- [TIME ZONE](#time-zone)
- [WITH OFFSET](#with-offset)

### TIME ZONE

A time zone may be provided for sampling with calendar alignment. Details on the
options for specifying time zones with available formats are provided in the
guide for
[working with timestamps and time zones](/docs/guides/working-with-timestamps-timezones/).

```questdb-sql
SELECT ts, count() FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin'
```

In this case, the 24 hour samples begin at `2021-05-31T01:00:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T01:00:00.000000Z | 1     |
| 2021-06-01T01:00:00.000000Z | 4     |
| 2021-06-02T01:00:00.000000Z | 2     |

Additionally, an offset may be applied when aligning sample calculation to
calendar

```questdb-sql
SELECT ts, count() FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin' WITH OFFSET '00:45'
```

In this case, the 24 hour samples begin at `2021-05-31T01:45:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T01:45:00.000000Z | 2     |
| 2021-06-01T01:45:00.000000Z | 4     |
| 2021-06-02T01:45:00.000000Z | 1     |

#### Local timezone output

The timestamp values output from `SAMPLE BY` queries is in UTC. To have UTC
values converted to specific timezones the
[to_timezone() function](/docs/reference/function/date-time/#to_timezone) should
be used.

```questdb-sql
SELECT to_timezone(ts, 'PST') ts, count
FROM (SELECT ts, count()
      FROM sensors SAMPLE BY 2h
      ALIGN TO CALENDAR TIME ZONE 'PST')
```

#### Time zone transitions

Calendar dates may contain historical time zone transitions or may vary in the
total number of hours due to daylight savings time. Considering the 31st October
2021, in the `Europe/London` calendar day which consists of 25 hours:

> - Sunday, 31 October 2021, 02:00:00 clocks are turned backward 1 hour to
> - Sunday, 31 October 2021, 01:00:00 local standard time

When a `SAMPLE BY` operation crosses time zone transitions in cases such as
this, the first sampled group which spans a transition will include aggregates
by full calendar range. Consider a table `sensors` with one data point per hour
spanning three calendar hours:

| ts                          | val |
| --------------------------- | --- |
| 2021-10-31T00:10:00.000000Z | 10  |
| 2021-10-31T01:10:00.000000Z | 20  |
| 2021-10-31T02:10:00.000000Z | 30  |
| 2021-10-31T03:10:00.000000Z | 40  |
| 2021-10-31T04:10:00.000000Z | 50  |

The following query will sample by hour with the `Europe/London` time zone and
align to calendar ranges:

```questdb-sql
SELECT ts, count() FROM sensors
SAMPLE BY 1h
ALIGN TO CALENDAR TIME ZONE 'Europe/London'
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
'Europe/London'.

### WITH OFFSET

Aligning sampling calculation can be provided an arbitrary offset in the format
`'+/-HH:mm'`, for example:

- `'00:30'` plus thirty minutes
- `'+00:30'` plus thirty minutes
- `'-00:15'` minus 15 minutes

The query uses the default offset '00:00' if the parameter is not set.

```questdb-sql
SELECT ts, count() FROM sensors
SAMPLE BY 1d
ALIGN TO CALENDAR WITH OFFSET '02:00'
```

In this case, the 24 hour samples begin at `2021-05-31T02:00:00.000000Z`:

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T02:00:00.000000Z | 2     |
| 2021-06-01T02:00:00.000000Z | 4     |
| 2021-06-02T02:00:00.000000Z | 1     |

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
SELECT ts, count() FROM trades SAMPLE BY 1h;
```

| ts                          | count |
| --------------------------- | ----- |
| 2021-05-31T23:45:10.000000Z | 3     |
| 2021-06-01T00:45:10.000000Z | 1     |
| 2021-05-31T23:45:10.000000Z | 1     |
| 2021-06-01T00:45:10.000000Z | 1     |

The following will return the trade volume in 30 minute intervals

```questdb-sql title="30 minute interval"
SELECT ts, sum(quantity*price) FROM trades SAMPLE BY 30m;
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
SELECT ts, avg(quantity*price) FROM trades SAMPLE BY 1d;
```

| ts                          | avg               |
| --------------------------- | ----------------- |
| 2021-05-31T23:45:10.000000Z | 6839.416666666667 |

To make this sample align to calendar dates:

```questdb-sql title="Calendar alignment"
SELECT ts, avg(quantity*price) FROM trades SAMPLE BY 1d ALIGN TO CALENDAR;
```

| ts                          | avg    |
| --------------------------- | ------ |
| 2021-05-31T00:00:00.000000Z | 1000.5 |
| 2021-06-01T00:00:00.000000Z | 8007.2 |

## See also

This section includes links to additional information such as tutorials:

- [SQL Extensions for Time-Series Data in QuestDB](/blog/2022/11/23/sql-extensions-time-series-data-questdb-part-ii/)

- [Three SQL Keywords for Finding Missing Data](/blog/three-sql-keywords-for-finding-missing-data/)
