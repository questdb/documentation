---
title: ALTER TABLE DROP COLUMN
sidebar_label: DROP COLUMN
description: DROP COLUMN SQL keyword reference documentation.
---

Deletes a column from an existing table.

Dropping columns will also attempt to remove files belonging to the column from
all partitions, thus freeing up disk space immediately. If this is not
immediately possible on Windows, the file remove operation is postponed until
files are released by all threads. The logical drop column will succeed on
Windows in presence of active readers.

:::caution

Use `DROP COLUMN` with care, as QuestDB **cannot recover data from dropped
columns**! [Backup your database](/docs/operations/backup/) to avoid unintended
data loss.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/img/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with DROP COLUMN keyword](/img/docs/diagrams/alterTableDropColumn.svg)

## Example

The following example deletes the column called `comment` from the table
`ratings`

```questdb-sql title="Dropping a column"
ALTER TABLE ratings DROP COLUMN movieId;
```
