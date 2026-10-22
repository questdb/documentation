---
title: Logging and metrics
description: Configure and understand QuestDB logging and metrics, including log levels, configuration options, and Prometheus integration.
---


This page outlines logging in QuestDB. It covers how to configure logs via
`log.conf`, expose metrics via Prometheus, and query the metric history that
QuestDB keeps in its own `sys.metrics` table.

- [Logging](/docs/operations/logging-metrics/#logging)
- [Metrics](/docs/operations/logging-metrics/#metrics)
- [Persisted metrics](/docs/operations/logging-metrics/#persisted-metrics)

## Log location

QuestDB creates the following file structure in its
[root_directory](/docs/concepts/deep-dive/root-directory-structure/):

```filestructure
questdb
├── conf
├── db
├── log
├── public
└── snapshot (optional)
```

Log files are stored in the `log` folder:

```filestructure
├── log
│   ├── stdout-2020-04-15T11-59-59.txt
│   └── stdout-2020-04-12T13-31-22.txt
```

## Understanding log levels

QuestDB provides the following types of log information:

| Type     | Marker | Details                                                                                                                                                                                                           | Default  |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Advisory | A      | Startup information such as hosts, listening ports, etc. Rarely used after startup                                                                                                                                | Enabled  |
| Critical | C      | Internal database errors. Serious issues. Things that should not happen in general operation.                                                                                                                     | Enabled  |
| Error    | E      | An error, usually (but not always) caused by a user action such as inserting a `symbol` into a `timestamp` column. For context on how this error happened, check for Info-level messages logged before the error. | Enabled  |
| Info     | I      | Logs for activities. Info-level messages often provide context for an error if one is logged later.                                                                                                               | Enabled  |
| Debug    | D      | Finer details on what is happening. Useful to debug issues.                                                                                                                                                       | Disabled |

For more information, see the
[QuestDB source code](https://github.com/questdb/questdb/blob/master/core/src/main/java/io/questdb/log/LogLevel.java).

### Example log messages

Advisory:

```
2023-02-24T14:59:45.076113Z A server-main Config:
2023-02-24T14:59:45.076130Z A server-main  - http.enabled : true
2023-02-24T14:59:45.076144Z A server-main  - tcp.enabled  : true
2023-02-24T14:59:45.076159Z A server-main  - pg.enabled   : true
```

Critical:

```
2022-08-08T11:15:13.040767Z C i.q.c.p.WriterPool could not open [table=`sys.text_import_log`, thread=1, ex=could not open read-write [file=/opt/homebrew/var/questdb/db/sys.text_import_log/_todo_], errno=13]
```

Error:

```
2023-02-24T14:59:45.059012Z I i.q.c.t.t.InputFormatConfiguration loading input format config [resource=/text_loader.json]
2023-03-20T08:38:17.076744Z E i.q.c.l.u.AbstractLineProtoUdpReceiver could not set receive buffer size [fd=140, size=8388608, errno=55]
```

Info:

```
2020-04-15T16:42:32.879970Z I i.q.c.TableReader new transaction [txn=2, transientRowCount=1, fixedRowCount=1, maxTimestamp=1585755801000000, attempts=0]
2020-04-15T16:42:32.880051Z I i.q.g.FunctionParser call to_timestamp('2020-05-01:15:43:21','yyyy-MM-dd:HH:mm:ss') -> to_timestamp(Ss)
```

Debug:

```
2023-03-31T11:47:05.723715Z D i.q.g.FunctionParser call cast(investmentMill,INT) -> cast(Li)
2023-03-31T11:47:05.723729Z D i.q.g.FunctionParser call rnd_symbol(4,4,4,2) -> rnd_symbol(iiii)
```

## Logging

The logging behavior of QuestDB may be set in dedicated configuration files or
by environment variables.

This section describes how to configure logging using these methods.

### Enable debug log

QuestDB `DEBUG` logging can be set globally.

1. Provide the java option `-Debug` on startup
2. Setting the `QDB_DEBUG=true` as an environment variable

### Configure log.conf

Logs may be configured via a dedicated configuration file `log.conf`.

QuestDB will look for `/log.conf` first in `conf/` directory and then on the
classpath, unless this name is overridden via a command line property:
`-Dout=/something_else.conf`.

QuestDB will create `conf/log.conf` using default values if `-Dout` is not set
and file doesn't exist .

On Windows log messages go to depending on run mode :

- interactive session - console and `$dataDir\log\stdout-%Y-%m-%dT%H-%M-%S.txt`
  (default is `.\log\stdout-%Y-%m-%dT%H-%M-%S.txt` )
- service - `$dataDir\log\service-%Y-%m-%dT%H-%M-%S.txt` (default is
  `C:\Windows\System32\qdbroot\log\service-%Y-%m-%dT%H-%M-%S.txt` )

The possible values to enable within the `log.conf` appear as such:

```shell title="log.conf"
# list of configured writers
writers=file,stdout,http.min

# rolling file writer
w.file.class=io.questdb.log.LogRollingFileWriter
w.file.location=${log.dir}/questdb-rolling.log.${date:yyyyMMdd}
w.file.level=INFO,ERROR
w.file.rollEvery=day
w.file.rollSize=1g

# Optionally, use a single log
# w.file.class=io.questdb.log.LogFileWriter
# w.file.location=questdb-docker.log
# w.file.level=INFO,ERROR,DEBUG

# stdout
w.stdout.class=io.questdb.log.LogConsoleWriter
w.stdout.level=INFO

# min http server, used for error monitoring
w.http.min.class=io.questdb.log.LogConsoleWriter
w.http.min.level=ERROR
## Scope provides specific context for targeted log parsing
w.http.min.scope=http-min-server
```

#### Log writer types

There are four types of writer.

Which one you need depends on your use case.

| Available writers | Description                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| file              | Select from one of the two above patterns. Write to a single log that will grow indefinitely, or write a rolling log. Rolling logs can be split into `minute`, `hour`, `day`, `month` or `year`. |
| stdout            | Writes logs to standard output.                                                                                                                                                                  |
| http.min          | Enabled at port `9003` by default. For more information, see the next section: [minimal HTTP server](#minimal-http-server).                                                                      |

### Minimal HTTP server

To provide a dedicated health check feature that would have no performance knock
on other system components, QuestDB decouples health checks from the REST
endpoints used for querying and ingesting data. For this purpose, a `min` HTTP
server runs embedded in a QuestDB instance and has a separate log and thread
pool configuration.

The `min` server is enabled by default and will reply to any `HTTP GET` request
to port `9003`:

```shell title="GET health status of local instance"
curl -v http://127.0.0.1:9003
```

The server will respond with an HTTP status code of `200`, indicating that the
system is operational:

```shell title="200 'OK' response"
*   Trying 127.0.0.1...
* TCP_NODELAY set
* Connected to 127.0.0.1 (127.0.0.1) port 9003 (#0)
> GET / HTTP/1.1
> Host: 127.0.0.1:9003
> User-Agent: curl/7.64.1
> Accept: */*
>
< HTTP/1.1 200 OK
< Server: questDB/1.0
< Date: Tue, 26 Jan 2021 12:31:03 GMT
< Transfer-Encoding: chunked
< Content-Type: text/plain
<
* Connection #0 to host 127.0.0.1 left intact
```

Path segments are ignored which means that optional paths may be used in the URL
and the server will respond with identical results, e.g.:

```shell title="GET health status with arbitrary path"
curl -v http://127.0.0.1:9003/status
```

For configuration options, see the
[Minimal HTTP server](/docs/configuration/http-min-server/) reference.

:::warning

On systems with
[8 Cores and less](/docs/getting-started/capacity-planning/#cpu-cores), contention
for threads might increase the latency of health check service responses. If you
use a load balancer, and it thinks the QuestDB service is dead with nothing
apparent in the QuestDB logs, you may need to configure a dedicated thread pool
for the health check service. To do so, increase `http.min.worker.count` to `1`.

:::

#### Lifecycle endpoint

`GET /lifecycle` on the same port returns the startup and shutdown state of
every server component as JSON, for probes and coordinators that need more
than the `200` of the health check:

```shell
curl http://127.0.0.1:9003/lifecycle
```

```json
{
  "capturedAtMicros": 1756380000123456,
  "components": [
    {
      "name": "engine",
      "state": "READY",
      "lastTransitionMicros": 1756379991204000,
      "latestProgress": null,
      "hardRequiredDependencies": ["factory-provider"],
      "softDependencies": []
    }
  ]
}
```

- `capturedAtMicros` and `lastTransitionMicros` are epoch microseconds.
- `state` is one of `INIT`, `STARTING`, `DEGRADED`, `READY`, `SWITCHING`,
  `STOPPING`, `STOPPED`, `FAILED`.
- `latestProgress` is `null`, or a progress object while a component is
  restoring data.
- The dependency lists name the components a component waits for.

The response is chunked and lists every component in registration order. Like
the health check, the endpoint follows
[`http.health.check.authentication.required`](/docs/configuration/http-min-server/#httphealthcheckauthenticationrequired).

In QuestDB Enterprise the response also carries `currentRole`, `switchInFlight`,
and `ready`, and the port accepts `POST /lifecycle/switch`. See
[Failover and role switch](/docs/high-availability/failover/#lifecycle-api).

### Environment variables

Values in the log configuration file can be overridden with environment
variables. All configuration keys must be formatted as described in the
[environment variables](#environment-variables) section above.

For example, to set logging on `ERROR` level only:

```shell title="Setting log level to ERROR in log-stdout.conf"
w.stdout.level=ERROR
```

This can be passed as an environment variable as follows:

```shell title="Setting log level to ERROR via environment variable"
export QDB_LOG_W_STDOUT_LEVEL=ERROR
```

### Docker logging

When mounting a volume to a Docker container, a logging configuration file may
be provided in the container located at `./conf/log.conf`. For example, a file
with the following contents can be created:

```shell title="./conf/log.conf"
# list of configured writers
writers=file,stdout,http.min

# file writer
w.file.class=io.questdb.log.LogFileWriter
w.file.location=questdb-docker.log
w.file.level=INFO,ERROR,DEBUG

# stdout
w.stdout.class=io.questdb.log.LogConsoleWriter
w.stdout.level=INFO

# min http server, used for monitoring
w.http.min.class=io.questdb.log.LogConsoleWriter
w.http.min.level=ERROR
## Scope provides specific context for targeted log parsing
w.http.min.scope=http-min-server
```

The current directory can be mounted:

```shell title="Mount the current directory to a QuestDB container"
docker run -p 9000:9000 -v "$(pwd):/var/lib/questdb/" questdb/questdb
```

The container logs will be written to disk using the logging level and file name
provided in the `./conf/log.conf` file, in this case in `./questdb-docker.log`.

### Windows log locations

When running QuestDB as Windows service you can check status in both:

- Windows Event Viewer: Look for events with "QuestDB" source in
  `Windows Logs | Application`
- The service log file: `$dataDir\log\service-%Y-%m-%dT%H-%M-%S.txt`
  - Default: `C:\Windows\System32\qdbroot\log\service-%Y-%m-%dT%H-%M-%S.txt`

## Metrics

QuestDB exposes a `/metrics` endpoint on port `9003` for internal system metrics
in the Prometheus format. To use this functionality and get started with an
example configuration, enable it in within your `server.conf`:

| Property        | Default | Description                         |
| --------------- | ------- | ----------------------------------- |
| metrics.enabled | false   | Enable or disable metrics endpoint. |

For an example on how to setup Prometheus, see the
[QuestDB and Prometheus documentation](/docs/integrations/other/prometheus/).

To keep a metric history without an external scraper, query the
[`sys.metrics` table](#persisted-metrics) instead. It is on by default and does
not need `metrics.enabled`.

### Cold storage read metrics

_Enterprise only._

When [cold storage](/docs/concepts/cold-storage/) is enabled, the endpoint
exposes fifteen additional metrics under the `questdb_cold_chunk_` prefix,
covering the chunk cache and the range reads that serve remote partitions:

| Metric | Type | Description |
| ------ | ---- | ----------- |
| `questdb_cold_chunk_acquire_full_hit_total` | counter | Reads that found every chunk already resident |
| `questdb_cold_chunk_acquire_partial_hit_total` | counter | Reads that found some chunks and fetched the rest |
| `questdb_cold_chunk_acquire_full_miss_total` | counter | Reads where every chunk had to be fetched |
| `questdb_cold_chunk_acquire_hit_chunks_total` | counter | Chunk lookups served from the cache |
| `questdb_cold_chunk_acquire_miss_chunks_total` | counter | Chunk lookups that had to be fetched |
| `questdb_cold_chunk_download_started_total` | counter | Range requests dispatched, one per coalesced group |
| `questdb_cold_chunk_download_finished_total` | counter | Range requests that returned data |
| `questdb_cold_chunk_download_failed_total` | counter | Range requests that failed after retries |
| `questdb_cold_chunk_download_coalesced_total` | counter | Readers that attached to an in-flight download instead of starting a new one |
| `questdb_cold_chunk_release_evictions_total` | counter | Chunks evicted when their last lease was released |
| `questdb_cold_chunk_in_flight_downloads` | gauge | Range requests dispatched but not yet complete |
| `questdb_cold_chunk_pending_batches` | gauge | Batches the read coordinator is tracking |
| `questdb_cold_chunk_busy_leases` | gauge | Currently allocated leases |
| `questdb_cold_chunk_ready_chunks` | gauge | Chunks resident in the ready cache |
| `questdb_cold_chunk_pinned_bytes` | gauge | Compressed bytes resident in the ready cache |

Watch rates and ratios rather than raw totals. Sustained
`download_failed_total`, `pending_batches` sitting at its configured cap, or
`pinned_bytes` staying non-zero after query traffic stops are all worth
investigating. See
[Operating cold storage](/docs/operations/cold-storage/#cold-read-metrics).

### Replication metrics

_Enterprise only._

Two gauges describe the state of an in-place
[role switch](/docs/high-availability/failover/):

| Metric | Type | Description |
| ------ | ---- | ----------- |
| `questdb_replication_pending_upload_txn` | gauge | Committed transactions not yet uploaded to the object store, summed over the replicated tables. Poll it before demoting a primary: a demote that cannot bring it to zero within its timeout is not completed |
| `questdb_backup_active_at_last_demote` | gauge | `1` if a backup was still running when the node was last demoted, `0` otherwise. Cleared by the next promotion |

### Persisted metrics

Available from QuestDB 10.0.2.

QuestDB samples its own metrics every second by default and appends them to
the `sys.metrics` table on the same instance. You can chart memory, CPU, commit and
query activity over the past days with plain SQL, without running Prometheus or
any other scraper. Persistence is on by default and works with
`metrics.enabled=false`. The table holds the metrics of the node that writes
it. It is not replicated and other instances can't read it.

The table is created by a background job a few seconds after startup, so a
fresh server has no `sys.metrics` until the first sample. Like other system
tables, it does not appear in `SHOW TABLES`, `tables()` or the web console
schema browser. Query it by name. The name is
[`cairo.system.table.prefix`](/docs/configuration/cairo-engine/#cairosystemtableprefix)
(default `sys.`) followed by `metrics`.

#### Table layout

`sys.metrics` has one wide row per sample and one column per metric. This is an
excerpt of `SHOW CREATE TABLE 'sys.metrics'` on an open source server with
default settings:

```questdb-sql title="SHOW CREATE TABLE 'sys.metrics' (excerpt)"
CREATE TABLE 'sys.metrics' (
    ts TIMESTAMP,
    json_queries_connections LONG,
    pg_wire_connections LONG,
    worker_pool_fiber_live__shared_network LONG,
    worker_pool_fiber_live__shared_query LONG,
    unhandled_errors LONG,
    commits LONG,
    memory_tag_MMAP_DEFAULT LONG,
    memory_mem_used LONG,
    memory_rss LONG,
    cpu_questdb_percent DOUBLE,
    jvm_major_gc_count LONG
    -- ...
) timestamp(ts) PARTITION BY DAY TTL 1 WEEK BYPASS WAL;
```

- `ts` is the sample time and the designated timestamp.
- Each metric column uses the internal metric name, without the `questdb_`
  prefix of the Prometheus endpoint. Counters usually drop the Prometheus
  `_total` suffix as well, so `questdb_commits_total` is stored as `commits`
  and `questdb_memory_rss` as `memory_rss`. Run
  `SHOW COLUMNS FROM 'sys.metrics'` to list the columns on your instance.
- A labelled metric gets one column per label value, joined with a double
  underscore: `worker_pool_fiber_live__shared_query` is the `live` fiber count
  of the `shared_query` worker pool.
- Characters other than `A-Z`, `a-z`, `0-9` and `_` become `_`, and a
  leading digit becomes `_`.
- Floating-point gauges, such as `cpu_questdb_percent`, are `DOUBLE`. All other
  metrics are `LONG`.
- Counters are cumulative since the server started and restart from `0` after
  a restart. Compute rates from the difference between consecutive rows.
- Process-level gauges, such as `memory_rss`, `memory_mem_used`,
  `memory_jvm_free`, `memory_jvm_total`, `memory_jvm_max`,
  `memory_malloc_count`, `memory_free_count` and `memory_realloc_count`, are
  read every
  [`metrics.persist.virtual.interval`](/docs/configuration/logging-metrics/#metricspersistvirtualinterval)
  (60 seconds by default). The rows in between repeat the last reading.
- When a metric first appears at runtime, the job adds a column for it. Older
  rows hold `NULL` in that column. Columns are never dropped.

_Enterprise only._ The table also stores cold storage metrics, TLS
certificate expiry, and fleet-wide replication metrics such as
`replication_up_lag_txn_max`, `replication_up_tables_behind`,
`replication_up_tables_failing` and `replication_down_stalled_tables`.
Per-table replication series are not persisted.

#### Example queries

```questdb-sql title="Latest samples"
SELECT ts, memory_rss, commits, wal_written_rows
FROM 'sys.metrics'
LIMIT -3;
```

| ts                          | memory_rss | commits | wal_written_rows |
| --------------------------- | ---------- | ------- | ---------------- |
| 2026-10-22T10:27:14.693474Z | 115687424  | 15      | 1500             |
| 2026-10-22T10:27:15.694429Z | 115687424  | 17      | 1700             |
| 2026-10-22T10:27:16.695794Z | 115687424  | 19      | 1900             |

```questdb-sql title="Hourly memory and CPU over the last day"
SELECT
    ts,
    max(memory_rss) AS rss_max,
    max(memory_mem_used) AS native_max,
    avg(cpu_questdb_percent) AS cpu_avg
FROM 'sys.metrics'
WHERE ts IN '$now-1d..$now'
SAMPLE BY 1h;
```

Counters only grow, so take the difference between consecutive samples with
[`lag()`](/docs/query/functions/window-functions/reference/#lag) and add the
differences up per bucket. The `delta >= 0` filter drops the first row and the
negative step that follows a restart:

```questdb-sql title="Commits per minute over the last hour"
WITH deltas AS (
    SELECT ts, commits - lag(commits) OVER (ORDER BY ts) AS delta
    FROM 'sys.metrics'
    WHERE ts IN '$now-1h..$now'
)
SELECT ts, sum(delta) AS commits
FROM deltas
WHERE delta >= 0
SAMPLE BY 1m;
```

#### Configuration

The `metrics.persist.*` keys in `server.conf` control the sampling interval,
retention, Parquet conversion, disk sync and excluded metrics. See
[Persisted metrics configuration](/docs/configuration/logging-metrics/#persisted-metrics).
None of them are reloadable, so changes need a restart.

With the default 1 second interval, the table grows by 86,400 rows per day, and
each row holds one 8-byte value per metric, about 160 on a default open source
server. The
[`metrics.persist.ttl`](/docs/configuration/logging-metrics/#metricspersistttl)
setting (default `1 WEEK`) bounds the history, and completed day partitions
are converted to [Parquet](/docs/concepts/parquet/) to compress them. Raise
[`metrics.persist.interval`](/docs/configuration/logging-metrics/#metricspersistinterval)
to store fewer rows, or add noisy metrics to
[`metrics.persist.exclude`](/docs/configuration/logging-metrics/#metricspersistexclude).

To turn persistence off, set:

```ini title="server.conf"
metrics.persist.enabled=false
```

or the `QDB_METRICS_PERSIST_ENABLED=false` environment variable, and restart.
The server then writes no new rows, but the existing table stays in place.
Drop it once persistence is off:

```questdb-sql
DROP TABLE 'sys.metrics';
```

#### Behavior and caveats

- **QuestDB owns the table.** Don't insert into, alter or truncate
  `sys.metrics`, and don't create your own table with that name. While
  persistence runs, the job holds the table's writer, so client DDL and writes
  wait for it and time out. At startup, the job drops and recreates the table,
  losing its history, if any of these is true:
  - it is a WAL table;
  - it is not `PARTITION BY DAY`;
  - its designated timestamp is not a `TIMESTAMP` column named `ts`;
  - any other column is not `LONG` or `DOUBLE`;
  - a known metric's column has the wrong type.
- **TTL changes apply to the existing table.** At startup, the job applies the
  current `metrics.persist.ttl` to the table, so shortening it drops older
  partitions.
- **Node-local.** The table is `BYPASS WAL` and is not replicated. An instance
  started with `readonly=true` does not write it. In QuestDB Enterprise, every
  node, replicas included, writes its own `sys.metrics`.
  [Backups](/docs/operations/backup/) exclude the table, and a restore keeps
  the node's local copy.
- **Durability.** Samples are committed without a disk sync by default. A
  QuestDB crash keeps them, but an OS crash or power loss can lose recent
  history. See
  [`metrics.persist.sync.interval`](/docs/configuration/logging-metrics/#metricspersistsyncinterval).
- **Clock changes.** If the wall clock moves backwards, the job skips samples
  until the clock passes the last stored `ts`, so `ts` always increases.
- **Interaction with `metrics.enabled`.** Persistence turns on internal metric
  accounting, including the health metrics used by
  [unhandled error detection](#unhandled-error-detection), even with
  `metrics.enabled=false`. The Prometheus `/metrics` endpoint still follows
  `metrics.enabled` only.

:::tip Troubleshooting: the table stops growing

A storage error, such as a full disk, makes the job retry with a back-off that
starts at 1 second and doubles up to 1 minute. Each failure logs
`metrics persistence failed, will retry`. Any other error disables persistence
until the next restart and logs `metrics persistence disabled`. Search the
server log for these messages, fix the cause and restart.

:::

### Prometheus Alertmanager

QuestDB includes a log writer that sends any message logged at critical level
(logger.critical("may-day")) to Prometheus Alertmanager over a TCP/IP socket. To
configure this writer, add it to the `writers` config alongside other log
writers:

```ini title="log.conf"
# Which writers to enable
writers=stdout,alert

# stdout
w.stdout.class=io.questdb.log.LogConsoleWriter
w.stdout.level=INFO

# Prometheus Alerting
w.alert.class=io.questdb.log.LogAlertSocketWriter
w.alert.level=CRITICAL
w.alert.location=/alert-manager-tpt.json
w.alert.alertTargets=localhost:9093,localhost:9096,otherhost:9093
w.alert.defaultAlertHost=localhost
w.alert.defaultAlertPort=9093

# The `inBufferSize` and `outBufferSize` properties are the size in bytes for the
# socket write buffers.
w.alert.inBufferSize=2m
w.alert.outBufferSize=4m
# Delay in milliseconds between two consecutive attempts to alert when
# there is only one target configured
w.alert.reconnectDelay=250
```

Of all properties, only `w.alert.class` and `w.alert.level` are required, the
rest assume default values as stated above (except for `w.alert.alertTargets`
which is empty by default).

Alert targets are specified using `w.alert.alertTargets` as a comma-separated
list of up to 12 `host:port` TCP/IP addresses. Specifying a port is optional and
defaults to the value of `defaultAlertHost`. One of these alert managers is
picked at random when QuestDB starts, and a connection is created.

All alerts will be sent to the chosen server unless it becomes unavailable. If
it is unavailable, the next server is chosen. If there is only one server
configured and a fail-over cannot occur, a delay of 250 milliseconds is added
between send attempts.

The `w.alert.location` property refers to the path (absolute, otherwise relative
to `-d database-root`) of a template file. By default, it is a resource file
which contains:

```json title="/alert-manager-tpt.json"
[
  {
    "Status": "firing",
    "Labels": {
      "alertname": "QuestDbInstanceLogs",
      "service": "QuestDB",
      "category": "application-logs",
      "severity": "critical",
      "version": "${QDB_VERSION}",
      "cluster": "${CLUSTER_NAME}",
      "orgid": "${ORGID}",
      "namespace": "${NAMESPACE}",
      "instance": "${INSTANCE_NAME}",
      "alertTimestamp": "${date: yyyy/MM/ddTHH:mm:ss.SSS}"
    },
    "Annotations": {
      "description": "ERROR/cl:${CLUSTER_NAME}/org:${ORGID}/ns:${NAMESPACE}/db:${INSTANCE_NAME}",
      "message": "${ALERT_MESSAGE}"
    }
  }
]
```

Four environment variables can be defined, and referred to with the
`${VAR_NAME}` syntax:

- _ORGID_
- _NAMESPACE_
- _CLUSTER_NAME_
- _INSTANCE_NAME_

Their default value is `GLOBAL`, they mean nothing outside a cloud environment.

In addition, `ALERT_MESSAGE` is a placeholder for the actual `critical` message
being sent, and `QDB_VERSION` is the runtime version of the QuestDB instance
sending the alert. The `${date: <format>}` syntax can be used to produce a
timestamp at the time of sending the alert.

### Unhandled error detection

When the metrics subsystem is enabled, the health endpoint may be configured to
check the occurrences of any unhandled errors since the database started. For
any errors detected, it returns the HTTP 500 status code. The check is based on
the `questdb_unhandled_errors_total` metric.

To enable this setting, set the following in `server.conf`:

```ini title="server.conf to enable critical error checks in the health check endpoint"
metrics.enabled=true
http.pessimistic.health.check.enabled=true
```

Error accounting also runs when [metrics persistence](#persisted-metrics) is
on, which is the default, so the check works with `metrics.enabled=false`. When
both `metrics.enabled` and `metrics.persist.enabled` are `false`, the health
check endpoint always returns the HTTP 200 status code.
