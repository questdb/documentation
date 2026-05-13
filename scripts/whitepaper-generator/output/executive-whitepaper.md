---
title: "QuestDB: The Fastest Time-Series Database"
subtitle: "Executive Overview"
date: 2026-05-13
version: "1.0"
---

## Executive summary

QuestDB is an open source time-series database engineered for low latency. Built from scratch with a zero-GC Java core, column-oriented storage, and vectorized (SIMD) execution, it delivers high-throughput ingestion and millisecond-level analytical queries over billions of rows. SQL is the primary interface, extended with time-series operators that eliminate the need for complex workarounds common in general-purpose databases.

QuestDB is used in production by stock exchanges, investment banks, aerospace manufacturers, energy trading firms, and retail banks. Organizations choose it when they need to ingest millions of rows per second, answer queries in under 10 milliseconds, and do so using standard SQL and open data formats like Parquet and Arrow.

QuestDB is available as open source software, as a self-managed Enterprise edition with security, high availability, and tiered storage, and as a fully managed Bring Your Own Cloud (BYOC) deployment on AWS or Azure.

## The time-series data challenge

Time-series workloads differ fundamentally from transactional or analytical workloads. Data arrives continuously at high velocity, must be stored in time order, and is queried across time ranges that can span seconds to years. General-purpose databases struggle with this combination: row-oriented storage wastes I/O on columns that are never read, index-based access patterns break down at sustained write rates, and time-range scans become prohibitively slow as data grows.

The result is a trade-off that organizations have accepted for too long: either sacrifice query speed for write throughput, lock into proprietary query languages, or fragment data across multiple systems. QuestDB eliminates these trade-offs with an architecture purpose-built for time-series data at scale.

## QuestDB at a glance

**Ingestion performance.** QuestDB ingests data at up to 8 million rows per second, 4x faster than leading competitors in benchmark tests. Multi-writer support and native InfluxDB Line Protocol compatibility mean existing pipelines integrate without changes.

**Query speed.** A custom query engine with vectorized execution delivers sub-millisecond latency over billions of rows. Memory-mapped architecture eliminates I/O bottlenecks, so queries run at CPU speed rather than storage speed.

**Standard SQL.** QuestDB uses standard SQL, extended with time-series operators: SAMPLE BY for time-bucketed aggregation, LATEST ON for last-known-value queries, ASOF JOIN for point-in-time matching, HORIZON JOIN for post-trade analysis, and streaming materialized views for pre-computed rollups.

**Open formats.** Data is stored in QuestDB's native columnar format on local storage and in Parquet on object storage. Both tiers are queryable through a single SQL query. Parquet and Arrow compatibility means dataframe libraries (Polars, Pandas, Spark), AI frameworks, and ML pipelines connect natively. No vendor lock-in.

**Multi-tier storage.** Hot data lives on local storage for maximum performance. Cold data tiers automatically to object storage (S3, Azure Blob, GCS) in Parquet format, without manual intervention. One SQL engine queries across both tiers transparently.

## Use cases

### Capital markets

QuestDB powers next-generation tick-data platforms for pre- and post-trade analytics. It handles ultra-low-latency ingestion of tick and trade data, enables trade-level TCA and markout analysis using HORIZON JOIN, and provides native order-book analytics with 2D array support. Quants use QuestDB as an open data lake for backtesting with DataFrames on Parquet/Arrow, while trading desks monitor intraday P&L, market signals, VWAP, and TWAP in real time.

Customers in this space include B3 (Latin America's largest stock exchange), One Trading (the first MiFID II exchange for digital assets), BTG Pactual (Latin America's largest investment bank), Aquis Exchange, Beeks Group, GTS Securities, Susquehanna, and Anti Capital.

### Crypto

