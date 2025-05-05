---
title: Rust clients
description:
  Rust clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Rust for querying data. 
---

QuestDB is tested with the following Rust client:

- [tokio-postgres](https://crates.io/crates/tokio-postgres)

Other Rust clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. For best performance when querying data from QuestDB with
Rust, we recommend using tokio-postgres with connection pooling.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB.

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use standard
Rust PostgreSQL clients with QuestDB's high-performance time-series database.

It's important to note that QuestDB's underlying storage model differs from PostgreSQL's, which means some PostgreSQL
features may not be available in QuestDB.

## Connection Parameters

The tokio-postgres client needs the following connection parameters to connect to QuestDB:

- **Host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **Port**: The PostgreSQL wire protocol port (default: `8812`)
- **Username**: The username for authentication (default: `admin`)
- **Password**: The password for authentication (default: `quest`)
- **Database**: The database name (default: `qdb`)

## tokio-postgres

[tokio-postgres](https://docs.rs/tokio-postgres/latest/tokio_postgres/) is an asynchronous, pipelined, PostgreSQL client
for Rust that integrates with the tokio async runtime. It provides an efficient way to interact with
PostgreSQL-compatible databases, including QuestDB.

### Features

- Fully asynchronous using Rust's async/await syntax
- Connection pooling capabilities with libraries like bb8 or deadpool
- Prepared statements for better performance and security
- Transaction support
- Support for binary data formats
- Comprehensive error handling
- Support for various PostgreSQL data types

### Installation

To use tokio-postgres in your Rust project, add the following dependencies to your `Cargo.toml`:

```toml
[dependencies]
tokio = { version = "1.28", features = ["full"] }
tokio-postgres = "0.7.9"
```

If you need TLS support, you can add one of these optional dependencies:

```toml
# For OpenSSL support
postgres-openssl = "0.5.0"
openssl = "0.10.55"

# OR for native-tls support
postgres-native-tls = "0.5.0"
native-tls = "0.2.11"
```

### Basic Connection

Here's a basic example of connecting to QuestDB using tokio-postgres:

```rust
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    // The connection object performs the actual communication with the database,
    // so spawn it off to run on its own
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Use the client to execute a simple query
    let rows = client.query("SELECT version()", &[]).await?;
    
    // Print the version
    let version: &str = rows[0].get(0);
    println!("QuestDB version: {}", version);
    
    Ok(())
}
```

You can also use a builder-style approach with the `Config` struct:

```rust
use tokio_postgres::{config::Config, NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Configure the connection
    let mut config = Config::new();
    config
        .host("localhost")
        .port(8812)
        .user("admin")
        .password("quest")
        .dbname("qdb");
    
    // Connect to QuestDB
    let (client, connection) = config.connect(NoTls).await?;
    
    // Spawn the connection handling task
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Execute a query
    let rows = client.query("SELECT version()", &[]).await?;
    
    // Print the version
    let version: &str = rows[0].get(0);
    println!("QuestDB version: {}", version);
    
    Ok(())
}
```

### Querying Data

Here's how to execute a simple query and process the results:

```rust
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Execute a query
    let rows = client.query("SELECT * FROM trades LIMIT 10", &[]).await?;
    
    // Process the results
    println!("Recent trades:");
    for row in rows {
        let timestamp: chrono::DateTime<chrono::Utc> = row.get("ts");
        let symbol: &str = row.get("symbol");
        let price: f64 = row.get("price");
        
        println!("Time: {}, Symbol: {}, Price: {:.2}", timestamp, symbol, price);
    }
    
    Ok(())
}
```

### Parameterized Queries

Using parameterized queries helps prevent SQL injection and can improve performance for repeated queries:

```rust
use tokio_postgres::{NoTls, Error};
use chrono::{DateTime, Utc, Duration};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Define parameters
    let symbol = "BTC-USD";
    let start_time = Utc::now() - Duration::days(7); // 7 days ago
    
    // Execute a parameterized query
    let rows = client.query(
        "SELECT * FROM trades WHERE symbol = $1 AND ts >= $2 ORDER BY ts DESC LIMIT 10",
        &[&symbol, &start_time],
    ).await?;
    
    // Process the results
    println!("Recent {} trades:", symbol);
    for row in rows {
        let timestamp: DateTime<Utc> = row.get("ts");
        let price: f64 = row.get("price");
        
        println!("Time: {}, Price: {:.2}", timestamp, price);
    }
    
    Ok(())
}
```

Note: When binding parameters related to timestamps, there are some considerations with QuestDB. Make sure your DateTime
objects are properly formatted for QuestDB to understand them.

### Prepared Statements

For queries that will be executed multiple times with different parameters, you can use prepared statements:

```rust
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Prepare a statement
    let statement = client.prepare(
        "SELECT * FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT $2"
    ).await?;
    
    // Execute the prepared statement with different parameters
    let symbols = vec!["BTC-USD", "ETH-USD", "SOL-USD"];
    
    for symbol in symbols {
        let rows = client.query(&statement, &[&symbol, &5]).await?;
        
        println!("\nRecent {} trades:", symbol);
        for row in rows {
            let timestamp: chrono::DateTime<chrono::Utc> = row.get("ts");
            let price: f64 = row.get("price");
            
            println!("Time: {}, Price: {:.2}", timestamp, price);
        }
    }
    
    Ok(())
}
```

### Working with Structs

You can map database rows to Rust structs for more ergonomic data handling:

```rust
use tokio_postgres::{NoTls, Error, Row};
use chrono::{DateTime, Utc};

// Define a struct to represent a trade
#[derive(Debug)]
struct Trade {
    timestamp: DateTime<Utc>,
    symbol: String,
    price: f64,
    amount: f64,
}

// Implement From<Row> for Trade to make conversion easier
impl From<Row> for Trade {
    fn from(row: Row) -> Self {
        Self {
            timestamp: row.get("ts"),
            symbol: row.get("symbol"),
            price: row.get("price"),
            amount: row.get("amount"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // Execute a query
    let rows = client.query("SELECT * FROM trades LIMIT 10", &[]).await?;
    
    // Convert rows to Trade structs
    let trades: Vec<Trade> = rows.into_iter()
        .map(Trade::from)
        .collect();
    
    // Print the trades
    for trade in trades {
        println!(
            "Time: {}, Symbol: {}, Price: {:.2}, Amount: {:.4}",
            trade.timestamp, trade.symbol, trade.price, trade.amount
        );
    }
    
    Ok(())
}
```

### Connection Pooling with bb8

For applications that need to handle multiple concurrent database operations, you can use connection pooling with a
library like bb8:

First, add the bb8 dependency to your `Cargo.toml`:

```toml
[dependencies]
bb8 = "0.8.1"
bb8-postgres = "0.8.1"
```

Then, implement connection pooling:

```rust
use bb8::{Pool, PooledConnection};
use bb8_postgres::PostgresConnectionManager;
use tokio_postgres::{config::Config, NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Configure the connection
    let mut config = Config::new();
    config
        .host("localhost")
        .port(8812)
        .user("admin")
        .password("quest")
        .dbname("qdb");
    
    // Create a connection manager
    let manager = PostgresConnectionManager::new(config, NoTls);
    
    // Create a connection pool
    let pool = Pool::builder()
        .max_size(15) // Maximum connections in the pool
        .build(manager)
        .await
        .expect("Failed to create pool");
    
    // Use the pool to execute queries
    async fn execute_query(pool: &Pool<PostgresConnectionManager<NoTls>>, symbol: &str) -> Result<(), Error> {
        // Get a connection from the pool
        let conn: PooledConnection<'_, PostgresConnectionManager<NoTls>> = pool.get().await
            .expect("Failed to get connection from pool");
        
        // Execute a query
        let rows = conn.query(
            "SELECT * FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT 5",
            &[&symbol],
        ).await?;
        
        // Process the results
        println!("\nRecent {} trades:", symbol);
        for row in rows {
            let timestamp: chrono::DateTime<chrono::Utc> = row.get("ts");
            let price: f64 = row.get("price");
            
            println!("Time: {}, Price: {:.2}", timestamp, price);
        }
        
        Ok(())
    }
    
    // Execute concurrent queries
    let symbols = vec!["BTC-USD", "ETH-USD", "SOL-USD"];
    let mut handles = vec![];
    
    for symbol in symbols {
        let pool_clone = pool.clone();
        let symbol_clone = symbol.to_string();
        
        let handle = tokio::spawn(async move {
            if let Err(e) = execute_query(&pool_clone, &symbol_clone).await {
                eprintln!("Query error for {}: {}", symbol_clone, e);
            }
        });
        
        handles.push(handle);
    }
    
    // Wait for all queries to complete
    for handle in handles {
        handle.await.expect("Task failed");
    }
    
    Ok(())
}
```

### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with tokio-postgres:

```rust
use tokio_postgres::{NoTls, Error, Row};
use chrono::{DateTime, Utc};

// Define structs for the query results
#[derive(Debug)]
struct SampledData {
    timestamp: DateTime<Utc>,
    symbol: String,
    avg_price: f64,
    min_price: f64,
    max_price: f64,
}

#[derive(Debug)]
struct LatestTrade {
    timestamp: DateTime<Utc>,
    symbol: String,
    price: f64,
    amount: f64,
}

// Implement From<Row> for the structs
impl From<Row> for SampledData {
    fn from(row: Row) -> Self {
        Self {
            timestamp: row.get("ts"),
            symbol: row.get("symbol"),
            avg_price: row.get("avg_price"),
            min_price: row.get("min_price"),
            max_price: row.get("max_price"),
        }
    }
}

impl From<Row> for LatestTrade {
    fn from(row: Row) -> Self {
        Self {
            timestamp: row.get("ts"),
            symbol: row.get("symbol"),
            price: row.get("price"),
            amount: row.get("amount"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // Connect to QuestDB
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });
    
    // SAMPLE BY query (time-based downsampling)
    println!("Hourly price samples (last 7 days):");
    let sample_by_query = "
        SELECT 
            ts, 
            symbol, 
            avg(price) as avg_price, 
            min(price) as min_price, 
            max(price) as max_price 
        FROM trades 
        WHERE ts >= dateadd('d', -7, now()) 
        SAMPLE BY 1h
    ";
    
    let rows = client.query(sample_by_query, &[]).await?;
    let sampled_data: Vec<SampledData> = rows.into_iter()
        .map(SampledData::from)
        .collect();
    
    for data in sampled_data {
        println!(
            "Time: {}, Symbol: {}, Avg: {:.2}, Range: {:.2} - {:.2}",
            data.timestamp, data.symbol, data.avg_price, data.min_price, data.max_price
        );
    }
    
    // LATEST BY query (last value per group)
    println!("\nLatest trades by symbol:");
    let latest_by_query = "SELECT * FROM trades LATEST BY symbol";
    
    let rows = client.query(latest_by_query, &[]).await?;
    let latest_trades: Vec<LatestTrade> = rows.into_iter()
        .map(LatestTrade::from)
        .collect();
    
    for trade in latest_trades {
        println!(
            "Symbol: {}, Latest Price: {:.2} at {}", 
            trade.symbol, trade.price, trade.timestamp
        );
    }
    
    Ok(())
}
```


### Known Limitations with QuestDB

When using tokio-postgres with QuestDB, be aware of these limitations:

1. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
2. **Type System Differences**: QuestDB's type system differs from PostgreSQL's, which can lead to incompatibilities in
   certain situations.
3. **PostgreSQL-Specific Features**: Some PostgreSQL-specific features like temporary tables or indexes are not
   supported in QuestDB.
4. **Cursor Support**: QuestDB's support for cursors differs from PostgreSQL, which may affect certain query patterns.

### Performance Tips

1. **Use Connection Pooling**: Libraries like bb8 or deadpool can help manage connections efficiently.
2. **Prepared Statements**: Use prepared statements for queries that are executed frequently.
3. **Async/Await**: Take advantage of the asynchronous nature of tokio-postgres to handle multiple operations
   concurrently.
4. **Batching**: Batch related queries together when possible to reduce network overhead.
5. **Query Optimization**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST BY` for
   efficient queries.
6. **Limit Result Sets**: When dealing with large datasets, use appropriate limits to avoid transferring excessive data.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with tokio-postgres:

### SAMPLE BY Queries

SAMPLE BY is used for time-based downsampling:

```sql
SELECT ts,
       symbol,
       avg(price) as avg_price,
       min(price) as min_price,
       max(price) as max_price
FROM trades
WHERE ts >= dateadd('d', -7, now()) SAMPLE BY 1h
```

### LATEST BY Queries

LATEST BY is an efficient way to get the most recent values:

```sql
SELECT *
FROM trades LATEST BY symbol
```

### Time Window Functions

For more complex time-based aggregations:

```sql
SELECT timestamp_floor('15m', ts) as time_bucket,
       symbol,
       avg(price)                 as avg_price,
       min(price)                 as min_price,
       max(price)                 as max_price
FROM trades
WHERE ts >= dateadd('d', -1, now())
GROUP BY time_bucket, symbol
ORDER BY time_bucket, symbol
```

## Troubleshooting

### Connection Issues

If you have trouble connecting to QuestDB:

1. Verify that QuestDB is running and the PGWire port (8812) is accessible.
2. Check that the connection parameters (host, port, user, password) are correct.
3. Ensure that you're handling the connection object correctly by spawning it on a separate task.
4. Check if the QuestDB server logs show any connection errors.

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists.
2. Check the syntax of your SQL query.
3. Ensure that you're using the correct data types for parameters, especially with timestamp types.
4. Look for any unsupported PostgreSQL features that might be causing issues.

### Parameter Binding Issues

There have been reports of issues with binding parameters for timestamp types:

1. Try using string literals for timestamps instead of binding parameters.
2. Ensure that you're using the correct chrono types (e.g., `DateTime<Utc>` or `NaiveDateTime`).
3. Check if your timestamp format is compatible with QuestDB.

## Conclusion

tokio-postgres provides a robust way to connect Rust applications to QuestDB through the PostgreSQL Wire Protocol. By
following the guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it
with various Rust applications.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST BY`, provide powerful tools for analyzing
time-series data that can be easily accessed through tokio-postgres.