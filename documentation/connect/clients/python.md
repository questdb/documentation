---
slug: /connect/clients/python
title: Python client for QuestDB
sidebar_label: Python
description: "Use the QuestDB Python client's QuestDB pool for row, DataFrame, and Arrow ingestion plus SQL queries over QWP."
---

The QuestDB Python client uses one thread-safe `QuestDB` handle for ingestion
and SQL queries over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/). Lease a
short-lived sender for each unit of row-building work, bulk-load DataFrames
through the handle, and run SQL with `query()`. Context managers return every
lease to the pool.

## Quick start

Install the client. Python 3.10 or newer is required; `pandas`, `polars`,
`pyarrow`, and `numpy` are optional and only needed for the DataFrame and
array paths (the quick start below reads its result into pandas):

```bash
python3 -m pip install -U questdb pandas
```

The following program writes one uniquely marked row through a pooled sender,
waits for the server to accept it, then polls for query visibility:

```python
import os
import sys
import time

import questdb
from questdb import QuestDBError, TimestampNanos


def main() -> None:
    marker = f"python-{os.getpid()}-{time.time_ns()}"

    with questdb.connect("ws::addr=localhost:9000;") as db:
        with db.sender() as sender:
            sender.row(
                "python_quick_start",
                symbols={"symbol": marker},
                columns={"price": 2615.54},
                at=TimestampNanos.now(),
            )
            sender.flush(wait=True)

        deadline = time.monotonic() + 10
        while True:
            sql = (
                "SELECT price FROM python_quick_start "
                f"WHERE symbol = '{marker}' LIMIT 1"
            )
            with db.query(sql) as result:
                frame = result.to_pandas()
            if len(frame) > 0:
                print(marker, frame["price"].iloc[0])
                break
            if time.monotonic() >= deadline:
                raise TimeoutError("timed out waiting for query visibility")
            time.sleep(0.1)


if __name__ == "__main__":
    try:
        main()
    except QuestDBError as e:
        print(
            f"QuestDB error {e.code} (in_doubt={e.in_doubt}): {e}",
            file=sys.stderr,
        )
        sys.exit(1)
```

`flush(wait=True)` confirms that QuestDB accepted the rows, but WAL
application and query visibility happen asynchronously. The bounded poll uses
a unique value so it cannot accidentally report an older row. In production,
poll for the application condition you need and choose a timeout that matches
your ingestion and query latency budget.

