---
title: Query Last N Minutes of Activity
sidebar_label: Latest activity window
description: Get rows from the last N minutes of recorded activity using subqueries with LIMIT -1
---

Query data from the last N minutes of recorded activity in a table, regardless of the current time.

## Problem

You want to get data from a table for the last 15 minutes of activity.

You know you could do:

```sql
SELECT * FROM my_tb
WHERE timestamp > dateadd('m', -15, now());
```

But that would give you the last 15 minutes, not the last 15 minutes of activity in your table. Assuming the last timestamp recorded in your table was `2025-03-23T07:24:37.000000Z`, then you would like to get the data from `2025-03-23T07:09:37.000000Z` to `2025-03-23T07:24:37.000000Z`.

## Solution

Use a correlated subquery to find the latest timestamp, then filter relative to it:

```questdb-sql title="Last 15 minutes of recorded activity"
SELECT *
FROM my_table
WHERE timestamp >= (
  SELECT dateadd('m', -15, timestamp)
  FROM my_table
  LIMIT -1
);
```

QuestDB supports correlated subqueries when asking for a timestamp if the query returns a scalar value. Using `LIMIT -1` we get the latest row in the table (sorted by designated timestamp), and we apply the `dateadd` function on that date, so it needs to be executed just once. If we placed the `dateadd` on the left, the calculation would need to be applied once for each row on the main table. This query should return in just a few milliseconds, independently of table size.

:::info Related Documentation
- [LIMIT](/docs/query/sql/select/#limit)
- [dateadd()](/docs/query/functions/date-time/#dateadd)
- [Designated timestamp](/docs/concepts/designated-timestamp/)
:::
