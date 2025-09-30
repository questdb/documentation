---
title: R PGwire Guide
description:
  R clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with R for querying data.
---

QuestDB is tested with the following R client:

- [RPostgres](https://rpostgres.r-dbi.org/) with [DBI](https://dbi.r-dbi.org/)

Other R clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

### Performance Considerations

QuestDB is a high-performance database. The PGWire protocol has many flavors, and some of them are not optimized
for performance. For best performance when querying data from QuestDB with R, we recommend using RPostgres with the DBI
interface.

:::tip

For data ingestion, we recommend using QuestDB's first-party clients with
the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/) instead of PGWire. PGWire should primarily be used for
querying data in QuestDB.

:::

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
- Support for parameterized queries

### Installation

Install the required packages from CRAN:

```
install.packages(c("RPostgres", "DBI"), repos = "https://cloud.r-project.org")
```

### Basic Connection

Here's a basic example of connecting to QuestDB using RPostgres:

```
library(RPostgres)
library(DBI)

con <- dbConnect(
  Redshift(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

if (dbIsValid(con)) {
  cat("Successfully connected to QuestDB!\n")

  version <- dbGetQuery(con, "SELECT version()")
  print(version)

  dbDisconnect(con)
} else {
  cat("Failed to connect to QuestDB.\n")
}
```

:::note

When connecting to QuestDB with RPostgres, use `Redshift()` instead of `Postgres()` as the connection method. QuestDB
implements a subset of the PostgreSQL wire protocol similar to Amazon Redshift. Using the `Redshift()` configuration
instructs RPostgres to avoid PostgreSQL-specific features that QuestDB doesn't support, improving compatibility.

:::

### Querying Data

RPostgres with DBI provides several functions for executing queries:

```
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Redshift(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

trades <- dbGetQuery(con, "SELECT * FROM public.trades LIMIT 10")
print(trades)

# Close the connection
dbDisconnect(con)
```

### Parameterized Queries

Using parameterized queries helps prevent SQL injection and improves code readability:

```
library(RPostgres)
library(DBI)

con <- dbConnect(
  Redshift(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

symbol <- "BTC-USD"
limit_rows <- 10

# Method 1: Using parameter substitution (safest approach)
query <- "SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp DESC LIMIT $2"
trades <- dbGetQuery(con, query, params = list(symbol, limit_rows))
print(trades)

# Method 2: Using glue_sql from glue package (if installed)
if (requireNamespace("glue", quietly = TRUE)) {
  library(glue)
  query <- glue_sql("SELECT * FROM trades WHERE symbol = {symbol} ORDER BY timestamp DESC LIMIT {as.integer(limit_rows)}",
                    .con = con)
  trades2 <- dbGetQuery(con, query)
  print(trades2)
}

# Close the connection
dbDisconnect(con)
```

### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with RPostgres:

```
library(RPostgres)
library(DBI)

# Connect to QuestDB
con <- dbConnect(
  Redshift(),
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
    timestamp,
    symbol,
    avg(price) as avg_price,
    min(price) as min_price,
    max(price) as max_price
  FROM trades
  WHERE timestamp >= dateadd('d', -7000, now())
  SAMPLE BY 1h
")
print(head(sampled_data))

# LATEST ON query (last value per group)
cat("\nExecuting LATEST ON query...\n")
latest_data <- dbGetQuery(con, "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol")
print(latest_data)

# Close the connection
dbDisconnect(con)
```

### Integration with Popular R Packages

Here's how to integrate QuestDB with popular R analysis packages:

```
library(RPostgres)
library(DBI)
library(dplyr)
library(ggplot2)

# Connect to QuestDB
con <- dbConnect(
  Redshift(),
  dbname = "qdb",
  host = "localhost",
  port = 8812,
  user = "admin",
  password = "quest"
)

# Fetch hourly sampled price data
hourly_prices <- dbGetQuery(con, "
  SELECT
    timestamp,
    symbol,
    avg(price) as avg_price
  FROM trades
  WHERE timestamp >= dateadd('d', -30, now())
    AND symbol IN ('BTC-USD', 'ETH-USD')
  SAMPLE BY 1h
")

# Process data with dplyr
processed_data <- hourly_prices %>%
  mutate(
    date = as_date(timestamp),
    hour = hour(timestamp)
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
p <- ggplot(hourly_prices, aes(x = timestamp, y = avg_price, color = symbol)) +
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
4. **Optimize Queries**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST ON` for
   efficient queries.
5. **Pre-filter Data**: Perform filtering in SQL rather than in R when possible.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with RPostgres:

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

## Conclusion

RPostgres with DBI provides a robust way to connect R applications to QuestDB through the PostgreSQL Wire Protocol. By
following the guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it
with R's powerful data analysis and visualization capabilities.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST ON`, provide powerful tools for analyzing
time-series data that can be easily accessed through R.
