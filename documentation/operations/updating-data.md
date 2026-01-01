---
title: How UPDATE works
sidebar_label: How UPDATE works
description: How the UPDATE statement is implemented in QuestDB.
---

This page explains how QuestDB implements the
[UPDATE statement](/docs/query/sql/update/) internally.

:::tip
UPDATE uses copy-on-write which increases disk usage. For high-frequency
modifications, consider [append-oriented alternatives](/docs/operations/modifying-data/)
that work with QuestDB's storage model.
:::

## Storage model

To be able to understand how table rows are updated in QuestDB, first we need to
have an idea of how the data is stored. The documentation contains detailed
descriptions of the [storage engine](/docs/architecture/storage-engine/) and the
[directory layout](/docs/concepts/deep-dive/root-directory-structure/#db-directory) but if
we quickly want to summarize it:

- Each table has its own folder in the db root, the directory is named after the
  table
- Partitions are manifested as subdirectories under the folder which represents
  the table
- The actual data is stored in column files inside these subdirectories
- Column files store data **ordered by the designated timestamp** and they are
  **append-only**. This goes naturally with [time-series data](/blog/what-is-time-series-data/), just think about
  market data where the price of different financial instruments are tracked
  during the trading day, for example

## Column versions

Since files are append-only, updating existing data is not straightforward.
QuestDB's storage model assumes past data rarely changes, which optimizes read
performance. However, sometimes you need to amend data that was recorded
incorrectly.

We could break our append-only model and modify column files in place, but this
would cause inconsistent reads. Concurrent queries could see partially updated
data.

The solution is to make the update **transactional** and **copy-on-write**.
Basically a new column file is created when processing the UPDATE statement. All
readers are looking at a previous consistent view of the data from an older
column file while the UPDATE is in progress. Readers can find the latest
committed version of column files based on a record stored in a metadata file.
When the update is completed and a new column version is available for the
readers, this metadata record gets updated as part of the commit. After metadata
has changed newly submitted SELECT queries will see the updated data.

The copy-on-write approach gives us data consistency and good performance at a
price, disk usage will increase. When sizing disk space we should account for
extra storage to make sure UPDATE statements have enough headroom. Only those
column files will get a new version where data is actually changing. For
example, if only a single column is updated in a single partition of a table,
then only a single column file will be rewritten.

## Vacuum updated columns

When a column is updated, the new version of the column is written to disk and a
background task starts to vacuum redundant column files. The term Vacuum
originates from Postgres, it means the collection of garbage and release of disk
space. The Vacuum task checks periodically if older column versions are still
used by readers and deletes unused files. Vacuum runs automatically and there is
also a [`VACUUM TABLE`](/docs/query/sql/vacuum-table/) SQL command to
trigger it.

## Limitations

UPDATE rewrites column files by copying records in their existing order and
replacing values as needed. As a result, the **designated timestamp column
cannot be updated**.

Modifying the designated timestamp would require reordering records and
potentially moving rows between partitions.
