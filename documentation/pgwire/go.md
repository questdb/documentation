---
title: Go PGWire Guide
description:
  Go clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Go for querying data. 
---

QuestDB is tested with the following Go client:

- [pgx](https://github.com/jackc/pgx) - A pure Go PostgreSQL driver and toolkit

Other Go clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

### Performance Considerations

QuestDB is a high-performance database. The PGWire protocol has many flavors, and some of them are not optimized
for performance. For best performance when querying data from QuestDB with Go, we recommend using pgx.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB. QuestDB provides an
> official [Go client](/docs/clients/ingest-go/) for data ingestion using ILP.

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use standard
Go PostgreSQL clients with QuestDB's high-performance time-series database.

It's important to note that QuestDB's underlying storage model differs from PostgreSQL's, which means some PostgreSQL
features may not be available in QuestDB.

## Connection Parameters

The pgx client needs the following connection parameters to connect to QuestDB:

- **Host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **Port**: The PostgreSQL wire protocol port (default: `8812`)
- **Username**: The username for authentication (default: `admin`)
- **Password**: The password for authentication (default: `quest`)
- **Database**: The database name (default: `qdb`)

## pgx - PostgreSQL Driver for Go

[pgx](https://github.com/jackc/pgx) is a pure Go PostgreSQL driver and toolkit. It provides more features and better
performance than the older `lib/pq` driver, which is now in maintenance mode.

### Features

- Supports both standard `database/sql` interface and a more powerful native interface
- Connection pooling with the pgxpool package
- Prepared statements and parameterized queries
- High performance with optimized binary protocol
- Context support for cancellation and timeouts
- Support for PostgreSQL-specific data types

### Installation

To use pgx in your Go project, you need to install it using Go modules:

```bash
# For the latest version (v5)
go get github.com/jackc/pgx/v5
```

### Basic Connection

pgx provides multiple ways to connect to QuestDB:

#### Direct Connection

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
)

func main() {
	// Connection string
	connString := "postgres://admin:quest@localhost:8812/qdb"
	
	// Create a context
	ctx := context.Background()
	
	// Connect to QuestDB
	conn, err := pgx.Connect(ctx, connString)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)
	
	// Verify connection
	err = conn.Ping(ctx)
	if err != nil {
		log.Fatalf("Unable to ping database: %v", err)
	}
	
	fmt.Println("Successfully connected to QuestDB!")
}
```

#### Using Connection Configuration

For more control over connection parameters:

```go
package main

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5"
	"log"
	"time"
)

func main() {
	// Create configuration
	config, err := pgx.ParseConfig("postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to parse config: %v", err)
	}

	config.ConnectTimeout = time.Second * 10

	// Connect with config
	ctx := context.Background()
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)

	fmt.Println("Successfully connected to QuestDB with custom configuration!")
}
```

### Querying Data

#### Simple Query

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
)

func main() {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)
	
	rows, err := conn.Query(ctx, "SELECT * FROM trades LIMIT 10")
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()
	
	for rows.Next() {
		// Create a map to hold the row data
		values, err := rows.Values()
		if err != nil {
			log.Fatalf("Error scanning row: %v", err)
		}
		
		// Print the row data
		fmt.Println(values)
	}
	
	if err := rows.Err(); err != nil {
		log.Fatalf("Error iterating rows: %v", err)
	}
}
```

#### Using Structured Data

For more type safety, you can scan results into structs:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

// Trade represents a row in the trades table
type Trade struct {
	Timestamp time.Time `db:"ts"`
	Symbol    string    `db:"symbol"`
	Price     float64   `db:"price"`
	Amount    float64   `db:"amount"`
}

