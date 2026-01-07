---
title: ALTER MATERIALIZED VIEW RESUME WAL
sidebar_label: RESUME WAL
description:
  Documentation for the ALTER MATERIALIZED VIEW RESUME WAL SQL keyword in
  QuestDB.
---

Restarts [WAL](/docs/concepts/write-ahead-log/) transactions on a materialized
view after resolving errors that caused suspension.

## Syntax

```
ALTER MATERIALIZED VIEW viewName RESUME WAL [ FROM TRANSACTION sequencerTxn ]
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to resume |
| `FROM TRANSACTION` | Optional starting transaction number (defaults to failed transaction) |

## When to use

Use this command when a materialized view's WAL processing has been suspended
due to an error. The view will be marked as `suspended = true` in the
`wal_tables()` output.

## Examples

### Check WAL status

Use [`wal_tables()`](/docs/query/functions/meta/#wal_tables) to identify
suspended views:

```questdb-sql title="List WAL status for all tables and views"
wal_tables();
```

| name      | suspended | writerTxn | sequencerTxn |
| --------- | --------- | --------- | ------------ |
| trades_1h | true      | 3         | 5            |

The `trades_1h` view is suspended. The last successful commit was transaction
`3`.

### Resume from failed transaction

Restart processing from the next transaction after the last successful one:

```questdb-sql title="Resume WAL processing"
ALTER MATERIALIZED VIEW trades_1h RESUME WAL;
```

This resumes from transaction `4` (the failed transaction).

### Resume from specific transaction

Skip problematic transactions by specifying a starting point:

```questdb-sql title="Resume from specific transaction"
ALTER MATERIALIZED VIEW trades_1h RESUME WAL FROM TRANSACTION 5;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Default resume point | Resumes from the transaction after `writerTxn` |
| Skipped transactions | When using `FROM TRANSACTION`, earlier transactions are skipped |
| Error resolution | Fix the underlying issue before resuming, or skip past it |

## Permissions (Enterprise)

Resuming WAL on a materialized view requires the `ALTER MATERIALIZED VIEW`
permission on the specific view:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_1h TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `view is not suspended` | WAL is already running normally |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [Write-Ahead Log](/docs/concepts/write-ahead-log/)
- [ALTER TABLE RESUME WAL](/docs/query/sql/alter-table-resume-wal/)
- [wal_tables() function](/docs/query/functions/meta/#wal_tables)
