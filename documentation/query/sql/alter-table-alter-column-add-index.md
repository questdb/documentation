---
title: ALTER TABLE COLUMN ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Table reference documentation.
---

Indexes an existing [`symbol`](/docs/concepts/symbol/) column.

## Syntax

```questdb-sql
ALTER TABLE tableName ALTER COLUMN columnName ADD INDEX;
```

Adding an [index](/docs/concepts/deep-dive/indexes/) is an atomic, non-blocking, and
non-waiting operation. Once complete, the SQL optimizer will start using the new
index for SQL executions.

## Examples

### Adding a bitmap index (default)

```questdb-sql
ALTER TABLE trades ALTER COLUMN side ADD INDEX;
```

### Adding a posting index

```questdb-sql
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX TYPE POSTING;
```

An encoding variant can be specified:

```questdb-sql
-- Force delta-only encoding
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX TYPE POSTING DELTA;
```

### Adding a posting index with covering columns

The `INCLUDE` clause stores additional column values in the index sidecar
files, enabling covering queries that bypass column file reads:

```questdb-sql
ALTER TABLE trades
  ALTER COLUMN symbol ADD INDEX TYPE POSTING INCLUDE (price, quantity);
```

The designated timestamp column is automatically included in the covering
index — you do not need to list it explicitly.

After this, queries that only select columns from the `INCLUDE` list (plus the
indexed symbol column and designated timestamp) are served from the index
sidecar:

```questdb-sql
-- This query reads from the index sidecar, not from column files
SELECT timestamp, price FROM trades WHERE symbol = 'AAPL';
```

See [Posting index and covering index](/docs/concepts/deep-dive/posting-index/)
for supported column types and performance details.
