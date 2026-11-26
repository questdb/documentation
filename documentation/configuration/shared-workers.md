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

## Network worker groups

Every network request passes through its server's IO dispatcher twice: once
when the request arrives, and once when its connection goes back to waiting for
the next request. The IO dispatcher is a task deployed to all the threads of a
pool, but only one thread can run it at a time. Threads coordinate over a shared
RAM location that holds the state of a mutex lock. Because of that, one IO
dispatcher caps the throughput of a server, however many threads its pool has.

QuestDB offers an option to split a network thread pool into groups, each with
its own IO dispatcher in every server that runs on the pool. The dispatchers run
in parallel, so splitting raises throughput even on a machine with a single CPU
socket. This only works on Linux.

By default, any worker thread of a given thread pool can run on any CPU core.
Normally this is beneficial because it helps balance the total CPU load across
cores. There is some cost to it as well: the shared RAM locations every worker
often touches must move across core-local caches every time any of the parallel
threads touches it. This is especially costly on a dual-socket server machine,
where the cache lines carrying the dispatcher's lock and data travel across the
sockets' bridge. On such a machine, QuestDB can confine each group to one CPU
socket, as [Placement](#placement) describes.

Depending on your configuration, there may be one or more thread pools that
handle network traffic. By default, only one shared network pool handles
everything, but you can also enable dedicated HTTP, PostgreSQL Wire, and ILP/TCP
pools. Each of them has its own group count:

| Pool | Key |
|------|-----|
| Shared network pool | `shared.network.worker.groups` |
| HTTP pool, when `http.worker.count` is above `0` | `http.worker.groups` |
| PostgreSQL wire pool, when `pg.worker.count` is above `0` | `pg.worker.groups` |
| ILP/TCP IO pool, when `line.tcp.io.worker.count` is above `0` | `line.tcp.io.worker.groups` |

A group count of `1`, the default, leaves the pool unsplit. A group count on a
pool that serves no server has no effect, and QuestDB logs why: the shared
network pool's count when every server has a pool of its own or is disabled, and
a dedicated pool's count when its worker count is `0`, which runs the server on
the shared network pool.

### Sizing

Each group needs at least 8 workers, and a pool splits into at most 16 groups.
QuestDB reduces a group count that the pool's workers can't fill, and logs the
reduction. A pool of fewer than 16 workers stays unsplit.

On a single CPU socket of 32 cores, a 32-worker shared network pool with
`shared.network.worker.groups=2` runs two groups of 16 workers, each on any
core.

### Placement

On a machine with several CPU sockets, QuestDB confines each group to one CPU
socket when the group count divides evenly over the CPU sockets: the first
groups go to the first CPU socket, and so on. On two CPU sockets of 48 cores
each, a 96-worker HTTP pool with `http.worker.groups=2` runs 48 workers on each
CPU socket, and with `http.worker.groups=4`, two groups of 24 on each. With SMT
(hyperthreading) on, count hardware threads instead of cores.

In these cases the groups run on any core, and QuestDB logs which one applies:

- The machine, or the cpuset QuestDB runs in, has a single CPU socket.
- The group count doesn't divide evenly over the CPU sockets, for example 3
  groups on 2 CPU sockets.
- The detected CPU layout doesn't look like real hardware: an unreadable
  topology, many tiny CPU sockets, CPU sockets sharing a NUMA node, or lopsided
  cpusets.
- The pool's affinity key is set, which keeps each worker on the core it names.

Threads that a worker starts run on the same cores as the worker. With groups
confined to CPU sockets, a large `ORDER BY` over HTTP or PostgreSQL sorts on one
CPU socket's cores.

### Connections on a split pool

The groups of a split pool share each server's port through `SO_REUSEPORT`:

- The kernel spreads new connections over the groups by a hash, not by load.
- `http.net.connection.limit`, `pg.net.connection.limit` and
  `line.tcp.net.connection.limit` apply per group, so a server can hold up to
  the limit times the group count.
- A group at its connection limit stops accepting, but the kernel keeps sending
  it its share of new connections. They wait in its backlog until one of its
  connections closes or the server's `net.connection.queue.timeout` passes.
  Then the group closes its listener, which refuses the waiting connections,
  and new connections go to the other groups until it reopens.
- Another process of the same user that also sets `SO_REUSEPORT` could join
  the port.

In Fiber mode, each group has its own fiber runtime, so a connection's fibers
stay in its group, and on its CPU socket when the groups are confined to CPU
sockets. The pool's fiber limits divide across the groups in proportion to
their workers.

With QuestDB Enterprise [resource groups](/docs/concepts/resource-groups/), each
group has an execution domain of its own, so CPU weights apply within a group,
not across the pool.

### Limitations

On a split pool, some work runs on the workers of every group:

- A server bound to port `0` gets a single dispatcher, because each group's
  listener would get a different ephemeral port.
- On the shared network pool, ILP and QWP over UDP, and the background jobs the
  pool runs, including the parallel query jobs when
  `shared.query.worker.count=0`.

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

## shared.network.worker.fiber.enabled

- **Default**: `true`
- **Reloadable**: no

Runs the network pool in Fiber mode, where a query can suspend and release its
worker instead of holding it until it finishes. Setting this to `false` puts the
pool in legacy mode.

QuestDB Enterprise [resource groups](/docs/concepts/resource-groups/) require
Fiber mode on every pool that executes SQL. HTTP and PostgreSQL run on this pool
whenever their own worker counts are zero, which is the default, so this is
usually the setting that matters. With the pool in legacy mode, resource groups
left at their default disable themselves at startup and log the pool and setting
responsible, while `resource.groups.enabled=true` set explicitly fails startup.

## shared.network.worker.groups

- **Default**: `1`
- **Reloadable**: no

Linux only. The number of worker groups the shared network pool splits into
while it hosts an enabled HTTP, PostgreSQL wire or ILP/TCP server, each group
with its own IO dispatcher. See [Network worker groups](#network-worker-groups).

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

## shared.query.worker.fiber.enabled

- **Default**: `true`
- **Reloadable**: no

Runs the query pool in Fiber mode, where parallel query work can suspend and
release its worker instead of holding it until it finishes. Setting this to
`false` puts the pool in legacy mode.

QuestDB Enterprise [resource groups](/docs/concepts/resource-groups/) require
Fiber mode here whenever this pool has workers and HTTP or PostgreSQL is
enabled. A query pool set to zero workers turns parallel SQL off and needs no
check of its own.

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
