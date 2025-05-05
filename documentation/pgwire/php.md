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

### Creating a Database Class

For more organized code, you can create a database class to handle connections and queries:

```php
<?php
class Database {
    private $host = 'localhost';
    private $port = 8812;
    private $dbname = 'qdb';
    private $username = 'admin';
    private $password = 'quest';
    private $pdo;
    
    public function __construct() {
        // Create a DSN
        $dsn = "pgsql:host=$this->host;port=$this->port;dbname=$this->dbname";
        
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        
        try {
            $this->pdo = new PDO($dsn, $this->username, $this->password, $options);
        } catch (PDOException $e) {
            throw new Exception("Database connection failed: " . $e->getMessage());
        }
    }
    
    public function query($sql, $params = []) {
        try {
            $statement = $this->pdo->prepare($sql);
            $statement->execute($params);
            return $statement;
        } catch (PDOException $e) {
            throw new Exception("Query failed: " . $e->getMessage());
        }
    }
    
    public function select($sql, $params = []) {
        try {
            $statement = $this->query($sql, $params);
            return $statement->fetchAll();
        } catch (Exception $e) {
            throw new Exception("Select failed: " . $e->getMessage());
        }
    }
    
    public function selectOne($sql, $params = []) {
        try {
            $statement = $this->query($sql, $params);
            return $statement->fetch();
        } catch (Exception $e) {
            throw new Exception("SelectOne failed: " . $e->getMessage());
        }
    }
    
    public function selectValue($sql, $params = []) {
        try {
            $statement = $this->query($sql, $params);
            return $statement->fetchColumn();
        } catch (Exception $e) {
            throw new Exception("SelectValue failed: " . $e->getMessage());
        }
    }
}

// Usage example
try {
    $db = new Database();
    
    // Select multiple rows
    $trades = $db->select("SELECT * FROM trades LIMIT 10");
    
    // Select a single row
    $latestTrade = $db->selectOne("SELECT * FROM trades ORDER BY ts DESC LIMIT 1");
    
    // Select a single value
    $count = $db->selectValue("SELECT COUNT(*) FROM trades");
    
    // Parameterized query
    $symbol = 'BTC-USD';
    $startTime = date('Y-m-d H:i:s', strtotime('-7 days'));
    $filteredTrades = $db->select(
        "SELECT * FROM trades WHERE symbol = ? AND ts >= ? ORDER BY ts DESC LIMIT 10",
        [$symbol, $startTime]
    );
    
    // Display results
    echo "Total trades: " . $count . "<br>";
    echo "Latest trade: " . $latestTrade['symbol'] . " at " . $latestTrade['price'] . "<br>";
    
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
```

### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with PDO:

```php
<?php
// ... Database connection setup ...

try {
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // SAMPLE BY query (time-based downsampling)
    $sampleByQuery = "
        SELECT 
            ts, 
            symbol, 
            avg(price) as avg_price, 
            min(price) as min_price, 
            max(price) as max_price 
        FROM trades 
        WHERE ts >= dateadd('d', -7, now()) 
        SAMPLE BY 1h";
    
    $statement = $pdo->query($sampleByQuery);
    $sampledData = $statement->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h2>Hourly Price Samples (Last 7 Days)</h2>";
    echo "<table border='1'>";
    echo "<tr><th>Time</th><th>Symbol</th><th>Avg Price</th><th>Min Price</th><th>Max Price</th></tr>";
    
    foreach ($sampledData as $row) {
        echo "<tr>";
        echo "<td>" . htmlspecialchars($row['ts']) . "</td>";
        echo "<td>" . htmlspecialchars($row['symbol']) . "</td>";
        echo "<td>" . htmlspecialchars($row['avg_price']) . "</td>";
        echo "<td>" . htmlspecialchars($row['min_price']) . "</td>";
        echo "<td>" . htmlspecialchars($row['max_price']) . "</td>";
        echo "</tr>";
    }
    
    echo "</table>";
    
    // LATEST BY query (last value per group)
    $latestByQuery = "SELECT * FROM trades LATEST BY symbol";
    $statement = $pdo->query($latestByQuery);
    $latestData = $statement->fetchAll(PDO::FETCH_ASSOC);
    
    echo "<h2>Latest Trades by Symbol</h2>";
    echo "<table border='1'>";
    
    // Display column headers
    if (!empty($latestData)) {
        echo "<tr>";
        foreach (array_keys($latestData[0]) as $column) {
            echo "<th>" . htmlspecialchars($column) . "</th>";
        }
        echo "</tr>";
    }
    
    // Display data rows
    foreach ($latestData as $row) {
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

### Using with a PHP Framework (Laravel Example)

If you're using Laravel, you can configure QuestDB as a PostgreSQL connection in your `.env` file:

```
DB_CONNECTION=pgsql
DB_HOST=localhost
DB_PORT=8812
DB_DATABASE=qdb
DB_USERNAME=admin
DB_PASSWORD=quest
```

Then you can use Laravel's query builder or Eloquent ORM to interact with QuestDB:

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TradeController extends Controller
{
    public function index()
    {
        // Using the query builder
        $trades = DB::table('trades')
            ->orderBy('ts', 'desc')
            ->limit(10)
            ->get();
        
        return view('trades.index', ['trades' => $trades]);
    }
    
    public function show($symbol)
    {
        // Using raw queries for QuestDB-specific functionality
        $sampledData = DB::select("
            SELECT 
                ts, 
                symbol, 
                avg(price) as avg_price, 
                min(price) as min_price, 
                max(price) as max_price 
            FROM trades 
            WHERE symbol = ? AND ts >= dateadd('d', -7, now()) 
            SAMPLE BY 1h
        ", [$symbol]);
        
        return view('trades.show', [
            'symbol' => $symbol,
            'sampledData' => $sampledData
        ]);
    }
    
    public function latest()
    {
        // Using raw queries for LATEST BY
        $latestTrades = DB::select("SELECT * FROM trades LATEST BY symbol");
        
        return view('trades.latest', ['latestTrades' => $latestTrades]);
    }
}
```

