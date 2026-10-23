---
title: WAL table configurations
description: Configuration settings for WAL tables in QuestDB.
---

These settings control the Write-Ahead Log (WAL) subsystem, including parallel
apply threads, segment rollover, commit squashing, and cleanup of applied WAL
files.

To cap the native memory a single WAL apply batch may allocate, see
[`cairo.wal.apply.memory.limit.bytes`](/docs/configuration/cairo-engine/#memory-limits).

## Adaptive WAL apply blocks

With adaptive blocks enabled, the row limit starts at
`cairo.wal.apply.block.size` worth of rows and doubles whenever the row limit
cuts a block short, while the block fits its memory budget. The grown limit
resets when the table writer reopens. The look-ahead transaction count starts
at `cairo.wal.apply.look.ahead.txn.count` and adapts to one block's worth of
transactions.

When adaptive blocks are disabled, blocks are sized by `cairo.wal.max.lag.size`
and `cairo.wal.squash.uncommitted.rows.multiplier`.

## cairo.wal.apply.block.max.rows

- **Default**: `100000000`
- **Reloadable**: no

Hard row cap for both the starting block size and its growth, from 1 to 2,000,000,000.
Has no effect when adaptive blocks are disabled.

## cairo.wal.apply.block.memory.percent

- **Default**: `25`
- **Reloadable**: no

Percentage of the RSS limit (`ram.usage.limit.bytes` / `ram.usage.limit.percent`) split across WAL apply workers
as the budget for growth beyond the starting block size. With no RSS limit, or with this set to `0`,
the row limit does not grow.

## cairo.wal.apply.block.size

- **Default**: `75M`
- **Reloadable**: no

Starting data size in bytes for an adaptive WAL apply block.
Set to `0` to disable adaptive blocks.

## cairo.wal.apply.parallel.sql.enabled

- **Default**: `true`
- **Reloadable**: no

When disabled, SQL executed by the WAL apply job always runs single-threaded.

## cairo.wal.apply.suspended.tables

- **Default**: none
- **Reloadable**: yes

Comma-separated list of table directory names (for example, `my_table~3`) whose
WAL transactions the apply job must not apply, keeping them "hard suspended".
Directory names are matched rather than logical names, so the suspension follows
the physical table across a rename, and a new table that reuses the name is
unaffected. This is the static counterpart to `ALTER TABLE ... SUSPEND WAL`,
whose runtime set is tracked separately. A table listed here stays suspended
until it is removed from the list.

## cairo.wal.apply.suspended.write.denied

- **Default**: `false`
- **Reloadable**: yes

When enabled, tables suspended from WAL apply (through
`cairo.wal.apply.suspended.tables` or `ALTER TABLE ... SUSPEND WAL`) also reject
new WAL writes with a distinct error, similar to writing to a dropped table.
When disabled, suspension only excludes the table from WAL apply while writes
keep buffering for later. Must be enabled to use
[`ALTER TABLE ... REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/), so that
suspension makes the table quiescent.

## cairo.wal.max.lag.txn.count

- **Default**: `20`
- **Reloadable**: no

Maximum number of transactions that can be kept invisible when writing to a
WAL table. Once reached, a full commit occurs. If not set, defaults to the
rounded value of `cairo.wal.squash.uncommitted.rows.multiplier`.

## cairo.wal.purge.interval

- **Default**: `30000`
- **Reloadable**: no

Period in milliseconds of how often WAL-applied files are cleaned up from
disk.

## cairo.wal.segment.rollover.row.count

- **Default**: `200000`
- **Reloadable**: no

Number of rows written to the same WAL segment before starting a new segment.
Triggers in conjunction with `cairo.wal.segment.rollover.size` (whichever
threshold is reached first).

## cairo.wal.squash.uncommitted.rows.multiplier

- **Default**: `20.0`
- **Reloadable**: no

Multiplier for `cairo.max.uncommitted.rows` limiting invisible WAL rows under heavy load;
lower values can increase O3 commits, while higher values can increase memory use and latency.
It sizes blocks only when `cairo.wal.apply.block.size=0`.

## wal.apply.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-separated list of CPU core indexes, one per WAL apply worker.

## wal.apply.worker.count

- **Default**: `2` on hosts with up to 8 CPU cores, `3` on up to 32 cores, `4`
  on larger hosts
- **Reloadable**: no

Number of dedicated worker threads assigned to handle WAL table data.

## wal.apply.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs.
