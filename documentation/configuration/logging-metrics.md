---
title: Logging & Metrics
description: Configuration settings for QuestDB logging, the Prometheus metrics endpoint, and the sys.metrics table.
---

These settings control log output format and timezone, the Prometheus metrics
endpoint, and the `sys.metrics` table. Additional log configuration is
available in `log.conf`.

For more information, see
[Logging and metrics](/docs/operations/logging-metrics/).

## Logging

### log.level.verbose

- **Default**: `false`
- **Reloadable**: no

Converts short-hand log level indicators (`E`, `C`, `I`) into long-hand
(`ERROR`, `CRITICAL`, `INFO`).

### log.timestamp.timezone

- **Default**: `Z` (UTC)
- **Reloadable**: no

Sets the timezone for log timestamps. Can be a timezone ID such as
`Antarctica/McMurdo`, `SystemDefault` to use the system timezone, or the
default UTC with `Z` suffix.

## Metrics endpoint

### metrics.enabled

- **Default**: `false`
- **Reloadable**: no

Enables the Prometheus `/metrics` endpoint on the minimal HTTP server. See the
[Prometheus integration guide](/docs/integrations/other/prometheus/).

## Persisted metrics

These keys control the `sys.metrics` table, see
[Persisted metrics](/docs/operations/logging-metrics/#persisted-metrics).

### metrics.persist.enabled

- **Default**: `true`
- **Reloadable**: no

Samples metrics into `sys.metrics`. When set to `false`, the existing table is
kept and can be dropped with `DROP TABLE 'sys.metrics'`.

Persistence also counts unhandled errors for
[`http.pessimistic.health.check.enabled`](/docs/configuration/http-server/#httppessimistichealthcheckenabled),
even with `metrics.enabled=false`. With both keys set to `false`, the health
check always returns HTTP 200.

### metrics.persist.exclude

- **Default**: `worker_pool_fiber_(max_live|mounted|retained|finalizing|outstanding|created|retired|mount|wake|launch|scheduler_publication|scheduler_selection|orphan_recovery|mount_budget_exhaustion)(__.*)?`
- **Reloadable**: no

Java regular expression that must match the whole column name. Matching
metrics are not persisted. A custom value replaces the default. Set to an empty
value to persist every metric.

### metrics.persist.interval

- **Default**: `1s`
- **Reloadable**: no

How often a sample row is written.

### metrics.persist.parquet.enabled

- **Default**: `true`
- **Reloadable**: no

Converts completed day partitions of `sys.metrics` to
[Parquet](/docs/concepts/parquet/).

### metrics.persist.sync.interval

- **Default**: `-1`
- **Reloadable**: no

How often `sys.metrics` commits are synced to disk when
[`cairo.commit.mode`](/docs/configuration/cairo-engine/#cairocommitmode) is
`sync` or `async`. `-1` never syncs, `0` syncs every sample, and a duration
such as `1m` syncs at most that often.

### metrics.persist.ttl

- **Default**: `1 WEEK`
- **Reloadable**: no

How long `sys.metrics` keeps data, using [TTL](/docs/concepts/ttl/) syntax,
for example `3 DAYS` or `1 MONTH`. Values in hours must be a multiple of 24.
This also applies on QuestDB Enterprise, where system tables keep TTL instead
of a storage policy.

### metrics.persist.virtual.interval

- **Default**: `60s`
- **Reloadable**: no

How often the memory gauges, such as `memory_rss`, are refreshed. See
[Metric history in `sys.metrics`](/docs/operations/logging-metrics/#persisted-metrics)
for the full list.
