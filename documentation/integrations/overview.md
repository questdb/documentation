---
title: Third-Party Tools Overview
sidebar_label: Overview
slug: overview
description:
  QuestDB integrates well with a number of third-party tools. This page lists
  some of the most popular integrations.
---

QuestDB integrates well with a range of third-party tools, offering
compatibility with systems for visualization, data ingestion, analytics, and
more.

## Visualization Tools

Interact with and visualize your QuestDB data using these powerful visualization
platforms:

- **[Grafana](/docs/integrations/visualization/grafana/):** Create stunning dashboards
  and interactive graphs for [time-series data](/blog/what-is-time-series-data/) visualization.
- [qStudio](/docs/integrations/visualization/qstudio/): A free SQL GUI for query
  execution, table browsing, and result charting.
- [Superset](/docs/integrations/visualization/superset/): Build interactive
  visualizations and perform ad-hoc data analysis.
- **[PowerBI](/docs/integrations/visualization/powerbi/):** Create interactive data visualizations and dashboards.
- [Embeddable](/docs/integrations/visualization/embeddable/): A developer toolkit
  for building customer-facing analytics directly into your app.

## Data Ingestion and Streaming

Ingest, store, and process high-throughput and real-time data streams with these
integrations:

- **[Apache Kafka](/docs/connect/message-brokers/kafka):** A distributed
  event streaming platform for high-throughput data pipelines.
- [Telegraf](/docs/connect/message-brokers/telegraf/): Collect and report metrics from
  various sources.
- **[Redpanda](/docs/connect/message-brokers/redpanda/):** A Kafka-compatible streaming
  platform for simplified data pipelines.
- [Apache Flink](/docs/connect/message-brokers/flink/): Process real-time data streams
  efficiently.

## Analytics and Processing

Enhance your data analysis and processing capabilities with QuestDB through
these tools:

- [Pandas](/docs/integrations/data-processing/pandas/): Analyze [time-series data](/blog/what-is-time-series-data/) in Python
  with powerful data structures.
- [Polars](/docs/integrations/data-processing/polars/): Process large datasets
  efficiently with a fast DataFrame library implemented in Rust and Python.
- [Apache Spark](/docs/integrations/data-processing/spark/): Handle complex data processing
  tasks at scale.

## Workflow Orchestrators

Automate your data pipelines with these workflow orchestrators:

- [Apache Airflow](/docs/integrations/orchestration/airflow/): A workflow automation tool for
  scheduling and monitoring tasks through directed acyclic graphs (DAGs).
- [Dagster](/docs/integrations/orchestration/dagster/): A modern workflow orchestrator for
  data pipelines.

## Other Tools

Improve your interactions with QuestDB using these tools and interfaces:

- **[Prometheus](/docs/integrations/other/prometheus/):** Efficiently store and
  analyze monitoring metrics.
- [SQLAlchemy](/docs/integrations/other/sqlalchemy/): Utilize Python's ORM
  capabilities for database interactions.
- [Drizzle ORM](/docs/integrations/other/drizzle/): Query QuestDB from
  TypeScript with a type-safe ORM over the PostgreSQL wire protocol.
- [MindsDB](/docs/integrations/other/mindsdb/): Build machine learning models for
  predictive analytics on [time-series data](/blog/what-is-time-series-data/).
- [Databento](/docs/integrations/other/databento/): Ingest a normalized live
  market data feed covering multiple venues.
- [Cube](/docs/integrations/other/cube/): Middleware connecting your data sources
  to your data applications.
- [Ignition](/docs/integrations/other/ignition/): A software suite for industrial
  automation, including SCADA and IIoT integrations.
- [Airbyte](/docs/integrations/other/airbyte/): Sync data from a wide range of
  sources into QuestDB with an open-source ETL platform.

Is there an integration you'd like to see that's not listed? Let us know by
opening an issue on [QuestDB Github](https://github.com/questdb/questdb/issues/new/choose).
