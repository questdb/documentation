---
title: Materialized views
description: Configuration settings for materialized views in QuestDB.
---

These settings control materialized view SQL support and the background refresh
job. Materialized views can use dedicated worker threads or share the server's
common pool.

## cairo.mat.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for materialized views.

## cairo.mat.view.parallel.sql.enabled

- **Default**: `true`
- **Reloadable**: no

When disabled, SQL executed by the materialized view refresh job always runs
single-threaded.

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
