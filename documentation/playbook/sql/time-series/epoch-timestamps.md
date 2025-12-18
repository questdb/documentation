---
title: Query with Epoch Timestamps
sidebar_label: Epoch timestamps
description: Use epoch timestamps for timestamp filtering in QuestDB
---

Query using epoch timestamps instead of timestamp literals.

## Problem

You want to query data using an epoch time interval rather than using timestamp literals or timestamp_ns data types.

## Solution

Use epoch values directly in your WHERE clause. QuestDB expects microseconds by default for `timestamp` columns:

```questdb-sql demo title="Query with epoch microseconds"
SELECT *
FROM trades
WHERE timestamp BETWEEN 1746552420000000 AND 1746811620000000;
```

**Note:** If you have epoch values in milliseconds, you need to multiply by 1000 to convert to microseconds.

Nanoseconds can be used when the timestamp column is of type `timestamp_ns`.

:::info Related Documentation
- [Timestamp types](/docs/reference/sql/datatypes/#timestamp-and-date-considerations)
- [WHERE clause](/docs/reference/sql/where/)
:::
