---
title: SQLAlchemy
description: Guide for using SQLAlchemy with QuestDB
---

[SQLAlchemy](https://www.sqlalchemy.org/) is an open-source SQL toolkit and ORM
library for Python. It provides a high-level API for communicating with
[relational databases](/glossary/relational-database/), including schema
creation and modification, an SQL expression language, and database connection
management. The ORM layer abstracts away the complexities of the database,
allowing developers to work with Python objects instead of raw SQL statements.

QuestDB implements a dialect for SQLAlchemy using the
[QuestDB Connect](https://github.com/questdb/questdb-connect) Python package.

Please note that the SQLAlchemy ORM and metadata operations are only partially
supported.

## Prerequisites

- Python from 3.9 to 3.11
- Psycopg2
- SQLAlchemy 1.4+ or 2.0+
- A QuestDB instance

## Installation

You can install this package using `pip`:

```shell
pip install questdb-connect
```

## Example usage

```python
from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy import MetaData
from sqlalchemy import Table
from pprint import pprint

engine = create_engine("questdb://admin:quest@localhost:8812/qdb")

# SQL statements with no parameters
with engine.begin() as conn:
  conn.execute(text("CREATE TABLE IF NOT EXISTS some_table (x int, y int)"))
  result = conn.execute(text("SHOW TABLES"))
  # results can be iterated in many ways. Check SQLAlchemy docs for details
  print(result.all())

# passing parameters to your statements
with engine.begin() as conn:
  conn.execute(
    text("INSERT INTO some_table (x, y) VALUES (:x, :y)"),
    [{"x": 11, "y": 12}, {"x": 13, "y": 14}],
  )

with engine.begin() as conn:
  # basic select, no parameters
  result = conn.execute(text("select * from some_table"))
  print(result.all())

  # select with parameters
  result = conn.execute(text("SELECT x, y FROM some_table WHERE y > :y"), {"y": 2})
  print(result.all())

  # partial support for metadata
  metadata_obj = MetaData()
  some_table = Table("some_table", metadata_obj, autoload_with=engine)
  pprint(some_table)

# cleaning up
with engine.begin() as conn:
  conn.execute(text("DROP TABLE some_table"))
```

## See also

- The
  [SQLAlchemy tutorial](https://docs.sqlalchemy.org/en/14/tutorial/index.html)
- The [QuestDB Connect](https://pypi.org/project/questdb-connect/) GitHub
