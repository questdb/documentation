---
title: Write-Ahead Log (WAL)
sidebar_label: Write-Ahead Log
description:
  Documentation for properties of a WAL table and comparison with its non-WAL
  counterpart.
---

import Screenshot from "@theme/Screenshot"

As of 7.3.10, QuestDB tables are Write-Ahead Log (WAL)-enabled by default. This
page introduces the properties and benefits of a WAL-enabled table. It also
contains a summary of key components, relevant functions, as well as related SQL
keywords.

## Properties

A WAL table must be [partitioned](/docs/concept/partitions/). It permits the
following concurrent transactions:

- Data ingestion through different interfaces
- Data modifications
- Table schema changes

## Write-Ahead Log benefits

A Write-Ahead Log (WAL) ensures that all changes to data are recorded in a log
before they are written to the database files. This means that in case of a
system crash or power failure, the database can recover to a consistent state by
replaying the log entries.

WAL tables also support concurrent data ingestion, modifications, and schema
changes without locking the entire table, allowing for high availability and
better performance in multi-user environments. By decoupling the transaction
commit from the disk write process, a WAL improves the performance of
write-intensive workloads, as it allows for sequential disk writes which are
generally faster than random ones.

As a result, a WAL assists with crash recovery by providing a clear sequence of
committed transactions, ensuring that any data written to the WAL can be
restored up to the last committed transaction.

As additional benefits, the sequencer in a WAL system ensures that data appears
consistent to all readers, even during ongoing write operations. And the
`TableWriter` can handle and resolve out-of-order data writes, which can be a
common issue in real workloads. It also enables
[deduplication](/docs/concept/deduplication/).

Furthermore, the WAL-enabled tables in QuestDB can be fine-tuned. Various WAL
configurations (like parallel threads for WAL application) allow the database's
performance and behavior to match the specific needs of different use cases.

Overall, WAL-enabled tables aim to balance the needs for speed, consistency, and
resilience in a database environment that may face concurrent access patterns
and the requirement for high availability. While recommended and largely
beneficial, there are limitations which we are working to resolve.

## Limitations

We have the following as limitations, which we aim to soon resolve:

- [UPDATE](/docs/reference/sql/update/)
  - No row count returned
  - No support for JOIN
- ALTER TABLE
  - [ADD COLUMN](/docs/reference/sql/alter-table-add-column/) can only add 1
    column per statement
  - Non-structural operations may fail silently. These are partition-level and
    configuration operations:
    - [ATTACH PARTITION](/docs/reference/sql/alter-table-attach-partition/)
    - [DETACH PARTITION](/docs/reference/sql/alter-table-detach-partition/)
    - [DROP PARTITION](/docs/reference/sql/alter-table-drop-partition/)
      - If a partition does not exist, then `DROP` will "succeed"
      - If partition does exist, then `DROP` may fail. If it does - the SQL
        execution will "succeed", but the database will log "critical" log
        citing a `DROP` issue.
    - [SET PARAM](/docs/reference/sql/alter-table-set-param/)

### WAL configurations

WAL-enabled tables are the default table.

You can choose to use non-WAL tables, if it's appropriate for your usecase.

For more information, see the
[`CREATE TABLE`](/docs/reference/sql/create-table/#wal-table-parameter)
reference.

Other related configurations include:

- Base table creation via [`CREATE TABLE`](/docs/reference/sql/create-table/)

- Converting an existing table to a WAL table or vice versa via
  [`SET TYPE`](/docs/reference/sql/alter-table-set-type/) following a database
  restart.

- Server-wide configuration via `cairo.wal.enabled.default`

  - When `cairo.wal.enabled.default` is set to `true` (default), the
    [`CREATE TABLE`](/docs/reference/sql/create-table/) SQL keyword generates
    WAL tables as the default.

- Parallel threads to apply WAL data to the table storage can be configured, see
  [WAL table configuration](/docs/configuration/#wal-table-configurations) for
  more details.

## Key components

A WAL table uses the following components to manage concurrent commit requests:

- **WAL**: acts as a dedicated API for each ingestion interface. When data is
  ingested via multiple interfaces, dedicated `WALs` ensure that the table is
  not locked by one interface only.

- **Sequencer**: centrally manages transactions, providing a single source of
  truth. The sequencer generates unique `txn` numbers as transaction identifiers
  and keeps a log that tracks their allocation, preventing duplicates. This log
  is called `TransactionLog` and is stored in a meta file called `_txnlog`. See
  [root directory](/docs/concept/root-directory-structure/#db-directory) for
  more information.

- **WAL apply job**: collects the commit requests based on the unique `txn`
  numbers and sends them to the `TableWriter` to be committed.

- **TableWriter**: updates the database and resolves any out-of-order data
  writes.

<Screenshot
  alt="Diagram showing the sequencer allocating txn numbers to events cronologically"
  title="The sequencer allocates unique txn numbers to transactions from different WALs chronologically and serves as the single source of truth."
  height={435}
  src="/img/docs/concepts/wal_sequencer.webp"
  width={745}
/>

<Screenshot
  alt="Diagram showing the WAL job application and WAL collect events and commit to QuestDB"
  title="The WAL job application collects the transactions sequencially for the TableWriter to commit to QuestDB."
  height={435}
  src="/img/docs/concepts/wal_process.webp"
  width={745}
/>

## Checking WAL configurations

The following table metadata functions are useful for checking WAL table
settings:

- [`tables()`](/docs/reference/function/meta/#tables) returns general table
  metadata, including whether a table is a WAL table or not.
- [`wal_tables()`](/docs/reference/function/meta/#wal_tables) returns WAL-table
  status.
- [ALTER TABLE RESUME WAL](/docs/reference/sql/alter-table-resume-wal/) restarts
  suspended transactions.

<!-- ## See also -->
<!-- Adding links to blog posts etc -->
