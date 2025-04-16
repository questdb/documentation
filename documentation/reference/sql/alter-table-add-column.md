---
title: ALTER TABLE ADD COLUMN
sidebar_label: ADD COLUMN
description: ALTER TABLE ADD COLUMN SQL keyword reference documentation.
---

Adds a new column of a specified type to an existing table.

The new column is not back-populated even if the table contains data. While a
single column is added atomically, adding multiple columns is not an atomic
operation. QuestDB will stop adding the remaining columns on the list on the
first failure. It is therefore possible to add some columns and not others.

:::caution

- New column names may only consist of letters, numbers and underscores `_`

- Adding a new column does not lock the table for reading and does not wait on
  any reads to finish.

:::

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of ALTER TABLE with ADD COLUMN keyword](/images/docs/diagrams/alterTableAddColumn.svg)

## OWNED BY

_Enterprise only._

When a user adds a new column to a table, they automatically get all column
level permissions with the `GRANT` option for that column.
However, if the `OWNED BY` clause is used, the permissions instead go to the
user, group, or service account named in that clause.

The `OWNED BY` clause cannot be omitted if the column is added by an external
user, because permissions cannot be granted to them.

## Examples

Add a new column called `comment` of `STRING` type to the table `ratings`

```questdb-sql title="New column"
ALTER TABLE ratings ADD COLUMN comment STRING;
```

Add a column only if it doesn't already exist:

```questdb-sql title="Add column if not exists"
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS score DOUBLE;
```

When adding a column of `Symbol` type, optional keywords may be passed which are
unique to this type. These keywords are described in the
[Symbol type](/docs/reference/sql/create-table/#symbols) section of the
`CREATE TABLE` documentation.

The following example shows how to add a new `SYMBOL` column with `NOCACHE` and
`INDEX` keywords:

```questdb-sql title="New symbol column"
ALTER TABLE ratings ADD COLUMN comment SYMBOL NOCACHE INDEX;
```
