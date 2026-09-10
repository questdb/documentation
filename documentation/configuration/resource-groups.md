---
title: Resource groups
sidebar_label: Resource groups
description:
  Configuration settings for QuestDB Enterprise resource groups, covering the
  master switch, CPU capacity, memory ceiling and admission defaults.
---

:::note

Resource groups are [Enterprise](/enterprise/) only.

:::

[Resource groups](/docs/concepts/resource-groups/) isolate competing query
workloads inside one instance. These settings are instance-wide. The per-group
policy that decides admission, CPU share and memory budgets is set in SQL, not
here. See [Configure and use resource groups](/docs/operations/resource-groups/)
for those statements.

None of these settings are reloadable: changing any of them requires a restart.

Resource groups also require access control to be enabled (`acl.enabled=true`)
before principals can be mapped to a group, and every pool that executes SQL
must run in Fiber mode, which is the default. What happens when a pool is in
legacy mode depends on how the feature was turned on. Left at its default, it
turns itself off and logs an error naming the pool and the setting to change.
Asked for explicitly, it fails startup with the same error, because an explicit
request and a legacy pool cannot both be honoured.

## General

### resource.groups.enabled

- **Default**: `true`
- **Reloadable**: no

Master switch. When `false`, resource group admission, CPU scheduling and group
memory accounting are disabled. Group definitions and principal mappings remain
in the catalog, so turning the feature back on restores the policies that were
already there.

`true` also makes the catalog a hard dependency: an instance whose catalog
cannot be read does not start, and a replica whose catalog is not current is not
promoted. With `false`, both conditions are logged and ignored. See
[Behaviour under failure and on replicas](/docs/concepts/resource-groups/#behaviour-under-failure-and-on-replicas).

Existing principal-specific and instance-default single-query memory limits
continue to apply when resource groups are disabled.

Left unset, this resolves to `false` on an instance whose SQL pools are in
legacy mode, so upgrading such an instance does not turn the feature on and does
not stop the instance from starting. `SHOW PARAMETERS` then reports `false`,
which is the value that took effect. Set it to `true` explicitly and a legacy
pool becomes a startup error instead.

### resource.groups.cpu.capacity.cores

- **Default**: `auto`
- **Reloadable**: no

The CPU capacity that `cpu_max_percent` is a percentage of, as `auto` or a
positive decimal number of cores. `auto` detects the process affinity mask and
the most restrictive cgroup quota, preserving fractional quotas such as `500m`,
so a 50% cap on half a core really means a quarter of a core. An explicit value
is capped by successful detection; if detection fails, the explicit value stands
and the failure is logged.

When detection fails and no explicit value is set, capacity falls back to the
processor count and `questdb_resource_groups_cpu_capacity_fallback` reports `1`.

### resource.groups.process.memory.limit.bytes

- **Default**: `0`
- **Reloadable**: no

Ceiling for tracked native query memory across all groups. `0` leaves the
instance without a process ceiling, which is the default. When set, it bounds
every group and every query, so no group policy can grant more than this.

An unlimited process budget does not disable memory accounting or remove an
existing single-query limit. The group-level SQL parameter `memory_limit` uses
`RESET (memory_limit)` to clear its ceiling; it does not accept `0`.

This is not a process RSS limit. It covers tracked query memory only, not JVM
heap, memory-mapped table pages or long-lived engine caches.

### resource.groups.queue.timeout.millis

- **Default**: `30000`
- **Reloadable**: no

How long a queued query waits for an admission slot in a group that does not set
its own `queue_timeout`. A query that waits longer fails with
`Resource Group admission queue timeout`.

## See also

- [Resource groups concept](/docs/concepts/resource-groups/)
- [Configure and use resource groups](/docs/operations/resource-groups/)
- [Identity and Access Management configuration](/docs/configuration/iam/)
