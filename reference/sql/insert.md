---
title: INSERT keyword
sidebar_label: INSERT
description: INSERT SQL keyword reference documentation.
---

`INSERT` ingests selected data into a database table.

## Syntax

Inserting values directly or using sub-queries:

![Flow chart showing the syntax of the INSERT keyword](/img/docs/diagrams/insert.svg)

Inserting using sub-query alias:

![Flow chart showing the syntax of the WITH AS INSERT keyword](/img/docs/diagrams/withAsInsert.svg)

### Description

:::note

If the target partition is
[attached by a symbolic link](/docs/reference/sql/alter-table-attach-partition/#symbolic-links),
the partition is read-only. `INSERT` operation on a read-only partition triggers
a critical-level log in the server, and the insert is a no-op.

:::

Inserting values directly or using sub-queries:

- `VALUE`: Directly defines the values to be inserted.
- `SELECT`: Inserts values based on the result of a
  [SELECT](/docs/reference/sql/select/) query

Setting sub-query alias:

- `WITH AS`: Inserts values based on a sub-query, to which an alias is given by
  using [WITH](/docs/reference/sql/with/).

Parameter:

- `batch` expects a `batchCount` (integer) value defining how many records to
  process at any one time.

## Examples

```questdb-sql title="Inserting all columns"
INSERT INTO trades
VALUES(
    '2021-10-05T11:31:35.878Z',
    'AAPL',
    255,
    123.33,
    'B');
```

```questdb-sql title="Bulk inserts"
INSERT INTO trades
VALUES
    ('2021-10-05T11:31:35.878Z', 'AAPL', 245, 123.4, 'C'),
    ('2021-10-05T12:31:35.878Z', 'AAPL', 245, 123.3, 'C'),
    ('2021-10-05T13:31:35.878Z', 'AAPL', 250, 123.1, 'C'),
    ('2021-10-05T14:31:35.878Z', 'AAPL', 250, 123.0, 'C');
```

```questdb-sql title="Specifying schema"
INSERT INTO trades (timestamp, symbol, quantity, price, side)
VALUES(
    to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),
    'AAPL',
    255,
    123.33,
    'B');
```

:::note

Columns can be omitted during `INSERT` in which case the value will be `NULL`

:::

```questdb-sql title="Inserting only specific columns"
INSERT INTO trades (timestamp, symbol, price)
VALUES(to_timestamp('2019-10-17T00:00:00', 'yyyy-MM-ddTHH:mm:ss'),'AAPL','B');
```

### Inserting query results

This method allows you to insert as many rows as your query returns at once.

```questdb-sql title="Insert as select"
INSERT INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
```

Using the [`WITH` keyword](/docs/reference/sql/with/) to set up an alias for a
`SELECT` sub-query:

```questdb-sql title="Insert with sub-query"
WITH confirmed_id AS (
    SELECT * FROM unconfirmed_trades
    WHERE trade_id = '47219345234'
)
INSERT INTO confirmed_trades
SELECT * FROM confirmed_id;
```

:::note 

Since QuestDB v7.4.0, the default behaviour for `INSERT INTO SELECT` has been changed.

Previously, the table would be created atomically. For large tables, this requires a significant amount of RAM,
and can cause errors if the database runs out of memory.

By default, this will be performed in batches. If the query fails, partial data may be inserted.

If this is a problem, it is recommended to use the ATOMIC keyword (`INSERT ATOMIC INTO`). Alternatively,
enabling deduplication on the table will allow you to perform an idempotent insert to re-insert any missed data.

:::

### ATOMIC

Inserts can be performed created atomically, which first loads all of the data and then commits in a single transaction.

This requires the data to be available in memory all at once, so for large inserts, this may have performance issues.

To force this behaviour, one can use the `ATOMIC` keyword:

```questdb-sql title="Insert as select atomically"
INSERT ATOMIC INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
```

### BATCH

By default, data will be inserted in batches.

The size of the batches can be configured:

- globally, by setting the `cairo.sql.insert.model.batch.size` configuration option in `server.conf`.
- locally, by using the `BATCH` keyword in the `INSERT INTO` statement.

```questdb-sql title="Insert as select batched"
INSERT BATCH 4096 INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';  WHERE false
);
```

One can also specify the out-of-order commit lag for these batched writes, using the o3MaxLag option:

```questdb-sql title="Insert as select with batching and O3 lag"
INSERT BATCH 4096 o3MaxLag 1s INTO confirmed_trades
    SELECT timestamp, instrument, quantity, price, side
    FROM unconfirmed_trades
    WHERE trade_id = '47219345234';
```
