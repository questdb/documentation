---
id: questdb-internals
title: QuestDB Internals
slug: questdb-internals
description: A deep technical dive into the internal architecture, storage engine, query processing, and native integrations of QuestDB.
---

QuestDB offers high-speed ingestion and low-latency analytics on time-series data. 

This document explains QuestDB's internal architecture.

## Key components

QuestDB is comprised of several key components:

- **[Storage engine](#storage-engine):**
  The engine uses a column-oriented design to ensure high I/O performance and low latency.

- **[Memory management and native integration](#memory-management-and-native-integration):**
  The system leverages both memory mapping and explicit memory management techniques,
  and integrates native code for performance-critical tasks.

- **[Query processor](#query-engine):**
  A custom SQL parser, a just-in-time (JIT) compiler, and a vectorized execution engine process
  data in table page frames for better CPU use.

- **[Data ingestion engine](#data-ingestion--write-path):**
  The engine supports bulk and streaming ingestion. It writes data to a row-based write-ahead
  log (WAL) and then converts it into a columnar format. In QuestDB Enterprise, the WAL segments
  ship to object storage for replication.

- **[Networking layer](#ilp-protocol-support):**
  The system exposes RESTful APIs and implements ILP and PostgreSQL wire protocols so that
  existing tools and drivers work out-of-the-box. It also offers a health and metrics endpoint.

- **[Observability](#observability--diagnostics):**
  QuestDB provides real-time metrics, a health check endpoint, and logging to monitor
  performance and simplify troubleshooting.

- **Web console:**
  The engine includes a web console to run SQL statements, bulk load CSV files, and show
  monitoring dashboards. QuestDB Enterprise supports single sign-on (SSO) in the web console.

## Storage engine

### Column-oriented storage

- **Data layout:**
  The system stores each table as separate files per column. Fixed-size data types use one file
  per column, while variable-size data types (such as `VARCHAR` or `STRING`) use two files per column.

- **CPU optimization:**
  Columnar storage improves CPU use during vectorized operations, which speeds up
  aggregations and computations.

- **Compression:**
  Uniform data types allow efficient compression that reduces disk space and speeds up reads
  when ZFS compression is enabled.

## Memory management and native integration

### Memory-mapped files

- **Direct OS integration:**
  Memory-mapped files let QuestDB use the operating system's page cache. This reduces explicit
  I/O calls and speeds up sequential reads.

- **Sequential access:**
  When data partitions by incremental timestamp, memory mapping ensures that reads are
  sequential and efficient.

### Direct memory management and native integration

- **Off-heap memory usage:**
  QuestDB allocates direct memory via memory mapping and low-level APIs (such as Unsafe) to
  bypass the JVM garbage collector. This reduces latency spikes and garbage collection delays.

- **Hotpath efficiency:**
  The system pre-allocates and reuses memory in critical code paths, avoiding dynamic allocation
  on the hotpath.

- **Native code integration:**
  QuestDB uses native libraries written in C++ and Rust for performance-critical tasks. These
  native components share off-heap buffers with Java via JNI.
  - **Zero-copy interoperability:**
    Sharing memory between Java and native code minimizes data copying and reduces latency.
  - **Hybrid architecture:**
    This integration lets QuestDB use Java for rapid development and C++/Rust for low-level,
    high-performance routines.

## Query engine

### SQL parsing & optimization

- **Custom SQL parser:**
  The parser supports QuestDB's SQL dialect and time-series extensions. It converts SQL queries
  into an optimized abstract syntax tree (AST).

- **Compilation pipeline:**
  The engine compiles SQL into an execution plan through stages that push down predicates and
  rewrite queries to remove unnecessary operations.

- **Optimization techniques:**
  The planner applies rule-based rewrites and simple cost estimations to choose efficient
  execution paths.

### Execution model

- **Vectorized processing:**
  The engine applies the same operation to many data elements simultaneously. This maximizes CPU
  cache use and reduces overhead.

- **JIT compilation:**
  Many queries compile critical parts of the execution plan to native machine code just in time.

- **Query plan caching:**
  The system caches query plans for reuse within the same connection. (Query results are not
  cached.)

- **Column data caching:**
  Data pages read from disk are kept in system memory. Sufficient memory prevents frequent disk
  reads.

- **Operator pipeline:**
  The execution plan runs as a series of operators (filters, joins, aggregators) in a tightly
  integrated pipeline.

- **Parallel execution:**
  The engine distributes workloads across multiple threads. Most operations run in parallel,
  though some, such as index searches, run single-threaded.

## Time-series optimizations

### Designated timestamp

- **Timestamp sorting:**
  Data stores in order of incremental timestamp. Since ingestion is usually
  chronological, the system often uses a fast append-only strategy.

- **Out-of-order data:**
  When data arrives out of order, QuestDB rearranges it to maintain timestamp order. The
  engine splits partitions to minimize write amplification and compacts them in the background.

- **Rapid range queries:**
  Sorted data lets the system quickly locate the start and end of data files, which speeds
  up range queries.

### Data partitioning and sequential reads

- **Partitioning by time:**
  Data partitions by timestamp with hourly, daily, weekly, monthly, or yearly resolution.

- **Partition pruning:**
  The design lets the engine skip partitions that fall outside query filters. Combined with
  incremental timestamp sorting, this reduces latency.

- **Enhanced compression:**
  Chronologically sorted data compresses better when ZFS compression is enabled, which
  further improves disk I/O.

- **Lifecycle policies:**
  The system can delete partitions manually or automatically via TTL. It also supports
  detaching or attaching partitions using SQL commands.

### In-memory processing

- **Caching:**
  The engine caches recent and frequently accessed data in memory, reducing disk reads.

- **Off-heap buffers:**
  Off-heap memory, managed via memory mapping and direct allocation, avoids garbage
  collection overhead.

- **Optimized algorithms:**
  Core query operators work on data vectors and use CPU-level optimizations such as SIMD.

## Data ingestion & write path

### Bulk ingestion

- **CSV ingestion:**
  QuestDB offers a CSV ingestion endpoint via the REST API and web console. A specialized COPY
  command uses io_uring on fast drives to speed up ingestion.

### Real-time streaming

- **High-frequency writes:**
  The streaming ingestion path handles millions of rows per second with non-blocking I/O.

- **Durability:**
  The system writes data to a row-based write-ahead log (WAL) and then converts it into column-
  based files for efficient reads.

- **Concurrent writes:**
  Multiple connections writing to the same table create parallel WAL files that the engine
  later consolidates into columnar storage.

### ILP protocol support

- **Native ILP integration:**
  QuestDB supports the Influx Line Protocol (ILP) for high-speed data ingestion.

- **Minimal parsing overhead:**
  The ILP parser quickly maps incoming data to internal structures.

- **Parallel ingestion:**
  The ILP path uses off-heap buffers and direct memory management to bypass JVM heap
  allocation.

- **Protocol versatility:**
  In addition to ILP, QuestDB supports REST and PostgreSQL wire protocols.

## Observability & diagnostics

- **Metrics:**
  QuestDB exposes detailed metrics in Prometheus format, including query statistics, memory
  usage, and I/O details.

- **Health check:**
  A minimal HTTP server monitors system health.

- **Metadata tables:**
  The engine provides metadata tables to query table status, partition status, query execution,
  and latency.

- **Extensive logging:**
  Logging covers SQL parsing, execution, background processing, and runtime exceptions. The
  framework minimizes performance impact.

- **Real-time metric dashboards:**
  The web console lets you create dashboards that display per-table metrics.

## Design patterns & best practices

- **Immutable data structures:**
  The system favors immutability to avoid concurrency issues and simplify state
  management.

- **Modular architecture:**
  Each component (storage, query processing, ingestion, etc.) has well-defined interfaces
  that enhance maintainability.

- **Factory & builder patterns:**
  The engine uses these patterns to centralize construction logic for complex objects like SQL
  execution plans and storage buffers.

- **Lazy initialization:**
  Resource-intensive components initialize only when needed to reduce startup overhead.

- **Rigorous testing & benchmarks:**
  Unit tests, integration tests, and performance benchmarks ensure that new enhancements do
  not compromise reliability or speed.

## Security

- **Built-in admin and read-only users:**
  QuestDB includes built-in admin and read-only users for the pgwire protocol and HTTP
  endpoints using HTTP Basic Auth.

- **HTTP basic authentication:**
  You can enable HTTP Basic Authentication for the HTTP API, web console, and pgwire
  protocol. Health-check and metrics endpoints can be configured independently.

- **Token-based authentication:**
  QuestDB Enterprise offers HTTP and JWT token authentication. QuestDB Open Source
  supports token authentication for ILP over TCP.

- **TLS on all protocols:**
  QuestDB Enterprise supports TLS on all protocols and endpoints.

- **Role-based access control:**
  Enterprise users can create user groups and assign service accounts and users. Grants can be
  configured individually or at the group level with fine granularity, including column-level
  access.

- **Single sign-on:**
  QuestDB Enterprise supports SSO via OIDC with Active Directory, EntraID, or OAuth2.

## Further reading & resources

- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
