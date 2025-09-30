---
title: Java PGWire Guide
description:
  Java clients for QuestDB PGWire protocol. Learn how to use the PGWire
  protocol with Java for querying data.
---

QuestDB is tested with the following Java clients:

- [PostgreSQL JDBC Driver](https://jdbc.postgresql.org/)
- [R2DBC-PostgreSQL](https://github.com/pgjdbc/r2dbc-postgresql)

Other Java clients that are compatible with the PostgreSQL wire protocol
should also work with QuestDB, but we do not test them. If you find a client that
does not work, please [open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

### Performance Considerations

QuestDB is a high-performance database. The PGWire protocol has many flavors, and some of them are not optimized
for performance. For best performance when querying data from QuestDB with Java, we recommend using the PostgreSQL JDBC
driver with connection pooling.

:::tip

For data ingestion, we recommend using QuestDB's first-party clients with the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/)
instead of PGWire. PGWire should primarily be used for querying data in QuestDB. QuestDB provides an
official [Java client](/docs/clients/java_ilp/) for data ingestion using ILP.

:::

## Connection Parameters

All Java PostgreSQL clients need similar connection parameters to connect to QuestDB:

- **Host**: The hostname or IP address of the QuestDB server (default: `localhost`)
- **Port**: The PostgreSQL wire protocol port (default: `8812`)
- **Username**: The username for authentication (default: `admin`)
- **Password**: The password for authentication (default: `quest`)
- **Database**: The database name (default: `qdb`)

## PostgreSQL JDBC Driver

The [PostgreSQL JDBC Driver](https://jdbc.postgresql.org/) (also known as pgJDBC) allows Java programs to connect to a
PostgreSQL database using standard JDBC API. It's a Type 4 JDBC driver, which means it's implemented in pure Java and
communicates with the database using the PostgreSQL network protocol.

### Features

- Standard JDBC API compliance
- Connection pooling support
- Prepared statement support
- Batch processing
- Type conversion between PostgreSQL and Java types
- Support for array types, large objects, and more

### Installation

To use the PostgreSQL JDBC driver in your project, add the following dependency:

#### Maven

```xml

<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>42.7.5</version>
</dependency>
```

#### Gradle

```
implementation 'org.postgresql:postgresql:42.7.5'
```

### Basic Connection

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Properties;

public class QuestDBConnection {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:8812/qdb";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "quest");

        try (Connection conn = DriverManager.getConnection(url, props)) {
            System.out.println("Connected to QuestDB successfully!");
            System.out.println("Auto-commit: " + conn.getAutoCommit());
        } catch (SQLException e) {
            System.err.println("Connection error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Querying Data

```java
import java.sql.*;
import java.util.Calendar;
import java.util.Properties;
import java.util.TimeZone;

public class QuestDBQuery {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:8812/qdb";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "quest");

        // By default, the PostgreSQL JDBC driver (PG JDBC) assumes that
        // timestamps retrieved from the database are in the JVM's local timezone.
        // However, QuestDB stores timestamps in UTC. To ensure correct interpretation
        // and avoid unintended timezone conversions, we explicitly instruct the
        // PG JDBC driver to interpret all retrieved timestamps as UTC.
        // This is achieved by providing a Calendar object configured to UTC
        // when calling ResultSet.getTimestamp().
        java.util.Calendar utcCalendar = Calendar.getInstance();
        utcCalendar.setTimeZone(TimeZone.getTimeZone("UTC"));

        try (Connection conn = DriverManager.getConnection(url, props);
             Statement stmt = conn.createStatement()) {
            try (ResultSet rs = stmt.executeQuery("SELECT * FROM trades LIMIT 10")) {
                while (rs.next()) {
                    Timestamp timestamp = rs.getTimestamp("timestamp", utcCalendar);
                    String symbol = rs.getString("symbol");
                    double price = rs.getDouble("price");

                    System.out.printf("Timestamp: %s, Symbol: %s, Price: %.2f%n",
                            timestamp, symbol, price);
                }
            }
        } catch (SQLException e) {
            System.err.println("Query error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Parameterized Queries with PreparedStatement

Using `PreparedStatement` provides protection against SQL injection and can improve performance for repeatedly executed
queries:

```java
import java.sql.*;
import java.util.Calendar;
import java.util.Properties;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.sql.Timestamp;
import java.util.TimeZone;

public class QuestDBParameterizedQuery {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:8812/qdb";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "quest");
        props.setProperty("sslmode", "disable");

        // By default, the PostgreSQL JDBC driver (PG JDBC) assumes that
        // timestamps retrieved from the database are in the JVM's local timezone.
        // However, QuestDB stores timestamps in UTC. To ensure correct interpretation
        // and avoid unintended timezone conversions, we explicitly instruct the
        // PG JDBC driver to interpret all retrieved timestamps as UTC.
        // This is achieved by providing a Calendar object configured to UTC
        // when calling ResultSet.getTimestamp().
        java.util.Calendar utcCalendar = Calendar.getInstance();
        utcCalendar.setTimeZone(TimeZone.getTimeZone("UTC"));

        String sql = "SELECT * FROM trades WHERE symbol = ? AND timestamp >= ? ORDER BY timestamp LIMIT 10";
        try (Connection conn = DriverManager.getConnection(url, props);
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            pstmt.setString(1, "BTC-USD");

            LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
            Timestamp timestamp = Timestamp.from(sevenDaysAgo.toInstant(ZoneOffset.UTC));
            pstmt.setTimestamp(2, timestamp, utcCalendar);

            try (ResultSet rs = pstmt.executeQuery()) {
                while (rs.next()) {
                    Timestamp ts = rs.getTimestamp("timestamp", utcCalendar);
                    String symbol = rs.getString("symbol");
                    double price = rs.getDouble("price");

                    System.out.printf("Timestamp: %s, Symbol: %s, Price: %.2f%n",
                            ts, symbol, price);
                }
            }
        } catch (SQLException e) {
            System.err.println("Query error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Inserting Arrays
QuestDB, via the PostgreSQL wire protocol, supports array data types, including multidimensional arrays.

:::tip
Inserting large amounts of data using the JDBC driver can be inefficient. For high-throughput ingestion, consider using
QuestDB's [Java ILP client](/docs/clients/java_ilp/) or the [InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/).
:::

When you need to insert multiple rows containing array data, such as a series of order book snapshots,
JDBC Batch API offers a more performant way to do so compared to inserting row by row with `execute()`.
The optimal batch size can vary based on your specific use case, but a common practice is to batch
inserts of 100 to 1000 rows at a time. This reduces the number of round trips to the database and can significantly
improve performance, especially when dealing with large datasets.

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Calendar;
import java.util.TimeZone;

public class ArrayInsert {

    public static void main(String[] args) {
        String url = "jdbc:postgresql://127.0.0.1:8812/qdb";
        String user = "admin";
        String password = "quest";

        try (Connection conn = DriverManager.getConnection(url, user, password)) {
            try (Statement stmt = conn.createStatement()) {
                String createTableSQL = """
                    CREATE TABLE IF NOT EXISTS l3_order_book
                    (
                        bid DOUBLE PRECISION[][],
                        ask DOUBLE PRECISION[][],
                        timestamp TIMESTAMP
                    ) TIMESTAMP(timestamp) PARTITION BY DAY WAL;
                    """;
                stmt.execute(createTableSQL);
                System.out.println("Table 'l3_order_book' is ready.");
            }

            java.util.Calendar utcCalendar = Calendar.getInstance();
            utcCalendar.setTimeZone(TimeZone.getTimeZone("UTC"));

            Instant baseTimestamp = Instant.now();
            String insertSQL = "INSERT INTO l3_order_book (bid, ask, timestamp) VALUES (?, ?, ?)";
            try (PreparedStatement pstmt = conn.prepareStatement(insertSQL)) {
                // Add first row to batch
                Double[][] bids1 = {{68500.50, 0.5}, {68500.00, 1.2}, {68499.50, 0.3}};
                Double[][] asks1 = {{68501.00, 0.8}, {68501.50, 0.4}, {68502.00, 1.1}};
                Timestamp ts1 = Timestamp.from(baseTimestamp.plus(1, ChronoUnit.SECONDS));
                pstmt.setObject(1, bids1);
                pstmt.setObject(2, asks1);
                pstmt.setTimestamp(3, ts1, utcCalendar);
                pstmt.addBatch();

                // Add second row to batch
                Double[][] bids2 = {{68502.10, 0.3}, {68501.80, 0.9}, {68501.20, 1.5}};
                Double[][] asks2 = {{68502.50, 1.1}, {68503.00, 0.6}, {68503.50, 0.2}};
                Timestamp ts2 = Timestamp.from(baseTimestamp.plus(2, ChronoUnit.SECONDS));
                pstmt.setObject(1, bids2);
                pstmt.setObject(2, asks2);
                pstmt.setTimestamp(3, ts2, utcCalendar);
                pstmt.addBatch();

                // Add third row to batch
                Double[][] bids3 = {{68490.60, 2.5}, {68489.00, 3.2}};
                Double[][] asks3 = {{68491.20, 1.8}, {68492.80, 0.7}};
                Timestamp ts3 = Timestamp.from(baseTimestamp.plus(3, ChronoUnit.SECONDS));
                pstmt.setObject(1, bids3);
                pstmt.setObject(2, asks3);
                pstmt.setTimestamp(3, ts3, utcCalendar);
                pstmt.addBatch();

                // Execute the batch
                int[] updateCounts = pstmt.executeBatch();

                int totalInserted = Arrays.stream(updateCounts).sum();
                System.out.printf("Successfully inserted %d L3 order book snapshots using batch insert.%n", totalInserted);
            }
        } catch (SQLException e) {
            System.err.println("Database error occurred.");
            e.printStackTrace();
        }
    }
}
```

:::note
Arrays are supported from QuestDB version 9.0.0.
:::

### Connection Pooling with HikariCP

Connection pooling is highly recommended for production applications to efficiently manage database connections:

```java
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class QuestDBConnectionPool {
    private static final HikariDataSource dataSource;

    static {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://localhost:8812/qdb");
        config.setUsername("admin");
        config.setPassword("quest");
        config.addDataSourceProperty("sslmode", "disable");
        config.setMaximumPoolSize(10);
        config.setMinimumIdle(2);
        config.setIdleTimeout(30000);
        config.setConnectionTimeout(10000);

        dataSource = new HikariDataSource(config);
    }

    public static Connection getConnection() throws SQLException {
        return dataSource.getConnection();
    }

    public static void closePool() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    public static void main(String[] args) {
        try (Connection conn = getConnection();
             PreparedStatement pstmt = conn.prepareStatement("SELECT * FROM trades LIMIT 5");
             ResultSet rs = pstmt.executeQuery()) {

            while (rs.next()) {
                System.out.println(rs.getString("symbol") + ": " + rs.getDouble("price"));
            }
        } catch (SQLException e) {
            e.printStackTrace();
        } finally {
            closePool();
        }
    }
}
```

Add the HikariCP dependency to your project:

#### Maven

```xml

<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
    <version>6.3.0</version>
</dependency>
```

#### Gradle

```
implementation 'com.zaxxer:HikariCP:6.3.0'
```


### Handling QuestDB-Specific Time-Series Queries

QuestDB provides specialized time-series functions that can be used with JDBC:

```java
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Calendar;
import java.util.Properties;
import java.util.TimeZone;

public class QuestDBTimeSeries {
    public static void main(String[] args) {
        String url = "jdbc:postgresql://localhost:8812/qdb";
        Properties props = new Properties();
        props.setProperty("user", "admin");
        props.setProperty("password", "quest");
        props.setProperty("sslmode", "disable");

        // By default, the PostgreSQL JDBC driver (PG JDBC) assumes that
        // timestamps retrieved from the database are in the JVM's local timezone.
        // However, QuestDB stores timestamps in UTC. To ensure correct interpretation
        // and avoid unintended timezone conversions, we explicitly instruct the
        // PG JDBC driver to interpret all retrieved timestamps as UTC.
        // This is achieved by providing a Calendar object configured to UTC
        // when calling ResultSet.getTimestamp().
        java.util.Calendar utcCalendar = Calendar.getInstance();
        utcCalendar.setTimeZone(TimeZone.getTimeZone("UTC"));

        try (Connection conn = DriverManager.getConnection(url, props);
             Statement stmt = conn.createStatement()) {

            // SAMPLE BY query (time-based downsampling)
            String sampleByQuery =
                    "SELECT timestamp, symbol, avg(price) as avg_price, min(price) as min_price, max(price) as max_price " +
                            "FROM trades " +
                            "WHERE timestamp >= dateadd('d', -7, now()) " +
                            "SAMPLE BY 1h";

            System.out.println("Executing SAMPLE BY query...");
            try (ResultSet rs1 = stmt.executeQuery(sampleByQuery)) {
                while (rs1.next()) {
                    System.out.printf("Time: %s, Symbol: %s, Avg Price: %.2f, Range: %.2f - %.2f%n",
                            rs1.getTimestamp("timestamp", utcCalendar),
                            rs1.getString("symbol"),
                            rs1.getDouble("avg_price"),
                            rs1.getDouble("min_price"),
                            rs1.getDouble("max_price"));
                }
            }

            // LATEST ON query (last value per group)
            String latestByQuery = "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol";

            System.out.println("\nExecuting LATEST ON query...");
            try (ResultSet rs2 = stmt.executeQuery(latestByQuery)) {
                while (rs2.next()) {
                    System.out.printf("Symbol: %s, Latest Price: %.2f at %s%n",
                            rs2.getString("symbol"),
                            rs2.getDouble("price"),
                            rs2.getTimestamp("timestamp", utcCalendar));
                }
            }
        } catch (SQLException e) {
            System.err.println("Query error: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### Integration with Spring Boot

For Spring applications, here's an example using `JdbcTemplate`:

```java
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.TimeZone;

import com.zaxxer.hikari.HikariDataSource;

@SpringBootApplication
public class QuestDBSpringApplication {

	public static void main(String[] args) {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
		SpringApplication.run(QuestDBSpringApplication.class, args);
	}
}

class Trade {
	private Instant instant;
	private String symbol;
	private double price;
	private double amount;

	@Override
	public String toString() {
		return "Trade{" +
				"timestamp='" + instant + '\'' +
				", symbol='" + symbol + '\'' +
				", price=" + price +
				", amount=" + amount +
				'}';
	}

	public void setInstant(Instant instant) {
		this.instant = instant;
	}

	public Instant getInstant() {
		return instant;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setPrice(double price) {
		this.price = price;
	}

	public double getPrice() {
		return price;
	}

	public void setAmount(double amount) {
		this.amount = amount;
	}

	public double getAmount() {
		return amount;
	}
}

class TradeRowMapper implements RowMapper<Trade> {
	@Override
	public Trade mapRow(ResultSet rs, int rowNum) throws SQLException {
		Trade trade = new Trade();
		trade.setInstant(rs.getTimestamp("timestamp").toInstant());
		trade.setSymbol(rs.getString("symbol"));
		trade.setPrice(rs.getDouble("price"));
		trade.setAmount(rs.getDouble("amount"));
		return trade;
	}
}

@Repository
class TradeRepository {
	private final JdbcTemplate jdbcTemplate;

	@Autowired
	public TradeRepository(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public List<Trade> findRecentTrades(String symbol, int limit) {
		String sql = "SELECT * FROM trades WHERE symbol = ? ORDER BY timestamp DESC LIMIT ?";
		return jdbcTemplate.query(sql, new TradeRowMapper(), symbol, limit);
	}

	public List<Trade> findLatestTradesForAllSymbols() {
		String sql = "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol";
		return jdbcTemplate.query(sql, new TradeRowMapper());
	}
}

@Service
class TradeService {
	private final TradeRepository tradeRepository;

	@Autowired
	public TradeService(TradeRepository tradeRepository) {
		this.tradeRepository = tradeRepository;
	}

	public List<Trade> getRecentTrades(String symbol, int limit) {
		return tradeRepository.findRecentTrades(symbol, limit);
	}

	public List<Trade> getLatestTradesForAllSymbols() {
		return tradeRepository.findLatestTradesForAllSymbols();
	}
}

@RestController
class TradeController {
	private final TradeService tradeService;

	@Autowired
	public TradeController(TradeService tradeService) {
		this.tradeService = tradeService;
	}

	@GetMapping("/api/trades")
	public List<Trade> getTrades(@RequestParam(required = false) String symbol,
								 @RequestParam(defaultValue = "10") int limit) {
		if (symbol != null) {
			return tradeService.getRecentTrades(symbol, limit);
		} else {
			return tradeService.getLatestTradesForAllSymbols();
		}
	}
}
```

Add Spring Boot and JDBC dependencies to your project:

#### Maven

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.5</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>
    <description>Demo project for Spring Boot</description>

    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-jdbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>

```

And create the `application.properties` file in `src/main/resources`:

```properties
spring.application.name=demo
spring.datasource.url=jdbc:postgresql://localhost:8812/qdb
spring.datasource.username=admin
spring.datasource.password=quest
```

### Known Limitations with QuestDB

When using the PostgreSQL JDBC driver with QuestDB, be aware of these limitations:
- Some PostgreSQL-specific features like scrollable cursors may not be fully supported
- Complex transaction patterns might have compatibility issues
- QuestDB does not support all PostgreSQL data types
- Some metadata queries (like those used by database tools) might not work as expected

### Performance Tips

- Use connection pooling for better performance
- Set appropriate fetch sizes for large result sets
- Use prepared statements for frequently executed queries
- Leverage QuestDB's time-series functions like `SAMPLE BY` and `LATEST ON`

## R2DBC-PostgreSQL

[R2DBC-PostgreSQL](https://github.com/pgjdbc/r2dbc-postgresql) is a reactive PostgreSQL driver that implements the R2DBC
SPI. It enables reactive programming with PostgreSQL databases, allowing for non-blocking database operations.

### Features

- Reactive programming model
- Non-blocking database operations
- Support for PostgreSQL-specific features
- Connection pooling
- Parameterized queries

### Installation

To use R2DBC-PostgreSQL in your project, add the following dependencies:

#### Maven

```xml
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>r2dbc-postgresql</artifactId>
    <version>1.0.7.RELEASE</version>
</dependency>
<dependency>
    <groupId>io.projectreactor</groupId>
    <artifactId>reactor-core</artifactId>
    <version>3.7.3</version>
</dependency>
```

#### Gradle

```
implementation 'org.postgresql:r2dbc-postgresql:1.0.7.RELEASE'
implementation 'io.projectreactor:reactor-core:3.7.3'
```

### Basic Connection

```java
import io.r2dbc.postgresql.PostgresqlConnectionConfiguration;
import io.r2dbc.postgresql.PostgresqlConnectionFactory;
import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Mono;

public class QuestDBR2dbcConnection {
    public static void main(String[] args) {
        ConnectionFactory connectionFactory = new PostgresqlConnectionFactory(
                PostgresqlConnectionConfiguration.builder()
                        .host("localhost")
                        .port(8812)
                        .username("admin")
                        .password("quest")
                        .database("qdb")
                        .timeZone("UTC")
                        .build()
        );

        Mono<Connection> connectionMono = Mono.from(connectionFactory.create());

        connectionMono.flatMapMany(connection ->
                Mono.from(connection.createStatement("SELECT version()").execute())
                        .flatMapMany(result -> result.map((row, metadata) -> row.get(0, String.class)))
                        .doOnNext(version -> System.out.println("Connected to QuestDB version: " + version))
                        .doFinally(signalType -> connection.close())
        ).blockLast();
    }
}
```

### Querying Data

```java
import io.r2dbc.postgresql.PostgresqlConnectionConfiguration;
import io.r2dbc.postgresql.PostgresqlConnectionFactory;
import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;

public class QuestDBR2dbcQuery {
    public static void main(String[] args) {
        ConnectionFactory connectionFactory = new PostgresqlConnectionFactory(
                PostgresqlConnectionConfiguration.builder()
                        .host("localhost")
                        .port(8812)
                        .username("admin")
                        .password("quest")
                        .database("qdb")
                        .timeZone("UTC")
                        .build()
        );

        Mono<Connection> connectionMono = Mono.from(connectionFactory.create());
        connectionMono.flatMapMany(connection ->
                Flux.from(connection.createStatement("SELECT * FROM trades LIMIT 10").execute())
                        .flatMap(result -> result.map((row, metadata) -> {
                            Instant timestamp = row.get("timestamp", Instant.class);
                            String symbol = row.get("symbol", String.class);
                            Double price = row.get("price", Double.class);

                            return String.format("Timestamp: %s, Symbol: %s, Price: %.2f",
                                    timestamp, symbol, price);
                        }))
                        .doOnNext(System.out::println)
                        .doFinally(signalType -> connection.close())
        ).blockLast();
    }
}
```

### Parameterized Queries

```java
import io.r2dbc.postgresql.PostgresqlConnectionConfiguration;
import io.r2dbc.postgresql.PostgresqlConnectionFactory;
import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public class QuestDBR2dbcParameterizedQuery {
    public static void main(String[] args) {
        ConnectionFactory connectionFactory = new PostgresqlConnectionFactory(
                PostgresqlConnectionConfiguration.builder()
                        .host("localhost")
                        .port(8812)
                        .username("admin")
                        .password("quest")
                        .database("qdb")
                        .timeZone("UTC")
                        .build()
        );

        Mono<Connection> connectionMono = Mono.from(connectionFactory.create());
        String symbolParam = "BTC-USD";
        LocalDateTime startTimeParam = LocalDateTime.now().minusDays(7000);

        connectionMono.flatMapMany(connection ->
                Flux.from(connection.createStatement(
                                        "SELECT * FROM trades WHERE symbol = $1 AND timestamp >= $2 ORDER BY timestamp LIMIT 10")
                                .bind("$1", symbolParam)
                                .bind("$2", startTimeParam.toInstant(ZoneOffset.UTC))
                                .execute())
                        .flatMap(result -> result.map((row, metadata) -> {
                            Instant timestamp = row.get("timestamp", Instant.class);
                            String symbol = row.get("symbol", String.class);
                            Double price = row.get("price", Double.class);

                            return String.format("Timestamp: %s, Symbol: %s, Price: %.2f",
                                    timestamp, symbol, price);
                        }))
                        .doOnNext(System.out::println)
                        .doFinally(signalType -> connection.close())
        ).blockLast();
    }
}
```

### Connection Pooling with R2DBC

R2DBC provides a connection pool implementation that can be used with any R2DBC driver:

```java
import io.r2dbc.postgresql.PostgresqlConnectionConfiguration;
import io.r2dbc.postgresql.PostgresqlConnectionFactory;
import io.r2dbc.pool.ConnectionPool;
import io.r2dbc.pool.ConnectionPoolConfiguration;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Flux;
import java.time.Duration;

public class QuestDBR2dbcConnectionPool {
    public static void main(String[] args) {
        ConnectionFactory connectionFactory = new PostgresqlConnectionFactory(
                PostgresqlConnectionConfiguration.builder()
                        .host("localhost")
                        .port(8812)
                        .username("admin")
                        .password("quest")
                        .database("qdb")
                        .timeZone("UTC")
                        .build()
        );

        ConnectionPoolConfiguration poolConfig = ConnectionPoolConfiguration.builder(connectionFactory)
                .maxIdleTime(Duration.ofMinutes(30))
                .initialSize(5)
                .maxSize(10)
                .maxCreateConnectionTime(Duration.ofSeconds(5))
                .acquireRetry(3)
                .validationQuery("SELECT 1")
                .build();

        ConnectionPool pool = new ConnectionPool(poolConfig);

        Flux.from(pool.create())
                .flatMap(connection ->
                        Flux.from(connection.createStatement("SELECT * FROM trades LIMIT 5").execute())
                                .flatMap(result -> result.map((row, metadata) ->
                                        row.get("symbol", String.class) + ": " + row.get("price", Double.class)))
                                .doFinally(signalType -> connection.close())
                )
                .doOnNext(System.out::println)
                .doFinally(signalType -> pool.dispose())
                .blockLast();
    }
}
```

Add the R2DBC Pool dependency:

#### Maven

```xml
<dependency>
    <groupId>io.r2dbc</groupId>
    <artifactId>r2dbc-pool</artifactId>
    <version>1.0.2.RELEASE</version>
</dependency>
```

#### Gradle

```
implementation 'io.r2dbc:r2dbc-pool:1.0.2.RELEASE'
```


### QuestDB Time-Series Queries with R2DBC

```java
import io.r2dbc.postgresql.PostgresqlConnectionConfiguration;
import io.r2dbc.postgresql.PostgresqlConnectionFactory;
import io.r2dbc.spi.Connection;
import io.r2dbc.spi.ConnectionFactory;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Instant;

public class QuestDBR2dbcTimeSeries {
    public static void main(String[] args) {
        ConnectionFactory connectionFactory = new PostgresqlConnectionFactory(
                PostgresqlConnectionConfiguration.builder()
                        .host("localhost")
                        .port(8812)
                        .username("admin")
                        .password("quest")
                        .database("qdb")
                        .timeZone("UTC")
                        .build()
        );

        Mono<Connection> connectionMono = Mono.from(connectionFactory.create());

        // SAMPLE BY query
        System.out.println("Executing SAMPLE BY query...");
        connectionMono.flatMapMany(connection ->
                Flux.from(connection.createStatement(
                                        "SELECT timestamp, symbol, avg(price) as avg_price, min(price) as min_price, max(price) as max_price " +
                                                "FROM trades " +
                                                "WHERE timestamp >= dateadd('d', -7, now()) " +
                                                "SAMPLE BY 1h")
                                .execute())
                        .flatMap(result -> result.map((row, metadata) -> {
                            Instant time = row.get("timestamp", Instant.class);
                            String symbol = row.get("symbol", String.class);
                            Double avgPrice = row.get("avg_price", Double.class);
                            Double minPrice = row.get("min_price", Double.class);
                            Double maxPrice = row.get("max_price", Double.class);

                            return String.format("Time: %s, Symbol: %s, Avg Price: %.2f, Range: %.2f - %.2f",
                                    time, symbol, avgPrice, minPrice, maxPrice);
                        }))
                        .doOnNext(System.out::println)
                        .doFinally(signalType -> connection.close())
        ).blockLast();

        // LATEST ON query
        System.out.println("\nExecuting LATEST ON query...");
        connectionMono = Mono.from(connectionFactory.create());
        connectionMono.flatMapMany(connection ->
                Flux.from(connection.createStatement("SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol").execute())
                        .flatMap(result -> result.map((row, metadata) -> {
                            String symbol = row.get("symbol", String.class);
                            Double price = row.get("price", Double.class);
                            Instant timestamp = row.get("timestamp", Instant.class);

                            return String.format("Symbol: %s, Latest Price: %.2f at %s",
                                    symbol, price, timestamp);
                        }))
                        .doOnNext(System.out::println)
                        .doFinally(signalType -> connection.close())
        ).blockLast();
    }
}
```

### Integration with Spring Data R2DBC

For Spring applications, you can use Spring Data R2DBC:

```java
package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.annotation.Id;
import org.springframework.data.r2dbc.repository.Query;
import org.springframework.data.r2dbc.repository.R2dbcRepository;
import org.springframework.data.relational.core.mapping.Column;
import org.springframework.data.relational.core.mapping.Table;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import java.time.Instant;
import java.util.TimeZone;

@SpringBootApplication
public class QuestDBSpringDataR2dbcApplication {

	public static void main(String[] args) {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
		SpringApplication.run(QuestDBSpringDataR2dbcApplication.class, args);
	}

}

@Table("trades")
class Trade {
	@Id
	@Column("timestamp")
	private Instant timestamp;

	@Column("symbol")
	private String symbol;

	@Column("price")
	private Double price;

	@Column("amount")
	private Double amount;


	@Override
	public String toString() {
		return "Trade{" +
				"timestamp='" + timestamp + '\'' +
				", symbol='" + symbol + '\'' +
				", price=" + price +
				", amount=" + amount +
				'}';
	}

	public Instant getTimestamp() {
		return timestamp;
	}

	public void setTimestamp(Instant timestamp) {
		this.timestamp = timestamp;
	}

	public String getSymbol() {
		return symbol;
	}

	public void setSymbol(String symbol) {
		this.symbol = symbol;
	}

	public Double getPrice() {
		return price;
	}

	public void setPrice(Double price) {
		this.price = price;
	}

	public Double getAmount() {
		return amount;
	}

	public void setAmount(Double amount) {
		this.amount = amount;
	}
}

interface TradeRepository extends R2dbcRepository<Trade, String> {

	@Query("SELECT * FROM trades WHERE symbol = $1 ORDER BY timestamp DESC LIMIT $2")
	Flux<Trade> findRecentTradesBySymbol(String symbol, int limit);

	@Query("SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol")
	Flux<Trade> findLatestTradesForAllSymbols();
}

@RestController
class TradeController {

	private final TradeRepository tradeRepository;

	public TradeController(TradeRepository tradeRepository) {
		this.tradeRepository = tradeRepository;
	}

	@GetMapping("/api/trades")
	public Flux<Trade> getTrades(@RequestParam(required = false) String symbol,
								 @RequestParam(defaultValue = "10") int limit) {
		if (symbol != null) {
			return tradeRepository.findRecentTradesBySymbol(symbol, limit);
		} else {
			return tradeRepository.findLatestTradesForAllSymbols();
		}
	}
}
```

Add Spring Data R2DBC dependencies:

#### Maven

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.4.5</version>
        <relativePath/> <!-- lookup parent from repository -->
    </parent>
    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>
    <description>Demo project for Spring Boot</description>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-r2dbc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>r2dbc-postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>

</project>
```

And create the `application.properties` file in `src/main/resources`:

```properties
spring.application.name=demo
spring.r2dbc.url=r2dbc:postgresql://localhost:8812/qdb
spring.r2dbc.username=admin
spring.r2dbc.password=quest
```

### Known Limitations with QuestDB

When using R2DBC-PostgreSQL with QuestDB, be aware of these limitations:

- Some PostgreSQL-specific features may not be fully supported
- R2DBC is a newer standard and may have fewer tools and resources compared to JDBC
- Complex reactive streams might be harder to debug
- QuestDB does not support all PostgreSQL data types

### Performance Tips

- Use connection pooling for better performance
- Use parameterized queries to avoid SQL injection and improve performance
- Leverage QuestDB's time-series functions like `SAMPLE BY` and `LATEST ON`
- Be mindful of backpressure when working with large result sets

## Best Practices for QuestDB Time Series Queries

QuestDB provides specialized time-series functions that work well with Java clients:

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

1. Verify that QuestDB is running and the PGWire port (8812) is accessible
2. Check that the connection parameters (host, port, user, password) are correct
3. Make sure your network allows connections to the QuestDB server
4. Check if the QuestDB server logs show any connection errors

### Query Errors

For query-related errors:

1. Verify that the table you're querying exists
2. Check the syntax of your SQL query
3. Ensure that you're using the correct data types for parameters
4. Look for any unsupported PostgreSQL features that might be causing issues

## Conclusion

QuestDB's support for the PostgreSQL Wire Protocol allows you to use standard Java PostgreSQL clients for querying
time-series data. Both the PostgreSQL JDBC Driver and R2DBC-PostgreSQL offer good performance and features for working
with QuestDB.

For most use cases, we recommend:

- **PostgreSQL JDBC Driver**: For traditional Java applications that use synchronous database operations
- **R2DBC-PostgreSQL**: For reactive Java applications that benefit from non-blocking database operations
- **Connection Pooling**: Always use connection pooling for production applications

For data ingestion, consider using QuestDB's first-party clients with the InfluxDB Line Protocol (ILP) for maximum
throughput.

Remember that QuestDB is optimized for time-series data, so make the most of its specialized time-series functions like
`SAMPLE BY` and `LATEST ON` for efficient queries.
