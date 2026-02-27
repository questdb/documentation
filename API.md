# QuestDB API Documentation

## Overview

QuestDB provides multiple APIs for data ingestion and querying. This document covers all available APIs, protocols, and their usage.

QuestDB is a high-performance time-series database with category-leading ingestion throughput and fast SQL queries. It supports multiple protocols for data ingestion and querying.

## Quick Links

- [Web Console](#web-console) - Interactive GUI on port 9000
- [InfluxDB Line Protocol (ILP)](#influxdb-line-protocol-ilp) - High-performance ingestion
- [PostgreSQL Wire Protocol](#postgresql-wire-protocol) - Standard SQL queries
- [REST API](#rest-api) - HTTP-based queries and CSV import
- [Client Libraries](#client-libraries) - Language-specific clients

## Base URLs

QuestDB provides the following default endpoints:

| Protocol | Default Port | URL |
|----------|--------------|-----|
| HTTP REST API & Web Console | 9000 | `http://localhost:9000` |
| PostgreSQL Wire Protocol | 8812 | `localhost:8812` |
| InfluxDB Line Protocol (HTTP) | 9000 | `http://localhost:9000` |
| InfluxDB Line Protocol (TCP) | 9009 | `localhost:9009` |

## Authentication

### Basic Authentication

QuestDB supports HTTP Basic Authentication for REST API and ILP over HTTP:

```http
Authorization: Basic <base64-encoded-credentials>
```

Example with username `admin` and password `quest`:

```bash
curl -G http://localhost:9000/exec \
  -u admin:quest \
  --data-urlencode "query=SELECT * FROM trades"
```

### Bearer Token (Enterprise)

QuestDB Enterprise supports REST bearer token authentication:

```http
Authorization: Bearer <your-token>
```

### Configuration String Authentication

All first-party clients support authentication via configuration strings:

```
http::addr=localhost:9000;username=admin;password=quest;
```

For more details, see the [RBAC documentation](/docs/operations/rbac/#authentication).

## InfluxDB Line Protocol (ILP)

**Recommended for high-performance ingestion!**

ILP is the fastest way to insert data into QuestDB, offering:

- **Automatic table creation** - No need to define schema upfront
- **Concurrent schema changes** - Handle multiple data streams seamlessly
- **Optimized batching** - Strong defaults or custom batch sizes
- **Health checks and feedback** - Built-in health monitoring
- **Automatic write retries** - Connection reuse and retry logic

### ILP Format

```
table_name,tag1=value1,tag2=value2 field1=value1,field2=value2 timestamp
```

Example:

```
trades,symbol=ETH-USD,side=sell price=2615.54,amount=0.00044 1646762637609765000
trades,symbol=BTC-USD,side=sell price=39269.98,amount=0.001 1646762637710419000
```

### ILP over HTTP (Recommended)

Default port: `9000`

**Configuration:**

```
http::addr=localhost:9000;
```

**Features:**
- Transaction support
- Better error reporting
- Automatic protocol version negotiation
- Retry mechanism for recoverable errors

### ILP over TCP

Default port: `9009`

**Configuration:**

```
tcp::addr=localhost:9009;
```

**Note:** For array support, explicitly set protocol version 2:

```
tcp::addr=localhost:9009;protocol_version=2;
```

### Protocol Version

QuestDB 9.0.0+ supports Protocol Version 2 with:
- Binary encoding for arrays and float64 values
- Enhanced performance
- Array data type support

HTTP automatically negotiates the version. TCP defaults to version 1.

## REST API

The REST API is available on port `9000` and provides SQL query execution and CSV import functionality.

### Query Endpoint

Execute SQL queries via HTTP GET or POST.

**Endpoint:** `GET /exec`

**Parameters:**
- `query` (required): SQL query to execute
- `count` (optional): Return row count
- `limit` (optional): Limit result rows
- `nm` (optional): Skip metadata in response

**Example - GET Request:**

```bash
curl -G http://localhost:9000/exec \
  --data-urlencode "query=SELECT * FROM trades WHERE symbol='ETH-USD' LATEST ON timestamp PARTITION BY symbol"
```

**Example - POST Request:**

```bash
curl -X POST http://localhost:9000/exec \
  -d "query=SELECT * FROM trades LIMIT 10"
```

**Response Format:**

```json
{
  "query": "SELECT * FROM trades LIMIT 2",
  "columns": [
    {"name": "symbol", "type": "SYMBOL"},
    {"name": "side", "type": "SYMBOL"},
    {"name": "price", "type": "DOUBLE"},
    {"name": "amount", "type": "DOUBLE"},
    {"name": "timestamp", "type": "TIMESTAMP"}
  ],
  "dataset": [
    ["ETH-USD", "sell", 2615.54, 0.00044, "2022-03-08T18:03:57.609765Z"],
    ["BTC-USD", "sell", 39269.98, 0.001, "2022-03-08T18:03:57.710419Z"]
  ],
  "count": 2
}
```

### CSV Import Endpoint

Import CSV data via REST API.

**Endpoint:** `POST /imp`

**Parameters:**
- `name` (optional): Table name
- `timestamp` (optional): Designated timestamp column
- `partitionBy` (optional): Partition strategy (HOUR, DAY, WEEK, MONTH, YEAR)
- `overwrite` (optional): Overwrite existing data

**Example:**

```bash
curl -F data=@data.csv \
  'http://localhost:9000/imp?name=trades&timestamp=timestamp&partitionBy=DAY'
```

**Response:**

```
HTTP/1.1 200 OK
Server: questDB/1.0
Date: Thu, 08 Mar 2022 18:03:57 GMT
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8

+-----------------------------------------------------------------------+
|      Location:  |               trades  |        Pattern  | Locale  |
|   Partition by  |                  DAY  |                 |         |
|      Timestamp  |            timestamp  |                 |         |
+-----------------------------------------------------------------------+
|   Rows handled  |              1000000  |                 |         |
|  Rows imported  |              1000000  |                 |         |
+-----------------------------------------------------------------------+
```

For detailed CSV import options, see the [CSV Import Guide](/docs/guides/import-csv/).

## PostgreSQL Wire Protocol

QuestDB supports the PostgreSQL Wire Protocol on port `8812`, allowing you to use standard PostgreSQL clients and tools.

**Features:**
- Most PostgreSQL keywords and functions
- Parameterized queries
- `psql` command-line tool support
- Compatible with PostgreSQL drivers (JDBC, psycopg2, node-postgres, etc.)

**Connection String:**

```
postgresql://admin:quest@localhost:8812/qdb
```

**Example with psql:**

```bash
psql -h localhost -p 8812 -U admin -d qdb
```

**Example Query:**

```sql
SELECT * FROM trades
WHERE timestamp > dateadd('d', -1, now())
SAMPLE BY 1h;
```

**Note:** While PGWire is supported, we recommend using first-party clients or ILP for maximum ingestion performance.

For more details, see the [PostgreSQL Wire Protocol documentation](/docs/reference/api/postgres/).

## Client Libraries

QuestDB provides official client libraries for multiple languages, all using the high-performance ILP protocol.

### Java Client

**Installation (Maven):**

```xml
<dependency>
  <groupId>org.questdb</groupId>
  <artifactId>questdb</artifactId>
  <version>LATEST_VERSION</version>
</dependency>
```

**Example:**

```java
try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
    sender.table("trades")
          .symbol("symbol", "ETH-USD")
          .symbol("side", "sell")
          .doubleColumn("price", 2615.54)
          .doubleColumn("amount", 0.00044)
          .atNow();
    sender.flush();
}
```

[Full Java Client Documentation](/docs/clients/java_ilp/)

### Python Client

**Installation:**

```bash
pip install questdb
```

**Example:**

```python
from questdb.ingress import Sender, TimestampNanos

conf = 'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.row(
        'trades',
        symbols={'symbol': 'ETH-USD', 'side': 'sell'},
        columns={'price': 2615.54, 'amount': 0.00044},
        at=TimestampNanos.now())
    sender.flush()
```

[Full Python Client Documentation](/docs/clients/ingest-python/)

### Node.js Client

**Installation:**

```bash
npm install @questdb/nodejs-client
```

**Example:**

```javascript
const { Sender } = require('@questdb/nodejs-client');

async function run() {
  const sender = Sender.fromConfig('http::addr=localhost:9000');

  await sender
    .table('trades')
    .symbol('symbol', 'ETH-USD')
    .symbol('side', 'sell')
    .floatColumn('price', 2615.54)
    .floatColumn('amount', 0.00044)
    .atNow();

  await sender.flush();
  await sender.close();
}

run().catch(console.error);
```

[Full Node.js Client Documentation](/docs/clients/ingest-node/)

### Other Clients

QuestDB also provides clients for:
- [C/C++](/docs/clients/ingest-c-and-cpp/)
- [.NET](/docs/clients/ingest-dotnet/)
- [Go](/docs/clients/ingest-go/)
- [Rust](/docs/clients/ingest-rust/)

## Configuration Options

All clients support a unified configuration string format:

```
<protocol>::<key>=<value>;<key>=<value>;
```

**Common Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `addr` | Server address and port | `localhost:9000` (HTTP), `localhost:9009` (TCP) |
| `username` | Username for basic auth | - |
| `password` | Password for basic auth | - |
| `token` | Bearer token (Enterprise) | - |
| `auto_flush_rows` | Auto-flush after N rows | 75000 (HTTP), 600 (TCP) |
| `auto_flush_interval` | Auto-flush after N milliseconds | 1000 |
| `retry_timeout` | Retry timeout in milliseconds | 10000 |
| `protocol_version` | ILP protocol version (1 or 2) | Auto-negotiated (HTTP), 1 (TCP) |

For a complete list, see the [Configuration String documentation](/docs/configuration-string/).

## Data Types

QuestDB supports the following data types:

| Type | Description | ILP Field Type |
|------|-------------|----------------|
| `SYMBOL` | Interned string for categorical data | Tag |
| `STRING` | Variable-length string | Field |
| `DOUBLE` | 64-bit floating point | Field |
| `FLOAT` | 32-bit floating point | Field |
| `LONG` | 64-bit integer | Field |
| `INT` | 32-bit integer | Field |
| `SHORT` | 16-bit integer | Field |
| `BYTE` | 8-bit integer | Field |
| `BOOLEAN` | Boolean value | Field |
| `TIMESTAMP` | Timestamp in microseconds | Timestamp |
| `DATE` | Date value | Field |
| `ARRAY` | 1D, 2D, or higher dimensional arrays | Field (Protocol v2) |

## Arrays (Protocol Version 2)

QuestDB 9.0.0+ supports array ingestion with Protocol Version 2:

**Python Example:**

```python
import numpy as np
from questdb.ingress import Sender

conf = 'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.row(
        'fx_order_book',
        symbols={'symbol': 'EUR/USD'},
        columns={
            'bids': np.array([[1.0850, 600000], [1.0849, 300000]], dtype=np.float64),
            'asks': np.array([[1.0853, 500000], [1.0854, 250000]], dtype=np.float64)
        },
        at=TimestampNanos.now())
    sender.flush()
```

## Error Handling

### HTTP Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid query or malformed request
- `401 Unauthorized` - Authentication failed
- `404 Not Found` - Endpoint not found
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "query": "SELECT * FROM non_existent_table",
  "error": "table does not exist [table=non_existent_table]",
  "position": 14
}
```

### ILP Error Handling

**HTTP Transport:**
- Automatic retries for recoverable errors
- Configurable retry timeout via `retry_timeout`
- Non-recoverable errors: invalid data, authentication errors
- Throws exception after timeout expires

**TCP Transport:**
- No error feedback mechanism
- Disconnects on error
- Client becomes unusable after exception

## Designated Timestamps

Every row in QuestDB should have a designated timestamp. There are two approaches:

### 1. User-Assigned Timestamp (Recommended)

Use the original event timestamp:

```python
sender.row('trades', symbols={...}, columns={...}, at=event_timestamp)
```

### 2. Server-Assigned Timestamp

Let the server assign the current time:

```python
sender.row('trades', symbols={...}, columns={...}, at=TimestampNanos.now())
```

**Best Practice:** Use event timestamps for:
- Accurate historical data
- Deduplication support
- Exactly-once processing

For more information, see the [Designated Timestamp documentation](/docs/concept/designated-timestamp/).

## Web Console

The Web Console is available at `http://localhost:9000` and provides:

- Interactive SQL query editor with syntax highlighting
- Schema explorer
- Query visualization
- CSV import UI
- Table creation and management
- Query history

For details, see the [Web Console documentation](/docs/web-console/).

## Health Check

Check QuestDB server health:

**Endpoint:** `GET /status`

**Example:**

```bash
curl http://localhost:9000/status
```

**Response:**

```json
{
  "status": "Healthy"
}
```

## Performance Best Practices

1. **Use ILP over HTTP** for high-performance ingestion
2. **Send data in chronological order** (sorted by timestamp)
3. **Batch your inserts** - Use auto-flush settings or manual batching
4. **Use SYMBOL type** for categorical/repetitive string data
5. **Partition tables appropriately** - DAY, HOUR, WEEK, MONTH, or YEAR
6. **Use designated timestamps** from source data, not ingestion time
7. **Enable deduplication** for exactly-once processing

For more details, see the [Design for Performance guide](/docs/operations/design-for-performance/).

## Examples

### cURL - Execute Query

```bash
curl -G http://localhost:9000/exec \
  --data-urlencode "query=SELECT symbol, price, timestamp FROM trades WHERE symbol='BTC-USD' LATEST ON timestamp PARTITION BY symbol"
```

### cURL - Import CSV

```bash
curl -F data=@market_data.csv \
  'http://localhost:9000/imp?name=market_data&timestamp=ts&partitionBy=DAY'
```

### Java - Basic Ingestion

```java
try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
    for (Trade trade : trades) {
        sender.table("trades")
              .symbol("symbol", trade.getSymbol())
              .symbol("side", trade.getSide())
              .doubleColumn("price", trade.getPrice())
              .doubleColumn("amount", trade.getAmount())
              .at(trade.getTimestamp(), ChronoUnit.MICROS);
    }
    sender.flush();
}
```

### Python - Pandas DataFrame

```python
import pandas as pd
from questdb.ingress import Sender

df = pd.DataFrame({
    'symbol': pd.Categorical(['ETH-USD', 'BTC-USD']),
    'side': pd.Categorical(['sell', 'buy']),
    'price': [2615.54, 39269.98],
    'amount': [0.00044, 0.001],
    'timestamp': pd.to_datetime(['2022-03-08T18:03:57.609765Z', '2022-03-08T18:03:57.710419Z'])
})

conf = 'http::addr=localhost:9000;'
with Sender.from_conf(conf) as sender:
    sender.dataframe(df, table_name='trades', at='timestamp')
```

### Node.js - With Authentication

```javascript
const { Sender } = require('@questdb/nodejs-client');

async function ingest() {
  const sender = Sender.fromConfig(
    'http::addr=localhost:9000;username=admin;password=quest;'
  );

  await sender
    .table('metrics')
    .symbol('host', 'server01')
    .floatColumn('cpu', 78.5)
    .floatColumn('memory', 65.2)
    .at(Date.now(), 'ms');

  await sender.flush();
  await sender.close();
}

ingest().catch(console.error);
```

## Third-Party Integrations

QuestDB integrates with popular tools and platforms:

- [Apache Kafka](/docs/third-party-tools/kafka/)
- [Apache Flink](/docs/third-party-tools/flink/)
- [Telegraf](/docs/third-party-tools/telegraf/)
- [Grafana](/docs/third-party-tools/grafana/)
- [Pandas](/docs/third-party-tools/pandas/)
- [Redpanda](/docs/third-party-tools/redpanda/)

## Additional Resources

- [Query & SQL Overview](/docs/reference/sql/overview/)
- [ILP Overview](/docs/reference/api/ilp/overview/)
- [Configuration Reference](/docs/configuration/)
- [Schema Design Essentials](/docs/guides/schema-design-essentials/)
- [Working with Timestamps and Timezones](/docs/guides/working-with-timestamps-timezones/)
- [Community Forum](https://community.questdb.com/)

## Support

For API support and questions:
- **Community Forum:** https://community.questdb.com/
- **GitHub Issues:** https://github.com/questdb/questdb/issues
- **Documentation:** https://questdb.io/docs/

## Enterprise Features

QuestDB Enterprise offers additional features:
- **Replication** - High availability clusters
- **RBAC** - Role-based access control
- **OpenID Connect** - SSO integration
- **Multi-primary ingestion** - Write to multiple nodes

For more information, visit [QuestDB Enterprise](/enterprise/).
