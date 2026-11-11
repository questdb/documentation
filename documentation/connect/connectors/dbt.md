---
title: dbt connector
sidebar_label: dbt
description:
  Build, test, and document SQL models in QuestDB Enterprise with the dbt
  connector. Configure connections, views, tables, incremental models, and
  materialized views.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote />

The dbt connector lets [dbt Core](https://docs.getdbt.com/docs/introduction)
build, test, and document SQL models in QuestDB Enterprise. It is installed as
the `dbt-questdb` Python adapter and connects over
[QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/overview/).

Run it through the `dbt` command in your development environment, CI pipeline,
or scheduler. Models use QuestDB SQL, including `SAMPLE BY`, `LATEST ON`, and
`ASOF JOIN`. The adapter supports tables, views, incremental models,
materialized views, seeds, and snapshots.

## Quick start

### Prerequisites

- A QuestDB Enterprise instance with QWP enabled, reachable on port 9000 by
  default.
- Python 3.10 or later. Installation also installs dbt Core and the QuestDB
  Python driver.
- A database user with `HTTP`, `CREATE TABLE`, `CREATE VIEW`, and
  `CREATE MATERIALIZED VIEW` permissions. For production, set up a service
  account as described in
  [Authentication and permissions](#authentication-and-permissions).

### 1. Install the adapter

Obtain the release archive and its SHA-256 checksum through your QuestDB
Enterprise contact. [Contact us](/enterprise/contact/) if you need access.
Verify the checksum and extract the archive. It contains a Python wheel, a
reference guide, and the trades example used below.

Create and activate a Python virtual environment. From the extracted directory,
install the wheel:

```shell
python -m pip install ./dbt_questdb-1.0.0-py3-none-any.whl
dbt --version
```

The wheel works on Linux, macOS, and Windows. pip installs its dependencies for
your platform, including dbt Core 1.x (1.10.9 or later) and the QuestDB Python
driver 6.0.0 or later. dbt v2 is not supported.

`dbt --version` lists the adapter as
`questdb: 1.0.0 - Could not determine latest version`. The message is expected:
the adapter ships in the release archive, not on PyPI.

### 2. Configure the example

The release includes a complete project with sample trades. From the extracted
directory, open `examples/trades` and copy `profiles.example.yml` to
`profiles.yml`:

```shell
cd examples/trades
cp profiles.example.yml profiles.yml
```

Set `QDB_HOST`, `QDB_USERNAME`, and `DBT_ENV_SECRET_QDB_PASSWORD` in your shell
or job environment. dbt masks variables whose names start with `DBT_ENV_SECRET_`
in its logs. For production jobs, use a service account token instead; see
[Authentication and permissions](#authentication-and-permissions).

Edit `profiles.yml` to match your instance's port and TLS setting. This profile
connects over TLS:

```yaml title="profiles.yml"
questdb_trades:
  target: dev
  outputs:
    dev:
      type: questdb
      host: "{{ env_var('QDB_HOST', 'localhost') }}"
      port: 9000
      tls: true
      username: "{{ env_var('QDB_USERNAME') }}"
      password: "{{ env_var('DBT_ENV_SECRET_QDB_PASSWORD') }}"
      schema: trades_dev
      schema_mode: prefix
      threads: 4
```

The profile name, `questdb_trades`, matches `profile` in the example's
`dbt_project.yml`. Leave out `tls: true` if your instance does not have
[TLS](/docs/security/tls/) enabled.

For a development instance with a self-signed certificate, such as the
[demo certificate](/docs/security/tls/#demo-certificates), also add
`tls_verify: false`. It skips server certificate verification, which leaves the
connection open to interception, so do not use it in production. For a
certificate issued by a private CA, set `tls_ca` to the CA's PEM file instead.
The two settings cannot be combined.

:::warning Choose a separate namespace

The example creates objects named `trades_dev__trades`, `trades_dev__ohlc_1m`,
and so on. Choose a different `schema` if that prefix is already in use. A model
can replace an existing object with the same name.

:::

### 3. Build and query

From `examples/trades`, run:

```shell
dbt debug --profiles-dir .
dbt build --profiles-dir .
```

`debug` checks the connection. `build` loads sample trades, builds the models,
runs their tests, and takes a snapshot of instrument reference data.
[Materializations](#materializations) describes each model in the project.

Query the candles in the QuestDB Web Console:

```questdb-sql
SELECT ts, symbol, open, high, low, close, volume
FROM trades_dev__ohlc_1m
ORDER BY ts DESC
LIMIT 10;
```

Run `dbt build --profiles-dir .` again to exercise incremental updates and
snapshots. To generate the project's catalog and lineage documentation:

```shell
dbt docs generate --profiles-dir .
dbt docs serve --profiles-dir .
```

## Materializations

A dbt model is a `SELECT` statement in a `.sql` file. Its materialization
decides what dbt builds from the query in QuestDB: a view, a table, an
incrementally updated table, or a materialized view. The trades example uses
each of them:

| Name                        | Materialization   | Reads from           | Demonstrates                                              |
| --------------------------- | ----------------- | -------------------- | --------------------------------------------------------- |
| `raw_trades`, `instruments` | Seed              | CSV files            | Sample data                                               |
| `stg_trades`                | View              | `raw_trades`         | Renamed, cast, and derived columns                        |
| `trades`                    | Table             | `stg_trades`         | Designated timestamp, partitions, `SYMBOL`, deduplication |
| `ohlc_1m`                   | Table             | `trades`             | `SAMPLE BY` candles                                       |
| `latest_price`              | View              | `trades`             | `LATEST ON`                                               |
| `trades_incremental`        | Incremental       | `stg_trades`         | `upsert` of new rows                                      |
| `ohlc_5m_mv`                | Materialized view | `trades_incremental` | Candles that QuestDB keeps current                        |
| `instruments_snapshot`      | Snapshot          | `instruments`        | History of reference data changes                         |

The project's `dbt_project.yml` sets a default materialization for each model
folder. A model's `config()` block overrides it:

```yaml title="dbt_project.yml"
models:
  questdb_trades:
    staging:
      +materialized: view
    marts:
      +materialized: table
```

Ephemeral models create nothing in QuestDB: dbt inlines them as common table
expressions in the models that reference them.

### Transform data with SQL

A dbt project transforms data in steps. Each step is a model that selects from
earlier models with `ref()`, or from ingested tables with `source()`. dbt
resolves each reference to the upstream object's name, such as
`trades_dev__stg_trades` in `prefix` mode, and builds models in dependency
order.

The example arranges its steps in two folders:

- **`staging`** cleans the raw input. [`stg_trades`](#views) renames the seed's
  timestamp column, casts text columns, and computes each trade's notional
  value.
- **`marts`** shapes the clean data for queries. [`trades`](#tables) stores it
  with a designated timestamp and partitions, [`ohlc_1m`](#tables) aggregates it
  into one-minute candles, and [`latest_price`](#views) keeps the latest price
  for each symbol.

A join combines models. This view, which is not part of the example project,
adds each instrument's base and quote asset from the `instruments` seed to its
trades:

```sql title="models/marts/trades_enriched.sql"
{{ config(materialized='view') }}

SELECT
    t.ts,
    t.symbol,
    t.side,
    t.price,
    t.amount,
    t.notional,
    i.base_asset,
    i.quote_asset
FROM {{ ref('trades') }} t
JOIN {{ ref('instruments') }} i ON t.symbol = i.symbol
```

The join keys need no cast: `trades.symbol` is a `SYMBOL` column and the seed's
`symbol` is `VARCHAR`, which QuestDB compares directly. For time-series data,
[`ASOF JOIN`](/docs/query/sql/asof-join/) matches each row with the latest
earlier or equal row of another table, such as the prevailing quote for each
trade.

### Views

A `view` model runs `CREATE OR REPLACE VIEW`, which replaces the view in place
on each run. A [view](/docs/concepts/views/) stores no data: QuestDB runs its
query whenever it is read, so the result reflects the current input. The staging
model renames the seed's timestamp column, casts text columns to `VARCHAR`, and
derives each trade's notional value:

```sql title="models/staging/stg_trades.sql"
SELECT
    trade_ts AS ts,
    CAST(symbol AS VARCHAR) AS symbol,
    CAST(side AS VARCHAR) AS side,
    price,
    amount,
    price * amount AS notional,
    CAST(venue AS VARCHAR) AS venue
FROM {{ ref('raw_trades') }}
```

Models can use QuestDB SQL extensions. This view returns the latest trade for
each symbol with [`LATEST ON`](/docs/query/sql/latest-on/):

```sql title="models/marts/latest_price.sql"
{{ config(materialized='view') }}

SELECT ts, symbol, price
FROM {{ ref('trades') }}
LATEST ON ts PARTITION BY symbol
```

### Tables

A `table` model stores the query result with `CREATE TABLE AS` and replaces the
table on every run. The [model configuration](#model-configuration) sets the
table's storage. The example's `trades` model creates a table with designated
timestamp `ts`, daily partitions, three `SYMBOL` columns, and deduplication
keys:

```sql title="models/marts/trades.sql"
{{
    config(
        materialized='table',
        timestamp='ts',
        partition_by='DAY',
        wal=true,
        symbols=['symbol', 'side', 'venue'],
        dedup_upsert_keys=['ts', 'symbol', 'side'],
    )
}}

SELECT ts, symbol, side, price, amount, notional, venue
FROM {{ ref('stg_trades') }}
```

Aggregations work the same way. `ohlc_1m` computes one-minute candles with
[`SAMPLE BY`](/docs/query/sql/sample-by/), and each run recomputes them from all
trades:

```sql title="models/marts/ohlc_1m.sql"
{{
    config(
        materialized='table',
        timestamp='ts',
        partition_by='DAY',
        wal=true,
        symbols=['symbol'],
    )
}}

SELECT
    ts,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(amount) AS volume,
    count() AS trades
FROM {{ ref('trades') }}
SAMPLE BY 1m
```

### Incremental models

An `incremental` model creates its table on the first run. Later runs insert the
rows its query returns when `is_incremental()` is true, typically rows newer
than those already stored. `{{ this }}` refers to the model's own table:

```sql title="models/marts/trades_incremental.sql"
{{
    config(
        materialized='incremental',
        incremental_strategy='upsert',
        timestamp='ts',
        partition_by='DAY',
        wal=true,
        symbols=['symbol'],
        dedup_upsert_keys=['ts', 'symbol', 'side'],
    )
}}

SELECT ts, symbol, side, price, amount, notional
FROM {{ ref('stg_trades') }}
{% if is_incremental() %}
WHERE ts >= (SELECT max(ts) FROM {{ this }})
{% endif %}
```

`append`, the default strategy, inserts every selected row. `upsert` uses
QuestDB [deduplication](/docs/concepts/deduplication/) to replace rows with
matching `dedup_upsert_keys`. The keys must identify a record and include the
designated timestamp; dbt's `unique_key` does not replace this setting.

This model selects the rows at the last stored timestamp again, and its keys,
`(ts, symbol, side)`, replace those rows instead of duplicating them. The keys
suit the sample data. Choose keys and a lookback appropriate to your own data,
especially when records can arrive late.

`on_schema_change` supports `ignore`, `fail`, `append_new_columns`, and
`sync_all_columns`. Changing the designated timestamp or deduplication keys may
require `--full-refresh`, which rebuilds the table from the model query.

### Materialized views

A `materialized_view` model runs `CREATE MATERIALIZED VIEW`. QuestDB then keeps
the [materialized view](/docs/concepts/materialized-views/) current as rows
arrive in its base table, including between dbt runs. The query must aggregate
with `SAMPLE BY` or a time-based `GROUP BY`. The example builds five-minute
candles over the incremental table:

```sql title="models/marts/ohlc_5m_mv.sql"
{{ config(materialized='materialized_view', partition_by='DAY') }}

SELECT
    ts,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(amount) AS volume
FROM {{ ref('trades_incremental') }}
SAMPLE BY 5m
```

Use an ingested or incremental table as the base. Rebuilding a `table` model or
seed invalidates the materialized views that read it, so every run that rebuilds
the base also recomputes those views from the whole base table.

A materialized view model reads a single base table. QuestDB requires
`WITH BASE` for a query that reads several tables, and the adapter has no
setting for it, so such a model fails. A view in the query counts as the tables
it reads.

`refresh` sets the view's `REFRESH` clause and takes any
[refresh strategy](/docs/query/sql/create-mat-view/#refresh-strategies) the
server accepts. The default, `immediate`, refreshes the view after each commit
to the base table. The next two models are not part of the example project but
can be added to it. This one refreshes an hourly VWAP on a timer every 10
minutes and keeps 30 days of it:

```sql title="models/marts/vwap_1h_mv.sql"
{{
    config(
        materialized='materialized_view',
        refresh='every 10m',
        partition_by='DAY',
        ttl='30 DAYS',
    )
}}

SELECT
    ts,
    symbol,
    sum(notional) / sum(amount) AS vwap,
    sum(amount) AS volume
FROM {{ ref('trades_incremental') }}
SAMPLE BY 1h
```

With a `period` clause, QuestDB refreshes each period once it completes. This
model publishes each day's candles two hours after the UTC day ends, so trades
that arrive up to two hours late are included:

```sql title="models/marts/ohlc_1d_mv.sql"
{{
    config(
        materialized='materialized_view',
        refresh='period (length 1d delay 2h)',
        partition_by='MONTH',
    )
}}

SELECT
    ts,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(amount) AS volume
FROM {{ ref('trades_incremental') }}
SAMPLE BY 1d
```

With `refresh='manual'`, QuestDB refreshes the view only on request. Each dbt
run refreshes it incrementally, so the view updates on your dbt schedule.

dbt applies a changed `refresh` or `ttl` in place. A changed query or
`partition_by` rebuilds the view. Before downstream models run, dbt waits up to
10 minutes for a new view's first refresh, and for an `immediate` view without
`period` to catch up with its base table.

### Snapshots

A snapshot records how the rows of a table change over time. The example tracks
each instrument's tick size with the `check` strategy:

```sql title="snapshots/instruments_snapshot.sql"
{% snapshot instruments_snapshot %}
{{ config(unique_key='symbol', strategy='check', check_cols=['tick_size']) }}

SELECT symbol, base_asset, quote_asset, tick_size
FROM {{ ref('instruments') }}
{% endsnapshot %}
```

Snapshots support the `timestamp` and `check` strategies. The `timestamp`
strategy requires `updated_at`; a `check` snapshot without it records the time
of the run. By default, a snapshot uses a WAL table designated on
`dbt_valid_from`, with deduplication keys `(dbt_valid_from, dbt_scd_id)`. Do not
set the model's `timestamp` option on a snapshot.

### Live views

The adapter has no live view materialization, so dbt cannot create
[live views](/docs/concepts/live-views/). Create them in QuestDB with
[`CREATE LIVE VIEW`](/docs/query/sql/create-live-view/).

## Use existing tables

In your own dbt project, set `profile` to the profile name in `profiles.yml`.
Declare tables written by ingestion jobs as dbt sources, then build models with
separate names.

For example, the [Databento connector](/docs/connect/connectors/databento/)
quick start writes trades to `equs_trades`. In a project that reads unprefixed
tables, set `schema_mode: flat` in the profile. This applies to both sources and
models, so choose output names that do not clash with ingested tables:

```yaml title="models/sources.yml"
version: 2
sources:
  - name: market
    tables:
      - name: trades
        identifier: equs_trades
```

This model builds candles as a materialized view over the source table's
designated timestamp, `ts_recv`. QuestDB refreshes the view as the connector
appends trades, so it stays current between dbt runs:

```sql title="models/candles_1m.sql"
{{ config(
    materialized='materialized_view',
    refresh='immediate',
    partition_by='DAY'
) }}

SELECT
    ts_recv,
    symbol,
    first(price) AS open,
    max(price) AS high,
    min(price) AS low,
    last(price) AS close,
    sum(size) AS volume
FROM {{ source('market', 'trades') }}
SAMPLE BY 1m
```

Run `dbt run --select candles_1m` with your project's profile. The output is
`candles_1m`; the source remains `equs_trades`.

The Databento connector delivers at least once, so a reconnect can repeat rows.
For exact aggregates, create the source table with
[deduplication](/docs/concepts/deduplication/) keys before the connector starts.

### Keep prefix mode

In `prefix` mode, a source renders as `<source schema>__<identifier>`, and the
source schema defaults to the source name. To keep `prefix` mode, have the
ingestion job write prefixed table names. For example, set the Databento
connector's subscription `table = "market__trades"` and declare:

```yaml title="models/sources.yml"
version: 2
sources:
  - name: market
    tables:
      - name: trades # reads market__trades
```

A `prefix` project cannot read an unprefixed table such as `equs_trades`; use
`flat` mode for that. Choose the table name when you first configure the
connector: changing an existing task's table name requires a new `state_dir`.

## Authentication and permissions

The quick start connects with a username and password, which is the fastest way
to try the connector. For production, such as a scheduled job or a CI pipeline,
run dbt as a service account that authenticates with a token. This section
explains how to set that up, which permissions dbt needs, and how to give other
users access to what dbt builds.

A [service account](/docs/security/rbac/#users-and-service-accounts) is a
QuestDB identity for an application rather than a person. Unlike a user, it
can't belong to groups, so it has exactly the permissions you grant it and
nothing more. dbt's access then stays the same when people join or leave groups,
and it doesn't depend on any person's account.

A token is the recommended way for an application to authenticate with QuestDB
Enterprise. It has an expiry time, and you can revoke it by
[dropping it](/docs/query/sql/acl/alter-service-account-drop-token/), without
changing anything else about the account.

### Permissions dbt needs

dbt creates tables and views, and it reads the tables that your sources point
to. [Grant](/docs/query/sql/acl/grant/) the service account these permissions:

- `HTTP`, to connect. QWP runs on the HTTP port.
- `CREATE TABLE`, for table models, incremental models, seeds, and snapshots.
  All of them store their results in tables.
- `CREATE VIEW`, for view models.
- `CREATE MATERIALIZED VIEW`, for materialized view models.
- `SELECT` on each table that a source reads.

Later runs also insert into, rename, rebuild, and drop the objects dbt created,
but they need no further permissions. QuestDB makes the account the
[owner](/docs/security/rbac/#owner-grants) of every object it creates, and the
owner holds all permissions on it.

QuestDB Enterprise [hides](/docs/security/rbac/#object-visibility) a table from
any account that holds no permission on it. If the account has no permission on
a source table, for example because you forgot to grant `SELECT`, dbt doesn't
report an "access denied" error. Instead, the model fails as if the table did
not exist.

### Create the service account

These statements create a service account named `dbt_runner` for the project in
[Use existing tables](#use-existing-tables), which reads `equs_trades`. Run them
as a database administrator, for example in the Web Console:

```questdb-sql title="Service account for dbt"
CREATE SERVICE ACCOUNT dbt_runner;
GRANT HTTP, CREATE TABLE, CREATE VIEW, CREATE MATERIALIZED VIEW TO dbt_runner;
GRANT SELECT ON equs_trades TO dbt_runner;
ALTER SERVICE ACCOUNT dbt_runner
    CREATE TOKEN TYPE REST WITH TTL '365d' REFRESH;
```

The last statement creates the token and returns it in its result. QuestDB
doesn't store the token, so copy it right away. If you lose it, you have to
create a new one.

### Configure the profile

Store the token in an environment variable, and read it in `profiles.yml` with
`env_var()`. Start the variable's name with `DBT_ENV_SECRET_`, so that dbt hides
its value in its logs.

The profile sets `token` and leaves out `username` and `password`. dbt connects
with either a token or a username and password, never both: the adapter reports
a configuration error if the profile sets a token together with a username or
password.

```yaml title="profiles.yml"
market_analytics:
  target: prod
  outputs:
    prod:
      type: questdb
      host: "{{ env_var('QDB_HOST') }}"
      port: 9000
      tls: true
      token: "{{ env_var('DBT_ENV_SECRET_QDB_TOKEN') }}"
      schema_mode: flat
      threads: 4
```

### Keep the token valid

The example token expires 365 days after dbt last connected with it.
`TTL '365d'` sets how long the token lives, and `REFRESH` restarts that period
every time dbt connects successfully. As long as dbt runs at least once a year,
the token stays valid.

Choose a TTL comfortably longer than the longest pause between dbt runs you
expect. If the job stops for longer than that, the token expires, and dbt can no
longer connect. To resume, create a new token and update the environment
variable.

In a replicated cluster, QuestDB restarts the period only when dbt connects to
the primary. dbt always connects to the primary, as
[High availability](#high-availability) explains, so `REFRESH` works there too.

### Give readers access

When dbt runs as a service account, that account owns everything dbt builds.
Other users can't query those tables and views until someone grants them access,
and until then QuestDB hides the objects from them. Administrators and users
with database-wide permissions are the exception.

dbt usually manages access with its `grants` configuration, but the QuestDB
adapter doesn't support it. Use a post-hook instead: a SQL statement that dbt
runs right after it builds a model. The service account owns the model, so it is
allowed to grant access to it.

Set the post-hook once in `dbt_project.yml` to cover every model in the project.
This one gives the `analysts` group read access:

```yaml title="dbt_project.yml"
models:
  market_analytics:
    +post-hook: "GRANT SELECT ON {{ this }} TO analysts"
```

dbt runs the hook after every build, so the grant is in place even for objects
that dbt replaces on each run, such as table models. Seeds and snapshots take
the same setting under `seeds:` and `snapshots:`.

## High availability

QuestDB Enterprise can run as a
[replicated cluster](/docs/high-availability/overview/). One node, the primary,
accepts writes, and one or more replicas copy its data. The primary role can
move to another node. An operator may move it on purpose, or a replica may take
over after the primary fails. This section explains how to point dbt at a
replicated cluster, and what happens to a dbt run when the primary role moves.

### Connect to a replicated cluster

List every node of the cluster in the `addr` setting, separated by commas. You
don't need to know which node is the primary. When dbt connects, the driver
checks each node's role and picks the primary.

dbt always works with the primary, never with a replica. A dbt run writes tables
and reads them back in later models, and a replica may not have caught up with
those writes yet.

```yaml title="profiles.yml"
market_analytics:
  target: prod
  outputs:
    prod:
      type: questdb
      addr: "node-a.example.com:9000,node-b.example.com:9000"
      tls: true
      token: "{{ env_var('DBT_ENV_SECRET_QDB_TOKEN') }}"
      schema_mode: flat
      threads: 4
```

Because the profile lists every node, it keeps working after the primary role
moves. You don't need to edit it after a failover.

### Planned switchover

Operators move the primary role with
[`SWITCH ROLE`](/docs/high-availability/failover/), for example before
maintenance on the primary node. The old primary becomes a replica, and another
node becomes the primary. No committed data is lost.

A dbt run that is in progress during the switch fails at its next write. The
switch leaves existing client connections open, so dbt keeps using its
connections to the old primary. That node no longer accepts writes, so the
statement fails with `replica access is read-only`. dbt reports the model as an
error and skips every model that depends on it.

To recover, wait for the switch to complete, then run `dbt retry`. It reruns
only the models that failed or were skipped, and it connects to the new primary.
To avoid the failure, schedule switchovers between dbt runs.

### Unplanned failover

When the primary fails, dbt's connections to it break. QuestDB does not promote
a replica on its own: an operator, or an external coordinator, has to run
`SWITCH ROLE TO PRIMARY` on one of the replicas.

In the meantime, the driver tries to keep the dbt run going. When a statement
fails because its connection broke, the driver retries it on the other nodes
listed in `addr`, looking for a new primary. It doesn't wait long. By default it
gives up after 8 attempts or 30 seconds, whichever comes first. When the nodes
fail quickly, the 8 attempts are used up in a few seconds. These limits are the
driver's
[egress failover](/docs/connect/clients/connect-string/#egress-failover)
settings.

What happens next depends on how quickly a replica is promoted:

- **If a replica becomes primary within these limits,** the driver runs the
  statement again on the new primary, and the dbt run continues. The statement
  may already have taken effect on the old primary before the failure, so
  running it again can repeat a write.
  [Failures and limitations](#failures-and-limitations) describes how that
  affects each kind of model.
- **If the promotion takes longer,** the statement fails, and dbt reports the
  model as an error.

A promotion done by hand usually takes longer than a few seconds. To let dbt
wait for one, raise both limits with `extra_conf`. This setting makes the driver
wait for up to three minutes:

```yaml
extra_conf: "failover_max_attempts=1000;failover_max_duration_ms=180000"
```

### Rerun dbt after an unplanned failover

An unplanned failover can lose the most recent writes. The primary uploads each
committed transaction to an object store, and the replicas copy it from there. A
transaction the old primary committed but hadn't uploaded yet never reaches the
new primary. Models that dbt built shortly before the failure can therefore be
missing rows on the new primary, or be missing altogether.

dbt can't detect this. After the promotion, run `dbt build` for the whole
project rather than `dbt retry`: `dbt retry` reruns only the models that failed,
so it would skip models that completed but then lost data. A full build repairs
them:

- Table models and seeds are rebuilt from scratch.
- An incremental model whose filter reads its own table, like
  `trades_incremental`, finds an earlier latest timestamp and selects the
  missing rows again.
- A model with `wal: false` is missing on the new primary, because only WAL
  tables replicate. The build creates it again.

## Connection settings

Configure these fields under the selected output in `profiles.yml`:

| Setting                | Default             | Purpose                                                                          |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `type`                 | Required            | Use `questdb`.                                                                   |
| `host`, `port`         | `localhost`, `9000` | QuestDB QWP endpoint.                                                            |
| `addr`                 | Unset               | Comma-separated `host:port` of every cluster node; overrides `host` and `port`.  |
| `username`, `password` | Unset               | Database credentials. Use environment variables for secrets.                     |
| `token`                | Unset               | REST API token; cannot be combined with `username` and `password`.               |
| `tls`                  | `false`             | Enable TLS.                                                                      |
| `tls_verify`           | `true`              | `false` skips certificate checks, for development only; requires `tls: true`.    |
| `tls_ca`               | Unset               | PEM certificate authority file for a private CA; requires `tls: true`.           |
| `schema`               | `public`            | Logical namespace; used in table names only in `prefix` mode.                    |
| `schema_mode`          | `flat`              | Use `prefix` to name objects `<schema>__<model>`.                                |
| `database`             | `questdb`           | Logical dbt value; not included in SQL names.                                    |
| `threads`              | Set in the profile  | Number of concurrent dbt workers. The example uses `4`.                          |
| `query_timeout`        | `0`                 | Query timeout in milliseconds; `0` uses the server timeout.                      |
| `wait_for_wal`         | `true`              | Wait for writes to be readable before downstream models run.                     |
| `extra_conf`           | Unset               | Additional [QWP connect-string settings](/docs/connect/clients/connect-string/). |

If you don't want to store your secrets in the YAML file, read them from
environment variables with dbt's
[`env_var()`](https://docs.getdbt.com/reference/dbt-jinja-functions/env_var)
function. Start secret names with `DBT_ENV_SECRET_` so dbt masks them in its
logs. [Authentication and permissions](#authentication-and-permissions) shows a
profile that reads a token this way.

The adapter's reader pool is sized to `threads + 1`. Keep `wait_for_wal` enabled
for normal runs so dependent models see completed writes.

QuestDB has one flat namespace. In `flat` mode, model `trades` writes table
`trades`, regardless of the profile's `schema`. In `prefix` mode, a schema
cannot contain `__` or start or end with `_`. Names are case-insensitive;
prefixes and dbt's temporary suffixes count toward the 127-character table-name
limit.

## Model configuration

Set these in a model's `config()` block, or with a `+` prefix in
`dbt_project.yml`:

| Setting             | Behavior                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `timestamp`         | Designated timestamp column.                                                                      |
| `partition_by`      | `HOUR`, `DAY`, `WEEK`, `MONTH`, `YEAR`, or `NONE`. Tables default to `DAY`; snapshots to `MONTH`. |
| `wal`               | Defaults to `true`. Only WAL tables replicate.                                                    |
| `symbols`           | Text columns to store as `SYMBOL`, such as `['symbol']`.                                          |
| `dedup_upsert_keys` | Deduplication keys; require WAL and must include the designated timestamp.                        |
| `ttl`               | Retention for partitioned tables, such as `'3 WEEKS'`.                                            |
| `atomic`            | Use a single-commit `CREATE ATOMIC TABLE AS` for table models.                                    |
| `refresh`           | Materialized view refresh clause, such as `'every 1h'`.                                           |

If `timestamp` is omitted, a WAL table keeps its query's designated timestamp.
If the query has none, the adapter adds `dbt_loaded_at` using the dbt
invocation's start time. Set `timestamp` explicitly when the output should use
an event time. Seeds without a timestamp also receive `dbt_loaded_at`.

`partition_by: NONE`, or `wal: false` without `partition_by`, creates an
unpartitioned non-WAL table. Such a table does not replicate.

## Failures and limitations

- **Writes can be repeated after a connection failure.** Deduplication keys
  absorb repeats for upsert models and default WAL snapshots. An append model
  can retain duplicate rows.
- **Table replacements are not transactional.** A table or seed is built under a
  temporary name, then swapped in with two renames. A failure between renames
  can leave `<name>__dbt_backup`; inspect the database and dbt error before
  retrying or removing it.
- **Running queries are not cancelled by Ctrl+C.** Use `query_timeout` to bound
  query execution.
- `merge` and `delete+insert` incremental strategies, Python models, and the
  `indexes` configuration are not supported.
- Constraints are not enforced. The adapter rejects `grants`; grant access
  through a post-hook, as shown in
  [Authentication and permissions](#authentication-and-permissions).
  `persist_docs` is ignored with a warning.

For the complete adapter reference and SQL-specific behavior, see the README
included in the release archive.
