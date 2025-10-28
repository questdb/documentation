---
title: Configuration
description: Server configuration keys reference documentation.
---

import { ConfigTable } from "@theme/ConfigTable"
import sharedWorkerConfig from "./configuration-utils/\_shared-worker.config.json"
import httpConfig from "./configuration-utils/\_http.config.json"
import cairoConfig from "./configuration-utils/\_cairo.config.json"
import parallelSqlConfig from "./configuration-utils/\_parallel-sql.config.json"
import walConfig from "./configuration-utils/\_wal.config.json"
import csvImportConfig from "./configuration-utils/\_csv-import.config.json"
import parquetExportConfig from "./configuration-utils/\_parquet-export.config.json"
import postgresConfig from "./configuration-utils/\_postgres.config.json"
import tcpConfig from "./configuration-utils/\_tcp.config.json"
import udpConfig from "./configuration-utils/\_udp.config.json"
import replicationConfig from "./configuration-utils/\_replication.config.json"
import iamConfig from "./configuration-utils/\_iam.config.json"
import oidcConfig from "./configuration-utils/\_oidc.config.json"
import logConfig from "./configuration-utils/\_log.config.json"
import matViewConfig from "./configuration-utils/\_mat-view.config.json"
import configValidationConfig from "./configuration-utils/\_config-validation.config.json"
import telemetryConfig from "./configuration-utils/\_telemetry.config.json"

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
must be restarted in order for configuration changes to take effect.

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

## Reloadable settings

Certain configuration settings can be reloaded without having to restart the
server. To reload a setting, edit its value in the `server.conf` file and then
run the `reload_config` SQL function:

```questdb-sql title="Reload server configuration"
SELECT reload_config();
```

If the value was reloaded successfully, the `reload_config` function returns
`true` and a message is printed to the server log:

```
2025-01-02T09:52:40.833848UTC I i.q.DynamicPropServerConfiguration reloaded config option [update, key=http.net.connection.limit, old=100, new=200]
```

Each key has a `reloadable` property that indicates whether the key can be
reloaded. If yes, the `reload_config` function can be used to reload the
configuration.

All reloadable properties can be also queried from the server:

