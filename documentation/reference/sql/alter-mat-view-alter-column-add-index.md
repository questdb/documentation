---
title: ALTER MATERIALIZED VIEW ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Materialized Views reference documentation.
---

Indexes an existing [`symbol`](/docs/concept/symbol/) column. Index capacity can be specified manually;
otherwise it will be calculated based on the current data in the view.

## Syntax
![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW with ADD INDEX keyword](/images/docs/diagrams/alterMatViewAddIndex.svg)

Adding an [index](/docs/concept/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

## Example

```questdb-sql title="Adding an index with default capacity"
ALTER MATERIALIZED VIEW trades_1h
    ALTER COLUMN symbol ADD INDEX;
```

```questdb-sql title="Adding an index with custom capacity"
ALTER MATERIALIZED VIEW trades_1h
    ALTER COLUMN symbol ADD INDEX CAPACITY 400;
```
