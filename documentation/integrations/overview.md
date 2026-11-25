---
title: Third-Party Tools Overview
sidebar_label: Overview
slug: overview
description:
  QuestDB integrates well with a number of third-party tools. This page lists
  some of the most popular integrations.
---

import { IntegrationGrid, IntegrationCard } from "../../src/components/Integrations"

QuestDB integrates well with a range of third-party tools, offering
compatibility with systems for visualization, data ingestion, analytics, and
more.

For QuestDB's own client libraries for Java, Python, Go, Rust, Node.js, C and
C++, .NET, Ruby, and web browsers, see
[Client libraries](/docs/connect/overview/#client-libraries).

## Visualization Tools

:::tip Visualize in the Web Console

To chart data without a third-party tool, use
[notebooks](/docs/getting-started/web-console/notebooks/overview/) in the QuestDB
Web Console. They combine SQL queries, notes, and live charts in one tab.

:::

Interact with and visualize your QuestDB data using these powerful visualization
platforms:

<IntegrationGrid>
  <IntegrationCard name="Grafana" href="/docs/integrations/visualization/grafana/" logo="/images/logos/grafana.svg">
    Create stunning dashboards and interactive graphs for [time-series data](/blog/what-is-time-series-data/) visualization.
  </IntegrationCard>
  <IntegrationCard name="qStudio" href="/docs/integrations/visualization/qstudio/" logo="/images/logos/qstudio.webp">
    A free SQL GUI for query execution, table browsing, and result charting.
  </IntegrationCard>
  <IntegrationCard name="Superset" href="/docs/integrations/visualization/superset/" logo="/images/logos/apache-superset-icon.svg">
    Build interactive visualizations and perform ad-hoc data analysis.
  </IntegrationCard>
  <IntegrationCard name="PowerBI" href="/docs/integrations/visualization/powerbi/" logo="/images/logos/power-bi.svg">
    Create interactive data visualizations and dashboards.
  </IntegrationCard>
  <IntegrationCard name="Embeddable" href="/docs/integrations/visualization/embeddable/" logo="/images/logos/embeddable-dark.svg">
    A developer toolkit for building customer-facing analytics directly into your app.
  </IntegrationCard>
</IntegrationGrid>

## Data Ingestion and Streaming

Ingest, store, and process high-throughput and real-time data streams with these
integrations:

<IntegrationGrid>
  <IntegrationCard name="Apache Kafka" href="/docs/connect/message-brokers/kafka/" logo="/images/logos/apache-kafka-dark.webp">
    A distributed event streaming platform for high-throughput data pipelines.
  </IntegrationCard>
  <IntegrationCard name="Telegraf" href="/docs/connect/message-brokers/telegraf/">
    Collect and report metrics from various sources.
  </IntegrationCard>
  <IntegrationCard name="Redpanda" href="/docs/connect/message-brokers/redpanda/" logo="/images/logos/redpanda-icon.svg">
    A Kafka-compatible streaming platform for simplified data pipelines.
  </IntegrationCard>
  <IntegrationCard name="Apache Flink" href="/docs/connect/message-brokers/flink/" logo="/images/logos/flink.svg">
    Process real-time data streams efficiently.
  </IntegrationCard>
  <IntegrationCard name="Databento connector" href="/docs/connect/connectors/databento/" logo="/images/logos/databento-icon.svg">
    Stream Live market data and run Historical backfills with QuestDB Enterprise. On QuestDB Open Source, see [Databento with Python](/docs/integrations/other/databento/).
  </IntegrationCard>
  <IntegrationCard name="dbt™ connector" href="/docs/connect/connectors/dbt/" logo="/images/logos/dbt.webp">
    Build, test, and document SQL models in QuestDB Enterprise with dbt Core, including views, tables, incremental models, and materialized views.
  </IntegrationCard>
</IntegrationGrid>

## Analytics and Processing

Enhance your data analysis and processing capabilities with QuestDB through
these tools:

<IntegrationGrid>
  <IntegrationCard name="Pandas" href="/docs/integrations/data-processing/pandas/" logo="/images/logos/pandas-mark-dark.svg">
    Analyze [time-series data](/blog/what-is-time-series-data/) in Python with powerful data structures.
  </IntegrationCard>
  <IntegrationCard name="Polars" href="/docs/integrations/data-processing/polars/" logo="/images/logos/polars-dark.svg">
    Process large datasets efficiently with a fast DataFrame library implemented in Rust and Python.
  </IntegrationCard>
  <IntegrationCard name="Apache Spark" href="/docs/integrations/data-processing/spark/" logo="/images/logos/apache-spark-icon.svg">
    Handle complex data processing tasks at scale.
  </IntegrationCard>
</IntegrationGrid>

## Workflow Orchestrators

Automate your data pipelines with these workflow orchestrators:

<IntegrationGrid>
  <IntegrationCard name="Apache Airflow" href="/docs/integrations/orchestration/airflow/" logo="/images/logos/apache-airflow-dark.svg">
    A workflow automation tool for scheduling and monitoring tasks through directed acyclic graphs (DAGs).
  </IntegrationCard>
  <IntegrationCard name="Dagster" href="/docs/integrations/orchestration/dagster/" logo="/images/logos/dagster.svg">
    A modern workflow orchestrator for data pipelines.
  </IntegrationCard>
</IntegrationGrid>

## Other Tools

Improve your interactions with QuestDB using these tools and interfaces:

<IntegrationGrid>
  <IntegrationCard name="Prometheus" href="/docs/integrations/other/prometheus/" logo="/images/logos/prometheus.svg">
    Efficiently store and analyze monitoring metrics.
  </IntegrationCard>
  <IntegrationCard name="SQLAlchemy" href="/docs/integrations/other/sqlalchemy/" logo="/images/logos/sqlalchemy.webp">
    Utilize Python's ORM capabilities for database interactions.
  </IntegrationCard>
  <IntegrationCard name="MindsDB" href="/docs/integrations/other/mindsdb/" logo="/images/logos/mindsdb.svg">
    Build machine learning models for predictive analytics on [time-series data](/blog/what-is-time-series-data/).
  </IntegrationCard>
  <IntegrationCard name="Cube" href="/docs/integrations/other/cube/" logo="/images/logos/cube-icon-dark.svg">
    Middleware connecting your data sources to your data applications.
  </IntegrationCard>
  <IntegrationCard name="Ignition" href="/docs/integrations/other/ignition/" logo="/images/logos/ignition.svg">
    A software suite for industrial automation, including SCADA and IIoT integrations.
  </IntegrationCard>
  <IntegrationCard name="Airbyte" href="/docs/integrations/other/airbyte/" logo="/images/logos/airbyte.svg">
    Sync data from a wide range of sources into QuestDB with an open-source ETL platform.
  </IntegrationCard>
  <IntegrationCard name="Databento with Python" href="/docs/integrations/other/databento/" logo="/images/logos/databento-icon.svg">
    Ingest market data into QuestDB Open Source using the Python clients. On QuestDB Enterprise, see the [Databento connector](/docs/connect/connectors/databento/).
  </IntegrationCard>
  <IntegrationCard name="adbcBridge" href="/docs/integrations/other/adbcbridge/" logo="/images/logos/adbcbridge.webp">
    Read QuestDB into Apache Arrow through ADBC, natively over QWP on QuestDB 10 or through the PostgreSQL ODBC driver on older servers.
  </IntegrationCard>
</IntegrationGrid>

Is there an integration you'd like to see that's not listed? Let us know by
opening an issue on [QuestDB Github](https://github.com/questdb/questdb/issues/new/choose).

:::note Notice

Third-party logos and trademarks belong to their respective owners and are
shown only to indicate available integrations. No endorsement or affiliation is
implied. dbt and the dbt logo are trademarks of dbt Labs, LLC. QuestDB is not
affiliated with dbt Labs.

:::
