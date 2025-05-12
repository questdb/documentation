---
title: Polars
description:
  Guide for using Polars with QuestDB
---

[Polars](https://pola.rs/) is a fast DataFrame library implemented in Rust and
Python. It is designed to process large datasets efficiently and is particularly
well-suited for time-series data. Polars provides a DataFrame API similar to
Pandas, but with a focus on performance and parallel execution.

## Overview

ConnectorX is a Rust library that provides fast data transfer between Python
and various databases, including QuestDB. It includes a connector for PostgreSQL
which is compatible with QuestDB's PGWire protocol. This allows you to use
ConnectorX to read data from QuestDB into a Polars DataFrame.

:::caution

**Note**: By default ConnectorX for PostgreSQL uses features not supported by QuestDB.
If you instruct ConnectorX to use the Redshift protocol, it will work with QuestDB.

:::


## Prerequisites

- QuestDB must be running and accessible. Checkout the
  [quick start](/docs/quick-start).
- Python 3.8 or later
- [Polars](https://pola.rs/)
- [pyarrow](https://pypi.org/project/pyarrow/)
- [ConnectorX](https://sfu-db.github.io/connector-x/intro.html)

```pip
pip install polars pyarrow connectorx
```

## Example
```python
import polars as pl

QUESTDB_URI = "redshift://admin:quest@localhost:8812/qdb"
QUERY = "SELECT * FROM tables() LIMIT 5;"

df = pl.read_database_uri(query=QUERY, uri=QUESTDB_URI)
print("Received DataFrame:")
print(df)
```

Note that the URL uses the `redshift` schema. This is important because
it makes ConnectorX to avoid using features not supported by QuestDB.

## Ingestion vs Querying
This guides deals with querying data from QuestDB using Polars. For ingestion to QuestDB, you we recomment using the
[QuestDB Python client](/docs/clients/ingest-python/).

## Additional Resources
- [Integration with Pandas](/docs/third-party-tools/pandas/)
- [QuestDB Client for fast ingestion](/docs/clients/ingest-python/)
- [Python clients guide](/docs/pgwire/python/)