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
- A database user or service account with `HTTP` access and `SELECT` on its
  input tables. The example also needs `CREATE TABLE`, `CREATE VIEW`, and
  `CREATE MATERIALIZED VIEW`. The account owns the objects it creates.

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
in its logs. Edit `profiles.yml` to match your instance's port and TLS setting.
This profile connects over TLS:

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

## Connection settings

Configure these fields under the selected output in `profiles.yml`:

| Setting                | Default             | Purpose                                                                          |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `type`                 | Required            | Use `questdb`.                                                                   |
| `host`, `port`         | `localhost`, `9000` | QuestDB QWP endpoint.                                                            |
| `addr`                 | Unset               | Comma-separated `host:port` endpoints for failover; overrides `host` and `port`. |
| `username`, `password` | Unset               | Database credentials. Use environment variables for secrets.                     |
| `token`                | Unset               | Token authentication, as an alternative to username and password.                |
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

The adapter targets the primary by default. Its reader pool is sized to
`threads + 1`. Keep `wait_for_wal` enabled for normal runs so dependent models
see completed writes.

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
- Constraints are not enforced. The adapter rejects `grants`; manage privileges
  separately or through a post-hook. `persist_docs` is ignored with a warning.

For the complete adapter reference and SQL-specific behavior, see the README
included in the release archive.
