---
title: JavaScript PGWire Guide
description:
  JavaScript clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with JavaScript for querying data. 
---

QuestDB is tested with the following JavaScript clients:

- [pg](https://www.npmjs.com/package/pg)
- [postgres](https://www.npmjs.com/package/postgres)

Other JavaScript clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. Our recommendation is to use the `pg` client for most use
cases as it's well-supported with QuestDB.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)]((/docs/ingestion-overview/))
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB.


## Connection Parameters

All JavaScript PostgreSQL clients need similar connection parameters to connect to QuestDB:

```javascript
const CONNECTION_PARAMS = {
    host: '127.0.0.1',
    port: 8812,      // Default PGWire port for QuestDB
    user: 'admin',
    password: 'quest',
    database: 'qdb'
}
```

## pg (node-postgres)

[pg](https://www.npmjs.com/package/pg) (also known as node-postgres) is a collection of Node.js modules for interfacing
with PostgreSQL databases. It's a widely used library that offers both callback and Promise-based interfaces.

### Features

- Support for callbacks and Promises
- Connection pooling
- Prepared statements
- Parameterized queries
- Cursor support for large result sets

### Installation

```bash
npm install pg
```

### Basic Connection

```javascript
const {Client} = require('pg')

// Create a new client
const client = new Client({
    host: '127.0.0.1',
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb'
})

// Connect to QuestDB
async function connect() {
    try {
        await client.connect()
        console.log('Connected to QuestDB')

        // Execute a simple query
        const result = await client.query('SELECT version()')
        console.log(`QuestDB version: ${result.rows[0].version}`)
    } catch (error) {
        console.error('Connection error:', error)
    } finally {
        // Close the connection
        await client.end()
    }
}

connect()
```

### Querying Data

The `pg` client provides several ways to execute queries:

```javascript
const {Client} = require('pg')
const client = new Client({
  host: '127.0.0.1',
  port: 8812,
  user: 'admin',
  password: 'quest',
  database: 'qdb',
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

async function queryData() {
  try {
    await client.connect()

    // Simple query
    const result = await client.query('SELECT * FROM trades LIMIT 10')

    console.log(`Fetched ${result.rows.length} rows`)
    console.log(`Column names: ${result.fields.map(field => field.name).join(', ')}`)

    // Process the results
    for (const row of result.rows) {
      console.log(`Timestamp: ${row.ts}, Symbol: ${row.symbol}, Price: ${row.price}`)
    }
  } catch (error) {
    console.error('Query error:', error)
  } finally {
    await client.end()
  }
}

queryData()
```

:::note
    **Note**: The `pg` client uses the system timezone by default. QuestDB always sends timestamp in UTC. 
    To set the timezone to UTC, you can set the `TZ` environment variable before running your script.
    This is important for time-series data to ensure consistent timestamps.
:::


### Parameterized Queries

The `pg` client supports parameterized queries using the `$1`, `$2`, etc. notation:

```javascript
const {Client} = require('pg')
const client = new Client({
  host: '127.0.0.1',
  port: 8812,
  user: 'admin',
  password: 'quest',
  database: 'qdb'
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

async function parameterizedQuery() {
  try {
    await client.connect()

    const symbol = 'BTC-USD'
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 7) // 7 days ago

    const result = await client.query(
            'SELECT * FROM trades WHERE symbol = $1 AND ts >= $2 ORDER BY ts DESC LIMIT 10',
            [symbol, startDate]
    )

    console.log(`Fetched ${result.rows.length} rows for ${symbol} since ${startDate}`)

    for (const row of result.rows) {
      console.log(`Timestamp: ${row.ts}, Price: ${row.price}`)
    }
  } catch (error) {
    console.error('Query error:', error)
  } finally {
    await client.end()
  }
}

parameterizedQuery()
```

### Prepared Statements

For queries that are executed repeatedly, you can use prepared statements to improve performance:

```javascript
const {Client} = require('pg')
const client = new Client({
  host: '127.0.0.1',
  port: 8812,
  user: 'admin',
  password: 'quest',
  database: 'qdb'
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

async function preparedStatement() {
  try {
    await client.connect()

    await client.query({
      name: 'get-trades-by-symbol',
      text: 'SELECT * FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT $2',
    })

    const symbols = ['BTC-USD', 'ETH-USD', 'SOL-USD']

    for (const symbol of symbols) {
      const result = await client.query({
        name: 'get-trades-by-symbol',
        values: [symbol, 5] // Get 5 most recent trades for each symbol
      })

      console.log(`\nLatest trades for ${symbol}:`)
      for (const row of result.rows) {
        console.log(`  ${row.ts}: ${row.price}`)
      }
    }
  } catch (error) {
    console.error('Prepared statement error:', error)
  } finally {
    await client.end()
  }
}

preparedStatement()
```

### Connection Pooling

For applications that need to handle multiple concurrent queries, connection pooling is recommended:

```javascript
const {Pool} = require('pg')

// Create a connection pool
const pool = new Pool({
  host: '127.0.0.1',
  port: 8812,
  user: 'admin',
  password: 'quest',
  database: 'qdb',
  max: 20,           // Maximum number of clients in the pool
  idleTimeoutMillis: 30000  // Close idle clients after 30 seconds
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

async function queryWithPool() {
  const client = await pool.connect()

  try {
    const result = await client.query('SELECT * FROM trades LIMIT 10')
    console.log(`Fetched ${result.rows.length} rows`)

    for (const row of result.rows) {
      console.log(row)
    }
  } catch (error) {
    console.error('Query error:', error)
  } finally {
    client.release()
  }
}

async function simplePoolQuery() {
  try {
    // This automatically acquires and releases a client
    const result = await pool.query('SELECT COUNT(*) FROM trades')
    console.log(`Total trades: ${result.rows[0].count}`)
  } catch (error) {
    console.error('Pool query error:', error)
  }
}

async function main() {
  try {
    await queryWithPool()
    await simplePoolQuery()
  } finally {
    await pool.end()
  }
}

main()
```

### Integration with Express.js

Here's an example of how to integrate `pg` with Express.js to create a simple API:

```javascript
const express = require('express')
const {Pool} = require('pg')

const app = express()
const port = 3000

const pool = new Pool({
    host: '127.0.0.1',
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb'
})

// Set the client timezone to UTC
process.env.TZ = 'UTC';

// Add middleware to parse JSON body
app.use(express.json())

// API endpoint to get recent trades
app.get('/api/trades', async (req, res) => {
    const {symbol, limit = 10} = req.query

    try {
        let query
        let params = []

        if (symbol) {
            query = 'SELECT * FROM trades WHERE symbol = $1 ORDER BY ts DESC LIMIT $2'
            params = [symbol, limit]
        } else {
            query = 'SELECT * FROM trades ORDER BY ts DESC LIMIT $1'
            params = [limit]
        }

        const result = await pool.query(query, params)
        res.json(result.rows)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

// API endpoint to get trade statistics
app.get('/api/stats', async (req, res) => {
    const {days = 7} = req.query

    try {
        const result = await pool.query(`
      SELECT 
        symbol,
        COUNT(*) as trade_count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM trades
      WHERE ts >= dateadd('d', -$1::int, now())
      GROUP BY symbol
      ORDER BY trade_count DESC
    `, [days])

        res.json(result.rows)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

app.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`)
})

