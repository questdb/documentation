---
title: Logging and metrics
description: Configure and understand QuestDB logging and metrics, including log levels, configuration options, and Prometheus integration.
---

import { ConfigTable } from "@theme/ConfigTable"
import httpMinimalConfig from "./_http-minimal.config.json"

This page outlines logging in QuestDB. It covers how to configure logs via `log.conf` and expose metrics via Prometheus.

- [Logging](/docs/operations/logging-metrics/#logging)
- [Metrics](/docs/operations/logging-metrics/#metrics)

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

The following configuration options can be set in your `server.conf`:

<ConfigTable rows={httpMinimalConfig} />

:::warning

On systems with
[8 Cores and less](/docs/getting-started/capacity-planning/#cpu-cores), contention
for threads might increase the latency of health check service responses. If you
use a load balancer, and it thinks the QuestDB service is dead with nothing
apparent in the QuestDB logs, you may need to configure a dedicated thread pool
for the health check service. To do so, increase `http.min.worker.count` to `1`.

:::

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

When the metrics subsystem is disabled, the health check endpoint always returns
the HTTP 200 status code.
