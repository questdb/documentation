---
title: Shared workers
description: Configuration settings for QuestDB worker thread pools.
---

QuestDB distributes work across three specialized thread pools. Each pool can
be sized independently, letting you balance CPU resources between network I/O,
query execution, and write operations based on your workload profile.

- **Network pool**: handles HTTP, PostgreSQL, and ILP server I/O
- **Query pool**: executes parallel query operations (filters, group-by)
- **Write pool**: manages WAL apply jobs, table writes, materialized view
  refresh, and housekeeping tasks

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

The pools run at different thread priorities so the server stays responsive
under load: the network pool is one step above normal, the query pool is at
normal, and the write pool is one step below.

## Settings inherited from the legacy shared pool

Before the split into three pools, QuestDB ran a single shared pool configured
through the `shared.worker.*` keys. Those keys still work and act as the
defaults for all three pools.

:::note

`shared.worker.count` sets the default size of **each** pool, not a total to be
divided between them. On a configuration carried over from a single-pool
release, `shared.worker.count=8` yields 8 network threads, 8 query threads and
8 write threads, so 24 in total. Set `shared.network.worker.count`,
`shared.query.worker.count` and `shared.write.worker.count` explicitly when you
need to cap the total.

:::

The remaining `shared.worker.*` settings below have no per-pool equivalent:
they apply to all three pools at once.

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
operations such as filters and group-by. Increasing this value raises query
parallelism at the expense of CPU resources available to network I/O and
writes.

## shared.worker.count

- **Default**: see table above
- **Reloadable**: no

Default number of worker threads for each of the three pools. Overridden per
pool by `shared.network.worker.count`, `shared.query.worker.count` and
`shared.write.worker.count`. Kept for compatibility with single-pool
configurations.

## shared.worker.haltOnError

- **Default**: `false`
- **Reloadable**: no

When enabled, a worker thread stops if it encounters an unexpected error.
Intended for debugging. In production, leave this disabled so that transient
errors do not reduce the size of a thread pool.

## shared.worker.nap.threshold

- **Default**: `7000`
- **Reloadable**: no

Number of idle cycles after which a worker thread yields to other threads with
a short pause. Applies to all three pools.

## shared.worker.sleep.threshold

- **Default**: `10000`
- **Reloadable**: no

Number of idle cycles after which a worker thread goes to sleep, waking on
`shared.worker.sleep.timeout`. Lower values reduce idle CPU use at the cost of
a slower response to the next task. Applies to all three pools.

## shared.worker.sleep.timeout

- **Default**: `10`
- **Reloadable**: no

Time in milliseconds a sleeping worker thread waits before checking for work
again. Applies to all three pools.

## shared.worker.yield.threshold

- **Default**: `10`
- **Reloadable**: no

Number of idle cycles after which a worker thread yields its CPU time slice.
Applies to all three pools.

## shared.write.worker.affinity

- **Default**: none
- **Reloadable**: no

Comma-delimited list of CPU ids, one per thread specified in
`shared.write.worker.count`. By default, threads have no CPU affinity.

## shared.write.worker.count

- **Default**: see table above
- **Reloadable**: no

Number of worker threads for the write pool, which manages WAL apply jobs,
table writes, materialized view refresh, and housekeeping tasks. Increasing
this value raises write parallelism at the expense of CPU resources available
to network I/O and queries.
