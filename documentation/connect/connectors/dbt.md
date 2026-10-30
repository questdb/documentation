---
title: dbt connector
sidebar_label: dbt
description:
  Build, test, and document SQL models in QuestDB Enterprise with the dbt
  connector. Configure connections, incremental models, and materialized views.
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
in its logs. Match the port and TLS settings to your instance:

```yaml title="profiles.yml"
questdb_trades:
  target: dev
  outputs:
    dev:
      type: questdb
      host: "{{ env_var('QDB_HOST', 'localhost') }}"
      port: 9000
      username: "{{ env_var('QDB_USERNAME') }}"
      password: "{{ env_var('DBT_ENV_SECRET_QDB_PASSWORD') }}"
      schema: trades_dev
      schema_mode: prefix
      threads: 4
```

Add `tls: true` for a TLS endpoint. The profile name, `questdb_trades`, matches
`profile` in the example's `dbt_project.yml`.

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
runs their tests, and takes a snapshot of instrument reference data. The project
includes one-minute candles, latest prices, an incremental upsert, and a
materialized view.

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

### Incremental models

`append`, the default strategy, inserts every selected row. `upsert` uses
QuestDB [deduplication](/docs/concepts/deduplication/) to replace rows with
matching `dedup_upsert_keys`. The keys must identify a record and include the
designated timestamp; dbt's `unique_key` does not replace this setting.

The bundled project's incremental model uses `(ts, symbol, side)` for its sample
data and reprocesses rows at the last stored timestamp. Choose keys and a
lookback appropriate to your own data, especially when records can arrive late.

`on_schema_change` supports `ignore`, `fail`, `append_new_columns`, and
`sync_all_columns`. Changing the designated timestamp or deduplication keys may
require `--full-refresh`, which rebuilds the table from the model query.

### Materialized views and snapshots

A `materialized_view` model uses QuestDB's server-managed refresh. Use an
ingested or incremental table as its base: rebuilding a `table` model or seed
invalidates dependent materialized views and requires them to be rebuilt. The
adapter updates supported refresh and TTL changes in place; changes to the query
or partitioning require a rebuild.

Snapshots support the `timestamp` and `check` strategies and require an
`updated_at` value. By default, they use a WAL table designated on
`dbt_valid_from`, with deduplication keys `(dbt_valid_from, dbt_scd_id)`. Do not
set the model's `timestamp` option on a snapshot.

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
