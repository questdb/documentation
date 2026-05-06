---
title: WAL table configurations
description: Configuration settings for WAL tables in QuestDB.
---

These settings control the Write-Ahead Log (WAL) subsystem, including parallel
apply threads, segment rollover, commit squashing, and cleanup of applied WAL
files.

## cairo.wal.apply.parallel.sql.enabled

- **Default**: `true`
- **Reloadable**: no

When disabled, SQL executed by the WAL apply job always runs single-threaded.

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

Multiplier applied to `cairo.max.uncommitted.rows` to calculate the limit of
rows that can be kept invisible when writing to a WAL table under heavy load,
when multiple transactions are being applied. This reduces the number of
out-of-order (O3) commits by squashing multiple commits together. Setting it
too low can increase O3 commit frequency and decrease throughput. Setting it
too high may cause excessive memory usage and increase latency.

## wal.apply.worker.affinity

- **Default**: equal to the CPU core count
- **Reloadable**: no

Comma-separated list of CPU core indexes.

## wal.apply.worker.count

- **Default**: equal to the CPU core count
- **Reloadable**: no

Number of dedicated worker threads assigned to handle WAL table data.

## wal.apply.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs.
