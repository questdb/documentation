---
title: Ingestion overview
description:
  Learn how to ingest data into QuestDB, whether through the InfluxDB Line
  Protocol, PostgreSQL Wire Protocol, or through a service like Apache Kafka,
  Apache Spark, and more.
---

import Screenshot from "@theme/Screenshot"

QuestDB makes top performance "data-in" easy.

This guide will prepare you to get the most out of (and into!) QuestDB.

Choose from first-party clients, apply message brokers, event streaming
platforms, queues, and more.

## First-party clients

**Recommended!**

Our first party clients are **the fastest way to insert data, and they excel
with high volume, high cardinality data streaming.**

To start quickly, select your language:

- [C & C++](/docs/clients/ingest-c-and-cpp)
- [.NET](/docs/clients/ingest-dotnet)
- [Go](/docs/clients/ingest-go)
- [Java](/docs/clients/java_ilp)
- [Node.js](/docs/clients/ingest-node)
- [Python](/docs/clients/ingest-python)
- [Rust](/docs/clients/ingest-rust)

Our clients utitilize the InfluxDB Line Protocol (ILP) which is an insert-only
protocol that bypasses SQL `INSERT` statements, thus achieving significantly
higher throughput. It also provides some key benefits:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

An example of "data-in" - via the line - appears as:

```shell
trades,symbol=ETH-USD,side=sell price=2615.54,amount=0.00044 1646762637609765000\n
trades,symbol=BTC-USD,side=sell price=39269.98,amount=0.001 1646762637710419000\n
trades,symbol=ETH-USD,side=buy price=2615.4,amount=0.002 1646762637764098000\n
```

Once inside of QuestDB, it's yours to manipulate and query via extended SQL.

## Message brokers and queues

**Recommended!**

QuestDB supports several excellent message brokers, event streaming platforms
and/or queues.

Checkout our quick start guides for the following:

- [Flink](/docs/third-party-tools/flink)
- [Kafka](/docs/third-party-tools/kafka/overview)
- [Redpanda](/docs/third-party-tools/redpanda)
- [Telegraf](/docs/third-party-tools/telegraf)

## Easy CSV upload

**Recommended!**

For GUI-driven CSV upload which leverages the
[built-in REST HTTP API](/docs/reference/api/rest/), use the
[Import tab](/docs/web-console/#import) in the [Web Console](/docs/web-console/):

<Screenshot
  alt="Screenshot of the UI for import"
  height={535}
  src="/img/docs/console/import-ui.webp"
  width={800}
/>

For all CSV import methods, including using the APIs directly, see the
[CSV Import Guide](/docs/guides/import-csv/).

## PostgreSQL Wire Protocol

QuestDB also supports the
[PostgreSQL Wire Protocol (PGWire)](/docs/reference/api/postgres/).

It offers most PostgreSQL keywords and functions, including parameterized
queries and `psql` on the command line.

While PGWire is supported, we recommend applying the first-party clients or
other tools if possible.

This is to take advantage of maximum performance and overcome limitations in the
protocol.

## Create new data

No data yet? Just starting? No worries. We've got you covered.

There are several quick scaffolding options:

1. [QuestDB demo instance](https://demo.questdb.io): Hosted, fully loaded and
   ready to go. Quickly explore the [Web Console](/docs/web-console/) and SQL syntax.
2. [Create my first data set guide](/docs/guides/create-database/): Create
   tables, use `rnd_` functions and make your own data.
3. [Sample dataset repos](https://github.com/questdb/sample-datasets): IoT,
   e-commerce, finance or git logs? Check them out!
4. [Quick start repos](https://github.com/questdb/questdb-quickstart):
   Code-based quick starts that cover ingestion, querying and data visualization
   using common programming languages and use cases. Also, a cat in a tracksuit.
5. [Time series streaming analytics template](https://github.com/questdb/time-series-streaming-analytics-template):
   A handy template for near real-time analytics using open source technologies.

## Next step - queries

Depending on your infrastructure, it should now be apparent which ingestion
method is worth pursuing.

Of course, ingestion (data-in) is only half the battle.

> **Your next best step? Learn how to query and explore data-out from the
> [Query & SQL Overview](/docs/reference/sql/overview/).**

It might also be a solid bet to review
[timestamp basics](/docs/guides/working-with-timestamps-timezones/).
