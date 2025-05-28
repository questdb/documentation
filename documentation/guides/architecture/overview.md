---
title: Architecture Overview
slug: questdb-architecture
description: A deep technical dive into the internal architecture, storage engine, query processing, and native integrations of QuestDB.
---

QuestDB offers high-speed ingestion and low-latency analytics on time-series data.


<Screenshot
  alt="QuestDB: High-Speed Ingestion, Low Latency analytics"
  title="QuestDB: High-Speed Ingestion, Low Latency analytics"
  src="images/guides/questdb-internals/questdb-high-level-architecture.svg"
  width={1000}
/>

This document explains QuestDB's internal architecture.

## Key components

QuestDB is comprised of several key components:

- **[Storage engine](/docs/guides/architecture/storage-engine):**
  The engine uses a column-oriented design to ensure high I/O performance and low latency.

- **[Memory management and native integration](/docs/guides/architecture/memory-management):**
  The system leverages both memory mapping and explicit memory management techniques,
  and integrates native code for performance-critical tasks.

- **[Query engine](/docs/guides/architecture/query-engine):**
  A custom SQL parser, a just-in-time (JIT) compiler, and a vectorized execution engine process
  data in table page frames for better CPU use.

- **[Time-series Optimizations](/docs/guides/architecture/time-series-optimizations):**
  QuestDB is specifically designed for time-series, and it provides several optimizations, like a
  designated timestamp, sequential reads, materialized-views, or in-memory processing.

- **[Data ingestion engine](/docs/guides/architecture/data-ingestion):**
  The engine supports bulk and streaming ingestion. It writes data to a row-based write-ahead
  log (WAL) and then converts it into a columnar format. In QuestDB Enterprise, the WAL segments
  ship to object storage for replication.

- **[Networking layer](/docs/guides/architecture/networking-layer):**
  The system exposes RESTful APIs and implements ILP and PostgreSQL wire protocols so that
  existing tools and drivers work out-of-the-box. It also offers a health and metrics endpoint.

- **[Replication layer](/docs/guides/architecture/replication-layer):**
  QuestDB Enterprise supports horizontal scalability for reads with read replicas, and for
  writes with multi-primary.

- **[Security](/docs/guides/architecture/security):**
  QuestDB implements enterprise-grade security with TLS, single-sign-on, and role-based access control with
  fine-grained granularity.

- **[Observability](/docs/guides/architecture/observability):**
  QuestDB provides real-time metrics, a health check endpoint, and logging to monitor
  performance and simplify troubleshooting.

- **[Web console](/docs/guides/architecture/web-console):**
  The engine includes a web console to run SQL statements, bulk load CSV files, and show
  monitoring dashboards. QuestDB Enterprise supports single sign-on (SSO) in the web console.




## Design patterns & best practices throughout the code base

- **Immutable data structures:**
  The system favors immutability to avoid concurrency issues and simplify state
  management.

- **Modular architecture:**
  Each component (storage, query processing, ingestion, etc.) has well-defined interfaces that enhance maintainability.

- **Factory & builder patterns:**
  The engine uses these patterns to centralize construction logic for complex objects like SQL  execution plans and storage buffers.

- **Lazy initialization:**
  Resource-intensive components initialize only when needed to reduce startup overhead.

- **Rigorous testing & benchmarks:**
  [Unit tests, integration tests](https://github.com/questdb/questdb/tree/master/core/src/test),
  and performance benchmarks ensure that new enhancements do  not compromise
  reliability or speed.

## Further reading & resources

- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
