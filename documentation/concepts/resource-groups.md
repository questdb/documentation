---
title: Resource groups
sidebar_label: Resource groups
description:
  Resource groups isolate query workloads inside one QuestDB instance. Learn how
  a query is assigned to a group, and what admission, CPU weight, CPU caps and
  memory limits actually guarantee.
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

Resource groups control four things at the query execution boundary:

- **Admission** — how many queries a group may run at once, how many may wait,
  and how long they may wait.
- **Weighted CPU** — the share of query CPU a group receives while groups
  compete.
- **A CPU rate limit** — an absolute ceiling expressed as a percentage of
  instance capacity.
- **Memory** — process and group budgets for tracked native query memory.

The design is cooperative. QuestDB executes query work on shared worker pools,
and resource groups do not create one operating-system thread pool per group. A
query and all of its parallel tasks use the same resource group, while every
worker stays available to every group.

## How a query is assigned to a group

Assignment follows the authenticated principal, not the statement:

1. A **direct mapping** on the user or service account wins.
2. Otherwise, for users only, QuestDB looks at the mappings of the ACL groups
   the user belongs to and takes the highest `mapping_priority`. Ties go to the
   most recently created mapping.
3. Otherwise the query runs in **DEFAULT**.

Service accounts inherit nothing from ACL groups; they are either mapped
directly or they run in DEFAULT.

The group is resolved once, when the query registers, and stays fixed for the
statement's lifetime. Changing a mapping affects statements that start after the
change, never one already running.

`DEFAULT` always exists. By default it carries no limits of its own, so unmapped
principals run with a CPU weight of 100, no CPU cap, unlimited admission, and
the instance-wide memory limits. You can change its policy, but you cannot drop
or rename it.

The default behaviour is:

| Setting                             | Behaviour                                              |
| ----------------------------------- | ------------------------------------------------------ |
| Feature enabled                     | Yes, when the SQL worker pools support Fiber execution |
| Group admission                     | Unlimited active and queued queries                    |
| Group CPU                           | Weight 100; no percentage cap                          |
| Group and process memory budgets    | Unlimited unless configured                            |
| Existing single-query memory limits | Still apply, including principal-specific limits       |
| Memory accounting without limits    | Remains enabled for tracked native query memory        |

## What is managed

Resource groups govern the statements that read data:

- `SELECT` and `EXPLAIN`
- the source query of `CREATE TABLE ... AS SELECT` and `INSERT ... SELECT`
- query exports

Everything else runs outside the feature and consumes no admission slot, CPU
grant or group memory budget: value `INSERT`, `UPDATE`, ordinary DDL, `COPY`,
transaction and session control, ILP ingestion, WAL apply, materialized and live
view refresh, and QuestDB's own internal SQL.

For `CREATE TABLE ... AS SELECT` and `INSERT ... SELECT` the owner covers cursor
open, the source scan, transforms, parallel query work and the row pump. Source
evaluation and writer append are fused in that pump, so inseparable foreground
CPU may be charged conservatively to the group. Durability, the commit and any
work handed to writer or WAL queues are outside the guarantee.

Resource groups account **tracked native query memory**. They do not represent
JVM heap, resident set size, memory-mapped table pages or long-lived engine
caches. Existing process memory protection remains the outer boundary.

## What each control guarantees

The four controls differ in how strong their guarantee is, which matters when
you decide what to configure.

### Admission is a hard gate

`max_active_queries` is an exact count. A group at its limit queues the next
query until a slot frees, up to `max_queued_queries`; beyond that the query is
rejected immediately. A queued query that waits longer than `queue_timeout`
fails.

A slot is held only while the query is actually executing a segment. A protocol
cursor that is suspended between pages releases its slot and passes through the
gate again when the client asks for more rows, so a paging client does not hold
capacity while the application thinks. The consequence is that admission can be
refused on a later page: a client that received its first rows may still see the
queue-full or timeout error when it asks for more, and the connection stays
usable.

### CPU weight is a share, not a reservation

Weights only matter when groups compete. A group that is alone on the instance
uses everything it can, regardless of its weight. When two groups both have
work, the scheduler hands out CPU so that measured CPU divided by `cpu_weight`
stays balanced: weights 100 and 50 converge to a 2:1 split of query CPU.

Weights are relative. 100 and 50 are the same as 2 and 1. A group that becomes
active starts level with the groups already running, so it neither banks the CPU
it did not use while idle nor is punished for having been busy.

