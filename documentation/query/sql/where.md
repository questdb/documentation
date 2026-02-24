---
title: WHERE keyword
sidebar_label: WHERE
description: WHERE SQL keyword reference documentation.
---

`WHERE` clause filters data. Filter expressions are required to return boolean
result.

QuestDB includes a [JIT compiler](/docs/concepts/deep-dive/jit-compiler/) for SQL queries
which contain `WHERE` clauses.

## Syntax

The general syntax is as follows. Specific filters have distinct syntaxes
detailed thereafter.

![Flow chart showing the syntax of the WHERE clause](/images/docs/diagrams/where.svg)

### Logical operators

QuestDB supports `AND`, `OR`, `NOT` as logical operators and can assemble
conditions using brackets `()`.

![Flow chart showing the detailed syntax of the WHERE clause](/images/docs/diagrams/whereComplex.svg)

```questdb-sql title="Example"
SELECT * FROM table
WHERE
a = 1 AND (b = 2 OR c = 3 AND NOT d);
```

## Symbol and string

QuestDB can filter strings and symbols based on equality, inequality, and
regular expression patterns.

### Exact match

Evaluates match of a string or symbol.

![Flow chart showing the syntax of the WHERE clause with a string comparison](/images/docs/diagrams/whereExactString.svg)

```questdb-sql title="Example"
SELECT * FROM users
WHERE name = 'John';
```

| name | age |
| ---- | --- |
| John | 31  |
| John | 45  |
| ...  | ... |

### Does NOT match

Evaluates mismatch of a string or symbol.

![Flow chart showing the syntax of the WHERE clause with a string comparison](/images/docs/diagrams/whereStringNotMatch.svg)

```questdb-sql title="Example"
SELECT * FROM users
WHERE name != 'John';
```

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

### Regular expression match

Evaluates match against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

![Flow chart showing the syntax of the WHERE clause with a regex comparison](/images/docs/diagrams/whereRegexMatch.svg)

```questdb-sql title="Regex example"
SELECT * FROM users WHERE name ~ 'Jo';
```

| name     | age |
| -------- | --- |
| Joe      | 31  |
| Jonathan | 45  |
| ...      | ... |

### Regular expression does NOT match

Evaluates mismatch against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

![Flow chart showing the syntax of the WHERE clause with a regex comparison](/images/docs/diagrams/whereRegexNotMatch.svg)

```questdb-sql title="Example"
SELECT * FROM users WHERE name !~ 'Jo';
```

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

### List search

Evaluates match or mismatch against a list of elements.

![Flow chart showing the syntax of the WHERE clause with a list comparison](/images/docs/diagrams/whereListIn.svg)

```questdb-sql title="List match"
SELECT * FROM users WHERE name in('Tim', 'Tom');
```

| name | age |
| ---- | --- |
| Tim  | 31  |
| Tom  | 45  |
| ...  | ... |

```questdb-sql title="List mismatch"
SELECT * FROM users WHERE NOT name in('Tim', 'Tom');
```

| name   | age |
| ------ | --- |
| Aaron  | 31  |
| Amelie | 45  |
| ...    | ... |

## Numeric

QuestDB can filter numeric values based on equality, inequality, comparison, and
proximity.

:::note

