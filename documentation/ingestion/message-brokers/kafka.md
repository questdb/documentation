---
title: Ingestion from Kafka Overview
sidebar_label: Kafka
description: Apache Kafka and QuestDB Kafka Connector overview and guide. Thorough explanations and examples.
---

QuestDB provides a first-party Kafka Connect connector for streaming data from
Apache Kafka into QuestDB tables. The connector handles serialization, fault
tolerance, and batching automatically, making it the recommended approach for
most use cases.

## Choosing an integration strategy

There are three ways to get data from Kafka into QuestDB:

| Strategy | Recommended for | Complexity |
|----------|-----------------|------------|
| [QuestDB Kafka connector](#questdb-kafka-connector) | Most users | Low |
| [Stream processing (Flink)](#stream-processing) | Complex transformations | Medium |
| [Custom program](#custom-program) | Special requirements | High |

**For most users, the QuestDB Kafka connector is the best choice.** It provides
excellent performance (100,000+ rows/second), handles fault tolerance
automatically, and requires minimal configuration.

## QuestDB Kafka connector

The [QuestDB Kafka connector](https://github.com/questdb/kafka-questdb-connector)
is built on the [Kafka Connect framework](https://docs.confluent.io/platform/current/connect/index.html)
and uses InfluxDB Line Protocol for high-performance data transfer. It works
with Kafka-compatible systems like [Redpanda](/docs/ingestion/message-brokers/redpanda/).

### Quick start

This guide walks through setting up the connector to read JSON data from Kafka
and write it to QuestDB.

#### Prerequisites

- Apache Kafka (or compatible system)
- QuestDB instance with HTTP endpoint accessible
- Java 17+ (JDK)

#### Step 1: Install the connector

Download and install the connector JAR files:

```shell
curl -s https://api.github.com/repos/questdb/kafka-questdb-connector/releases/latest |
jq -r '.assets[]|select(.content_type == "application/zip")|.browser_download_url'|
wget -qi -
```

Extract and copy to your Kafka installation:

```shell
unzip kafka-questdb-connector-*-bin.zip
cd kafka-questdb-connector
cp ./*.jar /path/to/kafka_*.*-*.*.*/libs
```

:::info

The connector is also available from
[Confluent Hub](https://www.confluent.io/hub/questdb/kafka-questdb-connector).
For Confluent platform users, see the
[Confluent Docker images sample](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/confluent-docker-images).

:::

#### Step 2: Configure the connector

Create a configuration file at `/path/to/kafka/config/questdb-connector.properties`:

```shell title="questdb-connector.properties"
name=questdb-sink
connector.class=io.questdb.kafka.QuestDBSinkConnector

# QuestDB connection
client.conf.string=http::addr=localhost:9000;

# Kafka source
topics=example-topic

# Target table (optional - defaults to topic name)
table=example_table

# Message format
key.converter=org.apache.kafka.connect.storage.StringConverter
value.converter=org.apache.kafka.connect.json.JsonConverter
value.converter.schemas.enable=false
include.key=false
```

#### Step 3: Start the services

Run these commands from your Kafka installation directory (single-node KRaft):

```shell
# Generate a unique cluster ID
KAFKA_CLUSTER_ID="$(bin/kafka-storage.sh random-uuid)"

# Format storage directories (run once)
bin/kafka-storage.sh format --standalone -t $KAFKA_CLUSTER_ID -c config/server.properties

# Start Kafka
bin/kafka-server-start.sh config/server.properties

# Start the connector (from another terminal)
bin/connect-standalone.sh config/connect-standalone.properties config/questdb-connector.properties
```

#### Step 4: Test the pipeline

Publish a test message:

```shell
bin/kafka-console-producer.sh --topic example-topic --bootstrap-server localhost:9092
```

Enter this JSON (as a single line):

```json
{"symbol": "AAPL", "price": 192.34, "volume": 1200}
```

Verify the data in QuestDB:

```shell
curl -G --data-urlencode "query=select * from 'example_table'" http://localhost:9000/exp
```

Expected output:

```csv
"symbol","price","volume","timestamp"
"AAPL",192.34,1200,"2026-02-03T15:10:00.000000Z"
```

The timestamp is assigned by QuestDB on ingestion, so the value you see will match your local ingest time.

### Configuration reference

The connector configuration has two parts:
- **Client configuration string**: How the connector connects to QuestDB
- **Connector options**: How the connector processes Kafka messages

#### Connector options

| Name | Type | Example | Default | Description |
|------|------|---------|---------|-------------|
| client.conf.string | `string` | http::addr=localhost:9000; | N/A | Client configuration string |
| topics | `string` | orders,audit | N/A | Kafka topics to read from |
| table | `string` | my_table | Topic name | Target table in QuestDB |
| key.converter | `string` | <sub>org.apache.kafka.connect.storage.StringConverter</sub> | N/A | Converter for Kafka keys |
| value.converter | `string` | <sub>org.apache.kafka.connect.json.JsonConverter</sub> | N/A | Converter for Kafka values |
| include.key | `boolean` | false | true | Include message key in target table |
| key.prefix | `string` | from_key | key | Prefix for key fields |
| value.prefix | `string` | from_value | N/A | Prefix for value fields |
| symbols | `string` | instrument,stock | N/A | Columns to create as [symbol](/docs/concepts/symbol/) type |
| doubles | `string` | volume,price | N/A | Columns to always send as double type |
| timestamp.field.name | `string` | pickup_time | N/A | Designated timestamp field. Use comma-separated names for [composed timestamps](#composed-timestamps) |
| timestamp.units | `string` | micros | auto | Timestamp field units: `nanos`, `micros`, `millis`, `seconds`, `auto` |
| timestamp.kafka.native | `boolean` | true | false | Use Kafka message timestamps as designated timestamps |
| timestamp.string.fields | `string` | creation_time | N/A | String fields containing textual timestamps |
| timestamp.string.format | `string` | yyyy-MM-dd HH:mm:ss.SSSUUU z | <sub>yyyy-MM-ddTHH:mm:ss.SSSUUUZ</sub> | Format for parsing string timestamps |
| skip.unsupported.types | `boolean` | false | false | Skip unsupported types instead of failing |
| allowed.lag | `int` | 250 | 1000 | Milliseconds to wait before flushing when no new events |

The connector uses Kafka Connect converters for deserialization and works with
any format they support, including JSON, Avro, and Protobuf. When using Schema
Registry, configure the appropriate converter (e.g.,
`io.confluent.connect.avro.AvroConverter`).

#### Client configuration string

The `client.conf.string` option configures how the connector communicates with
QuestDB. You can also set this via the `QDB_CLIENT_CONF` environment variable.

Format:

```
<protocol>::<key>=<value>;<key>=<value>;...;
```

Note the trailing semicolon.

**Supported protocols:** `http`, `https`

**Required keys:**
- `addr` - QuestDB hostname and port (port defaults to 9000)

Examples:

```properties
# Minimal configuration
client.conf.string=http::addr=localhost:9000;

# With HTTPS and retry timeout
client.conf.string=https::addr=questdb.example.com:9000;retry_timeout=60000;

# With authentication token from environment variable
client.conf.string=http::addr=localhost:9000;token=${QUESTDB_TOKEN};
```

See the [Java Client configuration guide](/docs/ingestion/clients/java) for all
available client options.

:::danger

The QuestDB client also supports TCP transport, but it is not recommended for
Kafka Connect because the TCP transport offers no delivery guarantees.

:::

##### Environment variable expansion

The `client.conf.string` supports `${VAR}` syntax for environment variable
expansion, useful for injecting secrets in Kubernetes environments:

| Pattern | Result |
|---------|--------|
| `${VAR}` | Replaced with environment variable value |
| `$$` | Escaped to literal `$` |
| `$${VAR}` | Escaped to literal `${VAR}` (not expanded) |
| `$VAR` | Not expanded (braces required) |

The connector fails to start if:
- A referenced environment variable is not defined
- A variable reference is malformed (e.g., unclosed braces `${VAR`)
- A variable name is empty (`${}`) or invalid (must start with letter or
  underscore, followed by letters, digits, or underscores)

:::warning

Environment variable values containing semicolons (`;`) will break the
configuration string parsing.

:::

### How data is mapped

The connector converts each Kafka message field to a QuestDB column. Nested
structures and maps are flattened with underscores.

**Example input:**

```json
{
  "firstname": "John",
  "lastname": "Doe",
  "age": 30,
  "address": {
    "street": "Main Street",
    "city": "New York"
  }
}
```

**Resulting table:**

| firstname | lastname | age | address_street | address_city |
|-----------|----------|-----|----------------|--------------|
| John | Doe | 30 | Main Street | New York |

### Designated timestamps

The connector supports four strategies for
[designated timestamps](/docs/concepts/designated-timestamp/):

| Strategy | Configuration | Use case |
|----------|--------------|----------|
| Server-assigned | (default) | QuestDB assigns timestamp on receipt |
| Message payload | `timestamp.field.name=fieldname` | Use a field from the message |
| Kafka metadata | `timestamp.kafka.native=true` | Use Kafka's message timestamp |
| Composed | `timestamp.field.name=date,time` | Combine multiple fields |

These strategies are mutually exclusive.

#### Using a message field

If your message contains a timestamp field:

```properties
timestamp.field.name=event_time
timestamp.units=millis  # or: nanos, micros, seconds, auto
```

The connector auto-detects units for timestamps after April 26, 1970.

#### Using Kafka timestamps

To use Kafka's built-in message timestamp:

```properties
timestamp.kafka.native=true
```

#### Parsing string timestamps

For timestamps stored as strings:

```properties
timestamp.field.name=created_at
timestamp.string.fields=updated_at,deleted_at
timestamp.string.format=yyyy-MM-dd HH:mm:ss.SSSUUU z
```

The `timestamp.field.name` field becomes the designated timestamp. Fields in
`timestamp.string.fields` are parsed as regular timestamp columns.

See [QuestDB timestamp format](/docs/query/functions/date-time/#timestamp-format)
for format patterns.

#### Composed timestamps

Some data sources split timestamps across multiple fields (common with KDB-style data):

```json
{
  "symbol": "BTC-USD",
  "date": "20260202",
  "time": "135010207"
}
```

Configure the connector to concatenate and parse them:

```properties
timestamp.field.name=date,time
timestamp.string.format=yyyyMMddHHmmssSSS
```

The fields `date` and `time` are concatenated into `20260202135010207`, parsed
to produce `2026-02-02T13:50:10.207000Z`. The source fields are consumed and do
not appear as columns in the output.

All listed fields must be present in each message.

### Fault tolerance

The connector automatically retries recoverable errors (network issues, server
unavailability, timeouts). Non-recoverable errors (invalid data, authentication
failures) are not retried.

Configure retry behavior via the client configuration:

```properties
# Retry for up to 60 seconds
client.conf.string=http::addr=localhost:9000;retry_timeout=60000;
```

Default retry timeout is 10,000 ms.

#### Exactly-once delivery

Retries may cause duplicate rows. To ensure exactly-once delivery, enable
[deduplication](/docs/concepts/deduplication/) on your target table.
Deduplication requires a designated timestamp from the message payload or Kafka
metadata.

#### Dead letter queue

For messages that fail due to non-recoverable errors (invalid data, schema
mismatches), configure a Dead Letter Queue to prevent the connector from
stopping. These settings must be configured in the **Kafka Connect worker
configuration** (e.g., `connect-standalone.properties` or
`connect-distributed.properties`), not in the connector configuration:

```properties
errors.tolerance=all
errors.deadletterqueue.topic.name=dlq-questdb
errors.deadletterqueue.topic.replication.factor=1
```

Failed messages are sent to the DLQ topic for later inspection.

See the [Confluent DLQ documentation](https://developer.confluent.io/courses/kafka-connect/error-handling-and-dead-letter-queues/)
for details.

### Performance tuning

#### Batch size

The connector batches messages before sending. Default batch size is 75,000 rows.
For low-throughput scenarios, reduce this to lower latency:

```properties
client.conf.string=http::addr=localhost:9000;auto_flush_rows=1000;
```

#### Flush interval

The connector flushes data when:
- Batch size is reached
- No new events for `allowed.lag` milliseconds (default: 1000)
- Kafka Connect commits offsets

```properties
# Flush after 250ms of no new events
allowed.lag=250
```

Configure offset commit frequency in Kafka Connect via `offset.flush.interval.ms`.
See [Kafka Connect configuration](https://docs.confluent.io/platform/current/connect/references/allconfigs.html).

### Type handling

#### Symbol columns

Use the `symbols` option to create columns as
[symbol](/docs/concepts/symbol/) type for better performance on
repeated string values:

```properties
symbols=instrument,exchange,currency
```

#### Numeric type inference

Without a schema, the connector infers types from values. This can cause issues
when a field is sometimes an integer and sometimes a float:

```json
{"volume": 42}      // Inferred as long
{"volume": 42.5}    // Error: column is long, value is double
```

Solutions:
1. Use the `doubles` option to force double type:
   ```properties
   doubles=volume,price
   ```
2. Pre-create the table with explicit column types using
   [CREATE TABLE](/docs/query/sql/create-table/)

### Target table options

#### Table naming

By default, the table name matches the Kafka topic name. Override with:

```properties
table=my_custom_table
```

The `table` option supports templating:

```properties
table=kafka_${topic}_${partition}
```

Available variables: `${topic}`, `${key}`, `${partition}`

If `${key}` is used and the message has no key, it resolves to `null`.

#### Schema management

Tables are created automatically when they don't exist. This is convenient for
development but in production, pre-create tables using
[CREATE TABLE](/docs/query/sql/create-table/) for control over partitioning,
indexes, and column types.

### Transformations

#### OrderBookToArray

The connector includes an `OrderBookToArray` Single Message Transform (SMT)
for converting arrays of structs into arrays of arrays. This is useful for
order book data or tabular data stored as rows that needs to be pivoted into
columnar form.

For querying order book data stored as arrays, see
[Order book analytics using arrays](/docs/tutorials/order-book/).

**Input:**

```json
{
  "symbol": "BTC-USD",
  "buy_entries": [
    { "price": 100.5, "size": 10.0 },
    { "price": 99.8, "size": 25.0 }
  ]
}
```

**Output:**

```json
{
  "symbol": "BTC-USD",
  "bids": [
    [100.5, 99.8],
    [10.0, 25.0]
  ]
}
```

**Configuration:**

```properties
transforms=orderbook
transforms.orderbook.type=io.questdb.kafka.OrderBookToArray$Value
transforms.orderbook.mappings=buy_entries:bids:price,size;sell_entries:asks:price,size
```

The `mappings` format is `sourceField:targetField:field1,field2;...`

**Behavior:**
- All extracted values are converted to `double`
- Missing source fields are skipped (no error)
- Empty source arrays are skipped
- Null values inside structs cause an error
- If the target field name already exists in the input, it is replaced
- Works with both schema-based and schemaless messages

:::note

QuestDB requires all inner arrays to have the same length. The OrderBookToArray
SMT satisfies this naturally since each inner array comes from the same source
entries.

:::

### Sample projects

Additional examples are available on GitHub:

- [Sample projects](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples)
- [Debezium CDC integration](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/stocks)

## Stream processing

[Stream processing](/glossary/stream-processing/) engines like
[Apache Flink](https://flink.apache.org/) provide rich APIs for data
transformation, enrichment, and filtering with built-in fault tolerance.

QuestDB offers a [Flink connector](/docs/ingestion/message-brokers/flink/) for
users who need complex transformations while ingesting from Kafka.

**Use stream processing when you need:**
- Complex stateful transformations
- Joining multiple data streams
- Windowed aggregations before writing to QuestDB

## Custom program

Writing a dedicated program to read from Kafka and write to QuestDB offers
maximum flexibility for arbitrary transformations and filtering.

**Trade-offs:**
- Full control over serialization, error handling, and batching
- Highest implementation complexity
- Must handle Kafka consumer groups, offset management, and retries

This approach is only recommended for advanced use cases where the Kafka
connector or stream processing cannot meet your requirements.

## FAQ

<details>
  <summary>Does the connector work with Schema Registry?</summary>

Yes. The connector relies on Kafka Connect converters for deserialization.
Configure converters using `key.converter` and `value.converter` options.
It works with Avro, JSON Schema, and other formats supported by Schema Registry.

</details>

<details>
  <summary>Does the connector work with Debezium?</summary>

Yes. QuestDB works well with [Debezium](https://debezium.io/) for
[change data capture](/glossary/change-data-capture/). Since QuestDB is
append-only, updates become new rows preserving history.

Use Debezium's `ExtractNewRecordState` transformation to extract the new record
state. DELETE events are dropped by default.

See the [Debezium sample project](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/stocks)
and the blog post [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium).

**Typical pattern:** Use a relational database for current state and QuestDB
for change history. For example, PostgreSQL holds current stock prices while
QuestDB stores the complete price history for analytics.

</details>

<details>
  <summary>How do I select which fields to include?</summary>

Use Kafka Connect's `ReplaceField` transformation:

```json
{
  "transforms": "removeFields",
  "transforms.removeFields.type": "org.apache.kafka.connect.transforms.ReplaceField$Value",
  "transforms.removeFields.blacklist": "address,internal_id"
}
```

See [ReplaceField documentation](https://docs.confluent.io/platform/current/connect/transforms/replacefield.html).

</details>

<details>
  <summary>I'm getting a JsonConverter schema error</summary>

If you see:
> JsonConverter with schemas.enable requires 'schema' and 'payload' fields

Your JSON data doesn't include a schema. Add to your configuration:

```properties
value.converter.schemas.enable=false
```

Or for keys:

```properties
key.converter.schemas.enable=false
```

</details>

## See also

- [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium)
- [Realtime crypto tracker with QuestDB Kafka Connector](/blog/realtime-crypto-tracker-with-questdb-kafka-connector)
