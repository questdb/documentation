---
title: Query with Epoch Timestamps
sidebar_label: Epoch timestamps
description: Use epoch timestamps for timestamp filtering in QuestDB
---

Query using epoch timestamps instead of timestamp literals.

## Problem

You want to query data using epoch values rather than timestamp literals.

## Solution

Use epoch values directly in your WHERE clause. QuestDB expects microseconds by default for `timestamp` columns:

```questdb-sql demo title="Query with epoch in microseconds"
SELECT *
FROM trades
WHERE timestamp BETWEEN 1746552420000000 AND 1746811620000000;
```

:::info  Millisecond Resolution
If you have epoch values in milliseconds, you need to multiply by 1000 to convert to microseconds.
:::

Nanoseconds can be used when the timestamp column is of type `timestamp_ns`.

```questdb-sql demo title="Query with epoch in nanoseconds"
SELECT *
FROM fx_trades
WHERE timestamp BETWEEN 1768303754000000000 AND 1778303754000000000;
```

:::note If the query does not return any data
Since the `fx_trades` table has a TTL, the query above may return empty results. To find valid epoch values with data, run:

`select timestamp::long as from_epoch, dateadd('s', -10, timestamp)::long as to_epoch from fx_trades limit -1;`

Then replace the `BETWEEN` values with the epochs returned.
:::


:::info Related Documentation
- [Timestamp types](/docs/query/datatypes/overview/#timestamp-and-date-considerations)
- [WHERE clause](/docs/query/sql/where/)
:::
