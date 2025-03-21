---
title: ALTER MATERIALIZED VIEW RESUME WAL
sidebar_label: RESUME WAL
description:
  Documentation for the ALTER MATERIALIZED VIEW RESUME WAL SQL keyword in
  QuestDB.
---

:::info

Materialized View support is in **beta**.

It may not be fit for production use.

To enable **beta** materialized views, set `cairo.mat.view.enabled=true` in `server.conf`, or export the equivalent
environment variable: `QDB_CAIRO_MAT_VIEW_ENABLED=true`.

Please let us know if you run into issues.

Either:

1. Email us at [support@questdb.io](mailto:support@questdb.io)
2. Join our [public Slack](https://slack.questdb.com/)
3. Post on our [Discourse community](https://community.questdb.com/)

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
