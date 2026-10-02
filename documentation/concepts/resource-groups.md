---
title: Resource groups
sidebar_label: Resource groups
description:
  Resource groups isolate query workloads inside one QuestDB instance. Learn how
  a query is assigned to a group, and what admission, CPU weight and memory
  limits actually guarantee.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

A resource group is a named policy that limits what a set of principals may
consume while their queries run. One instance typically serves several workloads
at once: dashboards that must answer in milliseconds, an ad-hoc analyst, and a
nightly report that scans a year of data. When these workloads compete without
resource controls, the report can increase dashboard latency.
[Common scenarios](/docs/operations/resource-groups/#common-scenarios) walks
through that case and five others as policies you can copy.

Creating one takes two statements:
[`CREATE RESOURCE GROUP`](/docs/query/sql/acl/create-resource-group/) for the
policy, and a mapping that puts principals under it.

```questdb-sql title="Half the default CPU share, four concurrent queries, and a 2 GiB memory budget"
CREATE RESOURCE GROUP reporting WITH (
    cpu_weight = 50,
    max_active_queries = 4,
    memory_limit = '2G'
);

ALTER USER analyst SET RESOURCE GROUP reporting;
```

A policy sets three controls, and they differ in how strong a guarantee they
give:

- [Admission](#admission-is-a-hard-gate) is how many queries a group may run at
  once, how many may wait, and how long they may wait. It is an exact limit.
- [Weighted CPU](#cpu-weight-is-a-share-not-a-reservation) is the share of query
  CPU a group receives while groups compete. It is a share, not a reservation.
- [Memory](#memory-limits-use-batched-accounting) is the process and group
  budgets for tracked native query memory. It is approximate at the margin.

The design is [cooperative](#how-cooperative-cpu-scheduling-works). QuestDB
executes query work on shared worker pools, and resource groups do not create
one operating-system thread pool per group. A query and all of its parallel
tasks use the same resource group, while every worker stays available to every
group.

## Who a resource group applies to

A policy attaches to **principals**, and a principal is one of three things: a
user, an ACL group, or a service account. Assignment follows the authenticated
principal, not the statement.

```questdb-sql title="The three kinds of principal you can map"
ALTER USER analyst SET RESOURCE GROUP reporting;
ALTER GROUP analysts SET RESOURCE GROUP reporting MAPPING PRIORITY 10;
ALTER SERVICE ACCOUNT ingest_bot SET RESOURCE GROUP reporting;
```

Mapping an ACL group covers a team without naming each member. Only users
inherit a mapping this way, since only a user can belong to an ACL group, and a
mapping on the user itself beats the one it would inherit. Each clause is
documented with the statement it belongs to:
[`ALTER USER`](/docs/query/sql/acl/alter-user-set-resource-group/),
[`ALTER GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/) and
[`ALTER SERVICE ACCOUNT`](/docs/query/sql/acl/alter-service-account-set-resource-group/).

A user can belong to several ACL groups, so each ACL group mapping carries a
priority and the highest one wins:

```questdb-sql title="A user in both groups resolves to dashboards, the higher priority"
ALTER GROUP analysts SET RESOURCE GROUP adhoc MAPPING PRIORITY 10;
ALTER GROUP oncall SET RESOURCE GROUP dashboards MAPPING PRIORITY 20;
```

:::note

If two ACL groups carry the same priority, the tie breaks on whichever resource
group was created first. That is rarely what anyone intends, so give ACL group
mappings distinct priorities when the order matters.

:::

Anything not mapped runs in `DEFAULT`, which always exists and carries no limits
of its own: a CPU weight of 100, unlimited admission, and the instance-wide
memory limits. You can change its policy, but you cannot drop or rename it.

A session that assumes a service account keeps the group of the principal that
logged in, while the service account's own mapping applies to sessions that
authenticate as that account.

The group is resolved once, when the query starts, and stays fixed for the
statement's lifetime. Changing a mapping affects statements that start after the
change, never one already running.

## Which statements are managed

Resource groups govern the statements that read data:

- `SELECT`
- the source query of `CREATE TABLE ... AS SELECT` and `INSERT ... SELECT`
- query exports

Everything else runs outside the feature and consumes no admission slot, CPU
grant or group memory budget: `EXPLAIN`, value `INSERT`, `UPDATE`, ordinary DDL,
`COPY`, transaction and session control, ILP and QWP ingestion, WAL apply,
materialized and live view refresh, and QuestDB's own internal SQL.

For `CREATE TABLE ... AS SELECT` and `INSERT ... SELECT` the group is charged
for reading the source and producing rows, including parallel work. Where
writing a row cannot be separated from producing it, that CPU is charged to the
group as well. The commit, durability and any work handed to writer or WAL
queues are outside the guarantee.

Resource groups account **tracked native query memory**. They do not represent
JVM heap, resident set size, memory-mapped table pages or long-lived engine
caches. Existing process memory protection remains the outer boundary.

## What each control guarantees

### Admission is a hard gate

```questdb-sql title="At most four running, 32 more waiting, and no wait longer than 15 seconds"
CREATE RESOURCE GROUP reporting WITH (
    max_active_queries = 4,
    max_queued_queries = 32,
    queue_timeout = '15s'
);
```

`max_active_queries` is an exact count. A group at its limit queues the next
query until a slot frees, up to `max_queued_queries`; beyond that the query is
rejected immediately. A queued query that waits longer than `queue_timeout`
fails, and the instance-wide `query.timeout` keeps running while it waits, so
whichever of the two expires first ends the wait.

A slot is held only while the query is running on a worker. A protocol cursor
that is suspended between pages releases its slot and passes through the gate
again when the client asks for more rows, so a paging client does not hold
capacity while the application thinks. The consequence is that admission can be
refused on a later page: a client that received its first rows may still see the
queue-full or timeout error when it asks for more, and the connection stays
usable.

### CPU weight is a share, not a reservation

```questdb-sql title="Dashboards get twice the CPU of ad-hoc work while both are busy"
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 100);
CREATE RESOURCE GROUP adhoc WITH (cpu_weight = 50);
```

Weights only matter when groups compete. A group that is alone on the instance
uses everything it can, regardless of its weight. When two groups both have
work, the scheduler hands out CPU so that measured CPU divided by `cpu_weight`
stays balanced: weights 100 and 50 converge to a 2:1 split of query CPU. A query
that was running alone starts sharing at its next checkpoint.

Weights are relative. 100 and 50 are the same as 2 and 1. A group that becomes
active starts level with the groups already running, so it neither banks the CPU
it did not use while idle nor is punished for having been busy.

Shares are between groups, not between queries. Within a group, work is served
in arrival order, and a parallel query can hold several places in that order, so
there is no promise of equal CPU between individual queries.

### Memory limits use batched accounting

```questdb-sql title="Everything this group runs at once must fit in 8 GiB"
CREATE RESOURCE GROUP reporting WITH (memory_limit = '8G');
```

Accounting has three levels: query, group and process. Allocation and release
deltas accumulate on the executing worker and are published to the shared
counters in batches. Exceeding a checked limit fails the query with
`query memory limit exceeded`; it does not queue the allocation until memory
becomes available.

The single-query ceiling starts with the principal's effective query memory
limit, when set, or the instance default `cairo.query.memory.limit.bytes`. Any
group `memory_limit` and process memory budget further cap that ceiling. The
group budget also bounds the total tracked memory held by its queries; the
process budget covers tracked native query memory across groups.

An unset group `memory_limit`, or one set to `0` or `UNLIMITED`, adds no group
ceiling. A process budget of `0` adds no process ceiling. Existing single-query
limits still apply, and memory accounting remains enabled even when all limits
are unlimited.

The counters can temporarily omit worker-local deltas, so a group can briefly
overshoot its limit by less than 64 KiB per worker running its queries. These
budgets are not byte-exact, instantaneous ceilings.

## How cooperative CPU scheduling works

QuestDB does not preempt a running query. The scheduler grants a query a short
slice of CPU on a worker and expects it to reach a cooperative checkpoint, which
is the same circuit breaker check that makes queries cancellable. At that point
the query either renews its grant or yields the worker to another group.

A yielded worker runs other queries and, within a bounded window, returns to
accepting connections; the query that yielded resumes later. A long
single-threaded query that reaches these checkpoints therefore shares its worker
before finishing, which keeps the instance responsive while heavy queries run.

Two consequences follow.

The guarantee is statistical over a short window. Between checkpoints a query
holds its worker, so instantaneous CPU can deviate from the configured share.
The CPU actually used is charged either way, so a query that overran repays it
and the average is preserved.

A query that cannot reach a checkpoint keeps its worker. While CPU scheduling is
engaged its CPU is still charged when the slice ends, but no cooperative limit
can shorten that stretch.

Faults are contained rather than escalated. If the scheduler itself hits an
internal fault it degrades: queries keep running without CPU grants, admission
and memory limits stay enforced, and
`questdb_resource_groups_cpu_scheduler_degraded` reports `1` until the instance
restarts. A fault in one query affects only that query, leaving other queries
and other groups alone, and its CPU is still charged to its group.

### When scheduling engages

Slicing happens only while CPU scheduling is engaged, and that requires a second
resource group to exist. While `DEFAULT` is the only resource group, scheduling
stays disengaged: no CPU is sampled, no query yields, and every query holds its
worker exactly as it does with the feature disabled. Registration, admission and
memory accounting still run, so this is not free, but the cost is a fixed few
microseconds per query.

Scheduling engages when a second group is created and disengages once the last
other group has been dropped and its queries have finished. A query that is
already running when a group is created stays outside scheduling until it next
suspends or finishes; the new policy applies to queries that start or resume
after the change.

Once scheduling is engaged, a query whose group is alone still keeps its worker:
at each checkpoint it renews its grant in place and yields only when another
query is waiting for its worker.

Queries are assigned to a group throughout, whether or not scheduling is
engaged. Disengaged scheduling means no CPU slicing, not that the feature
stepped aside, so
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
returns `DEFAULT` on such an instance rather than `null`. `null` is reserved for
queries that were never admitted to a group at all, which happens when the
feature is disabled and on a replica whose catalog has not arrived. What does go
quiet is the CPU accounting: `cpu_nanos_total` and `cpu_wait_nanos_total` both
stay at `0` while scheduling is disengaged, because no CPU is sampled and no
query waits for a grant. Admission and memory counters keep working throughout.

## Replication and catalog lag {#behaviour-under-failure-and-on-replicas}

Group definitions and mappings live in a replicated system catalog, so a replica
receives them through normal replication. Three things follow while a replica is
behind.

**A replica that has never received the catalog runs its queries unmanaged.** No
admission slot, no CPU grant, no group memory budget, and
[`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
returns `null`. They are neither rejected nor quietly run under `DEFAULT`, and
they are counted in
`questdb_resource_groups_catalog_lag_unmanaged_queries_total`.

**A replica that is behind on a policy change keeps applying the policy it
has.** Once it has the catalog, its queries are managed against the snapshot it
holds, so a group whose weight you just changed keeps the old weight on that
replica until the change arrives. Nothing blocks or errors.

**A lagging replica cannot be promoted while the feature is enabled.** Promotion
validates the catalog before writes are admitted, because a node about to accept
writes must not enforce a policy it cannot see. The switch is refused and the
node keeps serving reads; wait for replication and retry. With the feature
disabled the condition is logged and the promotion proceeds. A primary that
predated resource groups may never have created the catalog table at all, in
which case the promoted node creates it and continues.

For the recovery steps, see
[troubleshooting](/docs/operations/resource-groups/#troubleshooting), and for how
a refused switch behaves in general, see
[refusals and the torn state](/docs/high-availability/failover/#refusals-and-the-torn-state).

## See also

- [Configure and use resource groups](/docs/operations/resource-groups/)
- [Resource groups configuration](/docs/configuration/resource-groups/)

Managing groups:

- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [ALTER RESOURCE GROUP](/docs/query/sql/acl/alter-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)

Mapping principals:

- [ALTER USER SET RESOURCE GROUP](/docs/query/sql/acl/alter-user-set-resource-group/)
  and [UNSET](/docs/query/sql/acl/alter-user-unset-resource-group/)
- [ALTER GROUP SET RESOURCE GROUP](/docs/query/sql/acl/alter-group-set-resource-group/)
  and [UNSET](/docs/query/sql/acl/alter-group-unset-resource-group/)
- [ALTER SERVICE ACCOUNT SET RESOURCE GROUP](/docs/query/sql/acl/alter-service-account-set-resource-group/)
  and [UNSET](/docs/query/sql/acl/alter-service-account-unset-resource-group/)

Inspecting:

- [`resource_groups()`](/docs/query/functions/meta/#resource_groups)
- [`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
- [Resource group metrics](/docs/operations/logging-metrics/#resource-group-metrics)
- [Role-based access control](/docs/security/rbac/)
