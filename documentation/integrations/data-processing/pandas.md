---
title: Pandas
description:
  Query QuestDB into pandas DataFrames and ingest DataFrames natively with the
  QuestDB Python client over QWP.
---

[Pandas](https://pandas.pydata.org/) is a fast, powerful, flexible, and
easy-to-use open-source data analysis and manipulation tool built on top of
Python. Since QuestDB 10.0 the
[QuestDB Python client](/docs/connect/clients/python/) covers both directions
natively over [QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/):
`db.dataframe()` ingests a whole frame column by column, and query results
stream back as Arrow batches that materialize into a DataFrame with
`to_pandas()`.

Both paths are columnar end to end, so there is no SQLAlchemy, ODBC, or
ConnectorX layer to install and no row-by-row conversion in the middle.

## Prerequisites

- QuestDB 10.0 or later, running and accessible. See the
  [quick start](/docs/getting-started/quick-start).
- Python 3.10 or later.
- The client and pandas:

```bash
python3 -m pip install -U questdb pandas
```

`pyarrow` is optional. `to_pandas()` and `iter_pandas()` work without it, and
it is only needed if you also want `to_arrow()` or pyarrow-backed dtypes.

## Query into a DataFrame

`db.query()` returns a result that streams Arrow record batches from the
server. Call `to_pandas()` to materialize the whole result:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query(
        "SELECT timestamp, symbol, price, amount FROM trades "
        "WHERE timestamp IN '$now-1h..$now'"
    ) as result:
        df = result.to_pandas()

print(df.head())
```

Bind values with `$1`..`$N` placeholders instead of interpolating them into
the SQL string:

```python
df = db.query(
    "SELECT * FROM trades WHERE symbol = $1 AND price > $2",
    ["ETH-USDT", 2615.0],
).to_pandas()
```

### Stream large results

`to_pandas()` holds the complete result in memory. For results that do not fit
comfortably, iterate batch by batch with `iter_pandas()` and reduce as you go:

```python
import questdb

with questdb.connect("ws::addr=localhost:9000;") as db:
    with db.query("SELECT price, amount FROM trades") as result:
        notional = sum(
            (chunk["price"] * chunk["amount"]).sum()
            for chunk in result.iter_pandas()
        )

print(notional)
```

A result is single-use and must stay on the thread that created it. Use a
`with` block, or call `close()`, so the connection returns to the pool.

### Types and nulls

`SYMBOL` columns arrive as a `Categorical` sharing one dictionary across
batches, which keeps them compact. `INT` and `LONG` become plain `int32` /
`int64` when the column has no nulls and nullable `Int32` / `Int64` with
`pd.NA` when it does. QuestDB's sentinel values, such as `NaN` doubles and
`INT64_MIN` longs, are decoded as nulls rather than leaking as magic numbers.

`to_pandas(dtype_backend="pyarrow")` selects pyarrow-backed dtypes instead,
matching the `pd.read_sql` convention. See
[result types and nulls](/docs/connect/clients/python/#result-types-and-nulls)
for the full mapping.

## Ingest a DataFrame

`db.dataframe()` publishes the frame in batches and blocks until the server
acknowledges the last one:

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

`symbols` defaults to `"auto"`, which maps categorical columns to `SYMBOL`;
pass a list of column names to be explicit. `at` names the designated
timestamp column, or takes a fixed timestamp shared by every row, or
`questdb.ServerTimestamp` to let the server assign one.

:::note

Naive timestamps, both DataFrame columns and a scalar `at`, are interpreted as
UTC, matching the numpy `datetime64` convention. Prefer timezone-aware values
throughout.

:::

Columns of `float64` numpy arrays become `DOUBLE[]`, and `None`, `NaN`, and
`pd.NA` are stored as SQL nulls. A frame the columnar path cannot express
raises `UnsupportedDataFrameShapeError` listing the offending columns. See
[DataFrame ingestion](/docs/connect/clients/python/#dataframe-ingestion) for
batching, retries, and the full parameter set.

## Legacy: ILP DataFrame ingestion

:::warning

Since QuestDB 10.0 the recommended way to move data between pandas and QuestDB
is the native client shown above. The API below is documented for legacy
reasons: it encodes the frame as InfluxDB Line Protocol text and only covers
ingestion. Use it for existing code, or when talking to a server older than
10.0.

:::

The 4.x-style standalone `Sender` ships in the same `questdb` package and
implements `dataframe()` on top of ILP:

```python
import sys

import pandas as pd
from questdb import Sender, QuestDBError


def example(conf: str = "http::addr=localhost:9000;"):
    df = pd.DataFrame({
        "symbol": ["ETH-USDT", "BTC-USDT"],
        "price": [2615.54, 65432.10],
        "amount": [0.00044, 0.00120],
        "timestamp": [
            pd.Timestamp("2025-01-01 00:00:00", tz="UTC"),
            pd.Timestamp("2025-01-01 00:00:01", tz="UTC"),
        ],
    })
    try:
        with Sender.from_conf(conf) as sender:
            sender.dataframe(
                df,
                table_name="trades",   # Table name to insert into.
                symbols=["symbol"],    # Columns to insert as SYMBOL.
                at="timestamp")        # Designated timestamp column.

    except QuestDBError as e:
        sys.stderr.write(f"Got error: {e}\n")


if __name__ == "__main__":
    example()
```

The `questdb.ingress` import path still works as a deprecated alias module,
where `IngressError` remains an alias of `QuestDBError`. Importing from it
raises a `DeprecationWarning`, so prefer `questdb` directly as shown above.
The legacy API is documented on
[ReadTheDocs](https://py-questdb-client.readthedocs.io/en/latest/), and the
[5.0 migration guide](https://py-questdb-client.readthedocs.io/en/latest/migration.html)
maps each 4.x call to its pooled equivalent.

## See also

- [Python client](/docs/connect/clients/python/)
- [Polars](/docs/integrations/data-processing/polars/)
- [Connect string reference](/docs/connect/clients/connect-string/)
- [Querying with PGWire drivers](/docs/connect/compatibility/pgwire/python/)
