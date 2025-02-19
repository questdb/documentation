---
title: Materialized Views
sidebar_label: Materialized Views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your aggregation queries.
---

A materialized view is a table-like object that holds the result set of a query,
persisted to disk. Materialized views store final or intermediate aggregate
function values, which speeds up aggregate queries.

Let's consider the following example table:

```questdb-sql title="Base table"
CREATE TABLE trades (
  timestamp TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  amount DOUBLE
) TIMESTAMP(timestamp)
PARTITION BY DAY;
```

Now, we can create a materialized view holding hourly average prices:

```questdb-sql title="Materialized view"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK;
```

When run, the above statement creates an incrementally refreshed materialized
view with `trades` as its base table. This means that each time new rows
are inserted to the `trades` table, the `trades_hourly_prices` view is
asynchronously refreshed to hold the result of its query. 

The refresh is incremental which means that the database refreshes only
relevant time slices of the materialized view instead of running the query as is.
For example, if the `trades` table gets new rows that belong to `2025-02-18`, the
query will only run and produce refreshed materialized view data for that day.

Refer to the `CREATE MATERIALIZED VIEW`
[page](/docs/reference/sql/create-mat-view/) to learn more about this SQL
statement.

Now, let's insert a few rows in our base table:

```questdb-sql title="Inserting rows into the base table"
INSERT INTO trades (symbol, price, amount, timestamp) VALUES
  ('gbpusd', 1.320, 10, '2024-09-10T12:01'),
  ('gbpusd', 1.323, 20, '2024-09-10T12:02'),
  ('jpyusd', 103.21, 11, '2024-09-10T12:01'),
  ('jpyusd', 104.21, 27, '2024-09-10T12:02');
```

After running this `INSERT` statement, the `trades_hourly_prices` view should be
refreshed so that it holds the following rows:

| timestamp                   | symbol | avg_price |
| --------------------------- | ------ | --------- |
| 2024-09-10T12:00:00.000000Z | gbpusd | 1.3215    |
| 2024-09-10T12:00:00.000000Z | jpyusd | 103.71    |

If we run the `SAMPLE BY` query used to create the materialized view, we'll get
the same result.

The list of all materialized views is available via the `mat_views()` meta
function:

```questdb-sql title="Listing all materialized views" demo
SELECT
  name,
  last_refresh_timestamp,
  view_status,
  base_table_txn,
  applied_base_table_txn
FROM mat_views();
```

The above query returns our materialized view:

| name                 | last_refresh_timestamp      | view_status | base_table_txn | applied_base_table_txn |
| -------------------- | --------------------------- | ----------- | -------------- | ---------------------- |
| trades_hourly_prices | 2025-02-18T15:32:22.373513Z | valid       | 42             | 42                     |

Notice that the view has the value `valid` for the `view_status` column, which
means both that it is valid and that it gets updated by the incremental refresh
process. Later, we will learn more on invalid materialized views and how to make
them valid once again.

The `last_refresh_timestamp` column contains the last time that the materialized
view was incrementally refreshed. The `base_table_txn` column shows the current
transaction number available for readers of the base table while the
`applied_base_table_txn` column shows the transaction up to which the view is
refreshed. When these numbers match, it means that the materialized view is
fully up-to-date.

:::note

For now, incremental refresh is the only supported strategy for materialized
views. In the future, we plan to support more strategies, like interval and
manual refreshes.

:::

Incremental refresh imposes a number of requirements for the base table and the
query.

## Limitations

Materialized views have a number of limitations. 

Some of them are essential, while others will be removed in a future release.

1. The query used in a materialized view has to be a `SAMPLE BY` or a `GROUP BY`
   query involving the
   [designated timestamp](/docs/concept/designated-timestamp/) column as the
   grouping key. This limitation comes from the incremental refresh strategy
   which needs to determine time slices when updating the view.
2. The `SAMPLE BY` query used in the materialized view **cannot** use `FROM-TO` and
   `FILL` clauses.
3. Certain operations on the base table lead to invalidation of the dependent
   materialized views. These are operations that involve existing schema
   changes, such as `RENAME TABLE` or `ALTER TABLE DROP COLUMN`, or data
   deletion, such as `TRUNCATE` or `ALTER TABLE DROP PARTITION`, or data
   modification, such as `UPDATE`.
4. In cases when the base table has deduplication enabled, the materialized view
   query has to use same grouping keys as the `UPSERT KEYS` in the base table.
5. Replication limitations (QuestDB Enterprise only):
   - The data in materialized views is replicated the same way as data for
     plain tables. However, there are important limitations when it comes to the
     replication of their refresh state. The refresh state, such as the refresh
     status or invalidation due to refresh failures, is not replicated. As a
     result, the `mat_views()` function will accurately reflect the list of
     materialized views, but it will not display their actual refresh state.
   - When a replica is promoted to primary, all replicated materialized views
     will be triggered for a full refresh upon restart.

## Base table

Incrementally refreshed views require that the base table is set, either
implicitly or explicitly. When the query involves only a single table, like in
our example `trades_hourly_prices` view, the query engine determines the base
table, so there is no need to specify it explicitly. But if the query involves
multiple tables, one of the tables has to be specified as the base table.

```questdb-sql title="Hourly materialized view with LT JOIN"
CREATE MATERIALIZED VIEW trades_ext_hourly_prices
WITH BASE trades
AS (
  SELECT
    t.timestamp,
    t.symbol,
    avg(t.price) AS avg_price,
    avg(e.price) AS avg_ext_price
  FROM trades t
  LT JOIN ext_trades e ON (symbol)
  SAMPLE BY 1d
) PARTITION BY WEEK;
```

A materialized view can also be used as the base table, so it's possible to
create materialized views that depend on other materialized view.

## Invalid materialized views

A materialized view may be marked as invalid when certain operations run on the
base table, like `TRUNCATE` or `ALTER TABLE DROP PARTITION`. In that case, the
view no longer gets refreshed and is marked as invalid in the output of the
`mat_views()` SQL function.

```questdb-sql title="Listing all materialized views"
SELECT name, baseTableName, invalid, invalidationReason
FROM mat_views();
```

The above query returns our materialized view:

| name                 | baseTableName | invalid | invalidationReason |
| -------------------- | ------------- | ------- | ------------------ |
| trades_hourly_prices | trades        | true    | truncate operation |

In order to reenable incremental refresh, the materialized view needs to be
fully refreshed:

```questdb-sql title="Refreshing a materialized view"
REFRESH MATERIALIZED VIEW trades_hourly_prices FULL;
```

This command deletes the data stored in the materialized view, then executes the
query and stores its results in the view. Finally, it marks the view as valid,
so that it gets incrementally refreshed once again.

:::note

For large base tables, a full refresh may take a significant amount of time. While
the refresh is running, it's possible to cancel the operation using the
[`CANCEL QUERY`](/docs/reference/sql/cancel-query/) SQL.

:::

## Time To Live (TTL) interaction

Materialized views ignore data deletions in their base table when caused by the
[time-to-live](/docs/concept/ttl/) feature. This means that when older
partitions are dropped due to TTL, the corresponding aggregated rows stay in the
materialized view.

In situations when the unbounded growth of a materialized view is unwanted, it is
possible to configure TTL on the view itself:

```questdb-sql title="Creating a materialized view with TTL"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK TTL 8 WEEKS;
```

Notice the `TTL 8 WEEKS` part in the above `CREATE MATERIALIZED VIEW` statement.
It sets time-to-live on the materialized view (not on its base table) to 8
weeks.
