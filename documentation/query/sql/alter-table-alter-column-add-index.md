---
title: ALTER TABLE COLUMN ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Table reference documentation.
---

Indexes an existing [`symbol`](/docs/concepts/symbol/) column.

## Syntax

Bitmap index (default):

```questdb-sql
ALTER TABLE tableName ALTER COLUMN columnName ADD INDEX [CAPACITY n]
```

[Posting index](/docs/concepts/deep-dive/posting-index/), with optional
covering columns and encoding variant:

```questdb-sql
ALTER TABLE tableName ALTER COLUMN columnName
  ADD INDEX TYPE POSTING [DELTA | EF] [INCLUDE (col, ...)]
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

The designated timestamp is auto-included as a covered column even when
no explicit `INCLUDE` clause is given, so the bare form above already
covers `SELECT timestamp, instrument FROM trades WHERE instrument = 'X'`.

An encoding variant can also be forced:

```questdb-sql
-- Force delta + Frame-of-Reference (benchmarking)
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX TYPE POSTING DELTA;

-- Force Elias-Fano (benchmarking)
ALTER TABLE trades ALTER COLUMN instrument ADD INDEX TYPE POSTING EF;
```

### Adding a posting index with covering columns

The `INCLUDE` clause stores additional column values in the index sidecar
files, enabling covering queries that bypass column file reads:

```questdb-sql
ALTER TABLE trades
  ALTER COLUMN symbol ADD INDEX TYPE POSTING INCLUDE (price, quantity);
```

The designated timestamp is appended to the `INCLUDE` list automatically.
After this, queries that only select columns from the `INCLUDE` list (plus
the indexed symbol column and designated timestamp) are served from the
index sidecar:

```questdb-sql
-- This query reads from the index sidecar, not from column files
SELECT timestamp, price FROM trades WHERE symbol = 'AAPL';
```

See [Posting index and covering index](/docs/concepts/deep-dive/posting-index/)
for supported column types and performance details.