Every client failure raises `QuestDBError`; catch it and dispatch on
`e.code` as shown. The [error taxonomy](#error-taxonomy) describes the codes
and the `in_doubt` retry hazard.

## Connecting

Use `ws` for plain WebSocket or `wss` for TLS:

```python
import questdb

db = questdb.connect("ws::addr=localhost:9000;")
```

`questdb.connect()` accepts only QWP/WebSocket configuration strings; any
other scheme raises `QuestDBError` with `QuestDBErrorCode.ConfigError`. It
parses and validates the string without opening a connection: the first
`sender()`, `dataframe()`, or `query()` call opens one, and later calls reuse
pooled connections. `QuestDB.from_conf()` is the equivalent static
constructor.

The handle is a context manager. Without `with`, call `db.close()` at
shutdown.

There is no `from_env()` on the pooled handle. To keep credentials out of
code, put the configuration string in an environment variable and read it
yourself:

```python
import os

import questdb

db = questdb.connect(os.environ["QDB_CLIENT_CONF"])
```

## Authentication and TLS

Put credentials and TLS settings in the same configuration string:

```python
import questdb

basic = questdb.connect(
    "wss::addr=db.example.com:9000;username=admin;password=quest;"
)

token = questdb.connect(
    "wss::addr=db.example.com:9000;token=your_bearer_token;"
)
```

Authentication happens during the WebSocket upgrade, before any data frames
are exchanged. Because connections open lazily, a bad credential surfaces as
`QuestDBErrorCode.AuthError` from the first operation, not from `connect()`.

With `wss`, the default certificate root store is the bundled `webpki` set.
Override it with configuration keys:

| Setting | Meaning |
| --- | --- |
| `tls_ca=os_roots` | Use the operating-system certificate store. |
| `tls_ca=webpki_and_os_roots` | Combine the bundled and OS root stores. |
| `tls_roots=/path/to/ca.pem` | Use a private CA bundle. |
| `tls_verify=unsafe_off` | Disable verification; use only in controlled tests. |

See the [connect string reference](/docs/connect/clients/connect-string/) for
the full grammar.

### Unsupported auth paths

The client supports only HTTP basic auth and static bearer-token auth. The
following are **not** supported:

| Path | Status | Workaround |
| --- | --- | --- |
| OIDC token acquisition or in-band refresh | Not supported. The client does not negotiate with an identity provider and cannot refresh a token mid-session. | QuestDB itself supports OIDC; see [OpenID Connect](/docs/security/oidc/). Acquire an access token out-of-band from your IdP, pass it via `token=...`, and rebuild the handle when the token nears expiry. |
| Mutual TLS (client certificates) | Not supported. The QuestDB server does not negotiate client certificates regardless of client. | Use bearer-token auth over `wss`. |
| Token rotation mid-session | Not supported. Credentials are presented once during the WebSocket upgrade and are not re-sent. | On token expiry, close the handle and build a fresh one with the new token. |

## The pool

`QuestDB` owns reusable QWP/WebSocket connections. Create one handle per
application or service process and share it across threads. Each operation
borrows a connection and returns it when the lease or result closes.

### Choose an API

Match the API to the shape of the work:

| You have | Use | Why |
| --- | --- | --- |
| Events arriving one at a time | `db.sender()` + `row()` | Build rows field by field and flush them in batches. |
| Data already in a DataFrame or Arrow table | `db.dataframe()` | Encode whole columns in one pass, with commit and ack handled per call. |
| SQL to execute | `db.query()` | Stream Arrow result batches into pandas, polars, or pyarrow. |

There is no per-column setter or chunk API in the Python client; whole-frame
`dataframe()` is the column-major path. Row senders use store-and-forward;
`dataframe()` uses a separate direct connection pool and blocks for an ack.

## Row ingestion

Lease a sender for events that arrive one at a time. Build several rows, then
flush on your application's size or time boundary:

```python
import sys

import questdb
from questdb import QuestDBError, TimestampNanos

try:
    with questdb.connect("ws::addr=localhost:9000;") as db:
        with db.sender() as sender:
            for symbol, price, amount in [
                ("ETH-USDT", 2615.54, 0.00044),
                ("BTC-USDT", 65432.10, 0.00120),
            ]:
                sender.row(
                    "trades",
                    symbols={"symbol": symbol},
                    columns={"price": price, "amount": amount},
                    at=TimestampNanos.now(),
                )
            sender.flush()
except QuestDBError as e:
    print(
        f"ingestion failed: {e} (code={e.code}, in_doubt={e.in_doubt})",
        file=sys.stderr,
    )
    sys.exit(1)
```

`row()` takes the table name, a `symbols` dict for `SYMBOL` columns, a
`columns` dict for everything else, and the mandatory `at` designated
timestamp: a `TimestampNanos`, a timezone-aware `datetime`, or the
`questdb.ServerTimestamp` sentinel to let the server assign arrival time.
When QWP auto-creates a table, the designated timestamp column is named
`timestamp`.

The handle is thread-safe; a sender lease is not. Take one lease per thread
and keep it on that thread (see
[Concurrency and sizing](#concurrency-and-sizing)).

`len(sender)` reports the number of buffered, not yet published rows.

### Value types

The Python value type selects the QuestDB column type:

| Python value in `columns` | QuestDB type |
| --- | --- |
| `bool` | `BOOLEAN` |
| `int` | `LONG` |
| `float` | `DOUBLE` |
| `str` | `VARCHAR` |
| `TimestampMicros`, `TimestampNanos`, `datetime.datetime` | `TIMESTAMP`, `TIMESTAMP_NS` |
| `numpy.ndarray` of `float64` | `ARRAY(DOUBLE)`, QuestDB 9.0.0 or later |
| `decimal.Decimal` | `DECIMAL`, QuestDB 9.2.0 or later |
| `None` | Column omitted for this row, stored as null |

Strings passed in the `symbols` dict become interned `SYMBOL` values;
strings in `columns` become `VARCHAR`. `DECIMAL` columns must be created
ahead of time with `CREATE TABLE ... (price DECIMAL(18, 2), ...)`; the server
does not auto-create them.

`UUID`, `IPv4`, `GEOHASH`, `LONG256`, `CHAR`, `DATE`, and `BINARY` columns
have no `row()` value type. Route them through
[`dataframe()`](#dataframe-ingestion), whose `schema_overrides` covers
`symbol`, `ipv4`, `char`, and `geohash`, or through a SQL `INSERT` via
[`query()`](#querying).

QWP cannot preserve nulls for `BOOLEAN`, `BYTE`, or `SHORT`. An absent value
in one of those columns is received as `false` or `0`; use a wider nullable
type when the distinction matters.

:::caution No auto-flush

The pooled sender has no `auto_flush_rows` or `auto_flush_interval` keys;
flushing is always explicit. Accumulate rows on your own cadence (row count
via `len(sender)`, or a timer) and call `flush()` yourself. A good starting
cadence is about 1,000 rows or 100 ms, whichever comes first. Nulls are
written by omission (skip the key or pass `None`); there is no `set_null`
call.

:::

`flush()` publishes the buffered rows to the local queue and returns;
delivery continues in the background. `flush(wait=True)` additionally blocks
until the server acknowledges everything published on this lease, and
`wait(timeout_millis)` is the standalone barrier with an explicit no-progress
timeout (`0` means no deadline). Closing the lease (leaving the `with` block)
flushes remaining rows without waiting.

:::note Not on the pooled sender

The 4.x `Sender` surface is intentionally absent from the pooled lease:
there is no `transaction()`, no `new_buffer()` or `Buffer`, and no FSN
methods (`flush_and_get_fsn`, `await_acked_fsn`). Those exist only on the
standalone legacy `Sender`.

:::

## DataFrame ingestion

Use `db.dataframe()` when the data already lives in columns. Each call
borrows a direct columnar connection, publishes the frame in batches, blocks
until the server acknowledges the final batch, and returns the connection to
the pool:

```python
import pandas as pd
import questdb

df = pd.DataFrame({
    "symbol": pd.Categorical(["ETH-USDT", "BTC-USDT"]),
    "price": [2615.54, 65432.10],
    "amount": [0.00044, 0.00120],
    "timestamp": pd.to_datetime([
        "2025-01-01T00:00:00Z",
        "2025-01-01T00:00:01Z",
    ]),
})

with questdb.connect("ws::addr=localhost:9000;") as db:
    db.dataframe(df, table_name="trades", symbols=["symbol"], at="timestamp")
```

`df` accepts pandas `DataFrame`, polars `DataFrame` and `LazyFrame`, pyarrow
`Table`, `RecordBatch`, and `RecordBatchReader`, and any object exposing the
Arrow C Data Interface (`__arrow_c_stream__` or `__arrow_c_array__`), such as
DuckDB results:

```python
import polars as pl

db.dataframe(
    pl.DataFrame({
        "symbol": ["ETH-USDT", "BTC-USDT"],
        "price": [2615.54, 65432.10],
        "timestamp": [1735689600000000000, 1735689601000000000],
    }).with_columns(pl.col("timestamp").cast(pl.Datetime("ns", "UTC"))),
    table_name="trades",
    symbols=["symbol"],
    at="timestamp",
)
```

Parameters:

| Parameter | Meaning |
| --- | --- |
| `table_name` / `table_name_col` | A fixed table name, or the column (by name or index) that names the table per row. |
| `symbols` | `"auto"` (default: categorical and dictionary columns become `SYMBOL`), a bool, or a list of column names or indices. |
| `at` | The designated timestamp column (by name or index), a fixed `TimestampNanos` or `datetime` shared by every row, or `questdb.ServerTimestamp`. |
| `max_rows_per_batch` | Rows per published batch, default 16384. |
| `schema_overrides` | Per-column wire-type overrides, e.g. `{"addr": "ipv4", "loc": ("geohash", 20)}`; values are `symbol`, `ipv4`, `char`, or `geohash`. |

Numeric, string, timestamp, and decimal (`pyarrow.decimal32` through
`decimal256`) column types map directly. Columns of `float64` numpy arrays or
Arrow `list_` / `large_list` / `fixed_size_list` with a `float64` leaf become
`ARRAY(DOUBLE)`. Null cells (`None`, `NaN`, `pd.NA`, and Arrow nulls) are
stored as SQL nulls, with the same `BOOLEAN`, `BYTE`, and `SHORT` caveat as
row ingestion. A frame the columnar path cannot express raises
`UnsupportedDataFrameShapeError` with per-column failures in
`column_failures`.

The call blocks until the ack and is safe from any thread: the handle owns
the connection lease for the duration of the call.

`dataframe()` bypasses the sender store-and-forward queue and has no ordering
relationship with rows buffered on a sender lease. On a transient failover it
re-sends a batch only when the batch provably did not reach the server;
delivery-unknown failures raise a `QuestDBError` with `in_doubt=True`.
Replay is at-least-once, so use
[deduplication](/docs/concepts/deduplication/) when duplicates would be
harmful.

## Querying

`db.query(sql)` returns a `QueryResult` that streams Arrow record batches
from the server. Materialize the whole result, or iterate batch by batch:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query(
        "SELECT timestamp, symbol, price FROM trades WHERE price > 2615.0"
    ) as result:
        frame = result.to_pandas()

print(frame)
```

| Method | Returns | Requires |
| --- | --- | --- |
| `to_pandas()` | `pandas.DataFrame` | pandas (pyarrow-free by default) |
| `to_polars()` | `polars.DataFrame` | polars and pyarrow |
| `to_arrow()` | `pyarrow.Table` | pyarrow |
| `iter_pandas()` | Iterator of `pandas.DataFrame` batches | pandas |
| `iter_polars()` | Iterator of `polars.DataFrame` batches | polars and pyarrow |
| `iter_arrow()` | Iterator of `pyarrow.RecordBatch` | pyarrow |
| `__arrow_c_stream__` | Arrow C stream PyCapsule | nothing (consumer-side) |

The `to_*` methods materialize the complete result; prefer the `iter_*`
variants for large results. The PyCapsule protocol lets Arrow consumers read
the result directly without pyarrow installed, for example
`polars.from_arrow(result)`.

If the connection fails over mid-result, the `iter_*` and PyCapsule paths
raise `QuestDBErrorCode.FailoverWouldDuplicate` instead of repeating rows you
already consumed, while the `to_*` methods replay transparently; see
[Failover and errors](#failover-and-errors).

A `QueryResult` is single-use (one materialization or iteration consumes it),
must stay on the thread that created it, and returns its reader to the pool
when consumed or closed. Use the `with` block or call `close()`.

:::note No parameter binds

`query()` takes only the SQL string; the Python client has no bind-parameter
API (there is no `params`, `args`, or `bind_*` surface). Interpolate values
into the SQL yourself and quote them carefully, or restrict queries to
trusted inputs.

:::

### Result types and nulls

| QuestDB type | pandas mapping |
| --- | --- |
| `BOOLEAN`, `BYTE`, `SHORT` | `bool`, `int8`, `int16`; always non-null, server-side nulls arrive as `false` or `0` |
| `INT`, `LONG` | Nullable `Int32` / `Int64` with `pd.NA` |
| `FLOAT`, `DOUBLE` | `float32` / `float64` with `NaN` for null |
| `TIMESTAMP`, `TIMESTAMP_NS` | `datetime64` with `NaT` for null |
| `SYMBOL` | `Categorical` sharing one dictionary across batches |
| `VARCHAR` | Strings with `None` for null |

QuestDB's sentinel values (for example `NaN` doubles and `INT64_MIN` longs)
are decoded as nulls rather than leaking as magic numbers.

### DDL, DML, and cancellation

`query()` also runs statements such as `CREATE`, `ALTER`, `INSERT`, `UPDATE`,
and `DROP`; consume or close the result even when no rows are expected:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query(
        "CREATE TABLE IF NOT EXISTS trades ("
        "  timestamp TIMESTAMP, symbol SYMBOL,"
        "  price DOUBLE, amount DOUBLE"
        ") TIMESTAMP(timestamp) PARTITION BY DAY WAL"
    ) as result:
        result.to_pandas()
```

A statement result carries no rows, so `to_pandas()` returns an empty frame.
The Python surface exposes no affected-row count: there is no `rowcount` or
`rows_affected` on `QueryResult`. Call `result.cancel()` to ask the server to
stop streaming an active query; it is idempotent.

Zstandard result compression is negotiated and decompressed transparently;
there are no compression or flow-control knobs on the Python surface. The
`reset_symbol_dict` keyword (default `True`) gives each query a fresh
`SYMBOL` dictionary; set it to `False` to keep the dictionary warm across
repeated identical queries.

## Delivery and durability

Row senders always publish through a local store-and-forward queue. Without
`sf_dir` the queue is in memory. With `sf_dir`, each lease uses a disk slot:

```text
<sf_dir>/<sender_id>-ingest-<index>/
```

Give each handle that shares an `sf_dir` a distinct `sender_id`. On restart,
the pool reopens managed dirty slots and replays their unacknowledged frames.
Disk mode is page-cache durable: it protects against a client-process crash
but not a host crash or power loss.

| Need | Use |
| --- | --- |
| Highest throughput | `flush()`; delivery continues in the background |
| One-call delivery barrier | `flush(wait=True)` |
| Per-call deadline | `flush()` then `wait(timeout_millis)` |

A `wait()` timeout is a no-progress timeout: the data remains queued and
background delivery continues, so retry `wait()` rather than flushing the
same rows again.

`flush(wait=True)` and `wait()` observe the accepted (`Ok`) acknowledgement:
the server took responsibility for the frames. A durable-level wait (waiting
for object-storage upload on Enterprise deployments) is not exposed on the
pooled Python API. The `request_durable_ack=on` connect key is accepted, and
a server without durable-ack support rejects the first operation with
`QuestDBErrorCode.ProtocolVersionError`; see the
[connect string reference](/docs/connect/clients/connect-string/).

Store-and-forward is bounded. When producers continuously outrun the server,
publication can wait for ack-driven space and then raise
`QuestDBErrorCode.ServerFlushError`:

| Key | Default | Purpose |
| --- | --- | --- |
| `sf_max_bytes` | `4 MiB` | Segment and single-payload size cap. |
| `sf_max_total_bytes` | `128 MiB` in memory, `10 GiB` on disk | Total queue budget per sender. |
| `sf_append_deadline_millis` | `30000` | Maximum no-progress wait for queue space. |
| `close_flush_timeout_millis` | `5000` | Best-effort drain window when a lease or the handle closes. |

`dataframe()` uses the direct connection pool and is unaffected by `sf_dir`.

## Concurrency and sizing

The `QuestDB` handle is thread-safe; share one per process. Each sender lease
and each `QueryResult` belongs to the thread that created it. The client
releases the GIL around network and encoding work, so ingestion threads
genuinely overlap:

```python
import threading

import questdb
from questdb import TimestampNanos

db = questdb.connect("ws::addr=localhost:9000;pool_size=4;pool_max=16;")


def worker(worker_id: int) -> None:
    with db.sender() as sender:
        for i in range(100):
            sender.row(
                "trades",
                symbols={"symbol": "ETH-USDT"},
                columns={"price": 2615.54 + worker_id},
                at=TimestampNanos.now(),
            )
        sender.flush(wait=True)


threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
for thread in threads:
    thread.start()
for thread in threads:
    thread.join()
db.close()
```

### Pool settings

| Key | Default | Guidance |
| --- | --- | --- |
| `pool_size` | `1` | Warm minimum retained after connections have been opened. Set it near steady concurrent use. |
| `pool_max` | `64` | Per-pool growth cap. Set it at or above peak concurrent leases. |
| `pool_idle_timeout_ms` | `60000` | Idle lifetime for connections above `pool_size`. |
| `pool_reap` | `auto` | Use `manual` only when your application will call `db.reap_idle()`. |

The sender and reader pools grow and cap independently, and `dataframe()`
uses another internal direct pool, so account for all active paths when
sizing the server. Keep leases short: a sender lease occupies its slot until
it closes, even while idle.

## Failover and errors

List every node of one logical deployment in a single `addr` server list:

```python
import questdb

db = questdb.connect(
    "ws::addr=node-a:9000,node-b:9000,node-c:9000;target=primary;"
)
```

The background runner reconnects and replays queued frames. The retry budget
uses these keys:

| Key | Default |
| --- | --- |
| `reconnect_max_duration_millis` | `300000` |
| `reconnect_initial_backoff_millis` | `100` |
| `reconnect_max_backoff_millis` | `5000` |

Authentication failures, protocol-version failures, and terminal data
rejections are not retried. When the reconnect budget is exhausted, the
pending flush or wait raises `QuestDBErrorCode.FailoverRetry`; close the
lease and take a fresh one to retry.

The client exposes no connection-state callbacks: observe failures through
the raised errors and [`server_info()`](#server-information).

Reader failover has a separate policy:

| Key | Default | Meaning |
| --- | --- | --- |
| `failover` | `on` | Permit mid-query failover. |
| `failover_max_attempts` | `8` | Total execute attempts, including the first. |
| `failover_max_duration_ms` | `30000` | Overall reader failover budget; `0` means unbounded. |
| `failover_backoff_initial_ms` | `50` | First retry delay; `0` disables sleeping. |
| `failover_backoff_max_ms` | `1000` | Retry-delay ceiling. |

When every attempt is exhausted, the consuming call raises the underlying
`QuestDBError`.

A mid-query failover restarts the query from the beginning. What you observe
depends on how you consume the result:

- `to_pandas()`, `to_polars()`, and `to_arrow()` discard their partial
  accumulation and replay transparently; you receive one complete result.
- `iter_pandas()`, `iter_polars()`, `iter_arrow()`, and the PyCapsule stream
  raise `QuestDBErrorCode.FailoverWouldDuplicate` instead of silently
  repeating batches you already consumed. Discard partial state and rerun the
  query. Failover before the first batch is always transparent.

### Error taxonomy

All failures raise `QuestDBError` (or a subclass). Inspect:

| Property | Meaning |
| --- | --- |
| `code` | A `QuestDBErrorCode` member; compare by identity, e.g. `err.code is QuestDBErrorCode.Cancelled`. |
| `in_doubt` | `True` when the failed operation may already have delivered its input; retrying can duplicate rows without deduplication. |
| `qwp_ws_error` | Structured server diagnostic for QWP sender failures, or `None`. |

`QuestDBServerRejectionError` marks a terminal server rejection; its
`qwp_ws_error` payload carries `category` (schema mismatch, parse error,
security error, ...), `applied_policy` (retriable or terminal), `status`,
`message`, and the affected `from_fsn` / `to_fsn` frame range.
`UnsupportedDataFrameShapeError` reports per-column DataFrame failures. The
legacy `IngressError` name remains an alias of `QuestDBError`.

No server correlation or request ID is surfaced. Message text is
server-generated English prose and is not a stable API: dispatch on `code`
and `qwp_ws_error.category`, not on message contents. Messages can echo
table names, column names, and SQL fragments, so sanitize them before
forwarding to end-user UIs or third-party error trackers.

After an error, close the lease or result as usual (or leave the `with`
block): the pool inspects returned connections and retires any that latched
a terminal error, so plain closing is always safe and the next lease gets a
healthy connection.

### Server information

`db.server_info()` snapshots the server handshake: cluster role
(`Standalone`, `Primary`, `Replica`, ...), failover epoch, capabilities, and
cluster and node identifiers.

## Closing

`db.close()` (or leaving the `with` block) is idempotent: it waits for active
leases and queries to finish, drains store-and-forward queues on a
best-effort basis for `close_flush_timeout_millis` (default five seconds),
and closes pooled connections. An in-memory queue that cannot drain within
that window loses its remaining tail; disk mode (`sf_dir`) keeps it for
restart replay. Before shutdown:

- Call `flush(wait=True)` or `wait()` on each sender when accepted delivery
  is required.
- Configure `sf_dir` when undelivered frames must replay after a process
  restart.

## Production shape: TLS, token, multi-host

A production-shaped configuration combines TLS with OS trust roots, a bearer
token, two endpoints, and a disk-backed store-and-forward spool:

```python
import sys

import questdb
from questdb import QuestDBError, TimestampNanos

conf = (
    "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;"
    "token=YOUR_BEARER_TOKEN;"
    "tls_ca=os_roots;"
    "sf_dir=/var/spool/questdb;"
    "sender_id=ingest-01;"
)

try:
    with questdb.connect(conf) as db:
        with db.sender() as sender:
            sender.row(
                "trades",
                symbols={"symbol": "ETH-USDT"},
                columns={"price": 2615.54, "amount": 0.00044},
                at=TimestampNanos.now(),
            )
            sender.flush(wait=True)
except QuestDBError as e:
    print(
        f"ingest failed: {e} (code={e.code}, in_doubt={e.in_doubt})",
        file=sys.stderr,
    )
    sys.exit(1)
```

Flushed frames land in the `sf_dir` spool, so a process restart with the same
`sender_id` replays anything unacknowledged. For acknowledgement semantics,
including the durable-ack limitation of the pooled Python API, see
[Delivery and durability](#delivery-and-durability).

## Legacy ILP clients

The 4.x `Sender` API (`http::`, `https::`, `tcp::`, `tcps::`) remains
available for InfluxDB Line Protocol ingestion, including
`Sender.from_conf()`, auto-flush, and HTTP transactions, and the
`questdb.ingress` import path still works as a deprecated alias module. It is
documented on
[ReadTheDocs](https://py-questdb-client.readthedocs.io/en/latest/), and the
[5.0 migration guide](https://py-questdb-client.readthedocs.io/en/latest/migration.html)
maps each 4.x call to its pooled equivalent.

## Next steps

- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [Rust client](/docs/connect/clients/rust/)
- [C and C++ client](/docs/connect/clients/c-and-cpp/)
- [Query overview](/docs/query/overview/)