process.on('SIGINT', async () => {
    await pool.end()
    console.log('Pool has ended')
    process.exit(0)
})
```

### Performance Tips

- Use connection pooling for applications with multiple concurrent queries
- Reuse prepared statements for frequently executed queries
- For large result sets, consider using cursors or limiting the result size
- Set an appropriate pool size based on your application's requirements
- Use parameterized queries to avoid SQL injection and improve performance

## postgres

[postgres](https://www.npmjs.com/package/postgres) (not to be confused with PostgreSQL itself) is a modern,
Promise-based PostgreSQL client for Node.js. It aims to be simple and powerful with a focus on PostgreSQL-specific
features.

### Features

- Promise-based API
- Connection pooling included
- Automatic type conversion
- Tagged template literals for queries
- TypeScript support

### Installation

```bash
npm install postgres
```

### Basic Connection

```javascript
const postgres = require('postgres')

const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false
})

async function connect() {
    try {
        // Execute a simple query
        const version = await sql`SELECT version()`
        console.log(`Connected to QuestDB version: ${version[0].version}`)
    } catch (error) {
        console.error('Connection error:', error)
    } finally {
        // Close all connections
        await sql.end()
    }
}

connect()
```

### Querying Data

The `postgres` client uses template literals for queries:

```javascript
const postgres = require('postgres')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false
})

async function queryData() {
    try {
        const trades = await sql`SELECT * FROM trades LIMIT 10`
        console.log(`Fetched ${trades.length} rows`)

        for (const trade of trades) {
            console.log(`Timestamp: ${trade.ts}, Symbol: ${trade.symbol}, Price: ${trade.price}`)
        }
    } catch (error) {
        console.error('Query error:', error)
    } finally {
        await sql.end()
    }
}

queryData()
```

### Parameterized Queries

The `postgres` client automatically parameterizes values passed in template literals:

```javascript
const postgres = require('postgres')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false
})

async function parameterizedQuery() {
    try {
        const symbol = 'BTC-USD'
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - 7) // 7 days ago

        // Parameters are automatically sanitized
        const trades = await sql`
      SELECT * FROM trades 
      WHERE symbol = ${symbol} 
        AND ts >= ${startDate} 
      ORDER BY ts DESC 
      LIMIT 10
    `

        console.log(`Fetched ${trades.length} rows for ${symbol} since ${startDate}`)

        for (const trade of trades) {
            console.log(`Timestamp: ${trade.ts}, Price: ${trade.price}`)
        }
    } catch (error) {
        console.error('Query error:', error)
    } finally {
        await sql.end()
    }
}

parameterizedQuery()
```

### Connection Pooling

The `postgres` client includes built-in connection pooling:

```javascript
const postgres = require('postgres')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

// Create a connection with custom pool settings
const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false,
    max: 10,               // Maximum number of connections
    idle_timeout: 30,      // Close idle connections after 30 seconds
    connect_timeout: 10    // Give up connecting after 10 seconds
})