```questdb-sql title="Query reloadable properties"
(SHOW PARAMETERS) WHERE reloadable = true;
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

This section describes configuration settings for the
[Web Console](/docs/web-console/) and the REST API available by default on port
`9000`. For details on the use of this component, refer to the
[web console documentation](/docs/web-console/) page.

<ConfigTable rows={httpConfig} />

### Cairo engine

This section describes configuration settings for the Cairo SQL engine in
QuestDB.

<ConfigTable rows={cairoConfig} />

### WAL table configurations

The following WAL tables settings on parallel threads are configurable for
applying WAL data to the table storage:

<ConfigTable rows={walConfig} />

### COPY settings

#### Import 

This section describes configuration settings for using `COPY` to import large
CSV files, or export parquet files.

Settings for `COPY FROM` (import):

<ConfigTable
  rows={csvImportConfig}
  pick={[
    "cairo.sql.copy.root",
    "cairo.sql.copy.work.root",
    "cairo.iouring.enabled",
    "cairo.sql.copy.buffer.size",
    "cairo.sql.copy.log.retention.days",
    "cairo.sql.copy.max.index.chunk.size",
    "cairo.sql.copy.queue.capacity",
  ]}
/>

**CSV import configuration for Docker**

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


### Export

<ConfigTable rows={parquetExportConfig} />

Parquet export is also generally impacted by query execution and parquet conversion parameters.

If not overridden, the following default setting will be used.

<ConfigTable
    rows={cairoConfig}
    pick={[
        "cairo.partition.encoder.parquet.raw.array.encoding.enabled",
        "cairo.partition.encoder.parquet.version",
        "cairo.partition.encoder.parquet.statistics.enabled",
        "cairo.partition.encoder.parquet.compression.codec",
        "cairo.partition.encoder.parquet.compression.level",
        "cairo.partition.encoder.parquet.row.group.size",
        "cairo.partition.encoder.parquet.data.page.size"
    ]}
/>




### Parallel SQL execution

This section describes settings that can affect the level of parallelism during
SQL execution, and therefore can also have an impact on performance.

<ConfigTable rows={parallelSqlConfig} />

### Postgres wire protocol

This section describes configuration settings for client connections using
PostgresSQL wire protocol.

<ConfigTable rows={postgresConfig} />

### InfluxDB Line Protocol (ILP)

This section describes ingestion settings for incoming messages using InfluxDB
Line Protocol.

| Property                     | Default | Description                                                                                                                                                                |
| ---------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| line.default.partition.by    | DAY     | Table partition strategy to be used with tables that are created automatically by InfluxDB Line Protocol. Possible values are: `HOUR`, `DAY`, `WEEK`, `MONTH`, and `YEAR`. |
| line.auto.create.new.columns | true    | When enabled, automatically creates new columns when they appear in the ingested data. When disabled, messages with new columns will be rejected.                          |
| line.auto.create.new.tables  | true    | When enabled, automatically creates new tables when they appear in the ingested data. When disabled, messages for non-existent tables will be rejected.                    |
| line.log.message.on.error    | true    | Controls whether malformed ILP messages are printed to the server log when errors occur.                                                                                   |

#### HTTP specific settings

ILP over HTTP is the preferred way of ingesting data.

| Property               | Default | Description                                                                                                                                       |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| line.http.enabled      | true    | Enable ILP over HTTP. Default port is 9000. Enabled by default within open source versions, defaults to false and must be enabled for Enterprise. |
| line.http.ping.version | v2.2.2  | Version information for the ping response of ILP over HTTP.                                                                                       |
| HTTP properties        | Various | See [HTTP settings](/docs/configuration/#http-server) for general HTTP configuration. ILP over HTTP inherits from HTTP settings.                  |

#### TCP specific settings

<ConfigTable rows={tcpConfig} />

#### UDP specific settings

:::note

The UDP receiver is deprecated since QuestDB version 6.5.2. We recommend ILP
over HTTP instead, or less frequently
[ILP over TCP](/docs/reference/api/ilp/overview/).

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

For a tuning guide see, the
[replication tuning guide](/docs/guides/replication-tuning/).

<ConfigTable rows={replicationConfig} />

### Identity and Access Management (IAM)

:::note

Identity and Access Management is available within
[QuestDB Enterprise](/enterprise/).

:::

Identity and Access Management (IAM) ensures that data can be accessed only by
authorized users. The below configuration properties relate to various
authentication and authorization features.

For a full explanation of IAM, see the
[Identity and Access Management (IAM) documentation](/docs/operations/rbac).

<ConfigTable rows={iamConfig} />

### OpenID Connect (OIDC)

:::note

OpenID Connect is [Enterprise](/enterprise/) only.

:::

OpenID Connect (OIDC) support is part of QuestDB's Identity and Access
Management. The database can be integrated with any OAuth2/OIDC Identity
Provider (IdP).

For detailed information about OIDC, see the
[OpenID Connect (OIDC) integration guide](/docs/operations/openid-connect-oidc-integration).

<ConfigTable rows={oidcConfig} />

### Config Validation

The database startup phase checks for configuration issues, such as invalid or
deprecated settings. Issues may be classified as advisories or errors. Advisory
issues are [logged](/docs/concept/root-directory-structure/#log-directory)
without causing the database to stop its startup sequence: These are usually
setting deprecation warnings. Configuration errors can optionally cause the
database to fail its startup.

<ConfigTable rows={configValidationConfig} />

_We recommended enabling strict validation._

### Telemetry

QuestDB sends anonymous telemetry data with information about usage which helps
us improve the product over time. We do not collect any personally-identifying
information, and we do not share any of this data with third parties.

<ConfigTable rows={telemetryConfig} />

## Materialized views

:::info

Materialized View support is now generally available (GA) and ready for production use.

If you are using versions earlier than `8.3.1`, we suggest you upgrade at your earliest convenience.

:::

The following settings are available in `server.conf`:

<ConfigTable rows={matViewConfig} />

## Logging & Metrics

The following settings are available in `server.conf`:

<ConfigTable rows={logConfig} />

Further settings are available in `log.conf`. For more information, and details
of our Prometheus metrics, please visit the
[Logging & Metrics](/docs/operations/logging-metrics/) documentation.
