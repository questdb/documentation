---
title: Interval Scan
sidebar_label: Interval scan
description:
  Explains how interval scans work in QuestDB, and provides examples on how to
  check when a query is using them.
---

import Screenshot from "@theme/Screenshot"

When a query includes a condition on the
[designated timestamp](/docs/concept/designated-timestamp), QuestDB performs an
**Interval Scan**.

For a breakdown of interval syntax in time-based queries, see the
[`WHERE` clause reference](/docs/reference/sql/where/).

## How Interval Scan works

This process involves:

1. **Analyzing the condition**: QuestDB examines the query to identify the
   conditions applied to the designated timestamp.
2. **Extracting a list of timestamp intervals**: Based on the condition, QuestDB
   determines the specific intervals of time that need to be scanned.
3. **Performing a binary search for each interval's scan boundaries in the
   designated timestamp column**: For each identified interval, QuestDB uses a
   binary search to quickly find the start and end points of the interval in the
   timestamp column. A binary search is a fast search algorithm that finds the
   position of a target value within a sorted array, which in this case is a
   sorted timestamp column.
4. **Scanning table data only within the found boundaries:** QuestDB then scans
   only the rows of the table that fall within these boundaries, significantly
   reducing the amount of data that needs to be processed.

The **Interval Scan** is possible because tables with a designated timestamp
store data in timestamp order. This allows QuestDB to efficiently skip over data
that falls outside the relevant intervals. However, it's important to note that
**Interval Scan** does not apply to the results of sub-queries, as the data
returned from a sub-query is not guaranteed to be in timestamp order.

<Screenshot
  alt="Interval scan."
  height={433}
  src="images/blog/2023-04-25/interval_scan.svg"
  width={650}
/>

## EXPLAIN Interval Scan

You can determine whether an **Interval Scan** is used to execute a query using
the [EXPLAIN](/docs/reference/sql/explain/) command.

For example, consider the `trades` table with a `timestamp` designated
timestamp. The following query:

```questdb-sql
EXPLAIN
SELECT * FROM trades
WHERE timestamp IN '2023-01-20';
```

Produces this query plan:

| QUERY PLAN                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- |
| DataFrame                                                                                                      |
| &nbsp;&nbsp;&nbsp;&nbsp;Row forward scan                                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;Interval forward scan on: trades                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;intervals: [("2023-01-20T00:00:00.000000Z","2023-01-20T23:59:59.999999Z")] |

The query optimizer reduces scanning to a single interval related to the
`2023-01-20` day.

## Examples

The following three queries all produce the same **Interval Scan** plan because
they all specify the same time range for the `timestamp` column, just in
different ways:

```questdb-sql
EXPLAIN
SELECT * FROM trades
WHERE timestamp IN '2023-01-20';

EXPLAIN
SELECT * FROM trades
WHERE timestamp between '2023-01-20T00:00:00.000000Z' and '2023-01-20T23:59:59.999999Z';

EXPLAIN
SELECT * FROM trades
WHERE timestamp >= '2023-01-20T00:00:00.000000Z' and timestamp <= '2023-01-20T23:59:59.999999Z';
```

The **Interval Scan** plan looks like this:

| QUERY PLAN                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- |
| DataFrame                                                                                                      |
| &nbsp;&nbsp;&nbsp;&nbsp;Row forward scan                                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;Interval forward scan on: trades                                                       |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;intervals: [("2023-01-20T00:00:00.000000Z","2023-01-20T23:59:59.999999Z")] |

If need to scan more than one interval, you can use the
[timestamp IN operator](/docs/reference/operators/date-time):

```questdb-sql
EXPLAIN
SELECT * FROM trades
WHERE timestamp IN '2023-01-01;1d;1y;2';
```

This query results in an **Interval Scan** plan that includes two intervals:

| QUERY PLAN                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DataFrame                                                                                                                                                             |
| &nbsp;&nbsp;&nbsp;&nbsp;Row forward scan                                                                                                                              |
| &nbsp;&nbsp;&nbsp;&nbsp;Interval forward scan on: trades                                                                                                              |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;intervals: [(2023-01-01T00:00:00.000000Z,2023-01-02T23:59:59.999999Z), (2024-01-01T00:00:00.000000Z,2024-01-02T23:59:59.999999Z)] |

The table scan is limited to these two intervals:

- `<2023-01-01T00:00:00.000000Z,2023-01-02T23:59:59.999999Z>`
- `<2024-01-01T00:00:00.000000Z,2024-01-02T23:59:59.999999Z>`

If a table doesn't have a designated timestamp, you can declare one using the
`timestamp(columnName)` function.

For example, the following query results in a full scan with an **Async
Filter**, which is a process that scans the entire table without taking
advantage of the designated timestamp:

```questdb-sql
EXPLAIN
SELECT * FROM trades_nodts
WHERE timestamp IN '2023-01-20'
```

However, if you declare a designated timestamp:

```questdb-sql
EXPLAIN
SELECT * FROM trades_nodts timestamp(timestamp)
WHERE timestamp IN '2023-01-20'
```

It results in an **Interval Forward Scan**.

Note that declaring a designated timestamp only works if the data is truly
ordered. For example, if data are sorted in ascending order by the timestamp.
Otherwise the result is undefined, meaning that the query may not return the
expected results.
