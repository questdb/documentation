---
title: Why QuestDB?
slug: why-questdb
description:
  Learn when to use QuestDB, what makes it fast, and whether it's right for your use case.
---

import { Clients } from '../src/components/Clients'
import Screenshot from "@theme/Screenshot"

QuestDB is an open source time-series database with a multi-tier storage engine for scale and low-latency analytics for the most demanding time-series workloads. It is built on open formats such as Parquet to avoid vendor lock-in.

> **Ready to try it? Jump to the [quick start](/docs/quick-start/).**

## When to use QuestDB

QuestDB is designed for workloads that require:

- **Continuous ingestion of time-stamped data** — financial tick data, sensor readings, events
- **Fast time-based queries** — dashboards, real-time analytics, downsampling, high QPS
- **Efficient petabyte-scale storage** — [multi-tier architecture](/docs/guides/architecture/questdb-architecture/) with long-term storage in Parquet files
- **SQL, not a new query language** — standard SQL with time-series extensions
- **Hardware efficiency** — get more from less infrastructure
- **Capital markets capabilities** — [N-dimensional arrays](/docs/concept/array/), [order book analytics](/docs/guides/order-book/), [OHLC charts](https://questdb.com/blog/kline-candlestick-charts-with-grafana-and-questdb/), advanced post-trade analysis, ultra-low latency architecture, and a [strong customer base](https://questdb.com/customers/) in financial services

### Common use cases

| Domain | Examples |
|--------|----------|
| **Capital markets** | Market data, tick-by-tick analysis, pre and post trade analytics |
| **Banking** | Retail banking analytics, fraud detection, transaction monitoring |
| **Aerospace** | Flight telemetry, satellite monitoring, rocket engine simulations |
| **Energy** | Grid monitoring, anomaly detection, power generation forecasting |

## What makes QuestDB fast

### Ingestion performance

QuestDB ingests millions of rows per second on commodity hardware.

<Screenshot
  alt="A chart showing high-cardinality ingestion performance of InfluxDB, TimescaleDB, and QuestDB"
  src="images/benchmark/benchmark_all_q1_2024.webp"
  width={650}
  title="Results for QuestDB 9.1.0, Timescale 2.22.1, InfluxDB 2.7.12, and Clickhouse 25.10.1.1486"
/>

On a Raspberry Pi 5, QuestDB ingests [~270,000 rows per second](https://questdb.com/blog/raspberry-pi-5-benchmark/).

### Built-in handling for real-world data

Time-series data is messy. QuestDB handles it automatically:

- **Out-of-order data** — late-arriving records are merged efficiently
- **Deduplication** — duplicates are detected and handled at ingestion
- **High cardinality** — millions of unique series without performance degradation

### SQL with time-series extensions

No proprietary query language. Use SQL you already know, extended for time-series:

```questdb-sql title='OHLC aggregation with SAMPLE BY' demo
SELECT
    timestamp, symbol,
    first(price) AS open,
    last(price) AS close,
    min(price),
    max(price),
    sum(amount) AS volume
FROM trades
WHERE timestamp > dateadd('d', -1, now())
SAMPLE BY 15m;
```

Key extensions:

- [`SAMPLE BY`](/docs/reference/sql/sample-by/) — aggregate by time buckets (1 minute, 1 hour, 1 day, etc.)
- [`LATEST ON`](/docs/reference/sql/latest-on/) — get the most recent value per series
- [`ASOF JOIN`](/docs/reference/sql/asof-join/) — join time-series by closest timestamp
- [Materialized Views](/docs/concept/mat-views/) — pre-compute aggregations automatically

## When QuestDB might not be the right fit

QuestDB is optimized for time-series. Consider alternatives if:

- **You need general-purpose OLTP** — frequent updates, deletes, complex transactions → PostgreSQL
- **Your data isn't time-series** — no timestamp column, no time-based queries → traditional RDBMS
- **You need full-text search** — log text searching → Elasticsearch or Loki

## Get started

The [quick start](/docs/quick-start/) gets you running in minutes.

Choose a client library to start ingesting:

<Clients />

Or explore more:

- [Ingestion overview](/docs/ingestion-overview/) — all ingestion options
- [Query & SQL overview](/docs/reference/sql/overview/) — SQL reference
- [Web Console](/docs/web-console/) — built-in SQL editor and charting
- [Grafana integration](/docs/third-party-tools/grafana/) — dashboards and visualization
- [Capacity planning](/docs/operations/capacity-planning/) — production deployment

## Support

We're happy to help:

- [GitHub Issues](https://github.com/questdb/questdb/issues/new/choose) — bug reports and feature requests
- [Community Forum](https://community.questdb.com/) — questions and discussion
- [Stack Overflow](https://stackoverflow.com/questions/tagged/questdb) — tagged questions
- [hello@questdb.io](mailto:hello@questdb.io) — direct contact
