---
title: Why QuestDB?
slug: why-questdb
description:
  We'll explain the main features, advances and benefits of QuestDB. Learn how to accelerate your time-series use cases.
---

import { Clients } from '../src/components/Clients'
import Screenshot from "@theme/Screenshot"

This pages provides a brief overview on:

- [Top QuestDB features](#features)
- [Benefits of QuestDB](#benefits)
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

#### High performance deduplication & out-of-order indexing

[High data cardinality](/glossary/high-cardinality/) will not lead to
performance degradation.

#### Hardware efficiency

Strong, cost-saving performance on very mninimal hardware, including sensors and
Raspberry Pi.

#### SQL with time series extensions

Fast, SIMD-optimized SQL extensions to cruise through querying and analysis.

No obscure domain-specific languages required.

Greatest hits include:

- [`SAMPLE BY`](/docs/reference/sql/sample-by/) summarizes data into chunks
  based on a specified time interval, from a year to a microsecond
- [`WHERE IN`](/docs/reference/sql/where/#time-range) to compress time ranges
  into concise intervals
- [`LATEST ON`](/docs/reference/sql/latest-on/) for latest values within
  multiple series within a table
- [`ASOF JOIN`](/docs/reference/sql/asof-join/) to associate timestamps between
  a series based on proximity; no extra indices required

## Benefits of QuestDB {#benefits}

To avoid ingestion bottlenecks, high performance data ingestion is essential.

But performance is only part of the story.

Efficiency measures how well a database performs relative to its available
resources.

QuestDB, on maximal hardware, significantly outperforms peers:

<Screenshot
  alt="A chart showing high-cardinality ingestion performance of InfluxDB, TimescaleDB, and QuestDB"
  src="images/benchmark/benchmark_all_q1_2024.webp"
  width={650}
  title="Benchmark results for QuestDB 7.3.10, InfluxDB 2.7.4 and Timescale 2.14.2"
/>

However, on less robust hardware the difference is even more pronounced, as seen
in the following benchmark.

Even on hardware as light as a Raspberry Pi 5, QuestDB outperforms competitors
on stronger hardware:

<Screenshot
  alt="A chart showing high-cardinality ingestion performance of InfluxDB, TimescaleDB, and QuestDB"
  src="images/pages/index/min-hardware-comp-graph.webp"
  width={550}
  title="QuestDB on an RPi5 outperforming competitors on optimal hardware"
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


## Where to next? {#next-up}

You'll be inserting data and generating valuable queries in little time.

First, the [quick start](/docs/quick-start/) guide will get you running.

Choose from one of our premium ingest-only language clients:

<Clients />

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
- [Join our community forums](https://community.questdb.com/)
- [QuestDB on Stack Overflow](https://stackoverflow.com/questions/tagged/questdb)
- or email us at [hello@questdb.io](mailto:hello@questdb.io)