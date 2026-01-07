---
title: DROP MATERIALIZED VIEW
sidebar_label: DROP MATERIALIZED VIEW
description:
  Documentation for the DROP MATERIALIZED VIEW SQL keyword in QuestDB.
---

Permanently deletes a materialized view and all its data.

## Syntax

```
DROP MATERIALIZED VIEW [ IF EXISTS ] viewName
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to drop |
| `IF EXISTS` | Suppress error if view doesn't exist |

## Examples

```questdb-sql title="Drop a materialized view"
DROP MATERIALIZED VIEW trades_hourly;
```

```questdb-sql title="Drop only if exists (no error if missing)"
DROP MATERIALIZED VIEW IF EXISTS trades_hourly;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Permanence | Deletion is permanent and not recoverable |
| Space reclamation | Disk space is reclaimed asynchronously |
| Active queries | Existing read queries may delay space reclamation |
| Non-standard volumes | View is logically removed; data remains in the volume |

:::warning
This operation cannot be undone. The view and all its pre-computed data will be
permanently deleted.
:::

## Permissions (Enterprise)

Dropping a materialized view requires the `DROP MATERIALIZED VIEW` permission on
the specific view:

```questdb-sql title="Grant drop permission"
GRANT DROP MATERIALIZED VIEW ON trades_hourly TO user1;
```

The view creator automatically receives this permission with the `GRANT` option.

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View doesn't exist and `IF EXISTS` not specified |
| `permission denied` | Missing `DROP MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [REFRESH MATERIALIZED VIEW](/docs/query/sql/refresh-mat-view/)
- [ALTER MATERIALIZED VIEW SET REFRESH](/docs/query/sql/alter-mat-view-set-refresh/)
