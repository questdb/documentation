---
title: Pandas
description:
  Guide for using Pandas with QuestDB via the official QuestDB Python client
  library
---

[Pandas](https://pandas.pydata.org/) is a fast, powerful, flexible, and
easy-to-use open-source data analysis and manipulation tool, built on top of the
Python programming language. The
[QuestDB Python client](https://py-questdb-client.readthedocs.io/en/latest/index.html)
provides native support for ingesting Pandas dataframes via the InfluxDB Line
Protocol.

## Prerequisites

- QuestDB must be running and accessible. Checkout the
  [quick start](/docs/quick-start).
- Python 3.8 or later
- [Pandas](https://pandas.pydata.org/)
- [pyarrow](https://pypi.org/project/pyarrow/)
- [NumPy](https://numpy.org/)

## Overview

The QuestDB Python client implements the `dataframe()` method to transform
Pandas DataFrames into QuestDB-flavored InfluxDB Line Protocol messages.

The following example shows how to insert data from a Pandas DataFrame to the
`trades` table:

```python
from questdb.ingress import Sender, IngressError

import sys
import pandas as pd


def example(host: str = 'localhost', port: int = 9009):
    df = pd.DataFrame({
            'pair': ['USDGBP', 'EURJPY'],
            'traded_price': [0.83, 142.62],
            'qty': [100, 400],
            'limit_price': [0.84, None],
            'timestamp': [
                pd.Timestamp('2022-08-06 07:35:23.189062', tz='UTC'),
                pd.Timestamp('2022-08-06 07:35:23.189062', tz='UTC')]})
    try:
        with Sender(host, port) as sender:
            sender.dataframe(
                df,
                table_name='trades',  # Table name to insert into.
                symbols=['pair'],  # Columns to be inserted as SYMBOL types.
                at='timestamp')  # Column containing the designated timestamps.

    except IngressError as e:
        sys.stderr.write(f'Got error: {e}\n')


if __name__ == '__main__':
    example()
```

## See also

For detailed documentation, please see:

- [`Sender.dataframe()`](https://py-questdb-client.readthedocs.io/en/latest/api.html#questdb.ingress.Sender.dataframe)
- [`Buffer.dataframe()`](https://py-questdb-client.readthedocs.io/en/latest/api.html#questdb.ingress.Buffer.dataframe)
- [Examples using `dataframe()`](https://py-questdb-client.readthedocs.io/en/latest/examples.html#data-frames)
