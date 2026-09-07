---
slug: /connect/message-brokers/kafka
title: Ingestion from Kafka Overview
sidebar_label: Kafka
description: Apache Kafka and QuestDB Kafka Connector overview and guide. Thorough explanations and examples.
---

QuestDB provides a first-party Kafka Connect connector for streaming data from
Apache Kafka into QuestDB tables. The connector speaks the
[QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/overview/) over
WebSocket, commits Kafka offsets only after QuestDB has acknowledged the rows,
and handles serialization, batching, and reconnects automatically. It is the
recommended approach for most use cases.

## Choosing an integration strategy

There are three ways to get data from Kafka into QuestDB:

| Strategy                                                    | Recommended for         | Complexity |
|-------------------------------------------------------------|-------------------------|------------|
| [QuestDB Kafka connector](#questdb-kafka-connect-connector) | Most users              | Low        |
| [Stream processing (Flink)](#stream-processing)             | Complex transformations | Medium     |
| [Custom program](#custom-program)                           | Special requirements    | High       |

**For most users, the QuestDB Kafka connector is the best choice.** It provides
excellent performance (100,000+ rows/second), handles fault tolerance
automatically, and requires minimal configuration.

<!-- Legacy anchor kept for inbound links from other docs pages -->
## QuestDB Kafka connector {#questdb-kafka-connect-connector}

The [QuestDB Kafka connector](https://github.com/questdb/kafka-questdb-connector)
is built on the [Kafka Connect framework](https://docs.confluent.io/platform/current/connect/index.html).
It streams rows to QuestDB over QWP, selected with a `ws::` or `wss::`
[client configuration string](#client-configuration-string), and works with
Kafka-compatible systems like [Redpanda](/docs/connect/message-brokers/redpanda/).
The older InfluxDB Line Protocol (ILP) transport over HTTP remains available,
see [Legacy ILP transports](#legacy-ilp-transports).

### Quick start

This guide walks through setting up the connector to read JSON data from Kafka
and write it to QuestDB.

#### Prerequisites

- Apache Kafka 3.6 or newer (or a compatible system)
- QuestDB 10.0 or newer, with port 9000 reachable from the Kafka Connect worker
- QuestDB Kafka connector 0.24 or newer
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
| allowed.lag | `int` | 250 | 1000 | Milliseconds the task waits for new records before publishing what it has buffered |
| retry.backoff.ms | `long` | 5000 | 3000 | Milliseconds to wait before reconnecting when QuestDB is unreachable. Not used by the HTTP transport |
| dlq.send.batch.on.error | `boolean` | true | false | Send the whole rejected chunk to the dead letter queue instead of isolating the bad record. See [Dead letter queue](#dead-letter-queue) |

The connector uses Kafka Connect converters for deserialization and works with
any format they support, including JSON, Avro, and Protobuf. When using Schema
Registry, configure the appropriate converter (e.g.,
`io.confluent.connect.avro.AvroConverter`).

#### QWP delivery options

These options apply only to the `ws` and `wss` transports and are ignored by
the legacy HTTP transport. See [Delivery guarantees](#fault-tolerance) and
[Performance tuning](#performance-tuning) for when to change them.

| Name | Type | Default | Description |
|------|------|---------|-------------|
| qwp.commit.ack.timeout.ms | `long` | 500 | Milliseconds an offset commit waits for QuestDB to acknowledge just-published rows. Offsets that are still unacknowledged when the wait expires are withheld and their records redelivered |
| qwp.dlq.terminal.categories | `list` | SCHEMA_MISMATCH | Server rejection categories that are isolated and sent to the dead letter queue instead of failing the task |
| qwp.max.inflight.rows | `int` | 150000 | Soft limit on rows published but not yet acknowledged. Above it the task pauses consumption until acknowledgements catch up. The current poll batch can overshoot it |
| qwp.progress.timeout.ms | `long` | 300000 | Milliseconds without any acknowledgement advancing, while rows are pending, before the task fails. Each acknowledgement resets the clock, so a backlog that keeps draining never trips it. This bounds how long a QuestDB outage can last |
| qwp.quarantine.ack.timeout.ms | `long` | 1000 | Milliseconds to wait for each synchronous chunk while isolating a rejected record |

:::note

Pre-release builds of the QWP transport used the names `max.inflight.rows` and
`progress.timeout.ms`. Both are rejected at startup; rename them to
`qwp.max.inflight.rows` and `qwp.progress.timeout.ms`.

:::

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

# Larger in-memory buffer for unacknowledged rows
client.conf.string=ws::addr=localhost:9000;sf_max_total_bytes=256m;
```

See the [connect string reference](/docs/connect/clients/connect-string/) for
all available client keys.

##### Keys the connector manages

The connector owns batching and delivery, so it adjusts or restricts some
client keys on the `ws` and `wss` transports:

| Key | Behaviour in the connector |
|-----|----------------------------|
| `auto_flush_rows` | Rows per checkpoint. Default: `75000`. Cannot be `off` |
| `auto_flush_interval` | Milliseconds between checkpoints. Default: `1000`. Cannot be `off` |
| `auto_flush_bytes` | Kept enabled and clamped by the client to the server's batch cap, so a multi-row batch never exceeds one frame |
| `sf_dir`, `sf_durability` | Rejected. Kafka is the durable log, so the client buffer is memory-only |
| `sf_max_total_bytes` | Cap on the memory buffer of encoded, unacknowledged rows. Default: `128m` |
| `sf_append_deadline_millis` | How long a checkpoint waits for buffer space. Default: `30000`. Must be lower than the consumer's `max.poll.interval.ms` |
| `initial_connect_retry` | Forced to `off`; any other value is rejected. Kafka Connect owns startup retries, see [Outages and reconnects](#outages-and-reconnects) |
| `close_flush_timeout_millis` | Default: `0`. Offsets are decided before the sender closes, so a close-time wait cannot commit more. An explicit value is preserved |

The `reconnect_*` keys pass through unchanged and control the client's
reconnect backoff during an outage.

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

<!-- Legacy anchor kept for inbound links from other docs pages -->
### Delivery guarantees {#fault-tolerance}

The connector delivers every Kafka record to QuestDB at least once. It writes
rows into checkpoints of up to `auto_flush_rows` rows, publishes each
checkpoint over QWP, and commits a Kafka offset only after QuestDB has
acknowledged every checkpoint up to that offset. Records QuestDB never
acknowledged stay uncommitted in Kafka and are redelivered.

Duplicates arise when QuestDB committed rows but the acknowledgement did not
reach the connector before it had to give the records back to Kafka: a
reconnect, a rebalance, a shutdown, or a server rejection that rewinds a
checkpoint whose acknowledged prefix is then replayed. Enable deduplication on
the target table whenever duplicate rows are not acceptable.

#### Exactly-once delivery

For exactly-once results, enable
[deduplication](/docs/concepts/deduplication/) on the target table with keys
that identify a unique event:

```questdb-sql
CREATE TABLE trades (
    timestamp TIMESTAMP,
    symbol SYMBOL,
    price DOUBLE,
    volume LONG
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP UPSERT KEYS(timestamp, symbol);
```

Deduplication requires a designated timestamp that is stable across
redelivery, so take it from the [message payload](#using-a-message-field) or
from [Kafka metadata](#using-kafka-timestamps). A server-assigned timestamp
changes on every replay and cannot match. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the full model.

#### Outages and reconnects

The client reconnects on its own when the connection drops and re-sends
unacknowledged rows from its memory buffer, so a short QuestDB outage only
adds latency. When QuestDB is unreachable at task start, or after the
connector has given up on a connection, the task retries every
`retry.backoff.ms` (default 3 seconds) while Kafka Connect holds the current
batch. Authentication and configuration failures are not retried and fail the
task immediately.

During an outage the task fails once no acknowledgement has advanced for
`qwp.progress.timeout.ms` (default 5 minutes) while rows are pending. The
timer measures inactivity, not record age: every acknowledgement resets it,
so a backlog that keeps draining can hold older records without failing.
Raise it to tolerate longer outages. A restarted task continues from the last committed offset, but only
while the uncommitted records still exist in Kafka. Topic retention is
independent of consumer offsets, so the retention period of the source topics
must cover the outage plus the time needed to catch up afterwards. Records
that expire before the task resumes are lost.

During an outage the client buffer keeps filling because nothing is
acknowledged. Once it is full, a checkpoint waits up to
`sf_append_deadline_millis` (default 30 seconds) for space. If that expires,
the connector retires the connection, rewinds the affected partitions to their
oldest unacknowledged checkpoint, and re-fetches those records from Kafka once
QuestDB is back.

#### Dead letter queue

For records that fail for data reasons, configure a dead letter queue (DLQ) so
the connector skips them instead of stopping. These are connector settings:
add them to `questdb-connector.properties` in standalone mode, or to the
connector JSON submitted to the REST API in distributed mode. They have no
effect in the worker configuration.

```properties title="questdb-connector.properties"
errors.tolerance=all
errors.deadletterqueue.topic.name=dlq-questdb
errors.deadletterqueue.topic.replication.factor=1
```

The DLQ is used only when both a DLQ topic is set and `errors.tolerance=all`.
Two kinds of failure reach it:

- **Records the connector cannot turn into a row**: an unsupported type, an
  illegal column name, or a row larger than the server's batch cap. The record
  goes to the DLQ and delivery continues.
- **Records QuestDB rejects with a schema mismatch**: for example a string
  value for a `DOUBLE` column. QWP rejects the whole frame, so the connector
  rewinds the affected partitions, re-fetches the unacknowledged window from
  Kafka, and delivers it synchronously in checkpoint-sized chunks, bisecting
  each rejected chunk until the offending record is isolated and sent to the
  DLQ. Each chunk waits up to `qwp.quarantine.ack.timeout.ms` for an
  acknowledgement, so recovery on a high-latency link is slower than normal
  delivery. Set `dlq.send.batch.on.error=true` to send the whole rejected
  chunk to the DLQ instead of bisecting it, which avoids the extra round trips
  when many records are expected to be bad.

Any other server rejection, such as an authentication failure or a table that
is not writable, fails the task. Without a usable DLQ, a schema mismatch also
fails the task, and the error names the rejection category and the affected
frame range. `qwp.dlq.terminal.categories` can extend the DLQ-eligible
categories, but doing so can blame valid records for server or client faults,
so leave it at the default.

A common cause of schema mismatches is a JSON field that switches between
integer and float. Pin such fields with the `doubles` option or pre-create the table, see
[Numeric type inference](#numeric-type-inference).

See the [Confluent DLQ documentation](https://developer.confluent.io/courses/kafka-connect/error-handling-and-dead-letter-queues/)
for details.

#### Shutdown and rebalances

When Kafka Connect stops a task, the connector publishes its buffered rows and
waits up to `qwp.commit.ack.timeout.ms` (default 500 ms) for acknowledgements
before it commits offsets. Offsets still unacknowledged at that point are
withheld, and Kafka redelivers those records to the next task, so a shutdown
can produce duplicates unless deduplication is enabled. The wait is short
because Kafka Connect gives all tasks on a worker one shared
`task.shutdown.graceful.timeout.ms` budget (5 seconds by default).

Partition revocation during a rebalance does not wait at all: the offsets of
the revoked partitions were decided by the preceding commit, and waiting would
stall the rebalance for the whole consumer group.

### Performance tuning

#### Checkpoint size

The connector publishes a checkpoint when it has buffered `auto_flush_rows`
rows (default 75,000) or when `auto_flush_interval` milliseconds have elapsed
since the previous checkpoint (default 1,000). For low-throughput topics,
reduce the row count to lower latency:

```properties
client.conf.string=ws::addr=localhost:9000;auto_flush_rows=1000;
```

#### Flush triggers

A checkpoint is published when any of these happens:
- Buffered rows reach `auto_flush_rows`
- `auto_flush_interval` milliseconds have elapsed since the previous checkpoint
- A poll returns no records. The task wakes up at least every `allowed.lag`
  milliseconds (default 1000) while rows are pending, so lowering
  `allowed.lag` shortens the time to publish a trailing partial batch
- Kafka Connect commits offsets

```properties
# Wake up every 250ms when idle
allowed.lag=250
```

Configure offset commit frequency in Kafka Connect via `offset.flush.interval.ms`.
See [Kafka Connect configuration](https://docs.confluent.io/platform/current/connect/references/allconfigs.html).

#### Backpressure

Two limits bound how far the connector runs ahead of QuestDB's
acknowledgements:

- `qwp.max.inflight.rows` (default 150,000) pauses consumption from Kafka
  when more rows than this are published but unacknowledged, and resumes it
  when acknowledgements catch up. It is a soft limit: the current poll batch
  can overshoot it.
- `sf_max_total_bytes` (default 128 MiB) caps the client's memory buffer of
  encoded, unacknowledged rows. When it fills, a checkpoint waits up to
  `sf_append_deadline_millis` for space before the connector gives up on the
  connection, see [Outages and reconnects](#outages-and-reconnects).

Raise both on high-latency links so the pipeline stays full while
acknowledgements are in flight:

```properties
qwp.max.inflight.rows=500000
client.conf.string=ws::addr=questdb.example.com:9000;sf_max_total_bytes=512m;
```

#### Raw JSON fast path

:::caution Experimental

This option is covered by a differential test suite against the standard path
but has not been used in production yet.

:::

Kafka Connect converts every record before the connector sees it. For JSON
this builds two throwaway object graphs per record, which accounted for more
than half of the sink task's CPU in profiling. With `value.format=json` the
connector receives the raw bytes and parses them once, straight into rows:

```properties
value.converter=org.apache.kafka.connect.converters.ByteArrayConverter
value.format=json
```

Measured on a single task with 5M records, throughput rose by 48% compared to
the same pipeline using `JsonConverter`.

If the producer writes the envelope that `JsonConverter` emits with
`schemas.enable=true` (`{"schema": {...}, "payload": {...}}`), use
`value.format=json_envelope` instead. The schema is ignored and the payload
becomes the row. The mode is never guessed from the data: sending enveloped
records with plain `value.format=json` flattens the envelope into `schema_*`
and `payload_*` columns.

The fast path honours `table`, `symbols`, `doubles`, `timestamp.field.name`,
`timestamp.units`, `timestamp.string.fields`, `include.key`, `key.prefix`,
`value.prefix` and `skip.unsupported.types`, flattens nested objects with `_`,
and supports 1D, 2D and 3D numeric arrays with the same rules as the standard
path.

Limitations and differences from the standard path:

- Transformations that inspect or modify the value cannot be used, because an
  SMT sees opaque bytes. Topic-level SMTs such as `RegexRouter` are unaffected
- Only the value is parsed by the connector. The key still goes through
  `key.converter`
- [Composed timestamps](#composed-timestamps) are not supported and are
  rejected at startup
- Column types come from the JSON values, even with `json_envelope`. A schema
  declaring `INT8` or `FLOAT32` still yields `LONG` or `DOUBLE`. Use `doubles`
  when an integer-looking field must be a double
- Top-level values that are not JSON objects (`123`, `"text"`, `[1,2,3]`) are
  rejected. The standard path writes them into a `value` column
- JSON nested deeper than 64 levels is rejected as invalid data
- Integers larger than `Long.MAX_VALUE` are written as doubles. The standard
  path silently overflows them
- When a JSON object repeats a field name, QuestDB keeps the first value. The
  standard path keeps the last
- Objects nested inside arrays are not valid array elements. They fail, or are
  skipped with `skip.unsupported.types=true`
- Column order follows the JSON document rather than the converter's map
  order, which changes the column order of auto-created tables
- Dead letter queue support for malformed payloads requires the `ws` or `http`
  transport

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
They remain supported for QuestDB versions before 10.0 and for existing
deployments, but new pipelines should use `ws` or `wss`.

```properties
client.conf.string=http::addr=localhost:9000;retry_timeout=60000;
```

Differences from QWP:

- Each batch is a synchronous HTTP request. The connector retries recoverable
  errors (network issues, server unavailability, timeouts) for up to
  `retry_timeout` milliseconds (default 10,000) and then fails the task.
  Non-recoverable errors are not retried
- A batch is sent when `auto_flush_rows` is reached (default 75,000), when no
  new records arrive for `allowed.lag` milliseconds, or when Kafka Connect
  commits offsets
- The `qwp.*` options and the QWP backpressure limits have no effect
- A server-side parsing error is isolated by re-sending the batch record by
  record, and the bad record goes to the DLQ (the whole batch with
  `dlq.send.batch.on.error=true`). Without a DLQ the task fails. Retries can
  duplicate a whole batch, so deduplication is still recommended

To migrate, change the protocol from `http::` to `ws::` (or `https::` to
`wss::`), remove `retry_timeout` and any other HTTP-only key (the QWP client
rejects them at startup), and enable
[deduplication](#exactly-once-delivery) on the target tables. Authentication
keys, `auto_flush_rows`, and all connector options keep working unchanged.

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

No acknowledgement advanced for `qwp.progress.timeout.ms` (default 5 minutes)
while rows were pending. This usually means QuestDB was down or unreachable for
longer than that. Restart the task once QuestDB is back; it resumes from the
last committed offset. Raise `qwp.progress.timeout.ms` if outages of this
length are expected.

</details>

## See also

- [Delivery semantics](/docs/concepts/delivery-semantics/)
- [Connect string reference](/docs/connect/clients/connect-string/)
- [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium/)
- [Realtime crypto tracker with QuestDB Kafka Connector](/blog/realtime-crypto-tracker-with-questdb-kafka-connector/)
