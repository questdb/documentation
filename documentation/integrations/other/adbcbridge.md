---
title: adbcBridge
description:
  Read QuestDB into Apache Arrow through ADBC. A native QWP driver for QuestDB
  10, and an ODBC route for older servers, from C#, Java, Go, TypeScript, C,
  Python and Rust.
---

[adbcBridge](https://github.com/singhpratech/adbcbridge) provides drivers for
[ADBC](https://arrow.apache.org/adbc/), Apache Arrow's database connectivity
API. For QuestDB it has two:

- **`adbc_driver_questdb`**, a native driver that speaks
  [QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), QuestDB's
  columnar wire protocol, through the official C client
  ([c-questdb-client](https://github.com/questdb/c-questdb-client)). Query
  results are the client's own Arrow batches passed straight through, and bulk
  ingest sends Arrow batches the other way. For QuestDB 10.0 and newer.
- **The ODBC bridge**, which reaches QuestDB through the PostgreSQL ODBC driver
  over [PGWire](/docs/connect/compatibility/pgwire/overview/). For QuestDB 9 and older,
  or where one driver has to serve every database an application talks to.

If you work in Python or Rust, the
[QuestDB clients](/docs/connect/clients/python/) are the direct route: they
speak Arrow natively over QWP with nothing in between. The ADBC driver is for
the places where ADBC itself is the contract: libraries and tools that accept
any ADBC driver, and C#, Java, Go, TypeScript and C programs, which load it
through the ADBC driver manager of their language.

## The native driver: QuestDB 10 over QWP

### Prerequisites

- QuestDB 10.0 or newer, with the HTTP port reachable (9000 by default); QWP
  runs over WebSocket on that port.
- The driver, built from source. It is one shared library with the client
  linked in statically; the build needs Rust 1.91 or newer, CMake 3.16 and a
  C11 compiler, and takes a few minutes the first time.

```shell
git clone https://github.com/singhpratech/adbcbridge
cmake -S adbcbridge/questdb -B build-questdb -DCMAKE_BUILD_TYPE=Release
cmake --build build-questdb
# -> build-questdb/libadbc_driver_questdb.so  (.dylib on macOS)
```

- An ADBC driver manager for your language, for example
  `pip install adbc-driver-manager pyarrow` for Python or
  `npm install @apache-arrow/adbc-driver-manager apache-arrow` for Node.js.
  The driver is a standard ADBC 1.1.0 library, so any ADBC driver manager
  loads it.

### Example usage

The only required option is `uri`: `ws://host:port`, or `wss://` for TLS.
`username` and `password` give HTTP basic authentication, `adbc.questdb.token`
a bearer token.

```python
import datetime
import adbc_driver_manager.dbapi as dbapi

conn = dbapi.connect(
    driver="/path/to/libadbc_driver_questdb.so",
    db_kwargs={"uri": "ws://localhost:9000"},
)
with conn.cursor() as cur:
    cur.execute(
        "SELECT symbol, avg(price) FROM trades WHERE timestamp > $1 GROUP BY symbol",
        parameters=[datetime.datetime(2026, 1, 1)],
    )
    table = cur.fetch_arrow_table()
```

The same from TypeScript, through Apache Arrow's Node.js driver manager:

```typescript
import { AdbcDatabase } from '@apache-arrow/adbc-driver-manager'

const db = new AdbcDatabase({
  driver: '/path/to/libadbc_driver_questdb.so',
  databaseOptions: { uri: 'ws://localhost:9000' },
})
const conn = await db.connect()
const table = await conn.query('SELECT symbol, avg(price) FROM trades GROUP BY symbol')
```

Parameters bind as `$1`, `$2`, … from typed Arrow values; QuestDB does not
describe parameter types, so cast in SQL (`$1::int`) where the type is not
clear from the value.

### Bulk ingest

ADBC bulk ingest (`cursor.adbc_ingest()` in Python, `conn.ingest()` in
Node.js) sends each Arrow batch through the client's Arrow sender. When the
table does not exist, the driver first creates it from the Arrow schema, so
column names and types are exactly yours: dictionary-encoded strings become
`SYMBOL`, plain strings `VARCHAR`, `timestamp` columns `TIMESTAMP`, and the
single timestamp column of the data becomes the designated timestamp
(`adbc.questdb.ingest.timestamp_column` chooses another one). Because QuestDB
acknowledges a frame before its rows are applied, the driver waits for the
table's WAL to catch up before returning, so a `SELECT` that follows sees the
rows.

### What comes back

Result schemas are the client's: `SYMBOL` is a dictionary-encoded string,
`TIMESTAMP` and `TIMESTAMP_NS` are Arrow timestamps in UTC, `UUID` is a
16-byte fixed binary with the `arrow.uuid` extension, `DECIMAL` is Arrow
decimal at the server's scale, and `DOUBLE[]` is a list. Every field carries
the QuestDB type name in its metadata. The driver's
[reference page](https://github.com/singhpratech/adbcbridge/blob/main/docs/getting-started/questdb-qwp.md)
has the full table and the ingest mapping.

Two things to know: QuestDB has no transactions over QWP, so switching
autocommit off returns `NOT_IMPLEMENTED`, as ADBC allows; and `DECIMAL`
columns with precision 9 or less are refused by the server's QWP egress on
10.1.0 (a fix is proposed in
[questdb/questdb#8111](https://github.com/questdb/questdb/pull/8111)).

## QuestDB 9 and older: the ODBC bridge

The ODBC bridge is adbcBridge's general driver: ADBC on top of any ODBC
driver. Against QuestDB it uses the PostgreSQL ODBC driver (`psqlodbc`) over
the PGWire port, 8812 by default, and needs an ODBC driver manager: unixODBC
on Linux and macOS, the built-in one on Windows. It is packaged for each
language:

```shell
pip install adbcbridge                        # Python
cargo add adbcbridge                          # Rust
dotnet add package AdbcBridge                 # C#
go get github.com/singhpratech/adbcbridge/go  # Go
```

For Java, `org.adbcbridge:adbcbridge` is on Maven Central; TypeScript loads
the same library through the Node.js driver manager.

```python
import adbcbridge

uri = (
    "Driver=PostgreSQL Unicode;Server=localhost;Port=8812;"
    "Database=qdb;Uid=admin;Pwd=quest;"
)

with adbcbridge.connect(uri=uri, autocommit=True) as conn:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM trades WHERE symbol = ? AND price > ?",
            ("ETH-USDT", 2615.0),
        )
        table = cur.fetch_arrow_table()
```

Keep autocommit on: `psqlodbc` wraps a parameterised statement in a
`SAVEPOINT`, which QuestDB does not implement, so without it the call fails
with `internal SAVEPOINT failed`. Bulk ingest goes through a parameterised
`INSERT` with standard-SQL DDL and `true`/`false` booleans; parameter arrays
are not used, because `psqlodbc` inlines their values as string literals; and
column metadata comes from the result-set description, since `psqlodbc`'s
`SQLColumns` does not succeed against QuestDB. The
[QuestDB entry](https://adbcbridge.org/matrix/#questdb) in the project's
compatibility matrix lists the settings this route is verified with.
