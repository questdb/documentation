---
title: Timestamp, date and time functions
sidebar_label: Date and time
description: Timestamp, date and time functions reference documentation.
---

This page describes the available functions to assist with performing time-based
calculations using timestamps.

## Timestamp format

The timestamp format is formed by units and arbitrary text. A unit is a
combination of letters representing a date or time component, as defined by the
table below. The letters used to form a unit are case-sensitive.

See
[Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
for more examples of how the units are used to parse inputs.

| Unit   | Date or Time Component                                                                                         | Presentation       | Examples                              |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------- |
| `G`    | Era designator                                                                                                 | Text               | AD                                    |
| `y`    | `y` single digit or greedy year, depending on the input digit number                                           | Year               | 1996; 96; 999; 3                      |
| `yy`   | Two digit year of the current century                                                                          | Year               | 96 (interpreted as 2096)              |
| `yyy`  | Three-digit year                                                                                               | Year               | 999                                   |
| `yyyy` | Four-digit year                                                                                                | Year               | 1996                                  |
| `M`    | Month in year                                                                                                  | Month              | July; Jul; 07                         |
| `w`    | Week in year                                                                                                   | Number             | 27                                    |
| `ww`   | ISO week of year                                                                                               | Number             | 2                                     |
| `D`    | Day in year                                                                                                    | Number             | 189                                   |
| `d`    | Day in month                                                                                                   | Number             | 10                                    |
| `F`    | Day of week in month                                                                                           | Number             | 2                                     |
| `E`    | Day name in week                                                                                               | Text               | Tuesday; Tue                          |
| `u`    | Day number of week (1 = Monday, ..., 7 = Sunday)                                                               | Number             | 1                                     |
| `a`    | Am/pm marker                                                                                                   | Text               | PM                                    |
| `H`    | Hour in day (0-23)                                                                                             | Number             | 0                                     |
| `k`    | Hour in day (1-24)                                                                                             | Number             | 24                                    |
| `K`    | Hour in am/pm (0-11)                                                                                           | Number             | 0                                     |
| `h`    | Hour in am/pm (1-12)                                                                                           | Number             | 12                                    |
| `m`    | Minute in hour                                                                                                 | Number             | 30                                    |
| `s`    | Second in minute                                                                                               | Number             | 55                                    |
| `SSS`  | 3-digit millisecond                                                                                            | Number             | 978                                   |
| `S`    | Millisecond up to 3 digits: `S` parses 1 digit when followed by another `unit`. Otherwise, it parses 3 digits. | Number             | 900                                   |
| `z`    | Time zone                                                                                                      | General time zone  | Pacific Standard Time; PST; GMT-08:00 |
| `Z`    | Time zone                                                                                                      | RFC 822 time zone  | -0800                                 |
| `x`    | Time zone                                                                                                      | ISO 8601 time zone | -08; -0800; -08:00                    |
| `UUU`  | 3-digit microsecond                                                                                            | Number             | 698                                   |
| `U`    | Microsecond up to 3 digits: `U` parses 1 digit when followed by another `unit`. Otherwise, it parses 3 digits. | Number             | 600                                   |
| `U+`   | 6-digit microsecond                                                                                            | Number             | 600                                   |
| `N`    | Nanosecond. QuestDB provides microsecond resolution so the parsed nanosecond will be truncated.                | Number             | N/A (truncated)                       |
| `N+`   | 9-digit nanosecond. QuestDB provides microsecond resolution so the parsed nanosecond will be truncated.        | Number             | N/A (truncated)                       |

### Examples for greedy year format `y`

The interpretation of `y` depends on the input digit number:

- If the input year is a two-digit number, the output timestamp assumes the
  current century.
- Otherwise, the number is interpreted as it is.

| Input year | Timestamp value interpreted by `y-M` | Notes                                                |
| ---------- | ------------------------------------ | ---------------------------------------------------- |
| `5-03`     | `0005-03-01T00:00:00.000000Z`        | Greedily parsing the number as it is                 |
| `05-03`    | `2005-03-01T00:00:00.000000Z`        | Greedily parsing the number assuming current century |
| `005-03`   | `0005-03-01T00:00:00.000000Z`        | Greedily parsing the number as it is                 |
| `0005-03`  | `0005-03-01T00:00:00.000000Z`        | Greedily parsing the number as it is                 |

## Timestamp to Date conversion

As described at the [data types section](/docs/reference/sql/datatypes), the
only difference between `TIMESTAMP` and `DATE` in QuestDB type system is the
resolution. Whilst `TIMESTAMP` stores resolution as an offset from Unix epoch in
microseconds, `DATE` stores the offset in milliseconds.

Since both types are backed by a signed long, this means the `DATE` type has a
wider range. A `DATE` column can store about ±2.9 million years from the Unix
epoch, whereas a `TIMESTAMP` has an approximate range of ±290,000 years.

For most purposes a `TIMESTAMP` is preferred, as it offers a wider range of
functions whilst still being 8 bytes in size.

Be aware that, when using a `TIMESTAMP` as the designated timestamp, you cannot
set it to any value before the Unix epoch (`1970-01-01T00:00:00.000000Z`).

To explicitly convert from `TIMESTAMP` to `DATE`, you can use
`CAST(ts_column AS DATE)`. To convert from `DATE` to `TIMESTAMP` you can
`CAST(date_column AS TIMESTAMP)`.

### Programmatically convert from language-specific datetimes into QuestDB timestamps

Different programming languages use different types of objects to represent the
`DATE` type. To learn how to convert from the `DATE` type into a `TIMESTAMP`
object in Python, Go, Java, JavaScript, C/C++, Rust, or C#/.NET, please visit
our [Date to Timestamp conversion](/docs/clients/date-to-timestamp-conversion)
reference.

---

# Function Reference

## date_trunc

`date_trunc(unit, timestamp)` - returns a timestamp truncated to the specified
precision.

**Arguments:**

- `unit` is one of the following:

  - `millennium`
  - `decade`
  - `century`
  - `year`
  - `quarter`
  - `month`
  - `week`
  - `day`
  - `hour`
  - `minute`
  - `second`
  - `millisecond`
  - `microsecond`

- `timestamp` is any timestamp value.

**Return value:**

Return value type is `timestamp`

**Examples:**

```questdb-sql
SELECT date_trunc('hour', '2022-03-11T22:00:30.555555Z') hour,
date_trunc('month', '2022-03-11T22:00:30.555555Z') month,
date_trunc('year','2022-03-11T22:00:30.555555Z') year;
```

| hour                        | month                       | year                        |
| --------------------------- | --------------------------- | --------------------------- |
| 2022-03-11T22:00:00.000000Z | 2022-03-01T00:00:00.000000Z | 2022-01-01T00:00:00.000000Z |

## dateadd

`dateadd(period, n, startDate[, timezone])` - adds `n` `period` to `startDate`,
optionally respecting timezone DST transitions.

:::tip

When a timezone is specified, the function handles daylight savings time
transitions correctly. This is particularly important when adding periods that
could cross DST boundaries (like weeks, months, or years).

Without the timezone parameter, the function performs simple UTC arithmetic
which may lead to incorrect results when crossing DST boundaries. For
timezone-aware calculations, use the timezone parameter.

:::

**Arguments:**

- `period` is a `char`. Period to be added. Available periods are:

  - `u`: microseconds
  - `T`: milliseconds
  - `s`: second
  - `m`: minute
  - `h`: hour
  - `d`: day
  - `w`: week
  - `M`: month
  - `y`: year

- `n` is an `int` indicating the number of periods to add.
- `startDate` is a timestamp or date indicating the timestamp to add the period
  to.
- `timezone` (optional) is a string specifying the timezone to use for DST-aware
  calculations - for example, 'Europe/London'.

**Return value:**

Return value type is `timestamp`

**Examples:**

```questdb-sql title="Adding hours"
SELECT systimestamp(), dateadd('h', 2, systimestamp())
FROM long_sequence(1);
```

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-04-17T02:30:51.380499Z |

```questdb-sql title="Adding days"
SELECT systimestamp(), dateadd('d', 2, systimestamp())
FROM long_sequence(1);
```

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-04-19T00:30:51.380499Z |

```questdb-sql title="Adding weeks with timezone"
SELECT
    '2024-10-21T10:00:00Z',
    dateadd('w', 1, '2024-10-21T10:00:00Z', 'Europe/Bratislava') as with_tz,
    dateadd('w', 1, '2024-10-21T10:00:00Z') as without_tz
FROM long_sequence(1);
```

| timestamp                | with_tz                  | without_tz               |
| :----------------------- | :----------------------- | :----------------------- |
| 2024-10-21T10:00:00.000Z | 2024-10-28T10:00:00.000Z | 2024-10-28T09:00:00.000Z |

Note how the timezone-aware calculation correctly handles the DST transition in
`Europe/Bratislava`.

```questdb-sql title="Adding months"
SELECT systimestamp(), dateadd('M', 2, systimestamp())
FROM long_sequence(1);
```

| systimestamp                | dateadd                     |
| :-------------------------- | :-------------------------- |
| 2020-04-17T00:30:51.380499Z | 2020-06-17T00:30:51.380499Z |

## datediff

`datediff(period, date1, date2)` - returns the absolute number of `period`
between `date1` and `date2`.

**Arguments:**

- `period` is a char. Period to be added. Available periods are:

  - `u`: microseconds
  - `T`: milliseconds
  - `s`: second
  - `m`: minute
  - `h`: hour
  - `d`: day
  - `w`: week
  - `M`: month
  - `y`: year

- `date1` and `date2` are timestamps defining the dates to compare.

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Difference in days"
SELECT datediff('d', '2020-01-23', '2020-01-27');
```

| datediff |
| :------- |
| 4        |

```questdb-sql title="Difference in months"
SELECT datediff('M', '2020-01-23', '2020-02-27');
```

| datediff |
| :------- |
| 1        |

## day

`day(value)` - returns the `day` of month for a given timestamp from `1` to
`31`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Day of the month" demo
SELECT day(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM trades
LIMIT -1;
```

| day |
| :-- |
| 01  |

```questdb-sql title="Using in an aggregation"
SELECT day(ts), count() FROM transactions;
```

| day | count |
| :-- | :---- |
| 1   | 2323  |
| 2   | 6548  |
| ... | ...   |
| 30  | 9876  |
| 31  | 2567  |

## day_of_week

`day_of_week(value)` - returns the day number in a week from `1` (Monday) to `7`
(Sunday).

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql
SELECT to_str(ts,'EE'),day_of_week(ts) FROM myTable;
```

| day       | day_of_week |
| :-------- | :---------- |
| Monday    | 1           |
| Tuesday   | 2           |
| Wednesday | 3           |
| Thursday  | 4           |
| Friday    | 5           |
| Saturday  | 6           |
| Sunday    | 7           |

## day_of_week_sunday_first

`day_of_week_sunday_first(value)` - returns the day number in a week from `1`
(Sunday) to `7` (Saturday).

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql
SELECT to_str(ts,'EE'),day_of_week_sunday_first(ts) FROM myTable;
```

| day       | day_of_week_sunday_first |
| :-------- | :----------------------- |
| Monday    | 2                        |
| Tuesday   | 3                        |
| Wednesday | 4                        |
| Thursday  | 5                        |
| Friday    | 6                        |
| Saturday  | 7                        |
| Sunday    | 1                        |

## days_in_month

`days_in_month(value)` - returns the number of days in a month from a given
timestamp or date.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql
SELECT month(ts), days_in_month(ts) FROM myTable;
```

| month | days_in_month |
| :---- | :------------ |
| 4     | 30            |
| 5     | 31            |
| 6     | 30            |
| 7     | 31            |
| 8     | 31            |

## extract

`extract(unit, timestamp)` - returns the selected time unit from the input
timestamp.

**Arguments:**

- `unit` is one of the following:

  - `millennium`
  - `epoch`
  - `decade`
  - `century`
  - `year`
  - `isoyear`
  - `doy` (day of year)
  - `quarter`
  - `month`
  - `week`
  - `dow` (day of week)
  - `isodow`
  - `day`
  - `hour`
  - `minute`
  - `second`
  - `microseconds`
  - `milliseconds`

- `timestamp` is any timestamp value.

**Return value:**

Return value type is `integer`.

**Examples**

```questdb-sql

SELECT extract(millennium from '2023-03-11T22:00:30.555555Z') millennium,
extract(year from '2023-03-11T22:00:30.555555Z') year,
extract(month from '2023-03-11T22:00:30.555555Z') month,
extract(week from '2023-03-11T22:00:30.555555Z') quarter,
extract(hour from '2023-03-11T22:00:30.555555Z') hour,
extract(second from '2023-03-11T22:00:30.555555Z') second;
```

| millennium | year | month | quarter | hour | second |
| ---------- | ---- | ----- | ------- | ---- | ------ |
| 3          | 2023 | 3     | 10      | 22   | 30     |

## hour

`hour(value)` - returns the `hour` of day for a given timestamp from `0` to
`23`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Hour of the day"
SELECT hour(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
```

| hour |
| :--- |
| 12   |

```questdb-sql title="Using in an aggregation"
SELECT hour(ts), count() FROM transactions;
```

| hour | count |
| :--- | :---- |
| 0    | 2323  |
| 1    | 6548  |
| ...  | ...   |
| 22   | 9876  |
| 23   | 2567  |

## interval

`interval(start_timestamp, end_timestamp)` - creates a time interval from two
timestamps.

**Arguments:**

- `start_timestamp` is a timestamp.
- `end_timestamp` is a timestamp not earlier than the `start_timestamp`.

**Return value:**

Return value type is `interval`.

**Examples:**

```questdb-sql title="Construct an interval" demo
SELECT interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
```

| interval                                                 |
| :------------------------------------------------------- |
| ('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z') |

## interval_start

`interval_start(interval)` - extracts the lower bound of the interval.

**Arguments:**

- `interval` is an `interval`.

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql title="Extract an interval lower bound" demo
SELECT
  interval_start(
    interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
  )
```

| interval_start              |
| :-------------------------- |
| 2024-10-08T11:09:47.573000Z |

## interval_end

`interval_end(interval)` - extracts the upper bound of the interval.

**Arguments:**

- `interval` is an `interval`.

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql title="Extract an interval upper bound" demo
SELECT
  interval_end(
    interval('2024-10-08T11:09:47.573Z', '2024-10-09T11:09:47.573Z')
  )
```

| interval_end                |
| :-------------------------- |
| 2024-10-09T11:09:47.573000Z |

## is_leap_year

`is_leap_year(value)` - returns `true` if the `year` of `value` is a leap year,
`false` otherwise.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `boolean`

**Examples:**

```questdb-sql title="Simple example" demo
SELECT year(timestamp), is_leap_year(timestamp)
FROM trades
limit -1;
```

| year | is_leap_year |
| :--- | :----------- |
| 2020 | true         |
| 2021 | false        |
| 2022 | false        |
| 2023 | false        |
| 2024 | true         |
| 2025 | false        |

## micros

`micros(value)` - returns the `micros` of the millisecond for a given date or
timestamp from `0` to `999`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Micros of the second"
SELECT micros(to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'))
FROM long_sequence(1);
```

| millis |
| :----- |
| 456    |

```questdb-sql title="Parsing 3 digits when no unit is added after U"
SELECT micros(to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSU'))
FROM long_sequence(1);
```

| millis |
| :----- |
| 456    |

```questdb-sql title="Using in an aggregation"
SELECT micros(ts), count() FROM transactions;
```

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 998    | 9876  |
| 999    | 2567  |

## millis

`millis(value)` - returns the `millis` of the second for a given date or
timestamp from `0` to `999`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Millis of the second"
SELECT millis(
    to_timestamp('2020-03-01:15:43:21.123456', 'yyyy-MM-dd:HH:mm:ss.SSSUUU'))
FROM long_sequence(1);
```

| millis |
| :----- |
| 123    |

```questdb-sql title="Parsing 3 digits when no unit is added after S"
SELECT millis(to_timestamp('2020-03-01:15:43:21.123', 'yyyy-MM-dd:HH:mm:ss.S'))
FROM long_sequence(1);
```

| millis |
| :----- |
| 123    |

```questdb-sql title="Using in an aggregation"
SELECT millis(ts), count() FROM transactions;
```

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 998    | 9876  |
| 999    | 2567  |

## minute

`minute(value)` - returns the `minute` of the hour for a given timestamp from
`0` to `59`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Minute of the hour" demo
SELECT minute(to_timestamp('2022-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM trades
LIMIT -1;
```

| minute |
| :----- |
| 43     |

```questdb-sql title="Using in an aggregation"
SELECT minute(ts), count() FROM transactions;
```

| minute | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 58     | 9876  |
| 59     | 2567  |

## month

`month(value)` - returns the `month` of year for a given date from `1` to `12`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Month of the year"
SELECT month(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
```

| month |
| :---- |
| 03    |

```questdb-sql title="Using in an aggregation"
SELECT month(ts), count() FROM transactions;
```

| month | count |
| :---- | :---- |
| 1     | 2323  |
| 2     | 6548  |
| ...   | ...   |
| 11    | 9876  |
| 12    | 2567  |

## now

`now()` - offset from UTC Epoch in microseconds.

Calculates `UTC timestamp` using system's real time clock. Unlike
`systimestamp()`, it does not change within the query execution timeframe and
should be used in WHERE clause to filter designated timestamp column relative to
current time, i.e.:

- `SELECT now() FROM long_sequence(200)` will return the same timestamp for all
  rows
- `SELECT systimestamp() FROM long_sequence(200)` will have new timestamp values
  for each row

**Arguments:**

- `now()` does not accept arguments.

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql title="Filter records to created within last day"
SELECT created, origin FROM telemetry
WHERE created > dateadd('d', -1, now());
```

| created                     | origin |
| :-------------------------- | :----- |
| 2021-02-01T21:51:34.443726Z | 1      |

```questdb-sql title="Query returns same timestamp in every row"
SELECT now() FROM long_sequence(3)
```

| now                         |
| :-------------------------- |
| 2021-02-01T21:51:34.443726Z |
| 2021-02-01T21:51:34.443726Z |
| 2021-02-01T21:51:34.443726Z |

```questdb-sql title="Query based on last minute"
SELECT * FROM readings
WHERE date_time > now() - 60000000L;
```

## pg_postmaster_start_time

`pg_postmaster_start_time()` - returns the time when the server started.

**Arguments**

- `pg_postmaster_start_time()` does not accept arguments.

**Return value:**

Return value type is `timestamp`

**Examples**

```questdb-sql
SELECT pg_postmaster_start_time();
```

|  pg_postmaster_start_time   |
| :-------------------------: |
| 2023-03-30T16:20:29.763961Z |

## second

`second(value)` - returns the `second` of the minute for a given date or
timestamp from `0` to `59`.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Second of the minute"
SELECT second(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
```

| second |
| :----- |
| 43     |

```questdb-sql title="Using in an aggregation"
SELECT second(ts), count() FROM transactions;
```

| second | count |
| :----- | :---- |
| 0      | 2323  |
| 1      | 6548  |
| ...    | ...   |
| 58     | 9876  |
| 59     | 2567  |

## today, tomorrow, yesterday

- `today()` - returns an interval representing the current day.

- `tomorrow()` - returns an interval representing the next day.

- `yesterday()` - returns an interval representing the previous day.

Interval is in the UTC/GMT+0 timezone.

**Arguments:**

No arguments taken.

**Return value:**

Return value is of type `interval`.

**Examples:**

```questdb-sql title="Using today"
SELECT true as in_today FROM long_sequence(1)
WHERE now() IN today();
```

## today, tomorrow, yesterday with timezone

- `today(timezone)` - returns an interval representing the current day with
  timezone adjustment.

- `tomorrow(timezone)` - returns an interval representing the next day timezone
  adjustment.

- `yesterday(timezone)` - returns an interval representing the previous day
  timezone adjustment.

**Arguments:**

`timezone` is a `string` matching a timezone.

**Return value:**

Return value is of type `interval`.

**Examples:**

```questdb-sql title="Using today" demo
SELECT today() as today, today('CEST') as adjusted;
```

| today                                                    | adjusted                                                 |
| :------------------------------------------------------- | :------------------------------------------------------- |
| ('2024-10-08T00:00:00.000Z', '2024-10-08T23:59:59.999Z') | ('2024-10-07T22:00:00.000Z', '2024-10-08T21:59:59.999Z') |

This function allows the user to specify their local timezone and receive a UTC
interval that corresponds to their 'day'.

In this example, `CEST` is a +2h offset, so the `CEST` day started at `10:00 PM`
`UTC` the day before.

## sysdate

`sysdate()` - returns the timestamp of the host system as a `date` with
`millisecond` precision.

Calculates `UTC date` with millisecond precision using system's real time clock.
The value is affected by discontinuous jumps in the system time (e.g., if the
system administrator manually changes the system time).

`sysdate()` value can change within the query execution timeframe and should
**NOT** be used in WHERE clause to filter designated timestamp column.

:::tip

Use `now()` with WHERE clause filter.

:::

**Arguments:**

- `sysdate()` does not accept arguments.

**Return value:**

Return value type is `date`.

**Examples:**

```questdb-sql title="Insert current system date along with a value"
INSERT INTO readings
VALUES(sysdate(), 123.5);
```

| sysdate                     | reading |
| :-------------------------- | :------ |
| 2020-01-02T19:28:48.727516Z | 123.5   |

```questdb-sql title="Query based on last minute"
SELECT * FROM readings
WHERE date_time > sysdate() - 60000000L;
```

## systimestamp

`systimestamp()` - offset from UTC Epoch in microseconds. Calculates
`UTC timestamp` using system's real time clock. The value is affected by
discontinuous jumps in the system time (e.g., if the system administrator
manually changes the system time).

`systimestamp()` value can change within the query execution timeframe and
should **NOT** be used in WHERE clause to filter designated timestamp column.

:::tip

Use now() with WHERE clause filter.

:::

**Arguments:**

- `systimestamp()` does not accept arguments.

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql title="Insert current system timestamp"
INSERT INTO readings
VALUES(systimestamp(), 123.5);
```

| ts                          | reading |
| :-------------------------- | :------ |
| 2020-01-02T19:28:48.727516Z | 123.5   |

## timestamp_ceil

`timestamp_ceil(unit, timestamp)` - performs a ceiling calculation on a
timestamp by given unit.

A unit must be provided to specify which granularity to perform rounding.

**Arguments:**

`timestamp_ceil(unit, timestamp)` has the following arguments:

`unit` - may be one of the following:

- `T` milliseconds
- `s` seconds
- `m` minutes
- `h` hours
- `d` days
- `M` months
- `y` year

`timestamp` - any timestamp value

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql
WITH t AS (SELECT cast('2016-02-10T16:18:22.862145Z' AS timestamp) ts)
SELECT
  ts,
  timestamp_ceil('T', ts) c_milli,
  timestamp_ceil('s', ts) c_second,
  timestamp_ceil('m', ts) c_minute,
  timestamp_ceil('h', ts) c_hour,
  timestamp_ceil('d', ts) c_day,
  timestamp_ceil('M', ts) c_month,
  timestamp_ceil('y', ts) c_year
  FROM t
```

| ts                          | c_milli                     | c_second                    | c_minute                    | c_hour                      | c_day                       | c_month                     | c_year                       |
| :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :--------------------------- |
| 2016-02-10T16:18:22.862145Z | 2016-02-10T16:18:22.863000Z | 2016-02-10T16:18:23.000000Z | 2016-02-10T16:19:00.000000Z | 2016-02-10T17:00:00.000000Z | 2016-02-11T00:00:00.000000Z | 2016-03-01T00:00:00.000000Z | 2017-01-01T00:00:00.000000Z" |

## timestamp_floor

`timestamp_floor(interval, timestamp)` - performs a floor calculation on a
timestamp by given interval expression.

An interval expression must be provided to specify which granularity to perform
rounding for.

**Arguments:**

`timestamp_floor(interval, timestamp)` has the following arguments:

`unit` - is a time interval expression that may use one of the following
suffices:

- `T` milliseconds
- `s` seconds
- `m` minutes
- `h` hours
- `d` days
- `M` months
- `y` year

`timestamp` - any timestamp value

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql
SELECT timestamp_floor('5d', '2018-01-01')
```

Gives:

| timestamp_floor             |
| --------------------------- |
| 2017-12-30T00:00:00.000000Z |

The number part of the expression is optional:

```questdb-sql
WITH t AS (SELECT cast('2016-02-10T16:18:22.862145Z' AS timestamp) ts)
SELECT
  ts,
  timestamp_floor('T', ts) f_milli,
  timestamp_floor('s', ts) f_second,
  timestamp_floor('m', ts) f_minute,
  timestamp_floor('h', ts) f_hour,
  timestamp_floor('d', ts) f_day,
  timestamp_floor('M', ts) f_month,
  timestamp_floor('y', ts) f_year
  FROM t
```

Gives:

| ts                          | f_milli                     | f_second                    | f_minute                    | f_hour                      | f_day                       | f_month                     | f_year                      |
| :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- | :-------------------------- |
| 2016-02-10T16:18:22.862145Z | 2016-02-10T16:18:22.862000Z | 2016-02-10T16:18:22.000000Z | 2016-02-10T16:18:00.000000Z | 2016-02-10T16:00:00.000000Z | 2016-02-10T00:00:00.000000Z | 2016-02-01T00:00:00.000000Z | 2016-01-01T00:00:00.000000Z |

#### timestamp_floor with offset

When timestamps are floored by `timestamp_floor(interval, timestamp)`, they are
based on a root timestamp of `0`. This means that some floorings with a stride
can be confusing, since they are based on a modulo from `1970-01-01`.

For example:

```questdb-sql
SELECT timestamp_floor('5d', '2018-01-01')
```

Gives:

| timestamp_floor             |
| --------------------------- |
| 2017-12-30T00:00:00.000000Z |

If you wish to calculate bins from an offset other than `1970-01-01`, you can
add a third parameter: `timestamp_floor(interval, timestamp, offset)`. The
offset acts as a baseline from which further values are calculated.

```questdb-sql
SELECT timestamp_floor('5d', '2018-01-01', '2018-01-01')
```

Gives:

| timestamp_floor             |
| --------------------------- |
| 2018-01-01T00:00:00.000000Z |

You can test this on the QuestDB Demo:

```questdb-sql
SELECT timestamp_floor('5d', pickup_datetime, '2018') t, count
FROM trips
WHERE pickup_datetime in '2018'
ORDER BY 1;
```

Gives:

| t                           | count   |
| --------------------------- | ------- |
| 2018-01-01T00:00:00.000000Z | 1226531 |
| 2018-01-06T00:00:00.000000Z | 1468302 |
| 2018-01-11T00:00:00.000000Z | 1604016 |
| 2018-01-16T00:00:00.000000Z | 1677303 |
| ...                         | ...     |

## timestamp_shuffle

`timestamp_shuffle(timestamp_1, timestamp_2)` - generates a random timestamp
inclusively between the two input timestamps.

**Arguments:**

- `timestamp_1` - any timestamp value
- `timestamp_2` - a timestamp value that is not equal to `timestamp_1`

**Return value:**

Return value type is `timestamp`.

**Examples:**

```questdb-sql
SELECT timestamp_shuffle('2023-03-31T22:00:30.555998Z', '2023-04-01T22:00:30.555998Z');
```

| timestamp_shuffle           |
| :-------------------------- |
| 2023-04-01T11:44:41.893394Z |

## to_date

:::note

While the `date` data type is available, we highly recommend applying the
`timestamp` data type in its place.

The only material advantage of date is a wider time range; timestamp however is
adequate in virtually all cases.

Date supports fewer functions and uses milliseconds instead of microseconds.

:::

`to_date(string, format)` - converts string to `date` by using the supplied
`format` to extract the value.

Will convert a `string` to `date` using the format definition passed as an
argument. When the `format` definition does not match the `string` input, the
result will be `null`.

For more information about recognized timestamp formats, see the
[timestamp format section](#date-and-timestamp-format).

**Arguments:**

- `string` is any string that represents a date and/or time.
- `format` is a string that describes the `date format` in which `string` is
  expressed.

**Return value:**

Return value type is `date`

**Examples:**

```questdb-sql title="string matches format" demo
SELECT to_date('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss')
FROM trades;
```

| to_date                  |
| :----------------------- |
| 2020-03-01T15:43:21.000Z |

```questdb-sql title="string does not match format"
SELECT to_date('2020-03-01:15:43:21', 'yyyy')
FROM long_sequence(1);
```

| to_date |
| :------ |
| null    |

```questdb-sql title="Using with INSERT"
INSERT INTO measurements
values(to_date('2019-12-12T12:15', 'yyyy-MM-ddTHH:mm'), 123.5);
```

| date                     | value |
| :----------------------- | :---- |
| 2019-12-12T12:15:00.000Z | 123.5 |

## to_str

`to_str(value, format)` - converts timestamp value to a string in the specified
format.

Will convert a timestamp value to a string using the format definition passed as
an argument. When elements in the `format` definition are unrecognized, they
will be passed-through as string.

For more information about recognized timestamp formats, see the
[timestamp format section](#date-and-timestamp-format).

**Arguments:**

- `value` is any `date` or `timestamp`
- `format` is a timestamp format.

**Return value:**

Return value type is `string`

**Examples:**

- Basic example

```questdb-sql
SELECT to_str(systimestamp(), 'yyyy-MM-dd') FROM long_sequence(1);
```

| to_str     |
| :--------- |
| 2020-03-04 |

- With unrecognized timestamp definition

```questdb-sql
SELECT to_str(systimestamp(), 'yyyy-MM-dd gooD DAY 123') FROM long_sequence(1);
```

| to_str                  |
| :---------------------- |
| 2020-03-04 gooD DAY 123 |

## to_timestamp

`to_timestamp(string, format)` - converts `string` to `timestamp` by using the
supplied `format` to extract the value with microsecond precision.

When the `format` definition does not match the `string` input, the result will
be `null`.

For more information about recognized timestamp formats, see the
[timestamp format section](#date-and-timestamp-format).

**Arguments:**

- `string` is any string that represents a date and/or time.
- `format` is a string that describes the timestamp format in which `string` is
  expressed.

**Return value:**

Return value type is `timestamp`. QuestDB provides `timestamp` with microsecond
resolution. Input strings with nanosecond precision will be parsed but lose the
precision.

**Examples:**

```questdb-sql title="Pattern matching with microsecond precision"
SELECT to_timestamp('2020-03-01:15:43:21.127329', 'yyyy-MM-dd:HH:mm:ss.SSSUUU')
FROM long_sequence(1);
```

| to_timestamp                |
| :-------------------------- |
| 2020-03-01T15:43:21.127329Z |

```questdb-sql title="Precision loss when pattern matching with nanosecond precision"
SELECT to_timestamp('2020-03-01:15:43:00.000000001Z', 'yyyy-MM-dd:HH:mm:ss.SSSUUUNNNZ')
FROM long_sequence(1);
```

| to_timestamp                |
| :-------------------------- |
| 2020-03-01T15:43:00.000000Z |

```questdb-sql title="String does not match format"
SELECT to_timestamp('2020-03-01:15:43:21', 'yyyy')
FROM long_sequence(1);
```

| to_timestamp |
| :----------- |
| null         |

```questdb-sql title="Using with INSERT"
INSERT INTO measurements
values(to_timestamp('2019-12-12T12:15', 'yyyy-MM-ddTHH:mm'), 123.5);
```

| timestamp                   | value |
| :-------------------------- | :---- |
| 2019-12-12T12:15:00.000000Z | 123.5 |

Note that conversion of ISO timestamp format is optional. QuestDB automatically
converts `string` to `timestamp` if it is a partial or full form of
`yyyy-MM-ddTHH:mm:ss.SSSUUU` or `yyyy-MM-dd HH:mm:ss.SSSUUU` with a valid time
offset, `+01:00` or `Z`. See more examples in
[Native timestamp](/docs/reference/sql/where/#native-timestamp-format)

## to_timezone

`to_timezone(timestamp, timezone)` - converts a timestamp value to a specified
timezone. For more information on the time zone database used for this function,
see the
[QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).

**Arguments:**

- `timestamp` is any `timestamp` as Unix timestamp or string equivalent
- `timezone` may be `Country/City` tz database name, time zone abbreviation such
  as `PST` or in UTC offset in string format.

**Return value:**

Return value type is `timestamp`

**Examples:**

- Unix UTC timestamp in microseconds to `Europe/Berlin`

```questdb-sql
SELECT to_timezone(1623167145000000, 'Europe/Berlin')
```

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T17:45:45.000000Z |

- Unix UTC timestamp in microseconds to PST by UTC offset

```questdb-sql
SELECT to_timezone(1623167145000000, '-08:00')
```

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T07:45:45.000000Z |

- Timestamp as string to `PST`

```questdb-sql
SELECT to_timezone('2021-06-08T13:45:45.000000Z', 'PST')
```

| to_timezone                 |
| :-------------------------- |
| 2021-06-08T06:45:45.000000Z |

## to_utc

`to_utc(timestamp, timezone)` - converts a timestamp by specified timezone to
UTC. May be provided a timezone in string format or a UTC offset in hours and
minutes. For more information on the time zone database used for this function,
see the
[QuestDB time zone database documentation](/docs/guides/working-with-timestamps-timezones/).

**Arguments:**

- `timestamp` is any `timestamp` as Unix timestamp or string equivalent
- `timezone` may be `Country/City` tz database name, time zone abbreviation such
  as `PST` or in UTC offset in string format.

**Return value:**

Return value type is `timestamp`

**Examples:**

- Convert a Unix timestamp in microseconds from the `Europe/Berlin` timezone to
  UTC

```questdb-sql
SELECT to_utc(1623167145000000, 'Europe/Berlin')
```

| to_utc                      |
| :-------------------------- |
| 2021-06-08T13:45:45.000000Z |

- Unix timestamp in microseconds from PST to UTC by UTC offset

```questdb-sql
SELECT to_utc(1623167145000000, '-08:00')
```

| to_utc                      |
| :-------------------------- |
| 2021-06-08T23:45:45.000000Z |

- Timestamp as string in `PST` to UTC

```questdb-sql
SELECT to_utc('2021-06-08T13:45:45.000000Z', 'PST')
```

| to_utc                      |
| :-------------------------- |
| 2021-06-08T20:45:45.000000Z |

## week_of_year

`week_of_year(value)` - returns the number representing the week number in the
year.

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples**

```questdb-sql
SELECT week_of_year('2023-03-31T22:00:30.555998Z');
```

| week_of_year |
| :----------: |
|      13      |

## year

`year(value)` - returns the `year` for a given timestamp

**Arguments:**

- `value` is any `timestamp` or `date`

**Return value:**

Return value type is `int`

**Examples:**

```questdb-sql title="Year"
SELECT year(to_timestamp('2020-03-01:15:43:21', 'yyyy-MM-dd:HH:mm:ss'))
FROM long_sequence(1);
```

| year |
| :--- |
| 2020 |

```questdb-sql title="Using in an aggregation"
SELECT month(ts), count() FROM transactions;
```

| year | count |
| :--- | :---- |
| 2015 | 2323  |
| 2016 | 9876  |
| 2017 | 2567  |
