---
title: Python PGWire Guide
description:
  Python clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Python for querying data. 
---

QuestDB is tested with the following Python clients:

- [asyncpg](#asyncpg)
- [psycopg3](#psycopg3)
- [psycopg2](#psycopg2)

Other Python clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

### Performance Considerations

QuestDB is a high-performance database. The PGWire protocol has many flavors, and some of them are not optimized for
performance. We found psycopg2 to be the slowest of the three clients. Our recommendation is to use asyncpg or psycopg3
for the best performance when querying data.

:::tip

For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/)
instead of PGWire. PGWire should primarily be used for querying data in QuestDB. QuestDB provides an
official [Python client](/docs/clients/ingest-python/) for data ingestion using ILP.

:::

## Connection Parameters

All Python PostgreSQL clients need similar connection parameters to connect to QuestDB:

- **host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **port**: The PostgreSQL wire protocol port (default: `8812`)
- **user**: The username for authentication (default: `admin`)
- **password**: The password for authentication (default: `quest`)
- **database**: The database name (default: `qdb`)

## asyncpg

[asyncpg](https://pypi.org/project/asyncpg/) is an asynchronous PostgreSQL client library designed for high performance.
It uses Python's async/await syntax and is built specifically for asyncio.

### Features

- Fast binary protocol implementation
- Native asyncio support
- Efficient prepared statements
- Connection pooling
- Excellent performance for large result sets

### Installation

```bash
pip install asyncpg
```

### Basic Connection

```python
import asyncio
import os
import time

import asyncpg


async def connect_to_questdb():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )

    version = await conn.fetchval("SELECT version()")
    print(f"Connected to QuestDB version: {version}")

    await conn.close()

# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    # tzset is only available on Unix-like systems
    time.tzset()
asyncio.run(connect_to_questdb())
```

:::note
**Note**: The `asyncpg` client uses the system timezone by default. QuestDB always sends timestamp in UTC.
To set the timezone to UTC, you can set the `TZ` environment variable before running your script.
This is important for time-series data to ensure consistent timestamps.

See the [Timestamp Handling](/docs/pgwire/pgwire-intro#timestamp-handling) chapter for additional context on how
on how QuestDB handles timezones.
:::

### Querying Data

asyncpg provides several methods for fetching data:

- `fetch()`: Returns all rows as a list of Record objects
- `fetchval()`: Returns a single value (first column of first row)
- `fetchrow()`: Returns a single row as a Record object
- `cursor()`: Returns an async cursor for streaming results

```python
import asyncio
import asyncpg
from datetime import datetime, timedelta
import os
import time


async def query_with_asyncpg():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )

    # Fetch multiple rows
    rows = await conn.fetch("""
                            SELECT *
                            FROM trades
                            WHERE ts >= $1
                            ORDER BY ts DESC LIMIT 10
                            """, datetime.now() - timedelta(days=1))

    print(f"Fetched {len(rows)} rows")
    for row in rows:
        print(f"Timestamp: {row['ts']}, Symbol: {row['symbol']}, Price: {row['price']}")

    # Fetch a single row
    single_row = await conn.fetchrow("""
                                     SELECT *
                                     FROM trades LIMIT -1
                                     """)

    if single_row:
        print(f"Latest trade: {single_row['symbol']} at {single_row['price']}")

    # Fetch a single value
    count = await conn.fetchval("SELECT count(*) FROM trades")
    print(f"Total trades: {count}")

    await conn.close()


# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(query_with_asyncpg())
```

### Using Cursors for Large Result Sets

For large result sets, you can use a cursor to fetch results in batches:

```python
import asyncio
import asyncpg
import os
import time

async def stream_with_cursor():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )

    async with conn.transaction():
        # Execute a query that might return a large number of rows
        cursor = await conn.cursor("""
                                   SELECT *
                                   FROM trades
                                   ORDER BY ts
                                   """)

        batch_size = 100
        total_processed = 0

        while True:
            batch = await cursor.fetch(batch_size)

            # If no more rows, break the loop
            if not batch:
                break

            total_processed += len(batch)
            print(f"Processed {total_processed} rows so far...")

    await conn.close()
    print(f"Finished processing {total_processed} total rows")


# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(stream_with_cursor())
```

### Connection Pooling

For applications that need to execute many queries, you can use connection pooling:

```python
import asyncio
import asyncpg
import os
import time

async def connection_pool_example():
    pool = await asyncpg.create_pool(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb',
        min_size=5,
        max_size=20
    )
    
    async with pool.acquire() as conn:
        result = await conn.fetch("SELECT * FROM trades LIMIT 10")
        print(f"Fetched {len(result)} rows")
    
    await pool.close()

# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(connection_pool_example())
```

### Parameterized Queries

asyncpg uses numbered parameters (`$1`, `$2`, etc.) for prepared statements:

```python
import asyncio
import asyncpg
from datetime import datetime, timedelta
import os
import time

async def parameterized_query():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )
    
    end_time = datetime.now()
    start_time = end_time - timedelta(days=7)
    
    rows = await conn.fetch("""
        SELECT 
            symbol,
            avg(price) as avg_price,
            min(price) as min_price,
            max(price) as max_price
        FROM trades
        WHERE ts >= $1 AND ts <= $2
        GROUP BY symbol
    """, start_time, end_time)
    
    print(f"Found {len(rows)} symbols")
    for row in rows:
        print(f"Symbol: {row['symbol']}, Avg Price: {row['avg_price']:.2f}")
    
    await conn.close()

# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(parameterized_query())
```

### Batch Inserts with `executemany()`
While we recommend using the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/) for ingestion, you can also use
the `executemany()` method to insert multiple rows in a single query. It is highly efficient for executing the same
parameterized statements multiple times with different sets of data. This method is significantly faster than executing
individual statements in a loop because it reduces network round-trips and allows for potential batching optimizations
by the database. In our testing, we found that `executemany()` can be 10x-100x faster than using a loop with `execute()`.

It's particularly useful for bulk data insertion, such as recording multiple trades as they occur. `INSERT` performance
grows with the batch size, so you should experiment with the batch size to find the optimal value for your use case. We
recommend starting with a batch size of 1,000 and adjusting it based on further testing.

```python
import asyncio
import os
import time

import asyncpg
from datetime import datetime, timedelta, timezone

async def execute_many_market_data_example():

    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            ts TIMESTAMP,
            symbol SYMBOL,
            price DOUBLE,
            volume LONG,
            exchange SYMBOL
        ) timestamp(ts) PARTITION BY DAY;
    """)

    base_timestamp = datetime.now()

    trades_data = [
        ( (base_timestamp + timedelta(microseconds=10)), 'BTC-USD', 68500.50, 0.5, 'Coinbase'),
        ( (base_timestamp + timedelta(microseconds=20)), 'ETH-USD', 3800.20, 2.1, 'Kraken'),
        ( (base_timestamp + timedelta(microseconds=30)), 'BTC-USD', 68501.75, 0.25, 'Binance'),
        ( (base_timestamp + timedelta(microseconds=40)), 'SOL-USD', 170.80, 10.5, 'Coinbase'),
        ( (base_timestamp + timedelta(microseconds=50)), 'ETH-USD', 3799.90, 1.5, 'Binance'),
    ]

    await conn.executemany("""
        INSERT INTO trades (ts, symbol, price, volume, exchange)
        VALUES ($1, $2, $3, $4, $5)
    """, trades_data)
    print(f"Successfully inserted {len(trades_data)} trade records using executemany.")

# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(execute_many_market_data_example())
```

### Inserting Arrays

QuestDB, via the PostgreSQL wire protocol, supports [array data types](/docs/concept/array/), including multidimensional
arrays. asyncpg makes working with these arrays straightforward by automatically converting Python lists (or lists of lists
for multidimensional arrays) into the appropriate PostgreSQL array format and vice-versa when fetching data.

:::note
Arrays are supported from QuestDB version 9.0.0.
:::

:::caution asyncpg & QuestDB Arrays: Manual Setup Needed
Using array types with asyncpg against QuestDB requires manual type registration.

asyncpg's standard type introspection query is not yet supported by QuestDB. Therefore, you must manually register a "codec"
for your array types with the asyncpg connection, as shown in the code example below. This ensures correct array
handling and avoids errors.

This is a temporary workaround until a permanent solution is available in asyncpg or QuestDB.
:::

When you need to insert multiple rows containing array data, such as a series of order book snapshots, `executemany()`
offers a more performant way to do so compared to inserting row by row with execute().

```python title="Batch Inserting L3 Order Book Snapshots"
import asyncio
import os
import time

import asyncpg
from datetime import datetime, timedelta


async def batch_insert_l3_order_book_arrays():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )

    # Workaround for asyncpg using introspection to determine array types.
    # The introspection query uses a construct that is not supported by QuestDB.
    # This is a temporary workaround before this PR or its equivalent is merged to asyncpg: 
    # https://github.com/MagicStack/asyncpg/pull/1260
    arrays = [{
        'oid': 1022,
        'elemtype': 701,
        'kind': 'b',
        'name': '_float8',
        'elemtype_name': 'float8',
        'ns': 'pg_catalog',
        'elemdelim': ',',
        'depth': 0,
        'range_subtype': None,
        'attrtypoids': None,
        'basetype': None
    }]
    conn._protocol.get_settings().register_data_types(arrays)

    await conn.execute("""
                       CREATE TABLE IF NOT EXISTS l3_order_book
                       (
                           bid DOUBLE [][],
                           ask DOUBLE [][],
                           ts TIMESTAMP
                       ) TIMESTAMP(ts) PARTITION BY DAY WAL;
                       """)

    # Prepare a list of L3 order book snapshots for batch insertion
    snapshots_to_insert = []
    base_timestamp = datetime.now()

    # First row
    bids1 = [[68500.50, 0.5], [68500.00, 1.2], [68499.50, 0.3]]
    asks1 = [[68501.00, 0.8], [68501.50, 0.4], [68502.00, 1.1]]
    ts1 = (base_timestamp + timedelta(seconds=1))
    snapshots_to_insert.append((bids1, asks1, ts1))

    # Second row
    bids2 = [[68502.10, 0.3], [68501.80, 0.9], [68501.20, 1.5]]
    asks2 = [[68502.50, 1.1], [68503.00, 0.6], [68503.50, 0.2]]
    ts2 = (base_timestamp + timedelta(seconds=2))
    snapshots_to_insert.append((bids2, asks2, ts2))

    # Third row
    bids3 = [[68490.60, 2.5], [68489.00, 3.2]]
    asks3 = [[68491.20, 1.8], [68492.80, 0.7]]
    ts3 = (base_timestamp + timedelta(seconds=3))
    snapshots_to_insert.append((bids3, asks3, ts3))

    print(f"Prepared {len(snapshots_to_insert)} snapshots for batch insertion.")

    # Insert the snapshots into the database in a single batch
    await conn.executemany(
        """
        INSERT INTO l3_order_book (bid, ask, ts)
        VALUES ($1, $2, $3)
        """,
        snapshots_to_insert  # List of tuples, each tuple is a row
    )
    print(f"Successfully inserted {len(snapshots_to_insert)} L3 order book snapshots using executemany().")

# Set the timezone to UTC
os.environ['TZ'] = 'UTC'
if hasattr(time, 'tzset'):
    time.tzset()
asyncio.run(batch_insert_l3_order_book_arrays())
```

### Binary Protocol

asyncpg uses the binary protocol by default, which improves performance by avoiding text encoding/decoding for data
transfer.

### Performance Tips

- Use connection pooling for multiple queries
- Take advantage of the binary protocol (used by default)
- Use parameterized queries for repeated query patterns
- For large result sets, use cursors to avoid loading all data into memory at once

## psycopg3

[psycopg3](https://www.psycopg.org/psycopg3/docs/) is the latest major version of the popular psycopg PostgreSQL
adapter. It's a complete rewrite of psycopg2 with support for both synchronous and asynchronous operations.

### Features

- Support for both sync and async programming
- Server-side cursors
- Connection pooling
- Type adapters and converters
- Binary protocol support

### Installation

```bash
pip install psycopg[binary]
```

:::tip

Use `psycopg[binary]` to install the binary version of psycopg3, which is faster and more efficient. In our testing, we
found that the binary version of psycopg3 is significantly faster than the pure-Python version.

:::

We recommend always passing `binary=True` to the `cursor()` method to use the binary protocol for better performance.
This is especially important for large datasets and array types.


### Basic Connection

```python
import psycopg

conn = psycopg.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb',
    autocommit=True  # Important for QuestDB
)

with conn.cursor(binary=True) as cur:
    cur.execute("SELECT version()")
    version = cur.fetchone()
    print(f"Connected to QuestDB version: {version[0]}")

conn.close()
```

### Querying Data

psycopg3 provides several methods for fetching data:

- `fetchall()`: Returns all rows as a list of tuples
- `fetchone()`: Returns a single row as a tuple
- `fetchmany(size)`: Returns a specified number of rows

```python
import psycopg
from datetime import datetime, timedelta

with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
) as conn:
    with conn.cursor(binary=True) as cur:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=1)

        cur.execute("""
                    SELECT *
                    FROM trades
                    WHERE ts >= %s
                      AND ts <= %s
                    ORDER BY ts DESC LIMIT 10
                    """, (start_time, end_time))

        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")

        for row in rows:
            print(f"Timestamp: {row[0]}, Symbol: {row[1]}, Price: {row[2]}")
```

### Row Factories

psycopg3 allows you to specify how rows are returned using row factories:

```python
import psycopg

with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
) as conn:
    with conn.cursor(row_factory=psycopg.rows.dict_row, binary=True) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        for row in rows:
            print(f"Symbol: {row['symbol']}, Price: {row['price']}")

    with conn.cursor(row_factory=psycopg.rows.namedtuple_row, binary=True) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        for row in rows:
            print(f"Symbol: {row.symbol}, Price: {row.price}")
```

### Server-Side Cursors

For large result sets, you can use server-side cursors:

```python
import psycopg

with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
) as conn:
    with conn.cursor(binary=True) as cur:
        # Execute a query that might return many rows
        cur.execute("SELECT * FROM trades")

        batch_size = 1000
        total_processed = 0

        while True:
            batch = cur.fetchmany(batch_size)

            if not batch:
                break

            total_processed += len(batch)
            if total_processed % 10000 == 0:
                print(f"Processed {total_processed} rows so far...")

        print(f"Finished processing {total_processed} total rows")
```

### Parameterized Queries

psycopg3 uses placeholder parameters (`%s`) for prepared statements:

```python
import psycopg
from datetime import datetime, timedelta

with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
) as conn:
    with conn.cursor(binary=True) as cur:
        # Define query parameters
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7)

        # Execute a parameterized query
        cur.execute("""
                    SELECT symbol,
                           avg(price) as avg_price,
                           min(price) as min_price,
                           max(price) as max_price
                    FROM trades
                    WHERE ts >= %s
                      AND ts <= %s
                    GROUP BY symbol
                    """, (start_time, end_time))

        rows = cur.fetchall()
        for row in rows:
            print(f"Symbol: {row[0]}, Avg Price: {row[1]:.2f}")
```

### Async Support

psycopg3 supports async operations:

```python
import asyncio
import psycopg

async def async_psycopg3():
    async with await psycopg.AsyncConnection.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
    ) as aconn:
        async with aconn.cursor(binary=True) as acur:
            await acur.execute("SELECT * FROM trades LIMIT 10")

            rows = await acur.fetchall()

            print(f"Fetched {len(rows)} rows")
            for row in rows:
                print(row)

asyncio.run(async_psycopg3())
```

### Inserting Arrays

QuestDB, via the PostgreSQL wire protocol, supports [array data types](/docs/concept/array/), including multidimensional
arrays.

When you need to insert multiple rows containing array data, such as a series of order book snapshots, `executemany()`
offers a more performant way to do so compared to inserting row by row with execute().

:::tip
For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/)
instead of PGWire. PGWire should primarily be used for querying data in QuestDB. 

If you cannot use ILP for some reason, you should prefer [asyncpg](#inserting-arrays) over psycopg3 for performance
reasons. We found that asyncpg is significantly faster than psycopg3 when inserting batches of data including arrays.
:::

```python title="Batch Inserting L3 Order Book Snapshots"
import asyncio
import os
import time
from datetime import datetime, timedelta

import psycopg

async def batch_insert_l3_order_book_arrays():
    conn_str = "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest"

    async with await psycopg.AsyncConnection.connect(conn_str) as conn:
        async with conn.cursor(binary=True) as cur:
            await cur.execute("""
                              CREATE TABLE IF NOT EXISTS l3_order_book
                              (
                                  bid DOUBLE [][],
                                  ask DOUBLE [][],
                                  ts TIMESTAMP
                              ) TIMESTAMP(ts) PARTITION BY DAY WAL;
                              """)
            print("Table 'l3_order_book' is ready.")

            # Prepare a list of L3 order book snapshots for batch insertion
            snapshots_to_insert = []
            base_timestamp = datetime.now()

            # First row
            bids1 = [[68500.50, 0.5], [68500.00, 1.2], [68499.50, 0.3]]
            asks1 = [[68501.00, 0.8], [68501.50, 0.4], [68502.00, 1.1]]
            ts1 = (base_timestamp + timedelta(seconds=1))
            snapshots_to_insert.append((bids1, asks1, ts1))

            # Second row
            bids2 = [[68502.10, 0.3], [68501.80, 0.9], [68501.20, 1.5]]
            asks2 = [[68502.50, 1.1], [68503.00, 0.6], [68503.50, 0.2]]
            ts2 = (base_timestamp + timedelta(seconds=2))
            snapshots_to_insert.append((bids2, asks2, ts2))

            # Third row
            bids3 = [[68490.60, 2.5], [68489.00, 3.2]]
            asks3 = [[68491.20, 1.8], [68492.80, 0.7]]
            ts3 = (base_timestamp + timedelta(seconds=3))
            snapshots_to_insert.append((bids3, asks3, ts3))

            print(f"Prepared {len(snapshots_to_insert)} snapshots for batch insertion.")

            # Insert the snapshots into the database in a single batch
            await cur.executemany(
                """
                INSERT INTO l3_order_book (bid, ask, ts)
                VALUES (%b, %b, %b)
                """,
                snapshots_to_insert
            )
            print(f"Successfully inserted {cur.rowcount} L3 order book snapshots using executemany().")


if __name__ == "__main__":
    # Set timezone to UTC
    os.environ['TZ'] = 'UTC'
    if hasattr(time, 'tzset'):
        time.tzset()

    asyncio.run(batch_insert_l3_order_book_arrays())
```

The example above uses `%b` as placeholder parameters instead of the usual `%s` placeholder. This is because
`%b` format forces the use of the binary protocol. By default, psycopg3 uses the text encoding for array
parameters. The binary protocol is more efficient for transferring large amounts of data, especially for
arrays. The binary protocol is also the default for asyncpg, which is why we recommend using asyncpg for
data ingestion over PGWire.


### Connection Pooling

psycopg3 provides connection pooling capabilities. This reduces the overhead of establishing new connections
and allows for efficient reuse of existing connections. The feature requires the `psycopg_pool` package.

```bash title="psycopg_pool installation"
pip install psycopg_pool
```

```python
from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    min_size=5,
    max_size=20,
    kwargs={
        'host': '127.0.0.1',
        'port': 8812,
        'user': 'admin',
        'password': 'quest',
        'dbname': 'qdb',
        'autocommit': True
    }
)

with pool.connection() as conn:
    with conn.cursor(binary=True) as cur:
        cur.execute("SELECT * FROM trades LIMIT 10")
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")

pool.close()
```

### Performance Tips

- Use row factories to avoid manual tuple-to-dict conversion
- For large result sets, use server-side cursors
- Take advantage of connection pooling for multiple queries
- Use the async API for non-blocking operations

## psycopg2

[psycopg2](https://www.psycopg.org/docs/) is a mature PostgreSQL adapter for Python. While not as performant as asyncpg
or psycopg3, it's widely used and has excellent compatibility. This driver is recommended as a last resort for QuestDB
if asyncpg or psycopg3 are not working for you.

### Features

- Stable and mature API
- Thread safety
- Connection pooling (with external libraries)
- Server-side cursors
- Rich type conversion

### Installation

```bash
pip install psycopg2-binary
```

### Basic Connection

```python
import psycopg2

conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)

conn.autocommit = True

with conn.cursor() as cur:
    cur.execute("SELECT version()")
    version = cur.fetchone()
    print(f"Connected to QuestDB version: {version[0]}")

conn.close()
```

### Querying Data

psycopg2 provides several methods for fetching data:

- `fetchall()`: Returns all rows as a list of tuples
- `fetchone()`: Returns a single row as a tuple
- `fetchmany(size)`: Returns a specified number of rows

```python
import psycopg2
from datetime import datetime, timedelta

conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM trades LIMIT 10")
        
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")
        
        for row in rows:
            print(f"Timestamp: {row[0]}, Symbol: {row[1]}, Price: {row[2]}")
        
        # Fetch one row at a time
        cur.execute("SELECT * FROM trades LIMIT 5")
        print("\nFetching one row at a time:")
        row = cur.fetchone()
        while row:
            print(row)
            row = cur.fetchone()
        
        # Fetch many rows at a time
        cur.execute("SELECT * FROM trades LIMIT 100")
        print("\nFetching 10 rows at a time:")
        while True:
            rows = cur.fetchmany(10)
            if not rows:
                break
            print(f"Batch of {len(rows)} rows")
finally:
    conn.close()
```

### Dictionary Cursors

psycopg2 provides dictionary cursors to access rows by column name:

```python
import psycopg2.extras

conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        for row in rows:
            print(f"Symbol: {row['symbol']}, Price: {row['price']}")

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        for row in rows:
            print(row)  # Prints as a dict
finally:
    conn.close()
```

### Server-Side Cursors

For large result sets, you can use server-side cursors:

```python
import psycopg2

conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    with conn.cursor() as cur:
        # Execute a query that might return many rows
        cur.execute("SELECT * FROM trades")

        batch_size = 1000
        total_processed = 0

        while True:
            batch = cur.fetchmany(batch_size)

            # If no more rows, break the loop
            if not batch:
                break

            total_processed += len(batch)
            if total_processed % 10000 == 0:
                print(f"Processed {total_processed} rows so far...")

        print(f"Finished processing {total_processed} total rows")
finally:
    conn.close()
```

### Parameterized Queries

psycopg2 uses placeholder parameters (`%s`) for prepared statements:

```python
import psycopg2
from datetime import datetime, timedelta

conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    with conn.cursor() as cur:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7000)

        cur.execute("""
                    SELECT symbol,
                           avg(price) as avg_price,
                           min(price) as min_price,
                           max(price) as max_price
                    FROM trades
                    WHERE ts >= %s
                      AND ts <= %s
                    GROUP BY symbol
                    """, (start_time, end_time))

        rows = cur.fetchall()
        for row in rows:
            print(f"Symbol: {row[0]}, Avg Price: {row[1]:.2f}")
finally:
    conn.close()
```

### Connection Pooling with psycopg2-pool

For connection pooling with psycopg2, you can use external libraries like psycopg2-pool:

```python
from psycopg2.pool import ThreadedConnectionPool

pool = ThreadedConnectionPool(
    minconn=5,
    maxconn=20,
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)

conn = pool.getconn()

try:
    conn.autocommit = True

    with conn.cursor() as cur:
        cur.execute("SELECT * FROM trades LIMIT 10")
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")
finally:
    pool.putconn(conn)

pool.closeall()
```

### Integration with pandas

psycopg2 integrates with pandas over SQLAlchemy, allowing you to read data directly into a DataFrame. This feature
requires the `pandas`, `sqlalchemy`, and `questdb-connect` packages.

```bash title="pandas, sqlalchemy, and questdb-connect installation"
pip install pandas sqlalchemy questdb-connect
```

:::note

This example shows how to use the SQLAlchemy engine with psycopg2 for querying QuestDB into a pandas DataFrame.
For ingestion from Pandas to QuestDB see our [pandas ingestion guide](/docs/third-party-tools/pandas/).

:::

```python
import pandas as pd
from sqlalchemy import create_engine

from datetime import datetime, timedelta

engine = create_engine("questdb://admin:quest@localhost:8812/qdb")

with engine.connect() as conn:
    end_time = datetime.now()
    start_time = end_time - timedelta(days=10000)

    query = """
            SELECT * \
            FROM trades
            WHERE ts >= %s \
              AND ts <= %s
            ORDER BY ts \
            """

    # Execute the query directly into a pandas DataFrame
    df = pd.read_sql(query, conn, params=(start_time, end_time))

    print(f"DataFrame shape: {df.shape}")
    print(f"DataFrame columns: {df.columns.tolist()}")
    print(f"Sample data:\n{df.head()}")
```

### Known Limitations with QuestDB

- psycopg2 is generally slower than asyncpg and psycopg3

### Performance Tips

- Use dictionary cursors to avoid manual tuple-to-dict conversion
- For large result sets, use server-side cursors
- Consider using a connection pool for multiple queries
- Set autocommit=True to avoid transaction overhead

## Best Practices for All PGWire Clients

### Query Optimization

For optimal query performance with QuestDB:

1. **Filter on the designated timestamp column**: Always include time filters on the designated timestamp column to
   leverage QuestDB's time-series optimizations
2. **Use appropriate time ranges**: Avoid querying unnecessarily large time ranges
3. **Use SAMPLE BY for large datasets**: Downsample data when appropriate

### Common Time Series Queries

QuestDB provides specialized time-series functions that work with all PGWire clients:

```
# Example time-series query patterns

# 1. Sample by query (works with all clients)
"""
SELECT 
    ts,
    avg(price) as avg_value
FROM trades
WHERE timestamp >= '2020-01-01'
SAMPLE BY 1h;
"""

# 2. Latest on query (efficient way to get most recent values)
"""
SELECT * FROM trades
LATEST ON timestamp PARTITION BY symbol;
"""

```

## Conclusion

QuestDB's support for the PostgreSQL Wire Protocol allows you to use a variety of Python clients to query your
time-series data:

- **asyncpg**: Best performance, especially for large result sets, uses binary protocol by default
- **psycopg3**: Excellent balance of features and performance, supports both sync and async operations
- **psycopg2**: Mature and stable client with wide compatibility, but slower than asyncpg and psycopg3

For most use cases, we recommend using asyncpg or psycopg3 for better performance. For data ingestion, consider using
QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for maximum throughput.

## Additional Resources
- [Polars Integration with QuestDB](/docs/third-party-tools/polars)
- [QuestDB Client for fast ingestion](/docs/clients/ingest-python/)