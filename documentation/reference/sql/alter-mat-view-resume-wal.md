---
title: ALTER MATERIALIZED VIEW RESUME WAL
sidebar_label: ALTER MATERIALIZED VIEW
description:
  Documentation for the ALTER MATERIALIZED VIEW RESUME WAL SQL keyword in
  QuestDB.
---

:::info

Materialized View support is now generally available (GA) and ready for production use!

If you are using versions earlier than `8.3.1`, we suggest you upgrade at your earliest convenience!

:::

`ALTER MATERIALIZED VIEW RESUME WAL` restarts
[WAL table](/docs/concept/write-ahead-log/) transactions after resolving errors.

Accepts the same optional `sequencerTxn` input as the
[`ALTER TABLE RESUME WAL`](/docs/reference/sql/alter-table-resume-wal/)
operation. Refer to that page for more details.

## Syntax

![Flow chart showing the syntax of the ALTER MATERIALIZED VIEW keyword](/images/docs/diagrams/alterMatView.svg)

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW with RESUME WAL keyword](/images/docs/diagrams/resumeWal.svg)

## Example

Use the [`wal_tables()`](/docs/reference/function/meta/#wal_tables) function to
investigate the materialized view status:

```questdb-sql title="List all tables and materialized views" demo
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