func main() {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)
	
	// Execute a query
	rows, err := conn.Query(ctx, "SELECT ts, symbol, price, amount FROM trades LIMIT 10")
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()
	
	// Collect results
	var trades []Trade
	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Timestamp, &t.Symbol, &t.Price, &t.Amount); err != nil {
			log.Fatalf("Error scanning row: %v", err)
		}
		trades = append(trades, t)
	}
	
	// Check for errors from iterating over rows
	if err := rows.Err(); err != nil {
		log.Fatalf("Error iterating rows: %v", err)
	}
	
	// Print trades
	for _, t := range trades {
		fmt.Printf("Timestamp: %s, Symbol: %s, Price: %.2f, Amount: %.6f\n",
			t.Timestamp, t.Symbol, t.Price, t.Amount)
	}
}
```

### Parameterized Queries

Parameterized queries help prevent SQL injection and can improve performance:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)

	symbol := "BTC-USD"
	startTime := time.Now().Add(-7 * 24 * time.Hour) // 7 days ago

	rows, err := conn.Query(ctx,
		"SELECT ts, symbol, price, amount FROM trades WHERE symbol = $1 AND ts >= $2 ORDER BY ts DESC LIMIT 10",
		symbol, startTime)
	if err != nil {
		log.Fatalf("Query failed: %v", err)
	}
	defer rows.Close()

	fmt.Printf("Recent %s trades:\n", symbol)
	for rows.Next() {
		var ts time.Time
		var sym string
		var price, amount float64
		if err := rows.Scan(&ts, &sym, &price, &amount); err != nil {
			log.Fatalf("Error scanning row: %v", err)
		}
		fmt.Printf("  %s: Price: %.2f, Amount: %.6f\n", ts, price, amount)
	}

	if err := rows.Err(); err != nil {
		log.Fatalf("Error iterating rows: %v", err)
	}
}
```

### Connection Pooling

For applications that need to execute multiple queries concurrently, connection pooling is recommended:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	ctx := context.Background()

	poolConfig, err := pgxpool.ParseConfig("postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to parse pool config: %v", err)
	}

	poolConfig.MaxConns = 10
	poolConfig.MinConns = 1
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("Unable to ping database: %v", err)
	}

	symbols := []string{"BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD", "XRP-USD"}

	var wg sync.WaitGroup

	for _, symbol := range symbols {
		wg.Add(1)
		go func(sym string) {
			defer wg.Done()

			rows, err := pool.Query(ctx,
				"SELECT ts, price FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT 5",
				sym)
			if err != nil {
				log.Printf("Query failed for symbol %s: %v", sym, err)
				return
			}
			defer rows.Close()

			fmt.Printf("Latest trades for %s:\n", sym)
			for rows.Next() {
				var ts time.Time
				var price float64
				if err := rows.Scan(&ts, &price); err != nil {
					log.Printf("Error scanning row: %v", err)
					return
				}
				fmt.Printf("  %s: %.2f\n", ts, price)
			}

			if err := rows.Err(); err != nil {
				log.Printf("Error iterating rows: %v", err)
			}
			fmt.Println()
		}(symbol)
	}

	wg.Wait()
}

```


### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with pgx:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer conn.Close(ctx)

	// SAMPLE BY query (time-based downsampling)
	sampleByQuery := `
		SELECT 
			ts, 
			symbol, 
			avg(price) as avg_price, 
			min(price) as min_price, 
			max(price) as max_price 
		FROM trades 
		WHERE ts >= dateadd('d', -7, now()) 
		SAMPLE BY 1h
	`

	fmt.Println("Executing SAMPLE BY query...")
	rows, err := conn.Query(ctx, sampleByQuery)
	if err != nil {
		log.Fatalf("SAMPLE BY query failed: %v", err)
	}

	for rows.Next() {
		var ts time.Time
		var symbol string
		var avgPrice, minPrice, maxPrice float64
		if err := rows.Scan(&ts, &symbol, &avgPrice, &minPrice, &maxPrice); err != nil {
			log.Fatalf("Error scanning row: %v", err)
		}
		fmt.Printf("Time: %s, Symbol: %s, Avg Price: %.2f, Range: %.2f - %.2f\n",
			ts, symbol, avgPrice, minPrice, maxPrice)
	}
	rows.Close()

	// LATEST ON query (last value per group)
	fmt.Println("\nExecuting LATEST ON query...")
	latestByQuery := "SELECT ts, symbol, price, amount FROM trades LATEST ON ts PARTITION BY symbol"

	rows, err = conn.Query(ctx, latestByQuery)
	if err != nil {
		log.Fatalf("LATEST ON query failed: %v", err)
	}

	for rows.Next() {
		var ts time.Time
		var symbol string
		var price, amount float64
		// Add additional fields as needed based on your table structure
		if err := rows.Scan(&ts, &symbol, &price, &amount); err != nil {
			log.Fatalf("Error scanning row: %v", err)
		}
		fmt.Printf("Symbol: %s, Latest Price: %.2f at %s\n", symbol, price, ts)
	}
	rows.Close()
}
```

### Creating a Database Client

For larger applications, it's a good practice to create a reusable database client:

