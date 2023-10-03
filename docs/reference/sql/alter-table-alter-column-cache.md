---
title: ALTER TABLE COLUMN CACHE | NOCACHE
sidebar_label: CACHE | NOCACHE
---

`ALTER TABLE ALTER COLUMN CACHE | NOCACHE` changes the cache setting for a
[symbol](/docs/concept/symbol/) column.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/img/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of NOCACHE | CACHE](/img/docs/diagrams/alterTableNoCache.svg)

- `columnName` is the `symbol` data type.
- By default, a symbol column is cached.
- Refer to the [Guide on symbol](/docs/concept/symbol/#symbol-columns) for the advantages of
  caching `symbols`.

## Examples

```questdb-sql
ALTER TABLE 'taxi_ride' ALTER COLUMN passenger_count NOCACHE;
```
