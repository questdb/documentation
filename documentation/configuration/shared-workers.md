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

Every network event passes through its server's IO dispatcher twice: once when a
data packet arrives, and again when its connection goes back to waiting for the
next event. The IO dispatcher is a task deployed to all the threads of a pool,
but only one thread can run it at a time. Threads coordinate over a shared RAM
location that holds the state of a mutex lock. On a large thread pool, this
can result in the IO dispatcher bottlenecking the server throughput.

QuestDB offers an option to split a network thread pool into groups, each with
its own IO dispatcher that runs in parallel with the others. This only works on
Linux.

Additionally, on a large machine with multiple CPU sockets, QuestDB prefers to
confine each worker group to a single CPU socket (see [Placement](#placement)).
We mentioned the mutex lock; in order to acquire it, the thread must take
exclusive ownership of the underlying cache line, and this implies data traffic
inside the CPU cache layer. If the previous owner was on another CPU socket,
data must travel across the socket bridge, which takes a lot of time. Confining
the entire worker group to a single socket avoids this.

Depending on your configuration, there may be one or more thread pools that
handle network traffic. By default, only one shared network pool handles
everything, but you can also enable dedicated HTTP, PostgreSQL Wire, and ILP/TCP
pools. Each of them has its own worker group count:

| Pool | Key |
|------|-----|
| Shared network pool | `shared.network.worker.groups` |
| HTTP pool, when `http.worker.count` is above `0` | `http.worker.groups` |
| PostgreSQL wire pool, when `pg.worker.count` is above `0` | `pg.worker.groups` |
| ILP/TCP IO pool, when `line.tcp.io.worker.count` is above `0` | `line.tcp.io.worker.groups` |

A group count of `1` (the default) leaves the pool unsplit; a count below `1` is
invalid and the server fails to start. If this is configured for a thread pool
that ends up not hosting a server, it has no effect. For example, HTTP might be
disabled by config, and then its dedicated pool wouldn't host any server.

### Sizing limits

There are two rules that limit the number of worker groups in a pool:

1. A group must have at least 8 workers.
2. A pool can't be split into more than 16 groups.

If the configured group count exceeds a limit, QuestDB automatically lowers
it so that it fits within the limits.

### Placement

On a machine with several CPU sockets, QuestDB prefers to confine each worker
group to one CPU socket, but some conditions must be met. In the following cases
the placement of a group's threads will not be confined, and the reason will
show up in the log on startup:

- All cores are already on a single CPU socket. QuestDB counts only the cores it
  is allowed to use. Various tools can restrict this: `taskset`, a cgroup
  cpuset, `docker --cpuset-cpus`, etc.
- The group count doesn't divide evenly over the CPU sockets, for example 3
  groups on 2 CPU sockets. Watch out for automatic group reduction: you may have
  asked for four groups, but QuestDB reduced it to three to fit the limits. This
  will result in three unconfined groups.
- The detected CPU layout doesn't look like real hardware, as on some virtual
  machines: QuestDB can't read the topology, finds more than 8 CPU sockets, a
  CPU socket with fewer than 8 allowed CPUs, a CPU without a NUMA node, or a
  NUMA node that spans two CPU sockets, or the CPU sockets' allowed CPU counts
  differ by more than 25%.
- The configuration enables a pool's thread affinity, which keeps each worker on
  the core it names.

### Examples

Example 1: a 12-worker pool can't be split. If you configure two or more
groups, QuestDB ignores this.

Example 2: a 32-worker pool with `shared.network.worker.groups=4` splits into
four groups of eight workers. If you configure more than four, you still get
exactly four groups.

Example 3: a 96-worker pool with `shared.network.worker.groups=4` splits into
four groups of 24 workers each. If this is on a dual-CPU socket machine, each
CPU socket runs two groups.

### Connections on a split pool

The groups of a split pool share each server's port through `SO_REUSEPORT`:

- The kernel spreads new connections over the groups by a hash, not by load.
- Max connection count (`*.net.connection.limit`) applies per group, so with
  four groups you're actually allowing four times the limit.
- A group at its connection limit stops accepting, but the kernel keeps sending
  it new connections. They wait in its backlog until one of its connections
  closes or the server's queue timeout passes
  (`*.net.connection.queue.timeout`). Then the group closes its listener, which
  refuses the waiting connections, and only then the new connections go to the
  other groups until it reopens.
- HTTP's soft limits per endpoint, such as `http.query.connection.limit` and
  `http.ilp.connection.limit`, still count connections across the whole server.
- QuestDB fails to start if another process already holds the port, as it does
  with an unsplit pool. After startup, another process of the same user that
  also sets `SO_REUSEPORT` can join the port and receive a share of its
  connections.

In Fiber mode, each group has its own fiber runtime, so a connection's fibers
stay in its group, and on its CPU socket when the groups are confined to CPU
sockets. The pool's fiber limits divide across the groups in proportion to
their workers. A busy group doesn't borrow workers or fiber capacity from an
idle one, so one group can saturate while another idles.

The fiber metrics report each group of a split pool on its own. Their Prometheus
samples carry a `group` label next to `worker_pool`, so summing by
`worker_pool` gives the pool's totals. In
[`sys.metrics`](/docs/operations/logging-metrics/#persisted-metrics), the column
names add the group to the pool name, for example
`worker_pool_fiber_live__shared_network_g0`.

With QuestDB Enterprise [resource groups](/docs/concepts/resource-groups/), each
worker group schedules its queries in an execution domain of its own. On a
split pool, a query competes for CPU only with the queries in its worker group,
so CPU weights apply within a worker group, not across the pool. A resource
group whose queries run in a quiet worker group gets that worker group's full
capacity, whatever its weight. CPU that a resource group uses in one worker
group still counts against it where it competes in another.

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