```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// QuestDBClient provides a simplified interface for interacting with QuestDB
type QuestDBClient struct {
	pool *pgxpool.Pool
}

// NewQuestDBClient creates a new QuestDB client with connection pooling
func NewQuestDBClient(ctx context.Context, connString string) (*QuestDBClient, error) {
	poolConfig, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("unable to parse connection string: %w", err)
	}

	poolConfig.MaxConns = 10
	poolConfig.MinConns = 1
	poolConfig.MaxConnLifetime = time.Hour
	poolConfig.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	return &QuestDBClient{pool: pool}, nil
}

func (c *QuestDBClient) Close() {
	if c.pool != nil {
		c.pool.Close()
	}
}

// GetRecentTrades fetches recent trades for a given symbol
func (c *QuestDBClient) GetRecentTrades(ctx context.Context, symbol string, limit int) ([]Trade, error) {
	query := `
		SELECT ts, symbol, price, amount 
		FROM trades 
		WHERE symbol = $1 
		ORDER BY ts DESC 
		LIMIT $2
	`

	rows, err := c.pool.Query(ctx, query, symbol, limit)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var trades []Trade
	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Timestamp, &t.Symbol, &t.Price, &t.Amount); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		trades = append(trades, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return trades, nil
}

// GetSampledData fetches downsampled price data
func (c *QuestDBClient) GetSampledData(ctx context.Context, symbol string, days int) ([]PriceSample, error) {
	query := `
		SELECT 
			ts, 
			symbol, 
			avg(price) as avg_price, 
			min(price) as min_price, 
			max(price) as max_price 
		FROM trades 
		WHERE symbol = $1 AND ts >= dateadd('d', $2, now()) 
		SAMPLE BY 1h
	`

	rows, err := c.pool.Query(ctx, query, symbol, -days)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var samples []PriceSample
	for rows.Next() {
		var s PriceSample
		if err := rows.Scan(&s.Timestamp, &s.Symbol, &s.AvgPrice, &s.MinPrice, &s.MaxPrice); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		samples = append(samples, s)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return samples, nil
}

// GetLatestPrices fetches the latest price for each symbol
func (c *QuestDBClient) GetLatestPrices(ctx context.Context) ([]Trade, error) {
	query := `SELECT ts, symbol, price, amount FROM trades LATEST ON ts PARTITION BY symbol`

	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var trades []Trade
	for rows.Next() {
		var t Trade
		if err := rows.Scan(&t.Timestamp, &t.Symbol, &t.Price, &t.Amount); err != nil {
			return nil, fmt.Errorf("scan failed: %w", err)
		}
		trades = append(trades, t)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	return trades, nil
}

type Trade struct {
	Timestamp time.Time
	Symbol    string
	Price     float64
	Amount    float64
}

type PriceSample struct {
	Timestamp time.Time
	Symbol    string
	AvgPrice  float64
	MinPrice  float64
	MaxPrice  float64
}

func main() {
	ctx := context.Background()

	client, err := NewQuestDBClient(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Failed to create QuestDB client: %v", err)
	}
	defer client.Close()

	// Get recent trades
	trades, err := client.GetRecentTrades(ctx, "BTC-USD", 5)
	if err != nil {
		log.Fatalf("Failed to get recent trades: %v", err)
	}

	fmt.Println("Recent BTC-USD trades:")
	for _, t := range trades {
		fmt.Printf("  %s: Price: %.2f, Amount: %.6f\n", t.Timestamp, t.Price, t.Amount)
	}

	// Get sampled data
	samples, err := client.GetSampledData(ctx, "BTC-USD", 1)
	if err != nil {
		log.Fatalf("Failed to get sampled data: %v", err)
	}

	fmt.Println("\nHourly BTC-USD price samples (last 24 hours):")
	for _, s := range samples {
		fmt.Printf("  %s: Avg: %.2f, Range: %.2f - %.2f\n",
			s.Timestamp, s.AvgPrice, s.MinPrice, s.MaxPrice)
	}

	// Get latest prices
	latestPrices, err := client.GetLatestPrices(ctx)
	if err != nil {
		log.Fatalf("Failed to get latest prices: %v", err)
	}

	fmt.Println("\nLatest prices for all symbols:")
	for _, t := range latestPrices {
		fmt.Printf("  %s: %.2f\n", t.Symbol, t.Price)
	}
}
```

### Using with a Web Server

Here's an example of integrating QuestDB with a Go HTTP server:

