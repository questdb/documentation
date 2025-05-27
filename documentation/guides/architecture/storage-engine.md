---
title: Storage Engine
slug: storage-engine
description: The QuestDB Storage Engine uses a column-oriented design to ensure high I/O performance and low latency.
---


## Storage engine

### Parallel Write-Ahead-Log

- **Two-phase writes**: All changes to data are recorded in a Write-Ahead-Log (WAL) before they
are written to the database files. This means that in case of a system crash or power failure, the database can recover to a consistent state by replaying the log entries.

- **Commit and write separation**: By decoupling the transaction commit from the disk write process,
a WAL improves the performance of write-intensive workloads, as it allows for sequential disk writes
which are generally faster than random ones.

- **Per-table WAL**: WAL files are separated per table, and also per active connection, allowing for
concurrent data ingestion, modifications, and schema changes without locking the entire table.

- **WAL Consistency**: QuestDB implements a component called "Sequencer", which ensures that data
appears consistent to all readers, even during ongoing write operations.


- **TableWriter**: Changes stored in the WAL, is stored in columnat format by the TableWriter, which
can handle and resolve out-of-order data writes, and enables deduplication. Column files use an
[append model](/docs/concept/storage-model/).

<Screenshot
  alt="Diagram showing WAL files consolidation"
  title="The sequencer allocates unique txn numbers to transactions from different WALs chronologically and serves as the single source of truth, allowing for data deduplication and consolidation."
  src="images/guides/questdb-internals/walData.webp"
  width={1000}
/>


### Data Deduplication

When enabled, [data deduplication](https://questdb.com/docs/concept/deduplication/) works on all the data inserted into
the table and replaces matching rows with the new versions. Only new rows that do no match existing data will be inserted.

Generally, if the data have mostly unique timestamps across all the rows, the performance impact of deduplication is low.
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

