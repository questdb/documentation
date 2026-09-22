---
title: Ingest market data from Databento
sidebar_label: Databento
description:
  Stream Databento market data into QuestDB. Configure Live feeds and Historical
  backfills, query trades and order books, and recover after disconnects.
---

![Databento logo](/images/logos/databento-icon.svg)

The
[Databento connector](https://github.com/questdb/databento-questdb-connector)
streams market data into QuestDB using
[QWP over WebSocket](/docs/connect/wire-protocols/overview/). It runs as a
standalone process configured with TOML and handles subscriptions, table
creation, batching, and recovery.

Each **task** reads one Databento dataset, such as `GLBX.MDP3`. Its
**subscriptions** select schemas and symbols, and choose the destination tables.
Multiple tasks can share a QuestDB connection pool in the same process.

## Quick start

### Prerequisites

- QuestDB 10.0 or later with QWP over WebSocket, reachable on port 9000 by
  default. The connector's integration tests use QuestDB 10.0.1.
- A Databento API key with Live access to the dataset you want to stream.
  Historical backfills require Historical access and may incur Databento
  charges.
- Rust 1.91.1 to build the connector from source.

### 1. Install the connector

From a checkout of the
[connector repository](https://github.com/questdb/databento-questdb-connector),
run:

```shell
cargo install --path . --locked --bin databento-questdb
```

This installs the `databento-questdb` executable into Cargo's binary directory.
Make sure that directory is on your `PATH`.

### 2. Configure a Live feed

Set the source API key and QuestDB connection string:

```shell
export DATABENTO_API_KEY='<your-api-key>'
export QDB_CLIENT_CONF='ws::addr=localhost:9000;'
```

Save the following as `connector.toml`. It collects CME E-mini S&P 500 futures
trades and ten-level quotes. Change the dataset and symbols to match your
Databento access.

```toml title="connector.toml"
version = 1
on_task_failure = "exit"

[pools.main]
conf_env = "QDB_CLIENT_CONF"

[[tasks]]
name = "cme"
pool = "main"
dataset = "GLBX.MDP3"
state_dir = "./state/cme"

[tasks.source]
api_key_env = "DATABENTO_API_KEY"

[[tasks.subscriptions]]
schema = "trades"
symbols = ["ES.FUT"]
stype_in = "parent"
table = "cme_trades"

[[tasks.subscriptions]]
schema = "mbp-10"
symbols = ["ES.FUT"]
stype_in = "parent"
table = "cme_depth"
```

`ES.FUT` selects the futures contracts under that parent symbol. The `symbol`
column stores each record's resolved contract symbol, not the parent selector.

### 3. Validate and start

```shell
databento-questdb --config connector.toml --check-config
databento-questdb --config connector.toml
```

`--check-config` validates local settings and prints the effective configuration
with credentials redacted. It does not connect to either service or check
Databento permissions.

With no `start` or saved checkpoint, the task receives new data as it arrives.
Tables are created when their first records are written. If the market is
closed, a new subscription may have no rows yet.

### 4. Query the data

Open the QuestDB Web Console at `http://localhost:9000` and query recent trades:

```questdb-sql
SELECT ts_recv, ts_event, symbol, price, size, side
FROM cme_trades
ORDER BY ts_recv DESC
LIMIT 10;
```

For bid and ask queries, see [Order book arrays](#order-book-arrays). Ctrl+C
requests a normal stop and saves confirmed progress to `state_dir`.

### Docker

The repository includes a Docker image build for Linux AMD64 and ARM64, also
usable with Docker Desktop on macOS and Windows. Follow the
[Docker startup instructions](https://github.com/questdb/databento-questdb-connector#docker)
using the configuration above.

Mount `connector.toml` read-only and keep each task's `state_dir` under the
persistent volume at `/var/lib/databento-questdb`. Use a QuestDB address
reachable from the container: a service name on a shared Docker network, or
`host.docker.internal` on Docker Desktop. Allow at least 60 seconds for
`docker stop` to drain output and save checkpoints; increase this if you raise
the drain timeout.

## Configuration

The configuration file requires `version = 1`. Task names must be unique, and
each task's `pool` must refer to a declared pool. Unknown fields are rejected.

### Subscriptions

Each entry in `tasks.subscriptions` selects one source schema:

| Setting        | Meaning                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `schema`       | Required Databento schema, such as `trades` or `mbp-10`.                                                                  |
| `symbols`      | Required list of symbols, or `"ALL_SYMBOLS"` for the dataset.                                                             |
| `stype_in`     | How to interpret symbols. Defaults to `raw_symbol`; also supports `parent`, `continuous`, and `instrument_id`.            |
| `table`        | Destination table. Omit it to use the schema's [default table](#schemas-and-default-tables).                              |
| `start`        | Inclusive RFC 3339 start time. In Live mode, omit for new data or use the integer `0` for all available replay.           |
| `use_snapshot` | Request an initial MBO snapshot. Live only; cannot be combined with `start`. Defaults to `false`.                         |
| `replay_dedup` | Filter previously confirmed records during Live replay. Defaults to `false`; see [Duplicate records](#duplicate-records). |

Each schema can appear once per task, and different schemas need distinct target
tables. A Live task can combine `mbp-1` with `tbbo` when their source settings
and `replay_dedup` values match. One MBP-1 subscription then feeds both tables.

Use separate tasks when the same schema needs different symbols, start times, or
tables. A matching saved checkpoint takes precedence over the initial start.

### Multiple datasets

Append another task to `connector.toml` to collect Nasdaq trades through the
same QuestDB pool:

```toml
[[tasks]]
name = "nasdaq"
pool = "main"
dataset = "XNAS.ITCH"
state_dir = "./state/nasdaq"

[[tasks.subscriptions]]
schema = "trades"
symbols = ["AAPL", "MSFT"]
table = "nasdaq_trades"
```

Tasks read `DATABENTO_API_KEY` by default. Set `tasks.source.api_key_env` when a
task needs a different key. Each Live task opens its own Databento session;
sharing a QuestDB pool does not combine source sessions.

### QuestDB authentication and TLS

The pool accepts a QuestDB
[connection string](/docs/connect/clients/connect-string/). Set `conf_env` to
read it from an environment variable, or use `conf` for an inline value. Specify
one, not both.

For a TLS-enabled Enterprise cluster, for example:

```shell
export QDB_CLIENT_CONF='wss::addr=node-a.example.com:9000,node-b.example.com:9000;token=<your-token>;target=primary;request_durable_ack=on;'
```

`wss::` enables TLS. The addresses identify the cluster nodes, and
`request_durable_ack=on` makes progress wait for durable acknowledgements. The
account needs write access to the destination tables and permission to create
any missing tables. Precreate tables if it should not have create access.

### Source connections

`tasks.source` accepts Live connection settings such as `gateway`, `port`,
`connect_timeout_ms`, `auth_timeout_ms`, and `heartbeat_interval_s`.

`tasks.source.http` configures Historical requests and continuous-contract
resolution. It accepts `connect_timeout_ms`, `request_timeout_ms`, `proxy_url`
or `proxy_url_env`, and `ca_cert_file`. Relative certificate and state paths
resolve from the configuration file's directory.

## Tables and field mapping

The connector creates missing tables with daily partitions and WAL. Setting
`table` changes the destination name, not the column mapping. Existing tables
must accept the mapped columns and use the expected designated timestamp.
Precreate compatible tables to customize partitioning, symbol capacity, or
[deduplication](/docs/concepts/deduplication/).

### Schemas and default tables

Available source schemas depend on the dataset. The connector maps these
schemas:

| Schema       | Default table            |
| ------------ | ------------------------ |
| `trades`     | `market_trades`          |
| `mbo`        | `market_mbo`             |
| `mbp-1`      | `market_depth_1`         |
| `mbp-10`     | `market_depth_10`        |
| `tbbo`       | `market_tbbo`            |
| `bbo-1s`     | `market_bbo_1s`          |
| `bbo-1m`     | `market_bbo_1m`          |
| `cmbp-1`     | `market_cmbp_1`          |
| `tcbbo`      | `market_tcbbo`           |
| `cbbo-1s`    | `market_cbbo_1s`         |
| `cbbo-1m`    | `market_cbbo_1m`         |
| `ohlcv-1s`   | `market_ohlcv_1s`        |
| `ohlcv-1m`   | `market_ohlcv_1m`        |
| `ohlcv-1h`   | `market_ohlcv_1h`        |
| `ohlcv-1d`   | `market_ohlcv_1d`        |
| `ohlcv-eod`  | `market_ohlcv_eod`       |
| `definition` | `instrument_definitions` |
| `statistics` | `market_statistics`      |
| `status`     | `market_status`          |
| `imbalance`  | `market_imbalance`       |

Every row includes `dataset` and the resolved `symbol` as `SYMBOL` columns,
`publisher_id` as `INT`, and `instrument_id` as `LONG`. Source prices are
converted to `DOUBLE`. DBN framing fields and reserved bytes are omitted.

### Timestamps

Both `ts_event` and, where supplied by the schema, `ts_recv` retain nanosecond
precision as `TIMESTAMP_NS`:

| Column     | Meaning                                             | Used as the designated timestamp |
| ---------- | --------------------------------------------------- | -------------------------------- |
| `ts_event` | Source event time; for OHLCV, the bar's start time. | OHLCV schemas.                   |
| `ts_recv`  | Databento capture server's receive time.            | All other schemas.               |

The [designated timestamp](/docs/concepts/designated-timestamp/) controls
partitioning and time-series operations such as `SAMPLE BY`. On a trades or
quotes table, these use `ts_recv` by default; `ts_event` remains available for
event-time analysis.

Empty MBO snapshots are an exception: when the source `ts_recv` is undefined,
the connector uses `ts_event` for the stored `ts_recv`. This time can precede a
Historical request's `start`, so a backfill can include an empty-snapshot row
dated before the requested range.

### Order book arrays

Quotes store `bids` and `asks` as `DOUBLE[][]` arrays of shape `[2, N]`, with
the best level first. The first row contains prices; the second contains sizes.
`N` is 10 for `mbp-10` and 1 for top-of-book schemas. QuestDB array indices
start at 1.

```questdb-sql
SELECT ts_recv, symbol,
       bids[1][1] AS bid_price,
       bids[2][1] AS bid_size,
       asks[1][1] AS ask_price,
       asks[2][1] AS ask_size,
       asks[1][1] - bids[1][1] AS spread
FROM cme_depth
ORDER BY ts_recv DESC
LIMIT 10;
```

Where provided by the schema, `bid_ct` and `ask_ct` store per-level order counts
as `DOUBLE[]`. MBO is stored as individual order events, not reconstructed book
arrays. See [Order book analytics](/docs/tutorials/order-book/) for more
queries.

## Historical backfills

Set `mode = "historical"` to run bounded requests instead of a Live session.
Every subscription needs an inclusive `start`; the task needs an exclusive
`end`. This example writes one minute of trades into a separate table:

```toml title="backfill.toml"
version = 1
on_task_failure = "exit"

[pools.main]
conf_env = "QDB_CLIENT_CONF"

[[tasks]]
name = "cme-backfill"
pool = "main"
dataset = "GLBX.MDP3"
mode = "historical"
end = "2026-09-15T14:31:00Z"
state_dir = "./state/cme-backfill"

[[tasks.subscriptions]]
schema = "trades"
symbols = ["ES.FUT"]
stype_in = "parent"
start = "2026-09-15T14:30:00Z"
table = "cme_trades_backfill"
```

Choose a range covered by your account, then run:

```shell
databento-questdb --config backfill.toml --check-config
databento-questdb --config backfill.toml
```

With `state_dir`, completed subscriptions are skipped on restart. An interrupted
request restarts from its original `start`, which can repeat rows and incur
additional Databento charges. Use a new state directory when changing the range.

Historical and Live tasks can run in the same process. A process containing only
Historical tasks exits when they finish.

## Recovery and delivery guarantees

Progress advances only after QuestDB acknowledges the corresponding output. Live
reconnects resume from a boundary that includes unconfirmed input, with an
additional `replay_lookback_ms` window of 5 seconds by default. Delivery is **at
least once** within the source replay coverage and configured lookback.

Give each task its own persistent `state_dir` to recover across process
restarts. Checkpoints are saved every second by default and at normal shutdown.
Without `state_dir`, progress is retained only while the process is running.
Changes to the dataset, subscriptions, tables, Historical range, QuestDB
endpoints, or acknowledgement level require a new state directory.

### Duplicate records

Replay writes records again by default. A crash after QuestDB accepts rows but
before the checkpoint is saved can also produce duplicates. The connector does
not enable QuestDB `DEDUP` automatically. If you need it, precreate the table
with keys that identify an event uniquely. A symbol and timestamp alone do not
identify every trade or order event.

The optional subscription setting `replay_dedup = true` applies
[Databento's time-and-count filtering](https://databento.com/docs/api-reference-live#recovering-after-a-disconnection).
It requires nondecreasing recovery timestamps per instrument and stable order
for records sharing a timestamp: `ts_recv` for BBO/CBBO, `ts_event` for other
schemas. Enabling it when those assumptions do not hold can discard unseen
records. It is disabled by default and does not guarantee exactly-once delivery
across crashes.

### Replay availability

Databento generally provides
[24 hours of Live replay](https://databento.com/docs/api-reference-live#intraday-replay),
with dataset-specific exceptions. If the required history has expired, the task
fails. To recover:

1. Find each affected subscription's saved recovery boundary using the sources
   below. Keep the original `state_dir` until recovery is complete.
2. Run a [Historical backfill](#historical-backfills) from that boundary into
   the same destination tables as the Live task. Give the backfill its own
   `state_dir`.
3. Restart Live with a new `state_dir` and an explicit `start` that is still
   within replay coverage. Choose a start before the backfill's `end` to overlap
   the ranges; this overlap can produce duplicates.

For checkpointed tasks, obtain the recovery boundary from either source:

- **Saved metrics:** Enable [metrics](#logs-and-metrics) and retain scrapes
  before a failure. `databento_questdb_disk_resume_start_timestamp_seconds`
  reports the saved boundary in Unix seconds, labeled by `connector` and
  `schema`. Metrics are disabled by default, and the endpoint is unavailable
  after process exit.
- **Recovery logs:** On restart with the original configuration and `state_dir`,
  the `recovering source subscription` message reports the attempted boundary as
  `start_ns`, in Unix nanoseconds. Match its `connector` and `schema` fields;
  this message requires info-level logging (`RUST_LOG=info`).

Use the recovery boundary, rather than the last displayed record, to choose the
backfill start. Convert it to UTC RFC 3339: divide `start_ns` by `1,000,000,000`
to get Unix seconds. For example, `1789482600000000000` nanoseconds and
`1789482600` seconds both represent `2026-09-15T14:30:00Z`. When using metrics,
start one second earlier to allow for timestamp rounding.

Continuous-contract subscriptions keep their mapping for the current session. On
recovery, the connector uses Databento's Historical symbology API to resolve
contracts covering the replay range, with the same API key and
`tasks.source.http` settings. Contract rolls take effect at the next reconnect
or restart.

## Running in production

### Failures and shutdown

Transient source failures retry with exponential backoff. Under
`tasks.source_retry`, `initial_backoff_ms` defaults to `1000`, `max_backoff_ms`
to `30000`, and `max_elapsed_ms` to `300000`. Permanent errors fail the task.

The top-level `on_task_failure` setting controls what happens next:

| Value      | Behavior                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `exit`     | Stop the other tasks normally and exit nonzero, allowing a service supervisor to restart the process. Used in the quick start. |
| `continue` | Keep other tasks running and retain the failed task in logs and metrics. This is the default.                                  |

A failed task is not restarted in-process. Ctrl+C or SIGTERM requests a normal
stop: drain pending output, then persist the final checkpoint. The default drain
timeout is 30 seconds; final checkpoint persistence is awaited separately.

### Logs and metrics

Logs go to stderr. `RUST_LOG` controls the filter, which defaults to `info`. The
top-level `progress_log_interval_s` sets the progress-summary interval; it
defaults to `60`, and `0` disables summaries.

Enable Prometheus metrics with:

```shell
databento-questdb --config connector.toml --metrics-addr 127.0.0.1:9090
```

Scrape `http://127.0.0.1:9090/metrics` for task status, throughput,
confirmations, retries, checkpoints, and failures. Metrics use the
`databento_questdb_*` prefix and `connector`, `schema`, and `table` labels where
applicable; `connector` contains the task name. The endpoint is plain HTTP
without authentication. No metrics port is opened unless configured.

### Batching and backpressure

Start with the defaults. Override these settings under `tasks.runtime` when
latency or available memory requires it:

| Setting                  | Default    | Purpose                                          |
| ------------------------ | ---------- | ------------------------------------------------ |
| `batch_rows`             | `1000`     | Maximum source records per batch.                |
| `batch_bytes`            | `1048576`  | Estimated bytes per batch.                       |
| `flush_interval_ms`      | `20`       | Send partial batches regularly.                  |
| `queue_max_bytes`        | `67108864` | Estimated buffered input budget.                 |
| `queue_max_batches`      | `64`       | Number of batches the writer queue can hold.     |
| `max_inflight_batches`   | `64`       | Published batches waiting for confirmation.      |
| `checkpoint_interval_ms` | `1000`     | Interval between background checkpoint requests. |
| `replay_lookback_ms`     | `5000`     | Additional Live replay lookback.                 |
| `shutdown_timeout_ms`    | `30000`    | Time allowed to drain pending output.            |

Smaller batches reduce latency but increase write overhead. When bounded queues
fill, the connector pauses source reads while continuing writes and processing
acknowledgements. Reads resume when capacity becomes available. These byte
budgets do not cap total process memory.

The connector requests Databento's
[`warn` mode](https://databento.com/docs/api-reference-live/basics/slow-reader-behavior):
a `SlowReaderWarning` is logged, and the source continues replaying records
without skipping ahead. If the backlog outlives the replay retention window,
`ReplayDataAgedOut` fails the task. Follow the
[backfill procedure](#replay-availability); reconnecting alone cannot restore
expired data.

## Embedding in Rust

Use the executable for a configured ingestion service. Applications that need to
manage ingestion themselves can use the `databento_questdb` library: each
`Connector` accepts source subscriptions, mapping options, a shared
`Arc<QuestDbPool>`, and a cancellation token. Progress is available through
`progress_handle()`.

From the connector checkout, build the API reference with:

```shell
cargo doc --locked --no-deps --lib --open
```

For a clean shutdown, cancel the token and keep awaiting `run()` until it
returns. Dropping the run future bypasses draining and final checkpointing.
