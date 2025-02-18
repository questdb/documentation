---
title: ALTER MATERIALIZED VIEW RESUME WAL
sidebar_label: RESUME WAL
description:
  ALTER TABLE MATERIALIZED VIEW RESUME WAL SQL keyword reference documentation.
---

Restarts transactions of the underlying
[WAL table](/docs/concept/write-ahead-log/) that belongs to a materialized view
after recovery from errors.

## Syntax

![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW keyword](/images/docs/diagrams/alterMatView.svg)
![Flow chart showing the syntax of ALTER MATERIALIZED VIEW with RESUME WAL keyword](/images/docs/diagrams/resumeWal.svg)

## Description

`ALTER MATERIALIZED VIEW RESUME WAL` is used to restart WAL table transactions
after resolving errors. This operation accepts same `sequencerTxn` optional
input as ALTER TABLE RESUME WAL
[operation](/docs/reference/sql/alter-table-resume-wal/), so refer to that page
for more details.

## Examples

Using the [`wal_tables()`](/docs/reference/function/meta/#wal_tables) function
to investigate the materialized view status:

```questdb-sql title="List all tables and materialized views"
wal_tables();
```

| name      | suspended | writerTxn | sequencerTxn |
| --------- | --------- | --------- | ------------ |
| trades_1h | true      | 3         | 5            |

The `trades_1h` view is suspended. The last successful commit is `3`.

The following query restarts transactions from the failed transaction, `4`:

```questdb-sql
ALTER MATERIALIZED VIEW trades_1h RESUME WAL;
```

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
