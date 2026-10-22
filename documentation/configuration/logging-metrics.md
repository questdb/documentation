---
title: Logging & Metrics
description: Configuration settings for logging and metrics in QuestDB.
---

These settings control log output format and timezone, the Prometheus metrics
endpoint, and the `sys.metrics` table where QuestDB stores its own metric
history. Additional log configuration is available in `log.conf`.

For more information and details of Prometheus metrics and `sys.metrics`, see
the [Logging & Metrics](/docs/operations/logging-metrics/) documentation.

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

Enables the Prometheus `/metrics` endpoint on the minimal HTTP server, port
`9003` by default. See the
[Prometheus integration guide](/docs/integrations/other/prometheus/). This key
does not affect [persisted metrics](#persisted-metrics), which have their own
switch.

## Persisted metrics

Available from QuestDB 10.0.2. These keys control the background job that
samples metrics into the node-local `sys.metrics` table. See
[Persisted metrics](/docs/operations/logging-metrics/#persisted-metrics) for
the table layout and example queries. An invalid value for any of these keys
stops the server at startup.

### metrics.persist.enabled

- **Default**: `true`
- **Reloadable**: no

Samples metrics into `sys.metrics`. Set to `false` to stop writing the table.
An existing table is kept, and you can drop it with `DROP TABLE 'sys.metrics'`.
While enabled, the server keeps internal metric accounting on, including
health metrics, even when `metrics.enabled` is `false`. Instances started with
`readonly=true` never write the table.

### metrics.persist.exclude

- **Default**:
  `worker_pool_fiber_(max_live|mounted|retained|finalizing|outstanding|created|retired|mount|wake|launch|scheduler_publication|scheduler_selection|orphan_recovery|mount_budget_exhaustion)(__.*)?`
- **Reloadable**: no

Java regular expression matched against the full column name, after label
flattening, such as `worker_pool_fiber_live__shared_query`. Matching metrics
are not persisted. The default leaves out the detailed fiber scheduler
counters of every worker pool. Set it to an empty value to persist every
metric. Excluding a metric doesn't drop a column that already exists.

### metrics.persist.interval

- **Default**: `1s`
- **Reloadable**: no

How often a sample row is written. Accepts a duration such as `500ms`, `1s` or
`1m`; a bare number is milliseconds. Must be greater than zero. The default
writes 86,400 rows per day. A longer interval stores fewer rows at the cost of
coarser history.

### metrics.persist.parquet.enabled

- **Default**: `true`
- **Reloadable**: no

Converts each completed day partition of `sys.metrics` to
[Parquet](/docs/concepts/parquet/), at day rollover and at startup. The current
day stays in native format. Set to `false` to keep every partition native.

### metrics.persist.sync.interval

- **Default**: `-1`
- **Reloadable**: no

How often `sys.metrics` commits sync to disk. Takes effect only when
[`cairo.commit.mode`](/docs/configuration/cairo-engine/#cairocommitmode) is
`sync` or `async`. A negative value never syncs, `0` syncs every sample, and a
positive interval, such as `1m`, syncs at most that often. Samples in between
commit without a sync, so an OS crash or power loss loses at most one interval
of history. Syncing every sample of this wide table under a syncing commit
mode is costly, which is why the default never syncs.

### metrics.persist.ttl

- **Default**: `1 WEEK`
- **Reloadable**: no

How long `sys.metrics` keeps data, using the
[TTL syntax](/docs/concepts/ttl/) of `CREATE TABLE`, for example `3 DAYS` or
`1 MONTH`. The table is partitioned by day, so the value must be a whole
number of days: `12 HOURS` fails at startup, `48 HOURS` is accepted. On
startup, the server applies a changed value to the existing table.

### metrics.persist.virtual.interval

- **Default**: `60s`
- **Reloadable**: no

How often process-level gauges, such as `memory_rss`, `memory_mem_used` and
the `memory_jvm_*` gauges, are read. Rows written between two readings repeat
the last value. Uses the same duration format as `metrics.persist.interval` and
must be greater than zero.