async function concurrentQueries() {
    try {
        // Execute multiple queries concurrently
        const [tradeCount, symbols] = await Promise.all([
            sql`SELECT COUNT(*) FROM trades`,
            sql`SELECT DISTINCT symbol FROM trades`
        ])

        console.log(`Total trades: ${tradeCount[0].count}`)
        console.log(`Unique symbols: ${symbols.length}`)
    } catch (error) {
        console.error('Concurrent query error:', error)
    } finally {
        await sql.end()
    }
}

concurrentQueries()
```

### Integration with Express.js

Here's an example of how to integrate `postgres` with Express.js:

```javascript
const express = require('express')
const postgres = require('postgres')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

const app = express()
const port = 3000

const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false,
    max: 10
})

// Add middleware to parse JSON body
app.use(express.json())

// API endpoint to get recent trades
app.get('/api/trades', async (req, res) => {
    const {symbol, limit = 10} = req.query

    try {
        let trades

        if (symbol) {
            trades = await sql`
        SELECT * FROM trades 
        WHERE symbol = ${symbol} 
        ORDER BY ts DESC 
        LIMIT ${limit}
      `
        } else {
            trades = await sql`
        SELECT * FROM trades 
        ORDER BY ts DESC 
        LIMIT ${limit}
      `
        }

        res.json(trades)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

// API endpoint to get trade statistics
app.get('/api/stats', async (req, res) => {
    const {days = 7} = req.query

    try {
        const stats = await sql`
      SELECT 
        symbol,
        COUNT(*) as trade_count,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM trades
      WHERE ts >= dateadd('d', -${days}::int, now())
      GROUP BY symbol
      ORDER BY trade_count DESC
    `

        res.json(stats)
    } catch (error) {
        console.error('API error:', error)
        res.status(500).json({error: error.message})
    }
})

// Start the server
app.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`)
})

// Handle process termination
process.on('SIGINT', async () => {
    await sql.end()
    console.log('All connections closed')
    process.exit(0)
})
```

### Tips

- Use parameterized queries via tagged templates to prevent SQL injection
- For large result sets, use LIMIT and pagination
- Execute independent queries concurrently with `Promise.all()`
)

## Best Practices for QuestDB Time Series Queries

QuestDB provides specialized time-series functions that work well with JavaScript PGWire clients:

### Sample By Queries

```javascript
const {Client} = require('pg')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

const client = new Client({
    host: '127.0.0.1',
    port: 8812,
    user: 'admin',
    password: 'quest',
    database: 'qdb'
})

async function sampleByQuery() {
    try {
        await client.connect()

        const result = await client.query(`
      SELECT 
        ts,
        symbol,
        avg(price) as avg_price,
        min(price) as min_price,
        max(price) as max_price
      FROM trades
      WHERE ts >= dateadd('d', -7000, now())
      SAMPLE BY 1h
    `)
        console.log(`Got ${result.rows.length} hourly samples`)
    
        for (const row of result.rows) {
            console.log(`${row.ts} - ${row.symbol}: Avg: ${row.avg_price}, Range: ${row.min_price} - ${row.max_price}`)
        }
    } catch (error) {
        console.error('Query error:', error)
    } finally {
        await client.end()
    }
}

sampleByQuery()
```

### Latest On Queries

```javascript
const postgres = require('postgres')

// Set the client timezone to UTC
process.env.TZ = 'UTC';

const sql = postgres({
    host: '127.0.0.1',
    port: 8812,
    username: 'admin',
    password: 'quest',
    database: 'qdb',
    ssl: false
})

async function latestByQuery() {
    try {
        // Get the latest values for each symbol
        const latest = await sql`
      SELECT * FROM trades
      LATEST ON timestamp PARTITION BY symbol
    `

        console.log(`Latest prices for ${latest.length} symbols:`)
        for (const trade of latest) {
            console.log(`${trade.symbol}: ${trade.price} @ ${trade.ts}`)
        }
    } catch (error) {
        console.error('Query error:', error)
    } finally {
        await sql.end()
    }
}

latestByQuery()
```


## Troubleshooting

### Connection Issues

If you have trouble connecting to QuestDB with a JavaScript client:

1. Verify that QuestDB is running and the PGWire port (8812) is accessible
2. Check that the connection parameters (host, port, user, password) are correct
3. Make sure your network allows connections to the QuestDB server
4. Check if the QuestDB server logs show any connection errors

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists
2. Check the syntax of your SQL query
3. Ensure that you're using the correct data types for parameters, this can be tricky with JavaScript where 
   all numbers are floats. You may need to cast them explicitly in your SQL query. 

## Conclusion

QuestDB's support for the PostgreSQL Wire Protocol allows you to use standard JavaScript PostgreSQL clients for querying
time-series data. Both `pg` and `postgres` clients offer good performance and features for working with QuestDB.

We recommend the `pg` client for querying. 
For data ingestion, consider QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for maximum
throughput.

Remember that QuestDB is optimized for time-series data, so make the most of its specialized time-series functions like
`SAMPLE BY` and `LATEST ON` for efficient queries.