### Creating a Simple REST API

You can create a simple REST API to expose QuestDB data:

```php
<?php
// api.php

// Set content type to JSON
header('Content-Type: application/json');

// Database connection parameters
$host = 'localhost';
$port = 8812;
$dbname = 'qdb';
$user = 'admin';
$password = 'quest';
$dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

// Get request parameters
$endpoint = $_GET['endpoint'] ?? 'trades';
$limit = (int)($_GET['limit'] ?? 10);
$symbol = $_GET['symbol'] ?? null;
$startTime = $_GET['start_time'] ?? date('Y-m-d H:i:s', strtotime('-7 days'));
$endTime = $_GET['end_time'] ?? date('Y-m-d H:i:s');
$interval = $_GET['interval'] ?? '1h';

try {
    // Create PDO instance
    $pdo = new PDO($dsn, $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $data = [];
    $error = null;
    
    switch ($endpoint) {
        case 'trades':
            // Recent trades with optional symbol filter
            $query = "SELECT * FROM trades";
            $params = [];
            
            if ($symbol) {
                $query .= " WHERE symbol = ?";
                $params[] = $symbol;
                
                if ($startTime) {
                    $query .= " AND ts >= ?";
                    $params[] = $startTime;
                }
            } else if ($startTime) {
                $query .= " WHERE ts >= ?";
                $params[] = $startTime;
            }
            
            $query .= " ORDER BY ts DESC LIMIT ?";
            $params[] = $limit;
            
            $statement = $pdo->prepare($query);
            $statement->execute($params);
            $data = $statement->fetchAll(PDO::FETCH_ASSOC);
            break;
            
        case 'sampled':
            // Sampled data with SAMPLE BY
            $query = "
                SELECT 
                    ts, 
                    symbol, 
                    avg(price) as avg_price, 
                    min(price) as min_price, 
                    max(price) as max_price,
                    sum(amount) as volume
                FROM trades 
                WHERE ts >= ? AND ts <= ?
            ";
            $params = [$startTime, $endTime];
            
            if ($symbol) {
                $query .= " AND symbol = ?";
                $params[] = $symbol;
            }
            
            $query .= " SAMPLE BY " . $interval;
            
            $statement = $pdo->prepare($query);
            $statement->execute($params);
            $data = $statement->fetchAll(PDO::FETCH_ASSOC);
            break;
            
        case 'latest':
            // Latest trades by symbol using LATEST BY
            $query = "SELECT * FROM trades LATEST BY symbol";
            
            if ($symbol) {
                $query = "SELECT * FROM trades WHERE symbol = ? LATEST BY symbol";
                $statement = $pdo->prepare($query);
                $statement->execute([$symbol]);
            } else {
                $statement = $pdo->query($query);
            }
            
            $data = $statement->fetchAll(PDO::FETCH_ASSOC);
            break;
            
        default:
            throw new Exception("Unknown endpoint: $endpoint");
    }
    
    // Return success response
    echo json_encode([
        'success' => true,
        'data' => $data,
        'count' => count($data),
        'params' => [
            'endpoint' => $endpoint,
            'limit' => $limit,
            'symbol' => $symbol,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'interval' => $interval
        ]
    ]);
    
} catch (Exception $e) {
    // Return error response
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
?>
```

Example usage:

- `api.php?endpoint=trades&limit=20&symbol=BTC-USD`
- `api.php?endpoint=sampled&symbol=BTC-USD&interval=30m`
- `api.php?endpoint=latest`

### Known Limitations with QuestDB

When using PDO with QuestDB, be aware of these limitations:

1. **Cursor Support**: QuestDB does not support scrollable cursors that require explicit creation and management through
   `DECLARE CURSOR` and subsequent operations.
2. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
3. **Schema Management**: QuestDB's table creation and schema modification capabilities differ from PostgreSQL.
4. **PostgreSQL-Specific Features**: Some PostgreSQL-specific features might not be available in QuestDB.
5. **Binary Data Types**: QuestDB's support for binary data types might differ from PostgreSQL.

### Performance Tips

1. **Use Prepared Statements**: Always use prepared statements for queries that are executed multiple times to improve
   performance and security.
2. **Limit Result Sets**: When working with large datasets, always limit the number of rows returned to avoid memory
   issues.
3. **Close Connections**: Make sure to close PDO connections when they're no longer needed, especially in long-running
   scripts.
4. **Use Persistent Connections**: For web applications, consider using persistent connections to reduce the overhead of
   creating new database connections.
5. **Optimize Queries**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST BY` for
   efficient queries.
6. **Fetch Mode**: Choose the most appropriate fetch mode for your use case to minimize memory usage and processing
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