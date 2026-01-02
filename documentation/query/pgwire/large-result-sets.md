---
title: Handling Large Result Sets
sidebar_label: Large Result Sets
description:
  How to efficiently query large datasets over PGWire without running out of
  memory. Includes per-language examples for cursor-based fetching.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

When querying large datasets via PGWire, many PostgreSQL drivers load the
**entire result set into memory** before returning any rows. This causes:

- **Out of memory errors** on the client
- **Long wait times** before the first row is available
- **Timeouts** for very large queries

The solution is to use **cursor-based fetching** (also called streaming or
paging), which retrieves rows in batches.

## The problem

By default, most PostgreSQL drivers execute queries like this:

1. Send query to server
2. Wait for **all rows** to be returned
3. Load everything into client memory
4. Return results to application

For a query returning 100 million rows, this means loading all 100 million rows
into RAM before your application sees a single row.

## The solution

Configure your driver to use **cursor-based fetching**:

1. Send query to server
2. Fetch rows in batches (e.g., 10,000 at a time)
3. Process each batch before fetching the next
4. Repeat until all rows are consumed

This keeps memory usage constant regardless of result set size.

## Language examples

<Tabs defaultValue="java" values={[
  { label: "Java", value: "java" },
  { label: "Python", value: "python" },
  { label: "Go", value: "go" },
  { label: "Node.js", value: "nodejs" },
  { label: ".NET", value: "dotnet" },
]}>

<TabItem value="java">

### Java (JDBC)

JDBC loads all rows into memory by default. To enable cursor-based fetching:

```java
import java.sql.*;

public class LargeResultSet {
    public static void main(String[] args) throws SQLException {
        String url = "jdbc:postgresql://localhost:8812/qdb";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "quest");

        try (Connection conn = DriverManager.getConnection(url, props)) {
            // REQUIRED: Disable auto-commit to enable cursor mode
            conn.setAutoCommit(false);

            try (Statement stmt = conn.createStatement()) {
                // Set fetch size - rows fetched per batch
                stmt.setFetchSize(10000);

                try (ResultSet rs = stmt.executeQuery(
                        "SELECT * FROM large_table")) {
                    while (rs.next()) {
                        // Process each row
                        // Memory usage stays constant
                    }
                }
            }
        }
    }
}
```

**Key points:**
- `setAutoCommit(false)` is **required** — cursor mode only works within a transaction
- `setFetchSize(n)` controls how many rows are fetched per round-trip
- Choose fetch size based on row size and available memory (1,000–50,000 is typical)

</TabItem>

<TabItem value="python">

### Python (psycopg2 / psycopg3)

#### psycopg2: Server-side cursor

```python
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=8812,
    user="admin",
    password="quest",
    database="qdb"
)

# Use a named cursor for server-side cursor
with conn.cursor(name='large_query_cursor') as cursor:
    cursor.itersize = 10000  # Fetch 10,000 rows at a time

    cursor.execute("SELECT * FROM large_table")

    for row in cursor:
        # Process each row
        # Memory usage stays constant
        pass

conn.close()
```

#### psycopg3: Cursor with itersize

```python
import psycopg

with psycopg.connect(
    "host=localhost port=8812 user=admin password=quest dbname=qdb"
) as conn:
    with conn.cursor(name="large_cursor") as cursor:
        cursor.execute("SELECT * FROM large_table")

        # Fetch in batches
        while batch := cursor.fetchmany(10000):
            for row in batch:
                # Process each row
                pass
```

**Key points:**
- Named cursors (`cursor(name='...')`) enable server-side cursors
- `itersize` controls batch size when iterating
- Unnamed cursors load everything into memory

</TabItem>

<TabItem value="go">

### Go (pgx)

pgx streams results by default, but you should still process rows without
collecting them all:

```go
package main

import (
    "context"
    "fmt"
    "github.com/jackc/pgx/v5"
)

func main() {
    ctx := context.Background()

    conn, err := pgx.Connect(ctx,
        "postgres://admin:quest@localhost:8812/qdb")
    if err != nil {
        panic(err)
    }
    defer conn.Close(ctx)

    // Use Query for streaming - don't use QueryRow for large results
    rows, err := conn.Query(ctx, "SELECT * FROM large_table")
    if err != nil {
        panic(err)
    }
    defer rows.Close()

    // Process rows one at a time - memory stays constant
    for rows.Next() {
        var col1 string
        var col2 int64
        if err := rows.Scan(&col1, &col2); err != nil {
            panic(err)
        }
        // Process row
    }

    if err := rows.Err(); err != nil {
        panic(err)
    }
}
```

