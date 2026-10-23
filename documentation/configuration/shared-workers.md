---
title: Shared workers
description: Configuration settings for QuestDB worker thread pools.
---

QuestDB distributes work across three specialized thread pools. Each pool can
be sized independently, letting you balance CPU resources between network I/O,
query execution, and write operations based on your workload profile.

- **Network pool**: handles HTTP, PostgreSQL, and ILP server I/O
- **Query pool**: executes parallel query operations, such as filters, GROUP BY
  and SAMPLE BY, GROUP BY over hash joins, HORIZON JOIN and WINDOW JOIN
- **Write pool**: manages table writes and housekeeping tasks, and WAL apply
  jobs when `wal.apply.worker.count` is `0`

All three pools use the same default sizing formula, which scales with the
number of available CPUs:

| CPU count | Default threads per pool |
|-----------|--------------------------|
| > 32      | `max(2, CPU count - 2)`  |
| > 16      | `max(2, CPU count - 1)`  |
| ≤ 16      | `max(2, CPU count)`      |

On a typical 8-core machine, each pool defaults to 8 threads. On a 64-core
server, each pool gets 62 threads. Adjust these values when you need to shift
CPU capacity toward a specific workload, for example reducing the network pool
and increasing the query pool on a read-heavy system.

## Dedicated pools

WAL apply, materialized view refresh, and live view refresh run on their own
pools, not on the write pool. Each is sized by its own key:
[`wal.apply.worker.count`](/docs/configuration/wal/#walapplyworkercount),
[`mat.view.refresh.worker.count`](/docs/configuration/materialized-views/#matviewrefreshworkercount),
and
[`live.view.refresh.worker.count`](/docs/configuration/live-views/#liveviewrefreshworkercount).
Each defaults to `2` on hosts with up to 8 CPU cores, `3` on up to 32 cores, and
`4` on larger hosts. Setting `wal.apply.worker.count` to `0` moves WAL apply to
the write pool, while `0` for either refresh pool disables that refresh.

## shared.network.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-delimited list of CPU ids, one per thread specified in
`shared.network.worker.count`. By default, threads have no CPU affinity.
Pinning threads to specific cores can reduce context-switch overhead on
NUMA systems.

## shared.network.worker.count

- **Default**: see table above
- **Reloadable**: no

Number of worker threads for the network pool, which handles HTTP, PostgreSQL,
and ILP server I/O. Increasing this value raises network I/O parallelism at
the expense of CPU resources available to queries and writes.

## shared.query.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-delimited list of CPU ids, one per thread specified in
`shared.query.worker.count`. By default, threads have no CPU affinity.

## shared.query.worker.count

- **Default**: see table above
- **Reloadable**: no

Number of worker threads for the query pool, which executes parallel query
operations such as filters, GROUP BY and SAMPLE BY,
[GROUP BY over hash joins](/docs/configuration/cairo-engine/#parallel-group-by-over-hash-joins),
[HORIZON JOIN](/docs/query/sql/horizon-join/#parallel-execution) and
[WINDOW JOIN](/docs/query/sql/window-join/). Increasing this value raises query
parallelism at the expense of CPU resources available to network I/O and
writes.

## shared.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

When enabled, a worker thread stops if it encounters an unexpected error.
Intended for debugging. In production, leave this disabled so that transient
errors do not reduce the size of a thread pool.

## shared.write.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-delimited list of CPU ids, one per thread specified in
`shared.write.worker.count`. By default, threads have no CPU affinity.

## shared.write.worker.count

- **Default**: see table above
- **Reloadable**: no

Number of worker threads for the write pool, which manages table writes and
housekeeping tasks, and WAL apply jobs when `wal.apply.worker.count` is `0`.
Increasing this value raises write parallelism at the expense of CPU resources
available to network I/O and queries. See [Dedicated pools](#dedicated-pools)
for the WAL apply and view refresh pools.
