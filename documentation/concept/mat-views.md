---
title: Materialized views
sidebar_label: Materialized views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your aggregation queries.
---

A materialized view is a database object that stores the pre-computed results of
a query. Unlike regular views, which compute their results at query time,
materialized views persist their data to disk, making them particularly
efficient for expensive aggregate queries that are run frequently.

:::info

Materialized View support is in **beta**.

It may not be fit for production use.

Please let us know if you run into issues.

Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

:::


## Related documentation

- **Step-by-step tutorial**

  - [How to create a materialized view](/blog/how-to-create-a-materialized-view/):
    A full walkthrough of simple and advanced materialized views

- **SQL Commands**

  - [`CREATE MATERIALIZED VIEW`](/docs/reference/sql/create-mat-view/): Create a
    new materialized view
  - [`DROP MATERIALIZED VIEW`](/docs/reference/sql/drop-mat-view/): Remove a
    materialized view
  - [`REFRESH MATERIALIZED VIEW`](/docs/reference/sql/refresh-mat-view/):
    Manually refresh a materialized view
  - [`ALTER MATERIALIZED VIEW RESUME WAL`](/docs/reference/sql/alter-mat-view-resume-wal/):
    Resume WAL for a materialized view

- **Configuration**
  - [Materialized views configs](/docs/configuration/#materialized-views):
    Server configuration options for materialized views from `server.conf`

## Architecture and behaviour

### Storage model

Materialized views in QuestDB are implemented as special tables that maintain
their data independently of their base tables. They use the same underlying
storage engine as regular tables, benefiting from QuestDB's columnar storage and
partitioning capabilities.

### Refresh mechanism

:::note

Currently, QuestDB only supports **incremental refresh** for materialized views.

Future releases will include additional refresh types, such as time-interval and
manual refreshes.

:::

Unlike regular views, which recompute their results at query time, materialized
views in QuestDB are incrementally refreshed as new data is added to the base
table. This approach ensures that only the **relevant time slices** of the view
are updated, avoiding the need to recompute the entire dataset. The refresh
process works as follows:

1. New data is inserted into the base table.
2. The time-range of this data is identified.
3. This data is extracted and used to recompute the materialised view.

This refresh happens asynchronously, minimising any impact on write performance.
The refresh state of the materialized view is tracked using transaction numbers. The
transaction numbers can be compared with the base table, for monitoring the 'refresh lag'.

For example, if a base table receives new rows for `2025-02-18`, only that day's
relevant time slices are recomputed, rather than reprocessing all historical data.

You can monitor refresh status using the `materialized_views()` system function:

```questdb-sql title="Listing all materialized views"
SELECT
  view_name,
  last_refresh_timestamp,
  view_status,
  base_table_txn,
  applied_base_table_txn
FROM materialized_views();
```

Here is an example output:

| view_name   | last_refresh_timestamp | view_status | base_table_txn | applied_base_table_txn |
|-------------| ---------------------- | ----------- | -------------- | ---------------------- |
| trades_view | null                   | valid       | 102            | 102                    |


When `base_table_txn` matches `applied_base_table_txn`, the materialized view is
fully up-to-date.

#### Refreshing an invalid view

If a materialized view becomes invalid, you can check its status:

```questdb-sql title="Checking view status"
SELECT
  view_name,
  base_table_name,
  view_status,
  invalidation_reason
FROM materialized_views();
```

| view_name     | base_table_name | view_status | invalidation_reason                          |
|---------------|-----------------| ----------- | -------------------------------------------- |
| trades_view   | trades          | valid       | null                                         |
| exchange_view | exchange        | invalid     | [-105] table does not exist [table=exchange] |

To restore an invalid view, and refresh its data from scratch, use:

```questdb-sql title="Restoring an invalid view"
REFRESH MATERIALIZED VIEW view_name FULL;
```

This command deletes existing data in the materialized view, and re-runs its query.

Once the view is repopulated, the view is marked as 'valid' so that it can be incrementally refreshed.

For large base tables, a full refresh may take a significant amount of time.
You can cancel the refresh using the
[`CANCEL QUERY`](/docs/reference/sql/cancel-query/) SQL.

For the conditions which can invalidate a materialized view, see the
[technical requirements](#technical-requirements) section.

### Base table relationship

Every materialized view is tied to a base table that serves as its primary data
source.

- For single-table queries, the base table is automatically determined.
- For multi-table queries, one table must be explicitly defined as the base
  table using `WITH BASE`.

The view is automatically refreshed when the base table is changed. Therefore,
you should make sure the table that you wish to drive the view is defined correctly.
If you use the wrong base table, then the view may not be refreshed at the times you expect.

## Technical requirements

### Query constraints

To create a materialized view, your query:

- Must use either `SAMPLE BY` or `GROUP BY` with a designated timestamp column
  key.
- Must not contain `FROM-TO`, `FILL`, and `ALIGN TO FIRST OBSERVATION` clauses in
  `SAMPLE BY` queries
- Must use join conditions that are compatible with incremental refreshing.

We intend to loosen some of these restrictions in future.

### View invalidation

The view's structure is tightly coupled with its base table.

The main cause of invalidation for a materialised view, is when the table schema or underlying data
is modified.

These changes include dropping columns, dropping partitions and renaming the table.

Data deletion or modification, for example, using `TRUNCATE` or `UPDATE`, may also cause invalidation.

Also, a materialized view must use the same `DEDUP` keys as the base table.


## Replicated views (Enterprise only)

Replication of the base table is independent of materialized view maintenance.

If you promote a replica to a new primary instance, this may trigger a full materialized view refresh
in the case where the replica did not already have a fully up-to-date materialized view.

## Resource management

Materialized Views are compatible with the usual resource management systems:

- View TTL settings are separate from the base table.
- TTL deletions in the base table will not be propagated to the view.
- Partitions are managed separately between the base table and the view.
- Refresh intervals can be configured independently.

### Materialized view with TTL

Materialized Views take extra storage and resources to maintain. If your
`SAMPLE BY` unit is small (seconds, milliseconds), this could be a significant amount of data.

Therefore, you can decide on a retention policy for the data, and set it using `TTL`:

```questdb-sql title="Create a materialized view with a TTL policy"
CREATE MATERIALIZED VIEW trades_hourly_prices AS (
  SELECT
    timestamp,
    symbol,
    avg(price) AS avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY WEEK TTL 8 WEEKS;
```

In this example, the view stores hourly summaries of the pricing data, in weekly partitions,
keeping the prior 8 partitions.
