---
title: Resource groups
sidebar_label: Resource groups
description:
  Create resource groups, map users and ACL groups to them, and tune admission,
  CPU and memory limits so one workload cannot starve another.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Resource groups isolate competing query workloads inside a single QuestDB
  instance.
</EnterpriseNote>

This page covers running the feature: what an instance needs, how to choose
limits, what to watch, and what to do when something looks wrong. For what the
limits guarantee, read [the concept page](/docs/concepts/resource-groups/). For
statement syntax, see
[`CREATE RESOURCE GROUP`](/docs/query/sql/acl/create-resource-group/) and its
siblings.

## Requirements

- QuestDB Enterprise.
- Access control enabled (`acl.enabled=true`). Groups can be created without it,
  but mapping statements require it, since mappings attach to ACL principals.
- The worker pools that execute SQL must run in Fiber mode, which is the
  default.
- The [`SQL ENGINE ADMIN`](/docs/security/rbac/#permissions) permission for group
  management, mappings and instance-wide inspection. Ordinary users need no
  permission to call `current_resource_group()` and check their own query's
  group.

Mapping a principal to a resource group grants it nothing by itself. The user
still needs `HTTP` or `PGWIRE` to connect and `SELECT` on the tables it queries,
as described in [RBAC](/docs/security/rbac/).

### Fiber mode

Every Fiber setting defaults to `true`, so a stock instance already satisfies
this requirement and there is nothing to check. It matters only on an instance
whose worker pools were tuned by hand.

If a SQL pool is in legacy mode, resource groups left at their default turn
themselves off at startup and log an error naming the pool and the setting to
change. Setting `resource.groups.enabled=true` explicitly on such an instance
fails startup with that same error.

Each protocol is governed by the setting for the pool that actually serves it:

- HTTP and PostgreSQL run on their own pool when `http.worker.count` or
  `pg.worker.count` is above zero, governed by
  [`http.worker.fiber.enabled`](/docs/configuration/http-server/#httpworkerfiberenabled)
  and
  [`pg.worker.fiber.enabled`](/docs/configuration/postgres-wire-protocol/#pgworkerfiberenabled).
- With those counts at their default of zero, both run on the shared network
  pool, governed by
  [`shared.network.worker.fiber.enabled`](/docs/configuration/shared-workers/#sharednetworkworkerfiberenabled).
- Parallel query work follows
  [`shared.query.worker.fiber.enabled`](/docs/configuration/shared-workers/#sharedqueryworkerfiberenabled)
  whenever the shared query pool has workers. A pool set to zero workers turns
  parallel SQL off and needs no check of its own.

The two instance-wide settings, `resource.groups.enabled` and
`resource.groups.process.memory.limit.bytes`, are described in the
[resource groups configuration reference](/docs/configuration/resource-groups/).
Neither is reloadable, so turning the feature off is a restart. Definitions and
mappings stay in the catalog either way, so nothing is lost while it is off.

## Changing a live instance

Three things are worth knowing before you change policy on a running system:

- **Changes apply online.** An `ALTER` does not cancel anything running at that
  moment. Slots already held are kept, an already queued request keeps its
  deadline, and only subsequent allocations check a new memory budget. See
  [effect on queries already running](/docs/query/sql/acl/alter-resource-group/#effect-on-queries-already-running).
- **A drop is refused while principals are still mapped.** Unmap them first. Once
  unmapped, the group can be dropped while its queries are still running, and
  they carry on under the settings it had. See
  [what happens to queries still using it](/docs/query/sql/acl/drop-resource-group/#what-happens-to-queries-still-using-it).
- **`DEFAULT` is alterable but cannot be dropped or renamed.** Giving it limits
  is how you bound everything that is not explicitly mapped.

Mapping changes affect queries that start after the change, never one already
running. For the resolution order, including `ASSUME SERVICE ACCOUNT`, see
[who a resource group applies to](/docs/concepts/resource-groups/#who-a-resource-group-applies-to).

On a replicated cluster a change takes effect on each instance as the catalog
reaches it, so a replica that is behind keeps applying the previous policy. See
[Replication and catalog lag](/docs/concepts/resource-groups/#behaviour-under-failure-and-on-replicas).

## Choosing limits

The accepted values and their defaults are in the
[`CREATE RESOURCE GROUP` parameter table](/docs/query/sql/acl/create-resource-group/#parameters).
What matters when picking them:

- **An unset parameter is not always "unlimited".** `cpu_weight` falls back to
  100 and `queue_timeout` to 30 seconds, while the two admission counts really
  are unlimited when unset.
- **Weights are only meaningful relative to other groups.** A group at
  `cpu_weight = 50` gets a third of query CPU while `DEFAULT` also has work, and
  all of it when `DEFAULT` is idle. Setting a weight on a lone group does
  nothing.
- **No group memory ceiling does not mean unlimited memory.** A principal's own
  limit, `cairo.query.memory.limit.bytes` and the process budget all still
  apply, and a group ceiling only ever lowers the result. See
  [memory limits](/docs/concepts/resource-groups/#memory-limits-use-batched-accounting).

Start permissive, watch the counters in [inspecting](#inspecting), then tighten.
Policy changes apply online, so there is no need to get this right first time.

## Common scenarios

### The instance stops answering while CPU looks idle

Every HTTP or PGWire worker is occupied by a large query, new requests are not
picked up, and instance CPU is low because those queries run on one core each.
Clients time out and retry, which produces more of the same queries.

**1. Separate the workloads into groups.** While `DEFAULT` is the only group,
queries hold their workers exactly as they do with the feature disabled. CPU
scheduling engages as soon as a second group exists, and a query then yields its
worker at the checkpoints that already make it cancellable, so a long
single-threaded scan releases the worker while it is still running, the instance
keeps accepting connections, and CPU is split by weight:

```questdb-sql
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 400);
CREATE RESOURCE GROUP adhoc WITH (cpu_weight = 100);

ALTER USER app SET RESOURCE GROUP dashboards;
ALTER USER analyst SET RESOURCE GROUP adhoc;
```

`questdb_resource_groups_cpu_managed_dispatch` reports `1` while scheduling is
engaged, which is whenever a group besides `DEFAULT` exists. A query that
started before the second group was created keeps its worker until it next
suspends or finishes, and a query that never reaches a checkpoint holds its
worker either way, so this does not remove every cause of an unresponsive
instance.

**2. Bound concurrent requests with admission.**

```questdb-sql
ALTER RESOURCE GROUP adhoc SET (
  max_active_queries = 4,
  max_queued_queries = 8,
  queue_timeout = '5s'
);
```

The fifth concurrent query waits instead of running, and it does not hold a
worker while it waits. The thirteenth fails immediately with
`Resource Group admission queue is full`, so a client that keeps resending gets
a clear answer in seconds instead of adding to the pile.

Admission directly bounds the number of concurrent queries; weights do not, so
the two are complementary. Clients should use bounded retries with backoff after
admission failures.

Afterwards the symptom is also diagnosable rather than mysterious. Low instance
CPU together with a high `queued_queries` and a rising
`oldest_queue_wait_millis` on one group says the work is being held at the
admission gate, not that the machine is busy. `query_activity()` shows which
group each running query was admitted to.

What resource groups do not do here: they do not make the slow plan faster, and
they do not bound how long one query may run. Wall-clock limits still come from
the instance-wide
[`query.timeout`](/docs/configuration/cairo-engine/#querytimeout), and that
clock includes time spent waiting in the admission queue: a query can time out
before it starts, and the error then says
`while queued for Resource Group admission`.

### Dashboards must stay responsive while analysts run heavy queries

Use weights. Shares are per group, not per query, so a group running fifty
queries does not outvote a group running one:

```questdb-sql
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 400);
CREATE RESOURCE GROUP analysts WITH (cpu_weight = 100);
```

When these are the only competing groups and both can use their shares, weights
target a 4:1 split of managed query CPU. Actual use also depends on runnable
work and available parallelism. When analysts are idle, dashboards can use the
available query CPU. Weights are integers from 1 to 10000 and every group starts
at 100, so a group left alone keeps an equal share against any group you do not
change.

### A background job must yield to everything else

Give it a small weight and a small concurrency limit:

```questdb-sql
CREATE RESOURCE GROUP exports WITH (cpu_weight = 10, max_active_queries = 1);
```

Under contention the job receives a tenth of the CPU that a group at the default
weight of 100 receives, and it runs one query at a time. When nothing else has
work it uses the CPU that would otherwise be idle; resource groups do not hold
CPU back from a group that is alone.

### One workload must not exhaust query memory

Bound the group rather than each query, so the limit holds however many queries
the workload starts:

```questdb-sql
CREATE RESOURCE GROUP reporting WITH (memory_limit = '8G');
```

A query that would push the group over its budget fails with
`query memory limit exceeded` reporting `scope=group`, and releases what it
held.

### An ingestion or automation account runs queries too

A service account cannot belong to an ACL group, so it has no mapping to
inherit. Without a direct mapping it runs in `DEFAULT`, so map it explicitly:

```questdb-sql
CREATE RESOURCE GROUP automation WITH (cpu_weight = 50, max_active_queries = 2);

ALTER SERVICE ACCOUNT ingest_bot SET RESOURCE GROUP automation;
```

This governs the queries the account runs. It does not throttle ingestion
itself, which resource groups do not manage.

### Many teams share one instance

Map ACL groups rather than individual users, and use `MAPPING PRIORITY` to
decide what happens to someone who belongs to more than one:

```questdb-sql
ALTER GROUP analysts SET RESOURCE GROUP adhoc MAPPING PRIORITY 10;
ALTER GROUP oncall SET RESOURCE GROUP dashboards MAPPING PRIORITY 20;
```

Someone in both groups resolves to `dashboards`, because the higher priority
wins. If two mappings tie on priority, the one whose resource group was created
first wins, so keep priorities distinct. A direct mapping on the user beats
every group mapping regardless of priority, which is the way to make one person
an exception without touching the groups:

```questdb-sql
ALTER USER lead_analyst SET RESOURCE GROUP dashboards;
```

`MAPPING PRIORITY` is rejected on user and service account mappings, because
those are one-to-one and have nothing to break a tie between. Confirm any of
this from the client's own session with `SELECT current_resource_group();`.

## Inspecting

[`resource_groups()`](/docs/query/functions/meta/#resource_groups) returns one
row per group, combining the configured policy with live counters. The columns
that matter day to day:

- `active_queries` and `queued_queries` for live admission state, and
  `oldest_queue_wait_millis` for how long the longest waiter has waited. A high
  queue with a rising wait means work is held at the gate, not that the machine
  is busy.
- `admission_rejections` and `admission_timeouts` for work already turned away.
- `memory_used_bytes` against `memory_limit_bytes` for headroom.

Mappings are attributes of the principals themselves. `SHOW USERS` and
`SHOW SERVICE ACCOUNTS` carry a `resource_group` column, and `SHOW GROUPS`
carries `resource_group` and `resource_group_priority`; all are `NULL` for an
unmapped principal. Each statement can be used as a subquery, so
`SELECT name FROM (SHOW GROUPS) WHERE resource_group = 'reporting'` lists the
ACL groups mapped to one resource group.

`current_resource_group()` returns the calling query's group, which is the
quickest way to confirm a mapping from the client's own connection:

```questdb-sql
SELECT current_resource_group();
```

An unmapped principal gets `DEFAULT`, not `NULL`. `NULL` means the query was
never admitted to a group at all, which happens when the feature is disabled and
on a replica whose group catalog is not ready. Note that `DEFAULT` is returned
even while CPU scheduling is disengaged, because assignment and CPU slicing are
separate things. See the
[function reference](/docs/query/functions/meta/#current_resource_group) for
permissions and return values.

`query_activity()` carries a `resource_group` column, so you can see which group
each running query was admitted to. It follows the same rule, `DEFAULT` for an
unmapped principal and `NULL` only when no group was assigned:

```questdb-sql
SELECT resource_group, username, query_start, query
FROM query_activity()
WHERE resource_group IS NOT NULL
ORDER BY query_start;
```

## Monitoring

Metrics require `metrics.enabled=true`, which is off by default. The Prometheus
endpoint then exposes one series per group, labelled with `resource_group`, plus
five instance-wide series describing the feature itself. Every name, type and
meaning is in the
[metrics reference](/docs/operations/logging-metrics/#resource-group-metrics).

Two signals are worth alerting on: a non-zero
`questdb_resource_groups_cpu_scheduler_degraded`, which means CPU shares are no
longer enforced until the next restart, and a steadily growing
`questdb_resource_group_admission_timeouts_total`, which means a group's queue
settings are rejecting work the application expects to succeed.

## Errors clients see

| Message                                                           | Cause                                                                         | Usual fix                                                                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Resource Group admission queue is full`                          | The group is at `max_active_queries` and its queue is at `max_queued_queries` | Raise the limits, or let the client retry                                                                    |
| `Resource Group admission queue timeout`                          | The query waited longer than `queue_timeout`                                  | Raise `queue_timeout` or `max_active_queries`, or reduce concurrency                                         |
| Either admission error while fetching a later page                | A suspended cursor re-enters admission when the client asks for more rows     | Adjust admission limits or retry the query with backoff; the failed cursor cannot continue                   |
| `query memory limit exceeded`                                     | A single-query, group or process memory limit rejected an allocation          | `scope` in the message names the level: `query`, `group` or `process`. Reduce memory use or raise that limit |
| `Resource Group is assigned to an ACL entity`                     | `DROP RESOURCE GROUP` while principals are still mapped                       | `UNSET RESOURCE GROUP` on those principals first; the message names one of them in `[entity=...]`            |
| `built-in Resource Group cannot be dropped` / `cannot be renamed` | `DROP` or `RENAME` on `DEFAULT`                                               | Alter it instead                                                                                             |

## Troubleshooting

**A group's CPU share is not what I configured.** Weights only apply while
groups compete. Check `active_queries` on both groups at the same moment: if one
is idle, the other is expected to use everything. A query that started before
the second group was created stays outside CPU scheduling until it next suspends
or finishes; every other query starts sharing at its next checkpoint. Also
confirm the work you are watching is managed at all, since ingestion, WAL apply
and view refresh are outside the feature. `query_activity()` shows the group
each running query belongs to, which is the quickest way to tell whether the
load you are watching is attributed where you expect.

**Queries on a fresh replica are not limited.** Until the catalog has
replicated, a replica runs queries unmanaged and counts them in
`questdb_resource_groups_catalog_lag_unmanaged_queries_total`. The counter stops
growing once `questdb_resource_groups_catalog_current` reaches 1.

**Promotion fails naming the resource group catalog.** With the feature enabled,
`SWITCH ROLE TO PRIMARY` does not admit writes over a catalog that is unreadable
or that the replica has not received yet. The node lands in the `UNKNOWN` role
and still serves reads; the server log names
`RESOURCE_GROUP_CATALOG_UNAVAILABLE` with the reason. When the reason is
`Resource Group catalog table is not locally available`, replication has not
delivered the catalog table yet: wait for it and run `SWITCH ROLE TO PRIMARY`
again. Any other reason means the table cannot be read, and retrying does not
help: promote another replica, or restart this node as primary with
`resource.groups.enabled=false`, which turns the check into a logged error. See
[Refusals and the torn state](/docs/high-availability/failover/#refusals-and-the-torn-state).

**Startup fails naming the resource group catalog.** The catalog table cannot be
created or read while the feature is enabled; the startup error names the
Resource Group catalog and the reason. Starting with
`resource.groups.enabled=false` logs the condition instead of failing.

**Startup fails naming a worker pool.** A pool that executes SQL is in legacy
mode while `resource.groups.enabled=true` was set explicitly. Either restore the
default Fiber mode for that pool or stop setting the property, which lets the
instance start with resource groups off.

**The feature is off although the default is on.** Check the log at startup for
an error naming a worker pool, and check `SHOW PARAMETERS` for the value that
took effect. A legacy SQL pool turns the feature off when the property is left
unset. `SHOW PARAMETERS` reporting `resource.groups.enabled` as `true`, together
with `questdb_resource_groups_enabled` at `1`, confirms the feature is actually
running.

## Limitations

- Only query statements are managed. See
  [which statements are managed](/docs/concepts/resource-groups/#which-statements-are-managed).
- Memory accounting covers tracked native query memory, not JVM heap, resident
  set size or memory-mapped table pages. See
  [memory limits](/docs/concepts/resource-groups/#memory-limits-use-batched-accounting).
- CPU control is cooperative, so shares hold over a short window rather than
  instantaneously, and a query that cannot reach a cooperative checkpoint holds
  its worker until it does. See
  [cooperative CPU scheduling](/docs/concepts/resource-groups/#how-cooperative-cpu-scheduling-works).
- Principal mapping changes affect new queries. Group budgets change online;
  dropping a group retains its runtime state for existing queries until they
  finish. See [changing a live instance](#changing-a-live-instance).

## See also

- [Resource groups concept](/docs/concepts/resource-groups/)
- [Resource groups configuration](/docs/configuration/resource-groups/)
- [CREATE RESOURCE GROUP](/docs/query/sql/acl/create-resource-group/)
- [ALTER RESOURCE GROUP](/docs/query/sql/acl/alter-resource-group/)
- [DROP RESOURCE GROUP](/docs/query/sql/acl/drop-resource-group/)
- [Role-based access control](/docs/security/rbac/)
- [Logging and metrics](/docs/operations/logging-metrics/)
