---
title: Ingestion from Kafka Overview
sidebar_label: Kafka
description: Apache Kafka and QuestDB Kafka Connector overview and guide. Thorough explanations and examples.
---

Kafka is a fault-tolerant message broker that excels at streaming. Its ecosystem
provides tooling which - given the popularity of Kafka - can be used in
alternative services and tools like Redpanda, similar to how QuestDB supports
the InfluxDB Line Protocol.

1. Apply the Kafka Connect based
   [QuestDB Kafka connector](#questdb-kafka-connect-connector)
   - **Recommended for most people!**
2. Write a
   [custom program](#customized-program)
   to read data from Apache Kafka and write to QuestDB
3. Use a
   [stream processing](#stream-processing)
   engine

Each strategy has different trade-offs.

The rest of this section discusses each strategy and guides users who are
already familiar with the Kafka ecosystem.

## Customized program

Writing a dedicated program reading from Kafka topics and writing to QuestDB
tables offers great flexibility. The program can do arbitrary data
transformations and filtering, including stateful operations.

On the other hand, it's the most complex strategy to implement. You'll have to
deal with different serialization formats, handle failures, etc. This strategy
is recommended for very advanced use cases only.

_Not recommended for most people._

## Stream processing

[Stream processing](/glossary/stream-processing/) engines provide a middle
ground between writing a dedicated program and using one of the connectors.
Engines such as [Apache Flink](https://flink.apache.org/) provide rich API for
data transformations, enrichment, and filtering; at the same time, they can help
you with shared concerns such as fault-tolerance and serialization. However,
they often have a non-trivial learning curve.

QuestDB offers a [connector for Apache Flink](/docs/third-party-tools/flink/).
It is the recommended strategy if you are an existing Flink user, and you need
to do complex transformations while inserting entries from Kafka into QuestDB.

## QuestDB Kafka Connect connector

**Recommended for most people!**

QuestDB develops a first-party
[QuestDB Kafka connector](https://github.com/questdb/kafka-questdb-connector). The
connector is built on top of the
[Kafka Connect framework](https://docs.confluent.io/platform/current/connect/index.html)
and uses the InfluxDB Line Protocol for communication with QuestDB. Kafka
Connect handles concerns such as fault tolerance and serialization. It also
provides facilities for message transformations, filtering and so on. This is also useful 
for processing [change data capture](/glossary/change-data-capture/) for the dataflow.

The underlying InfluxDB Line Protocol ensures operational simplicity and
excellent performance. It can comfortably insert over 100,000s of rows per
second. Leveraging Apache Connect also allows QuestDB to connect with
Kafka-compatible applications like
[Redpanda](/docs/third-party-tools/redpanda/). The
connector is based on the
[Kafka Connect framework](https://kafka.apache.org/documentation/#connect) and
acts as a sink for Kafka topics.

This page has the following main sections:

- [Connector integration guide](#integration-guide)
- [Connector Configuration manual](#configuration-manual)
- [FAQ](#faq)

### Integration guide

This guide shows the steps to use the QuestDB Kafka connector to read JSON data
from Kafka topics and write them as rows into a QuestDB table. For Confluent
users, please check the instructions in the
[Confluent Docker images](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/confluent-docker-images).

### Prerequisites

You will need the following:

- Kafka
- QuestDB instance
- Local
  [JDK installation](https://docs.oracle.com/en/java/javase/18/install/overview-jdk-installation.html#GUID-8677A77F-231A-40F7-98B9-1FD0B48C346A)

### Configure Kafka

:::info

Before you begin manual configuration, note that that the connector is also
available from
[the Confluent Hub](https://www.confluent.io/hub/questdb/kafka-questdb-connector).

:::

Download the latest QuestDB Kafka connector package:

```shell
curl -s https://api.github.com/repos/questdb/kafka-questdb-connector/releases/latest |
jq -r '.assets[]|select(.content_type == "application/zip")|.browser_download_url'|
wget -qi -
```

Next, unzip the contents of the archive and copy the required `.jar` files to
your Kafka `libs` directory:

```shell
unzip kafka-questdb-connector-*-bin.zip
cd kafka-questdb-connector
cp ./*.jar /path/to/kafka_*.*-*.*.*/libs
```

### Set Kafka configuration file

Create a Kafka Connect configuration file at
`/path/to/kafka/config/questdb-connector.properties`. You can also define a
host, port, as well as a topic under the `topics={mytopic}` key. For more
information on how to configure properties, see the
[configuration manual](#configuration-manual).

This example file:

1. Assumes a running InfluxDB Line Protocol default port of `9000`
2. Creates a reader from a Kafka topic: `example-topic`
3. Creates & writes into a QuestDB table: `example_table`

```shell title="Create a configuration file"
name=questdb-sink
client.conf.string=http::addr=localhost:9000;
topics=example-topic
table=example_table

connector.class=io.questdb.kafka.QuestDBSinkConnector

# message format configuration
value.converter=org.apache.kafka.connect.json.JsonConverter
include.key=false
key.converter=org.apache.kafka.connect.storage.StringConverter
value.converter.schemas.enable=false
```

### Start Kafka

The commands listed in this section must be run from the Kafka home directory
and in the order shown below.

1. Start the Kafka Zookeeper used to coordinate the server:

```shell
bin/zookeeper-server-start.sh  config/zookeeper.properties
```

2. Start a Kafka server:

```shell
bin/kafka-server-start.sh  config/server.properties
```

3. Start the QuestDB Kafka connector:

```shell
bin/connect-standalone.sh config/connect-standalone.properties config/questdb-connector.properties
```

### Publish messages

Messages can be published via the console producer script:

```shell
bin/kafka-console-producer.sh --topic example-topic --bootstrap-server localhost:9092
```

A greater-than symbol, `>`, indicates that a message can be published to the
example topic from the interactive session. Paste the following minified JSON as
a single line to publish the message and create the table `example-topic` in the
QuestDB instance:

<!-- prettier-ignore-start -->

```json
{"firstname": "Arthur", "lastname": "Dent", "age": 42}
```

<!-- prettier-ignore-end -->

### Verify the integration

To verify that the data has been ingested into the `example-topic` table, the
following request to QuestDB's `/exp` REST API endpoint can be made to export
the table contents via the curl command.

```shell
curl -G \
  --data-urlencode "query=select * from 'example_table'" \
  http://localhost:9000/exp
```

The expected response based on the example JSON message published above will be
similar to the following:

```csv
"firstname","age","lastname","timestamp"
"Arthur",42,"Dent","2022-11-01T13:11:55.558108Z"
```

If you can see the expected result, then congratulations!

You have successfully created and executed your first Kafka to QuestDB pipeline.
🎉

### Additional sample projects

You can find additional sample projects on the
[QuestDB Kafka connector](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples)
Github project page.

It includes a
[sample integration](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/stocks)
with [Debezium](https://debezium.io/) for CDC from PostgreSQL.

### Configuration manual

This section lists configuration options as well as further information about
the Kafka Connect connector.

### Configuration Options

The connector configuration consists of two parts: the client configuration
string and the connector configuration options. The client configuration string
specifies how the connector communicates with the QuestDB server, while the
connector configuration options specify how the connector interprets and
processes data from Kafka.

See the chapter [Client configuration string](#client-configuration-string) for
more information about the client configuration string. The table below lists
the connector configuration options:

| Name                               | Type      | Example                                                     | Default            | Meaning                                                     |
| ---------------------------------- | --------- | ----------------------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| client.conf.string                 | `string`  | http::addr=localhost:9000;                                  | N/A                | Client configuration string                                 |
| topics                             | `string`  | orders,audit                                                | N/A                | Kafka topics to read from                                   |
| key.converter                      | `string`  | <sub>org.apache.kafka.connect.storage.StringConverter</sub> | N/A                | Converter for keys stored in Kafka                          |
| value.converter                    | `string`  | <sub>org.apache.kafka.connect.json.JsonConverter</sub>      | N/A                | Converter for values stored in Kafka                        |
| table                              | `string`  | my_table                                                    | Same as Topic name | Target table in QuestDB                                     |
| key.prefix                         | `string`  | from_key                                                    | key                | Prefix for key fields                                       |
| value.prefix                       | `string`  | from_value                                                  | N/A                | Prefix for value fields                                     |
| allowed.lag                        | `int`     | 250                                                         | 1000               | Allowed lag when there are no new events                    |
| <sub>skip.unsupported.types</sub>  | `boolean` | false                                                       | false              | Skip unsupported types                                      |
| <sub>timestamp.field.name</sub>    | `string`  | pickup_time                                                 | N/A                | Designated timestamp field name                             |
| timestamp.units                    | `string`  | micros                                                      | auto               | Designated timestamp field units                            |
| <sub>timestamp.kafka.native</sub>  | `boolean` | true                                                        | false              | Use Kafka timestamps as designated timestamps               |
| <sub>timestamp.string.fields</sub> | `string`  | creation_time,pickup_time                                   | N/A                | String fields with textual timestamps                       |
| <sub>timestamp.string.format</sub> | `string`  | yyyy-MM-dd HH:mm:ss.SSSUUU z                                | N/A                | Timestamp format, used when parsing timestamp string fields |
| include.key                        | `boolean` | false                                                       | true               | Include message key in target table                         |
| symbols                            | `string`  | instrument,stock                                            | N/A                | Comma separated list of columns that should be symbol type  |
| doubles                            | `string`  | volume,price                                                | N/A                | Comma separated list of columns that should be double type  |

### How does the connector work?

The connector reads data from Kafka topics and writes it to QuestDB tables via
InfluxDB Line Protocol. The connector converts each field in the Kafka message
to a column in the QuestDB table. Structures and maps are flatted into columns.

Example: Consider the following Kafka message:

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

The connector will create a table with the following columns:

| firstname <sub>string</sub> | lastname <sub>string</sub> | age <sub>long</sub> | address_street <sub>string</sub> | address_city <sub>string</sub> |
| --------------------------- | -------------------------- | ------------------- | -------------------------------- | ------------------------------ |
| John                        | Doe                        | 30                  | Main Street                      | New York                       |

### Client configuration string

The connector internally uses the QuestDB Java client to communicate with the
QuestDB server. The `client.conf.string` option allows you to configure the
client. Alternatively, you can set the client configuration string by exporting
an environment variable `QDB_CLIENT_CONF`.

This string follows the format:

```
<protocol>::<key>=<value>;<key>=<value>;...;
```

Please note the trailing semicolon at the end of the string.

The supported transport protocols are:

- http
- https

A transport protocol and the key `addr=host:port;` are required. The key `addr`
defines the hostname and port of the QuestDB server. If the port is not
specified, it defaults to 9000.

Minimal example with plaintext HTTP:

```
http::addr=localhost:9000;
```

Configuration string with HTTPS and custom retry timeout:

```
http::addr=localhost:9000;retry_timeout=60000;
```

See the [Java Client configuration guide](/docs/clients/java_ilp) for all
available options. Note that client configuration options are different from
connector configuration options. The client configuration string specifies how
the connector communicates with the QuestDB server, while the connector
configuration options specify how the connector interprets and processes data
from Kafka.

:::info

Besides HTTP transport, the QuestDB client also technically supports TCP
transport; however, it is not recommended for use with the Kafka connector. TCP
transport offers no delivery guarantees, so it is therefore unsuitable for use
with Kafka.

:::

### Supported serialization formats

The connector does not deserialize data independently. It relies on Kafka
Connect converters. The connector has been tested predominantly with JSON, but
it should work with any converter, including Avro. Converters can be configured
using `key.converter` and `value.converter` options, both are included in the
[Configuration options](#configuration-options) table above.

### Designated timestamps

The connector supports
[designated timestamps](https://questdb.io/docs/concept/designated-timestamp/).

There are three distinct strategies for designated timestamp handling:

1. QuestDB server assigns a timestamp when it receives data from the connector.
   (Default)
2. The connector extracts the timestamp from the Kafka message payload.
3. The connector extracts timestamps from
   [Kafka message metadata.](https://cwiki.apache.org/confluence/display/KAFKA/KIP-32+-+Add+timestamps+to+Kafka+message)

Kafka messages carry various metadata, one of which is a timestamp. To use the
Kafka message metadata timestamp as a QuestDB designated timestamp, set
`timestamp.kafka.native` to `true`.

If a message payload contains a timestamp field, the connector can utilize it as
a designated timestamp. The field's name should be configured using the
`timestamp.field.name` option. This field should either be an integer or a
timestamp.

When the field is defined as an integer, the connector will automatically detect
its units. This is applicable for timestamps after `04/26/1970, 5:46:40 PM`.

The units can also be configured explicitly using the `timestamp.units` option,
which supports the following values:

- `nanos`
- `micros`
- `millis`
- `seconds`
- `auto` (default)

Note: These 3 strategies are mutually exclusive. Cannot set both
`timestamp.kafka.native=true` and `timestamp.field.name`.

### Textual timestamps parsing

Kafka messages often contain timestamps in a textual format. The connector can
parse these and use them as timestamps. Configure field names as a string with
the `timestamp.string.fields` option. Set the timestamp format with the
`timestamp.string.format` option, which adheres to the QuestDB timestamp format.

See the
[QuestDB timestamp](/docs/reference/function/date-time/#date-and-timestamp-format)
documentation for more details.

#### Example

Consider the following Kafka message:

```json
{
  "firstname": "John",
  "lastname": "Doe",
  "born": "1982-01-07 05:42:11.123456 UTC",
  "died": "2031-05-01 09:11:42.456123 UTC"
}
```

To use the `born` field as a designated timestamp and `died` as a regular
timestamp set the following properties in your QuestDB connector configuration:

1. `timestamp.field.name=born` - the field `born` is a designated timestamp.
1. `timestamp.string.fields=died` - set the field name `died` as a textual
   timestamp. Notice this option does not contain the field `born`. This field
   is already set as a designated timestamp so the connector will attempt to
   parse it as a timestamp automatically.
1. `timestamp.string.format=yyyy-MM-dd HH:mm:ss.SSSUUU z` - set the timestamp
   format. Please note the correct format for microseconds is `SSSUUU` (3 digits
   for milliseconds and 3 digits for microseconds).

### Fault Tolerance

The connector automatically retries failed requests deemed recoverable.
Recoverable errors include network errors, some server errors, and timeouts,
while non-recoverable errors encompass invalid data, authentication errors, and
other client-side errors.

Retrying is particularly beneficial during network issues or when the server is
temporarily unavailable. The retrying behavior can be configured through client
configuration parameter `retry_timeout`. This parameter specifies the maximum
time in milliseconds the client will attempt to retry a request. The default
value is 10000 ms.

Example with a retry timeout of 60 seconds:

```text
client.conf.string=http::addr=localhost:9000;retry_timeout=60000;
```

#### Exactly once delivery

Retrying might result in the same rows delivered multiple times. To ensure
exactly once delivery, a target table must have
[deduplication enabled](/docs/concept/deduplication/). Deduplication filters out
duplicate rows, including those caused by retries.

Note that deduplication requires designated timestamps extracted either from
message payload or Kafka message metadata. See the
[Designated timestamps](#designated-timestamps) section for more information.

#### Dead Letter Queue

When messages cannot be processed due to non-recoverable errors, such as invalid data formats or schema mismatches, the
connector can send these failed messages to a Dead Letter Queue (DLQ). This prevents the entire connector from stopping
when it encounters problematic messages. To enable this feature, configure the Dead Letter Queue in your Kafka Connect
worker configuration using the `errors.tolerance`, `errors.deadletterqueue.topic.name`, and
`errors.deadletterqueue.topic.replication.factor` properties. For example:

```properties
errors.tolerance=all
errors.deadletterqueue.topic.name=dlq-questdb
errors.deadletterqueue.topic.replication.factor=1
```

When configured, messages that fail to be processed will be sent to the specified DLQ topic along with error details,
allowing for later inspection and troubleshooting. This is particularly useful in production environments where data
quality might vary and you need to ensure continuous operation while investigating problematic messages.

See [Confluent article](https://developer.confluent.io/courses/kafka-connect/error-handling-and-dead-letter-queues/) about DLQ.


### Latency considerations

The connector waits for a batch of messages to accumulate before sending them to
the server. The batch size is determined by the `auto_flush_rows` client string
configuration parameter, it defaults to 75,000 rows. When you have a low
throughput, you might want to reduce the batch size to reduce latency.

Example with a batch size 1,000:

```text
client.conf.string=http::addr=localhost:9000;auto_flush_rows=1000;
```

The protocol also sends accumulated data to a QuestDB server when Kafka topics
has no new events for 1000 milliseconds. This value can be configured with the
`allowed.lag` connector configuration parameter.

Example with allowed lag set to 250 milliseconds:

```text
client.conf.string=http::addr=localhost:9000;auto_flush_rows=1000;
allowed.lag=250;
```

The connector also sends data to the server when Kafka Connect is committing
offsets. Frequency of commits can be configured in the Kafka Connect
configuration file by using the `offset.flush.interval.ms` parameter. See the
[Kafka Connect Reference](https://docs.confluent.io/platform/current/connect/references/allconfigs.html)
for more information.

### Symbol type

QuestDB supports a special type called
[symbol](https://questdb.io/docs/concept/symbol/). Use the `symbols`
configuration option to specify which columns should be created as the `symbol`
type.

### Numeric type inference for floating point type

When a configured Kafka Connect deserializer provides a schema, the connector
uses it to determine column types. If a schema is unavailable, the connector
infers the type from the value. This might produce unexpected results for
floating point numbers, which may be interpreted as `long` initially and
generates an error.

Consider this example:

```json
{
  "instrument": "BTC-USD",
  "volume": 42
}
```

Kafka Connect JSON converter deserializes the `volume` field as a `long` value.
The connector sends it to the QuestDB server as a `long` value. If the target
table does not have a column `volume`, the database creates a `long` column. If
the next message contains a floating point value for the `volume` field, the
connector sends it to QuestDB as a `double` value. This causes an error because
the existing column `volume` is of type `long`.

To avoid this problem, the connector can be configured to send selected numeric
columns as `double` regardless of the actual initial input value. Use the
`doubles` configuration option to specify which columns should the connector
always send as the `double` type.

Alternatively, you can use SQL to explicitly create the target table with the
correct column types instead of relying on the connector to infer them. See the
paragraph below.

### Target table considerations

#### Table name

By default, the target table name in QuestDB is the same as the Kafka topic
name from which a message originates. When a connector is configured to read
from multiple topics, it uses a separate table for each topic.

Set the table configuration option to override this behavior. Once set, the connector will write all messages to the specified table,
regardless of the topic from which they originate.

Example:

```shell title="Configuration file an explicit table name"
name=questdb-sink
connector.class=io.questdb.kafka.QuestDBSinkConnector
client.conf.string=http::addr=localhost:9000;
topics=example-topic
table=example_table

[...]
```

The `table` options supports simple templating. You can use the following
variables in the table name: `${topic}`, `${key}`. The connector will replace
these variables with the actual topic name and key value from the Kafka message.

Example:

```shell title="Configuration file with a templated table name"
name=questdb-sink
connector.class=io.questdb.kafka.QuestDBSinkConnector
client.conf.string=http::addr=localhost:9000;
topics=example-topic
table=from_kafka_${topic}_${key}_suffix

[...]
```

The placeholder `${key}` will be replaced with the actual key value from the
Kafka message. If the key is not present in the message, the placeholder will be
replaced with the string `null`.

#### Table schema

When a target table does not exist in QuestDB, it will be created automatically.
This is the recommended approach for development and testing.

In production, it's recommended to use the SQL
[CREATE TABLE](https://questdb.io/docs/reference/sql/create-table/) keyword,
because it gives you more control over the table schema, allowing per-table
[partitioning](/glossary/database-partitioning/), creating indexes, etc.

### FAQ

<details>
  <summary>Does this connector work with Schema Registry? </summary>
<p>

The Connector works independently of the serialization strategy used. It relies
on Kafka Connect converters to deserialize data. Converters can be configured
using `key.converter` and `value.converter` options, see the configuration
section above.

</p>
</details>

<details>
  <summary>I'm getting this error:
"org.apache.kafka.connect.errors.DataException: JsonConverter with schemas.enable requires 'schema' and 'payload' fields and may not contain additional fields. If you are trying to deserialize plain JSON data, set schemas.enable=false in your converter configuration."</summary>
<p>

This error means that the connector is trying to deserialize data using a
converter that expects a schema. The connector does not require schemas, so you
need to configure the converter to not expect a schema. For example, if you are
using a JSON converter, you need to set `value.converter.schemas.enable=false`
or `key.converter.schemas.enable=false` in the connector configuration.

</p>
</details>

<details>
  <summary>Does this connector work with Debezium?</summary>
<p>

Yes, it's been tested with Debezium as a source and a
[sample project](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/stocks)
is available. Bear in mind that QuestDB is meant to be used as an append-only
database; hence, updates should be translated as new inserts. The connector
supports Debezium's `ExtractNewRecordState` transformation to extract the new
state of the record. The transformation by default drops DELETE events, so there
is no need to handle them explicitly.

</p>
</details>

<details>
  <summary>QuestDB is a [time-series database](/glossary/time-series-database/), how does it fit into Change Data
Capture via Debezium?</summary>
<p>

QuestDB works with Debezium just great! This is the recommended pattern:
Transactional applications use a
[relational database](/glossary/relational-database/) to store the current state
of the data. QuestDB is used to store the history of changes. Example: Imagine
you have a PostgreSQL table with the most recent stock prices. Whenever a stock
price changes, an application updates the PostgreSQL table. Debezium captures
each UPDATE/INSERT and pushes it as an event to Kafka. Kafka Connect QuestDB
connector reads the events and inserts them into QuestDB. In this way,
PostgreSQL will have the most recent stock prices and QuestDB will have the
history of changes. You can use QuestDB to build a dashboard with the most
recent stock prices and a chart with the history of changes.

</p>
</details>

<details>
  <summary>How I can select which fields to include in the target table?</summary>
<p>

Use the ReplaceField transformation to remove unwanted fields. For example, if
you want to remove the `address` field, you can use the following configuration:

```json
{
  "name": "questdb-sink",
  "config": {
    "connector.class": "io.questdb.kafka.QuestDBSinkConnector",
    "host": "localhost:9000",
    "topics": "Orders",
    "table": "orders_table",
    "key.converter": "org.apache.kafka.connect.storage.StringConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "transforms": "removeAddress",
    "transforms.removeAddress.type": "org.apache.kafka.connect.transforms.ReplaceField$Value",
    "transforms.removeAddress.blacklist": "address"
  }
}
```

See
[ReplaceField documentation](https://docs.confluent.io/platform/current/connect/transforms/replacefield.html#replacefield)
for more details.

</p>
</details>

<details>
  <summary>I need to run Kafka Connect on Java 8, but the connector says it requires
Java 17. What should I do? </summary>
<p>

The Kafka Connect-specific part of the connectors works with Java 8. The
requirement for Java 17 is coming from QuestDB client itself. The zip archive
contains 2 JARs: `questdb-kafka-connector-VERSION.jar` and
`questdb-VERSION.jar`. You can replace the latter with
`questdb-VERSION-jdk8.jar` from the
[Maven central](https://mvnrepository.com/artifact/org.questdb/questdb/6.5.4-jdk8).
Please note that this setup is not officially supported, and you may encounter
issues. If you do, please report them to us.

</p>
</details>

### See also

- [Change Data Capture with QuestDB and Debezium](/blog/2023/01/03/change-data-capture-with-questdb-and-debezium)
- [Realtime crypto tracker with QuestDB Kafka Connector](/blog/realtime-crypto-tracker-with-questdb-kafka-connector)
