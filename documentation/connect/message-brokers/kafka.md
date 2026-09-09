---
slug: /connect/message-brokers/kafka
title: Ingest data from Kafka
sidebar_label: Kafka
description: Stream data from Kafka to QuestDB. Set up the connector, map fields and timestamps, handle failed records, and prevent duplicates.
---

Use the QuestDB Kafka connector to stream data from Apache Kafka into QuestDB
tables. It handles data conversion, batching, and reconnects automatically.
Follow the [quick start](#quick-start) to send your first message, or see
[migration from HTTP](#legacy-ilp-transports) for an existing pipeline.

## Choosing an integration strategy

There are three ways to get data from Kafka into QuestDB:

| Strategy                                                    | Recommended for         | Complexity |
|-------------------------------------------------------------|-------------------------|------------|
| [QuestDB Kafka connector](#questdb-kafka-connect-connector) | Most users              | Low        |
| [Stream processing (Flink)](#stream-processing)             | Complex transformations | Medium     |
| [Custom program](#custom-program)                           | Special requirements    | High       |

<!-- Legacy anchor kept for inbound links from other docs pages -->
## QuestDB Kafka connector {#questdb-kafka-connect-connector}

The [QuestDB Kafka connector](https://github.com/questdb/kafka-questdb-connector)
is built on the [Kafka Connect framework](https://docs.confluent.io/platform/current/connect/index.html).
It also works with Kafka-compatible systems such as
[Redpanda](/docs/connect/message-brokers/redpanda/).

For new pipelines, use the
[QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/overview/) with
`ws::` or `wss::` (TLS). The connector records progress in Kafka only after
QuestDB confirms delivery. Enable [deduplication](#exactly-once-delivery) if
your table must not contain duplicate events.

### Quick start

This guide walks through setting up the connector to read JSON data from Kafka
and write it to QuestDB.

#### Prerequisites

- A running Apache Kafka 3.6 or newer broker (or a compatible system)
- A running QuestDB 10.0 or newer instance, reachable on port 9000
- QuestDB Kafka connector 0.24 or newer
- Java 17+ (JDK)

The examples use Kafka at `localhost:9092` and QuestDB at `localhost:9000`.
For Kafka setup, follow the [Apache Kafka quick start](https://kafka.apache.org/quickstart/).

#### Step 1: Install the connector

Download the `kafka-questdb-connector-<version>-bin.zip` archive from the
[connector releases](https://github.com/questdb/kafka-questdb-connector/releases).

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

```properties title="questdb-connector.properties"
name=questdb-sink
connector.class=io.questdb.kafka.QuestDBSinkConnector

# QuestDB connection (QWP over WebSocket)
client.conf.string=ws::addr=localhost:9000;

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

#### Step 3: Start the connector

In Kafka's `config/connect-standalone.properties`, set `bootstrap.servers` to
your broker address (`localhost:9092` for this example). From your Kafka
installation directory, create the topic and start the connector:

```shell
bin/kafka-topics.sh --create --if-not-exists --topic example-topic --bootstrap-server localhost:9092
bin/connect-standalone.sh config/connect-standalone.properties config/questdb-connector.properties
```

#### Step 4: Test the pipeline

From another terminal in your Kafka installation directory, publish a test message:

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

QuestDB assigns the timestamp when the message arrives, so your value will differ.

Next, choose a [timestamp source](#designated-timestamps) and review
[delivery guarantees](#fault-tolerance) before using the connector in production.

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
timestamp.units=millis
```

Supported units are `nanos`, `micros`, `millis`, `seconds`, and `auto` (the
default). Auto-detection supports timestamps after April 26, 1970.

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

<!-- Legacy anchor kept for inbound links from other docs pages -->
### Delivery guarantees {#fault-tolerance}

With QWP, delivery is **at least once**: the connector commits Kafka offsets
only after QuestDB acknowledges the corresponding rows. Records without
confirmation remain uncommitted and can be retried. You can route invalid
records to a [dead letter queue](#dead-letter-queue).

Retries can produce duplicates. For example, QuestDB may save a row just
before the connection drops, leaving the connector unsure whether it arrived.
Use deduplication if each event must appear only once, and keep source records
in Kafka long enough for [outage recovery](#outages-and-reconnects).

#### Exactly-once delivery

For exactly-once results, enable
[deduplication](/docs/concepts/deduplication/) on the target table with keys
that identify a unique event:

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    trade_id LONG,
    symbol SYMBOL,
    price DOUBLE,
    volume LONG
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, trade_id);
```

Here, `trade_id` is an event identifier supplied by your producer. Choose keys
that distinguish separate events, even when they share a timestamp.

Use a timestamp from the [message payload](#using-a-message-field) or
[Kafka metadata](#using-kafka-timestamps) so it stays the same on retry.
The default server-assigned timestamp changes on retry and cannot deduplicate
the event. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the full model.

#### Outages and reconnects

The connector reconnects and retries automatically after a connection drops.
If QuestDB is unreachable when a task starts, it retries every
`retry.backoff.ms` (default 3 seconds). Authentication and configuration errors
fail the task immediately; fix the error before restarting it.

If rows are pending and QuestDB confirms no further delivery for
`qwp.progress.timeout.ms` (default 5 minutes), the task fails. Restart it once
QuestDB is available. Increase this timeout if you need to tolerate longer
outages. A backlog that continues to drain resets the timer.

**Set Kafka retention to cover the outage and catch-up time.** A restarted
task resumes from its last committed offset only if those records still
exist. Kafka can expire uncommitted records; expired records cannot be
recovered by the connector.

#### Dead letter queue

Configure a dead letter queue (DLQ) to set aside invalid records for inspection
while valid records continue to QuestDB. Add these settings to your connector
configuration (`questdb-connector.properties`, or the connector JSON in
distributed mode):

```properties title="questdb-connector.properties"
errors.tolerance=all
errors.deadletterqueue.topic.name=dlq-questdb
# Use 1 for a single-broker development cluster
errors.deadletterqueue.topic.replication.factor=1
```

Both `errors.tolerance=all` and a DLQ topic are required. Choose a replication
factor appropriate for your production Kafka cluster.

By default, the connector sends records with conversion errors, oversized rows,
or schema mismatches to the DLQ. For example, a string sent to a `DOUBLE`
column is a schema mismatch. Without a usable DLQ, these errors stop the task.
Authentication errors and other server failures still stop the task.

The connector retries rejected batches to identify the invalid records. This
can slow ingestion. Set `dlq.send.batch.on.error=true` only if you prefer to
send the entire rejected batch to the DLQ, including any valid records in it.

A common cause of schema mismatches is a JSON field that switches between
integer and float. Pin such fields with the `doubles` option or pre-create the table, see
[Numeric type inference](#numeric-type-inference).

See the [Confluent DLQ documentation](https://developer.confluent.io/courses/kafka-connect/error-handling-and-dead-letter-queues/)
for details.

#### Shutdown and rebalances

During a normal shutdown or rebalance, the connector sends pending rows and
waits up to `qwp.commit.ack.timeout.ms` (default 500 ms) for confirmation before
Kafka Connect commits offsets. Unconfirmed records remain uncommitted and may
be delivered again by the next task. Deduplication prevents these retries
from creating duplicate rows.

### Performance tuning

Start with the defaults. Adjust batching if messages take too long to appear,
or buffer limits if network latency keeps the connector waiting for delivery
confirmations.

#### Batch size and latency

| Setting | Default | Use it to |
|---------|---------|-----------|
| `auto_flush_rows` | 75000 rows | Send a batch when it reaches this size |
| `auto_flush_interval` | 1000 ms | Send pending rows periodically, even while new records keep arriving |
| `allowed.lag` | 1000 ms | Limit how long the connector waits for more records before sending a partial batch when idle |

For smaller batches and more frequent sends:

```properties
client.conf.string=ws::addr=localhost:9000;auto_flush_rows=1000;auto_flush_interval=250;
allowed.lag=250
```

Smaller batches increase request overhead. The connector also sends pending
rows when Kafka Connect commits offsets.

#### Backpressure

The connector automatically pauses consumption when too many rows are waiting
for QuestDB to confirm delivery. It resumes when QuestDB catches up.

- `qwp.max.inflight.rows` (default 150,000) limits buffered and sent rows
  awaiting confirmation. This is a soft limit: a Kafka poll batch can exceed it.
- `sf_max_total_bytes` (default 128 MiB) limits memory used to buffer encoded
  rows awaiting confirmation.

On high-latency connections, larger limits allow more data to be sent while
waiting for confirmations, at the cost of more memory. For example:

```properties
qwp.max.inflight.rows=500000
client.conf.string=ws::addr=questdb.example.com:9000;sf_max_total_bytes=512m;
```

If the byte buffer stays full for `sf_append_deadline_millis` (default 30
seconds), the connector reconnects and retries unconfirmed records from Kafka.

#### Raw JSON fast path

:::caution Experimental

Test this mode with representative messages before using it in production.
Keep the default converter-based mode if you need value transformations or
schema-defined column types.

:::

For JSON object messages, you can let the connector parse the values directly
to reduce conversion work:

```properties
value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
value.format=json
```

For messages wrapped as `{"schema": {...}, "payload": {...}}`, set
`value.format=json_envelope`. Only `payload` becomes the row; the schema is
ignored. Choose the mode explicitly: `json` would turn the envelope into
`schema_*` and `payload_*` columns.

Before switching, check that:

- Your messages contain JSON objects. Top-level strings, numbers, and arrays
  are not supported.
- You do not use transformations that read or modify message values, such as
  the [array transforms](#transformations). Topic routing transforms
  such as `RegexRouter` still work.
- You do not use [composed timestamps](#composed-timestamps).
- Your table accepts types inferred from JSON values. Schema declarations
  such as `INT8` or `FLOAT32` are ignored; numbers become `LONG` or `DOUBLE`.
  Use `doubles` for fields that must always be sent as doubles.

The key still uses `key.converter`. Field mapping, nested-object flattening,
and numeric arrays remain available.

<details>
<summary>Additional JSON compatibility details</summary>

| Input or setting | Behavior in raw JSON mode |
|------------------|---------------------------|
| Duplicate field names | The first value is kept; the standard converter keeps the last |
| Integers outside the signed 64-bit range | Written as doubles, which can lose precision |
| Empty field names | Sent to the DLQ, or fail the task without one; the standard converter uses a column named `value` |
| Objects or arrays listed in `symbols` | Remain flattened objects or arrays, rather than becoming symbol columns |
| Objects inside arrays | Fail, or are skipped with `skip.unsupported.types=true` |
| Nesting deeper than 64 levels | Rejected as invalid data |
| Auto-created tables | Column order follows the JSON document and may differ from converter-based ingestion |

Use `ws` or `http` (or their TLS variants). With the legacy TCP transport,
malformed JSON fails the task even if a DLQ is configured.

</details>

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

#### StructArrayExplode

The `StructArrayExplode` SMT converts arrays of structs into **separate 1D
`double[]` columns**, one per struct field. Unlike `OrderBookToArray` which
produces a single 2D array column, this transform "explodes" each struct field
into its own column.

**Input:**

```json
{
  "symbol": "AAPL",
  "vols": [
    { "strike": 150.0, "ivol": 0.25 },
    { "strike": 160.0, "ivol": 0.22 }
  ]
}
```

**Output:**

```json
{
  "symbol": "AAPL",
  "strikes": [150.0, 160.0],
  "ivols": [0.25, 0.22]
}
```

**Configuration:**

```properties
transforms=explode
transforms.explode.type=io.questdb.kafka.StructArrayExplode$Value
transforms.explode.mappings=vols:strikes,ivols:strike,ivol
```

The `mappings` format is `sourceField:targetCol1,targetCol2:structField1,structField2;...`

Target columns and struct fields are paired positionally: `structField1` maps to
`targetCol1`, `structField2` maps to `targetCol2`, and so on. The number of
target columns must equal the number of struct fields.

Use semicolons to separate mappings from different source arrays:

```properties
transforms.explode.mappings=bids:bid_prices,bid_amounts:price,amount;asks:ask_prices,ask_amounts:price,amount
```

**Behavior:**
- All extracted values are converted to `double`
- Missing source fields are skipped (no error)
- Empty source arrays are skipped
- Null values inside structs cause an error
- If a target column name already exists in the input, it is replaced
- Works with both schema-based and schemaless messages

**Comparison with OrderBookToArray:**

| | OrderBookToArray | StructArrayExplode |
|---|---|---|
| Output | One 2D `double[][]` column | Separate 1D `double[]` columns |
| Mapping format | `source:target:field1,field2` | `source:target1,target2:field1,field2` |
| Use case | All fields in one array column | Each field as its own column |

### Legacy ILP transports

The `http` and `https` protocols send rows as
[InfluxDB Line Protocol](/docs/connect/compatibility/ilp/overview/) over HTTP.
Use them with QuestDB versions before 10.0 or to keep an existing HTTP
pipeline. For new pipelines on QuestDB 10.0 or newer, use `ws` or `wss`.

```properties
client.conf.string=http::addr=localhost:9000;retry_timeout=60000;
```

HTTP retries temporary errors for up to `retry_timeout` milliseconds (default
10,000), then fails the task. The `qwp.*` options have no effect. You can still
use a DLQ for invalid records and deduplication to prevent duplicates on retry.

To migrate an HTTP pipeline to QWP:

1. Upgrade to QuestDB 10.0 or newer and connector 0.24 or newer.
2. Change `http::` to `ws::`, or `https::` to `wss::` for TLS.
3. Remove `retry_timeout` and other HTTP-only keys from `client.conf.string`.
   Keep your credentials and data mapping settings.
4. Enable [deduplication](#exactly-once-delivery) if duplicate events are not
   acceptable, and review [outage recovery](#outages-and-reconnects).

### Configuration reference

Set the QuestDB address and credentials in `client.conf.string`. Add data
mapping and delivery options as separate connector properties.

#### Connector options

| Name | Type | Example | Default | Description |
|------|------|---------|---------|-------------|
| client.conf.string | `string` | ws::addr=localhost:9000; | N/A | Client configuration string |
| topics | `string` | orders,audit | N/A | Kafka topics to read from |
| table | `string` | my_table | Topic name | Target table in QuestDB |
| key.converter | `string` | <sub>org.apache.kafka.connect.storage.StringConverter</sub> | N/A | Converter for Kafka keys |
| value.converter | `string` | <sub>org.apache.kafka.connect.json.JsonConverter</sub> | N/A | Converter for Kafka values |
| value.format | `string` | json | connect | Payload format: `connect`, `json`, or `json_envelope`. See [Raw JSON fast path](#raw-json-fast-path) |
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
| allowed.lag | `int` | 250 | 1000 | Maximum wait in milliseconds for new records before sending a partial batch when idle |
| retry.backoff.ms | `long` | 5000 | 3000 | Milliseconds to wait before reconnecting when QuestDB is unreachable. Not used by the HTTP transport |
| dlq.send.batch.on.error | `boolean` | true | false | Send a whole rejected batch to the dead letter queue, including any valid records in it. See [Dead letter queue](#dead-letter-queue) |

The connector uses Kafka Connect converters for deserialization and works with
any format they support, including JSON, Avro, and Protobuf. When using Schema
Registry, configure the appropriate converter (e.g.,
`io.confluent.connect.avro.AvroConverter`).

#### QWP delivery options

These options apply only to `ws` and `wss`. Start with the defaults; see
[outage recovery](#outages-and-reconnects) and
[performance tuning](#performance-tuning) before changing them.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| qwp.max.inflight.rows | `int` | 150000 | Soft limit on buffered or sent rows awaiting confirmation. Consumption pauses above this limit; the current Kafka poll batch can exceed it |
| qwp.progress.timeout.ms | `long` | 300000 | Milliseconds without delivery progress before the task fails while rows are pending. New acknowledgements reset the timer |

<details>
<summary>Advanced delivery options</summary>

| Name | Type | Default | Description |
|------|------|---------|-------------|
| qwp.commit.ack.timeout.ms | `long` | 500 | How long an offset commit waits for delivery confirmation, in milliseconds. On timeout, unconfirmed offsets remain uncommitted; this alone does not trigger redelivery |
| qwp.dlq.terminal.categories | `list` | SCHEMA_MISMATCH | Server errors eligible for the DLQ. Keep the default to avoid treating infrastructure failures as bad records |
| qwp.quarantine.ack.timeout.ms | `long` | 1000 | How long each batch waits for delivery confirmation while isolating a rejected record, in milliseconds |

Pre-release builds of the QWP transport used the names `max.inflight.rows` and
`progress.timeout.ms`. Rename them to
`qwp.max.inflight.rows` and `qwp.progress.timeout.ms`.

</details>

#### Client configuration string

The `client.conf.string` option configures how the connector communicates with
QuestDB. You can also set this via the `QDB_CLIENT_CONF` environment variable.

Format:

```
<protocol>::<key>=<value>;<key>=<value>;...;
```

Note the trailing semicolon.

**Supported protocols:**

| Protocol | Transport | Notes |
|----------|-----------|-------|
| `ws` | QWP over WebSocket | Recommended. Acknowledged delivery, automatic reconnects |
| `wss` | QWP over WebSocket with TLS | Requires QuestDB Enterprise, or a TLS-terminating proxy in front of QuestDB open source |
| `http`, `https` | ILP over HTTP | Legacy. See [Legacy ILP transports](#legacy-ilp-transports) |
| `tcp`, `tcps` | ILP over TCP | Not recommended. Offers no delivery guarantees |

**Required keys:**
- `addr` - QuestDB hostname and port (port defaults to 9000)

Examples:

```properties
# Minimal configuration
client.conf.string=ws::addr=localhost:9000;

# Basic authentication with the password from an environment variable
client.conf.string=ws::addr=questdb.example.com:9000;username=admin;password=${QUESTDB_PASSWORD};

# TLS with a bearer token (QuestDB Enterprise)
client.conf.string=wss::addr=questdb.example.com:9000;token=${QUESTDB_TOKEN};

# Multi-host failover (QuestDB Enterprise)
client.conf.string=wss::addr=node-a:9000,node-b:9000;token=${QUESTDB_TOKEN};
```

See the [connect string reference](/docs/connect/clients/connect-string/) for
all available client keys.

##### Batching and buffer options

These client settings apply to `ws` and `wss`. For examples, see
[performance tuning](#performance-tuning).

| Key | Behaviour in the connector |
|-----|----------------------------|
| `auto_flush_rows` | Send a batch at this many rows. Default: `75000`. Cannot be `off` |
| `auto_flush_interval` | Interval for sending pending rows, in milliseconds. Default: `1000`. Cannot be `off` |
| `sf_max_total_bytes` | Cap on the memory buffer of encoded, unacknowledged rows. Default: `128m` |
| `sf_append_deadline_millis` | How long sending can wait for buffer space, in milliseconds. Default: `30000`. Must be lower than the consumer's `max.poll.interval.ms` |

<details>
<summary>Client settings with connector-specific behavior</summary>

- Leave `auto_flush_bytes` enabled so batches fit the server's size limit.
- Omit `sf_dir` and `sf_durability`: disk buffering is not supported. Recovery
  relies on [Kafka retention](#outages-and-reconnects).
- Omit `initial_connect_retry` or set it to `off`. The connector handles
  startup retries using `retry.backoff.ms`; `reconnect_*` settings control
  retries after a connection drops.
- Leave `close_flush_timeout_millis` at its default of `0`. Increasing it
  delays shutdown without allowing more offsets to be committed.

</details>

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

### Sample projects

Additional examples are available on GitHub:

- [Sample projects](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples)
- [Debezium CDC integration](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/stocks)

## Stream processing

[Stream processing](/glossary/stream-processing/) engines like
[Apache Flink](https://flink.apache.org/) provide rich APIs for data
transformation, enrichment, and filtering with built-in fault tolerance.

QuestDB offers a [Flink connector](/docs/connect/message-brokers/flink/) for
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
and the blog post [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium/).

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

<details>
  <summary>The task fails with "QWP acknowledgements did not advance"</summary>

QuestDB has not confirmed further delivery for `qwp.progress.timeout.ms`
(default 5 minutes) while rows were pending. Check that QuestDB is available
and reachable from the Kafka Connect worker, then restart the task. See
[outage recovery](#outages-and-reconnects) for timeout and retention settings.

</details>

## See also

- [Delivery semantics](/docs/concepts/delivery-semantics/)
- [Connect string reference](/docs/connect/clients/connect-string/)
- [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium/)
- [Realtime crypto tracker with QuestDB Kafka Connector](/blog/realtime-crypto-tracker-with-questdb-kafka-connector/)
