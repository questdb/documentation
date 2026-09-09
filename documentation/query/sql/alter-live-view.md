---
title: ALTER LIVE VIEW
sidebar_label: ALTER LIVE VIEW
description:
  ALTER LIVE VIEW SQL keyword reference documentation, covering TTL, partition
  retention, Parquet conversion and WAL recovery on a live view.
---

Manages the disk tier of a [live view](/docs/concepts/live-views/): how long its
computed rows are retained, the storage format of its partitions, and the
recovery of its WAL writer. Retention keeps a view's footprint bounded, and
Parquet conversion compresses the older partitions a view no longer appends to.

A live view's query, output schema and refresh cadence are fixed at creation and
cannot be altered. `ALTER LIVE VIEW` accepts five clauses:

- [`CONVERT PARTITION`](#convert-partition) switches partitions between the
  native and Parquet storage formats.
- [`DROP PARTITION`](#drop-partition) removes partitions from disk immediately.
- [`RESUME WAL`](#resume-wal) restarts a suspended view.
- [`SET TTL`](#set-ttl) sets a retention period the view enforces itself.
- [`SUSPEND WAL`](#suspend-wal) stops the view's apply on purpose.

## Syntax

```questdb-sql title="CONVERT PARTITION"
ALTER LIVE VIEW viewName CONVERT PARTITION TO PARQUET
    { LIST partitionName [, partitionName ...] | WHERE booleanExpression }
    [ WITH ( parquetOption [, parquetOption ...] ) ];

ALTER LIVE VIEW viewName CONVERT PARTITION TO NATIVE
    { LIST partitionName [, partitionName ...] | WHERE booleanExpression };
```

```questdb-sql title="DROP PARTITION"
ALTER LIVE VIEW viewName DROP PARTITION LIST partitionName [, partitionName ...];

ALTER LIVE VIEW viewName DROP PARTITION WHERE booleanExpression;
```

```questdb-sql title="RESUME WAL"
ALTER LIVE VIEW viewName RESUME WAL [ FROM { TRANSACTION | TXN } sequencerTxn ];
```

```questdb-sql title="SET TTL"
ALTER LIVE VIEW viewName SET TTL
    n { HOUR[S] | DAY[S] | WEEK[S] | MONTH[S] | YEAR[S] };
```

```questdb-sql title="SUSPEND WAL"
ALTER LIVE VIEW viewName SUSPEND WAL;
```

Where [`parquetOption`](#parquet-options) is a bloom filter setting for the
conversion, and `booleanExpression` filters on the view's designated timestamp.

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the live view to modify |
| `partitionName` | Partition directory name, following the [partition naming convention](/docs/concepts/partitions/) |
| `booleanExpression` | Predicate on the view's designated timestamp, selecting the partitions to act on |
| `n` | Number of time units to retain |
| `sequencerTxn` | Transaction to resume from. Defaults to the failed transaction |

## How the change is applied

A live view holds its computed rows in two tiers: an in-memory tier that serves
fresh reads, and a WAL-backed disk tier written on the `FLUSH EVERY` cadence.
`ALTER LIVE VIEW` changes the disk tier, and it does so asynchronously, the way
a WAL table does.

The statement returns once the change is committed to the view's sequencer. The
refresh worker applies it alongside the next flush, or on its next scan if the
view is idle. `FLUSH EVERY` sets the cadence, not a deadline: writer contention,
apply backoff and an in-flight out-of-order repair can all delay the change.

Rows the change removes from disk can still be served from the in-memory tier
until that tier is rebuilt, so neither `DROP PARTITION` nor `SET TTL` makes data
unreadable at a known point in time.

A suspended view applies nothing until [`RESUME WAL`](#resume-wal), including
these statements. Suspension is visible in
[`wal_tables()`](/docs/query/functions/meta/#wal_tables).

## CONVERT PARTITION

Converts partitions of the view's disk tier between QuestDB's native format and
[Parquet](/docs/concepts/parquet/). This changes the storage format only: the
rows, the view's output and every query over it are unaffected.

```questdb-sql title="Convert older partitions to Parquet"
ALTER LIVE VIEW trades_ma CONVERT PARTITION TO PARQUET
WHERE timestamp < '2026-08-01';
```

```questdb-sql title="Convert one partition back to native"
ALTER LIVE VIEW trades_ma CONVERT PARTITION TO NATIVE LIST '2026-07-15';
```

Convert partitions the view has moved past. The newest partition takes every
flush, and a write into a Parquet partition is a merge that rewrites the whole
file, so leaving it native keeps the flush cheap.

### Parquet options

`WITH` accepts the same bloom filter options as
[`ALTER TABLE CONVERT PARTITION`](/docs/concepts/parquet/#bloom-filters-for-in-place-conversion),
and only when converting to Parquet:

- `bloom_filter_columns = 'col[,col ...]'` builds bloom filters for the listed
  columns, enabling row group pruning for equality and `IN` queries.
- `fpp = 'probability'` sets the false positive probability, exclusive between 0
  and 1. Quote the value.

```questdb-sql title="Convert with bloom filters"
ALTER LIVE VIEW trades_ma CONVERT PARTITION TO PARQUET
LIST '2026-07-15'
WITH (bloom_filter_columns = 'symbol', fpp = '0.01');
```

:::caution

`WITH` options are not stored on the view. Anything that rewrites a converted
partition later re-encodes it from the server's Parquet configuration, without
the bloom filters. A live view has no per-column `PARQUET()` metadata to fall
back on, so bloom filters set here survive only until the partition is next
rewritten.

:::

### Out-of-order base commits over a Parquet partition

Rows cannot be removed from a Parquet file in place. When a late base-table
commit forces the view to correct output it has already written, the writer
converts every Parquet partition the correction covers back to native, applies
the correction, and converts them back. Reads of those partitions are unaffected
and the partitions are Parquet again when the apply finishes.

The cost is a full decode and re-encode of each covered partition, per
correction. A correction that cannot anchor on a checkpoint covers the view's
whole range, and then pays it for every Parquet partition the view holds. A view
over a base table that takes frequent out-of-order writes is a poor candidate
for Parquet conversion.

If the process dies during that rewrite, the partition is left native and the
next writer to open the view finishes the re-encode. Nothing is lost but the
compaction, and `CONVERT PARTITION TO PARQUET` restores it.

## DROP PARTITION

Removes whole partitions from the view's disk tier. Both selectors of
[`ALTER TABLE DROP PARTITION`](/docs/query/sql/alter-table-drop-partition/) are
accepted, and partition names follow the same convention. Inspect the view's
partitions with
[`table_partitions()`](/docs/query/functions/meta/#table_partitions).

```questdb-sql title="Drop a partition by name"
ALTER LIVE VIEW trades_ma DROP PARTITION LIST '2026-07-15';
```

```questdb-sql title="Drop everything before a date"
ALTER LIVE VIEW trades_ma DROP PARTITION WHERE timestamp < '2026-08-01';
```

The newest partition cannot be dropped. The refresh pipeline appends to it and
an out-of-order correction rewrites it, so it is rejected with
`cannot drop the active partition of a live view [partition=...]`, both when the
statement is compiled and again when it is applied.

:::caution

`DROP PARTITION` removes durable rows now, and only now. A live view is derived
from its base table, so any later recovery that recomputes output over the
dropped period brings those rows back:

- an out-of-order base commit whose correction range covers the dropped period
  re-emits the overlapping rows;
- a restart that cannot resume from the view's checkpoint rebuilds the view from
  its `START FROM` boundary, re-materializing every dropped partition the base
  table still holds.

For retention that survives recovery, use [`SET TTL`](#set-ttl), which the view
re-enforces on every commit.

:::

## RESUME WAL

Restarts WAL transactions on a live view after the error that suspended it has
been resolved. It behaves as
[`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) does, and
recovers only a suspended WAL writer. It does not revalidate a view that was
invalidated by a base-table schema change.

```questdb-sql title="Resume from the failed transaction"
ALTER LIVE VIEW trades_ma RESUME WAL;
```

```questdb-sql title="Skip past a transaction"
ALTER LIVE VIEW trades_ma RESUME WAL FROM TRANSACTION 5;
```

## SET TTL

Sets a [time-to-live](/docs/concepts/ttl/) period on the view's disk tier,
dropping partitions whose entire time range falls outside the window. A view's
TTL is independent of its base table's TTL.

```questdb-sql title="Keep four weeks of computed rows"
ALTER LIVE VIEW trades_ma SET TTL 4 WEEKS;
```

```questdb-sql title="Shorthand form"
ALTER LIVE VIEW trades_ma SET TTL 12h;
```

Accepted units are `HOUR[S]`, `DAY[S]`, `WEEK[S]`, `MONTH[S]` and `YEAR[S]`, with
the `h`, `d`, `w`, `M` and `y` shorthands. The period must be a whole number
multiple of the view's partition size, which is the view's `PARTITION BY` if it
declared one, and the base table's scheme otherwise. Reference-time and
partition-boundary rules are the table rules, described in
[TTL](/docs/concepts/ttl/).

Clearing a TTL needs a unit as well:

```questdb-sql title="Clear the retention period"
ALTER LIVE VIEW trades_ma SET TTL 0h;
```

The view evaluates its TTL whenever its own table commits, which is the flush
cadence while the view is producing rows, plus the commit that applies this
statement. A view that has stopped producing output stops evicting.

Unlike [`DROP PARTITION`](#drop-partition), a TTL survives recovery: a rebuilt
view re-applies the same rule to the recomputed rows, so the retention window
converges again without operator action.

Read the current setting from [`tables()`](/docs/query/functions/meta/#tables),
where a `ttlValue` of `0` means no TTL:

```questdb-sql title="Check the retention period"
SELECT table_name, ttlValue, ttlUnit FROM tables()
WHERE table_name = 'trades_ma';
```

`SHOW CREATE LIVE VIEW` re-emits a non-zero TTL, so a view altered here
round-trips through its own DDL.

:::caution

On QuestDB Enterprise, TTL is superseded by
[storage policy](/docs/concepts/storage-policy/) for tables, and a non-zero
`SET TTL` on a live view is currently rejected with
`TTL is not supported on Enterprise tables; use a storage policy instead`.
`SET TTL 0` is accepted, and the `TTL` clause of
[`CREATE LIVE VIEW`](/docs/query/sql/create-live-view/#ttl) is accepted.

:::

## SUSPEND WAL

Stops the apply of the view's WAL, leaving the view quiescent. It behaves as
[`ALTER TABLE SUSPEND WAL`](/docs/query/sql/alter-table-suspend-wal/) does:
refresh keeps computing and committing to the sequencer, nothing is applied, and
queries stop seeing new rows until `RESUME WAL` drains the queued transactions in
order. Suspending and resuming share a single authorization.

```questdb-sql title="Suspend a live view"
ALTER LIVE VIEW trades_ma SUSPEND WAL;
```

## Unsupported clauses

`ALTER TABLE` never reaches a live view. It fails with `cannot modify live view`,
whichever clause follows.

Every `ALTER LIVE VIEW` clause outside the five above is rejected, because a live
view's schema is a function of its `SELECT`. That covers `ADD COLUMN`,
`ALTER COLUMN`, `RENAME`, `ATTACH PARTITION`, `DETACH PARTITION`,
`SQUASH PARTITIONS`, `DEDUP`, `SET PARAM`, `SET TYPE` and `SET FORMAT`.

`FORCE DROP PARTITION` is rejected separately, with
`FORCE DROP PARTITION is not supported on live views`. On a table it bypasses the
WAL and writes through a directly acquired writer, which on a live view is owned
by the refresh worker. The recovery a live view has is `SUSPEND WAL`,
`RESUME WAL` and the ordinary sequenced `DROP PARTITION`.

## Permissions (Enterprise)

Each clause is authorized with the same permission its `ALTER TABLE` counterpart
uses, checked against the live view:

| Clause | Permission |
| ------ | ---------- |
| `CONVERT PARTITION TO NATIVE` | `CONVERT PARTITION TO NATIVE` |
| `CONVERT PARTITION TO PARQUET` | `CONVERT PARTITION TO PARQUET` |
| `DROP PARTITION` | `DROP PARTITION` |
| `RESUME WAL`, `SUSPEND WAL` | `RESUME WAL` |
| `SET TTL` | `SET TABLE PARAM` |

```questdb-sql title="Grant retention management on one view"
GRANT DROP PARTITION, SET TABLE PARAM ON trades_ma TO user1;
```

See [Role-based access control](/docs/security/rbac/) for the full model.

## Replication (Enterprise)

A live view's rows are node-local: every node with live views enabled computes
and flushes its own copy, and live-view WAL is never transferred between nodes.
These statements are relayed to replicas over a replicated control table and
applied by each node to its own copy of the view, so retention and storage format
converge without shipping rows.

A replica holds a relayed change until its own refresh has reached the base-table
progress the primary had when it took the change, so both nodes remove or convert
the same rows. A `WHERE` selector is resolved to a concrete partition list on the
primary and travels as that list, which keeps the two nodes from resolving the
same predicate against different data. A node with live views or refresh disabled
applies the change through the ordinary WAL apply job.

## Errors

| Error | Cause |
| ----- | ----- |
| `cannot modify live view` | `ALTER TABLE` was used on a live view. Use `ALTER LIVE VIEW` |
| `'set', 'drop', 'convert', 'resume' or 'suspend' expected` | The clause is not part of the `ALTER LIVE VIEW` grammar |
| `'ttl' expected` | `SET` was followed by something other than `TTL` |
| `FORCE DROP PARTITION is not supported on live views` | `FORCE DROP PARTITION` was used on a live view |
| `cannot drop the active partition of a live view [partition=...]` | The dropped partition is the one the view is appending to |
| `TTL value must be an integer multiple of the partition size` | The TTL period is not a whole multiple of the view's partition size |
| `missing unit, 'HOUR(S)', 'DAY(S)', 'WEEK(S)', 'MONTH(S)' or 'YEAR(S)' expected` | `SET TTL 0` was written without a unit |
| `no partitions matched WHERE clause` | The `WHERE` selector matched no partition when the statement was compiled |
| `bloom_filter_columns or fpp expected` | An unknown option was passed to `WITH` |
| `permission denied` | Missing permission (Enterprise) |

## See also

- [Live views concept](/docs/concepts/live-views/)
- [CREATE LIVE VIEW](/docs/query/sql/create-live-view/)
- [DROP LIVE VIEW](/docs/query/sql/drop-live-view/)
- [TTL concept](/docs/concepts/ttl/)
- [Parquet](/docs/concepts/parquet/)
- [table_partitions()](/docs/query/functions/meta/#table_partitions)
