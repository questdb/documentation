---
title: Rust PGWire Guide
description:
  Rust clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Rust for querying data.
---

import HighlyAvailableReads from "../../partials/pgwire/_highly_available_reads.partial.mdx"
import KnownLimitations from "../../partials/pgwire/_known_limitations.partial.mdx"
import ConnectionIssues from "../../partials/pgwire/_connection_issues.partial.mdx"
import QueryErrors from "../../partials/pgwire/_query_errors.partial.mdx"
import TimestampConfusion from "../../partials/pgwire/_timestamp_confusion.partial.mdx"


QuestDB is tested with the following Rust client:

- [tokio-postgres](https://crates.io/crates/tokio-postgres)

Other Rust clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

### Performance Considerations

QuestDB is a high-performance database. The PGWire protocol has many flavors, and some of them are not optimized
for performance. For best performance when querying data from QuestDB with Rust, we recommend using tokio-postgres with
connection pooling.

:::tip

For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)](/docs/ingestion/overview/)
instead of PGWire. PGWire should primarily be used for querying data in QuestDB. QuestDB provides an
official [Rust client](/docs/ingestion/clients/rust/) for data ingestion using ILP.

:::

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

### Installation

To use tokio-postgres in your Rust project, add the following dependencies to your `Cargo.toml`:

```
[dependencies]
tokio = { version = "1.28", features = ["full"] }
tokio-postgres = {  version = "0.7.9", features = ["with-chrono-0_4"] }
chrono = "0.4.40"
```

For TLS connectivity with QuestDB Enterprise, add one of these optional dependency sets to your project:

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
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

    // Spawn a background task that keeps the connection alive for its entire lifetime
    // This task will terminate only when the connection closes
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
use chrono::{DateTime, NaiveDateTime, Utc};
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let into_utc = |timestamp: NaiveDateTime| DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc);
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });

    let rows = client.query("SELECT * FROM trades LIMIT 10", &[]).await?;

    println!("Recent trades:");
    for row in rows {
        let timestamp: NaiveDateTime = row.get("timestamp");
        let timestamp_utc = into_utc(timestamp);
        let symbol: &str = row.get("symbol");
        let price: f64 = row.get("price");

        println!("Time: {}, Symbol: {}, Price: {:.2}", timestamp_utc, symbol, price);
    }

    Ok(())
}
```

:::note

Note: Time in QuestDB is always in UTC. When using the `postgres` or `tokio-postgres` crates, the timezone is not sent
over the wire. As such you need to first extract timestamp fields as `chrono::NaiveDateTime` (in other words, void of
timezone information) and then convert them to `chrono::DateTime<Utc>`.

:::

### Parameterized Queries

Using parameterized queries helps prevent SQL injection and can improve performance for repeated queries:

```rust
use tokio_postgres::{NoTls, Error};
use chrono::{Utc, Duration, NaiveDateTime, DateTime};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let into_utc = |timestamp: NaiveDateTime| DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc);
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });

    let symbol = "BTC-USD";
    let start_time = Utc::now() - Duration::days(7); // 7 days ago

    let rows = client.query(
        "SELECT * FROM trades WHERE symbol = $1 AND timestamp >= $2 ORDER BY timestamp DESC LIMIT 10",
        &[&symbol, &start_time.naive_utc()], // note the conversion to naive UTC
    ).await?;

    println!("Recent {} trades:", symbol);
    for row in rows {
        let timestamp: DateTime<Utc> = into_utc(row.get("timestamp"));
        let price: f64 = row.get("price");

        println!("Time: {}, Price: {:.2}", timestamp, price);
    }

    Ok(())
}
```

Note: When binding parameters related to timestamps you must use `chrono::NaiveDateTime` to
represent the timestamp in UTC.

### Prepared Statements

For queries that will be executed multiple times with different parameters, you can use prepared statements:

```rust
use chrono::{DateTime, NaiveDateTime, Utc};
use tokio_postgres::{NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let into_utc = |timestamp: NaiveDateTime| DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc);
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });

    let statement = client.prepare(
        "SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp DESC LIMIT $2"
    ).await?;

    let symbols = vec!["BTC-USD", "ETH-USD", "SOL-USD"];

    for symbol in symbols {
        let rows = client.query(&statement, &[&symbol, &5i64]).await?;

        println!("\nRecent {} trades:", symbol);
        for row in rows {
            let timestamp: DateTime<Utc> = into_utc(row.get("timestamp"));
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
            timestamp: DateTime::from_naive_utc_and_offset(row.get("timestamp"), Utc),
            symbol: row.get("symbol"),
            price: row.get("price"),
            amount: row.get("amount"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let connection_string = "host=localhost port=8812 user=admin password=quest dbname=qdb";
    let (client, connection) = tokio_postgres::connect(connection_string, NoTls).await?;

    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("Connection error: {}", e);
        }
    });

    let rows = client.query("SELECT * FROM trades LIMIT 10", &[]).await?;

    let trades: Vec<Trade> = rows.into_iter()
        .map(Trade::from)
        .collect();

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

```
[dependencies]
bb8 = "0.8.1"
bb8-postgres = "0.8.1"
```

Then, implement connection pooling:

