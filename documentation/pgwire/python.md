---
title: Python clients
description:
  Python clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Python for querying data. 
---

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use familiar
PostgreSQL clients and drivers with QuestDB's high-performance time-series database.

QuestDB is tested with the following Python clients:

- [asyncpg](https://pypi.org/project/asyncpg/)
- [psycopg2](https://www.psycopg.org/docs/)
- [psycopg3](https://www.psycopg.org/psycopg3/docs/)

Other Python clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. We found psycopg2 to be
the slowest of the three clients. Our recommendation is to use asyncpg or psycopg3 for the best performance when
querying data.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB.

## Connection Parameters

All Python PostgreSQL clients need similar connection parameters to connect to QuestDB:

```python
# Connection parameters
CONNECTION_PARAMS = {
    'host': '127.0.0.1',
    'port': 8812,  # Default PGWire port for QuestDB
    'user': 'admin',
    'password': 'quest',
    'database': 'qdb'
}
```

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
import asyncpg

async def connect_to_questdb():
    # Connect to QuestDB
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )
    
    # Execute a simple query
    version = await conn.fetchval("SELECT version()")
    print(f"Connected to QuestDB version: {version}")
    
    # Close the connection
    await conn.close()

# Run the async function
asyncio.run(connect_to_questdb())
```

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
        SELECT * FROM trades
        WHERE ts >= $1
        ORDER BY ts DESC
        LIMIT 10
    """, datetime.now() - timedelta(days=1))
    
    print(f"Fetched {len(rows)} rows")
    for row in rows:
        print(f"Timestamp: {row['ts']}, Symbol: {row['symbol']}, Price: {row['price']}")
    
    # Fetch a single row
    single_row = await conn.fetchrow("""
        SELECT * FROM trades
        LIMIT -1
    """)
    
    if single_row:
        print(f"Latest trade: {single_row['symbol']} at {single_row['price']}")
    
    # Fetch a single value
    count = await conn.fetchval("SELECT count(*) FROM trades")
    print(f"Total trades: {count}")
    
    await conn.close()

asyncio.run(query_with_asyncpg())
```

### Using Cursors for Large Result Sets

For large result sets, you can use a cursor to fetch results in batches:

```python
import asyncio
import asyncpg

async def stream_with_cursor():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )
    
    # Create a cursor for streaming results
    async with conn.transaction():
        # Execute a query that might return a large number of rows
        cursor = await conn.cursor("""
            SELECT * FROM trades
            ORDER BY ts
        """)
        
        # Fetch rows in batches
        batch_size = 100
        total_processed = 0
        
        while True:
            # Fetch a batch of rows
            batch = await cursor.fetch(batch_size)
            
            # If no more rows, break the loop
            if not batch:
                break
            
            # Process the batch
            total_processed += len(batch)
            print(f"Processed {total_processed} rows so far...")
    
    await conn.close()
    print(f"Finished processing {total_processed} total rows")

asyncio.run(stream_with_cursor())
```

### Connection Pooling

For applications that need to execute many queries, you can use connection pooling:

```python
import asyncio
import asyncpg

async def connection_pool_example():
    # Create a connection pool
    pool = await asyncpg.create_pool(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb',
        min_size=5,
        max_size=20
    )
    
    # Use the pool to execute queries
    async with pool.acquire() as conn:
        result = await conn.fetch("SELECT * FROM trades LIMIT 10")
        print(f"Fetched {len(result)} rows")
    
    # Close the pool
    await pool.close()

asyncio.run(connection_pool_example())
```

### Parameterized Queries

asyncpg uses numbered parameters (`$1`, `$2`, etc.) for prepared statements:

```python
import asyncio
import asyncpg
from datetime import datetime, timedelta

async def parameterized_query():
    conn = await asyncpg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        database='qdb'
    )
    
    # Define time range for query
    end_time = datetime.now()
    start_time = end_time - timedelta(days=7)
    
    # Execute a parameterized query
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

asyncio.run(parameterized_query())
```

### Binary Protocol

asyncpg uses the binary protocol by default, which improves performance by avoiding text encoding/decoding for data
transfer.

### Known Limitations with QuestDB

- Some asyncpg features like explicit `prepare()` method might have compatibility issues with QuestDB
- For such cases, use simple parameterized queries without explicit preparation

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
pip install psycopg
```

### Basic Connection

```python
import psycopg

# Connect to QuestDB
conn = psycopg.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb',
    autocommit=True  # Important for QuestDB
)

# Create a cursor
with conn.cursor() as cur:
    # Execute a query
    cur.execute("SELECT version()")
    version = cur.fetchone()
    print(f"Connected to QuestDB version: {version[0]}")

# Close the connection
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

# Connect to QuestDB
with psycopg.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb',
    autocommit=True
) as conn:
    with conn.cursor() as cur:
        # Define query parameters
        end_time = datetime.now()
        start_time = end_time - timedelta(days=1)
        
        # Execute a parameterized query
        cur.execute("""
            SELECT * FROM trades
            WHERE ts >= %s AND ts <= %s
            ORDER BY ts DESC
            LIMIT 10
        """, (start_time, end_time))
        
        # Fetch all results
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")
        
        # Process the results
        for row in rows:
            print(f"Timestamp: {row[0]}, Symbol: {row[1]}, Price: {row[2]}")
