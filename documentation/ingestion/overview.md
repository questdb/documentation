---
title: Ingestion overview
description:
  Learn how to ingest data into QuestDB, whether through the InfluxDB Line
  Protocol, PostgreSQL Wire Protocol, or through a service like Apache Kafka,
  Apache Spark, and more.
---

import Screenshot from "@theme/Screenshot"

import { Clients } from "../../src/components/Clients"

For high-throughput data ingestion, use our **first-party clients** with the
**InfluxDB Line Protocol (ILP)**. This is the recommended method for production
workloads.

## First-party clients

Our first-party clients are **the fastest way to insert data**. They excel
with high-throughput, low-latency data streaming and are the recommended choice
for production deployments.

To start quickly, select your language:

<Clients />

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

Once inside of QuestDB, it's yours to manipulate and query via extended SQL. Please note that table and column names
must follow the QuestDB [naming rules](/docs/query/sql/create-table/#table-name).

### Ingestion characteristics

QuestDB is optimized for both throughput and latency. Send data when you have
it - there's no need to artificially batch on the client side.

| Mode | Throughput (per connection) |
|------|----------------------------|
| Batched writes | ~400k rows/sec |
| Single-row writes | ~60-80k rows/sec |

Clients control batching via explicit `flush()` calls. Each flush ends a batch
and sends it to the server. If your data arrives one row at a time, send it one
row at a time - QuestDB handles this efficiently. If data arrives in bursts,
batch it naturally and flush when ready.

Server-side, WAL processing is asynchronous. Transactions are grouped into
segments that roll based on size or row count, requiring no client-side tuning.

## Message brokers and queues

If you already have Kafka, Flink, or another streaming platform in your stack,
QuestDB integrates seamlessly.

See our integration guides:

- [Flink](/docs/ingestion/message-brokers/flink)
- [Kafka](/docs/ingestion/message-brokers/kafka)
- [Redpanda](/docs/ingestion/message-brokers/redpanda)
- [Telegraf](/docs/ingestion/message-brokers/telegraf)

## CSV import

For bulk imports or one-time data loads, use the
[Import CSV tab](/docs/getting-started/web-console/import-csv) in the [Web Console](/docs/getting-started/web-console/overview/):

<Screenshot
  alt="Screenshot of the UI for import"
  height={535}
  src="images/docs/console/import-ui.webp"
  width={800}
/>

For all CSV import methods, including using the APIs directly, see the
[CSV Import Guide](/docs/ingestion/import-csv/).

## Create new data

No data yet? Just starting? No worries. We've got you covered.

There are several quick scaffolding options:

1. [QuestDB demo instance](https://demo.questdb.io): Hosted, fully loaded and
   ready to go. Quickly explore the [Web Console](/docs/getting-started/web-console/overview/) and SQL syntax.
2. [Create my first data set guide](/docs/getting-started/create-database/): Create
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
> [Query & SQL Overview](/docs/query/overview/).**

It might also be a solid bet to review
[timestamp basics](/docs/concepts/timestamps-timezones/).
