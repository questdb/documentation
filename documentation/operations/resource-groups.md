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

This page covers day-to-day use: creating groups, mapping principals, choosing
limits, and watching the result. For what the limits actually guarantee, read
[the concept page](/docs/concepts/resource-groups/) first.

## Quick start

This example separates reporting from the default workload and limits its
concurrency and memory. Run it as an administrator on an instance that meets the
[requirements](#requirements). Use unused example names and replace the password
placeholders. Later examples on this page can be adapted independently.

First create the ACL principals and allow SQL connections:

```questdb-sql
CREATE GROUP analysts;
GRANT HTTP, PGWIRE TO analysts;
CREATE USER reporting_user WITH PASSWORD '<choose-a-password>';
ADD USER reporting_user TO analysts;

CREATE USER nightly_batch WITH PASSWORD '<choose-another-password>';
GRANT HTTP, PGWIRE TO nightly_batch;
```

Then create the resource group and mappings:

```questdb-sql
-- 1. Create a group. Unset parameters fall back to the instance defaults.
CREATE RESOURCE GROUP reporting WITH (
    cpu_weight = 50,
    max_active_queries = 4,
    max_queued_queries = 32,
    queue_timeout = '15s',
    memory_limit = '2G'
);

-- 2. reporting_user inherits this mapping unless a higher-precedence one applies.
ALTER GROUP analysts SET RESOURCE GROUP reporting MAPPING PRIORITY 10;

-- 3. Map one user directly. A direct mapping beats any ACL group mapping.
ALTER USER nightly_batch SET RESOURCE GROUP reporting;
```

Verify:

```questdb-sql
SELECT name, cpu_weight, max_active_queries, active_queries, queued_queries
FROM resource_groups();

SELECT * FROM resource_group_mappings();
```

Reconnect as `reporting_user` or `nightly_batch` and run:

```questdb-sql
SELECT current_resource_group();
```

| current_resource_group |
| ---------------------- |
| reporting              |

These grants allow connections. Grant access to the application's tables
separately, as described in [RBAC](/docs/security/rbac/).

Everything not mapped keeps running in `DEFAULT`, which has a CPU weight of 100.
Against `reporting`'s weight of 50, that is a 2:1 split of query CPU while both
have work.

## Requirements

- QuestDB Enterprise.
- Access control enabled (`acl.enabled=true`). Groups can be created without it,
  but mapping statements require it, since mappings attach to ACL principals.
- The pools that execute SQL must run in Fiber mode, which is the default,
  because cooperative admission and CPU control cannot be made complete on the
  legacy path. On an instance whose pools are in legacy mode, resource groups
  left at their default turn themselves off and log an error naming the pool and
  the setting to change. Setting `resource.groups.enabled=true` on such an
  instance fails startup with that same error.
- Administrator rights for group management, mappings and instance-wide
  inspection. Ordinary users can call `current_resource_group()` to check their
  own query's group.

## Configuration

Resource groups are enabled by default. These are instance-wide settings; the
per-group policy is set in SQL. Each setting is described in full in the
[resource groups configuration reference](/docs/configuration/resource-groups/).

| Property                                     | Default | Meaning                                                                                                              |
| -------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `resource.groups.enabled`                    | `true`  | Set to `false` to disable resource group enforcement. Existing single-query memory limits still apply.               |
| `resource.groups.cpu.capacity.cores`         | `auto`  | CPU capacity that `cpu_max_percent` is a percentage of. `auto` detects container quota, including fractional quotas. |
| `resource.groups.process.memory.limit.bytes` | `0`     | Ceiling for tracked query memory across all groups, `0` for none. Every group limit is capped by it.                 |
| `resource.groups.queue.timeout.millis`       | `30000` | Default admission queue timeout for groups that do not set `queue_timeout`.                                          |

Turning the feature off is a restart with `resource.groups.enabled=false`.
Definitions and mappings stay in the catalog, so nothing is lost and the
policies apply again when it is re-enabled.

## Managing groups

```questdb-sql
CREATE RESOURCE GROUP analytics;

CREATE RESOURCE GROUP IF NOT EXISTS analytics WITH (cpu_weight = 300);

ALTER RESOURCE GROUP analytics SET (cpu_weight = 300, cpu_max_percent = 25.5);

-- Clear parameters so they fall back to the instance defaults again.
ALTER RESOURCE GROUP analytics RESET (memory_limit, cpu_max_percent);

ALTER RESOURCE GROUP analytics RENAME TO reporting;

DROP RESOURCE GROUP reporting;
DROP RESOURCE GROUP IF EXISTS reporting;
```

A group policy change applies online to the shared group budget. It does not
cancel existing queries at the moment `ALTER` runs:

| Change                 | Effect on existing work                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| CPU weight or cap      | Subsequent scheduling uses the new policy; issued CPU grants are settled normally                 |
| Active-query limit     | Existing slots are retained; subsequent admission, including a resumed cursor, uses the new limit |
| Queue limit or timeout | New admission requests use the new settings; an already queued request keeps its deadline         |
| Group memory limit     | Subsequent allocations check the new budget; existing memory is released normally                 |

Lowering a memory budget below current usage can make subsequent allocations
fail. The principal-specific or instance-default single-query limit is captured
when the query starts; updating the group budget does not replace that limit.
Changing a principal mapping affects new queries only.

`DROP` is refused while any live principal is still mapped to the group; unmap
them first. Once unmapped, a group can be dropped while queries still use it. It
disappears from `resource_groups()` immediately. Running and queued queries,
including suspended cursors, continue using the deleted group's existing
settings. Their memory still counts towards the process budget.

Recreating a group with the same name starts fresh usage counters. Queries that
still use the deleted group do not move to the new group or use its settings.
Map principals to the new group to assign their subsequent queries to it.

`DEFAULT` cannot be dropped or renamed, but it can be altered:

```questdb-sql
ALTER RESOURCE GROUP DEFAULT SET (max_active_queries = 16);
```

## Mapping principals

```questdb-sql
ALTER USER alice SET RESOURCE GROUP analytics;
ALTER SERVICE ACCOUNT ingest_bot SET RESOURCE GROUP analytics;
ALTER GROUP analysts SET RESOURCE GROUP analytics MAPPING PRIORITY 10;

ALTER USER alice UNSET RESOURCE GROUP;
ALTER GROUP analysts UNSET RESOURCE GROUP;
```

`MAPPING PRIORITY` is a non-negative integer and applies only to ACL group
mappings, because a user can belong to several ACL groups. The highest priority
wins; ties go to the most recent mapping. It defaults to 0 and is rejected on
user and service account mappings, which are one-to-one.

Resolution order for a query is: direct mapping on the principal, then the
highest-priority mapping among the user's ACL groups, then `DEFAULT`. Service
accounts do not inherit ACL group mappings.

## Policy parameters

All parameters are optional. An unset parameter is not "unlimited" in every
case: it falls back to the instance default shown here.

| Parameter            | Accepted values                                                                | Unset behaviour                                   |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `cpu_weight`         | integer, 1 to 10000                                                            | 100                                               |
| `cpu_max_percent`    | 0.01 to 100, at most two decimals                                              | no cap                                            |
| `max_active_queries` | integer, 1 or more                                                             | unlimited                                         |
| `max_queued_queries` | integer, 0 or more                                                             | unlimited                                         |
| `queue_timeout`      | a positive whole number of milliseconds, or a duration such as `'15s'`, `'2m'` | `resource.groups.queue.timeout.millis`            |
| `memory_limit`       | a positive byte size, plain or suffixed such as `'8G'`                         | no group ceiling; other memory limits still apply |

`memory_limit` is the budget for everything the group runs at once. Where the
instance sets `resource.groups.process.memory.limit.bytes`, the group budget is
capped by it, so a group cannot be granted more than the instance allows. A
group ceiling only lowers what its queries may use; it never raises a limit set
elsewhere.

A group that does not set `memory_limit` carries no ceiling of its own, and
`resource_groups().memory_limit_bytes` reports `0` for it. Its queries are then
bounded by any existing single-query limit and the process limit. A principal's
effective query memory limit takes precedence over the instance default
`cairo.query.memory.limit.bytes`; group and process budgets can only lower the
resulting ceiling. Resource groups do not have a separate `query_memory_limit`
policy parameter.

To remove a group memory ceiling, use
`ALTER RESOURCE GROUP reporting RESET (memory_limit)`. Setting the SQL parameter
to `0` is invalid; `0` means unlimited for the instance process-memory property.
Accounting continues when limits are unlimited.

Two examples of what the values mean in practice:

```questdb-sql
-- A share: reporting gets a third of query CPU when DEFAULT also has work,
-- and all of it when DEFAULT is idle.
CREATE RESOURCE GROUP reporting WITH (cpu_weight = 50);

-- A ceiling: exports never average more than a quarter of instance CPU,
-- even when the instance is otherwise idle.
CREATE RESOURCE GROUP exports WITH (cpu_max_percent = 25);
```

Use `cpu_weight` to decide who wins under contention, and `cpu_max_percent` to
leave headroom for work that resource groups do not manage, such as ingestion
and WAL apply. Setting a cap on a group also switches the whole instance to
managed scheduling while that group has queries.

## Common scenarios

### The instance stops answering while CPU looks idle

Every HTTP or PGWire worker is occupied by a long query, new requests are not
picked up, and instance CPU is low because those queries run on one core each.
Clients time out and retry, which produces more of the same queries. A plan such
as a `LATEST ON` over a non-indexed filter is a typical cause: it scans frames
on one thread, so it is slow without ever being CPU-hungry.

Four steps. The first is a prerequisite to confirm, the second is what enabling
the feature already gives you, and the last two are policy you choose.

**1. Confirm the SQL pools are Fiber pools.** This is the prerequisite for
everything below. A protocol runs either on its own pool, when its worker count
is above zero, or on the shared network pool. The setting that matters is the
one for the pool it actually uses:

| Where the protocol runs                              | Setting to check                      |
| ---------------------------------------------------- | ------------------------------------- |
| Its own HTTP pool (`http.worker.count` above zero)   | `http.worker.fiber.enabled`           |
| Its own PGWire pool (`pg.worker.count` above zero)   | `pg.worker.fiber.enabled`             |
| The shared network pool (worker count zero, default) | `shared.network.worker.fiber.enabled` |

Parallel query work is separate and follows `shared.query.worker.fiber.enabled`
whenever the shared query pool has workers. A shared query pool set to zero
workers turns parallel SQL off by default and needs no check of its own.

The first two settings default to `true`, so a dedicated pool is a Fiber pool
unless someone turned it off. `shared.network.worker.fiber.enabled` defaults to
`true` exactly when HTTP or PGWire actually runs there, which is the case out of
the box because both worker counts default to zero. You normally have nothing to
change here; check these only when the instance was tuned by hand.

After the restart, confirm the feature came up. `SHOW PARAMETERS` must report
`resource.groups.enabled` as `true`, and `questdb_resource_groups_enabled` must
be `1`. If a pool that executes SQL is in legacy mode and resource groups were
left at their default, the feature disables itself and logs the reason. An
explicit `resource.groups.enabled=true` fails startup in that configuration.

**2. Enabling the feature already frees the workers.** A query yields its worker
at the checkpoints that already make it cancellable, so a long single-threaded
scan releases the worker while it is still running and the instance keeps
accepting connections. This needs no group and no policy, and it holds even when
every query resolves to `DEFAULT`.

There is no separate switch to verify. Cooperative yielding is on exactly when
resource groups are on, which step 1 already confirmed. Fiber pools on their own
do not produce it: the checkpoints are compiled into every build, but they only
yield while resource groups are enabled. A query that never reaches a checkpoint
still holds its worker, so this does not remove every cause of an unresponsive
instance.

**3. Separate the workloads so shares apply.** While a single uncapped group
owns every running query, dispatch stays on the unmanaged path and weights have
nothing to arbitrate. Two groups with queries in flight at the same time, or any
group with a `cpu_max_percent`, is what engages weighted scheduling:

```questdb-sql
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 400);
CREATE RESOURCE GROUP adhoc WITH (cpu_weight = 100);

ALTER USER app SET RESOURCE GROUP dashboards;
ALTER USER analyst SET RESOURCE GROUP adhoc;
```

**4. Bound concurrent requests with admission.**

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

Admission directly bounds the number of concurrent queries. A CPU cap bounds
their combined CPU rate and can also slow a single-threaded query: on an 8-core
instance, a 10% cap permits 0.8 cores of CPU. Choose a cap when that rate limit
is useful; it does not replace the admission limits in this scenario. Clients
should use bounded retries with backoff after admission failures.

Afterwards the symptom is also diagnosable rather than mysterious. Low instance
CPU together with a high `queued_queries` and a rising
`oldest_queue_wait_millis` on one group says the work is being held at the
admission gate, not that the machine is busy. `query_activity()` shows which
group each running query was admitted to.

What resource groups do not do here: they do not make the slow plan faster, and
they do not bound how long one query may run. Wall-clock limits still come from
the instance-wide
[`query.timeout`](/docs/configuration/cairo-engine/#querytimeout).

### Dashboards must stay responsive while analysts run heavy queries

Use weights. Shares are per group, not per query, so a group running fifty
queries does not outvote a group running one:

```questdb-sql
CREATE RESOURCE GROUP dashboards WITH (cpu_weight = 400);
CREATE RESOURCE GROUP analysts WITH (cpu_weight = 100);
```

When these are the only competing groups and both can use their shares, weights
target a 4:1 split of managed query CPU. Actual use also depends on runnable
work, available parallelism and any CPU caps. When analysts are idle, dashboards
can use the available query CPU. Weights are integers from 1 to 10000 and every
group starts at 100, so a group left alone keeps an equal share against any
group you do not change.

### A background job must never take the whole instance

Use a cap, which applies whether or not anything else is running:

```questdb-sql
CREATE RESOURCE GROUP exports WITH (cpu_max_percent = 20);
```

This also leaves headroom for work resource groups do not manage, such as
ingestion and WAL apply. The cap accepts two decimals, down to `0.01`, and is a
percentage of the
[detected CPU capacity](/docs/configuration/resource-groups/#resourcegroupscpucapacitycores),
not of the host's core count, so it stays correct under a container quota.

### One workload must not exhaust query memory

Bound the group rather than each query, so the limit holds however many queries
the workload starts:

```questdb-sql
CREATE RESOURCE GROUP reporting WITH (memory_limit = '8G');
```

A query that would push the group over its budget fails with
`query memory limit exceeded` and releases what it held.

### An ingestion or automation account runs queries too

Service accounts resolve differently from users: they honour a direct mapping,
but they never inherit a mapping from an ACL group. A service account with no
direct mapping runs in `DEFAULT` however its ACL groups are mapped, so map it
explicitly:

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
wins. If two mappings tie on priority, the more recently created one wins. A
direct mapping on the user beats every group mapping regardless of priority,
which is the way to make one person an exception without touching the groups:

```questdb-sql
ALTER USER lead_analyst SET RESOURCE GROUP dashboards;
```

`MAPPING PRIORITY` is rejected on user and service account mappings, because
those are one-to-one and have nothing to break a tie between. Confirm any of
this from the client's own session with `SELECT current_resource_group();`.

## Inspecting

`resource_groups()` returns one row per group, combining the configured policy
with live counters:

| Column                                                             | Meaning                                             |
| ------------------------------------------------------------------ | --------------------------------------------------- |
| `name`                                                             | Group name                                          |
| `memory_limit_bytes`                                               | Effective group memory budget                       |
| `max_active_queries`, `max_queued_queries`, `queue_timeout_millis` | Effective admission policy                          |
| `cpu_weight`, `cpu_max_percent`                                    | Effective CPU policy                                |
| `active_queries`, `queued_queries`                                 | Live admission state                                |
| `oldest_queue_wait_millis`                                         | How long the longest waiting query has waited       |
| `memory_used_bytes`                                                | Tracked query memory in use                         |
| `cpu_nanos_total`, `cpu_wait_nanos_total`                          | Cumulative CPU consumed and spent waiting for CPU   |
| `admission_rejections`, `admission_timeouts`                       | Cumulative queue-full rejections and queue timeouts |

`resource_group_mappings()` returns one row per mapping with `principal_type`,
`principal_name`, `principal_generation`, `resource_group_id`, `resource_group`,
`mapping_priority` and `mapping_revision`.

`current_resource_group()` returns the calling query's group, which is the
quickest way to confirm a mapping from the client's own connection:

```questdb-sql
SELECT current_resource_group();
```

It returns `NULL` when that execution is unmanaged, including when the feature
is disabled or a replica's group catalog is not ready. See the
[function reference](/docs/query/functions/meta/#current_resource_group) for
permissions and return values, and the references for
[`resource_groups()`](/docs/query/functions/meta/#resource_groups) and
[`resource_group_mappings()`](/docs/query/functions/meta/#resource_group_mappings)
for complete schemas.

`query_activity()` carries a `resource_group` column, so you can see which group
each running query was admitted to. It is `NULL` for executions that resource
groups do not manage:

```questdb-sql
SELECT resource_group, username, query_start, query
FROM query_activity()
WHERE resource_group IS NOT NULL
ORDER BY query_start;
```

## Monitoring

The Prometheus endpoint exposes one series per group, labelled with
`resource_group`. The full list lives in the
[metrics reference](/docs/operations/logging-metrics/#resource-group-metrics):

```
questdb_resource_group_active_queries{resource_group="reporting"}
questdb_resource_group_queued_queries{resource_group="reporting"}
questdb_resource_group_oldest_queue_wait_millis{resource_group="reporting"}
questdb_resource_group_memory_bytes{resource_group="reporting"}
questdb_resource_group_memory_limit_bytes{resource_group="reporting"}
questdb_resource_group_cpu_nanos_total{resource_group="reporting"}
questdb_resource_group_cpu_wait_nanos_total{resource_group="reporting"}
questdb_resource_group_cpu_max_percent{resource_group="reporting"}
questdb_resource_group_admission_rejections_total{resource_group="reporting"}
questdb_resource_group_admission_timeouts_total{resource_group="reporting"}
```

Instance-wide series:

| Metric                                                  | Meaning                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `questdb_resource_groups_enabled`                       | 1 when the feature is on                                              |
| `questdb_resource_groups_catalog_current`               | 1 when the catalog is current; 0 while a replica is still catching up |
| `questdb_resource_groups_catalog_lag_unmanaged_queries` | Queries that ran unmanaged because the catalog was not current yet    |
| `questdb_resource_groups_cpu_capacity_microcores`       | Capacity that `cpu_max_percent` applies to                            |
| `questdb_resource_groups_cpu_capacity_fallback`         | 1 when capacity detection failed and the processor count was used     |
| `questdb_resource_groups_cpu_managed_dispatch`          | 1 while managed CPU scheduling is engaged                             |
| `questdb_resource_groups_cpu_scheduler_degraded`        | 1 when CPU scheduling has degraded to unmanaged                       |

Two signals are worth alerting on: a non-zero
`questdb_resource_groups_cpu_scheduler_degraded`, which means CPU shares are no
longer enforced until the next restart, and a steadily growing
`questdb_resource_group_admission_timeouts_total`, which means a group's queue
settings are rejecting work the application expects to succeed.

## Errors clients see

| Message                                                           | Cause                                                                         | Usual fix                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Resource Group admission queue is full`                          | The group is at `max_active_queries` and its queue is at `max_queued_queries` | Raise the limits, or let the client retry                                                                             |
| `Resource Group admission queue timeout`                          | The query waited longer than `queue_timeout`                                  | Raise `queue_timeout` or `max_active_queries`, or reduce concurrency                                                  |
| Either admission error while fetching a later page                | A suspended cursor re-enters admission when the client asks for more rows     | Adjust admission limits or retry the query with backoff; the failed cursor cannot continue                            |
| `query memory limit exceeded`                                     | A single-query, group or process memory limit rejected an allocation          | Inspect `query_activity().memory_limit` and the group/process budgets; reduce memory use or adjust the relevant limit |
| `Resource Group is referenced by an active principal link`        | `DROP RESOURCE GROUP` while principals are still mapped                       | `UNSET RESOURCE GROUP` on those principals first                                                                      |
| `built-in Resource Group cannot be dropped` / `cannot be renamed` | `DROP` or `RENAME` on `DEFAULT`                                               | Alter it instead                                                                                                      |

## Troubleshooting

**A group's CPU share is not what I configured.** Weights only apply while
groups compete. Check `active_queries` on both groups at the same moment: if one
is idle, the other is expected to use everything. Also confirm the work you are
watching is managed at all, since ingestion, WAL apply and view refresh are
outside the feature. `query_activity()` shows the group each running query
belongs to, which is the quickest way to tell whether the load you are watching
is attributed where you expect.

**A capped group is slower than the cap suggests.** Very small caps release CPU
in pulses. The cap is a rate over roughly a 100 ms window, so a group whose
share works out to less than one 2 ms slice per window waits between slices. For
example, 0.1% of an 8-core instance allows about 8 ms of CPU per second. Small
caps still allow progress, but the waits between slices can substantially
increase latency; there is no special 0.25% cutoff.

**Queries on a fresh replica are not limited.** Until the catalog has
replicated, a replica runs queries unmanaged and counts them in
`questdb_resource_groups_catalog_lag_unmanaged_queries`. The counter stops
growing once `questdb_resource_groups_catalog_current` reaches 1.

**Startup fails naming a worker pool.** A pool that executes SQL is in legacy
mode while `resource.groups.enabled=true` was set explicitly. Either restore the
default Fiber mode for that pool or stop setting the property, which lets the
instance start with resource groups off.

**The feature is off although the default is on.** Check the log at startup for
an error naming a worker pool, and check `SHOW PARAMETERS` for the value that
took effect. A legacy SQL pool turns the feature off when the property is left
unset.

## Limitations

- Only query statements are managed. See
  [what is managed](/docs/concepts/resource-groups/#what-is-managed).
- Memory accounting covers tracked native query memory, not JVM heap, resident
  set size or memory-mapped table pages.
- CPU control is cooperative, so shares hold over a short window rather than
  instantaneously, and a query that cannot reach a cooperative checkpoint holds
  its worker until it does.
- Principal mapping changes affect new queries. Group budgets change online;
  dropping a group retains its runtime state for existing queries until they
  finish.

## See also

- [Resource groups concept](/docs/concepts/resource-groups/)
- [Resource groups configuration](/docs/configuration/resource-groups/)
- [Role-based access control](/docs/security/rbac/)
- [Logging and metrics](/docs/operations/logging-metrics/)
