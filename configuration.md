---
title: Configuration
description: Server configuration keys reference documentation.
---

import { ConfigTable } from "@theme/ConfigTable"
import sharedWorkerConfig from "./configuration-utils/_shared-worker.config.json"
import httpConfig from "./configuration-utils/_http.config.json"
import cairoConfig from "./configuration-utils/_cairo.config.json"
import parallelSqlConfig from "./configuration-utils/_parallel-sql.config.json"
import walConfig from "./configuration-utils/_wal.config.json"
import csvImportConfig from "./configuration-utils/_csv-import.config.json"
import postgresConfig from "./configuration-utils/_postgres.config.json"
import tcpConfig from "./configuration-utils/_tcp.config.json"
import udpConfig from "./configuration-utils/_udp.config.json"
import replicationConfig from "./configuration-utils/_replication.config.json"
import oidcConfig from "./configuration-utils/_oidc.config.json"

This page describes methods for configuring QuestDB server settings.

Configuration can be set either:

- In the `server.conf` configuration file available in the
  [root directory](/docs/concept/root-directory-structure/)
- Using environment variables

When a key is absent from both the config file and the environment variables,
the default value is used.

:::note

**For Windows users**

When entering path values, use either `\\` or `/` instead of the native path
separator char `\`.

- 👍 `C:\\path\\to\\file\\path`
- 👍 `C:/path/to/file`
- 👎 `C:\path\to\file`

The single backslash is interpreted as an escape sequence start within
[Java properties](https://docs.oracle.com/javase/8/docs/api/java/util/Properties.html).

:::

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

### HTTP server

This section describes configuration settings for the Web Console and the REST
API available by default on port `9000`. For details on the use of this
component, refer to the [web console documentation](/docs/web-console/) page.

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

### InfluxDB Line Protocol (ILP)

This section describes ingestion settings for incoming messages using InfluxDB
line protocol.

| Property                  | Default | Description                                                                                                                                                                |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| line.default.partition.by | DAY     | Table partition strategy to be used with tables that are created automatically by InfluxDB Line Protocol. Possible values are: `HOUR`, `DAY`, `WEEK`, `MONTH`, and `YEAR`. |

#### HTTP specific settings

| Property               | Default | Description                                                                                                                                       |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| line.http.enabled      | true    | Enable ILP over HTTP. Default port is 9000. Enabled by default within open source versions, defaults to false and must be enabled for Enterprise. |
| line.http.ping.version | v2.2.2  | Version information for the ping response of ILP over HTTP.                                                                                       |
| HTTP properties        | Various | See [HTTP settings](/docs/configuration/#http-server) for general HTTP configuration. ILP over HTTP inherits from HTTP settings.                  |

#### TCP specific settings

<ConfigTable rows={tcpConfig} />

#### UDP specific settings

:::note

The UDP receiver is deprecated since QuestDB version 6.5.2. We recommend the
[InfluxDB Line Protocol TCP receiver](/docs/reference/api/ilp/overview/)
instead.

:::

<ConfigTable rows={udpConfig} />

### Database replication

:::note

Replication is [Enterprise](/enterprise/) only.

:::

Replication enables high availability clusters.

For setup instructions, see the
[replication operations](/docs/operations/replication/) guide.

For an overview of the concept, see the
[replication concept](/docs/concept/replication/) page.

For a tuning guide see... the
[replication tuning guide](/docs/guides/replication-tuning/).

<ConfigTable rows={replicationConfig} />

### OpenID Connect (OIDC)

:::note

OpenID Connect is [Enterprise](/enterprise/) and [Cloud](/cloud/) only.

:::

Integrate with OpenID Connect (OIDC) to sync QuestDB with an Identity Provider
(IdP).

For a full explanation of OIDC, see the
[OpenID Connect (OIDC) integration guide](/docs/operations/openid-connect-oidc-integration).

<ConfigTable rows={oidcConfig} />

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

## Logging & Metrics

For logging information with `log.conf` and for how to enable metrics with
Prometheus, see [Logging & Metrics](/docs/operations/logging-metrics/).
