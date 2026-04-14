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

```questdb-sql
SELECT ... FROM tableName
WHERE booleanExpression;
```

### Logical operators

QuestDB supports `AND`, `OR`, `NOT` as logical operators and can assemble
conditions using brackets `()`.

```questdb-sql
WHERE [NOT] condition [{ AND | OR } [NOT] condition ...]
```

Conditions may be grouped using parentheses.

```questdb-sql title="Example" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND side = 'buy'
  AND (symbol = 'BTC-USDT' OR price > 100000)
LIMIT -3;
```

## Symbol, varchar, and string

QuestDB can filter symbols, varchars, and strings based on equality,
inequality, and regular expression patterns.

### Exact match

Evaluates match of a symbol, varchar, or string.

```questdb-sql
WHERE columnName = 'string';
```

```questdb-sql title="Example" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol = 'BTC-USDT'
LIMIT -3;
```

### Does NOT match

Evaluates mismatch of a symbol, varchar, or string.

```questdb-sql
WHERE columnName { != | <> } 'string';
```

```questdb-sql title="Example" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol != 'BTC-USDT'
LIMIT -3;
```

### Regular expression match

Evaluates match against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

```questdb-sql
WHERE columnName ~ 'regex';
```

```questdb-sql title="Regex example" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol ~ '^BTC'
LIMIT -3;
```

### Regular expression does NOT match

Evaluates mismatch against a regular expression defined using
[java.util.regex](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/regex/Pattern.html)
patterns.

```questdb-sql
WHERE columnName !~ 'regex';
```

```questdb-sql title="Example" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol !~ '^BTC'
LIMIT -3;
```

### List search

Evaluates match or mismatch against a list of elements.

```questdb-sql
WHERE [NOT] columnName IN ('value' [, 'value' ...]);
```

```questdb-sql title="List match" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol IN ('BTC-USDT', 'ETH-USDT')
LIMIT -20;
```

```questdb-sql title="List mismatch" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now'
  AND symbol NOT IN ('BTC-USDT', 'ETH-USDT')
LIMIT -20;
```

## Numeric

QuestDB can filter numeric values based on equality, inequality, comparison, and
proximity.

:::note