```rust
use bb8::{Pool, PooledConnection};
use bb8_postgres::PostgresConnectionManager;
use chrono::{DateTime, NaiveDateTime, Utc};
use tokio_postgres::{config::Config, NoTls, Error};

#[tokio::main]
async fn main() -> Result<(), Error> {
    let mut config = Config::new();
    config
        .host("localhost")
        .port(8812)
        .user("admin")
        .password("quest")
        .dbname("qdb");

    let manager = PostgresConnectionManager::new(config, NoTls);

    let pool = Pool::builder()
        .max_size(15)
        .build(manager)
        .await
        .expect("Failed to create pool");

    async fn execute_query(conn: &PooledConnection<'_, PostgresConnectionManager<NoTls>>, symbol: &str) -> Result<(), Error> {
        let into_utc = |timestamp: NaiveDateTime| DateTime::<Utc>::from_naive_utc_and_offset(timestamp, Utc);

        let rows = conn.query(
            "SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp DESC LIMIT 5",
            &[&symbol],
        ).await?;

        // Note: Concurrent query executions race to write to stdout, a shared global resource.
        // This means their output might be inter-leaved as tasks execute independently.
        // In a real application, you would typically collect results from all tasks
        // before presentation, or send them to a dedicated logging/processing component,
        // rather than directly printing from each concurrent task.
        println!("\nRecent {} trades:", symbol);
        for row in rows {
            let timestamp: DateTime<Utc> = into_utc(row.get("timestamp"));
            let price: f64 = row.get("price");

            println!("Time: {}, Price: {:.2}", timestamp, price);
        }

        Ok(())
    }

    let symbols = vec!["BTC-USD", "ETH-USD", "SOL-USD"];
    let mut handles = vec![];

    for symbol in symbols {
        let symbol_clone = symbol.to_string();
        let pool = pool.clone();
        let handle = tokio::spawn(async move {
            // note: using unwrap for simplicity, do not use in production code!
            let conn: PooledConnection<PostgresConnectionManager<NoTls>> = pool.get().await.unwrap();
            if let Err(e) = execute_query(&conn, &symbol_clone).await {
                eprintln!("Query error for {}: {}", symbol_clone, e);
            }
        });

        handles.push(handle);
    }

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
use chrono::{DateTime, NaiveDateTime, Utc};

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

fn utc_datetime_from_naive(timestamp: NaiveDateTime) -> DateTime<Utc> {
    DateTime::from_naive_utc_and_offset(timestamp, Utc)
}

impl From<Row> for SampledData {
    fn from(row: Row) -> Self {
        Self {
            timestamp: utc_datetime_from_naive(row.get("timestamp")),
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
            timestamp: utc_datetime_from_naive(row.get("timestamp")),
            symbol: row.get("symbol"),
            price: row.get("price"),
            amount: row.get("amount"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
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
            timestamp,
            symbol,
            avg(price) as avg_price,
            min(price) as min_price,
            max(price) as max_price
        FROM trades
        WHERE timestamp >= dateadd('d', -7, now())
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

    // LATEST ON query (last value per group)
    println!("\nLatest trades by symbol:");
    let latest_by_query = "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol";

    let rows = client.query(latest_by_query, &[]).await?;
    let latest_trades: Vec<LatestTrade> = rows.into_iter()
        .map(LatestTrade::from)
        .collect();

    for trade in latest_trades {
        println!(
            "Symbol: {}, Latest Price: {:.2}, Amount: {} at {}",
            trade.symbol, trade.price, trade.amount, trade.timestamp
        );
    }

    Ok(())
}
```


### Known Limitations with QuestDB

When using tokio-postgres with QuestDB, be aware of these limitations:

1. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
2. **Type System Differences**: QuestDB's type system differs from PostgreSQL's, which can lead to incompatibilities in
   certain situations. `NaiveDateTime` vs `DateTime<Utc>` is a common issue. See examples above how to handle this.
3. **PostgreSQL-Specific Features**: Some PostgreSQL features like temporary tables or indexes are not
   supported in QuestDB.

### Performance Tips

1. **Use Connection Pooling**: Libraries like bb8 or deadpool can help manage connections efficiently.
2. **Prepared Statements**: Use prepared statements for queries that are executed frequently.
3. **Async/Await**: Take advantage of the asynchronous nature of tokio-postgres to handle multiple operations
   concurrently.
4. **Batching**: Batch related queries together when possible to reduce network overhead.
5. **Query Optimization**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST ON` for
   efficient queries.
6. **Limit Result Sets**: When dealing with large datasets, use appropriate limits to avoid transferring excessive data.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with tokio-postgres:

### SAMPLE BY Queries

SAMPLE BY is used for time-based downsampling:

```questdb-sql title="Sample By 1 Hour" demo
SELECT timestamp,
       symbol,
       avg(price) as avg_price,
       min(price) as min_price,
       max(price) as max_price
FROM trades
WHERE timestamp >= dateadd('d', -7, now()) SAMPLE BY 1h;
```

### LATEST ON Queries

LATEST ON is an efficient way to get the most recent values:

```questdb-sql title="LATEST Rows Per Symbol" demo
SELECT *
FROM trades
WHERE timestamp IN today()
LATEST ON timestamp PARTITION BY symbol;
```

<HighlyAvailableReads />

<KnownLimitations />

## Troubleshooting

<ConnectionIssues />

You might also want to ensure that you're handling the connection object correctly by spawning it on a separate task.

<QueryErrors />
<TimestampConfusion />

### Parameter Binding Issues

There have been reports of issues with binding parameters for timestamp types:

1. Ensure that you're using the correct chrono types (e.g., `DateTime<Utc>` or `NaiveDateTime`).
2. Try using string literals for timestamps instead of binding parameters.
3. Check if your timestamp format is compatible with QuestDB.

## Conclusion

tokio-postgres provides a robust way to connect Rust applications to QuestDB through the PostgreSQL Wire Protocol. By
following the guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it
with various Rust applications.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST ON`, provide powerful tools for analyzing
time-series data that can be easily accessed through tokio-postgres.
