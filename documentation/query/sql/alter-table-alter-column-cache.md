---
title: ALTER TABLE COLUMN CACHE | NOCACHE
sidebar_label: CACHE | NOCACHE
---

`ALTER TABLE ALTER COLUMN CACHE | NOCACHE` changes the cache setting for a
[symbol](/docs/concepts/symbol/) column.

## Syntax

```questdb-sql
ALTER TABLE tableName ALTER COLUMN columnName { CACHE | NOCACHE };
```

- `columnName` is the `symbol` data type.
- By default, a symbol column is cached.
- Refer to the [Guide on symbol](/docs/concepts/symbol/) for the
  advantages of caching `symbols`.

## Examples

```questdb-sql
ALTER TABLE trades ALTER COLUMN side NOCACHE;
```
