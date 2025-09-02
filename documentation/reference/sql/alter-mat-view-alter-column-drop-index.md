---
title: ALTER MATERIALIZED VIEW ALTER COLUMN DROP INDEX
sidebar_label: DROP INDEX
description: DROP INDEX SQL keyword. Materialized View reference documentation.
---

Removes an existing [index](/docs/concept/indexes/) from a column of type [symbol](/docs/concept/symbol/).

:::note

[Backup your database](/docs/operations/backup/) to avoid unintended data loss.

:::

## Syntax
![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW keyword](/images/docs/diagrams/alterMatView.svg)
![Flow chart showing the syntax of the ALTER MATERIELIZED with DROP INDEX keyword](/images/docs/diagrams/dropIndex.svg)

Removing an [index](/docs/concept/indexes/) is an atomic, non-blocking, and non-waiting operation. Once
the operation is completed, the SQL engine stops using the index for SQL
executions, and all its associated files are deleted.

Readers of the table might be
using the index in transaction A. In the meantime, a writer creates transaction
B containing the new version of the column, minus the index (metadata is set to
not have index, and index files are not copied across to the newer version).
When the readers are finished, QuestDB automatically deletes all the files
pertaining to the version of the column in transaction A (QuestDB uses hardlinks
internally to avoid an actual copy operation of the data files, as they do not
change at all).

## Example

```questdb-sql title="Removing an index from a materialized view"
ALTER MATERIALIZED VIEW trades
    ALTER COLUMN instrument DROP INDEX;
```
