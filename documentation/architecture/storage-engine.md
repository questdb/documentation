---
title: QuestDB Storage Engine
slug: storage-engine
sidebar_label: Storage Engine
description: The QuestDB Storage Engine uses a column-oriented design to ensure high I/O performance and low latency.
---

import ThreeTierChart from '@site/src/components/ThreeTierChart';

## Storage engine

The QuestDB Storage Engine implements a row-based write path for maximum ingestion throughput and a column-based
read path for maximum query performance. Table storage can be configured to use the QuestDB native binary format or
to combine the QuestDB binary format for recent data with Parquet for older partitions. We refer to this model as a
three-tier storage model.



### Tier One: Parallel Write-Ahead Log

- **Two-phase writes**: All changes to data are recorded in a Write-Ahead Log (WAL) before they
are written to the database files. This means that in case of a system crash or power failure, the database can recover to a consistent state by replaying the log entries.

- **Commit and write separation**: By decoupling the transaction commit from the disk write process,
a WAL improves the performance of write-intensive workloads, as it allows sequential disk writes,
which are generally faster than random ones.

- **Per-table WAL**: WAL files are separated per table, and also per active connection, allowing for
concurrent data ingestion, modifications, and schema changes without locking the entire table.

- **WAL consistency**: QuestDB implements a component called "Sequencer," which ensures that data
appears consistent to all readers, even during ongoing write operations.


<Screenshot
  alt="Diagram showing WAL files consolidation"
  title="The sequencer allocates unique txn numbers to transactions from different WALs chronologically and serves as the single source of truth, allowing for data deduplication and consolidation."
  src="images/guides/questdb-internals/walData.webp"
  width={1000}
/>

### Tier Two: Local Table Storage

Changes in the parallel WAL files are stored on local disk in columnar format by
the TableWriter. The TableWriter also handles and resolves out-of-order data
writes and enables deduplication. Column files use an append model.

By default, the active (most recent) partition for each table is stored in
QuestDB's native binary format for minimum query latency and to optimize writes
in the event of out-of-order data or when updating sampling intervals in
materialized views.

Locally, a partition can be stored in either of two formats:

- **QuestDB native binary format** (the default): the append-friendly columnar
  format used for all partitions unless configured otherwise.
- **[Parquet](/docs/concepts/parquet/)**: a compressed, interoperable format
  for historical partitions. Parquet partitions remain fully available for
  queries, users don't need to know whether a partition is native or Parquet,
  and all QuestDB data types can be converted to Parquet.

A table's partitions can become Parquet in three ways:

- **By default at creation, or via ALTER**: store partitions as Parquet with the
  `FORMAT PARQUET` clause on
  [`CREATE TABLE`](/docs/query/sql/create-table/#partition-format), or switch an
  existing table with
  [`ALTER TABLE SET FORMAT`](/docs/query/sql/alter-table-set-format/).
- **Manually, per partition**: convert individual partitions in place with
  [in-place Parquet conversion](/docs/concepts/parquet/#in-place-conversion).
- **Automatically, as partitions age**: convert on a schedule with
  [storage policies](/docs/concepts/storage-policy/) (QuestDB Enterprise).

### Tier Three: Remote Object Storage

The third tier moves historical Parquet partitions off local disk into a remote
store (such as S3, Azure Blob, or GCS in the cloud, or NFS for on-premise
deployments), reducing the local storage footprint. These remote partitions
remain directly queryable from QuestDB with SQL, exactly as if they were stored
locally, and the primary and all replicas share the same object storage.

In QuestDB Enterprise this is automated through
[storage policies](/docs/concepts/storage-policy/), which control when partitions
are converted to Parquet and when they are uploaded to and dropped from object
storage (the `TO REMOTE` and `DROP REMOTE` policy stages).

Once partitions are in object storage, they can be catalogued into data lakes,
for example through Hive partition registration, an Iceberg catalog, or a
DuckLake catalog.



<ThreeTierChart />


### Data Deduplication

When enabled, [data deduplication](https://questdb.com/docs/concepts/deduplication/) works on all the data inserted into
the table and replaces matching rows with the new versions. Only new rows that do not match existing data will be inserted.

Generally, if the data has mostly unique timestamps across all the rows, the performance impact of deduplication is low.
Conversely, the most demanding data pattern occurs when there are many rows with the same timestamp that need to be
deduplicated on additional columns.


### Column-oriented storage

- **Data layout:**
  The system stores each table as separate files per column. Fixed-size data types use one file
  per column, while variable-size data types (such as `VARCHAR` or `STRING`) use two files per column.

<Screenshot
  alt="Architecture of the storage model with column files, readers/writers and the mapped memory"
  title="Architecture of the storage model with multiple column files per partition"
  src="images/guides/questdb-internals/columnarStorage.webp"
  width={700}
/>


- **CPU optimization:**
  Columnar storage improves CPU use during vectorized operations, which speeds up
  aggregations and computations.

- **Compression:**
  Uniform data types allow efficient compression that reduces disk space and speeds up reads
  when [ZFS compression](/docs/deployment/compression-zfs/) is enabled. Parquet files generated
  by QuestDB use native compression.

### Durability

By default, QuestDB relies on OS-level durability, letting the OS write dirty pages to disk.
For stronger guarantees, enable sync commit mode:

```ini title="server.conf"
cairo.commit.mode=sync
```

This invokes `fsync()` on each commit, ensuring data survives OS crashes or power loss
at the cost of reduced write throughput.

## Next up

Continue to [Memory Management](/docs/architecture/memory-management/) to learn how QuestDB manages memory and integrates native code.
