---
title: Ingestion from Kafka Overview
sidebar_label: Overview
description: Apache Kafka integration overview.
---

Kafka is a fault-tolerant message broker that excels at streaming. Its ecosystem
provides tooling which - given the popularity of Kafka - can be used in
alternative services and tools like Redpanda, similar to how QuestDB supports
the InfluxDB Line Protocol.

1. Apply the Kafka Connect based
   [QuestDB Kafka connector](/docs/third-party-tools/kafka/overview/#questdb-connector)
2. Write a
   [custom program](/docs/third-party-tools/kafka/overview/#customized-program)
   to read data from Apache Kafka and write to QuestDB
3. Use a
   [stream processing](/docs/third-party-tools/kafka/overview/#stream-processing)
   engine

Each strategy has different trade-offs.

The rest of this section discusses each strategy and guides users who are
already familiar with the Kafka ecosystem.

### QuestDB Kafka Connect connector

**Recommended for most people!**

QuestDB develops a first-party
[QuestDB Kafka connector](/docs/third-party-tools/kafka/questdb-kafka/). The
connector is built on top of the
[Kafka Connect framework](https://docs.confluent.io/platform/current/connect/index.html)
and uses the InfluxDB Line Protocol for communication with QuestDB. Kafka
Connect handles concerns such as fault tolerance and serialization. It also
provides facilities for message transformations, filtering and so on.

The underlying InfluxDB Line Protocol ensures operational simplicity and
excellent performance. It can comfortably insert over 100,000s of rows per
second. Leveraging Apache Connect also allows QuestDB to connect with
Kafka-compatible applications like
[Redpanda](/docs/third-party-tools/redpanda/).

Read [our QuestDB Kafka connector](/docs/third-party-tools/kafka/questdb-kafka/)
guide to get started.

### Customized program

Writing a dedicated program reading from Kafka topics and writing to QuestDB
tables offers great flexibility. The program can do arbitrary data
transformations and filtering, including stateful operations.

On the other hand, it's the most complex strategy to implement. You'll have to
deal with different serialization formats, handle failures, etc. This strategy
is recommended for very advanced use cases only.

_Not recommended for most people._

### Stream processing

[Stream processing](/glossary/stream-processing/) engines provide a middle
ground between writing a dedicated program and using one of the connectors.
Engines such as [Apache Flink](https://flink.apache.org/) provide rich API for
data transformations, enrichment, and filtering; at the same time, they can help
you with shared concerns such as fault-tolerance and serialization. However,
they often have a non-trivial learning curve.

QuestDB offers a [connector for Apache Flink](/docs/third-party-tools/flink/).
It is the recommended strategy if you are an existing Flink user, and you need
to do complex transformations while inserting entries from Kafka into QuestDB.
