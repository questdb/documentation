---
title: Configuration
description: Server configuration keys reference documentation.
---

import { ConfigTable } from "@theme/ConfigTable"
import sharedWorkerConfig from "./_shared-worker.config.json"
import httpMinimalConfig from "./_http-minimal.config.json"
import httpConfig from "./_http.config.json"
import cairoConfig from "./_cairo.config.json"
import parallelSqlConfig from "./_parallel-sql.config.json"
import walConfig from "./_wal.config.json"
import csvImportConfig from "./_csv-import.config.json"
import postgresConfig from "./_postgres.config.json"
import tcpConfig from "./_tcp.config.json"
import udpConfig from "./_udp.config.json"

This page describes methods for configuring QuestDB server settings.
Configuration can be set either:

- In the `server.conf` configuration file available in the
  [root directory](/docs/concept/root-directory-structure/)
- Using environment variables

When a key is absent from both the configuration file and the environment
variables, the default value is used. Configuration of logging is handled
separately and details of configuring this behavior can be found at the
[logging section](#logging) below.

## Environment variables

All settings in the configuration file can be set or overridden using
environment variables. If a key is set in both the `server.conf` file and via an
environment variable, the environment variable will take precedence and the
value in the server configuration file will be ignored.

To make these configuration settings available to QuestDB via environment
variables, they must be in the following format:

```shell
QDB_<KEY_OF_THE_PROPERTY>
```

Where `<KEY_OF_THE_PROPERTY>` is equal to the configuration key name. To
properly format a `server.conf` key as an environment variable it must have:

1. `QDB_` prefix
2. uppercase characters
3. all `.` period characters replaced with `_` underscore

For example, the server configuration key for shared workers must be passed as
described below:

| `server.conf` key     | env var                   |
| --------------------- | ------------------------- |
| `shared.worker.count` | `QDB_SHARED_WORKER_COUNT` |

:::note

QuestDB applies these configuration changes on startup and a running instance
must be restarted in order for configuration changes to take effect

:::

### Examples

The following configuration property customizes the number of worker threads
shared across the application:

```shell title="conf/server.conf"
shared.worker.count=5
```

```shell title="Customizing the worker count via environment variable"
export QDB_SHARED_WORKER_COUNT=5
```

## Docker

This section describes how to configure QuestDB server settings when running
QuestDB in a Docker container. A command to run QuestDB via Docker with default
interfaces is as follows:

```shell title="Example of running docker container with built-in storage"
docker run -p 9000:9000 \
 -p 9009:9009 \
 -p 8812:8812 \
 -p 9003:9003 \
 questdb/questdb
```

This publishes the following ports:

- `-p 9000:9000` - [REST API](/docs/reference/api/rest/) and
  [Web Console](/docs/develop/web-console/)
- `-p 9009:9009` - [InfluxDB line protocol](/docs/reference/api/ilp/overview/)
- `-p 8812:8812` - [Postgres wire protocol](/docs/reference/api/postgres/)
- `-p 9003:9003` -
  [Min health server and Prometheus metrics](#minimal-http-server/)

The examples in this section change the default HTTP and REST API port from
`9000` to `4000` for illustrative purposes, and demonstrate how to publish this
port with a non-default property.

### Environment variables

Server configuration can be passed to QuestDB running in Docker by using the
`-e` flag to pass an environment variable to a container:

```bash
docker run -p 4000:4000 -e QDB_HTTP_BIND_TO=0.0.0.0:4000 questdb/questdb
```

### Mounting a volume

A server configuration file can be provided by mounting a local directory in a
QuestDB container. Given the following configuration file which overrides the
default HTTP bind property:

```shell title="./server.conf"
http.bind.to=0.0.0.0:4000
```

Running the container with the `-v` flag allows for mounting the current
directory to QuestDB's `conf` directory in the container. With the server
configuration above, HTTP ports for the web console and REST API will be
available on `localhost:4000`:

```bash
docker run -v "$(pwd):/var/lib/questdb/conf" -p 4000:4000 questdb/questdb
```

To mount the full root directory of QuestDB when running in a Docker container,
provide a the configuration in a `conf` directory:

```shell title="./conf/server.conf"
http.bind.to=0.0.0.0:4000
```

Mount the current directory using the `-v` flag:

```bash
docker run -v "$(pwd):/var/lib/questdb/" -p 4000:4000 questdb/questdb
```

The current directory will then have data persisted to disk:

```bash title="Current directory contents"
├── conf
│  └── server.conf
├── db
└── public
```

## Keys and default values

This section lists the configuration keys available to QuestDB by topic or
subsystem. Parameters for specifying buffer and memory page sizes are provided
in the format `n<unit>`, where `<unit>` can be one of the following:

- `m` for **MB**
- `k` for **kB**

For example:

```ini title="Setting maximum send buffer size to 2MB per TCP socket"
http.net.connection.sndbuf=2m
```

### Shared worker

Shared worker threads service SQL execution subsystems and (in the default
configuration) every other subsystem.

<ConfigTable rows={sharedWorkerConfig} />

### Minimal HTTP server

This server runs embedded in a QuestDB instance by default and enables health
checks of an instance via HTTP. It responds to all requests with a HTTP status
code of `200` unless the QuestDB process dies.

:::tip

Port `9003` also provides a `/metrics` endpoint with Prometheus metrics exposed.
Examples of how to use the min server and Prometheus endpoint can be found on
the [health monitoring page](/docs/operations/health-monitoring/).

:::

<ConfigTable rows={httpMinimalConfig} />

### HTTP server

This section describes configuration settings for the Web Console and the REST
API available by default on port `9000`. For details on the use of this
component, refer to the [web console documentation](/docs/develop/web-console/)
page.

<ConfigTable rows={httpConfig} />

### Cairo engine

This section describes configuration settings for the Cairo SQL engine in
QuestDB.

<ConfigTable rows={cairoConfig} />

### WAL table configurations

The following WAL tables settings on parallel threads are configurable for
applying WAL data to the table storage:

<ConfigTable rows={walConfig} />

### CSV import

This section describes configuration settings for using `COPY` to import large
CSV files.

Mandatory settings to enable `COPY`:

<ConfigTable
  rows={csvImportConfig}
  pick={["cairo.sql.copy.root", "cairo.sql.copy.work.root"]}
/>

Optional settings for `COPY`:

<ConfigTable
  rows={csvImportConfig}
  pick={[
    "cairo.iouring.enabled",
    "cairo.sql.copy.buffer.size",
    "cairo.sql.copy.log.retention.days",
    "cairo.sql.copy.max.index.chunk.size",
    "cairo.sql.copy.queue.capacity",
  ]}
/>

#### CSV import configuration for Docker

For QuestDB instances using Docker:

- `cairo.sql.copy.root` must be defined using one of the following settings:
  - The environment variable `QDB_CAIRO_SQL_COPY_ROOT`.
  - The `cairo.sql.copy.root` in `server.conf`.
- The path for the source CSV file is mounted.
- The source CSV file path and the path defined by `QDB_CAIRO_SQL_COPY_ROOT` are
  identical.
- It is optional to define `QDB_CAIRO_SQL_COPY_WORK_ROOT`.

The following is an example command to start a QuestDB instance on Docker, in
order to import a CSV file:

```shell
docker run -p 9000:9000 \
-v "/tmp/questdb:/var/lib/questdb" \
-v "/tmp/questdb/my_input_root:/var/lib/questdb/questdb_import" \
-e QDB_CAIRO_SQL_COPY_ROOT=/var/lib/questdb/questdb_import \
questdb/questdb
```

Where:

- `-v "/tmp/questdb/my_input_root:/var/lib/questdb/questdb_import"`: Defining a
  source CSV file location to be `/tmp/questdb/my_input_root` on local machine
  and mounting it to `/var/lib/questdb/questdb_import` in the container.
- `-e QDB_CAIRO_SQL_COPY_ROOT=/var/lib/questdb/questdb_import`: Defining the
  copy root directory to be `/var/lib/questdb/questdb_import`.

It is important that the two path are identical
(`/var/lib/questdb/questdb_import` in the example).

### Parallel SQL execution

This section describes settings that can affect parallelism level of SQL
execution and therefore performance.

<ConfigTable rows={parallelSqlConfig} />

### Postgres wire protocol

This section describes configuration settings for client connections using
PostgresSQL wire protocol.

<ConfigTable rows={postgresConfig} />

### InfluxDB line protocol

This section describes ingestion settings for incoming messages using InfluxDB
line protocol.

| Property                  | Default | Description                                                                                                                                                                |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| line.default.partition.by | DAY     | Table partition strategy to be used with tables that are created automatically by InfluxDB Line Protocol. Possible values are: `HOUR`, `DAY`, `WEEK`, `MONTH`, and `YEAR`. |

#### TCP specific settings

<ConfigTable rows={tcpConfig} />

#### UDP specific settings

:::note

The UDP receiver is deprecated since QuestDB version 6.5.2. We recommend the
[InfluxDB Line Protocol TCP receiver](/docs/reference/api/ilp/overview/)
instead.

:::

<ConfigTable rows={udpConfig} />

### Config Validation

The database startup phase checks for configuration issues, such as invalid or
deprecated settings. Issues may be classified as advisories or errors. Advisory
issues are [logged](/docs/concept/root-directory-structure/#log-directory)
without causing the database to stop its startup sequence: These are usually
setting deprecation warnings. Configuration errors can optionally cause the
database to fail its startup.

| Property                 | Default | Description                                                    |
| ------------------------ | ------- | -------------------------------------------------------------- |
| config.validation.strict | false   | When enabled, startup fails if there are configuration errors. |

_We recommended enabling strict validation._

### Telemetry

QuestDB sends anonymous telemetry data with information about usage which helps
us improve the product over time. We do not collect any personally-identifying
information, and we do not share any of this data with third parties.

| Property                 | Default | Description                                                                                                                                   |
| ------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| telemetry.enabled        | true    | Enable or disable anonymous usage metrics collection.                                                                                         |
| telemetry.hide.tables    | false   | Hides telemetry tables from `select * from tables()` output. As a result, telemetry tables will not be visible in the Web Console table view. |
| telemetry.queue.capacity | 512     | Capacity of the internal telemetry queue, which is the gateway of all telemetry events. This queue capacity does not require tweaking.        |

### Metrics

QuestDB exposes a `/metrics` endpoint providing internal system metrics in the
Prometheus format. To use this functionality and get started with an example
configuration, refer to the
[Prometheus documentation](/docs/third-party-tools/prometheus/).

| Property        | Default | Description                         |
| --------------- | ------- | ----------------------------------- |
| metrics.enabled | false   | Enable or disable metrics endpoint. |

## Logging

The logging behavior of QuestDB may be set in dedicated configuration files or
by environment variables. This section describes how to configure logging using
these methods.

### Configuration file

Logs may be configured via a dedicated configuration file `log.conf`.

```shell title="log.conf"
# list of configured writers
writers=file,stdout

# file writer
#w.file.class=io.questdb.log.LogFileWriter
#w.file.location=questdb-debug.log
#w.file.level=INFO,ERROR

# rolling file writer
#w.file.class=io.questdb.log.LogRollingFileWriter
#w.file.location=${log.dir}/questdb-rolling.log.${date:yyyyMMdd}
#w.file.level=INFO,ERROR
#rollEvery accepts: day, hour, minute, month
#w.file.rollEvery=day
#rollSize specifies size at which to roll a new log file: a number followed by k, m, g (KB, MB, GB respectively)
#w.file.rollSize=128m
#lifeDuration accepts: a number followed by s, m, h, d, w, M, y for seconds, minutes, hours, etc.
#w.file.lifeDuration=1d
#sizeLimit is the max fileSize of the log directory. Follows same format as rollSize
#w.file.sizeLimit=1g

# stdout
w.stdout.class=io.questdb.log.LogConsoleWriter
w.stdout.level=INFO,ERROR
```

QuestDB will look for `/log.conf` first in `conf/` directory and then on the
classpath unless this name is overridden via a command line property:
`-Dout=/something_else.conf`. QuestDB will create `conf/log.conf` using default
values If `-Dout` is not set and file doesn't exist .

On Windows log messages go to depending on run mode :

- interactive session - console and `$dataDir\log\stdout-%Y-%m-%dT%H-%M-%S.txt`
  (default is `.\log\stdout-%Y-%m-%dT%H-%M-%S.txt` )
- service - `$dataDir\log\service-%Y-%m-%dT%H-%M-%S.txt` (default is
  `C:\Windows\System32\qdbroot\log\service-%Y-%m-%dT%H-%M-%S.txt` )

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

### Configuring Docker logging

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

### Prometheus Alertmanager

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

### Debug

QuestDB logging can be quickly forced globally to `DEBUG` via either providing
the java option `-Debug` or setting the environment variable `QDB_DEBUG=true`.
