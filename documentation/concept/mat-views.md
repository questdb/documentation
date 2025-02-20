---
title: Materialized views
sidebar_label: Materialized views
description:
  Overview of QuestDB's materialized views. This feature helps you significantly
  speed up your aggregation queries.
---

A materialized view is a database object that stores the pre-computed results of a query.
Unlike regular views, which compute their results at query time, materialized views persist their data to disk, making them particularly efficient for expensive
aggregate queries that are run frequently.

> For a step-by-step guide on creating materialized views, see [our tutorial](/blog/how-to-create-materialized-views/).

## Architecture and behaviour

### Storage model
Materialized views in QuestDB are implemented as special tables that maintain their
data independently of their base tables. They use the same underlying storage
engine as regular tables, benefiting from QuestDB's columnar storage and
partitioning capabilities.

### Refresh mechanism

:::note
Currently, QuestDB only supports **incremental refresh** for materialized views.
Future releases will include additional refresh strategies such as interval and
manual refreshes.
:::

Unlike regular views, which recompute their results at query time, materialized views 
in QuestDB are incrementally refreshed as new data is added to the base table. This 
approach ensures that only the **relevant time slices** of the view are updated, 
avoiding the need to recompute the entire dataset. The refresh process works as follows:

  - When new data is inserted into the base table, affected time slices are identified
  - Only these affected portions are recomputed and updated
  - Updates happen asynchronously to minimize impact on write performance
  - The refresh state is tracked using transaction numbers for consistency

For example, if a base table receives new rows for `2025-02-18`, only that day's relevant 
time slices are recomputed instead of reprocessing all historical data.

You can monitor refresh status using the `mat_views()` system function:

```questdb-sql title="Listing all materialized views"
SELECT
  name,
  last_refresh_timestamp,
  view_status,
  base_table_txn,
  applied_base_table_txn
FROM mat_views();
```

When `base_table_txn` matches `applied_base_table_txn`, the materialized view is fully up-to-date.

### Base table relationship

Every materialized view is tied to a base table that serves as its primary data source:

  - For single-table queries, the base table is automatically determined
  - For multi-table queries, one table must be explicitly designated as the base table using `WITH BASE`
  - The view’s refresh cycle is triggered by changes to its base table

For multi-table queries, one table must be explicitly designated as the base table using `WITH BASE`. This ensures that the refresh mechanism knows which table's updates should trigger the materialized view's updates.

## Technical requirements

### Query constraints

Materialized views must meet specific requirements:

  - Must use either SAMPLE BY or GROUP BY with the designated timestamp column
  - Cannot use FROM-TO and FILL clauses in SAMPLE BY queries
  - Join conditions must be compatible with incremental refresh

### Schema dependencies

The view’s structure is tightly coupled with its base table:

  - Schema changes to the base table may invalidate the view
  - Operations like RENAME TABLE or ALTER TABLE DROP COLUMN require view recreation
  - When using deduplication, views must use the same grouping keys as the base table’s UPSERT KEYS

### Restoring an invalid view

If a materialized view becomes invalid (e.g., due to `TRUNCATE` or `ALTER TABLE DROP PARTITION` on the base table), 
you can check its status:

```questdb-sql title="Checking view status"
SELECT name, base_table_name, invalid, invalidation_reason
FROM mat_views();
```

To restore an invalid view and refresh its data from scratch, use:

```questdb-sql title="Restoring an invalid view"
REFRESH MATERIALIZED VIEW view_name FULL;
```

This command deletes existing data in the materialized view, re-runs its query,
and marks it as valid so that it can be incrementally refreshed again.

## Replication considerations (Enterprise only)

For Enterprise deployments with replication:

  - Refresh state is maintained independently on each node
  - Promotion of a replica to primary triggers a full refresh
  - Base table replication occurs independently of view maintenance

## Resource management

Views interact with QuestDB’s resource management systems:

  - Independent TTL settings from base tables
  - Ignore TTL-based deletions in base tables
  - Separate partition management
  - Configurable refresh intervals

For example, you can apply a TTL policy directly on the view to limit data growth:

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

