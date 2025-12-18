---
title: Force a Designated Timestamp
sidebar_label: Force designated timestamp
description: Learn how to explicitly set a designated timestamp column in QuestDB queries using the TIMESTAMP keyword
---

Sometimes you need to force a designated timestamp in your query. This happens when you want to run operations like `SAMPLE BY` with a non-designated timestamp column, or when QuestDB applies certain functions or joins and loses track of the designated timestamp.

## Problem: Lost Designated Timestamp

When you run this query on the demo instance, you'll notice the `time` column is not recognized as a designated timestamp because we cast it to a string and back:

```questdb-sql demo title="Query without designated timestamp"
SELECT
  TO_TIMESTAMP(timestamp::STRING, 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ') time,
  symbol,
  ecn,
  bid_price
FROM
  core_price
WHERE timestamp IN today()
LIMIT 10;
```

Without a designated timestamp, you cannot use time-series operations like `SAMPLE BY`.

## Solution: Use the TIMESTAMP Keyword

You can force the designated timestamp using the `TIMESTAMP()` keyword, which allows you to run time-series operations:

```questdb-sql demo title="Force designated timestamp with TIMESTAMP keyword"
WITH t AS (
  (
    SELECT
      TO_TIMESTAMP(timestamp::STRING, 'yyyy-MM-ddTHH:mm:ss.SSSUUUZ') time,
      symbol,
      ecn,
      bid_price
    FROM
      core_price
    WHERE timestamp >= dateadd('h', -1, now())
    ORDER BY time
  ) TIMESTAMP (time)
)
SELECT * FROM t LATEST BY symbol;
```

The `TIMESTAMP(time)` clause explicitly tells QuestDB which column to use as the designated timestamp, enabling `LATEST BY` and other time-series operations. This query gets the most recent price for each symbol in the last hour.

## Common Case: UNION Queries

The designated timestamp is often lost when using `UNION` or `UNION ALL`. This is intentional - QuestDB cannot guarantee that the combined results are in order, and designated timestamps must always be in ascending order.

You can restore the designated timestamp by applying `ORDER BY` and then using `TIMESTAMP()`:

```questdb-sql demo title="Restore designated timestamp after UNION ALL"
(
  SELECT * FROM
  (
    SELECT timestamp, symbol FROM core_price WHERE timestamp >= dateadd('m', -1, now())
    UNION ALL
    SELECT timestamp, symbol FROM core_price WHERE timestamp >= dateadd('m', -1, now())
  ) ORDER BY timestamp
)
TIMESTAMP(timestamp)
LIMIT 10;
```

This query combines the last minute of data twice using `UNION ALL`, then restores the designated timestamp.

:::warning Order is Required
The `TIMESTAMP()` keyword requires that the data is already sorted by the timestamp column. If the data is not in order, the query will fail. Always include `ORDER BY` before applying `TIMESTAMP()`.
:::

:::info Related Documentation
- [Designated Timestamp concept](/docs/concept/designated-timestamp/)
- [TIMESTAMP keyword reference](/docs/reference/sql/select/#timestamp)
- [SAMPLE BY aggregation](/docs/reference/sql/sample-by/)
:::