Within a group, pending execution requests are served in arrival order. A
parallel query can submit more than one request, so this does not promise equal
CPU shares between individual queries.

### The CPU cap is a rate, not an instantaneous ceiling

`cpu_max_percent` is enforced with a token bucket measured in CPU nanoseconds
against the instance's CPU capacity. It is an average over a short window, not a
per-instant limit: a capped group that has been idle may burst for about 100 ms
of accumulated allowance before it is pushed back to its configured rate. Usage
beyond a grant becomes debt that must be repaid before the group runs again, so
the average holds even when an individual query overruns.

Capacity comes from `resource.groups.cpu.capacity.cores`, which detects
container CPU quota by default. On a fractional quota such as 500m, detection
preserves the fraction, so a 50% cap really means half of half a core.

### Memory limits use batched accounting

Accounting has three levels: query, group and process. Allocation and release
deltas accumulate locally on the executing worker and are published to the
shared counters at an adaptive threshold or an execution boundary. Exceeding a
checked limit fails the query with `query memory limit exceeded`; it does not
queue the allocation until memory becomes available.

The single-query ceiling starts with the principal's effective query memory
limit, when set, or the instance default `cairo.query.memory.limit.bytes`. Any
group `memory_limit` and process memory budget further cap that ceiling. The
group budget also bounds the total tracked memory held by its queries; the
process budget covers tracked native query memory across groups.

An unset group `memory_limit` adds no group ceiling. A process budget of `0`
adds no process ceiling. Existing single-query limits still apply, and memory
accounting remains enabled even when all limits are unlimited.

The counters can temporarily omit worker-local deltas. A group can therefore
briefly overshoot its limit by a bounded amount related to the number of workers
running its queries. These budgets are not byte-exact, instantaneous ceilings.

## Why CPU control is cooperative

QuestDB does not preempt a running query. The scheduler grants a query a short
slice of CPU on a worker and expects it to reach a cooperative checkpoint, which
is the same circuit breaker check that makes queries cancellable. At that point
the query either renews its grant or yields the worker to another group.

Yielding returns the worker to its dispatch loop rather than to the end of the
query. The loop interleaves other queries on that worker and, within a bounded
window, hands it back to network I/O so new connections are accepted. A long
single-threaded query that reaches these checkpoints can therefore share its
worker before finishing. This improves responsiveness while heavy queries run,
even before any custom group policy is written. Resource groups add this CPU
time slicing to the existing cancellation and I/O suspension mechanisms.

Two consequences follow.

The guarantee is statistical over a short window. Between checkpoints a query
holds its worker, so instantaneous CPU can deviate from the configured share.
Settlement charges the measured CPU either way, so a query that overran repays
it and the average is preserved.

A query that cannot reach a checkpoint keeps its worker. When managed CPU
accounting is engaged, its CPU is charged when the grant settles, but no
cooperative limit can shorten that stretch.

## Behaviour under failure and on replicas

Resource groups are stored in a replicated system catalog, so a read-only
replica receives group definitions and mappings through normal replication.

- A **fresh replica** that has not yet received the catalog runs queries
  unmanaged, exactly as if the feature were disabled, and reports how many
  queries took that path. It does not reject queries or serve them under a
  policy it cannot see yet.
- If **CPU scheduling** hits an internal fault, it degrades: queries continue to
  run without CPU grants, and the condition is visible in metrics until the
  instance restarts. Admission and memory limits do not depend on CPU scheduling
  and stay enforced.
- A **fault on one query** fences only that query's owner. Other queries and
  other groups are unaffected, and the faulted segment is charged conservatively
  rather than being dropped from the accounting.

## Cost when nothing competes

While a single uncapped group owns all running queries, dispatch takes a
lock-free path that avoids CPU sampling and weighted scheduling accounting.
Query registration, admission, cooperative checks and memory accounting still
run, so this does not imply the same cost as disabling the feature. Actual
overhead depends on the workload. Managed scheduling engages as soon as a second
group has work or a capped group is active, and disengages again when it does
not. The transition happens at the next dispatch boundary, not at a query
boundary, so a newly arriving group does not wait for a long query to finish
before its policy applies.

## See also

- [Configure and use resource groups](/docs/operations/resource-groups/)
- [Resource groups configuration](/docs/configuration/resource-groups/)
- [Role-based access control](/docs/security/rbac/)
