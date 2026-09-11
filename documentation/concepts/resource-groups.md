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

Resource groups control three things at the query execution boundary:

- **Admission** — how many queries a group may run at once, how many may wait,
  and how long they may wait.
- **Weighted CPU** — the share of query CPU a group receives while groups
  compete.
- **Memory** — process and group budgets for tracked native query memory.

The design is cooperative. QuestDB executes query work on shared worker pools,
and resource groups do not create one operating-system thread pool per group. A
query and all of its parallel tasks use the same resource group, while every
worker stays available to every group.

With no configuration the feature is on and no group policy is in force:

| Setting                             | Behaviour                                               |
| ----------------------------------- | ------------------------------------------------------- |
| Feature enabled                     | Yes; turns itself off when a SQL pool is in legacy mode |
| Group admission                     | Unlimited active and queued queries                     |
| Group CPU                           | Weight 100                                              |
| Group and process memory budgets    | Unlimited unless configured                             |
| Existing single-query memory limits | Still apply, including principal-specific limits        |
| Memory accounting without limits    | Remains enabled for tracked native query memory         |

## How a query is assigned to a group

Assignment follows the authenticated principal, not the statement:

1. A **direct mapping** on the user or service account wins.
2. Otherwise, for users only, QuestDB looks at the mappings of the ACL groups
   the user belongs to and takes the highest `mapping_priority`. If two tie, the
   mapping to the resource group that was created first wins, so give the groups
   distinct priorities when the order matters.
3. Otherwise the query runs in **DEFAULT**.

Service accounts inherit nothing from ACL groups; they are either mapped
directly or they run in DEFAULT. A session that assumes a service account keeps
the group of the principal that logged in; the service account's own mapping
applies to sessions that authenticate as that account.

The group is resolved once, when the query starts, and stays fixed for the
statement's lifetime. Changing a mapping affects statements that start after the
change, never one already running.

`DEFAULT` always exists. By default it carries no limits of its own, so unmapped
principals run with a CPU weight of 100, unlimited admission, and the
instance-wide memory limits. You can change its policy, but you cannot drop or
rename it.

## What is managed

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

The three controls differ in how strong their guarantee is, which matters when
you decide what to configure.

### Admission is a hard gate

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

Weights only matter when groups compete. A group that is alone on the instance
uses everything it can, regardless of its weight, and a query that started while
its group was alone keeps running that way until it next suspends or finishes.
When two groups both have work, the scheduler hands out CPU so that measured CPU
divided by `cpu_weight` stays balanced: weights 100 and 50 converge to a 2:1
split of query CPU.

Weights are relative. 100 and 50 are the same as 2 and 1. A group that becomes
active starts level with the groups already running, so it neither banks the CPU
it did not use while idle nor is punished for having been busy.

Shares are between groups, not between queries. Within a group, work is served
in arrival order, and a parallel query can hold several places in that order, so
there is no promise of equal CPU between individual queries.

### Memory limits use batched accounting

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

## Why CPU control is cooperative

QuestDB does not preempt a running query. The scheduler grants a query a short
slice of CPU on a worker and expects it to reach a cooperative checkpoint, which
is the same circuit breaker check that makes queries cancellable. At that point
the query either renews its grant or yields the worker to another group.

A yielded worker runs other queries and, within a bounded window, returns to
accepting connections; the query that yielded resumes later. A long
single-threaded query that reaches these checkpoints therefore shares its worker
before finishing, which keeps the instance responsive while heavy queries run.
Slicing happens only under managed scheduling: while no policy is in force, a
query holds its worker exactly as it does with the feature disabled.

Two consequences follow.

The guarantee is statistical over a short window. Between checkpoints a query
holds its worker, so instantaneous CPU can deviate from the configured share.
The CPU actually used is charged either way, so a query that overran repays it
and the average is preserved.

A query that cannot reach a checkpoint keeps its worker. While managed
scheduling is engaged its CPU is still charged when the slice ends, but no
cooperative limit can shorten that stretch.

## Behaviour under failure and on replicas

Resource groups are stored in a replicated system catalog, so a read-only
replica receives group definitions and mappings through normal replication.

- A **fresh replica** that has not yet received the catalog runs queries
  unmanaged, exactly as if the feature were disabled, and counts them in
  `questdb_resource_groups_catalog_lag_unmanaged_queries_total`. It does not
  reject queries or serve them under a policy it cannot see yet.
- A **replica being promoted** validates the catalog after replication has
  switched and before writes are admitted. If the old primary predated resource
  groups and never created the catalog table, the promoted node creates it and
  continues. With the feature enabled, a catalog that is unreadable or that the
  replica has not received yet refuses the promotion: the switch fails part-way,
  the node lands in the `UNKNOWN` role and keeps serving reads as before, and
  the log names `RESOURCE_GROUP_CATALOG_UNAVAILABLE` with the reason. Retrying
  the switch repeats the check. With the feature disabled the condition is
  logged and the promotion proceeds.
- At **startup** an unreadable catalog stops an instance with the feature
  enabled from starting, in either role. A lagging catalog does not: the
  instance starts and the refresh job catches up.
- If **CPU scheduling** hits an internal fault, it degrades: queries continue to
  run without CPU grants, and the condition is visible in metrics until the
  instance restarts. Admission and memory limits do not depend on CPU scheduling
  and stay enforced.
- An **internal fault in one query** affects only that query. Other queries and
  other groups are unaffected, and the CPU it used is still charged to its
  group.

## Cost when nothing competes

While a single group owns all running queries, dispatch is unmanaged: no CPU is
sampled, no query yields, and every query holds its worker exactly as it does
with the feature disabled. Registration, admission and memory accounting still
run, so this is not free, but the cost is a fixed few microseconds per query.
Managed scheduling engages as soon as a second group has work, and disengages
again when it does not. A query that is already running stays unmanaged until it
next suspends or finishes; the new policy applies to queries that start or
resume after the change.

## See also

- [Configure and use resource groups](/docs/operations/resource-groups/)
- [Resource groups configuration](/docs/configuration/resource-groups/)
- [Role-based access control](/docs/security/rbac/)
