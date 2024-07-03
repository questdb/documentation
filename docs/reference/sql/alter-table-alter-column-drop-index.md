---
title: ALTER TABLE COLUMN DROP INDEX
sidebar_label: DROP INDEX
description: DROP INDEX SQL keyword reference documentation.
---

Removes an existing index from a column of type [symbol](/docs/concept/symbol/).

:::note

[Backup your database](/docs/operations/backup/) to avoid unintended data loss.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE with DROP INDEX keyword](/img/docs/diagrams/alterTableDropIndex.svg)

Removing an index is an atomic, non-blocking, and non-waiting operation. Once
the operation is completed, the SQL engine stops using the index for SQL
executions, and all its associated files are deleted.

This operation is similar to:

```sql
UPDATE tab SET column=column;
```

Where `column` is a symbol column that has an [index](/docs/concept/indexes/)
before the operation, and no index afterwards. Readers of the table might be
using the index in transaction A, in the meantime, a writer creates transaction
B containing the new version of the column, minus the index (metadata is set to
not have index, and index files are not copied across to the newer version).
When the readers are finished, QuestDB automatically deletes all the files
pertaining to the version of the column in transaction A (QuestDB uses hardlinks
internally to avoid an actual copy operation of the data files, as they do not
change at all).

## Example

```questdb-sql title="Removing an index"
ALTER TABLE trades ALTER COLUMN instrument DROP INDEX;
```