For timestamp filters, we recommend the
[timestamp search notation](#timestamp-and-date) which is faster and less
verbose.

:::

### Equality, inequality and comparison

![Flow chart showing the syntax of the WHERE clause with a numeric comparison](/images/docs/diagrams/whereNumericValue.svg)

```questdb-sql title="Superior or equal to 23"
SELECT * FROM users WHERE age >= 23;
```

```questdb-sql title="Equal to 23"
SELECT * FROM users WHERE age = 23;
```

```questdb-sql title="NOT Equal to 23"
SELECT * FROM users WHERE age != 23;
```

## Boolean

![Flow chart showing the syntax of the WHERE clause with a boolean comparison](/images/docs/diagrams/whereBoolean.svg)

Using the columnName will return `true` values. To return `false` values,
precede the column name with the `NOT` operator.

```questdb-sql title="Example - true"
SELECT * FROM users WHERE isActive;
```

| userId | isActive |
| ------ | -------- |
| 12532  | true     |
| 38572  | true     |
| ...    | ...      |

```questdb-sql title="Example - false"
SELECT * FROM users WHERE NOT isActive;
```

| userId | isActive |
| ------ | -------- |
| 876534 | false    |
| 43234  | false    |
| ...    | ...      |

## Timestamp and date

QuestDB supports both its own timestamp search notation and standard search
based on inequality. This section describes the use of the **timestamp search
notation** which is efficient and fast but requires a
[designated timestamp](/docs/concepts/designated-timestamp/).

If a table does not have a designated timestamp applied during table creation,
one may be applied dynamically
[during a select operation](/docs/query/functions/timestamp/#during-a-select-operation).

### Native timestamp format

QuestDB automatically recognizes strings formatted as ISO timestamp as a
`timestamp` type. The following are valid examples of strings parsed as
`timestamp` types:

| Valid STRING Format              | Resulting Timestamp         |
| -------------------------------- | --------------------------- |
| 2010-01-12T12:35:26.123456+01:30 | 2010-01-12T11:05:26.123456Z |
| 2010-01-12T12:35:26.123456+01    | 2010-01-12T11:35:26.123456Z |
| 2010-01-12T12:35:26.123456Z      | 2010-01-12T12:35:26.123456Z |
| 2010-01-12T12:35:26.12345        | 2010-01-12T12:35:26.123450Z |
| 2010-01-12T12:35:26.1234         | 2010-01-12T12:35:26.123400Z |
| 2010-01-12T12:35:26.123          | 2010-01-12T12:35:26.123000Z |
| 2010-01-12T12:35:26.12           | 2010-01-12T12:35:26.120000Z |
| 2010-01-12T12:35:26.1            | 2010-01-12T12:35:26.100000Z |
| 2010-01-12T12:35:26              | 2010-01-12T12:35:26.000000Z |
| 2010-01-12T12:35                 | 2010-01-12T12:35:00.000000Z |
| 2010-01-12T12                    | 2010-01-12T12:00:00.000000Z |
| 2010-01-12                       | 2010-01-12T00:00:00.000000Z |
| 2010-01                          | 2010-01-01T00:00:00.000000Z |
| 2010                             | 2010-01-01T00:00:00.000000Z |
| 2010-01-12 12:35:26.123456-02:00 | 2010-01-12T14:35:26.123456Z |
| 2010-01-12 12:35:26.123456Z      | 2010-01-12T12:35:26.123456Z |
| 2010-01-12 12:35:26.123          | 2010-01-12T12:35:26.123000Z |
| 2010-01-12 12:35:26.12           | 2010-01-12T12:35:26.120000Z |
| 2010-01-12 12:35:26.1            | 2010-01-12T12:35:26.100000Z |
| 2010-01-12 12:35:26              | 2010-01-12T12:35:26.000000Z |
| 2010-01-12 12:35                 | 2010-01-12T12:35:00.000000Z |

### Exact timestamp

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a timestamp comparison](/images/docs/diagrams/whereTimestampExact.svg)

```questdb-sql title="Timestamp equals date"
SELECT * FROM scores WHERE ts = '2010-01-12T00:02:26.000Z';
```

| ts                       | score |
| ------------------------ | ----- |
| 2010-01-12T00:02:26.000Z | 2.4   |
| 2010-01-12T00:02:26.000Z | 3.1   |
| ...                      | ...   |

```questdb-sql title="Timestamp equals timestamp"
SELECT * FROM scores WHERE ts = '2010-01-12T00:02:26.000000Z';
```

| ts                          | score |
| --------------------------- | ----- |
| 2010-01-12T00:02:26.000000Z | 2.4   |
| 2010-01-12T00:02:26.000000Z | 3.1   |
| ...                         | ...   |

### Time range (WHERE IN)

Returns results within a defined range.

:::tip Recommended: TICK syntax

For complex timestamp filtering, use [TICK interval syntax](/docs/query/operators/tick/).
TICK handles date ranges, business days, timezones, and schedules in a single
expression:

```questdb-sql
-- Last 5 business days, 9:30 AM New York time, 6.5 hour windows
WHERE ts IN '[$today-5bd..$today-1bd]T09:30@America/New_York#workday;6h30m'
```

With [exchange calendars](/docs/query/operators/exchange-calendars/) (Enterprise),
you can filter by real exchange schedules including holidays and early closes:

```questdb-sql
-- NYSE trading hours for January, holidays excluded automatically
WHERE ts IN '2025-01-[01..31]#XNYS'
```

:::

#### Syntax

![Flow chart showing the syntax of the WHERE clause with a partial timestamp comparison](/images/docs/diagrams/whereTimestampPartial.svg)

```questdb-sql title="Results in a given year"
SELECT * FROM scores WHERE ts IN '2018';
```

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:0000.000000Z  | 123.4 |
| ...                         | ...   |
| 2018-12-31T23:59:59.999999Z | 115.8 |

```questdb-sql title="Results in a given minute"
SELECT * FROM scores WHERE ts IN '2018-05-23T12:15';
```

| ts                          | score |
| --------------------------- | ----- |
| 2018-05-23T12:15:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-05-23T12:15:59.999999Z | 115.8 |

### Time range with interval modifier

You can apply a modifier to further customize the range. The modifier extends
the upper bound of the original timestamp based on the modifier parameter. An
optional interval with occurrence can be set, to apply the search in the given
time range repeatedly, for a set number of times.

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

The range is 2018. The modifier extends the upper bound (originally 31 Dec 2018)
by one month.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2019-01-31T23:59:59.999999Z | 115.8 |

```questdb-sql title="Results in a given month excluding the last 3 days"
SELECT * FROM scores WHERE ts IN '2018-01;-3d';
```

The range is Jan 2018. The modifier reduces the upper bound (originally 31
Jan 2018) by 3 days.

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-28T23:59:59.999999Z | 113.8 |

Modifying the interval:

```questdb-sql title="Results on a given date with an interval"
SELECT * FROM scores WHERE ts IN '2018-01-01;1d;1y;2';

```

The range is extended by one day from Jan 1 2018, with a one-year interval,
repeated twice. This means that the query searches for results on Jan 1-2 in
2018 and in 2019:

| ts                          | score |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-02T23:59:59.999999Z | 110.3 |
| 2019-01-01T00:00:00.000000Z | 128.7 |
| ...                         | ...   |
| 2019-01-02T23:59:59.999999Z | 103.8 |

A more complete query breakdown would appear as such:

```questdb-sql
-- IN extension for time-intervals

SELECT * FROM trades WHERE timestamp in '2023'; -- whole year
SELECT * FROM trades WHERE timestamp in '2023-12'; -- whole month
SELECT * FROM trades WHERE timestamp in '2023-12-20'; -- whole day

-- The whole day, extending 15s into the next day
SELECT * FROM trades WHERE timestamp in '2023-12-20;15s';

-- For the past 7 days, 2 seconds before and after midnight
SELECT * from trades WHERE timestamp in '2023-09-20T23:59:58;4s;-1d;7'
```

### IN with multiple arguments

#### Syntax

`IN` with more than 1 argument is treated as standard SQL `IN`. It is a
shorthand of multiple `OR` conditions, i.e. the following query:

```questdb-sql title="IN list"
SELECT * FROM scores
WHERE ts IN ('2018-01-01', '2018-01-01T12:00', '2018-01-02');
```

is equivalent to:

```questdb-sql title="IN list equivalent OR"
SELECT * FROM scores
WHERE ts = '2018-01-01' or ts = '2018-01-01T12:00' or ts = '2018-01-02';
```

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:00.000000Z | 123.4 |
| 2018-01-01T12:00:00.000000Z | 589.1 |
| 2018-01-02T00:00:00.000000Z | 131.5 |

### BETWEEN

#### Syntax

For non-standard ranges, users can explicitly specify the target range using the
`BETWEEN` operator. As with standard SQL, both upper and lower bounds of
`BETWEEN` are inclusive, and the order of lower and upper bounds is not
important so that `BETWEEN X AND Y` is equivalent to `BETWEEN Y AND X`.

```questdb-sql title="Explicit range"
SELECT * FROM scores
WHERE ts BETWEEN '2018-01-01T00:00:23.000000Z' AND '2018-01-01T00:00:23.500000Z';
```

| ts                          | value |
| --------------------------- | ----- |
| 2018-01-01T00:00:23.000000Z | 123.4 |
| ...                         | ...   |
| 2018-01-01T00:00:23.500000Z | 131.5 |

`BETWEEN` can accept non-constant bounds, for example, the following query will
return all records older than one year before the current date:

```questdb-sql title="One year before current date"
SELECT * FROM scores
WHERE ts BETWEEN to_str(now(), 'yyyy-MM-dd')
AND dateadd('y', -1, to_str(now(), 'yyyy-MM-dd'));
```

##### Inclusivity example

Inclusivity is precise, and may be more granular than the provided dates appear.

If a timestamp in the format YYYY-MM-DD is passed forward, it is computed as YYYY-MM-DDThh:mm:ss.sss.

To demonstrate, note the behaviour of the following example queries:

```questdb-sql title="Demonstrating inclusivity"
SELECT *
FROM trades
WHERE timestamp BETWEEN '2024-04-01' AND '2024-04-03'
LIMIT -1;
```

| symbol  | side | price     | amount     | timestamp                   |
| ------- | ---- | --------- | ---------- | --------------------------- |
| BTC-USD | sell | 65,464.14 | 0.05100764 | 2024-04-02T23:59:59.9947212 |

The query pushes to the boundaries as far as is possible, all the way to: `2024-04-02T23:59:59.9947212`.

If there was an event at precisely `2024-04-03T00:00:00.00000`, it would also be included.

Now let us look at:

```title="Demonstrating inclusivity"
SELECT *
FROM trades
WHERE timestamp BETWEEN '2024-04-01' AND '2024-04-03T00:00:00.99'
LIMIT -1;
```

| symbol  | side | price    | amount     | timestamp                   |
| ------- | ---- | -------- | ---------- | --------------------------- |
| ETH-USD | sell | 3,279.11 | 0.00881686 | 2024-04-03T00:00:00.988858Z |

Even with fractional seconds, the boundary is inclusive.

A row with timestamp 2024-04-03T00:00:00.990000Z would also return in boundary.
