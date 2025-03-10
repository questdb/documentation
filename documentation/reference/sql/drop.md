---
title: DROP TABLE keyword
sidebar_label: DROP TABLE
description: DROP TABLE SQL keyword reference documentation.
---

`DROP TABLE` permanently deletes a table and its contents. `DROP ALL TABLES`
permanently deletes all the tables and materialized views and their contents.

:::note

[Backup your database](/docs/operations/backup/) to avoid unintended data loss.

:::

## Syntax

![Flow chart showing the syntax of the DROP TABLE keyword](/images/docs/diagrams/dropTable.svg)

### IF EXISTS

An optional `IF EXISTS` clause may be added directly after the `DROP TABLE`
keywords to indicate that the selected table should be dropped if it exists.

## Description

This command irremediably deletes the data in the target table. Unless the table
was created in a different volume than the standard, see
[CREATE TABLE IN VOLUME](/docs/reference/sql/create-table/#table-target-volume),
in which case the table is only logically removed and data remains intact in its
volume. In doubt, make sure you have created
[backups](/docs/operations/backup/) of your data.

Disk space is reclaimed asynchronously after the table is dropped. Ongoing table
reads might delay space reclamation.

## Example

```questdb-sql
DROP TABLE ratings;
```

```questdb-sql
DROP ALL TABLES;
```

## See also

To delete the data inside a table but keep the table and its structure, use
[TRUNCATE](/docs/reference/sql/truncate/).
