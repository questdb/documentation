---
title: ALTER TABLE COLUMN ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Table reference documentation.
---

Indexes an existing [`symbol`](/docs/concept/symbol/) column.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE ALTER COLUMN ADD INDEX keyword](/images/docs/diagrams/alterTableAddIndex.svg)


Adding an [index](/docs/concept/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

## Example

```questdb-sql title="Adding an index"
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX;
```
