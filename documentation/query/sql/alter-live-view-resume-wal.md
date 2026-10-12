---
title: ALTER LIVE VIEW RESUME WAL
sidebar_label: RESUME WAL
description:
  Documentation for the ALTER LIVE VIEW RESUME WAL SQL keyword in QuestDB.
---

Restarts [WAL](/docs/concepts/write-ahead-log/) apply on a
[live view](/docs/concepts/live-views/) whose own WAL was suspended after an
error, such as a full disk, so that the view's disk tier catches up again.

## Syntax

```questdb-sql
ALTER LIVE VIEW viewName RESUME WAL
    [ FROM { TRANSACTION | TXN } sequencerTxn ];
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the live view to resume |
| `FROM TRANSACTION` | Optional starting transaction number (defaults to the failed transaction) |

## When to use

A live view writes its output to its own WAL-backed table. If applying one of
the view's WAL transactions fails, QuestDB suspends the view's WAL like that of
any other WAL table, and the view can serve stale rows until you resume it.
[`live_views()`](/docs/query/functions/meta/#live_views) still reports
`view_status = 'active'` for a suspended view, so check
[`wal_tables()`](/docs/query/functions/meta/#wal_tables) instead:

```questdb-sql title="Find suspended live views"
SELECT w.name, w.writerTxn, w.sequencerTxn, w.errorTag, w.errorMessage
FROM wal_tables() w
JOIN live_views() v ON w.name = v.view_name
WHERE w.suspended;
```

`RESUME WAL` only recovers a suspended WAL writer. It does not revalidate a view
that has been [invalidated](/docs/concepts/live-views/#base-table-lifecycle);
an invalid view must be dropped and recreated.

## Examples

```questdb-sql title="Resume WAL processing"
ALTER LIVE VIEW trades_ma RESUME WAL;
```

```questdb-sql title="Resume from a specific transaction"
ALTER LIVE VIEW trades_ma RESUME WAL FROM TRANSACTION 5;
```

Resuming from a later transaction skips the earlier ones. Fix the underlying
issue and resume from the failed transaction where possible.

:::note

`ALTER LIVE VIEW viewName SUSPEND WAL` is also accepted, but it does not pause
a live view: the view's next refresh applies its pending WAL and clears the
suspension. No other `ALTER LIVE VIEW` operations are supported.

:::

## Permissions (Enterprise)

Resuming WAL on a live view requires the `RESUME WAL` permission on the view:

```questdb-sql title="Grant resume permission"
GRANT RESUME WAL ON trades_ma TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `live view name expected` | The name refers to a table or view that is not a live view |
| `table does not exist` | No table or view with this name exists |
| `'resume' or 'suspend' expected` | The statement uses an operation other than `RESUME WAL` or `SUSPEND WAL` |

## See also

- [Live views concept](/docs/concepts/live-views/)
- [CREATE LIVE VIEW](/docs/query/sql/create-live-view/)
- [DROP LIVE VIEW](/docs/query/sql/drop-live-view/)
- [ALTER TABLE RESUME WAL](/docs/query/sql/alter-table-resume-wal/)
- [wal_tables() function](/docs/query/functions/meta/#wal_tables)
