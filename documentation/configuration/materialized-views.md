---
title: Materialized views
description:
  Materialized view configuration in QuestDB, covering refresh workers, parallel
  SQL, and the retry limits that govern out-of-memory and busy refresh failures.
---

These settings control materialized view SQL support, background refresh, and
row-expiry cleanup. Materialized views can use their own worker threads or share
the server's common pool.

To cap the native memory a single refresh may allocate, see
[`cairo.mat.view.refresh.memory.limit.bytes`](/docs/configuration/cairo-engine/#memory-limits).

## cairo.mat.view.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables SQL support and the refresh job for materialized views.

## cairo.mat.view.max.refresh.retries

- **Default**: `10`
- **Reloadable**: yes

Maximum number of immediate retries within a single refresh attempt. A retry
happens when the base table changes structurally during the refresh, when a
refresh step produces an oversized transaction, or when a step fails with an
out-of-memory error, including a breach of the
[refresh memory limit](/docs/configuration/cairo-engine/#memory-limits).
Retries after an oversized transaction or an out-of-memory error shrink the
refresh interval step; a retry after a structural change recompiles the view
with the same step, and if it keeps failing the refresh is queued again. Once
the out-of-memory retries are exhausted or the step cannot shrink further, the
error propagates and the deferred retries governed by
`cairo.mat.view.refresh.busy.retry.limit` take over.

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

## cairo.mat.view.row.expiry.cleanup.enabled

- **Default**: `true`
- **Reloadable**: no

Turns on the background job that frees disk for rows removed by an eligible
[`EXPIRE ROWS`](/docs/concepts/expire-rows/) policy. Turning the job off does not
turn off read filtering, so expired rows stay hidden from query results either
way.

## cairo.mat.view.row.expiry.cleanup.min.expired.fraction

- **Default**: `0.5`
- **Reloadable**: no

How large the share of expired rows in a partition must be before the background
cleanup job rewrites that partly-expired partition to reclaim the space. Set this
to `0` to rewrite as soon as any row expires, or to `1` to turn off rewriting of
partly-expired partitions. Fully expired partitions are still removed.

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
