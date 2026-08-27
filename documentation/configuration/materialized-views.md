---
title: Materialized views
description: Configuration settings for materialized views in QuestDB.
---

These settings control materialized view SQL support, background refresh, and
row-expiry cleanup. Materialized views can use dedicated worker threads or share
the server's common pool.

## cairo.mat.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for materialized views.

## cairo.mat.view.parallel.sql.enabled

- **Default**: `true`
- **Reloadable**: no

When disabled, SQL executed by the materialized view refresh job always runs
single-threaded.

## cairo.mat.view.row.expiry.cleanup.enabled

- **Default**: `true`
- **Reloadable**: no

Enables the background job that reclaims rows removed by an eligible
[`EXPIRE ROWS`](/docs/concepts/expire-rows/) policy. Disabling the job does not
disable read filtering, so expired rows remain hidden from query results.

## cairo.mat.view.row.expiry.cleanup.min.expired.fraction

- **Default**: `0.5`
- **Reloadable**: no

Minimum fraction of expired rows required before the background cleanup job
compacts a partially expired partition. Set this property to `0` to compact on
the first expired row, or to `1` to disable partial-partition compaction. Fully
expired partitions are still removed.

## mat.view.refresh.worker.affinity

- **Default**: equal to the CPU core count
- **Reloadable**: no

Comma-separated list of numerical CPU core indexes.

## mat.view.refresh.worker.count

- **Default**: `0`
- **Reloadable**: no

Number of dedicated worker threads assigned to refresh materialized views.
When `0`, uses the shared worker pool.

## mat.view.refresh.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs.