For timestamp filters, we recommend the
[timestamp search notation](#timestamp-and-date) which is faster and less
verbose.

:::

### Equality, inequality and comparison

```questdb-sql
WHERE columnName { = | != | <> | > | >= | < | <= } value;
```

```questdb-sql title="Greater than or equal" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now' AND amount >= 1.0
LIMIT -3;
```

```questdb-sql title="Equal" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now' AND amount = 1.0
LIMIT -3;
```

```questdb-sql title="Not equal" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1h..$now' AND amount != 1.0
LIMIT -3;
```

## Boolean

```questdb-sql
WHERE [NOT] columnName;
```

Using the columnName will return `true` values. To return `false` values,
precede the column name with the `NOT` operator.

The examples below assume a small `instruments` table:

| symbol  | is_tradable |
| ------- | ----------- |
| BTC-USD | true        |
| ETH-USD | true        |
| XYZ-USD | false       |

```questdb-sql title="Example - true"
SELECT * FROM instruments WHERE is_tradable;
```

| symbol  | is_tradable |
| ------- | ----------- |
| BTC-USD | true        |
| ETH-USD | true        |

```questdb-sql title="Example - false"
SELECT * FROM instruments WHERE NOT is_tradable;
```

| symbol  | is_tradable |
| ------- | ----------- |
| XYZ-USD | false       |

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
| 2026-01-12T12:35:26.123456+01:30 | 2026-01-12T11:05:26.123456Z |
| 2026-01-12T12:35:26.123456+01    | 2026-01-12T11:35:26.123456Z |
| 2026-01-12T12:35:26.123456Z      | 2026-01-12T12:35:26.123456Z |
| 2026-01-12T12:35:26.12345        | 2026-01-12T12:35:26.123450Z |
| 2026-01-12T12:35:26.1234         | 2026-01-12T12:35:26.123400Z |
| 2026-01-12T12:35:26.123          | 2026-01-12T12:35:26.123000Z |
| 2026-01-12T12:35:26.12           | 2026-01-12T12:35:26.120000Z |
| 2026-01-12T12:35:26.1            | 2026-01-12T12:35:26.100000Z |
| 2026-01-12T12:35:26              | 2026-01-12T12:35:26.000000Z |
| 2026-01-12T12:35                 | 2026-01-12T12:35:00.000000Z |
| 2026-01-12T12                    | 2026-01-12T12:00:00.000000Z |
| 2026-01-12                       | 2026-01-12T00:00:00.000000Z |
| 2026-01                          | 2026-01-01T00:00:00.000000Z |
| 2026                             | 2026-01-01T00:00:00.000000Z |
| 2026-01-12 12:35:26.123456-02:00 | 2026-01-12T14:35:26.123456Z |
| 2026-01-12 12:35:26.123456Z      | 2026-01-12T12:35:26.123456Z |
| 2026-01-12 12:35:26.123          | 2026-01-12T12:35:26.123000Z |
| 2026-01-12 12:35:26.12           | 2026-01-12T12:35:26.120000Z |
| 2026-01-12 12:35:26.1            | 2026-01-12T12:35:26.100000Z |
| 2026-01-12 12:35:26              | 2026-01-12T12:35:26.000000Z |
| 2026-01-12 12:35                 | 2026-01-12T12:35:00.000000Z |

### Exact timestamp

#### Syntax

```questdb-sql
WHERE timestampColumn = 'timestamp';
```

```questdb-sql title="Timestamp equals date" demo
SELECT * FROM trades WHERE timestamp = '2026-04-02T12:00:00.190Z';
```

```questdb-sql title="Timestamp equals timestamp" demo
SELECT * FROM trades WHERE timestamp = '2026-04-02T12:00:00.190000Z';
```

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
WHERE ts IN '[2025-01]#XNYS'
```

:::

#### Syntax

```questdb-sql
WHERE timestampColumn IN 'partialTimestamp';
```

`partialTimestamp` is any prefix of an ISO 8601 timestamp (`yyyy`,
`yyyy-MM`, `yyyy-MM-dd`, `yyyy-MM-ddThh`, `yyyy-MM-ddThh:mm`,
`yyyy-MM-ddThh:mm:ss`).

```questdb-sql title="Trades in a given year" demo
SELECT * FROM trades WHERE timestamp IN '2026' LIMIT -3;
```

```questdb-sql title="Trades in a given minute" demo
SELECT * FROM trades WHERE timestamp IN '2026-04-02T12:15' LIMIT -3;
```

### Time range with interval modifier

You can apply a modifier to further customize the range. The modifier extends
the upper bound of the original timestamp based on the modifier parameter. An
optional interval with occurrence can be set, to apply the search in the given
time range repeatedly, for a set number of times.

#### Syntax

```questdb-sql
WHERE timestampColumn IN 'timestamp;modifier[;interval;repetition]';
```

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

```questdb-sql title="Trades in a given year and the first month of the next year" demo
SELECT * FROM trades WHERE timestamp IN '2026;1M' LIMIT -3;
```

The range is 2026. The modifier extends the upper bound (originally 31 Dec 2026)
by one month.

```questdb-sql title="Trades in a given month excluding the last 3 days" demo
SELECT * FROM trades WHERE timestamp IN '2026-04;-3d' LIMIT -3;
```

The range is April 2026. The modifier reduces the upper bound (originally 30
April 2026) by 3 days.

Modifying the interval:

```questdb-sql title="Trades on a given date with an interval" demo
SELECT * FROM trades
WHERE timestamp IN '2025-01-01;1d;1y;2' AND symbol = 'SOL-ETH';
```

The range is extended by one day from Jan 1 2025, with a one-year interval,
repeated twice. This means that the query searches for trades on Jan 1-2 in
2025 and in 2026.

A more complete query breakdown would appear as such:

```questdb-sql
-- IN extension for time-intervals

SELECT * FROM trades WHERE timestamp in '2026'; -- whole year
SELECT * FROM trades WHERE timestamp in '2025-12'; -- whole month
SELECT * FROM trades WHERE timestamp in '2025-12-20'; -- whole day

-- The whole day, extending 15s into the next day
SELECT * FROM trades WHERE timestamp in '2025-12-20;15s';

-- For the past 7 days, 2 seconds before and after midnight
SELECT * from trades WHERE timestamp in '2025-09-20T23:59:58;4s;-1d;7'
```

### IN with multiple arguments

#### Syntax

`IN` with more than 1 argument is treated as standard SQL `IN`. It is a
shorthand of multiple `OR` conditions, i.e. the following query:

```questdb-sql title="IN list" demo
SELECT * FROM trades
WHERE timestamp IN ('2026-04-01', '2026-04-01T12:00:00.017999Z', '2026-04-02');
```

is equivalent to:

```questdb-sql title="IN list equivalent OR" demo
SELECT * FROM trades
WHERE timestamp = '2026-04-01'
   OR timestamp = '2026-04-01T12:00:00.017999Z'
   OR timestamp = '2026-04-02';
```

### BETWEEN

#### Syntax

For non-standard ranges, users can explicitly specify the target range using the
`BETWEEN` operator. As with standard SQL, both upper and lower bounds of
`BETWEEN` are inclusive, and the order of lower and upper bounds is not
important so that `BETWEEN X AND Y` is equivalent to `BETWEEN Y AND X`.

```questdb-sql title="Explicit range" demo
SELECT * FROM trades
WHERE timestamp BETWEEN '2026-04-01T00:00:23.000000Z'
                    AND '2026-04-01T00:00:23.500000Z';
```

`BETWEEN` can accept non-constant bounds, for example, the following query will
return all records older than one year before the current date:

```questdb-sql title="One year before current date" demo
SELECT * FROM trades
WHERE timestamp BETWEEN to_str(now(), 'yyyy-MM-dd')
AND dateadd('y', -1, to_str(now(), 'yyyy-MM-dd'));
```

Alternatively, [TICK interval syntax](/docs/query/operators/tick/) expresses
the same intent more compactly:

```questdb-sql title="Last year using TICK syntax" demo
SELECT * FROM trades
WHERE timestamp IN '$now-1y..$now';
```

##### Inclusivity example

Inclusivity is precise, and may be more granular than the provided dates appear.

If a timestamp in the format YYYY-MM-DD is passed forward, it is computed as YYYY-MM-DDThh:mm:ss.sss.

To demonstrate, note the behaviour of the following example queries:

```questdb-sql title="Demonstrating inclusivity" demo
SELECT *
FROM trades
WHERE timestamp BETWEEN '2026-04-01' AND '2026-04-03'
LIMIT -1;
```

| symbol   | side | price   | amount | timestamp                   |
| -------- | ---- | ------- | ------ | --------------------------- |
| XLM-USDT | buy  | 0.16304 | 15.0   | 2026-04-02T23:59:59.982000Z |

The query pushes to the boundaries as far as is possible, all the way to: `2026-04-02T23:59:59.982000Z`.

If there was an event at precisely `2026-04-03T00:00:00.00000`, it would also be included.

Now let us look at:

```questdb-sql title="Demonstrating inclusivity" demo
SELECT *
FROM trades
WHERE timestamp BETWEEN '2026-04-01' AND '2026-04-03T00:00:00.99'
LIMIT -1;
```

| symbol   | side | price   | amount     | timestamp                   |
| -------- | ---- | ------- | ---------- | --------------------------- |
| BTC-USDT | buy  | 66912.9 | 0.00054697 | 2026-04-03T00:00:00.936000Z |

Even with fractional seconds, the boundary is inclusive.

A row with timestamp 2026-04-03T00:00:00.990000Z would also return in boundary.
