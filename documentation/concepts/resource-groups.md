---
title: Resource groups
sidebar_label: Resource groups
description:
  Resource groups isolate query workloads inside one QuestDB instance. Learn how
  a query is assigned to a group, and what admission, CPU weights, CPU limits,
  scheduling policies and memory limits actually guarantee.
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
through that case and others as policies you can copy.

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

A policy sets four controls, and they differ in how strong a guarantee they
give:

- [Admission](#admission-is-a-hard-gate) is how many queries a group may run at
  once, how many may wait, and how long they may wait. It is an exact limit.
- [Weighted CPU](#cpu-weight-is-a-share-not-a-reservation) is the share of query
  CPU a group receives while groups compete. It is a share, not a reservation.
- [A CPU limit](#a-cpu-limit-is-a-ceiling-not-a-share) is the most query CPU a
  group may use, as a percentage of the node, even while the rest of the node
  is idle. It holds on average over a short window.
- [Memory](#memory-limits-use-batched-accounting) is the process and group
  budgets for tracked native query memory. It is approximate at the margin.

A group's
[scheduling policy](#the-scheduling-policy-divides-a-group-between-its-users)
then decides how the group divides what it receives between its own users and
queries.

The design is [cooperative](#how-cooperative-cpu-scheduling-works). QuestDB
executes query work on shared worker pools, and resource groups do not create
one operating-system thread pool per group. A query and its parallel tasks use
the same resource group, with one exception for
[`CREATE TABLE ... AS SELECT`](#which-statements-are-managed), while every
worker stays available to every group.

## Who a resource group applies to

A policy attaches to **principals**, and a principal is one of three things: a
user, an ACL group, or a service account. Assignment follows the authenticated
principal, not the statement, unless the session
[chooses another group](#choosing-a-group-per-session-or-request).

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
of its own: a CPU weight of 100, no CPU limit, `fifo` scheduling, unlimited
admission, and the instance-wide memory limits. You can change its policy, but you cannot drop or rename it.

A session that assumes a service account keeps the group of the principal that
logged in, while the service account's own mapping applies to sessions that
authenticate as that account.

The group is resolved once, when the query starts, and stays fixed for the
statement's lifetime. Changing a mapping affects statements that start after the
change, never one already running.

### Choosing a group per session or request

A mapping gives each principal one group, but one account often sends work of
different urgency, such as a monitoring account that evaluates alert rules and
also serves dashboards. Such an account can choose the group itself: a
PostgreSQL session with
[`SET RESOURCE GROUP`](/docs/query/sql/acl/set-resource-group/), and an HTTP
request with the `resource_group` parameter of
[`/execute`](/docs/connect/compatibility/rest-api/#execute).

```questdb-sql title="Run the rest of this session's queries in the alerts group"
SET RESOURCE GROUP alerts;
```

Choosing a group per session or request is available from QuestDB Enterprise
4.2.0. The chosen group replaces the mapping for every managed query the session
starts afterwards, until `RESET RESOURCE GROUP`, `RESET ALL` or `DISCARD ALL`,
or until the session ends. It covers only the session's or the request's own
queries: a `COPY ... TO` export, the `/exp` endpoint and clients that query over
QWP keep the mapped group. A group other than the principal's own requires the
`USE RESOURCE GROUP` permission, granted for one group with
[`GRANT USE ON RESOURCE GROUP`](/docs/query/sql/acl/grant/#grant-use-of-resource-groups)
or for every group with `GRANT USE RESOURCE GROUP`, so users cannot move
themselves into a heavier group. The permission is checked at the start of every
managed query, so a revoke applies to the session's next one.

With access control disabled there is no permission check, and since mapping
statements need access control, choosing the group per session or request is
then the only way to run queries outside `DEFAULT`.

## Which statements are managed

Resource groups govern the statements that read data:

- `SELECT`
- the source query of `CREATE TABLE ... AS SELECT` and `INSERT ... SELECT`
- query exports, including `COPY ... TO`

Everything else runs outside the feature and consumes no admission slot, CPU
grant or group memory budget: `EXPLAIN`, value `INSERT`, `UPDATE`, ordinary DDL,
`COPY` imports, transaction and session control, ILP and QWP ingestion, WAL
apply, materialized and live view refresh, and QuestDB's own internal SQL.

`CREATE TABLE ... AS SELECT` and `INSERT ... SELECT` charge the group for
reading the source and producing rows. For `INSERT ... SELECT` that includes its
parallel work. The parallel tasks of a `CREATE TABLE ... AS SELECT` run outside
the group and are not charged to it, unless the group has a CPU limit, in which
case the copy runs them itself on its own thread; see
[A CPU limit is a ceiling](#a-cpu-limit-is-a-ceiling-not-a-share). Where writing
a row cannot be separated from producing it, that CPU is charged to the group as
well. The commit, durability and any work handed to writer or WAL queues are
outside the guarantee.

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

A query keeps its slot for as long as it runs, including while it waits for a
worker or for its group's CPU budget, so a tight
[CPU limit](#a-cpu-limit-is-a-ceiling-not-a-share) also makes the admission
queue grow. A protocol cursor that is suspended between pages is the exception:
it releases its slot and passes through the gate again when the client asks for
more rows, so a paging client does not hold capacity while the application
thinks. The consequence is that admission can be
refused on a later page: a client that received its first rows may still see the
queue-full or timeout error when it asks for more, and the connection stays
usable.

### CPU weight is a share, not a reservation

```questdb-sql title="Dashboards get twice the CPU of ad-hoc work while both are busy"
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 100);
CREATE RESOURCE GROUP adhoc WITH (cpu_weight = 50);
```

Weights only matter when groups compete. A group that is alone on the instance
uses everything it can, regardless of its weight, unless it has a
[CPU limit](#a-cpu-limit-is-a-ceiling-not-a-share). When two groups both have
work, the scheduler hands out CPU so that measured CPU divided by `cpu_weight`
stays balanced: weights 100 and 50 converge to a 2:1 split of query CPU. A query
that was running alone starts sharing at its next checkpoint.

Weights are relative. 100 and 50 are the same as 2 and 1.
[`resource_groups()`](/docs/query/functions/meta/#resource_groups) shows each
weight as a percentage of all weights in `cpu_min_share_pct`: the share a group
can count on while every group has work, up to its CPU limit if it has one.
Adding a group lowers every other group's percentage, and the column shows by
how much.

From QuestDB Enterprise 4.2.0, idle CPU is not banked in either direction. A
group that becomes active takes the next free worker and then runs at its
share: it gains nothing for the time it left its share unused, and a group that
used the spare CPU meanwhile owes nothing for it. This holds however long the instance has been running. A
group's CPU is counted once for the whole process, so its queries over HTTP and
over PostgreSQL draw on the same share.

Shares are between groups, not between queries. How a group divides its share
between its own users and queries depends on its
[scheduling policy](#the-scheduling-policy-divides-a-group-between-its-users).

### A CPU limit is a ceiling, not a share

```questdb-sql title="Never more than a quarter of the node, even when it is idle"
CREATE RESOURCE GROUP tenant_a WITH (cpu_limit = '25%');
```

`cpu_limit` caps the query CPU a group may use at a percentage of the CPUs
available to the QuestDB process, which respects a container's CPU limit. On 16
CPUs, `'25%'` is 4 cores and `'5%'` is 0.8 of a core. A weight lets a group use
CPU that others leave idle; a limit does not, so the group stays at its limit
when the rest of the node has nothing to do. Use a limit for capacity sold by
the core, or to keep room for work outside resource groups, such as ingestion.
CPU limits are available from QuestDB Enterprise 4.2.0.

A limit only caps. Below it the group competes by weight as usual, so while
other groups are busy it can get less than its limit. To keep a group at its
limit under contention as well, give it a weight whose `cpu_min_share_pct` is at
least its `cpu_limit_pct`.

The limit holds on average over a short window, and it is enforced in two
parts:

- A group holds at most as many workers at once as its limit rounded up to
  whole cores, across every worker pool, apart from the one exception described
  below. A limit that comes to a whole number of cores needs nothing more,
  because a worker uses at most one core.
- A fractional limit, such as 0.8 or 3.5 cores, adds a CPU budget that refills
  at the limit's rate. The group can run ahead of the rate by about 100
  milliseconds' worth of it, and then waits until the budget has refilled. Idle
  time is not banked beyond that.

Only some percentages come to whole cores: `'25%'`, `'50%'`, `'75%'` and
`'100%'` on 16 CPUs, but only `'50%'` and `'100%'` on 14. `cpu_limit_cores` in
`resource_groups()` shows what a limit comes to. A whole-core limit has no
budget, so the budget behaviour described below does not apply to it: the group
cannot burst above its rate or carry debt, and only the exception for
statements that cannot give up their worker takes it past its cap. That makes a
whole-core limit the stricter choice for a hard cap.

Only the CPU that queries use on their workers counts. Work outside them, such
as garbage collection, JIT compilation and WAL apply, does not, so the process
can use more CPU in total than its groups' limits add up to.

Parallel work counts against the group like the rest of the query, with two
consequences:

- A group limited to one core or less runs a query's parallel work on the
  query's own thread, so its parallel queries run single-threaded.
- Above one core, a fractional limit does not make parallel tasks wait for the
  budget, because a waiting task holds up other queries' tasks on its queue.
  The query repays what they used before it continues, so the limit holds on
  average, but one parallel query can run above the rate for a moment. The cap
  on workers held at once still applies.

`CREATE TABLE ... AS SELECT` cannot give up its worker while it copies. In a
group with a limit it therefore runs single-threaded and keeps one of the
group's workers until it finishes. When that is the last worker the group may
hold, the group's other queries wait for the copy, under either scheduling
policy.

While every running query of a group is a statement like this, the group may
run one parallel task beyond its cap on workers. That task only finishes work
the group's other queries already handed out to shared queues, so that it does
not hold up other groups' queries there. This is the one exception to the cap.

Under a fractional limit a copy's CPU is recorded in full, but the debt such
statements leave the group is capped at what its limit refills in 10 seconds.
After a long copy the group therefore waits at most about 10 seconds, instead of
however long its limit would take to repay the whole copy: about 7 hours for a
one-hour copy under a limit of 0.14 cores. A group that runs long copies back to
back can use far more than its limit as a result: in one measurement on 14
cores, 100-second copies under `cpu_limit = '1%'` used about 6.5% of the node,
close to a whole core. Under a whole-core limit there is no budget, and a copy
only keeps its worker.

`INSERT ... SELECT` gives up its worker like any query, so none of this applies
to it. Any statement that waits for the budget keeps its locks while it waits,
though, including the table writer of an `INSERT ... SELECT`.

### The scheduling policy divides a group between its users

```questdb-sql title="Split the group evenly between its busy users"
CREATE RESOURCE GROUP research WITH (scheduling_policy = 'fair');
```

Scheduling policies are available from QuestDB Enterprise 4.2.0; earlier
releases always serve a group in arrival order. The policy decides which query
of a group gets the next worker the group is entitled to:

- `fifo`, the default, serves the group's work in arrival order. A long query
  keeps its workers while later queries wait behind it, which finishes batch
  work soonest. A parallel query can hold several places in that order, so
  there is no promise of equal CPU between queries.
- `fair` divides the group by user first, then by query. A freed worker goes to
  the user holding the fewest of the group's workers in that worker pool, and
  then to that user's query holding the fewest. On a tie, a user or query that
  has not run in the pool yet goes first, so a new query starts promptly. At
  the end of each CPU slice, a running query yields its worker to a waiting
  user, or to another query of the same user, that holds fewer workers.

Under `fair`, busy users split the group evenly, a user's unused part stays
inside the group, and one user alone can use all of it. Dividing by user first
stops one user from taking ten parts by sending ten queries, and dividing by
query second keeps the queries of an application that uses a single account
from queuing behind each other in arrival order.

Admission follows the same rule. When a `fair` group is at
`max_active_queries`, the waiting user with the fewest admitted queries goes
next, and a tie goes to the user who has waited longest since their last
admission. One user's queue therefore does not keep everyone else out, and with
`max_active_queries = 1` users take turns.

The user is the principal that logged in. With access control disabled it is
the login name the client used, so clients that share one login count as one
user and `fair` alternates between their queries. There are no weights between
users inside a group; a user who needs a different part needs a group of its
own, which then no longer shares the group's total.

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
internal fault it degrades: queries keep running without CPU grants, so CPU
weights, CPU limits and the `fair` policy no longer apply, while admission and
memory limits stay enforced, and
`questdb_resource_groups_cpu_scheduler_degraded` reports `1` until the instance
restarts. A fault in one query affects only that query, leaving other queries
and other groups alone, and its CPU is still charged to its group.

### When scheduling engages

Slicing happens only while CPU scheduling is engaged, and that requires a second
resource group, or a group with a CPU limit or the `fair` scheduling policy.
While `DEFAULT` is the only resource group and has neither, scheduling stays
disengaged: no CPU is sampled, no query yields, and every query holds its worker
exactly as it does with the feature disabled. Registration, admission and memory
accounting still run, so this is not free, but the cost is a fixed few
microseconds per query.

Scheduling engages when a second group is created, or when any group, `DEFAULT`
included, is given a CPU limit or the `fair` policy. It disengages once none of
these holds any longer and the queries of dropped groups have finished. A query
that is already running when scheduling engages stays outside scheduling until
it next suspends or finishes; the new policy applies to queries that start or
resume after the change.

Once scheduling is engaged, a query whose group is alone still keeps its worker:
at each checkpoint it renews its grant in place and yields only when another
query is waiting for its worker, or when its group's CPU limit or `fair` policy
requires it.

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

Choosing a group per session or request:

- [SET RESOURCE GROUP](/docs/query/sql/acl/set-resource-group/)
- [GRANT USE ON RESOURCE GROUP](/docs/query/sql/acl/grant/#grant-use-of-resource-groups)
  and [REVOKE](/docs/query/sql/acl/revoke/#revoke-use-of-resource-groups)

Inspecting:

- [`resource_groups()`](/docs/query/functions/meta/#resource_groups)
- [`current_resource_group()`](/docs/query/functions/meta/#current_resource_group)
- [Resource group metrics](/docs/operations/logging-metrics/#resource-group-metrics)
- [Role-based access control](/docs/security/rbac/)
