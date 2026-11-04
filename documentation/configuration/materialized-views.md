---
title: Materialized views
description:
  Materialized view configuration in QuestDB, covering refresh workers, parallel
  SQL, and the retry limits that govern out-of-memory and busy refresh failures.
---

These settings control materialized view SQL support, background refresh, and
row-expiry cleanup. Materialized views refresh on a dedicated worker pool sized
by [`mat.view.refresh.worker.count`](#matviewrefreshworkercount); `0` disables
refresh. Row-expiry cleanup runs on the
[write pool](/docs/configuration/shared-workers/), so it keeps running when
refresh is disabled.

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

- **Default**: none
- **Reloadable**: no

Comma-separated list of numerical CPU core indexes, one per refresh worker.

## mat.view.refresh.worker.count

- **Default**: `2` on hosts with up to 8 CPU cores, `3` on up to 32 cores, `4`
  on larger hosts. This is the same CPU-based default as
  [`wal.apply.worker.count`](/docs/configuration/wal/#walapplyworkercount);
  setting that key does not change this one.
- **Reloadable**: no

Number of dedicated worker threads assigned to refresh materialized views. A
value of `0` disables materialized view refresh: `CREATE MATERIALIZED VIEW`
still succeeds, but nothing refreshes the view. Live views use their own pool,
sized by
[`live.view.refresh.worker.count`](/docs/configuration/live-views/#liveviewrefreshworkercount).

## mat.view.refresh.worker.fiber.enabled

- **Default**: `true`
- **Reloadable**: no

Runs the materialized view refresh pool in Fiber mode, where work can suspend
and release its worker instead of holding it until it finishes. Setting this to
`false` puts the pool in legacy mode.

Unlike the pools that serve user queries, this one is not a prerequisite for
QuestDB Enterprise [resource groups](/docs/concepts/resource-groups/), because
materialized view refresh runs outside them.

## mat.view.refresh.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

Flag that indicates if the worker thread must stop when an unexpected error
occurs.
