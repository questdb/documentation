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

```bash
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

```python
from questdb.ingress import Sender

with Sender.from_env() as sender:
    ...
```

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more info.

## Basic insert

Basic insertion (no-auth):

```python
from questdb.ingress import Sender, TimestampNanos

conf = f'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.row(
        'trades',
        symbols={'symbol': 'ETH-USD', 'side': 'sell'},
        columns={'price': 2615.54, 'amount': 0.00044},
        at=TimestampNanos.now())
    sender.row(
        'trades',
        symbols={'symbol': 'BTC-USD', 'side': 'sell'},
        columns={'price': 39269.98, 'amount': 0.001},
        at=TimestampNanos.now())
    sender.flush()
```

In this case, the designated timestamp will be the one at execution time. Let's see now an example with timestamps, custom auto-flushing, basic auth, and error reporting.

```python
from questdb.ingress import Sender, IngressError, TimestampNanos
import sys
import datetime


def example():
    try:
        conf = f'http::addr=localhost:9000;username=admin;password=quest;auto_flush_rows=100;auto_flush_interval=1000;'
        with Sender.from_conf(conf) as sender:
            # Record with provided designated timestamp (using the 'at' param)
            # Notice the designated timestamp is expected in Nanoseconds,
            # but timestamps in other columns are expected in Microseconds.
            # You can use the TimestampNanos or TimestampMicros classes,
            # or you can just pass a datetime object
            sender.row(
                'trades',
                symbols={
                    'symbol': 'ETH-USD',
                    'side': 'sell'},
                columns={
                    'price': 2615.54,
                    'amount': 0.00044,
                   },
                at=datetime.datetime(
                        2022, 3, 8, 18, 53, 57, 609765,
                        tzinfo=datetime.timezone.utc))

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

The same `trades` insert, but via a Pandas dataframe:

```python
import pandas as pd
from questdb.ingress import Sender

df = pd.DataFrame({
    'symbol': pd.Categorical(['ETH-USD', 'BTC-USD']),
    'side': pd.Categorical(['sell', 'sell']),
    'price': [2615.54, 39269.98],
    'amount': [0.00044, 0.001],
    'timestamp': pd.to_datetime(['2022-03-08T18:03:57.609765Z', '2022-03-08T18:03:57.710419Z'])})

conf = f'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.dataframe(df, table_name='trades', at=TimestampNanos.now())
```

Note that you can also add a column of your dataframe with your timestamps and
reference that column in the `at` parameter:

```python
import pandas as pd
from questdb.ingress import Sender

df = pd.DataFrame({
    'symbol': pd.Categorical(['ETH-USD', 'BTC-USD']),
    'side': pd.Categorical(['sell', 'sell']),
    'price': [2615.54, 39269.98],
    'amount': [0.00044, 0.001],
    'timestamp': pd.to_datetime(['2022-03-08T18:03:57.609765Z', '2022-03-08T18:03:57.710419Z'])})

conf = f'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.dataframe(df, table_name='trades', at='timestamp')
```

## Configuration options

The minimal configuration string needs to have the protocol, host, and port, as in:

```
http::addr=localhost:9000;
```

For all the extra options you can use, please check [the client docs](https://py-questdb-client.readthedocs.io/en/latest/conf.html#sender-conf)


## Limitations

### Transactionality

The client does not provide full transactionality in all cases:

- Data for the first table in an HTTP request will be committed even if the
  second table's commit fails.
- An implicit commit occurs each time a new column is added to a table. This
  action cannot be rolled back if the request is aborted or encounters parse
  errors.

### Timestamp column

QuestDB's underlying ILP protocol sends timestamps to QuestDB without a name.

If your table has been created beforehand, the designated timestamp will be correctly
assigned based on the information provided using `at`. But if your table does not
exist, it will be automatically created and the timestamp column will be named
`timestamp`. This will happen even when using the Pandas dataframe API and passing
a named column, say `my_ts`. You will find that the timestamp column is created
as `timestamp`.

To address this, issue a `CREATE TABLE` statement to create the table in advance:

```questdb-sql title="Creating a timestamp named my_ts"
CREATE TABLE IF NOT EXISTS 'trades' (
  symbol SYMBOL capacity 256 CACHE,
  side SYMBOL capacity 256 CACHE,
  price DOUBLE,
  amount DOUBLE,
  my_ts TIMESTAMP
) timestamp (my_ts) PARTITION BY DAY WAL;
```

You can use the `CREATE TABLE IF NOT EXISTS` construct to make sure the table is
created, but without raising an error if the table already existed.

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
