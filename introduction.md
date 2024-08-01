---
title: Introduction
slug: /
description:
  QuestDB time series database documentation. QuestDB is a fast columnar time
  series database that solves ingestion speed bottlenecks
---

import Screenshot from "@theme/Screenshot"

import CodeBlock from "@theme/CodeBlock"

QuestDB is an Apache 2.0 open source columnar database that specializes in time
series.

It offers **category-leading ingestion throughput** and **fast SQL queries**
with operational simplicity.

Given its effiency, QuestDB **reduces operational costs**, all while overcoming
ingestion bottlenecks.

As a result, QuestDB offers greatly simplified overall ingress infrastructure.

This introduction provides a brief overview on:

- [Top QuestDB features](#features)
- [Benefits of QuestDB](#benefits)
- [QuestDB Enterprise](#questdb-enterprise)
- [Where to next?](#next-up)
- [Support](#support)

<hr />

> **Just want to build? Jump to the [quick start](/docs/quick-start/) guide.**

<hr />

## Top QuestDB features {#features}

QuestDB is applied within cutting edge use cases around the world.

Developers are most enthusiastic about the following key features:

#### Massive ingestion handling & throughput

If you are running into throughput bottlenecks using an existing storage engine
or time series database, QuestDB can help.

#### Familiar SQL analytics

No obscure domain-specific languages required. Use extended SQL.

#### High performance deduplication & out-of-order indexing

[High data cardinality](/glossary/high-cardinality/) will not lead to
performance degradation.

#### Hardware efficiency

Strong, cost-saving performance on very mninimal hardware, including sensors and
Raspberry Pi.

#### Time series SQL extensions

Fast, SIMD-optimized SQL extensions to cruise through querying and analysis.

Greatest hits include:

- [`SAMPLE BY`](/docs/reference/sql/sample-by/) summarizes data into chunks
  based on a specified time interval, from a year to a microsecond
- [`WHERE IN`](/docs/reference/sql/where/#time-range) to compress time ranges
  into concise intervals
- [`LATEST ON`](/docs/reference/sql/latest-on/) for latest values within
  multiple series within a table
- [`ASOF JOIN`](/docs/reference/sql/join/#asof-join) to associate timestamps
  between a series based on proximity; no extra indices required

## Benefits of QuestDB {#benefits}

Time series data is seen increasingly in use cases across:

- finance
- internet of things (IoT)
- e-commerce
- security
- blockchain
- many other emerging technical industries

As more time bound data is generated, high performance data reception is
essential to avoid ingestion bottlenecks.

The right data store greatly simplifies code costly infrastructure sprawl and
spend.

But to be _the right one_, the storage engine must be both high performance and
efficient:

<Screenshot
  alt="A chart showing high-cardinality ingestion performance of InfluxDB, TimescaleDB, and QuestDB"
  src="/img/benchmark/benchmark_all_q1_2024.webp"
  width={650}
  title="Benchmark results for QuestDB 7.3.10, InfluxDB 2.7.4 and Timescale 2.14.2"
/>

Beyond performance and efficiency, with a specialized
[time-series database](/glossary/time-series-database/), you don't need to worry
about:

- out-of-order data
- duplicates
- exactly one semantics
- frequency of ingestion
- many other details you will find in demanding real-world scenarios

QuestDB provides simplified, hyper-fast data ingestion with tremendous
efficiency and therefore value.

Write blazing-fast queries and create real-time
[Grafana](/docs/third-party-tools/grafana/) via familiar SQL:

```questdb-sql title='Navigate time with SQL' demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE  timestamp > dateadd('d', -1, now())
SAMPLE BY 15m;
```

Intrigued? The best way to see whether QuestDB is right for you is to try it
out.

Click _Demo this query_ in the snippet above to visit our demo instance and
experiment.

To bring your own data and learn more, keep reading!

## QuestDB Enterprise

QuestDB Enterprise offers everything from open source, plus additional features
for running QuestDB at greater scale or significance.

For a breakdown of Enterprise features, see the
[QuestDB Enterprise](/enterprise/) page.

## Where to next? {#next-up}

You'll be inserting data and generating valuable queries in little time.

First, the [quick start](/docs/quick-start/) guide will get you running.

Choose from one of our premium ingest-only language clients:

- [C & C++](/docs/clients/ingest-c-and-cpp)
- [.NET](/docs/clients/ingest-dotnet)
- [Go](/docs/clients/ingest-go)
- [Java](/docs/clients/java_ilp)
- [Node.js](/docs/clients/ingest-node)
- [Python](/docs/clients/ingest-python)
- [Rust](/docs/clients/ingest-rust)

From there, you can learn more about what's to offer.

- [Ingestion overview](/docs/ingestion-overview/) want to see all available
  ingestion options? Checkout the overview.
- [Query & SQL Overview](/docs/reference/sql/overview/) learn how to query
  QuestDB
- [Web Console](/docs/web-console/) for quick SQL queries, charting and CSV
  upload/export functionality
- [Grafana guide](/docs/third-party-tools/grafana/) to visualize your data as
  beautiful and functional charts.
- [Capacity planning](/docs/deployment/capacity-planning/) to optimize your
  QuestDB deployment for production workloads.

## Support

We are happy to help with any question you may have.

The team loves a good performance optimization challenge!

Feel free to reach out using the following channels:

- [Raise an issue on GitHub](https://github.com/questdb/questdb/issues/new/choose)
- [Join our community forums](https://community.questdb.io/)
- [QuestDB on Stack Overflow](https://stackoverflow.com/questions/tagged/questdb)
- or email us at [hello@questdb.io](mailto:hello@questdb.io)
