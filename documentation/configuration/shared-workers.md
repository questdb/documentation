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

## CPU-socket-local network pools

By default, any worker thread of a given thread pool can run on any CPU core.
Normally this is beneficial because it helps balance the total CPU load across
cores. There is some cost to it as well: the shared RAM locations every worker
often touches must move across core-local caches every time any of the parallel
threads touches it. One important case is the IO Dispatcher, a task deployed to
all the threads of a pool, but only one thread can run it at a time. Threads
coordinate over a shared RAM location that holds the state of a mutex lock.

This becomes especially problematic on a dual-socket server machine: by default,
threads are spread out across both sockets, and the same IO dispatcher task runs
on all of them, trying to acquire the lock and serve a batch of network IO
events. The cache line carrying the lock's data is forced to travel there and
back across the socket's bridge millions of times per second, doing no work.

QuestDB offers an option to split a thread pool into groups, so that each group
stays local to a CPU socket, and gets its own IO dispatcher. This only works on
Linux.

Depending on your configuration, there may be one or more thread pools that
handle network traffic. By default, only one shared network pool handles
everything, but you can also enable dedicated HTTP, PostgreSQL Wire, and ILP/TCP
pools. For each of these there's a separate config option to enable splitting
it:

| Pool | Key |
|------|-----|
| Shared network pool | `shared.network.worker.split.by.cpu.socket` |
| HTTP pool, when `http.worker.count` is above `0` | `http.worker.split.by.cpu.socket` |
| PostgreSQL wire pool, when `pg.worker.count` is above `0` | `pg.worker.split.by.cpu.socket` |
| ILP/TCP IO pool, when `line.tcp.io.worker.count` is above `0` | `line.tcp.io.worker.split.by.cpu.socket` |

### Placement

QuestDB places each pool that has splitting enabled either on one CPU socket or
split across CPU sockets, never unconstrained. Splitting a pool that fits on one
socket isn't beneficial: it leaves a smaller thread group on each side, and any
imbalance could overwhelm one side while the other is sitting idle. These are
the rules:

- If the pool's worker count fits a single socket's core count, the pool is
  placed entirely on one socket.
- Otherwise, the pool is split into one group per CPU socket. On a machine with
  more than two sockets, it splits across only as many sockets as it needs: a
  pool that fits two sockets' cores splits across two.
- The shared network pool configured to run the parallel query jobs
  (`shared.query.worker.count=0`) always splits across every CPU socket, so that
  queries keep every CPU socket's memory bandwidth.

QuestDB places the pools largest first, each on the CPU sockets with the fewest
workers placed so far. Ties go to
[`net.worker.preferred.cpu.socket`](#networkerpreferredcpusocket), then to the
lowest socket ID.

### Sizing

On a machine with two CPU sockets of 48 cores each, a pool of up to 48 workers
runs on one CPU socket, and a larger pool splits. With SMT (hyperthreading) on,
count hardware threads instead of cores.

QuestDB doesn't check that the combined total number of workers constrained to a
CPU socket fits its cores: a 64-worker HTTP pool and a 16-worker PostgreSQL wire
pool put 32 + 16 = 48 workers on CPU socket 0 and 32 on CPU socket 1.

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
stay on its CPU socket. The pool's fiber limits divide across the groups in
proportion to their workers.

### Limitations

On a split pool, some work runs on the workers of every group:

- A server bound to port `0` gets a single dispatcher, because each group's
  listener would get a different ephemeral port.
- On the shared network pool, ILP and QWP over UDP, and the background jobs the
  pool runs, including the parallel query jobs when
  `shared.query.worker.count=0`.

QuestDB leaves every pool as it is, and logs why, on a single CPU socket or when
the detected CPU layout doesn't look like real hardware: an unreadable topology,
many tiny CPU sockets, CPU sockets sharing a NUMA node, or lopsided cpusets.
Setting a pool's affinity key together with its split key fails startup.

## net.worker.preferred.cpu.socket

- **Default**: none
- **Reloadable**: no

The CPU socket that QuestDB fills first when it places pools, by the ID the
kernel reports in
`/sys/devices/system/cpu/cpu<N>/topology/physical_package_id`. IDs need not be
contiguous: under a cpuset, the allowed cores can sit on CPU sockets 0 and 3.
When empty, QuestDB uses the lowest ID. When a split key has a pool to place,
startup fails if this CPU socket doesn't exist or none of its cores is allowed.
See [CPU-socket-local network pools](#cpu-socket-local-network-pools).

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

## shared.network.worker.split.by.cpu.socket

- **Default**: `false`
- **Reloadable**: no

Linux only. Makes the shared network pool CPU-socket-local while it hosts an
enabled HTTP, PostgreSQL wire or ILP/TCP server. Can't be combined with
`shared.network.worker.affinity`. See
[CPU-socket-local network pools](#cpu-socket-local-network-pools).

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
