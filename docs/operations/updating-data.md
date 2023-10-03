---
title: Updating data
sidebar_label: Updating data
description:
  How the UPDATE statement is implemented in QuestDB.
---

This document describes how the UPDATE statement works in QuestDB and what happens
under the hood when an update is executed.

## Storage model

To be able to understand how table rows are updated in QuestDB, first we
need to have an idea of how the data is stored. The documentation contains
detailed descriptions of the [storage model](/docs/concept/storage-model/) and
the [directory layout](/docs/concept/root-directory-structure/#db-directory)
but if we quickly want to summarize it:
- Each table has its own folder in the db root, the directory is named after the table
- Partitions are manifested as subdirectories under the folder which represents the table
- The actual data is stored in column files inside these subdirectories
- Column files store data **ordered by the designated timestamp** and they are
**append-only**. This goes naturally with time-series data, just think about market
data where the price of different financial instruments are tracked during the
trading day, for example

## Column versions

Since the data is stored in order and the files are append-only updating it is not
straightforward. We took the optimistic approach and assumed that past data
will never have to change. This is great for read performance.
However, sometimes you may need to **amend data** which has been recorded incorrectly
because of a bug or for any other reason.

We could break our append-only model and start accessing different parts of the
column files to fix incorrect data. The problem we would face with is inconsistent
reads. Readers running queries on the table would not be happy as they could see
some part of the data updated but not others.

The solution is to make the update **transactional** and **copy-on-write**. Basically
a new column file is created when processing the UPDATE statement. All readers are
looking at a previous consistent view of the data from an older column file while the
UPDATE is in progress. Readers can find the latest committed version of column files
based on a record stored in a metadata file. When the update is completed and a new
column version is available for the readers, this metadata record gets updated as part
of the commit. After metadata has changed newly submitted SELECT queries will see the
updated data.

The copy-on-write approach gives us data consistency and good performance at a price,
disk usage will increase. When sizing disk space we should account for extra storage
to make sure UPDATE statements have enough headroom. Only those column files will get
a new version where data is actually changing. For example, if only a single column
is updated in a single partition of a table, then only a single column file will be
rewritten.

Please, also check the following guide on [modifying data](/docs/guides/modifying-data/)
in QuestDB for additional information.

## Vacuum updated columns

When a column is updated, the new version of the column is written to disk and a background 
task starts to vacuum redundant column files. The term Vacuum originates from Postgres, it means
the collection of garbage and release of disk space. The Vacuum task checks periodically if
older column versions are still used by readers and deletes unused files.
Vacuum runs automatically and there is also a [`VACUUM TABLE`](/docs/reference/sql/vacuum-table/)
SQL command to trigger it. 

## Limitations

Current implementation of the UPDATE operation rewrites the column files by copying
records in their existing order from the previous version, and replacing the value if
it needs changing. As a result the **designated timestamp cannot be updated.**

Modifying the designated timestamp would lead to rewriting history of the time series.
Records would need to be reordered, this could even mean moving rows in between
different partitions. We may remove this limitation in the future if there is enough
demand by users.
