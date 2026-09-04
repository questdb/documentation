---
title: ALTER TABLE REBASE WAL
sidebar_label: REBASE WAL
description: ALTER TABLE REBASE WAL SQL keyword reference documentation.
---

`ALTER TABLE REBASE WAL` rebuilds a [WAL table](/docs/concepts/write-ahead-log/)
under a fresh sequencer while keeping all of its applied data. It is a recovery
tool for a suspended table whose transaction log has grown unmanageable or has
gone bad, and it re-baselines a table's transaction history for replication.

Because it permanently discards any transactions that have not yet been applied,
`REBASE WAL` is a destructive operation that requires database administrator
privileges. Try [`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) first.

:::warning

`REBASE WAL` discards every un-applied WAL transaction, including any queued
schema changes, and gives the table a new internal table id. Only the data
already committed to the table is preserved, and the operation cannot be undone.

:::

## Syntax

```questdb-sql
ALTER TABLE tableName REBASE WAL;
```

## Description

A WAL table becomes [suspended](/docs/query/sql/alter-table-resume-wal/) when a
transaction repeatedly fails to apply, stalling the apply job at a fixed point in
the log. [`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) normally recovers
such a table by retrying or skipping forward. When the transaction log itself is
the problem, for example a corrupted WAL segment that affects many transactions
or a sequencer that has grown too large to manage, `REBASE WAL` rebuilds the
table instead:

- All data already applied to the table is preserved.
- Every un-applied WAL transaction is discarded, including queued schema changes.
- The table is recreated under a brand-new sequencer, so its transaction
  numbering restarts from the beginning.
- The table keeps its name but receives a new internal table id.
- [Materialized views](/docs/concepts/materialized-views/) that depend on the
  table are fully refreshed, because their watermarks no longer map onto the
  reset sequencer.

## Requirements

`REBASE WAL` proceeds only when all of the following hold, otherwise it returns
an error:

- The table uses [WAL](/docs/concepts/write-ahead-log/). On a non-WAL table the
  operation returns `<tableName> is not a WAL table`.
- The table is suspended. A table auto-suspends on an apply failure; you can also
  suspend it explicitly with
  [`ALTER TABLE tableName SUSPEND WAL`](/docs/query/sql/alter-table-suspend-wal/).
  On a table that is not suspended the operation returns
  `REBASE WAL requires the table to be suspended first`.
- The server sets `cairo.wal.apply.suspended.write.denied=true`, so that
  suspension blocks writes and the table is quiescent. Otherwise the operation
  returns `REBASE WAL requires cairo.wal.apply.suspended.write.denied=true so
  that suspension blocks writes`.
- The instance is not read-only.

## Permissions

`REBASE WAL` requires the `SYSTEM ADMIN`
[permission](/docs/security/rbac/permissions-reference/#special-permissions)
rather than a table-level grant.
This reflects that the operation is destructive: it discards un-applied
transactions, changes the table's internal id, and replaces its on-disk
directory. A user who can run the non-destructive
[`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) on a table cannot
necessarily run `REBASE WAL` on it.

## Examples

First confirm the table is suspended with the
[`wal_tables()`](/docs/query/functions/meta/#wal_tables) function:

```questdb-sql title="Check WAL table status"
SELECT name, suspended, writerTxn, sequencerTxn
FROM wal_tables()
WHERE name = 'trades';
```

| name   | suspended | writerTxn | sequencerTxn |
| ------ | --------- | --------- | ------------ |
| trades | true      | 1223      | 1242         |

The gap between `writerTxn` (the last transaction applied to the table) and
`sequencerTxn` (the last transaction recorded by the sequencer) shows there are
transactions that cannot be applied. When those transactions are unrecoverable,
rebuild the table:

```questdb-sql title="Rebuild the table under a fresh sequencer"
ALTER TABLE trades REBASE WAL;
```

The rows already applied (up to `writerTxn`) are preserved, the stuck
transactions are discarded, and the table resumes accepting writes under a new
sequencer.

## REBASE WAL for replication

QuestDB Enterprise issues an internal `REBASE WAL INTO '<directory>'` form so a
read-only replica can follow a primary that has rebased past a stuck
transaction, keeping both nodes on the same table identity. This form is managed
by the [replication](/docs/high-availability/overview/) system and is not
intended for manual use. Run outside a read-only replica, it returns
`REBASE WAL INTO is only supported on a read-only replica`.

## See also

- [`ALTER TABLE SUSPEND WAL`](/docs/query/sql/alter-table-suspend-wal/)
- [`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/)
- [Write-ahead log (WAL)](/docs/concepts/write-ahead-log/)
- [`wal_tables()`](/docs/query/functions/meta/#wal_tables)
