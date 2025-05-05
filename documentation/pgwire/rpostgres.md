---
title: R clients
description:
  R clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with R for querying data. 
---

QuestDB is tested with the following R client:

- [RPostgres](https://rpostgres.r-dbi.org/) with [DBI](https://dbi.r-dbi.org/)

Other R clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. For best performance when querying data from QuestDB with
R, we recommend using RPostgres with the DBI interface.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB.

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use standard
R PostgreSQL clients with QuestDB's high-performance time-series database.

It's important to note that QuestDB's underlying storage model differs from PostgreSQL's, which means some PostgreSQL
features may not be available in QuestDB.

## Connection Parameters

The RPostgres client needs the following connection parameters to connect to QuestDB:

- **host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **port**: The PostgreSQL wire protocol port (default: `8812`)
- **user**: The username for authentication (default: `admin`)
- **password**: The password for authentication (default: `quest`)
- **dbname**: The database name (default: `qdb`)

## RPostgres with DBI

[RPostgres](https://rpostgres.r-dbi.org/) is a modern DBI-compliant database backend for R that connects to PostgreSQL.
It uses the DBI interface for a consistent workflow with other database types in R.

### Features

- DBI compliance for consistent database programming in R
- Support for PostgreSQL data types
- Connection pooling capabilities
- Efficient data transfer
- Support for parameterized queries
- Comprehensive error handling
- Integration with R's data.frame objects

### Installation

Install the required packages from CRAN:

```r
install.packages(c("RPostgres", "DBI"), repos = "https://cloud.r-project.org")
```

### Basic Connection

Here's a basic example of connecting to QuestDB using RPostgres:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Check connection
if (dbIsValid(con)) {
  cat("Successfully connected to QuestDB!\n")
  
  # Get server version
  version <- dbGetQuery(con, "SELECT version()")
  print(version)
  
  # Close connection
  dbDisconnect(con)
} else {
  cat("Failed to connect to QuestDB.\n")
}
```

### Querying Data

RPostgres with DBI provides several functions for executing queries:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Execute a simple query to fetch all rows
trades <- dbGetQuery(con, "SELECT * FROM trades LIMIT 10")
print(trades)

# Check table existence
table_exists <- dbExistsTable(con, "trades")
cat("Table 'trades' exists:", table_exists, "\n")

# List available tables
tables <- dbListTables(con)
print(tables)

# Get table fields
if ("trades" %in% tables) {
  fields <- dbListFields(con, "trades")
  print(fields)
}

# Close the connection
dbDisconnect(con)
```

### Parameterized Queries

Using parameterized queries helps prevent SQL injection and improves code readability:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Parameters
symbol <- "BTC-USD"
limit_rows <- 10

# Method 1: Using parameter substitution (safest approach)
query <- "SELECT * FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT $2"
trades <- dbGetQuery(con, query, params = list(symbol, limit_rows))
print(trades)

# Method 2: Using glue_sql from glue package (if installed)
if (requireNamespace("glue", quietly = TRUE)) {
  library(glue)
  query <- glue_sql("SELECT * FROM trades WHERE symbol = {symbol} ORDER BY ts DESC LIMIT {limit_rows}", 
                   .con = con)
  trades2 <- dbGetQuery(con, query)
  print(trades2)
}

# Close the connection
dbDisconnect(con)
```

### Creating and Modifying Tables

Here's how to create, insert data, and query a table in QuestDB:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Drop table if it exists
dbExecute(con, "DROP TABLE IF EXISTS r_test")

# Create a table with timestamp
dbExecute(con, "CREATE TABLE r_test(n int, ts timestamp) timestamp(ts) partition by hour")

# Insert data
dbExecute(con, "INSERT INTO r_test VALUES (1, '2023-01-01T10:00:00')")
dbExecute(con, "INSERT INTO r_test VALUES (2, '2023-01-01T11:00:00')")
dbExecute(con, "INSERT INTO r_test VALUES (3, '2023-01-01T12:00:00')")

# Wait for WAL to ensure data is written
dbExecute(con, "SELECT wait_wal_table('r_test')")

# Query the data
result <- dbGetQuery(con, "SELECT * FROM r_test")
print(result)

# Close the connection
dbDisconnect(con)
```

### Working with Data Frames

You can easily work with R data frames, which is one of the most powerful features for data analysis:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Create some data
data <- data.frame(
  symbol = c("BTC-USD", "ETH-USD", "SOL-USD"),
  price = c(50000, 2000, 100),
  ts = as.POSIXct(c("2023-01-01", "2023-01-02", "2023-01-03"), tz = "UTC")
)

# Write data frame to database
dbWriteTable(con, "r_test_prices", data, temporary = FALSE, overwrite = TRUE)

# Wait for WAL
dbExecute(con, "SELECT wait_wal_table('r_test_prices')")

# Read data back
prices <- dbReadTable(con, "r_test_prices")
print(prices)

# Append more data to the table
new_data <- data.frame(
  symbol = c("XRP-USD", "ADA-USD"),
  price = c(0.5, 0.3),
  ts = as.POSIXct(c("2023-01-04", "2023-01-05"), tz = "UTC")
)

dbWriteTable(con, "r_test_prices", new_data, append = TRUE)
dbExecute(con, "SELECT wait_wal_table('r_test_prices')")

# Verify the data was appended
all_prices <- dbReadTable(con, "r_test_prices")
print(all_prices)

# Close the connection
dbDisconnect(con)
```

### Connection Pooling with Pool Package

For applications that need multiple database connections, you can use the pool package:

```r
library(RPostgres)
library(DBI)
library(pool)

# Create a connection pool
pool <- dbPool(
  drv = Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest",
  minSize = 2,
  maxSize = 10,
  idleTimeout = 60 * 60 * 1000 # 1 hour
)

# Function to execute a query using a connection from the pool
query_data <- function(symbol) {
  query <- paste0("SELECT * FROM trades WHERE symbol = '", symbol, "' LIMIT 5")
  result <- dbGetQuery(pool, query)
  return(result)
}

# Use the pool to execute multiple queries
symbols <- c("BTC-USD", "ETH-USD", "SOL-USD")
results <- lapply(symbols, query_data)

names(results) <- symbols
print(results)

# Close all connections in the pool
poolClose(pool)
```

### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with RPostgres:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# SAMPLE BY query (time-based downsampling)
cat("Executing SAMPLE BY query...\n")
sampled_data <- dbGetQuery(con, "
  SELECT 
    ts, 
    symbol, 
    avg(price) as avg_price, 
    min(price) as min_price, 
    max(price) as max_price 
  FROM trades 
  WHERE ts >= dateadd('d', -7, now()) 
  SAMPLE BY 1h
")
print(head(sampled_data))

# LATEST BY query (last value per group)
cat("\nExecuting LATEST BY query...\n")
latest_data <- dbGetQuery(con, "SELECT * FROM trades LATEST BY symbol")
print(latest_data)

# Close the connection
dbDisconnect(con)
```

### Integration with Popular R Packages

Here's how to integrate QuestDB with popular R analysis packages:

```r
library(RPostgres)
library(DBI)
library(dplyr)
library(lubridate)
library(ggplot2)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Fetch hourly sampled price data
hourly_prices <- dbGetQuery(con, "
  SELECT 
    ts, 
    symbol, 
    avg(price) as avg_price
  FROM trades 
  WHERE ts >= dateadd('d', -30, now()) 
    AND symbol IN ('BTC-USD', 'ETH-USD')
  SAMPLE BY 1h
")

# Process data with dplyr
processed_data <- hourly_prices %>%
  mutate(
    date = as_date(ts),
    hour = hour(ts)
  ) %>%
  group_by(symbol, date) %>%
  summarize(
    daily_avg = mean(avg_price),
    daily_min = min(avg_price),
    daily_max = max(avg_price),
    volatility = daily_max - daily_min,
    .groups = 'drop'
  )

print(head(processed_data))

# Create a plot with ggplot2
p <- ggplot(hourly_prices, aes(x = ts, y = avg_price, color = symbol)) +
  geom_line() +
  labs(
    title = "Cryptocurrency Prices - 30 Day History",
    x = "Date",
    y = "Price (USD)",
    color = "Symbol"
  ) +
  theme_minimal()

print(p)

# Close the connection
dbDisconnect(con)
```


### Known Limitations with QuestDB

When using RPostgres with QuestDB, be aware of these limitations:

1. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
2. **Schema Management**: QuestDB's table creation and schema modification capabilities differ from PostgreSQL.
3. **R-Specific Data Types**: Some R data types might not map directly to QuestDB types.
4. **Time Zone Handling**: Be careful with time zone conversions, as R and QuestDB might handle them differently.


### Performance Tips

1. **Use RPostgres**: RPostgres is generally faster than older R PostgreSQL drivers.
2. **Limit Result Sets**: When working with large datasets, use LIMIT clauses to avoid memory issues in R.
3. **Parameterized Queries**: Use parameterized queries for better security and performance.
4. **Optimize Queries**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST BY` for
   efficient queries.
5. **Pre-filter Data**: Perform filtering in SQL rather than in R when possible.
6. **Use dbExecute for Non-SELECT Queries**: For operations that don't return data (INSERT, UPDATE, etc.), use dbExecute
   instead of dbGetQuery.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with RPostgres:

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
3. Ensure that your R installation has all required packages installed.
4. Check if the QuestDB server logs show any connection errors.

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists using `dbListTables()`.
2. Check the syntax of your SQL query.
3. Ensure that you're using the correct data types for parameters.
4. Look for any unsupported PostgreSQL features that might be causing issues.

### Data Type Issues

For data type-related problems:

1. Use `str()` to check the structure of your R data frames.
2. Ensure date and timestamp columns are properly converted using `as.POSIXct()`.
3. For numeric columns, verify that values are not being converted to characters.

## Complete Example

Here's a complete example that demonstrates creating a table, inserting data, and performing time-series queries:

```r
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Postgres(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Create a test table
dbExecute(con, "DROP TABLE IF EXISTS r_test_sensor;")
dbExecute(con, "CREATE TABLE r_test_sensor(sensor_id symbol, value double, ts timestamp) timestamp(ts) partition by day;")

# Generate some test data
set.seed(123)
n <- 1000
start_time <- as.POSIXct("2023-01-01", tz = "UTC")
sensor_data <- data.frame(
  sensor_id = rep(c("sensor1", "sensor2", "sensor3"), each = n/3),
  value = rnorm(n, mean = 25, sd = 5),
  ts = start_time + sort(sample(0:(86400*30), n)) # Random times within 30 days
)

# Insert data in batches
batch_size <- 100
batches <- split(sensor_data, ceiling(seq_along(sensor_data$sensor_id)/batch_size))

for (i in seq_along(batches)) {
  dbWriteTable(con, "r_test_sensor", batches[[i]], append = TRUE)
  if (i %% 5 == 0) {
    cat("Inserted", i * batch_size, "rows\n")
  }
}

# Wait for WAL
dbExecute(con, "SELECT wait_wal_table('r_test_sensor')")

# Count the inserted rows
count <- dbGetQuery(con, "SELECT COUNT(*) FROM r_test_sensor")
cat("Total rows inserted:", count[[1]], "\n")

# Perform time-series queries
cat("\nSample by hourly averages:\n")
hourly <- dbGetQuery(con, "
  SELECT 
    sensor_id,
    ts,
    avg(value) as avg_value,
    min(value) as min_value,
    max(value) as max_value,
    count(*) as sample_count
  FROM r_test_sensor
  SAMPLE BY 1h
")
print(head(hourly))

cat("\nLatest values by sensor:\n")
latest <- dbGetQuery(con, "SELECT * FROM r_test_sensor LATEST BY sensor_id")
print(latest)

cat("\nDaily aggregates:\n")
daily <- dbGetQuery(con, "
  SELECT 
    sensor_id,
    timestamp_floor('1d', ts) as day,
    avg(value) as daily_avg,
    min(value) as daily_min,
    max(value) as daily_max,
    count(*) as daily_count
  FROM r_test_sensor
  GROUP BY sensor_id, day
  ORDER BY day, sensor_id
")
print(head(daily))

# Clean up
dbExecute(con, "DROP TABLE IF EXISTS r_test_sensor;")

# Close the connection
dbDisconnect(con)
```

## Conclusion

RPostgres with DBI provides a robust way to connect R applications to QuestDB through the PostgreSQL Wire Protocol. By
following the guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it
with R's powerful data analysis and visualization capabilities.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST BY`, provide powerful tools for analyzing
time-series data that can be easily accessed through R.