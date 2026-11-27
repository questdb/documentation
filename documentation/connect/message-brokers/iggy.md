---
slug: /connect/message-brokers/iggy
title: Ingest data from Apache Iggy
sidebar_label: Apache Iggy
description:
  Stream data from Apache Iggy to QuestDB with the QuestDB sink connector. Map
  message fields and timestamps, prevent duplicates, and fail over between
  QuestDB Enterprise nodes.
---

[Apache Iggy](https://iggy.apache.org/) is a persistent message streaming
platform written in Rust. Use its QuestDB sink connector to write messages
from Iggy streams into QuestDB tables. The sink sends rows over the
[QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/overview/), reads
JSON, Avro, text and raw messages, and stores Iggy offsets only after QuestDB
confirms the rows. JSON objects and Avro records become rows with one typed
column per field. Other payloads go into a single `payload` column. The same
plugin works with QuestDB Open Source and QuestDB Enterprise. On QuestDB
Enterprise it also follows the primary across a failover. Follow the
[quick start](#quick-start) to send your first message.

The sink is a plugin of the
[Iggy connectors runtime](https://iggy.apache.org/docs/connectors/introduction),
a process that consumes from Iggy and loads one shared library per connector.
The runtime and its plugins live in the
[apache/iggy-connectors](https://github.com/apache/iggy-connectors) repository.
The canonical reference for the sink is its
[README](https://github.com/apache/iggy-connectors/tree/master/sinks/questdb_sink).

## Quick start

This guide starts Iggy and QuestDB in Docker, builds the runtime and the sink,
and writes one JSON message to a QuestDB table.

### Prerequisites

- Docker
- The Rust toolchain, to build the runtime and the plugin. The repository pins
  its version in `rust-toolchain.toml`, and `rustup` installs it on the first
  build
- QuestDB 10.0 or newer, or QuestDB Enterprise 4.0 or newer
- An Apache Iggy server. The quick start was tested with the `apache/iggy`
  image of Iggy 0.15.0

The examples use Iggy at `localhost:8090` and QuestDB at `localhost:9000`.

### Step 1: Build the runtime and the sink

The runtime ships as source and as the Docker image
[`apache/iggy-connect`](https://hub.docker.com/r/apache/iggy-connect). The
plugins ship as source only. Clone the repository and build both. To use the
Docker image instead of a native runtime, see
[Run the runtime in Docker](#run-the-runtime-in-docker).

```shell
git clone https://github.com/apache/iggy-connectors.git
cd iggy-connectors
cargo build --release -p iggy-connectors -p iggy_connector_questdb_sink
```

The runtime binary is `target/release/iggy-connectors`. The plugin is
`target/release/libiggy_connector_questdb_sink.so` on Linux and `.dylib` on
macOS. Run the remaining steps from the repository root.

### Step 2: Start Iggy and QuestDB

```shell
docker run -d --name iggy \
  --cap-add=SYS_NICE --security-opt seccomp=unconfined --ulimit memlock=-1:-1 \
  -e IGGY_ROOT_USERNAME=iggy -e IGGY_ROOT_PASSWORD=iggy \
  -e IGGY_TCP_ADDRESS=0.0.0.0:8090 -e IGGY_HTTP_ADDRESS=0.0.0.0:3000 \
  -e IGGY_NODE_ADVERTISED_ADDRESS=localhost \
  -p 8090:8090 -p 3000:3000 \
  apache/iggy

docker run -d --name questdb -p 9000:9000 questdb/questdb:latest
```

Create the stream and the topic with the `iggy` CLI of the server image:

```shell
docker exec iggy iggy -u iggy -p iggy stream create events
docker exec iggy iggy -u iggy -p iggy topic create \
  events questdb_events 1 none 1d --durability persisted
```

The topic has one partition, no compression, and a retention of one day.
`--durability persisted` makes Iggy store each message on disk before it
acknowledges it.

### Step 3: Configure the runtime and the sink

Create the runtime configuration as `connectors.toml` in the repository root:

```toml title="connectors.toml"
[iggy]
address = "localhost:8090"
username = "iggy"
password = "iggy"

[connectors]
config_type = "local"
config_dir = "connectors"
```

Create the directory `connectors` and save the sink configuration in it:

```toml title="connectors/questdb.toml"
type = "sink"
key = "questdb"
enabled = true
version = 0
name = "QuestDB sink"
path = "target/release/libiggy_connector_questdb_sink"
plugin_config_format = "toml"

[[streams]]
stream = "events"
topics = ["questdb_events"]
schema = "json"
batch_length = 1000
consumer_group = "questdb_sink"

[delivery]
guarantee = "at_least_once"

[plugin_config]
connection_string = "ws::addr=localhost:9000;"
table = "iggy_events"
symbol_columns = ["region", "device"]
```

The runtime can also authenticate to Iggy with a personal access token, set as
`token` in `[iggy]`, and connect over TLS with an `[iggy.tls]` table that sets
`enabled = true`, `ca_file` and, if needed, `domain`. See the
[Iggy connectors documentation](https://iggy.apache.org/docs/connectors/introduction)
for these settings.

The runtime adds the library extension of your operating system to `path`.
`[delivery]` makes the runtime store Iggy offsets only after QuestDB confirms
the rows. Without it, a failed write loses its batch, see
[Delivery guarantees](#delivery-guarantees).

### Step 4: Start the runtime

```shell
IGGY_CONNECTORS_CONFIG_PATH=connectors.toml ./target/release/iggy-connectors
```

The sink connects to QuestDB when it starts. If QuestDB is unreachable, the
sink logs `failed to open` and does not start.

### Step 5: Test the pipeline

From another terminal, send a JSON message:

```shell
docker exec iggy iggy -u iggy -p iggy message send --partition-id 0 \
  events questdb_events '{"region":"eu","device":"d1","temperature":21.5}'
```

QuestDB creates the table from the first rows it receives. Query it:

```shell
curl -G --data-urlencode "query=SELECT * FROM iggy_events" \
  http://localhost:9000/exp
```

Expected output:

```csv
"iggy_stream","iggy_topic","region","device","temperature","timestamp"
"events","questdb_events","eu","d1",21.5,"2026-11-25T10:34:59.095643Z"
```

The timestamp is the time at which Iggy stored the message, so your value will
differ. The table has these columns:

| Column        | Type        | Source                              |
|---------------|-------------|-------------------------------------|
| `iggy_stream` | `SYMBOL`    | Stream name                         |
| `iggy_topic`  | `SYMBOL`    | Topic name                          |
| `region`      | `SYMBOL`    | Payload, listed in `symbol_columns` |
| `device`      | `SYMBOL`    | Payload, listed in `symbol_columns` |
| `temperature` | `DOUBLE`    | Payload                             |
| `timestamp`   | `TIMESTAMP` | Iggy message timestamp              |

Next, choose a [timestamp source](#designated-timestamps), create the table
with [deduplication](#exactly-once-delivery) if it must not hold duplicates,
and review [outage recovery](#outages-and-reconnects) before you use the sink
in production.

### Run the runtime in Docker

The `apache/iggy-connect` image contains the runtime only. Build the plugin
for Linux in a container that matches the image, from the repository root:

```shell
docker run --rm -v "$PWD":/src -w /src -e CARGO_TARGET_DIR=/src/target/linux \
  rust:1.100-trixie \
  cargo build --release --locked -p iggy_connector_questdb_sink
```

The plugin lands in `target/linux/release/`. Build it on a host with the same
CPU architecture as the image you run, such as `amd64` or `arm64`.

Put `connectors.toml` and the `connectors` directory from the quick start in a
directory named `config`. Use container paths and names in them:

- In `connectors.toml`, set `config_dir = "/app/config/connectors"`. A
  relative path resolves against `/app` in the container, and the runtime then
  starts without loading any connector. It logs only a warning that the
  directory does not exist, followed by `Found 0 source and 0 sink configurations`.
- In `connectors/questdb.toml`, set
  `path = "/app/plugins/libiggy_connector_questdb_sink.so"`.
- Set `address = "iggy:8090"` in `[iggy]` and
  `connection_string = "ws::addr=questdb:9000;"` in `[plugin_config]`.

Put the containers on one Docker network, then start the runtime:

```shell
docker network create iggy-net
docker network connect iggy-net iggy
docker network connect iggy-net questdb

docker run -d --name iggy-connect --network iggy-net \
  -v "$PWD/config":/app/config:ro \
  -v "$PWD/target/linux/release":/app/plugins:ro \
  -e IGGY_CONNECTORS_CONFIG_PATH=/app/config/connectors.toml \
  apache/iggy-connect:edge
```

The `edge` tag is built from the latest commit of the repository's default
branch. Build the plugin from the same commit as the runtime image, because the
runtime loads it as a shared library and a plugin built from an older commit
can fail to load.

To reach the runtime API from the host, set `address = "0.0.0.0:8081"` in the
`[http]` table of `connectors.toml` and add `-p 8081:8081`. The runtime then
warns that the API has no `api_key`.

<!--
  Revisit when apache/iggy-connectors#33 is fixed. Once the runtime redacts
  credentials in its configuration responses, relax this warning, drop the
  environment variable clause, and update the pointers from Monitoring and the
  QuestDB Enterprise section. Last checked: November 2026, issue open.
-->

:::warning Runtime API exposes the connect string

As of November 2026, the configuration endpoints of the runtime API return
plugin configuration as stored, the connect string and its credentials
included. This also holds when you set the connect string through an
environment variable. The runtime tracks the fix in
[apache/iggy-connectors#33](https://github.com/apache/iggy-connectors/issues/33).

The API listens on `127.0.0.1:8081` without authentication by default. Before
you expose it beyond loopback:

- Set `api_key` in the `[http]` table. Every route except `/` and `/health`
  then needs the `api-key` header, `/metrics` included.
- Enable `[http.tls]`, so that the key and the responses do not cross the
  network in cleartext.
- To publish only the metrics, keep the API on loopback and put a reverse
  proxy in front that forwards `/metrics` alone.

On QuestDB Enterprise, create the target table yourself and give the service
account only `HTTP` and `INSERT ON` that table, so a leaked token cannot read
or change other data.

:::

## How data is mapped

The sink writes one row per message.

### Message formats

The `schema` of each `[[streams]]` entry tells the runtime how to decode the
messages of a topic. JSON, Avro, Protobuf and FlatBuffers messages reach the
sink as JSON documents, so the [type mapping](#field-types) applies to them.
Text and raw messages reach the sink as they are:

| `schema`         | What the sink writes                                                                                                      |
|------------------|---------------------------------------------------------------------------------------------------------------------------|
| `json`           | One column per top-level field of a JSON object                                                                           |
| `avro`           | One column per field of the record. Set `avro_schema_json` or `avro_schema_path` on the stream                            |
| `text`           | The whole message in a `VARCHAR` column named `payload`. JSON inside the text is not parsed                               |
| `raw`            | The whole message in the `payload` column if it is valid UTF-8. A binary message is [rejected](#rejected-records)         |
| `proto`          | No field decoding. A `google.protobuf.Any` message becomes the columns `type_url` and `value`, with the value in base64   |
| `flat_buffer`    | No field decoding. Each message becomes metadata columns, such as `buffer_size`, and its bytes in base64 in `raw_data_base64` |

`schema` is required. If a connector file leaves it out, the runtime does not
start, and its other connectors do not start either.

To get one column per field from Protobuf or FlatBuffers data, have the
producer publish JSON or Avro.

An auto-created table orders Avro columns alphabetically, not in the order of
the Avro schema. To keep the schema order, [create the table](#target-table)
first.

The two kinds of decode failure are handled in different places:

- A `raw` message that is not valid UTF-8 reaches the sink, which rejects it as
  a [rejected record](#rejected-records). `invalid_messages = "skip"` in
  `[delivery]` does not skip it.
- A `proto` message that is not a `google.protobuf.Any`, or a `flat_buffer`
  message too small to hold a buffer, fails to decode in the runtime before it
  reaches the sink. With at least once, the runtime stops the topic at the
  message, unless `invalid_messages = "skip"` is set in `[delivery]`. With at
  most once, the runtime skips the message. Either way, it logs
  `Failed to decode message payload` with the offset and counts an error.

### Field types

Each top-level field of a decoded object becomes a column:

| JSON                                     | QuestDB                                                                                    |
|------------------------------------------|--------------------------------------------------------------------------------------------|
| string                                   | `VARCHAR`, or `SYMBOL` or `UUID` when listed in `symbol_columns` or `uuid_columns`         |
| number                                   | `DOUBLE`, or `LONG` when listed in `integer_columns`                                       |
| boolean                                  | `BOOLEAN`                                                                                  |
| array of numbers                         | `DOUBLE[]`, up to 3 dimensions, when every row of a dimension has the same length          |
| object                                   | `VARCHAR` holding the JSON text                                                            |
| `null`, empty array, also nested `[[]]`  | column left out of the row                                                                 |
| any other array                          | not supported, the record is [rejected](#rejected-records)                                 |

Integer arrays become `DOUBLE[]`, because QuestDB has no other array type.
`BOOLEAN` has no null, so a boolean left out of a row reads back as `false`.

A JSON array or scalar goes into the `payload` column, as text and raw messages
do.

Field names in the column lists and in `timestamp_field` match without regard
to case, as in QuestDB.

### Numbers

JSON has one number type, so a field can arrive as `20` in one message and
`20.5` in the next. By default, `numbers_as_double = true` writes every number
as a `DOUBLE`, so the column type does not depend on which value came first.

A `DOUBLE` holds integers exactly only up to 2^53 (9,007,199,254,740,992).
List larger integers, such as nanosecond epochs, snowflake ids and hashes, in
`integer_columns` to store them as `LONG`:

```toml
integer_columns = ["trade_id", "event_nanos"]
```

Avro numbers reach the sink as JSON numbers too, so an Avro `long` is stored
as a `DOUBLE` unless you list it in `integer_columns`. A value above 2^53 is
rounded, for example 9007199254740993 is stored as 9007199254740992. The sink
logs the rounding and suggests adding the column to `integer_columns`.

A whole value written as `20.0` is accepted there. A fractional value, a
non-number, or a value outside the `LONG` range rejects the record, and so does
-9223372036854775808, which QuestDB stores as `NULL` in a `LONG` column.

With `numbers_as_double = false`, integers become `LONG` and fractions
`DOUBLE`. A column then takes its type from the first row that QuestDB sees,
and a later value of the other shape is rejected. Turn it off only if every
numeric field is a true integer and you create the table with explicit types.

### Metadata columns

The sink can add Iggy metadata to each row:

| Column              | Type     | Written when                              |
|---------------------|----------|-------------------------------------------|
| `iggy_stream`       | `SYMBOL` | `include_stream_column = true`, default   |
| `iggy_topic`        | `SYMBOL` | `include_topic_column = true`, default    |
| `iggy_partition_id` | `LONG`   | `include_partition_column = true`         |
| `iggy_offset`       | `LONG`   | `include_offset_column = true`            |

A payload field with one of these names, ignoring case, rejects the record. A
payload field named `stream`, `topic` or `offset` is an ordinary column.

### Headers

With `include_headers = true`, the sink writes each Iggy message header to a
`VARCHAR` column named `header_<name>`. Characters that QuestDB refuses in a
column name, such as `.`, `-`, `~` and `:`, become `_`. For example, the header
`content-type` goes to `header_content_type`.

Binary values, and string values that are not UTF-8, are written as base64.
For each of these values the sink also writes `base64` to the `SYMBOL` column
`iggy_header_<name>_encoding`:

```questdb-sql
SELECT header_signature
FROM iggy_events
WHERE iggy_header_signature_encoding = 'base64';
```

A column name longer than 127 bytes rejects the record. Two headers of one
message that map to the same column name also reject it.

## Designated timestamps

`timestamp_source` selects the
[designated timestamp](/docs/concepts/designated-timestamp/) of each row:

| Source              | Timestamp                                          | Column type of an auto-created table |
|---------------------|----------------------------------------------------|--------------------------------------|
| `message` (default) | The Iggy message timestamp                         | `TIMESTAMP`                          |
| `origin`            | The origin timestamp that the producer set         | `TIMESTAMP`                          |
| `payload`           | A numeric field of the payload, `timestamp_field`  | `TIMESTAMP_NS`                       |
| `server`            | QuestDB stamps the row when it arrives             | Set by QuestDB                       |

The `message` and `origin` timestamps are in microseconds. A `payload`
timestamp is converted to nanoseconds. Use one source per table.

### Using a payload field

The field must hold a number since the Unix epoch. A string, such as an
RFC 3339 date, rejects the record:

```toml
timestamp_source = "payload"
timestamp_field = "event_time"
timestamp_unit = "millis"
```

Supported units are `seconds`, `millis`, `micros`, `nanos`, and `auto`, the
default. `auto` reads the size of the value: below 1e11 it is seconds, below
1e14 milliseconds, below 1e17 microseconds, and nanoseconds above. A value
before March 3, 1973 in a fine unit reads as a coarser unit, so set the unit if
your data can hold such values.

The field becomes the designated timestamp only. It is not written as a column
of its own.

### Timestamp column name

An auto-created table names its designated timestamp `timestamp`. A payload
field with that name collides with it, and QuestDB rejects the whole batch. To
avoid the collision, [create the table](#target-table) with another timestamp
column name, or remove the field with the `delete_fields` transform of the
runtime.

## Target table

`table` names the target table. QuestDB creates the table and its columns from
the first rows it receives. This is convenient for development. In production,
create the table with [CREATE TABLE](/docs/query/sql/create-table/) to choose
partitioning, [TTL](/docs/concepts/ttl/), [deduplication](#exactly-once-delivery)
keys, symbol capacities and column types:

```questdb-sql title="Table for the quick start"
CREATE TABLE iggy_events (
    iggy_stream SYMBOL,
    iggy_topic SYMBOL,
    region SYMBOL,
    device SYMBOL,
    temperature DOUBLE,
    timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

A pre-created table accepts the types that the sink sends by default: strings
go into `SYMBOL` columns and whole numbers into `LONG` columns, without
`symbol_columns` or `integer_columns`.

The sink writes every topic of the connector to the same table. To write
topics to different tables, configure one connector per table.

## Delivery guarantees

Set the delivery guarantee in the `[delivery]` table of the connector, not in
`[plugin_config]`:

```toml
[delivery]
guarantee = "at_least_once"
```

With at least once, the runtime stores the offset of a message only after
QuestDB acknowledged its row, and it delivers a failed batch again after a
backoff. No message is skipped, but a retried batch can write a second copy of
rows that QuestDB had already stored.

Without the `[delivery]` table, the runtime delivers at most once. It stores
the offset of each poll before the sink writes it, so a failed write loses the
messages of its batch. The sink logs their offsets so that you can
[rewind](#rewind-the-consumer-group) to them. Use at most once only where a
loss is acceptable.

At least once covers only messages that Iggy still holds. Create topics with
`--durability persisted`, and keep a retention longer than the longest QuestDB
outage you expect.

### Exactly-once delivery

For exactly-once results, enable
[deduplication](/docs/concepts/deduplication/) on the target table with keys
that identify a message:

```questdb-sql title="Remove retried copies"
CREATE TABLE fx_fills (
    timestamp TIMESTAMP,
    trade_id LONG,
    symbol SYMBOL,
    side SYMBOL,
    price DOUBLE,
    quantity DOUBLE
) TIMESTAMP(timestamp) PARTITION BY DAY
DEDUP SKIP KEYS(timestamp, trade_id);
```

Here, `trade_id` is an identifier that your producer sets. A column that you
create as `LONG` or `SYMBOL` accepts the values that the sink sends by
default. List the column in `integer_columns` if its values can exceed 2^53,
because the sink rounds larger numbers to a `DOUBLE` before QuestDB sees them,
see [Numbers](#numbers).

QuestDB has two modes:

- `DEDUP SKIP KEYS(...)` keeps the first row and discards a later one with the
  same keys. Use it to remove retried copies. It needs QuestDB 10.2.0 or
  QuestDB Enterprise 4.2.1, see
  [Compatibility with earlier versions](/docs/concepts/deduplication/#compatibility-with-earlier-versions).
- `DEDUP UPSERT KEYS(...)` replaces the stored row with the later one. Use it
  when a later message with the same keys must overwrite the earlier values.

The keys must include the designated timestamp, so a retried row is a
duplicate only if it gets the same timestamp again. Use the `message` or
`payload` [timestamp source](#designated-timestamps). With `server`, QuestDB
stamps each copy on arrival, and the sink logs a warning at start. A message
whose Iggy timestamp is zero, which means "not set", also gets the time of the
sink, so its copies differ.

If the payload has no field that identifies a message, use the Iggy message
identity:

1. Set `include_partition_column = true` and `include_offset_column = true`.
2. Create the table with these deduplication keys:

   ```questdb-sql
   DEDUP SKIP KEYS(
       timestamp, iggy_stream, iggy_topic, iggy_partition_id, iggy_offset
   )
   ```

The timestamp, the stream and the topic alone are not enough. Iggy gives every
message of one producer batch the same timestamp, so those keys keep one row
for several distinct messages, without an error.

Deduplication costs ingestion throughput. If duplicate rows do not matter for
your data, leave it out. See
[Delivery semantics](/docs/concepts/delivery-semantics/) for the full model.

### Rejected records

A record that the sink cannot write is rejected. The common causes are:

- a value of the wrong type in a listed column, such as text in
  `integer_columns` or a malformed UUID in `uuid_columns`
- a `raw` message that is not valid UTF-8
- an array that is not a rectangular array of numbers
- a missing, non-numeric or out-of-range timestamp field
- a payload field with a [reserved name](#metadata-columns)
- a message larger than one QWP frame, see [Batch size](#batch-size)
- a value that does not match the column type in QuestDB. QuestDB rejects the
  whole batch, so the sink cannot name the record

With at least once, the sink first writes and confirms the rows before the
record. Then it fails the batch with a permanent error, and the runtime
stops the delivery of that topic at the record. The other topics of the
connector keep delivering. A restart delivers the same record again, so fix the
cause or skip the record:

1. Stop the connectors runtime.
2. Read the offset of the record in the `rejected message` log line.
3. If a change to the sink configuration or to the table makes the record
   valid, make it. Otherwise, set the stored offset of the partition to the
   offset of the record, as [Rewind the consumer group](#rewind-the-consumer-group)
   shows. Iggy resumes after the stored offset, so this skips the record alone.
4. Start the connectors runtime.

With at most once, the sink logs the record and writes the rest of the batch.
The log line is the only record of it.

The sink logs each rejection with its stream, topic, partition, offset and
message id: the first 20 of a batch at `error` and the rest at `debug`. Set
`log_rejected_payload = true` to add a truncated payload. This writes user
data to the log.

`invalid_messages = "skip"` in `[delivery]` does not skip a record that the
sink rejects. It covers only messages that the runtime cannot decode or
transform, see [Message formats](#message-formats).

### Outages and reconnects

The client of the sink reconnects automatically and resends the rows that
QuestDB did not acknowledge. With at least once, the sink reports a batch as
written only when QuestDB acknowledged all of its rows:

- If an acknowledgement does not arrive within `flush_timeout` (default 30
  seconds), the batch fails with a transient error, and the runtime retries it
  after a backoff.
- The rows of the failed attempt stay queued, and QuestDB still writes them
  when it is back. Each retry during an outage queues one more copy of the
  batch. Declare [deduplication keys](#exactly-once-delivery) to keep one copy.
  Setting `retry_max_attempts` in `[delivery]` bounds the queued copies, but
  the runtime stops the delivery of the topic when the attempts run out, and
  you must restart the connector to deliver the batch again.
- A record that QuestDB rejects stops the delivery as a
  [rejected record](#rejected-records) does.

`flush_timeout = "0s"` turns off the wait for acknowledgements. The sink then
cannot prove delivery, so a connector that sets it does not start with at
least once.

The sink connects when it starts. If QuestDB is unreachable at that moment, the
connector does not start. Restart it through the runtime API once QuestDB is
available:

```shell
curl -X POST http://127.0.0.1:8081/sinks/questdb/restart
```

### Store-and-forward

By default, the client keeps unacknowledged rows in memory. Set `sf_dir` in the
connect string to keep them on disk across disconnects and runtime restarts:

```toml
connection_string = "ws::addr=localhost:9000;sf_dir=/var/lib/iggy/questdb-sf;sender_id=iggy;"
```

With at least once, Iggy already holds every message that QuestDB did not
acknowledge, so `sf_dir` only spares a replay from Iggy. With at most once, the
store-and-forward queue is the only copy of rows that the sink reported as
written.

- The parent directory of `sf_dir` must exist. `~` is not expanded.
- Give each connector instance its own `sender_id` or its own `sf_dir`.
- By default the client does not fsync the queue, so a power loss can lose
  queued rows. Add `sf_durability=periodic` to fsync them every
  `sf_sync_interval_millis` (default 5000).
- A batch that QuestDB rejects terminally, for example after a schema
  mismatch, stays on disk and is sent first after every reconnect and restart.
  Every later batch fails behind it. See
  [Clear a rejected batch](#clear-a-rejected-batch).

See [Store-and-forward](/docs/high-availability/store-and-forward/concepts/)
for the full model.

### Durability on the QuestDB host

An `ok` acknowledgement means that QuestDB committed the rows. By default,
QuestDB does not flush a commit to disk, so a power loss or an operating system
crash on the QuestDB host can lose acknowledged rows.

To keep each batch until it is on the disk of the server:

1. Set `cairo.commit.mode=adaptive` in the QuestDB server configuration. It
   needs QuestDB 10.2.0 or QuestDB Enterprise 4.2.1.
2. Add `request_durable_ack=local` to the connect string:

   ```toml
   connection_string = "ws::addr=localhost:9000;request_durable_ack=local;"
   ```

The sink then waits for the `local_durable` acknowledgement of each batch. A
server without adaptive mode refuses the connection with
`server did not enable durable ACK`, and the connector does not start. See
[Durability](/docs/concepts/durability/) for the commit modes and their cost.

## Performance tuning

Start with the defaults. Each batch from Iggy waits once for its
acknowledgement, so larger batches amortize that wait.

| Setting                                | Where              | Default   | Use it to                                                           |
|----------------------------------------|--------------------|-----------|---------------------------------------------------------------------|
| `batch_length`                         | `[[streams]]`      | `1000`    | Set the maximum messages per poll from Iggy                         |
| `max_wait`, `min_count`                | `[[streams]]`      | `1s`, `1` | Let a poll wait for more messages, up to `max_wait`                  |
| `batch_size`                           | `[plugin_config]`  | `1000`    | Set the maximum rows per QWP chunk                                  |
| `max_flush_bytes`                      | `[plugin_config]`  | `1000000` | Flush a chunk of wide rows before it reaches the QWP frame size cap |
| `sender_pool_max`                      | connect string     | `4`       | Cap the QuestDB connections of the connector                        |

For example, to collect up to 5000 messages for up to 3 seconds per poll:

```toml
[[streams]]
stream = "events"
topics = ["questdb_events"]
schema = "json"
batch_length = 5000
max_wait = "3s"
min_count = 5000

[plugin_config]
batch_size = 5000
```

`min_count` must not exceed `batch_length`.

### Batch size

A QWP frame has a size cap of about 4 MiB by default, and the client refuses a
frame over the cap. `max_flush_bytes` makes the sink flush before a chunk of
wide rows reaches it. The cap is the smaller of `max_buf_size` and
`sf_max_segment_bytes` in the connect string. With the defaults, raise the cap
through `sf_max_segment_bytes`. A single message larger than the cap is
[rejected](#rejected-records).

### Connection pool

The runtime writes each topic in its own task, and each task borrows a pooled
connection. When all connections are in use, a borrow waits
`acquire_timeout_ms` (default 5 seconds) and then fails the batch. Set
`sender_pool_max` to at least the number of topics of the connector:

```toml
connection_string = "ws::addr=localhost:9000;sender_pool_max=16;"
```

## Monitoring

The runtime exposes Prometheus metrics at `/metrics` when `[http.metrics]` is
enabled in the runtime configuration:

```toml title="connectors.toml"
[http.metrics]
enabled = true
endpoint = "/metrics"
```

The metrics endpoint is served by the runtime API. To scrape it from another
host, you bind `[http] address` beyond loopback, which also exposes the
configuration endpoints. Read the
[warning on the runtime API](#run-the-runtime-in-docker) first.

`iggy_connector_errors_total{connector_key="questdb"}` counts failed batches
and messages that the runtime cannot decode.
`iggy_connector_messages_processed_total` counts the messages that the runtime
passed to the sink. `iggy_connector_stage_duration_seconds` with
`stage="ffi"` measures the time the sink spends writing each batch. The
runtime API also reports the status of each connector at
`http://127.0.0.1:8081/sinks`.

With at most once, a batch that writes some rows and rejects others counts as a
success, so alert on the `rejected message` log lines of the sink as well.

## QuestDB Enterprise

:::note QuestDB Enterprise

This section requires QuestDB Enterprise.

Try it with a [free 30-day trial](https://questdb.com/enterprise/trial/).

:::

The same plugin connects to QuestDB Enterprise. Set TLS, authentication,
failover and durable acknowledgements in the connect string.

### Authentication and TLS

Use `wss::` for TLS, and authenticate with a
[service account](/docs/security/rbac/#users-and-service-accounts) token:

```toml
connection_string = "wss::addr=questdb.example.com:9000;token=<your-token>;"
```

The sink treats the connect string as a secret and redacts it in its logs. To
keep the token out of the file, set the connect string through an environment
variable of the runtime:

```shell
export IGGY_CONNECTORS_SINK_QUESTDB_PLUGIN_CONFIG_CONNECTION_STRING=\
'wss::addr=questdb.example.com:9000;token=<your-token>;'
```

The variable name contains the uppercased connector key, `QUESTDB` here. Run
`iggy-connectors --list-config-env-vars` to print the supported names. The
runtime API still returns the connect string with its token, see the
[runtime API warning](#run-the-runtime-in-docker).

For a private certificate authority, point `tls_roots` at its certificate file.
Add `tls_roots_password` if that file is a JKS or PKCS#12 keystore.

[Grant](/docs/query/sql/acl/grant/) the service account:

- `HTTP`, to connect over QWP.
- `CREATE TABLE`, to create missing tables. The account
  [owns](/docs/security/rbac/#owner-grants) the tables it creates.
- `INSERT ON` each target table, instead of `CREATE TABLE`, if you create the
  tables yourself. Add `ADD COLUMN ON` the table if new payload fields must
  add columns.

```questdb-sql title="Service account for the sink"
CREATE SERVICE ACCOUNT iggy_sink;
GRANT HTTP, CREATE TABLE TO iggy_sink;
ALTER SERVICE ACCOUNT iggy_sink
    CREATE TOKEN TYPE REST WITH TTL '365d' REFRESH;
```

Pass the returned token as `token=` in the connect string. With `REFRESH`, each
successful connection extends the expiry of the token.

### Connect to a replicated cluster

QuestDB Enterprise can run as a
[replicated cluster](/docs/high-availability/overview/). One node, the
primary, accepts writes, and the replicas copy its data. List every node of
the cluster in `addr`. You do not need to know which node is the primary:

```toml
connection_string = "wss::addr=node-a:9000,node-b:9000,node-c:9000;token=<your-token>;"
```

When the sink connects, the client tries each address in turn. A replica
rejects the connection at once, so the client lands on the primary without a
backoff delay. If the first address is unreachable, the client moves on to the
next one.

### Planned switchover

Operators move the primary role with
[`SWITCH ROLE`](/docs/high-availability/failover/), for example before
maintenance. No committed data is lost, and the sink follows the new primary
without a restart:

1. The demoted node closes the connection of the sink on the first batch it
   refuses, with the reason `replica access is read-only`.
2. The client reconnects and tries each address in turn, and lands on the new
   primary.
3. The client resends the rows that the old primary did not acknowledge.

Step 3 can write rows twice, so declare
[deduplication keys](#exactly-once-delivery) on the target tables.

### Unplanned failover

When the primary fails, QuestDB does not promote a replica on its own. An
operator, or an external coordinator, runs `SWITCH ROLE TO PRIMARY` on a
replica. Until then, no node accepts writes:

- The client keeps retrying the listed nodes in the background and keeps the
  unacknowledged rows.
- With at least once, each batch fails after `flush_timeout`, and the runtime
  retries it after a backoff. Iggy keeps the messages, and the runtime does not
  store their offsets.
- Each retry queues one more copy of the batch, as in
  [Outages and reconnects](#outages-and-reconnects). Deduplication keeps one
  copy of each row.

Once a replica is promoted, the client connects to it and sends the queued
rows. Without `retry_max_attempts`, the runtime retries until the cluster has a
primary again. Setting it bounds the queued copies, but the runtime stops the
delivery of the topic when the attempts run out, and you must restart the
connector once a primary is available.

### Durable acknowledgements

With the default `ok` acknowledgement, the primary confirms a batch when it
commits it. A primary that fails before it uploads a committed transaction to
the replication object store loses those rows, although the sink already
stored their offsets.

To keep each batch until it is in the object store, request a durable
acknowledgement in the connect string:

```toml
connection_string = "wss::addr=node-a:9000,node-b:9000;token=<your-token>;request_durable_ack=replicated;"
```

The sink then waits for the `durable` acknowledgement of each batch, and the
runtime stores offsets only for rows that survive a failover. The values are:

| `request_durable_ack` | The sink waits until the batch is                         | Server requirement                                                 |
|-----------------------|-----------------------------------------------------------|--------------------------------------------------------------------|
| `replicated`          | in the replication object store                           | QuestDB Enterprise 4.2.1 with replication                          |
| `local,replicated`    | on the disk of the primary and in the object store        | QuestDB Enterprise 4.2.1 with replication and `cairo.commit.mode=adaptive` |
| `on`                  | in the object store, as `replicated`                      | QuestDB Enterprise with replication. The only value of 4.1 and older |
| `local`               | on the disk of the primary. It does not survive a failover | `cairo.commit.mode=adaptive`, see [Durability on the QuestDB host](#durability-on-the-questdb-host) |

Replication must be configured on the server. Without it, the server never
sends a durable acknowledgement, and every batch fails after `flush_timeout`.
If you request `local` or `local,replicated`, set `cairo.commit.mode=adaptive`
on every node that can become primary.

A durable acknowledgement adds one wait for the upload to every batch,
whatever its size. Raise `batch_length` and `batch_size` to keep the
throughput, see [Performance tuning](#performance-tuning).

`ack_level` in `[plugin_config]` follows `request_durable_ack` by default. Set
`ack_level = "ok"` only to request durable acknowledgements without waiting for
them. The sink logs a warning at start in that case.

See [Durable acknowledgements](/docs/concepts/durability/#durable-acknowledgements)
for the server side.

### Recover rows after a failover

Without durable acknowledgements, an unplanned failover can lose the most
recent rows that the old primary acknowledged. These messages are still in
Iggy while the topic retains them. To write them again,
[rewind the consumer group](#rewind-the-consumer-group) to an offset before the
failure. The deduplication keys drop the rows that the table already holds.

## Recovery procedures

### Rewind the consumer group

The sink consumes with an Iggy consumer group. Its name is the
`consumer_group` of the stream, or `iggy-connect-sink-<key>` when that is not
set. To write messages again from an earlier offset:

1. Stop the connectors runtime.
2. For each partition, find the first offset to write again. Choose an offset
   before the failure, with a margin. The highest `iggy_offset` in the table is
   not a safe start, because the sink writes a topic through several pooled
   connections, and rows below that offset can be missing.
3. Set the stored offset to one less than that offset. Iggy resumes after the
   stored offset. Partition ids start at 0:

   ```shell
   iggy -u <user> -p <password> consumer-offset set questdb_sink events \
     questdb_events <partition> <offset> --kind consumer-group
   ```

   If the first offset is 0, set a new `consumer_group` for the stream
   instead. A group with no stored offset starts at offset 0.

4. Start the connectors runtime.

The sink writes some rows a second time. Declare
[deduplication keys](#exactly-once-delivery) to keep one copy. This does not
work with `timestamp_source = "server"`, because the second copy gets a new
timestamp.

### Clear a rejected batch

With `sf_dir`, a batch that QuestDB rejects terminally stays in the
store-and-forward directory, and every later batch fails behind it. The sink
logs each blocked batch with a line that starts with
`QuestDB did not confirm writing`. To recover:

1. Stop the connectors runtime.
2. Fix the cause, for example the producer or the column type in the table.
3. Delete the slot directories under `<sf_dir>/<sender_id>-ingest-*/`. Without
   a `sender_id` in the connect string, it is `default`. This drops every
   unacknowledged batch that they hold.
4. [Rewind the consumer group](#rewind-the-consumer-group) to the lowest
   offset in the `QuestDB did not confirm writing` and
   `acknowledgement has not arrived yet` lines since the rejection.
5. Start the connectors runtime.

## Configuration reference

Set these options in the `[plugin_config]` table of the connector file:

| Name                       | Type    | Default                | Description                                                                                                       |
|----------------------------|---------|------------------------|-------------------------------------------------------------------------------------------------------------------|
| `ack_level`                | string  | from the connect string | `ok`, `durable` or `local_durable`. Unset, `request_durable_ack` decides. See [Durable acknowledgements](#durable-acknowledgements) |
| `batch_size`               | integer | `1000`                 | Maximum rows per QWP chunk                                                                                        |
| `connection_string`        | string  | required               | QuestDB [connect string](/docs/connect/clients/connect-string/), `ws::` or `wss::`. Treated as a secret           |
| `flush_timeout`            | string  | `30s`                  | How long a chunk waits for its acknowledgement without progress. `0s` turns off the wait and needs at most once   |
| `include_headers`          | boolean | `false`                | Write each header to a `header_<name>` column. See [Headers](#headers)                                            |
| `include_offset_column`    | boolean | `false`                | Write the offset to `iggy_offset`                                                                                 |
| `include_partition_column` | boolean | `false`                | Write the partition to `iggy_partition_id`                                                                        |
| `include_stream_column`    | boolean | `true`                 | Write the stream name to `iggy_stream`                                                                            |
| `include_topic_column`     | boolean | `true`                 | Write the topic name to `iggy_topic`                                                                              |
| `integer_columns`          | array   | `[]`                   | Payload fields stored as `LONG`                                                                                   |
| `log_rejected_payload`     | boolean | `false`                | Add a truncated payload to the log line of a rejected record                                                      |
| `max_flush_bytes`          | integer | `1000000`              | Flush when the buffer reaches this many bytes, even before `batch_size` rows                                      |
| `numbers_as_double`        | boolean | `true`                 | Write every JSON number as a `DOUBLE`. See [Numbers](#numbers)                                                    |
| `symbol_columns`           | array   | `[]`                   | Payload fields stored as [`SYMBOL`](/docs/concepts/symbol/)                                                       |
| `table`                    | string  | required               | Target table                                                                                                      |
| `timestamp_field`          | string  | none                   | Payload field with the timestamp. Required with `timestamp_source = "payload"`, rejected with any other source    |
| `timestamp_source`         | string  | `message`              | `message`, `origin`, `payload` or `server`. See [Designated timestamps](#designated-timestamps)                   |
| `timestamp_unit`           | string  | `auto`                 | `auto`, `seconds`, `millis`, `micros` or `nanos`. Used only with `timestamp_source = "payload"`                   |
| `uuid_columns`             | array   | `[]`                   | Payload fields holding RFC 4122 strings, stored as `UUID`                                                         |
| `verbose_logging`          | boolean | `false`                | Log per-batch details at `info` instead of `debug`                                                                |

The sink rejects unknown options and invalid values at start, and one start
reports all of them.

Set TLS, authentication, store-and-forward, reconnects and failover in the
connect string. See the
[connect string reference](/docs/connect/clients/connect-string/) for every
key.

The runtime options of the connector, such as `[[streams]]`, `[delivery]` and
transforms, are described in the
[Iggy connectors documentation](https://iggy.apache.org/docs/connectors/introduction).

## FAQ

<details>
  <summary>Does the sink work with QuestDB Open Source?</summary>

Yes. The same plugin works with QuestDB Open Source and QuestDB Enterprise.
TLS, multi-host failover and replicated durable acknowledgements need
QuestDB Enterprise. `request_durable_ack=local` works with QuestDB Open Source 10.2.0
or newer in adaptive commit mode.

</details>

<details>
  <summary>Which message formats can the sink read?</summary>

JSON objects and Avro records map to one column per field. Text messages and
UTF-8 raw messages go into one `payload` column. Protobuf and FlatBuffers
messages are not decoded into fields. See [Message formats](#message-formats).

</details>

<details>
  <summary>Can I write different topics to different tables?</summary>

Each connector writes to one table. Configure one connector file per table,
each with its own `key`, its own `[[streams]]` topics and its own `table`.

</details>

<details>
  <summary>The connector does not start and logs "failed to open"</summary>

The sink could not connect to QuestDB when it started. Check the address in
the connect string and that QuestDB is reachable from the runtime, then
restart the connector with `POST /sinks/<key>/restart` on the runtime API.

</details>

<details>
  <summary>The topic stopped with a permanent error</summary>

The sink rejected a record. Read the `rejected message` log line for its
offset and cause, then fix the cause or skip the record as
[Rejected records](#rejected-records) describes.

</details>

## See also

- [Delivery semantics](/docs/concepts/delivery-semantics/)
- [Deduplication](/docs/concepts/deduplication/)
- [Durability and commit modes](/docs/concepts/durability/)
- [Store-and-forward](/docs/high-availability/store-and-forward/concepts/)
- [Connect string reference](/docs/connect/clients/connect-string/)
- [QuestDB Wire Protocol (QWP)](/docs/connect/wire-protocols/overview/)
- [Role-based access control](/docs/security/rbac/)
- [Failover and role switch](/docs/high-availability/failover/)
- [Ingest data from Kafka](/docs/connect/message-brokers/kafka/)
- [QuestDB sink README](https://github.com/apache/iggy-connectors/tree/master/sinks/questdb_sink)
- [Iggy connectors documentation](https://iggy.apache.org/docs/connectors/introduction)
