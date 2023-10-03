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