**Key points:**
- pgx streams by default — just avoid collecting all rows into a slice
- Use `Query()` and iterate with `rows.Next()`, not `QueryRow()`
- Call `rows.Close()` when done to release connection resources

</TabItem>

<TabItem value="nodejs">

### Node.js (node-postgres)

Use a cursor with the `pg-cursor` package:

```javascript
const { Pool } = require('pg');
const Cursor = require('pg-cursor');

const pool = new Pool({
  host: 'localhost',
  port: 8812,
  user: 'admin',
  password: 'quest',
  database: 'qdb',
});

async function queryLargeTable() {
  const client = await pool.connect();

  try {
    const cursor = client.query(
      new Cursor('SELECT * FROM large_table')
    );

    const batchSize = 10000;
    let rows;

    do {
      rows = await cursor.read(batchSize);
      for (const row of rows) {
        // Process each row
        // Memory usage stays constant
      }
    } while (rows.length > 0);

    await cursor.close();
  } finally {
    client.release();
  }
}

queryLargeTable();
```

**Key points:**
- Install `pg-cursor`: `npm install pg-cursor`
- `cursor.read(n)` fetches n rows at a time
- Always close the cursor when done

</TabItem>

<TabItem value="dotnet">

### .NET (Npgsql)

Use `CommandBehavior.SequentialAccess` for streaming:

```csharp
using Npgsql;

var connString = "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb";

await using var conn = new NpgsqlConnection(connString);
await conn.OpenAsync();

await using var cmd = new NpgsqlCommand("SELECT * FROM large_table", conn);

// Use SequentialAccess for streaming large results
await using var reader = await cmd.ExecuteReaderAsync(
    System.Data.CommandBehavior.SequentialAccess);

while (await reader.ReadAsync())
{
    // Process each row
    // Memory usage stays constant
    var col1 = reader.GetString(0);
    var col2 = reader.GetInt64(1);
}
```

**Key points:**
- `CommandBehavior.SequentialAccess` enables streaming mode
- Access columns in order (left to right) in sequential mode
- For very large columns, use `GetStream()` or `GetTextReader()`

</TabItem>

</Tabs>

## Choosing a fetch size

The optimal fetch size depends on:

| Factor | Recommendation |
|--------|----------------|
| Row size small (< 100 bytes) | 10,000–50,000 rows |
| Row size medium (100–1000 bytes) | 1,000–10,000 rows |
| Row size large (> 1KB) | 100–1,000 rows |
| High-latency network | Larger batches (reduce round-trips) |
| Memory-constrained client | Smaller batches |

Start with 10,000 and adjust based on memory usage and performance.

## Common mistakes

### Collecting all rows into a list

```java
// BAD: Collects all rows into memory
List<Row> allRows = new ArrayList<>();
while (rs.next()) {
    allRows.add(extractRow(rs));
}
// allRows now contains millions of rows in memory
```

```java
// GOOD: Process rows as they arrive
while (rs.next()) {
    processRow(rs);  // Stream to file, aggregate, etc.
}
```

### Forgetting to disable auto-commit (Java)

```java
// BAD: Cursor mode won't work
stmt.setFetchSize(10000);  // Ignored without setAutoCommit(false)
```

```java
// GOOD: Disable auto-commit first
conn.setAutoCommit(false);
stmt.setFetchSize(10000);
```

### Using unnamed cursors (Python)

```python
# BAD: Loads all rows into memory
cursor = conn.cursor()
cursor.execute("SELECT * FROM large_table")
rows = cursor.fetchall()  # OOM for large tables
```

```python
# GOOD: Use a named cursor
cursor = conn.cursor(name='streaming_cursor')
cursor.execute("SELECT * FROM large_table")
for row in cursor:  # Streams in batches
    process(row)
```

## See also

- [PostgreSQL Wire Protocol Overview](/docs/query/pgwire/overview/)
- [Query & SQL Overview](/docs/query/overview/)
- [Capacity Planning](/docs/getting-started/capacity-planning/)
