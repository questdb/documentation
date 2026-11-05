---
title: ALTER LIVE VIEW RESUME WAL
sidebar_label: RESUME WAL
description:
  ALTER LIVE VIEW RESUME WAL restarts WAL apply on a live view suspended after an
  error such as a full disk. Find suspended live views with wal_tables().
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
| `FROM TRANSACTION` or `FROM TXN` | Optional transaction to resume from. Defaults to the failed transaction |
| `sequencerTxn` | A transaction number of the view's own WAL, as reported by `wal_tables()`, not a base-table transaction |

## When to use

A live view writes its output to its own WAL-backed table. If applying one of
the view's WAL transactions fails, QuestDB suspends the view's WAL like that of
any other WAL table. The view's next flush after a base-table commit retries
the apply and clears the suspension if the cause is gone, but a view whose base
table is idle stays suspended until you resume it.
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

## Permissions (Enterprise)

Resuming WAL on a live view requires the `RESUME WAL` permission on the view:

```questdb-sql title="Grant resume permission"
GRANT RESUME WAL ON trades_ma TO user1;
```

## Errors

Messages are shown by their stable prefix. The server may append details, such
as `[name=trades_ma]`.

| Error | Cause |
| ----- | ----- |
| `live view name expected` | The name refers to a table or view that is not a live view |
| `table does not exist` | No table or view with this name exists |
| `'resume' or 'suspend' expected` | The statement uses an unsupported `ALTER LIVE VIEW` operation, such as `SET TTL` or `ADD COLUMN`. Only `RESUME WAL` is supported |

## See also

- [Live views concept](/docs/concepts/live-views/)
- [CREATE LIVE VIEW](/docs/query/sql/create-live-view/)
- [DROP LIVE VIEW](/docs/query/sql/drop-live-view/)
- [ALTER TABLE RESUME WAL](/docs/query/sql/alter-table-resume-wal/)
- [wal_tables() function](/docs/query/functions/meta/#wal_tables)
