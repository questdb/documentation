---
title: Ingestion from Kafka Overview
sidebar_label: Overview
description: Apache Kafka integration overview.
---

Ingesting data from Apache Kafka to QuestDB is a common use case. Possible
strategies are as the following:

1. [QuestDB Kafka connector](/docs/third-party-tools/kafka/questdb-kafka/): The
   recommended strategy for connecting to Kafka using InfluxDB Line Protocol and
   Kafka Connect.
2. [JDBC connector](/docs/third-party-tools/kafka/jdbc/): A generic connector
   using Kafka Connect.
3. Write a dedicated program to read data from Kafka and write to QuestDB.
4. Use a [stream processing](/glossary/stream-processing) engine.

Each strategy has different trade-offs. The rest of this page discusses each
strategy and aims to guide advanced users.

## QuestDB Kafka connector

QuestDB has developed a QuestDB Kafka connector for Kafka. The connector is
built on top of the Kafka Connect framework and uses the
[InfluxDB Line Protocol](/docs/develop/insert-data/#influxdb-line-protocol/) for
communication with QuestDB. Kafka Connect handles concerns such as fault
tolerance and serialization. It also provides facilities for message
transformations, filtering, etc. InfluxDB Line Protocol ensures operational
simplicity and excellent performance: it can insert 100,000s rows per second.

**This is the recommended strategy for most users.**

## JDBC connector

Similar to the QuestDB Kafka connector, the JDBC connector also uses the Kafka
Connect framework. However, instead of using a dedicated InfluxDB Line Protocol,
it relies on a [generic JDBC binary](/docs/third-party-tools/kafka/jdbc/) and
QuestDB
[PostgreSQL protocol compatibility](/docs/develop/connect/#postgresql-wire-protocol).
It requires objects in Kafka to have associated schema and overall it is more
complex to set up and run. Compared to the QuestDB Kafka connector, the JDBC
connector has significantly lower performance, but the following advantages:

- JDBC insertion allows higher consistency guarantees than the fire-and-forget
  InfluxDB Line Protocol method used by the QuestDB Kafka connector.
- Various Kafka-as-a-Service providers often have the JDBC connector
  pre-packaged.

This strategy is recommended when the QuestDB Kafka connector cannot be used for
some reason.

## Dedicated program

Writing a dedicated program reading from Kafka topics and writing to QuestDB
tables offers great flexibility: The program can do arbitrary data
transformations and filtering, including stateful operations. On the other hand:
It's the most complex strategy to implement. You'll have to deal with different
serialization formats, handle failures, etc. This strategy is recommended for
very advanced use cases only. This is not recommended for most users.

## Stream processing engine

Stream processing engine provides a middle ground between writing a dedicated
program and using one of the connectors. Engines such as
[Apache Flink](https://flink.apache.org/) provide rich API for data
transformations, enrichment, and filtering; at the same time, they can help you
with shared concerns such as fault-tolerance and serialization. However, they
often have a non-trivial learning curve. QuestDB offers a
[connector for Apache Flink](/docs/third-party-tools/flink/). It is the
recommended strategy if you are an existing Flink user, and you need to do
complex transformations while inserting entries from Kafka to QuestDB.
