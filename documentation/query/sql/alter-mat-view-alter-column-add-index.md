---
title: ALTER MATERIALIZED VIEW ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Materialized Views reference documentation.
---

Indexes an existing [`symbol`](/docs/concepts/symbol/) column.

## Syntax
![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW with ADD INDEX keyword](/images/docs/diagrams/alterMatViewAddIndex.svg)

Adding an [index](/docs/concepts/deep-dive/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

:::warning

- The **index capacity** and
  [**symbol capacity**](/docs/concepts/symbol/) are different
  settings.
- The index capacity value should not be changed, unless a user is aware of all
  the implications.
- To learn more about index capacity, check the [Index concept](/docs/concepts/deep-dive/indexes/#index-capacity) page.
:::

## Example

```questdb-sql title="Adding an index with default capacity"
ALTER MATERIALIZED VIEW trades_1h
    ALTER COLUMN symbol ADD INDEX;
```


