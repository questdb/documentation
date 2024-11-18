---
title: TRUNCATE TABLE keyword
sidebar_label: TRUNCATE TABLE
description: TRUNCATE SQL keyword reference documentation.
---

`TRUNCATE TABLE` permanently deletes the contents of a table without deleting
the table itself.

## Syntax

![Flow chart showing the syntax of the TRUNCATE TABLE keyword](/images/docs/diagrams/truncateTable.svg)

## Notes

This command irremediably deletes the data in the target table. In doubt, make
sure you have created [backups](/docs/reference/sql/backup/) of your data.

## Examples

```questdb-sql
TRUNCATE TABLE ratings;
```

## See also

To delete both the data and the table structure, use
[DROP](/docs/reference/sql/drop/).