```

### Row Factories

psycopg3 allows you to specify how rows are returned using row factories:

```python
import psycopg

# Connect to QuestDB
with psycopg.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb',
    autocommit=True
) as conn:
    # Create a cursor with dict_row factory
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()
        
        # Access columns by name
        for row in rows:
            print(f"Symbol: {row['symbol']}, Price: {row['price']}")
    
    # Create a cursor with named tuple factory
    with conn.cursor(row_factory=psycopg.rows.namedtuple_row) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()
        
        # Access columns as named attributes
        for row in rows:
            print(f"Symbol: {row.symbol}, Price: {row.price}")
```

### Server-Side Cursors

For large result sets, you can use server-side cursors:

```python
import psycopg

# Connect to QuestDB
with psycopg.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb',
    autocommit=True
) as conn:
    # Create a server-side cursor
    with conn.cursor() as cur:
        # Execute a query that might return many rows
        cur.execute("SELECT * FROM trades")
        
        # Fetch rows in batches
        batch_size = 1000
        total_processed = 0
        
        while True:
            # Fetch a batch of rows
            batch = cur.fetchmany(batch_size)
            
            # If no more rows, break the loop
            if not batch:
                break
            
            # Process the batch
            total_processed += len(batch)
            
            # Print progress
            if total_processed % 10000 == 0:
                print(f"Processed {total_processed} rows so far...")
        
        print(f"Finished processing {total_processed} total rows")
```

### Parameterized Queries

psycopg3 uses placeholder parameters (`%s`) for prepared statements:

```python
import psycopg
from datetime import datetime, timedelta

# Connect to QuestDB
with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
) as conn:
    with conn.cursor() as cur:
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

        # Fetch and process results
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
    # Connect asynchronously
    async with await psycopg.AsyncConnection.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
    ) as aconn:
        # Create an async cursor
        async with aconn.cursor() as acur:
            # Execute a query
            await acur.execute("SELECT * FROM trades LIMIT 10")

            # Fetch results
            rows = await acur.fetchall()

            print(f"Fetched {len(rows)} rows")
            for row in rows:
                print(row)

# Run the async function
asyncio.run(async_psycopg3())
```

### Connection Pooling

psycopg3 provides connection pooling capabilities. This reduces the overhead of establishing new connections
and allows for efficient reuse of existing connections. The feature requires the `psycopg_pool` package.

```bash title="psycopg_pool installation"
pip install psycopg_pool
```

```python
from psycopg_pool import ConnectionPool

# Create a connection pool
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

# Use the pool to execute queries
with pool.connection() as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM trades LIMIT 10")
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")