```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

// QuestDBClient, Trade and PriceSample as defined in the previous example
// ...

// API handlers
func main() {
	ctx := context.Background()

	// Create a database connection pool
	pool, err := pgxpool.New(ctx, "postgres://admin:quest@localhost:8812/qdb")
	if err != nil {
		log.Fatalf("Unable to create connection pool: %v", err)
	}
	defer pool.Close()

	client := &QuestDBClient{pool: pool}

	http.HandleFunc("/api/trades", func(w http.ResponseWriter, r *http.Request) {
		handleTrades(w, r, client)
	})

	http.HandleFunc("/api/sampled", func(w http.ResponseWriter, r *http.Request) {
		handleSampledData(w, r, client)
	})

	http.HandleFunc("/api/latest", func(w http.ResponseWriter, r *http.Request) {
		handleLatestPrices(w, r, client)
	})

	port := 8080
	fmt.Printf("Starting server on port %d...\n", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
}

func handleTrades(w http.ResponseWriter, r *http.Request, client *QuestDBClient) {
	// Parse query parameters
	symbol := r.URL.Query().Get("symbol")
	limitStr := r.URL.Query().Get("limit")

	if symbol == "" {
		symbol = "BTC-USD" // Default symbol
	}

	limit := 10 // Default
	if limitStr != "" {
		var err error
		limit, err = strconv.Atoi(limitStr)
		if err != nil || limit <= 0 {
			http.Error(w, "Invalid limit parameter", http.StatusBadRequest)
			return
		}
	}

	trades, err := client.GetRecentTrades(r.Context(), symbol, limit)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error fetching trades: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(trades); err != nil {
		http.Error(w, fmt.Sprintf("Error encoding response: %v", err), http.StatusInternalServerError)
	}
}

func handleSampledData(w http.ResponseWriter, r *http.Request, client *QuestDBClient) {
	symbol := r.URL.Query().Get("symbol")
	if symbol == "" {
		http.Error(w, "Symbol parameter is required", http.StatusBadRequest)
		return
	}

	daysStr := r.URL.Query().Get("days")
	days := 7 // Default
	if daysStr != "" {
		var err error
		days, err = strconv.Atoi(daysStr)
		if err != nil || days <= 0 {
			http.Error(w, "Invalid days parameter", http.StatusBadRequest)
			return
		}
	}

	samples, err := client.GetSampledData(r.Context(), symbol, days)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error fetching sampled data: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(samples); err != nil {
		http.Error(w, fmt.Sprintf("Error encoding response: %v", err), http.StatusInternalServerError)
	}
}

func handleLatestPrices(w http.ResponseWriter, r *http.Request, client *QuestDBClient) {
	latestPrices, err := client.GetLatestPrices(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf("Error fetching latest prices: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(latestPrices); err != nil {
		http.Error(w, fmt.Sprintf("Error encoding response: %v", err), http.StatusInternalServerError)
	}
}
```

### Known Limitations with QuestDB

When using pgx with QuestDB, be aware of these limitations:

1. **Cursor Support**: QuestDB does not support scrollable cursors that require explicit creation and management through
   `DECLARE CURSOR` and subsequent operations.
2. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
3. **Schema Management**: QuestDB's table creation and schema modification capabilities differ from PostgreSQL.


### Performance Tips
1. **Use Connection Pooling**: For applications with multiple concurrent queries, use connection pooling through the
   `pgxpool` package.
2. **Prepared Statements**: Use prepared statements for queries that are executed multiple times to improve performance.
3. **Batch Operations**: When possible, batch operations together to reduce network overhead.
4. **Transaction Management**: Be mindful of QuestDB's transaction semantics when using transactions.
5. **Optimize Queries**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST ON` for
   efficient queries.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with pgx:

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

### LATEST ON Queries

LATEST ON is an efficient way to get the most recent values:

```sql
SELECT *
FROM trades LATEST ON timestamp PARTITION BY symbol
```

## Troubleshooting

### Connection Issues

If you have trouble connecting to QuestDB:

1. Verify that QuestDB is running and the PGWire port (8812) is accessible.
2. Check that the connection parameters (host, port, user, password) are correct.
3. Make sure your network allows connections to the QuestDB server.
4. Check if the QuestDB server logs show any connection errors.

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists.
2. Check the syntax of your SQL query.
3. Ensure that you're using the correct data types for parameters.
4. Look for any unsupported PostgreSQL features that might be causing issues.

## Conclusion

pgx provides a robust way to connect Go applications to QuestDB through the PostgreSQL Wire Protocol. By following the
guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it with various
Go applications.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST ON`, provide powerful tools for analyzing
time-series data that can be easily accessed through pgx.