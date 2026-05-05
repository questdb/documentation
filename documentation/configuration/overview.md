---
title: Configuration
description: Server configuration keys reference documentation.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

This page describes methods for configuring QuestDB server settings.

Configuration can be set using:

- The `server.conf` configuration file available in the
  [root directory](/docs/concepts/deep-dive/root-directory-structure/)
- Environment variables
- [Command-line options](#command-line-options) for startup behavior such as
  root directory, service tags, and web console redeployment

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

For example, the server configuration key for query timeout must be passed as
described below:

| `server.conf` key  | env var              |
| ------------------ | -------------------- |
| `query.timeout`    | `QDB_QUERY_TIMEOUT`  |

:::note

QuestDB applies these configuration changes on startup and a running instance
must be restarted in order for configuration changes to take effect.

:::

### Examples

The following configuration property customizes the query timeout:

```shell title="conf/server.conf"
query.timeout=120s
```

```shell title="Customizing the query timeout via environment variable"
export QDB_QUERY_TIMEOUT=120s
```

## Secrets from files

QuestDB supports reading sensitive configuration values from files using the
`_FILE` suffix convention. This is useful in containerized environments like
Kubernetes, where secrets are typically mounted as files rather than passed as
environment variables.

When a `_FILE` variant is set, QuestDB reads the secret value from the specified
file path. This works with both environment variables and properties in
`server.conf`.

### Usage

**Environment variable:**

```shell
QDB_PG_PASSWORD_FILE=/run/secrets/pg-password
```

**Property file:**

```ini title="server.conf"
pg.password.file=/run/secrets/pg-password
```

### Precedence

If both a `_FILE` variant and the direct value are set, the `_FILE` variant
takes precedence. For example, if both `QDB_PG_PASSWORD_FILE` and
`QDB_PG_PASSWORD` are set, the value is read from the file.

### File requirements

Secret files must meet the following requirements:

- **Maximum size**: 64KB
- **Encoding**: UTF-8
- **Content handling**: Leading and trailing whitespace is automatically trimmed

The following paths are not allowed for security reasons:

- Paths containing `..` (path traversal)
- Paths starting with `/dev/`, `/proc/`, or `/sys/`
- Directories (including symlinks to directories)

If a secret file is empty or contains only whitespace, QuestDB logs an advisory
warning, as this may weaken authentication.

### Error handling

If a secret file cannot be read at startup, QuestDB fails to start. This
includes cases where the file does not exist, is too large, or the path is
not allowed.

During runtime, if `reload_config()` cannot read a secret file, the reload
fails and the previous value is retained. This ensures the server continues
operating if a secret file is temporarily unavailable.

### Reloading secrets

Secrets loaded from files support runtime reloading. After updating a secret
file, call `reload_config()` to apply the new value. See
[Reloadable settings](#reloadable-settings) for details.

To verify that a secret was loaded from a file, run `SHOW PARAMETERS` and check
the `value_source` column, which displays `file` for secrets loaded from files.

### Supported properties

The following properties support the `_FILE` suffix:

| Property               | Environment variable            |
| ---------------------- | ------------------------------- |
| `pg.password`          | `QDB_PG_PASSWORD_FILE`          |
| `pg.readonly.password` | `QDB_PG_READONLY_PASSWORD_FILE` |
| `http.password`        | `QDB_HTTP_PASSWORD_FILE`        |

#### Enterprise properties

The following additional properties are available in
[QuestDB Enterprise](/enterprise/):

| Property                         | Environment variable                      |
| -------------------------------- | ----------------------------------------- |
| `acl.admin.password`             | `QDB_ACL_ADMIN_PASSWORD_FILE`             |
| `acl.oidc.tls.keystore.password` | `QDB_ACL_OIDC_TLS_KEYSTORE_PASSWORD_FILE` |
| `replication.object.store`       | `QDB_REPLICATION_OBJECT_STORE_FILE`       |
| `cold.storage.object.store`      | `QDB_COLD_STORAGE_OBJECT_STORE_FILE`      |
| `backup.object.store.*`          | `QDB_BACKUP_OBJECT_STORE_*_FILE`          |

For Kubernetes-specific examples, see the
[Kubernetes deployment guide](/docs/deployment/kubernetes/#using-kubernetes-secrets).

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

## Command-line options

QuestDB may be started, stopped and passed configuration options from the
command line. On Windows, the QuestDB server can also start an
[interactive session](#interactive-session-windows).

### Options

The following sections describe the options that may be passed to QuestDB when
starting the server from the command line.

<!-- prettier-ignore-start -->

<Tabs defaultValue="nix"
values={[
  { label: "Linux", value: "nix" },
  { label: "macOS (Homebrew)", value: "macos" },
  { label: "Windows", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nix">

```shell
./questdb.sh [start|stop|status] [-d dir] [-f] [-n] [-t tag]
```

</TabItem>

<TabItem value="macos">

```shell
questdb [start|stop|status] [-d dir] [-f] [-n] [-t tag]
```

</TabItem>

<TabItem value="windows">

```shell
questdb.exe [start|stop|status|install|remove] \
  [-d dir] [-f] [-j JAVA_HOME] [-t tag]
```

</TabItem>

</Tabs>

#### Start

`start` - starts QuestDB as a service.

| Option | Description                                                                                                                                                                                                             |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-d`   | Expects a `dir` directory value which is a folder that will be used as QuestDB's root directory. For more information and the default values, see the [default root](#default-root-directory) section below.          |
| `-t`   | Expects a `tag` string value which will be as a tag for the service. This option allows users to run several QuestDB services and manage them separately. If this option is omitted, the default tag will be `questdb`. |
| `-f`   | Force re-deploying the [Web Console](/docs/getting-started/web-console/overview/). Without this option, the [Web Console](/docs/getting-started/web-console/overview/) is cached and deployed only when missing.                                                          |
| `-n`   | Do not respond to the HUP signal. This keeps QuestDB alive after you close the terminal window where you started it.                                                                                                    |
| `-j`   | **Windows only!** This option allows to specify a path to `JAVA_HOME`.                                                                                                                                                  |

:::note

- When running multiple QuestDB services, a tag must be used to disambiguate
  between services for `start` and `stop` commands. There will be conflicting
  ports and root directories if only the tag flag is specified when starting
  multiple services. Each new service should have its own config file or should
  be started with separate port and root directory options.

- When running QuestDB as Windows service you can check status in both:
  - Windows Event Viewer - look for events with "QuestDB" source in Windows Logs
    | Application .
  - service log file - `$dataDir\log\service-%Y-%m-%dT%H-%M-%S.txt` (default is
    `C:\Windows\System32\qdbroot\log\service-%Y-%m-%dT%H-%M-%S.txt` )

:::

<!-- prettier-ignore-start -->


<Tabs defaultValue="nix"
values={[
  { label: "Linux", value: "nix" },
  { label: "macOS (Homebrew)", value: "macos" },
  { label: "Windows", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nix">

```shell
./questdb.sh start [-d dir] [-f] [-n] [-t tag]
```

</TabItem>

<TabItem value="macos">

```shell
questdb start [-d dir] [-f] [-n] [-t tag]
```

</TabItem>

<TabItem value="windows">

```shell
questdb.exe start [-d dir] [-f] [-j JAVA_HOME] [-t tag]
```

</TabItem>

</Tabs>

##### Default root directory

By default, QuestDB's [root directory](/docs/concepts/deep-dive/root-directory-structure/)
will be the following:

<!-- prettier-ignore-start -->

<Tabs defaultValue="nix" values={[
  { label: "Linux", value: "nix" },
  { label: "macOS (Homebrew)", value: "macos" },
  { label: "Windows", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nix">

```shell
$HOME/.questdb
```

</TabItem>

<TabItem value="macos">

Path on Macs with Apple Silicon (M1 or M2) chip:

```shell
/opt/homebrew/var/questdb
```

Path on Macs with Intel chip:

```shell
/usr/local/var/questdb
```

</TabItem>

<TabItem value="windows">

```shell
C:\Windows\System32\qdbroot
```

</TabItem>

</Tabs>

#### Stop

`stop` - stops a service.

| Option | Description                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| `-t`   | Expects a `tag` string value which to stop a service by tag. If this is omitted, the default tag will be `questdb` |

<!-- prettier-ignore-start -->

<Tabs defaultValue="nix" values={[
  { label: "Linux", value: "nix" },
  { label: "macOS (Homebrew)", value: "macos" },
  { label: "Windows", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nix">

```shell
./questdb.sh stop
```

</TabItem>

<TabItem value="macos">

```shell
questdb stop
```

</TabItem>

<TabItem value="windows">

```shell
questdb.exe stop
```

</TabItem>

</Tabs>

#### Status

`status` - shows the status for a service.

| Option | Description                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| `-t`   | Expects a `tag` string value which to stop a service by tag. If this is omitted, the default will be `questdb` |

<!-- prettier-ignore-start -->

<Tabs defaultValue="nix" values={[
  { label: "Linux", value: "nix" },
  { label: "macOS (Homebrew)", value: "macos" },
  { label: "Windows", value: "windows" },
]}>

<!-- prettier-ignore-end -->

<TabItem value="nix">

```shell
./questdb.sh status
```

</TabItem>

<TabItem value="macos">

```shell
questdb status
```

</TabItem>

<TabItem value="windows">

```shell
questdb.exe status
```

</TabItem>

</Tabs>

#### Install (Windows)

`install` - installs the Windows QuestDB service. The service will start
automatically at startup.

```shell
questdb.exe install
```

#### Remove (Windows)

`remove` - removes the Windows QuestDB service. It will no longer start at
startup.

```shell
questdb.exe remove
```

### Interactive session (Windows)

You can start QuestDB interactively by running `questdb.exe`. This will launch
QuestDB interactively in the active `Shell` window. QuestDB will be stopped when
the Shell is closed.

#### Default root directory

When started interactively, QuestDB's root directory defaults to the `current`
directory.

#### Stop

To stop, press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal or close it
directly.

## Config validation

The database startup phase checks for configuration issues, such as invalid or
deprecated settings. Issues may be classified as advisories or errors. Advisory
issues are [logged](/docs/concepts/deep-dive/root-directory-structure/#log-directory)
without causing the database to stop its startup sequence: These are usually
setting deprecation warnings. Configuration errors can optionally cause the
database to fail its startup.

### config.validation.strict

- **Default**: `false`
- **Reloadable**: no

When enabled, startup fails if there are configuration errors.

_We recommend enabling strict validation._

## Keys and default values

Configuration keys are organized by subsystem. Parameters for specifying buffer
and memory page sizes use the format `n<unit>`, where `<unit>` can be:

- `m` for **MB**
- `k` for **kB**

For example:

```ini title="Setting maximum send buffer size to 2MB per TCP socket"
http.net.connection.sndbuf=2m
```

| Section | Description &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Enterprise only |
|---------|-------------|:----------:|
| [Cairo engine](/docs/configuration/cairo-engine/) | SQL engine settings | |
| [COPY settings](/docs/configuration/copy-settings/) | CSV import and Parquet export | |
| [HTTP server](/docs/configuration/http-server/) | Web Console and REST API | |
| [IAM](/docs/configuration/iam/) | Identity and Access Management | ✓ |
| [Ingestion (ILP/HTTP)](/docs/configuration/ingestion/) | InfluxDB Line Protocol settings | |
| [Logging & Metrics](/docs/configuration/logging-metrics/) | Log levels and metrics | |
| [Materialized views](/docs/configuration/materialized-views/) | Materialized view refresh settings | |
| [Minimal HTTP server](/docs/configuration/http-min-server/) | Health check and metrics endpoint | |
| [OpenID Connect (OIDC)](/docs/configuration/oidc/) | OIDC integration | ✓ |
| [Parallel SQL execution](/docs/configuration/parallel-sql-execution/) | Query parallelism settings | |
| [Postgres wire protocol](/docs/configuration/postgres-wire-protocol/) | PostgreSQL wire protocol connections | |
| [Replication](/docs/configuration/database-replication/) | High availability cluster replication | ✓ |
| [Shared workers](/docs/configuration/shared-workers/) | Worker thread pools | |
| [Storage policy](/docs/configuration/storage-policy/) | Partition lifecycle management | ✓ |
| [Telemetry](/docs/configuration/telemetry/) | Anonymous usage telemetry | |
| [TLS encryption](/docs/configuration/tls/) | TLS settings for all interfaces | ✓ |
| [WAL table configurations](/docs/configuration/wal/) | Write-Ahead Log settings | |
