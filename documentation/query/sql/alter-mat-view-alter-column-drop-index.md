---
title: ALTER MATERIALIZED VIEW DROP INDEX
sidebar_label: DROP INDEX
description: DROP INDEX SQL keyword. Materialized View reference documentation.
---

Removes an existing [index](/docs/concepts/deep-dive/indexes/) from a
[`SYMBOL`](/docs/concepts/symbol/) column in a materialized view.

## Syntax

```
ALTER MATERIALIZED VIEW viewName ALTER COLUMN columnName DROP INDEX
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view |
| `columnName` | Name of the indexed `SYMBOL` column |

## When to use

Remove an index when:

- The index is no longer needed for query patterns
- You want to reduce storage overhead
- The column's index is causing more overhead than benefit

## Example

```questdb-sql title="Remove index from symbol column"
ALTER MATERIALIZED VIEW trades_hourly
  ALTER COLUMN symbol DROP INDEX;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Operation type | Atomic, non-blocking, non-waiting |
| Immediate effect | SQL optimizer stops using the index |
| Cleanup | Associated index files are deleted |

## Permissions (Enterprise)

Dropping an index requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `column does not exist` | Column not found in the view |
| `index does not exist` | Column is not indexed |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [Index concept](/docs/concepts/deep-dive/indexes/)
- [ALTER MATERIALIZED VIEW ADD INDEX](/docs/query/sql/alter-mat-view-alter-column-add-index/)
- [ALTER TABLE DROP INDEX](/docs/query/sql/alter-table-alter-column-drop-index/)