Cloud-native crypto data platforms use QuestDB for continuous, low-latency multi-exchange ingestion at terabytes per day. Teams measure P&L and reaction latency by venue and strategy, backtest with open source dataframes via Parquet/Arrow, run mark-to-market for market makers, and perform native SQL order-book analytics. Customers include OKX, Laser Digital (Nomura Group), and XRP Ledger, which reduced total cost of ownership by more than 90% after migrating to QuestDB.

### Aerospace

QuestDB ingests high-rate telemetry from aircraft, rockets, engines, and satellites. It handles high-cardinality sensor streams, evolving schemas, and out-of-order data arrival. Multi-tier storage retains petabytes of flight-test data on-premises or in cloud object storage. ASOF JOINs correlate sensor streams for root-cause and anomaly analysis. Airbus processes billions of data points daily with QuestDB for real-time monitoring and predictive maintenance.

### Retail banking

HDFC Bank, one of India's largest banks, uses QuestDB for real-time transaction monitoring and fraud detection at national scale. A single QuestDB instance sustains more than 5,000 queries per second. The primary-replica setup with object-storage-based replication delivers resilience and fault tolerance. QuestDB's SQL interface enables engineering, risk, and fraud teams to collaborate on the same platform.

### Energy

QuestDB serves as a unified time-series platform for both industrial sensor data and energy trading market data. It replaces legacy historians with SQL-first simplicity, integrates with SCADA, Telegraf, MQTT, and Postgres tooling, and powers backend storage for Inductive Automation's Ignition platform. Copenhagen Atomics uses QuestDB for real-time thorium reactor monitoring. Energetech processes massive volumes of market and fundamental data for 24/7 power and gas trading.

### Telecommunications

Airtel XStream Play uses QuestDB to track engagement and device metrics for their video media streaming service, processing billions of daily records. After switching from Elasticsearch, they achieved smooth ingestion with lower latency.

## AI and agentic workflows

The application layer is fragmenting into agents. The data layer is consolidating into open formats. QuestDB bridges both: a single time-series engine connecting agents, apps, and systems to real-time and historical data.

QuestDB speaks the protocols that every LLM and model framework already knows: SQL, PGwire, REST, Parquet, Iceberg, and Arrow. No adapters, wrappers, or translation layers are needed. Agents query and write to the same time-series backbone, with timestamp-ordered, lock-free architecture that handles concurrent agent workloads by design.

Every agent query is SQL. Every result is deterministic. There is no black-box reasoning: just timestamps, tables, and traceable logic. When compliance asks how an agent reached its conclusion, the answer is the query itself.

The QuestDB agent skill for Claude Code and OpenAI Codex embeds SQL syntax, ingestion patterns, Grafana templates, and financial indicator recipes directly into the agent's context. Agents discover the schema, write optimized SQL, and return answers in milliseconds.

## Enterprise features

QuestDB Enterprise builds on top of the open source core with capabilities required for production deployments in regulated environments.

**High availability.** Automatic replication and failover with sub-second read replicas across regions via object storage (S3, Azure, GCS, NFS, HDFS). Multi-primary writes for continuous availability are on the roadmap.

**Security.** TLS encryption for all network interfaces, Role-Based Access Control (RBAC) with users, groups, and fine-grained permissions down to column level, Single Sign-On via OpenID Connect (OAuth 2.0/OIDC), audit logs, and secure service accounts for inter-machine communication.

**Tiered storage.** Automated partition lifecycle management: hot data on local storage tiers automatically to cold storage in Parquet format on object storage. One SQL engine queries across both tiers. Storage policies automate the convert-then-drop lifecycle on a configurable schedule.

**Expert support.** SLA-backed support from QuestDB's creators, including architecture and performance reviews.

## Deployment options

### Open source

QuestDB Open Source is available on Linux, macOS, Windows, Docker, and Kubernetes. It provides the full storage engine, query engine, ingestion pipeline, and SQL interface. The project is actively maintained on GitHub.

### Enterprise (self-managed)

