---
title: TRUNCATE TABLE keyword
sidebar_label: TRUNCATE TABLE
description: TRUNCATE SQL keyword reference documentation.
---

`TRUNCATE TABLE` permanently deletes the contents of a table without deleting
the table itself.

## Syntax

![Flow chart showing the syntax of the TRUNCATE TABLE keyword](/images/docs/diagrams/truncateTable.svg)

### IF EXISTS

An optional `IF EXISTS` clause may be added directly after the `TRUNCATE TABLE`
keywords to indicate that the selected table should be truncated only if it exists.
Without `IF EXISTS`, QuestDB will throw an error if the table does not exist.

## Notes

This command irremediably deletes the data in the target table. In doubt, make
sure you have created [backups](/docs/operations/backup/) of your data.

## Examples

```questdb-sql
TRUNCATE TABLE trades;
```

This example will not throw an error, even if the table does not exist:

```questdb-sql
TRUNCATE TABLE IF EXISTS trades_non_existent;
```
## See also

To delete both the data and the table structure, use
[DROP](/docs/query/sql/drop/).
