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

```python
from questdb.ingress import Sender, Protocol

with Sender(Protocol.Http, 'localhost', 9000, username='admin', password='quest') as sender:
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

We recommended to use User-assigned timestamps when ingesting data into QuestDB.
Using Server-assigned hinder the ability to deduplicate rows which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).


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

In the Python client, you can set the configuration options via the standard config string,
which is the same across all clients, or using [the built-in API](https://py-questdb-client.readthedocs.io/en/latest/sender.html#sender-programmatic-construction).


For all the extra options you can use, please check [the client docs](https://py-questdb-client.readthedocs.io/en/latest/conf.html#sender-conf)


## Transactional flush

As described at the [ILP overview](/docs/reference/api/ilp/overview#http-transaction-semantics),
the HTTP transport has some support for transactions.

The python client exposes [an API](https://py-questdb-client.readthedocs.io/en/latest/sender.html#http-transactions)
to make working with transactions more convenient

## Next steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for general details
about transactions, error control, delivery guarantees, health check, or table and
column auto-creation. The [Python client docs](https://py-questdb-client.readthedocs.io/en/latest/sender.html) explain how to apply those concepts using the built-in API.

For full docs, checkout
[ReadTheDocs](https://py-questdb-client.readthedocs.io/en).

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.io/).