QuestDB Enterprise is a binary-compatible upgrade from Open Source. The upgrade process is straightforward: download the Enterprise binaries, swap them in, and restart. Existing data works immediately. Enterprise adds TLS, RBAC, SSO, replication, storage policies, and automated backup and recovery.

### BYOC (Bring Your Own Cloud)

QuestDB BYOC deploys in the customer's own AWS or Azure account. All data resides in the customer's account, in their chosen region, meeting data localization requirements for GDPR, FINRA, or internal compliance policies.

QuestDB's SRE team handles provisioning, upgrades, performance tuning, and monitoring around the clock. The deployment integrates with the customer's existing security tooling, including SIEM, monitoring, and audit systems. Private networking ensures data never traverses public networks.

The onboarding process takes four steps: grant access via a CloudFormation or ARM template, QuestDB provisions the infrastructure, connect existing network infrastructure, and start ingesting data. Existing cloud credits, reserved instances, and savings plans apply directly to QuestDB infrastructure. No Kubernetes is required.

AWS and Azure are supported today. GCP support is coming soon.

## Customer proof points

**B3 Exchange** (Capital Markets). Latin America's largest stock exchange uses QuestDB Enterprise to power its Central Securities Depository platform, processing millions of trades daily with 99.9% uptime.

> "Our CSD platform demands exceptional performance, security, and resilience for real-time data. We chose QuestDB for its speed and straightforward deployment, which fits cleanly into our cloud-native architecture."
> -- Kleber Almeida, Manager, Exchange Technology, B3

**One Trading** (Digital Assets). The first MiFID II exchange for digital assets ingests market data bursts at up to 8 million rows per second, powering both customer-facing features and internal systems for billions of trade records.

> "QuestDB is an essential part of our trading platform, giving us a high-speed, scalable store for billions of trades that we can query in real time to power both customer-facing features and internal systems."
> -- Steven Harper, Chief Security Officer, One Trading

**BTG Pactual** (Capital Markets). Latin America's largest investment bank uses QuestDB to deliver low-latency market data APIs for equities and derivatives trading, with millisecond response times for real-time intraday data.

> "QuestDB has become the standard for data aggregation. QuestDB has proven itself to be lightning fast, fast enough to help us when providing raw live intraday trading data through our set of APIs within a few milliseconds."
> -- Renan Avila, Director, BTG Pactual

**HDFC Bank** (Retail Banking). One of India's largest banks sustains 5,000+ queries per second from a single instance for real-time transaction monitoring and fraud detection at national scale.

> "QuestDB's SQL interface makes it straightforward for engineering, risk, and fraud teams to collaborate on the same platform, using familiar tools while operating at national-scale volumes and strict latency requirements."
> -- HDFC Bank

**Airbus** (Aerospace). Processes billions of data points daily for real-time monitoring and predictive maintenance of mission-critical components.

> "QuestDB is used at Airbus for real-time applications involving billions of data points per day. For us, QuestDB is an outstanding solution that meets and exceeds our performance requirements."
> -- Oliver Pfeiffer, Software Architect, Airbus

## Getting started

**Try it now.** The live demo instance at demo.questdb.com holds more than 2 billion rows of sample data. Run example queries in milliseconds from a browser, with no installation or signup required.

**Install QuestDB Open Source.** QuestDB is available on Linux, macOS, Windows, Docker, and Kubernetes. Download and start a local instance in minutes for full-scale testing and proof of concept with your own data. Client libraries for Python, Go, Java, Rust, C/C++, and .NET make it straightforward to build ingestion pipelines and integrate with existing applications.

**Evaluate Enterprise.** Contact the QuestDB team at [questdb.com/enterprise/contact](https://questdb.com/enterprise/contact/) to schedule an architecture review, guided deployment, and access to Enterprise features including high availability, RBAC, TLS, and tiered storage.

![](qr-enterprise-contact.png){width=2.5cm}\
*Scan to get in touch*
