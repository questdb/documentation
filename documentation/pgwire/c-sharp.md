---
title: C# clients
description:
  C# clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with C# for querying data. 
---

QuestDB is tested with the following C# client:

- [Npgsql](https://www.npgsql.org/)

Other C# clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml)

### Performance Considerations

QuestDB is designed to be a high-performance database. The PGWire protocol has many
flavors, and some of them are not optimized for performance. For best performance when querying data from QuestDB with
C#, we recommend using Npgsql with connection pooling.

> **Note**: For data ingestion, we recommend using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP)
> instead of PGWire. PGWire should primarily be used for querying data in QuestDB. QuestDB provides an
> official [.NET client](https://questdb.com/docs/clients/ingest-dotnet/) for data ingestion using ILP.

## Introduction to PGWire in QuestDB

QuestDB supports the PostgreSQL Wire Protocol (PGWire) for querying data. This compatibility allows you to use standard
C# PostgreSQL clients with QuestDB's high-performance time-series database.

It's important to note that QuestDB's underlying storage model differs from PostgreSQL's, which means some PostgreSQL
features may not be available in QuestDB.

## Connection Parameters

The Npgsql client needs the following connection parameters to connect to QuestDB:

- **Host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **Port**: The PostgreSQL wire protocol port (default: `8812`)
- **Username**: The username for authentication (default: `admin`)
- **Password**: The password for authentication (default: `quest`)
- **Database**: The database name (default: `qdb`)
- **ServerCompatibilityMode**: This should be set to `NoTypeLoading` for QuestDB

## Npgsql

[Npgsql](https://www.npgsql.org/) is an open-source ADO.NET Data Provider for PostgreSQL. It enables C# applications to
connect to and interact with PostgreSQL databases, including QuestDB.

### Features

- Full ADO.NET implementation
- Entity Framework Core provider
- Connection pooling
- Prepared statements
- Support for asynchronous operations
- Transaction management
- Batch operations
- Full type handling for PostgreSQL types

### Installation

To use Npgsql in your project, add the following NuGet package:

#### Using the .NET CLI

```bash
dotnet add package Npgsql
```

#### Using the Package Manager Console

```powershell
Install-Package Npgsql
```

#### Using the PackageReference in .csproj

```xml

<ItemGroup>
    <PackageReference Include="Npgsql" Version="8.0.1"/>
</ItemGroup>
```

### Basic Connection

```csharp
using Npgsql;
using System;
using System.Threading.Tasks;

namespace QuestDBExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // Connection string with required ServerCompatibilityMode=NoTypeLoading
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;";
            
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                Console.WriteLine("Connected to QuestDB successfully!");
                
                // Close the connection
                await connection.CloseAsync();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error connecting to QuestDB: {ex.Message}");
            }
        }
    }
}
```

> **Important**: Always include `ServerCompatibilityMode=NoTypeLoading` in your connection string when connecting to
> QuestDB. This is necessary because QuestDB's type system differs from PostgreSQL's, and this setting prevents Npgsql
> from attempting to load PostgreSQL-specific types that aren't supported by QuestDB.

### Querying Data

```csharp
using Npgsql;
using System;
using System.Threading.Tasks;

namespace QuestDBExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;";
            
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                // Create a command
                string sql = "SELECT * FROM trades LIMIT 10";
                await using var command = new NpgsqlCommand(sql, connection);
                
                // Execute the command and process the results
                await using var reader = await command.ExecuteReaderAsync();
                
                // Read column names
                var columns = new string[reader.FieldCount];
                for (int i = 0; i < reader.FieldCount; i++)
                {
                    columns[i] = reader.GetName(i);
                    Console.Write($"{columns[i]}\t");
                }
                Console.WriteLine();
                
                // Read data
                while (await reader.ReadAsync())
                {
                    for (int i = 0; i < reader.FieldCount; i++)
                    {
                        Console.Write($"{reader[i]}\t");
                    }
                    Console.WriteLine();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error executing query: {ex.Message}");
            }
        }
    }
}
```

### Parameterized Queries

Using parameterized queries with Npgsql provides protection against SQL injection and can improve performance when
executing similar queries repeatedly:

```csharp
using Npgsql;
using System;
using System.Threading.Tasks;

namespace QuestDBExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;";
            
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                // Parameters
                string symbol = "BTC-USD";
                DateTime startTime = DateTime.UtcNow.AddDays(-7); // 7 days ago
                
                // Parameterized query
                string sql = @"
                    SELECT * 
                    FROM trades 
                    WHERE symbol = @symbol AND ts >= @startTime 
                    ORDER BY ts DESC 
                    LIMIT 10";
                
                await using var command = new NpgsqlCommand(sql, connection);
                
                // Add parameters
                command.Parameters.AddWithValue("@symbol", symbol);
                command.Parameters.AddWithValue("@startTime", startTime);
                
                // Execute the command
                await using var reader = await command.ExecuteReaderAsync();
                
                // Process results
                while (await reader.ReadAsync())
                {
                    string timestamp = reader["ts"].ToString();
                    string tradingSymbol = reader["symbol"].ToString();
                    double price = reader.GetDouble(reader.GetOrdinal("price"));
                    
                    Console.WriteLine($"Timestamp: {timestamp}, Symbol: {tradingSymbol}, Price: {price:F2}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error executing parameterized query: {ex.Message}");
            }
        }
    }
}
```

### Connection Pooling

Npgsql includes built-in connection pooling to efficiently manage database connections. Connection pooling is enabled by
default, but you can configure various pooling settings in the connection string:

```csharp
using Npgsql;
using System;
using System.Threading.Tasks;

namespace QuestDBExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            // Connection string with connection pooling settings
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;" +
                "Maximum Pool Size=20;Minimum Pool Size=1;Connection Lifetime=15;";
            
            try
            {
                // Simulate multiple concurrent connections
                var tasks = new Task[10];
                for (int i = 0; i < 10; i++)
                {
                    int connectionId = i;
                    tasks[i] = Task.Run(async () =>
                    {
                        await using var connection = new NpgsqlConnection(connectionString);
                        await connection.OpenAsync();
                        
                        Console.WriteLine($"Connection {connectionId} opened");
                        
                        // Simulate some work
                        await Task.Delay(1000);
                        
                        // Execute a simple query
                        await using var cmd = new NpgsqlCommand("SELECT 1", connection);
                        int result = (int)await cmd.ExecuteScalarAsync();
                        
                        Console.WriteLine($"Connection {connectionId} executed query with result: {result}");
                        
                        // Connection returned to the pool when disposed
                    });
                }
                
                // Wait for all tasks to complete
                await Task.WhenAll(tasks);
                
                Console.WriteLine("All connections have been processed");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }
    }
}
```

### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with Npgsql:

```csharp
using Npgsql;
using System;
using System.Threading.Tasks;

namespace QuestDBExample
{
    class Program
    {
        static async Task Main(string[] args)
        {
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;";
            
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                // SAMPLE BY query (time-based downsampling)
                string sampleByQuery = @"
                    SELECT 
                        ts, 
                        symbol, 
                        avg(price) as avg_price, 
                        min(price) as min_price, 
                        max(price) as max_price 
                    FROM trades 
                    WHERE ts >= dateadd('d', -7, now()) 
                    SAMPLE BY 1h";
                
                Console.WriteLine("Executing SAMPLE BY query...");
                await using (var cmd1 = new NpgsqlCommand(sampleByQuery, connection))
                {
                    await using var reader = await cmd1.ExecuteReaderAsync();
                    
                    while (await reader.ReadAsync())
                    {
                        Console.WriteLine($"Time: {reader["ts"]}, " +
                                         $"Symbol: {reader["symbol"]}, " +
                                         $"Avg Price: {reader.GetDouble(reader.GetOrdinal("avg_price")):F2}, " +
                                         $"Range: {reader.GetDouble(reader.GetOrdinal("min_price")):F2} - " +
                                         $"{reader.GetDouble(reader.GetOrdinal("max_price")):F2}");
                    }
                }
                
                // LATEST BY query (last value per group)
                string latestByQuery = "SELECT * FROM trades LATEST BY symbol";
                
                Console.WriteLine("\nExecuting LATEST BY query...");
                await using (var cmd2 = new NpgsqlCommand(latestByQuery, connection))
                {
                    await using var reader = await cmd2.ExecuteReaderAsync();
                    
                    while (await reader.ReadAsync())
                    {
                        Console.WriteLine($"Symbol: {reader["symbol"]}, " +
                                         $"Latest Price: {reader.GetDouble(reader.GetOrdinal("price")):F2} " +
                                         $"at {reader["ts"]}");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error executing time-series query: {ex.Message}");
            }
        }
    }
}
```

### Using ASP.NET Core

Here's an example of integrating QuestDB with an ASP.NET Core web application using direct Npgsql access:

```csharp
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace QuestDBAspNetCoreExample
{
    // Model class
    public class Trade
    {
        public DateTime Timestamp { get; set; }
        public string Symbol { get; set; }
        public double Price { get; set; }
        public double Amount { get; set; }
    }
    
    // Service for database operations
    public class QuestDBService
    {
        private readonly string _connectionString;
        
        public QuestDBService(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("QuestDB");
        }
        
        public async Task<IEnumerable<Trade>> GetRecentTradesAsync(string symbol = null, int limit = 10)
        {
            var trades = new List<Trade>();
            
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();
            
            string sql;
            NpgsqlCommand command;
            
            if (string.IsNullOrEmpty(symbol))
            {
                sql = "SELECT ts, symbol, price, amount FROM trades ORDER BY ts DESC LIMIT @limit";
                command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("@limit", limit);
            }
            else
            {
                sql = "SELECT ts, symbol, price, amount FROM trades WHERE symbol = @symbol ORDER BY ts DESC LIMIT @limit";
                command = new NpgsqlCommand(sql, connection);
                command.Parameters.AddWithValue("@symbol", symbol);
                command.Parameters.AddWithValue("@limit", limit);
            }
            
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                trades.Add(new Trade
                {
                    Timestamp = reader.GetDateTime(0),
                    Symbol = reader.GetString(1),
                    Price = reader.GetDouble(2),
                    Amount = reader.GetDouble(3)
                });
            }
            
            return trades;
        }
        
        public async Task<IEnumerable<Trade>> GetLatestTradesAsync()
        {
            var trades = new List<Trade>();
            
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();
            
            string sql = "SELECT * FROM trades LATEST BY symbol";
            await using var command = new NpgsqlCommand(sql, connection);
            
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                trades.Add(new Trade
                {
                    Timestamp = reader.GetDateTime(reader.GetOrdinal("ts")),
                    Symbol = reader.GetString(reader.GetOrdinal("symbol")),
                    Price = reader.GetDouble(reader.GetOrdinal("price")),
                    Amount = reader.GetDouble(reader.GetOrdinal("amount"))
                });
            }
            
            return trades;
        }
        
        public async Task<IEnumerable<dynamic>> GetTradeStatsAsync(int days = 7)
        {
            var stats = new List<dynamic>();
            
            await using var connection = new NpgsqlConnection(_connectionString);
            await connection.OpenAsync();
            
            string sql = @"
                SELECT 
                    symbol,
                    count(*) as trade_count,
                    avg(price) as avg_price,
                    min(price) as min_price,
                    max(price) as max_price,
                    sum(amount) as total_volume
                FROM trades
                WHERE ts >= dateadd('d', @days, now())
                GROUP BY symbol
                ORDER BY total_volume DESC";
                
            await using var command = new NpgsqlCommand(sql, connection);
            command.Parameters.AddWithValue("@days", -days);
            
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                stats.Add(new
                {
                    Symbol = reader.GetString(0),
                    TradeCount = reader.GetInt64(1),
                    AvgPrice = reader.GetDouble(2),
                    MinPrice = reader.GetDouble(3),
                    MaxPrice = reader.GetDouble(4),
                    TotalVolume = reader.GetDouble(5)
                });
            }
            
            return stats;
        }
    }
    
    // Startup configuration
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }
        
        public IConfiguration Configuration { get; }
        
        public void ConfigureServices(IServiceCollection services)
        {
            // Register QuestDB service
            services.AddSingleton<QuestDBService>();
            
            services.AddControllers();
            services.AddSwaggerGen();
        }
        
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
                app.UseSwagger();
                app.UseSwaggerUI();
            }
            
            app.UseRouting();
            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
            });
        }
    }
    
    // API Controller
    [ApiController]
    [Route("api/[controller]")]
    public class TradesController : ControllerBase
    {
        private readonly QuestDBService _questDBService;
        
        public TradesController(QuestDBService questDBService)
        {
            _questDBService = questDBService;
        }
        
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Trade>>> GetRecentTrades([FromQuery] string symbol = null, [FromQuery] int limit = 10)
        {
            var trades = await _questDBService.GetRecentTradesAsync(symbol, limit);
            return Ok(trades);
        }
        
        [HttpGet("latest")]
        public async Task<ActionResult<IEnumerable<Trade>>> GetLatestTrades()
        {
            var trades = await _questDBService.GetLatestTradesAsync();
            return Ok(trades);
        }
        
        [HttpGet("stats")]
        public async Task<ActionResult> GetTradeStats([FromQuery] int days = 7)
        {
            var stats = await _questDBService.GetTradeStatsAsync(days);
            return Ok(stats);
        }
    }
    
    // Program entry point
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }
        
        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>();
                });
    }
}
```

Add the following to `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "QuestDB": "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;ServerCompatibilityMode=NoTypeLoading;"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Microsoft.Hosting.Lifetime": "Information"
    }
  },
  "AllowedHosts": "*"
}
```

### Working with Dapper

[Dapper](https://github.com/DapperLib/Dapper) is a popular micro-ORM that works well with Npgsql and QuestDB. It
provides a lightweight alternative to full ORMs like Entity Framework Core while still offering object mapping
capabilities.

First, add the Dapper NuGet package:

```bash
dotnet add package Dapper
```

Here's an example of using Dapper with QuestDB:

```csharp
using Dapper;
using Npgsql;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace QuestDBDapperExample
{
    // Entity model
    public class Trade
    {
        public DateTime Timestamp { get; set; }
        public string Symbol { get; set; }
        public double Price { get; set; }
        public double Amount { get; set; }
    }
    
    // Example of a result from a time-series query
    public class TimeSeriesPoint
    {
        public DateTime Timestamp { get; set; }
        public string Symbol { get; set; }
        public double AvgPrice { get; set; }
        public double MinPrice { get; set; }
        public double MaxPrice { get; set; }
    }
    
    class Program
    {
        static async Task Main(string[] args)
        {
            string connectionString = 
                "Host=localhost;Port=8812;Username=admin;Password=quest;Database=qdb;" +
                "ServerCompatibilityMode=NoTypeLoading;";
            
            try
            {
                await using var connection = new NpgsqlConnection(connectionString);
                await connection.OpenAsync();
                
                // Basic query with Dapper
                var trades = await connection.QueryAsync<Trade>(
                    "SELECT ts AS Timestamp, symbol AS Symbol, price AS Price, amount AS Amount " +
                    "FROM trades LIMIT 10");
                
                Console.WriteLine($"Retrieved {trades.Count()} trades:");
                foreach (var trade in trades)
                {
                    Console.WriteLine($"Timestamp: {trade.Timestamp}, " +
                                     $"Symbol: {trade.Symbol}, " +
                                     $"Price: {trade.Price:F2}, " +
                                     $"Amount: {trade.Amount:F4}");
                }
                
                // Parameterized query
                string symbol = "BTC-USD";
                DateTime startTime = DateTime.UtcNow.AddDays(-7);
                
                var filteredTrades = await connection.QueryAsync<Trade>(
                    "SELECT ts AS Timestamp, symbol AS Symbol, price AS Price, amount AS Amount " +
                    "FROM trades " +
                    "WHERE symbol = @Symbol AND ts >= @StartTime " +
                    "ORDER BY ts DESC " +
                    "LIMIT 10",
                    new { Symbol = symbol, StartTime = startTime });
                
                Console.WriteLine($"\nRetrieved {filteredTrades.Count()} filtered trades for {symbol}:");
                foreach (var trade in filteredTrades)
                {
                    Console.WriteLine($"Timestamp: {trade.Timestamp}, " +
                                     $"Price: {trade.Price:F2}, " +
                                     $"Amount: {trade.Amount:F4}");
                }
                
                // Time-series query with SAMPLE BY
                var timeSeriesData = await connection.QueryAsync<TimeSeriesPoint>(
                    "SELECT " +
                    "   ts AS Timestamp, " +
                    "   symbol AS Symbol, " +
                    "   avg(price) AS AvgPrice, " +
                    "   min(price) AS MinPrice, " +
                    "   max(price) AS MaxPrice " +
                    "FROM trades " +
                    "WHERE ts >= dateadd('d', -1, now()) " +
                    "SAMPLE BY 1h");
                
                Console.WriteLine($"\nRetrieved {timeSeriesData.Count()} time series points:");
                foreach (var point in timeSeriesData)
                {
                    Console.WriteLine($"Time: {point.Timestamp}, " +
                                     $"Symbol: {point.Symbol}, " +
                                     $"Avg Price: {point.AvgPrice:F2}, " +
                                     $"Range: {point.MinPrice:F2} - {point.MaxPrice:F2}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error: {ex.Message}");
            }
        }
    }
}
```

### Known Limitations with QuestDB

When using Npgsql with QuestDB, be aware of these limitations:

1. **Type System Differences**: QuestDB's type system differs from PostgreSQL's. Always use
   `ServerCompatibilityMode=NoTypeLoading` to avoid issues.
2. **Cursor Support**: QuestDB does not support scrollable cursors that require explicit creation and management through
   `DECLARE CURSOR` and subsequent operations.
3. **Transaction Semantics**: QuestDB has different transaction semantics compared to traditional RDBMS.
4. **Schema Management**: QuestDB's table creation and schema modification capabilities differ from PostgreSQL.
5. **Extensions**: PostgreSQL-specific extensions are not available in QuestDB.

### Performance Tips

1. **Connection Pooling**: Use Npgsql's built-in connection pooling for better performance in multi-threaded
   applications.
2. **Prepared Statements**: Use prepared statements for frequently executed queries to improve performance.
3. **Batch Operations**: When possible, batch multiple operations together to reduce network overhead.
4. **Asynchronous API**: Use the asynchronous methods (`OpenAsync`, `ExecuteReaderAsync`, etc.) to avoid blocking
   threads, especially in web applications.
5. **Query Optimization**: Take advantage of QuestDB's time-series functions like `SAMPLE BY` and `LATEST BY` for
   efficient queries.
6. **Limit Result Sets**: When dealing with large time-series datasets, use `LIMIT` clauses to avoid retrieving too much
   data at once.
7. **Use Appropriate Types**: Match C# types to QuestDB types correctly to avoid unnecessary conversions.

## QuestDB Time Series Features

QuestDB provides specialized time-series functions that can be used with Npgsql:

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
3. Ensure that you've included `ServerCompatibilityMode=NoTypeLoading` in your connection string.
4. Check if the QuestDB server logs show any connection errors.

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists.
2. Check the syntax of your SQL query.
3. Ensure that you're using the correct data types for parameters.
4. Look for any unsupported PostgreSQL features that might be causing issues.

## Conclusion

Npgsql provides a robust way to connect C# applications to QuestDB through the PostgreSQL Wire Protocol. By following
the guidelines in this documentation, you can effectively query time-series data from QuestDB and integrate it with
various .NET applications.

For data ingestion, remember that QuestDB provides an
official [.NET client](https://questdb.com/docs/clients/ingest-dotnet/) that uses the InfluxDB Line Protocol (ILP) for
high-throughput data insertion. For optimal performance, use this client for data ingestion and Npgsql for querying.

QuestDB's SQL extensions for time-series data, such as `SAMPLE BY` and `LATEST BY`, provide powerful tools for analyzing
time-series data that can be easily accessed through Npgsql.

For production applications, consider using the QuestDB.Net library or direct Npgsql queries, as they offer more direct
control over queries and better compatibility with QuestDB's time-series model than higher-level ORMs like Entity
Framework Core, which are better suited for traditional OLTP databases.