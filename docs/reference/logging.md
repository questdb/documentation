---
title: Logging
description: Create various logs and customize a log.conf within QuestDB.
---

The logging behavior of QuestDB may be set in dedicated configuration files or
by environment variables.

This section describes how to configure logging using these methods.

## Enable debug log

QuestDB `DEBUG` logging can be set globally.

1. Provide the java option `-Debug` on startup
2. Setting the `QDB_DEBUG=true` as an environment variable

## Configure log.conf

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
w.http.min.scope=http-min-server
```

### Log writer types

There are four types of writer.

Which one you need depends on your use case.

| Available writers | Description                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| file              | Select from one of the two above patterns. Write to a single log that will grow indefinitely, or write a rolling log. Rolling logs can be split into `minute`, `hour`, `day`, `month` or `year`.       |
| stdout            | Writes logs to standard output.                                                                                                                                                                        |
| http.min          | REST API exposed for additional error monitoring. Enabled at port `9003` by default. For more detail, see [Health Monitoring](/docs/operations/health-monitoring/#min-health-server) under Operations. |

## Environment variables

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

## Docker logging

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

# min http server, used monitoring
w.http.min.class=io.questdb.log.LogConsoleWriter
w.http.min.level=ERROR
w.http.min.scope=http-min-server
```

The current directory can be mounted:

```shell title="Mount the current directory to a QuestDB container"
docker run -p 9000:9000 -v "$(pwd):/var/lib/questdb/" questdb/questdb
```

The container logs will be written to disk using the logging level and file name
provided in the `./conf/log.conf` file, in this case in `./questdb-docker.log`.

## Prometheus Alertmanager

QuestDB includes a log writer that sends any message logged at critical level
(logger.critical("may-day")) to Prometheus Alertmanager over a TCP/IP socket.
Details for configuring this can be found in the
[Prometheus documentation](/docs/third-party-tools/prometheus). To configure
this writer, add it to the `writers` config alongside other log writers.

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
