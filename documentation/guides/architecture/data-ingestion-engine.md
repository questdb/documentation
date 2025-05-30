---
title: Data Ingestion Engine
slug: data-ingestion
description: The QuestDB Data Ingestion Engine supports bulk and streaming ingestion. It writes data to a row-based write-ahead log (WAL) and then converts it into a columnar format. In QuestDB Enterprise, the WAL segments ship to object storage for replication.
---


## Data ingestion & write path

The QuestDB Data Ingestion Engine supports bulk and streaming ingestion. It writes data to a row-based write-ahead log
(WAL) and then converts it into a columnar format. In QuestDB Enterprise, the WAL segments ship to object storage for replication.

### Bulk ingestion

- **CSV ingestion:**
  QuestDB offers a CSV ingestion endpoint via the [REST API](/docs/reference/api/rest/) and web console.
   A specialized COPY command uses [io_uring](/blog/2022/09/12/importing-300k-rows-with-io-uring) on
   fast drives to speed up ingestion.

### Real-time streaming

- **High-frequency writes:**
  The streaming ingestion path handles millions of rows per second with non-blocking I/O.

- **Durability:**
  As seen above, the system writes data to a row-based write-ahead log (WAL) and then converts it
  into column-based files for efficient reads. At the expense of performance, `sync` mode can be
  enabled on commit for extra durability.

- **Concurrent writes:**
  Multiple connections writing to the same table create parallel WAL files that the engine
  later consolidates into columnar storage.

```text

Contents of the `db` folder, showing multiple pending WAL files,
and the binary columnar data.

├── db
│   ├── Table
│   │   │
│   │   ├── Partition 1
│   │   │   ├── _archive
│   │   │   ├── column1.d
│   │   │   ├── column2.d
│   │   │   ├── column2.k
│   │   │   └── ...
│   │   ├── Partition 2
│   │   │   ├── _archive
│   │   │   ├── column1.d
│   │   │   ├── column2.d
│   │   │   ├── column2.k
│   │   │   └── ...
│   │   ├── txn_seq
│   │   │   ├── _meta
│   │   │   ├── _txnlog
│   │   │   └── _wal_index.d
│   │   ├── wal1
│   │   │   └── 0
│   │   │       ├── _meta
│   │   │       ├── _event
│   │   │       ├── column1.d
│   │   │       ├── column2.d
│   │   │       └── ...
│   │   ├── wal2
│   │   │   └── 0
│   │   │   │   ├── _meta
│   │   │   │   ├── _event
│   │   │   │   ├── column1.d
│   │   │   │   ├── column2.d
│   │   │   │   └── ...
│   │   │   └── 1
│   │   │       ├── _meta
│   │   │       ├── _event
│   │   │       ├── column1.d
│   │   │       ├── column2.d
│   │   │       └── ...
│   │   │
│   │   ├── _meta
│   │   ├── _txn
│   │   └── _cv

```

### Ingestion via ILP protocol

- **Native ILP integration:**
  QuestDB supports the [Influx Line Protocol](/docs/reference/api/ilp/overview/)
   (ILP) for high-speed data ingestion.

- **Extensions to ILP:**
  QuestDB extends ILP to support different timestamp units and the array data type.

- **Minimal parsing overhead:**
  The ILP parser quickly maps incoming data to internal structures.

- **Parallel ingestion:**
  The ILP path uses off-heap buffers and direct memory management to bypass JVM heap  allocation.

- **Protocol versatility:**
  In addition to ILP, QuestDB also supports ingestion via [REST](/docs/reference/sql/overview/#rest-http-api)
  and [PostgreSQL wire](/docs/reference/sql/overview/#postgresql) protocols.


## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)

