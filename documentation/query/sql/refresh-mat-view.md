---
title: REFRESH MATERIALIZED VIEW
sidebar_label: REFRESH MATERIALIZED VIEW
description:
  Documentation for the REFRESH MATERIALIZED VIEW SQL keyword in QuestDB.
---

Manually triggers a refresh of a materialized view. Use this to restore invalid
views, force an immediate update, or refresh a specific time range.

## Syntax

```
REFRESH MATERIALIZED VIEW viewName [ FULL | INCREMENTAL | RANGE FROM timestamp TO timestamp ]
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to refresh |
| `FULL` | Delete all data and rebuild from scratch |
| `INCREMENTAL` | Process only new data since last refresh |
| `RANGE FROM ... TO` | Refresh only the specified time range |

## Refresh modes

### FULL

Deletes all data in the materialized view and rebuilds it from the base table:

```questdb-sql title="Full refresh"
REFRESH MATERIALIZED VIEW trades_hourly FULL;
```

**What happens:**
1. Existing view data is deleted
2. The view query runs against the entire base table
3. Results are inserted into the view
4. View status becomes `valid` (reactivates incremental refresh)

**When to use:**
- View became invalid due to schema changes or `TRUNCATE`/`UPDATE` on base table
- View data is corrupted or inconsistent
- You need to rebuild after dropping partitions from the base table

:::warning
Full refresh on large base tables can take significant time. The view remains
queryable during refresh but returns stale data until complete.
:::

### INCREMENTAL

Schedules an incremental refresh that processes only new data:

```questdb-sql title="Incremental refresh"
REFRESH MATERIALIZED VIEW trades_hourly INCREMENTAL;
```

**What happens:**
1. Identifies new rows in the base table since the last refresh
2. Processes only the affected time slices
3. Updates the view with new aggregated data

**When to use:**
- Incremental refresh is automatic for most views, so this is rarely needed
- Use when automatic refresh isn't triggering as expected
- Use with `MANUAL` refresh strategy to control exactly when updates happen

:::note
Only works on valid views. If the view is invalid, use `FULL` instead.
:::

### RANGE

Refreshes only data within a specific time range:

```questdb-sql title="Range refresh"
REFRESH MATERIALIZED VIEW trades_hourly
  RANGE FROM '2025-05-01T00:00:00Z' TO '2025-05-02T00:00:00Z';
```

**What happens:**
1. Deletes view data in the specified time range
2. Re-runs the view query for that range only
3. Inserts fresh results for that time slice

**When to use:**
- Backfilling data that arrived late (older than
  [`REFRESH LIMIT`](/docs/query/sql/alter-mat-view-set-refresh-limit/))
- Correcting a specific time period without full rebuild
- Recalculating after base table data was modified in a known range

:::note
Range refresh does not update the incremental refresh checkpoint. Future
incremental refreshes continue from where they left off, independent of range
refreshes.
:::

## Examples

### Restore an invalid view

```questdb-sql title="Check status and refresh"
-- Check why the view is invalid
SELECT view_name, view_status, invalidation_reason
FROM materialized_views()
WHERE view_name = 'trades_hourly';

-- Rebuild the view
REFRESH MATERIALIZED VIEW trades_hourly FULL;

-- Verify it's valid again
SELECT view_name, view_status
FROM materialized_views()
WHERE view_name = 'trades_hourly';
```

### Manual refresh workflow

For views with `REFRESH MANUAL` strategy:

```questdb-sql title="Manual refresh pattern"
-- Create a manually-refreshed view
CREATE MATERIALIZED VIEW daily_summary
REFRESH MANUAL AS
SELECT timestamp, symbol, sum(amount) AS volume
FROM trades
SAMPLE BY 1d;

-- Refresh when ready (e.g., after batch load completes)
REFRESH MATERIALIZED VIEW daily_summary INCREMENTAL;
```

### Backfill old data

When data arrives after the
[refresh limit](/docs/query/sql/alter-mat-view-set-refresh-limit/):

```questdb-sql title="Backfill with range refresh"
-- Late data arrived for May 1st
-- Incremental refresh won't pick it up if outside the limit

-- Refresh just that day
REFRESH MATERIALIZED VIEW trades_hourly
  RANGE FROM '2025-05-01T00:00:00Z' TO '2025-05-02T00:00:00Z';
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Execution | Asynchronous - command returns immediately |
| View availability | View remains queryable during refresh (returns current data) |
| Concurrency | Only one refresh runs at a time per view |
| Cancellation | Use [`CANCEL QUERY`](/docs/query/sql/cancel-query/) to stop a long-running refresh |

### Monitoring refresh progress

```questdb-sql title="Check refresh status"
SELECT
  view_name,
  view_status,
  refresh_base_table_txn,
  base_table_txn,
  last_refresh_start_timestamp,
  last_refresh_finish_timestamp
FROM materialized_views()
WHERE view_name = 'trades_hourly';
```

When `refresh_base_table_txn` equals `base_table_txn`, the view is fully
up-to-date.

## Permissions (Enterprise)

Refreshing a materialized view requires the `REFRESH MATERIALIZED VIEW`
permission on the specific view:

```questdb-sql title="Grant refresh permission"
GRANT REFRESH MATERIALIZED VIEW ON trades_hourly TO user1;
```

The view creator automatically receives this permission with the `GRANT` option.

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `materialized view is invalid` | Cannot run `INCREMENTAL` on invalid view (use `FULL`) |
| `invalid timestamp range` | `FROM` timestamp is after `TO` timestamp |
| `permission denied` | Missing `REFRESH MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [ALTER MATERIALIZED VIEW SET REFRESH](/docs/query/sql/alter-mat-view-set-refresh/)
- [ALTER MATERIALIZED VIEW SET REFRESH LIMIT](/docs/query/sql/alter-mat-view-set-refresh-limit/)
- [DROP MATERIALIZED VIEW](/docs/query/sql/drop-mat-view/)
