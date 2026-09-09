---
title: Materialized views
description: Configuration settings for materialized views in QuestDB.
---

These settings control materialized view SQL support and the background refresh
job. Materialized views can use dedicated worker threads or share the server's
common pool.

To cap the native memory a single refresh may allocate, see
[`cairo.mat.view.refresh.memory.limit.bytes`](/docs/configuration/cairo-engine/#memory-limits).

## cairo.mat.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for materialized views.

## cairo.mat.view.parallel.sql.enabled

- **Default**: `true`
- **Reloadable**: no

When disabled, SQL executed by the materialized view refresh job always runs
single-threaded.

## cairo.mat.view.refresh.busy.retry.limit

- **Default**: `10`
- **Reloadable**: no

Maximum number of deferred retries after an incremental or scheduled period
refresh fails with a transient error. If all retries fail, the view is
invalidated. A successful refresh resets the counter; `0` disables deferred
retries.

Transient errors include a busy base table or view and out-of-memory errors,
including breaches of the
[refresh memory limit](/docs/configuration/cairo-engine/#memory-limits). Full
refreshes and user-requested `REFRESH ... RANGE FROM ... TO ...` do not use these
deferred retries.

## cairo.mat.view.refresh.busy.retry.timeout

- **Default**: `1000`
- **Reloadable**: no

Delay in milliseconds before a deferred retry for an incremental or scheduled
period refresh. The retry is timer-driven and does not block a refresh worker.
The deprecated `cairo.mat.view.refresh.oom.retry.timeout` key is accepted but
has no effect; deferred out-of-memory retries use this backoff.

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
