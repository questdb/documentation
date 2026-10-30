---
title: DROP LIVE VIEW
sidebar_label: DROP LIVE VIEW
description:
  Documentation for the DROP LIVE VIEW SQL keyword in QuestDB.
---

Permanently deletes a live view and all of its data. For a conceptual overview,
see [Live views](/docs/concepts/live-views/).

## Syntax

```questdb-sql title="DROP LIVE VIEW"
DROP LIVE VIEW [ IF EXISTS ] viewName
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the live view to drop |
| `IF EXISTS` | Suppress the error if no table or view with this name exists |

## Examples

```questdb-sql title="Drop a live view"
DROP LIVE VIEW trades_ma;
```

```questdb-sql title="Drop only if it exists (no error if missing)"
DROP LIVE VIEW IF EXISTS trades_ma;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Permanence | Deletion is permanent and not recoverable |
| Space reclamation | Disk space is reclaimed asynchronously |
| Active queries | Existing read queries may delay space reclamation |
| Permissions | On Enterprise, the view's access-control grants are removed with it |

:::warning

This operation cannot be undone. The view and all of its precomputed data are
permanently deleted.

:::

## Permissions (Enterprise)

Dropping a live view requires the `DROP LIVE VIEW` permission on the specific
view:

```questdb-sql title="Grant drop permission"
GRANT DROP LIVE VIEW ON trades_ma TO user1;
```

The view creator automatically receives this permission with the `GRANT` option.

## Errors

Messages are shown by their stable prefix. The server may append details, such
as `[name=trades_ma]`.

| Error | Cause |
| ----- | ----- |
| `live view name expected` | The name refers to a table or view that is not a live view, even with `IF EXISTS` |
| `live view does not exist` | The view does not exist, or is [hidden](/docs/security/rbac/#object-visibility) from the user (Enterprise), and `IF EXISTS` was not specified |
| `Access denied for <user> [DROP LIVE VIEW on <view>]` | Missing `DROP LIVE VIEW` permission (Enterprise) |

## See also

- [Live views concept](/docs/concepts/live-views/)
- [CREATE LIVE VIEW](/docs/query/sql/create-live-view/)
- [ALTER LIVE VIEW RESUME WAL](/docs/query/sql/alter-live-view-resume-wal/)