# Close the pool
pool.close()
```

### Known Limitations with QuestDB

- Some PostgreSQL-specific features may not be available in QuestDB

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

# Connect to QuestDB
conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)

# Enable autocommit mode
conn.autocommit = True

# Create a cursor
with conn.cursor() as cur:
    # Execute a query
    cur.execute("SELECT version()")
    version = cur.fetchone()
    print(f"Connected to QuestDB version: {version[0]}")

# Close the connection
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

# Connect to QuestDB
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
        # Execute a query
        cur.execute("SELECT * FROM trades LIMIT 10")
        
        # Fetch all results
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")
        
        # Process the results
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

# Connect to QuestDB
conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    # Create a dictionary cursor
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        # Access columns by name
        for row in rows:
            print(f"Symbol: {row['symbol']}, Price: {row['price']}")

    # Create a real dictionary cursor
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT * FROM trades LIMIT 5")
        rows = cur.fetchall()

        # Each row is a true Python dict
        for row in rows:
            print(row)  # Prints as a dict
finally:
    conn.close()
```

### Server-Side Cursors

For large result sets, you can use server-side cursors:

```python
import psycopg2

# Connect to QuestDB
conn = psycopg2.connect(
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)
conn.autocommit = True

try:
    # Create a server-side cursor
    with conn.cursor() as cur:
        # Execute a query that might return many rows
        cur.execute("SELECT * FROM trades")

        # Fetch rows in batches
        batch_size = 1000
        total_processed = 0

        while True:
            # Fetch a batch of rows
            batch = cur.fetchmany(batch_size)

            # If no more rows, break the loop
            if not batch:
                break

            # Process the batch
            total_processed += len(batch)

            # Print progress
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

# Connect to QuestDB
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
        # Define query parameters
        end_time = datetime.now()
        start_time = end_time - timedelta(days=7000)

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

        # Fetch and process results
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

# Create a connection pool
pool = ThreadedConnectionPool(
    minconn=5,
    maxconn=20,
    host='127.0.0.1',
    port=8812,
    user='admin',
    password='quest',
    dbname='qdb'
)

# Get a connection from the pool
conn = pool.getconn()

try:
    # Set autocommit
    conn.autocommit = True

    # Use the connection
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM trades LIMIT 10")
        rows = cur.fetchall()
        print(f"Fetched {len(rows)} rows")
finally:
    # Return the connection to the pool
    pool.putconn(conn)

# Close the pool when done
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

# Create SQLAlchemy engine
engine = create_engine("questdb://admin:quest@localhost:8812/qdb")

# Connect to the database
with engine.connect() as conn:
    # Define query parameters
    end_time = datetime.now()
    start_time = end_time - timedelta(days=10000)

    # Create a query
    query = """
            SELECT * \
            FROM trades
            WHERE ts >= %s \
              AND ts <= %s
            ORDER BY ts \
            """

    # Execute the query directly into a pandas DataFrame
    df = pd.read_sql(query, conn, params=(start_time, end_time))

    # Display basic information
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
4. **Use LATEST BY for last-value queries**: More efficient than ORDER BY/LIMIT

### Common Time Series Queries

QuestDB provides specialized time-series functions that work with all PGWire clients:

```python
# Example time-series query patterns

# 1. Sample by query (works with all clients)
"""
SELECT 
    ts,
    avg(value) as avg_value
FROM sensors
WHERE ts >= '2023-01-01'
SAMPLE BY 1h
"""

# 2. Latest by query (efficient way to get most recent values)
"""
SELECT * FROM trades
LATEST ON timestamp PARTITION BY symbol;
"""

```

### Error Handling

Always implement proper error handling for database operations:

```python
# Example error handling for psycopg3
import psycopg
from psycopg import errors, DataError

try:
    with psycopg.connect(
        host='127.0.0.1',
        port=8812,
        user='admin',
        password='quest',
        dbname='qdb',
        autocommit=True
    ) as conn:
        with conn.cursor() as cur:
            try:
                # Execute a query that might fail
                cur.execute("SELECT * FROM non_existent_table")
                results = cur.fetchall()
            except Exception as e:
                print(f"Query error: {e}")
except Exception as e:
    print(f"Connection error: {e}")
```

## Conclusion

QuestDB's support for the PostgreSQL Wire Protocol allows you to use a variety of Python clients to query your
time-series data:

- **asyncpg**: Best performance, especially for large result sets, uses binary protocol by default
- **psycopg3**: Excellent balance of features and performance, supports both sync and async operations
- **psycopg2**: Mature and stable client with wide compatibility

For most use cases, we recommend using asyncpg or psycopg3 for better performance. For data ingestion, consider using
QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for maximum throughput.