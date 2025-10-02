---
title: Storage Engine
slug: storage-engine
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

### Tier Two: QuestDB Binary Table Storage

Changes in the parallel WAL files are stored in columnar binary format by the TableWriter. The TableWriter
also handles and resolves out-of-order data writes and enables deduplication. Column files use an
[append model](/docs/concept/storage-model/).

The active (most recent) partition for each table is always stored in this storage tier for minimum query latency and
to optimize writes in the event of out-of-order data or when updating sampling intervals in materialized views.

### Tier Three: Parquet, Locally or in Object Storage

Older partitions (any partition other than the most recent one) can be converted to
[Parquet](/docs/guides/export-parquet) for both interoperability and compression ratio.

Partitions in Parquet format remain fully available for queries. Users don't need to know whether a partition is in QuestDB
binary format or Parquet format. All the data types available in QuestDB can be converted to Parquet.

When using QuestDB Enterprise, tables can be configured to convert to Parquet automatically and to send the Parquet
files to object storage (Amazon S3, Microsoft Blob Storage, Google Cloud Storage, NFS...). This can help reduce the
cost of storing historical data while keeping it fully available for queries.



<ThreeTierChart />


### Data Deduplication

When enabled, [data deduplication](https://questdb.com/docs/concept/deduplication/) works on all the data inserted into
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
  when [ZFS compression](/docs/guides/compression-zfs/) is enabled. Parquet files generated
  by QuestDB use native compression.



## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
