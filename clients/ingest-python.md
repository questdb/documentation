---
title: Python Client Documentation
description:
  Get started with QuestDB, as quickly as possible. Provides instructions and
  examples for the Python ingestion client. Upgrade to peak time series today.
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB supports the Python ecosystem.

The QuestDB Python client provides ingestion high performance and is insert
only.

The client, in combination with QuestDB, offers peak performance time-series
ingestion and analysis.

Apart from blazing fast ingestion, our clients provide these key benefits:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

This quick start will help you get started.

It covers basic connection, authentication and some insert patterns.

<ILPClientsTable language="Python" />

## Requirements

Requires Python >= 3.8 Assumes QuestDB is running. Not running? See the
[general quick start](/docs/quick-start/).

## Client installation

To install the client (or update it) globally:

```bash
python3 -m pip install -U questdb
```

Or, from from within a virtual environment:

```bash
pip install -U questdb
```

If you’re using poetry, you can add questdb as a dependency:

```bash
poetry add questdb
```

Or to update the dependency:

```bash
poetry update questdb
```

Using dataframes?

Add following dependencies:

- `pandas`
- `pyarrow`
- `numpy`

## Authentication

Passing in a configuration string with basic auth:

```python
from questdb.ingress import Sender

conf = "http::addr=localhost:9000;username=admin;password=quest;"
with Sender.from_conf(conf) as sender:
    ...
```

Passing via the `QDB_CLIENT_CONF` env var:

```python
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

## Basic insert

Consider something such as a temperature sensor.

Basic insertion (no-auth):

```python
from questdb.ingress import Sender, TimestampNanos

conf = f'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.row(
        'sensors',
        symbols={'id': 'toronto1'},
        columns={'temperature': 20.0, 'humidity': 0.5},
        at=TimestampNanos.now())
    sender.flush()
```

The same temperature senesor, but via a Pandas dataframe:

```python
import pandas as pd
from questdb.ingress import Sender

df = pd.DataFrame({
    'id': pd.Categorical(['toronto1', 'paris3']),
    'temperature': [20.0, 21.0],
    'humidity': [0.5, 0.6],
    'timestamp': pd.to_datetime(['2021-01-01', '2021-01-02'])})

conf = f'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.dataframe(df, table_name='sensors', at='timestamp')
```

What about market data?

A "full" example, with timestamps and auto-flushing:

```python
from questdb.ingress import Sender, IngressError, TimestampNanos
import sys
import datetime


def example():
    try:
        conf = f'http::addr=localhost:9000;'
        with Sender.from_conf(conf) as sender:
            # Record with provided designated timestamp (using the 'at' param)
            # Notice the designated timestamp is expected in Nanoseconds,
            # but timestamps in other columns are expected in Microseconds.
            # The API provides convenient functions
            sender.row(
                'trades',
                symbols={
                    'pair': 'USDGBP',
                    'type': 'buy'},
                columns={
                    'traded_price': 0.83,
                    'limit_price': 0.84,
                    'qty': 100,
                    'traded_ts': datetime.datetime(
                        2022, 8, 6, 7, 35, 23, 189062,
                        tzinfo=datetime.timezone.utc)},
                at=TimestampNanos.now())

            # You can call `sender.row` multiple times inside the same `with`
            # block. The client will buffer the rows and send them in batches.

            # You can flush manually at any point.
            sender.flush()

            # If you don't flush manually, the client will flush automatically
            # when a row is added and either:
            #   * The buffer contains 75000 rows (if HTTP) or 600 rows (if TCP)
            #   * The last flush was more than 1000ms ago.
            # Auto-flushing can be customized via the `auto_flush_..` params.

        # Any remaining pending rows will be sent when the `with` block ends.

    except IngressError as e:
        sys.stderr.write(f'Got error: {e}\n')


if __name__ == '__main__':
    example()
```

The above generates rows of InfluxDB Line Protocol (ILP) flavoured data:

```python
trades,pair=USDGBP,type=sell traded_price=0.82,limit_price=0.81,qty=150,traded_ts=1659784523190000000\n
trades,pair=EURUSD,type=buy traded_price=1.18,limit_price=1.19,qty=200,traded_ts=1659784523191000000\n
trades,pair=USDJPY,type=sell traded_price=110.5,limit_price=110.4,qty=80,traded_ts=1659784523192000000\n
```

## Limitations

### Transactionality

The client does not provide full transactionality in all cases:

- Data for the first table in an HTTP request will be committed even if the
  second table's commit fails.
- An implicit commit occurs each time a new column is added to a table. This
  action cannot be rolled back if the request is aborted or encounters parse
  errors.

### Timestamp column

The underlying ILP protocol sends timestamps to QuestDB without a name.

Therefore, if you provide it one, say `my_ts`, you will find that the timestamp
column is named `timestamp`.

To address this, issue a CREATE TABLE statement to create the table in advance:

```questdb-sql title="Creating a timestamp named my_ts"
CREATE TABLE temperatures (
    ts timestamp,
    sensorID symbol,
    sensorLocation symbol,
    reading double
) timestamp(my_ts);
```

Now, when you can send data to the specified column.

## Health check

To monitor your active connection, there is a `ping` endpoint:

```shell
curl -I http://localhost:9000/ping
```

Returns (pong!):

```shell
HTTP/1.1 204 OK
Server: questDB/1.0
Date: Fri, 2 Feb 2024 17:09:38 GMT
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
X-Influxdb-Version: v2.7.4
```

Determine whether an instance is active and confirm the version of InfluxDB Line
Protocol with which you are interacting.

## Next steps

For full docs, checkout
[ReadTheDocs](https://py-questdb-client.readthedocs.io/en).

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.io/).
