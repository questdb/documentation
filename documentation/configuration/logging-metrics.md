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

### log.timezone

- **Default**: `UTC`
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

Available from QuestDB 10.0.2. These keys control the `sys.metrics` table, see
[Persisted metrics](/docs/operations/logging-metrics/#persisted-metrics).

### metrics.persist.enabled

- **Default**: `true`
- **Reloadable**: no

Samples metrics into `sys.metrics`. When set to `false`, the existing table is
kept and can be dropped with `DROP TABLE 'sys.metrics'`.

### metrics.persist.exclude

- **Default**: detailed `worker_pool_fiber_*` scheduler counters
- **Reloadable**: no

Java regular expression matched against column names. Matching metrics are not
persisted. Set to an empty value to persist every metric.

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

### metrics.persist.virtual.interval

- **Default**: `60s`
- **Reloadable**: no

How often process-level gauges, such as `memory_rss`, are refreshed.
