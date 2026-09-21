---
title: Polars
description:
  Query QuestDB into Polars DataFrames and ingest them natively from Python
  and Rust over QWP.
---

[Polars](https://pola.rs/) is a fast DataFrame library implemented in Rust
with a Python API. It processes large datasets efficiently and is well suited
to time-series work. Since QuestDB 10.0 the
[Python](/docs/connect/clients/python/) and [Rust](/docs/connect/clients/rust/)
clients both speak Polars natively over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), in both
directions.

QWP results arrive as Arrow record batches, which is Polars' own memory
layout, so a query becomes a DataFrame with no row-by-row conversion.
Ingestion sends the frame column by column over the same connection pool. No
ConnectorX or PGWire driver is involved.

## Prerequisites

- QuestDB 10.0 or later, running and accessible. See the
  [quick start](/docs/getting-started/quick-start).
- For Python: version 3.10 or later, plus the client and Polars.
- For Rust: `questdb-rs` with the Polars crate features enabled.

```bash
python3 -m pip install -U questdb polars pyarrow
```

## Python

### Query into a DataFrame

`db.query()` streams Arrow batches from the server. `to_polars()` materializes
the whole result:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query(
        "SELECT timestamp, symbol, price, amount FROM trades "
        "WHERE timestamp IN '$now-1h..$now'"
    ) as result:
        df = result.to_polars()

print(df.head())
```

Bind values with `$1`..`$N` placeholders rather than interpolating them into
the SQL string:

```python
df = db.query(
    "SELECT * FROM trades WHERE symbol = $1 AND price > $2",
    ["ETH-USDT", 2615.0],
).to_polars()
```

Use `to_polars()` by default. It requires `pyarrow`. If you need a
pyarrow-free installation, pass the result to `pl.DataFrame` instead:

```python
import polars as pl

with db.query("SELECT * FROM trades LIMIT 1000") as result:
    df = pl.DataFrame(result)
```

This still materializes the complete result and can be slower for
`SYMBOL`-heavy queries.

### Stream large results

For results that do not fit comfortably in memory, iterate batch by batch with
`iter_polars()`:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query("SELECT price, amount FROM trades") as result:
        notional = sum(
            (chunk["price"] * chunk["amount"]).sum()
            for chunk in result.iter_polars()
        )

print(notional)
```

A result is single-use and must stay on the thread that created it. Use a
`with` block, or call `close()`, so the connection returns to the pool.

### Ingest a DataFrame

`db.dataframe()` accepts Polars `DataFrame` and `LazyFrame` alongside pandas
and pyarrow inputs. Each call publishes the frame in batches and blocks until
the server acknowledges the last one:

```python
import polars as pl
import questdb

df = pl.DataFrame({
    "symbol": ["ETH-USDT", "BTC-USDT"],
    "price": [2615.54, 65432.10],
    "amount": [0.00044, 0.00120],
    "timestamp": [1735689600000000000, 1735689601000000000],
}).with_columns(pl.col("timestamp").cast(pl.Datetime("ns", "UTC")))

with questdb.connect("ws::addr=localhost:9000;") as db:
    db.dataframe(df, table_name="trades", symbols=["symbol"], at="timestamp")
```

`symbols` takes a list of column names to store as `SYMBOL`, and `at` names
the designated timestamp column. See
[DataFrame ingestion](/docs/connect/clients/python/#dataframe-ingestion) for
batching, null handling, and the full parameter set.

## Rust

### Crate features

Polars support is gated behind optional crate features:

```toml title="Cargo.toml"
[dependencies]
questdb-rs = { version = "7", features = ["polars"] }
```

The `polars` feature enables both `polars-ingress` and `polars-egress`. Enable
only the one you need if your application goes in a single direction. See
[crate features](/docs/connect/clients/rust/#crate-features) for the full
list.

### Query into a DataFrame

Borrow a reader, prepare the SQL, bind values, and collect the cursor into a
frame:

```rust
use questdb::QuestDb;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db = QuestDb::connect("ws::addr=localhost:9000;")?;
    let mut reader = db.borrow_reader()?;

    let dataframe = reader
        .prepare("SELECT timestamp, symbol, price FROM trades WHERE price > $1")
        .bind_f64(2615.0)
        .execute()?
        .fetch_all_polars()?;

    println!("{} rows", dataframe.height());
    Ok(())
}
```

`fetch_all_polars()` materializes the complete result. For large results,
prefer `next_polars()` or `iter_polars()`, which yield one frame per batch.

The `Cursor` returned by `execute()` borrows the reader, so keep the whole
chain in one statement as above. Splitting it across a block that also owns
the reader fails to compile.

:::note

The client depends on `polars` with default features off, and only within a
version range. To use the returned frame in your own code, add `polars` as a
direct dependency at a version inside that range, otherwise its `DataFrame` is
a different type. Check the range in the client's `Cargo.toml`. Formatting a
frame with `{}` also needs one of the polars `fmt` features, which the client
does not enable.

:::

### Ingest a DataFrame

`flush_polars_dataframe()` borrows a direct sender from the pool, publishes a
commit boundary, waits for the requested ACK, and returns the connection:

```rust
use questdb::ingress::{
    column_sender::ArrowColumnOverride,
    polars::PolarsIngestOptions,
    AckLevel,
    ColumnName,
};

let overrides: [ArrowColumnOverride<'_>; 0] = [];
let options = PolarsIngestOptions::new()
    .max_rows(50_000)
    .timestamp_column(ColumnName::new("timestamp")?)
    .overrides(&overrides)
    .ack_level(AckLevel::Ok);

db.flush_polars_dataframe("trades", &dataframe, &options)?;
```

Omitting `timestamp_column` asks the server to assign timestamps, and
`max_rows(0)` uses the default batch size. The call checkpoints the frame and
automatically retries the uncommitted tail after a transient failover. Replay
is at-least-once, so use [deduplication](/docs/concepts/deduplication/) when
duplicates would be harmful. See
[Arrow and Polars ingestion](/docs/connect/clients/rust/#arrow-and-polars-ingestion)
for the Arrow equivalents.

## Legacy: ConnectorX over PGWire

:::warning

Since QuestDB 10.0 the recommended way to move data between Polars and QuestDB
is the native client support shown above. ConnectorX is documented here for
legacy reasons only: it goes through PGWire, it reads but cannot ingest, and
it needs a workaround to avoid PostgreSQL features QuestDB does not implement.

:::

[ConnectorX](https://sfu-db.github.io/connector-x/intro.html) is a Rust
library for fast data transfer between Python and various databases. Its
PostgreSQL connector works against QuestDB's PGWire endpoint, which lets
`pl.read_database_uri()` read a query into a Polars DataFrame.

```bash
pip install polars pyarrow connectorx
```

```python
import polars as pl

QUESTDB_URI = "redshift://admin:quest@localhost:8812/qdb"
QUERY = "SELECT * FROM tables() LIMIT 5;"

df = pl.read_database_uri(query=QUERY, uri=QUESTDB_URI)
print("Received DataFrame:")
print(df)
```

:::caution

The URI uses the `redshift` scheme, not `postgresql`. By default the
PostgreSQL connector uses features QuestDB does not support; the Redshift
scheme makes ConnectorX avoid them.

:::

## See also

- [Python client](/docs/connect/clients/python/)
- [Rust client](/docs/connect/clients/rust/)
- [Pandas](/docs/integrations/data-processing/pandas/)
- [Connect string reference](/docs/connect/clients/connect-string/)
