---
title: PHP clients
description:
  PHP clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with PHP for querying data. 
---

QuestDB is tested with the following PHP client:

- [PDO (PHP Data Objects)](https://www.php.net/manual/en/book.pdo.php) with the PostgreSQL driver

Other PHP clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. For best performance when querying data from QuestDB with
PHP, we recommend using PDO with connection pooling.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB.

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use standard
PHP PostgreSQL clients with QuestDB's high-performance time-series database.

It's important to note that QuestDB's underlying storage model differs from PostgreSQL's, which means some PostgreSQL
features may not be available in QuestDB.

## Connection Parameters

The PDO client needs the following connection parameters to connect to QuestDB:

- **Host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **Port**: The PostgreSQL wire protocol port (default: `8812`)
- **Username**: The username for authentication (default: `admin`)
- **Password**: The password for authentication (default: `quest`)
- **Database**: The database name (default: `qdb`)

## PHP Data Objects (PDO)

[PDO](https://www.php.net/manual/en/book.pdo.php) provides a data-access abstraction layer, which means that regardless
of which database you're using, you use the same functions to issue queries and fetch data. PDO uses database-specific
drivers, including one for PostgreSQL, which can be used to connect to QuestDB.

### Features

- Database abstraction layer for consistent API
- Prepared statements for improved security and performance
- Transaction support
- Error handling through exceptions
- Support for different fetch modes
- Connection pooling (with proper configuration)
- Support for multiple database backends

### Installation

Most PHP installations come with PDO pre-installed. However, you'll need to make sure the PostgreSQL driver for PDO is
enabled.

In your `php.ini` file, ensure the following extension is enabled (remove the semicolon if it's commented out):

```ini
extension=pdo_pgsql
```

### Basic Connection

```php
<?php
// Connection parameters
$host = 'localhost';
$port = 8812;
$dbname = 'qdb';
$user = 'admin';
$password = 'quest';

// Create a DSN (Data Source Name)
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

try {
    // Create a PDO instance
    $pdo = new PDO($dsn, $user, $password);
    
    // Configure PDO to throw exceptions on error
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "Connected successfully to QuestDB!";
} catch (PDOException $e) {
    echo "Connection failed: " . $e->getMessage();
}
?>
```

### Querying Data

```php
<?php
// Connection parameters
$host = 'localhost';
$port = 8812;
$dbname = 'qdb';
$user = 'admin';
$password = 'quest';

// Create a DSN
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

try {
    // Create a PDO instance
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Execute a simple query
    $query = "SELECT * FROM trades LIMIT 10";
    $statement = $pdo->query($query);
    
    // Fetch all rows as associative arrays
    $results = $statement->fetchAll(PDO::FETCH_ASSOC);
    
    // Display the results
    echo "<h2>Recent Trades</h2>";
    echo "<table border='1'>";
    
    // Display column headers
    if (!empty($results)) {
        echo "<tr>";
        foreach (array_keys($results[0]) as $column) {
            echo "<th>" . htmlspecialchars($column) . "</th>";
        }
        echo "</tr>";
    }
    
    // Display data rows
    foreach ($results as $row) {
        echo "<tr>";
        foreach ($row as $value) {
            echo "<td>" . htmlspecialchars($value) . "</td>";
        }
        echo "</tr>";
    }
    
    echo "</table>";
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

### Parameterized Queries

Using parameterized queries with PDO provides protection against SQL injection and can improve performance when
executing similar queries repeatedly:

```php
<?php
// Connection parameters
$host = 'localhost';
$port = 8812;
$dbname = 'qdb';
$user = 'admin';
$password = 'quest';

// Create a DSN
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

try {
    // Create a PDO instance
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Parameters
    $symbol = 'BTC-USD';
    $startTime = date('Y-m-d H:i:s', strtotime('-7 days')); // 7 days ago
    
    // Prepare a statement
    $query = "SELECT * FROM trades WHERE symbol = :symbol AND ts >= :start_time ORDER BY ts DESC LIMIT 10";
    $statement = $pdo->prepare($query);
    
    // Bind parameters
    $statement->bindParam(':symbol', $symbol, PDO::PARAM_STR);
    $statement->bindParam(':start_time', $startTime, PDO::PARAM_STR);
    
    // Execute the statement
    $statement->execute();
    
    // Fetch all rows
    $results = $statement->fetchAll(PDO::FETCH_ASSOC);
    
    // Display the results
    echo "<h2>Recent $symbol Trades</h2>";
    echo "<table border='1'>";
    
    // Display column headers
    if (!empty($results)) {
        echo "<tr>";
        foreach (array_keys($results[0]) as $column) {
            echo "<th>" . htmlspecialchars($column) . "</th>";
        }
        echo "</tr>";
    }
    
    // Display data rows
    foreach ($results as $row) {
        echo "<tr>";
        foreach ($row as $value) {
            echo "<td>" . htmlspecialchars($value) . "</td>";
        }
        echo "</tr>";
    }
    
    echo "</table>";
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

You can also use positional parameters with `?` placeholders:

```php
<?php
// ... Connection setup as above ...

try {
    // Create a PDO instance
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Parameters
    $symbol = 'BTC-USD';
    $startTime = date('Y-m-d H:i:s', strtotime('-7 days')); // 7 days ago
    
    // Prepare a statement with positional parameters
    $query = "SELECT * FROM trades WHERE symbol = ? AND ts >= ? ORDER BY ts DESC LIMIT 10";
    $statement = $pdo->prepare($query);
    
    // Execute with parameters
    $statement->execute([$symbol, $startTime]);
    
    // Fetch and display results...
    // ... (as shown in the previous example)
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

### Fetching Results

PDO offers multiple ways to fetch results:

```php
<?php
// ... Connection and query setup as above ...

try {
    // Create a PDO instance
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Execute a query
    $statement = $pdo->query("SELECT * FROM trades LIMIT 10");
    
    // Method 1: Fetch all rows at once as associative arrays
    $allResults = $statement->fetchAll(PDO::FETCH_ASSOC);
    
    // Method 2: Fetch all rows at once as objects
    $statement = $pdo->query("SELECT * FROM trades LIMIT 10");
    $allObjectResults = $statement->fetchAll(PDO::FETCH_OBJ);
    
    // Method 3: Fetch rows one at a time
    $statement = $pdo->query("SELECT * FROM trades LIMIT 10");
    while ($row = $statement->fetch(PDO::FETCH_ASSOC)) {
        // Process each row individually
        echo "Symbol: " . htmlspecialchars($row['symbol']) . ", Price: " . htmlspecialchars($row['price']) . "<br>";
    }
    
    // Method 4: Fetch a single column
    $statement = $pdo->query("SELECT symbol FROM trades LIMIT 5");
    $symbols = $statement->fetchAll(PDO::FETCH_COLUMN, 0); // 0 is the column index
    
    // Method 5: Fetch a single value
    $statement = $pdo->query("SELECT COUNT(*) FROM trades");
    $count = $statement->fetchColumn();
    echo "Total trades: " . $count;
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

### Connection Pooling

For web applications, connections to the database should be properly managed. While PHP itself doesn't provide
connection pooling (because each request typically creates a new PHP process), you can use persistent connections to
approximate connection pooling:

```php
<?php
// Connection parameters
$host = 'localhost';
$port = 8812;
$dbname = 'qdb';
$user = 'admin';
$password = 'quest';

// Create a DSN with the pgsql driver
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

try {
    // Create a PDO instance with persistent connection
    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_PERSISTENT => true, // Enable persistent connections
    ];
    
    $pdo = new PDO($dsn, $user, $password, $options);
    
    // Now use $pdo for your database operations
    $statement = $pdo->query("SELECT version()");
    $version = $statement->fetchColumn();
    echo "QuestDB version: " . htmlspecialchars($version);
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

> **Note**: Persistent connections should be used with caution. They can improve performance by reducing the connection
> overhead, but they can also lead to resource exhaustion if not properly managed. Modern PHP applications often use
> connection pooling at a higher level, using tools like PHP-PM or frameworks like Laravel/Symfony with their database
> connection management.

### Known Limitations with QuestDB

When using PDO with QuestDB, be aware of these limitations:

1. **Cursor Support**: QuestDB does not support scrollable cursors that require explicit creation and management through
   `DECLARE CURSOR` and subsequent operations.
2. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
3. **Schema Management**: QuestDB's table creation and schema modification capabilities differ from PostgreSQL.
4. **PostgreSQL-Specific Features**: Some PostgreSQL-specific features might not be available in QuestDB.

### Performance Tips

1. **Limit Result Sets**: When working with large datasets, always limit the number of rows returned to avoid memory
   issues.
2. **Close Connections**: Make sure to close PDO connections when they're no longer needed, especially in long-running
   scripts.
3. **Optimize Queries**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST BY` for
   efficient queries.
4. **Fetch Mode**: Choose the most appropriate fetch mode for your use case to minimize memory usage and processing
   time.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with PDO:

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
3. Ensure that the PDO PostgreSQL driver is enabled in your PHP configuration.
4. Check if the QuestDB server logs show any connection errors.

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists.
2. Check the syntax of your SQL query.
3. Ensure that you're using the correct data types for parameters.
4. Look for any unsupported PostgreSQL features that might be causing issues.

## Conclusion

PDO provides a robust way to connect PHP applications to QuestDB through the PostgreSQL Wire Protocol. By following the
guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it with various
PHP applications.

For data ingestion, it's recommended to use QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for
high-throughput data insertion.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST BY`, provide powerful tools for analyzing
time-series data that can be easily accessed through PDO.