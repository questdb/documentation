---
title: Timestamp function
sidebar_label: Timestamp
description: Timestamp function reference documentation.
---

`timestamp(columnName)` elects a
[designated timestamp](/docs/concept/designated-timestamp/):

- during a [CREATE TABLE](/docs/reference/sql/create-table/#designated-timestamp) operation
- during a [SELECT](/docs/reference/sql/select#timestamp) operation
  (`dynamic timestamp`)
- when ingesting data via InfluxDB Line Protocol, for tables that do not already
  exist in QuestDB, partitions are applied automatically by day by default with
  a `timestamp` column

:::note

- Checking if tables contain a designated timestamp column can be done via the
  `tables()` and `table_columns()` functions which are described in the
  [meta functions](/docs/reference/function/meta/) documentation page.

- There are two timestamp resolutions available in QuestDB: microseconds and nanoseconds. See
  [Timestamps in QuestDB](/docs/guides/working-with-timestamps-timezones/#timestamps-in-questdb)
  for more details.
:::

## Syntax

### During a CREATE operation

Create a [designated timestamp](/docs/concept/designated-timestamp/) column
during table creation. For more information, refer to the
[CREATE TABLE](/docs/reference/sql/create-table/) section.

![Flow chart showing the syntax of the TIMESTAMP keyword](/images/docs/diagrams/timestamp.svg)

### During a SELECT operation

Creates a [designated timestamp](/docs/concept/designated-timestamp/) column in
the result of a query. Assigning a timestamp in a `SELECT` statement
(`dynamic timestamp`) allows for time series operations such as `LATEST BY`,
`SAMPLE BY` or `LATEST BY` on tables which do not have a `designated timestamp`
assigned.

![Flow chart showing the syntax of the timestamp function](/images/docs/diagrams/dynamicTimestamp.svg)

## Optimization with WHERE clauses

When filtering on a designated timestamp column in WHERE clauses, QuestDB automatically optimizes the query by applying time-based partition filtering. This optimization also works with subqueries that return timestamp values.

For example:

```questdb-sql title="Timestamp optimization with WHERE clause" demo
SELECT *
FROM trades
WHERE ts > (SELECT min(ts) FROM trades)
  AND ts < (SELECT max(ts) FROM trades);
```

In this case, if `ts` is the designated timestamp column, QuestDB will optimize the query by:

1. Evaluating the subqueries to determine the time range
2. Using this range to filter partitions before scanning the data
3. Applying the final timestamp comparison on the remaining records

This optimization applies to timestamp comparisons using:

- Greater than (`>`)
- Less than (`<`)
- Equals (`=`)
- Greater than or equal to (`>=`)
- Less than or equal to (`<=`)

## Examples

### During a CREATE operation

The following creates a table with
[designated timestamp](/docs/concept/designated-timestamp/).

```questdb-sql title="Create table"
CREATE TABLE
temperatures(ts timestamp, sensorID symbol, sensorLocation symbol, reading double)
timestamp(ts);
```

### During a SELECT operation

The following will query a table and assign a
[designated timestamp](/docs/concept/designated-timestamp/) to the output. Note
the use of brackets to ensure the timestamp clause is applied to the result of
the query instead of the whole `readings` table.

```questdb-sql title="Dynamic timestamp"
(SELECT cast(dateTime AS TIMESTAMP) ts, device, value FROM readings) timestamp(ts);
```

Although the `readings` table does not have a designated timestamp, we are able
to create one on the fly. Now, we can use this into a subquery to perform
timestamp operations.

```questdb-sql title="Dynamic timestamp subquery"
SELECT ts, avg(value) FROM
(SELECT cast(dateTime AS TIMESTAMP) ts, value FROM readings) timestamp(ts)
SAMPLE BY 1d;
```

If the data is unordered, it is important to order it first.

```questdb-sql title="Dynamic timestamp - unordered data"
SELECT ts, avg(value) FROM
(SELECT ts, value FROM unordered_readings ORDER BY ts) timestamp(ts)
SAMPLE BY 1d;
```
