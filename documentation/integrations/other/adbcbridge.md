---
title: adbcBridge
description:
  Read QuestDB into Apache Arrow record batches through ADBC over the
  PostgreSQL ODBC driver, from C#, Java, Go, C, Python and Rust.
---

[adbcBridge](https://github.com/singhpratech/adbcbridge) is a driver for
[ADBC](https://arrow.apache.org/adbc/), Apache Arrow's database connectivity
API, that runs on top of any ODBC driver. Against QuestDB it goes through the
PostgreSQL ODBC driver over the
[PGWire](/docs/connect/wire-protocols/pgwire/) port, and returns results as
Arrow record batches.

If you work in Python or Rust, the
[QuestDB clients](/docs/connect/clients/python/) are the better route: since
QuestDB 10.0 they speak Arrow natively over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), with no ODBC layer
in between. adbcBridge is useful where that is not available — from C#, Java,
Go and C, which have no native Arrow path to QuestDB, and in environments that
already reach QuestDB over the PostgreSQL wire and want Arrow out of it without
adding a second protocol.

It is one Apache-2.0 C library with bindings for each language, so the same
connection string and the same calls work from all of them.

## Prerequisites

- A QuestDB instance with the PGWire port reachable (8812 by default).
- The PostgreSQL ODBC driver (`psqlodbc`) and an ODBC driver manager —
  unixODBC on Linux and macOS, the built-in manager on Windows.
- adbcBridge for your language:

```shell
pip install adbcbridge                      # Python
cargo add adbcbridge                        # Rust
dotnet add package AdbcBridge               # C#
go get github.com/singhpratech/adbcbridge/go  # Go
```

For Java, `org.adbcbridge:adbcbridge` is on Maven Central.

## Example usage

Reading a query straight into an Arrow table:

```python
import adbcbridge

uri = (
    "Driver=PostgreSQL Unicode;Server=localhost;Port=8812;"
    "Database=qdb;Uid=admin;Pwd=quest;"
)

with adbcbridge.connect(uri=uri) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT timestamp, symbol, price FROM trades "
            "WHERE timestamp IN '$now-1h..$now'"
        )
        table = cur.fetch_arrow_table()

print(table.schema)
print(table.num_rows)
```

Bind parameters with `?` placeholders. Turn autocommit on for these: the ODBC
driver wraps a parameterised statement in a `SAVEPOINT`, which QuestDB does not
implement, so without it the call fails with `internal SAVEPOINT failed`.

```python
with adbcbridge.connect(uri=uri) as conn:
    conn.adbc_connection.set_autocommit(True)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM trades WHERE symbol = ? AND price > ?",
            ("ETH-USDT", 2615.0),
        )
        table = cur.fetch_arrow_table()
```

## Notes for QuestDB

QuestDB has its own type system behind the PostgreSQL wire, so a few things
differ from a PostgreSQL target:

- Bulk ingest goes through a parameterised `INSERT`. The driver emits
  standard-SQL DDL for generated tables, and sends boolean parameters as
  `true`/`false`.
- Parameter arrays are not used, because `psqlodbc` inlines their values as
  string literals, which QuestDB does not convert to `BINARY` or `BOOLEAN`.
- `psqlodbc`'s `SQLColumns` call does not succeed against QuestDB, so column
  metadata comes from the result-set description rather than the catalogue.
- Autocommit should be on, as above, because the driver's `SAVEPOINT` around a
  parameterised statement has no equivalent in QuestDB.

The [QuestDB entry](https://adbcbridge.org/matrix/#questdb) in the project's
compatibility matrix lists the settings it is verified with, together with the
per-driver notes.
