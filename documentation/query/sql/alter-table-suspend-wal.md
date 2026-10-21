---
title: ALTER TABLE SUSPEND WAL
sidebar_label: SUSPEND WAL
description: ALTER TABLE SUSPEND WAL SQL keyword reference documentation.
---

Deliberately stops the WAL apply job for a
[WAL table](/docs/concepts/write-ahead-log/), leaving the table quiescent while
you work on it. Reverse it with
[`RESUME WAL`](/docs/query/sql/alter-table-resume-wal/).

A table normally becomes suspended on its own, when applying a transaction
fails. `SUSPEND WAL` puts a healthy table into that same state on purpose, which
is what maintenance operations such as
[`REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/) need.

## Syntax

```questdb-sql
ALTER TABLE tableName SUSPEND WAL;
```

## Description

A write to a WAL table lands in two stages: it is committed to the sequencer,
then applied to the table by the WAL apply job. Suspending stops the second
stage only.

While a table is suspended:

- Writes are still accepted and still committed to the sequencer.
- Nothing is applied, so **queries do not see the new rows**.
- The pending transactions queue up. `RESUME WAL` applies them in order, so
  nothing is lost.

:::warning Writes appear to succeed but stay invisible

An `INSERT` into a suspended table returns success, and the rows do not show up
in queries until the table is resumed. An ingestion pipeline pointed at a
suspended table reports no errors while its data goes nowhere visible. Set
[`cairo.wal.apply.suspended.write.denied`](/docs/configuration/wal/#cairowalapplysuspendedwritedenied)
to reject those writes instead of queueing them.

:::

Suspending and resuming share a single authorization, so a grant that allows
one allows the other.

## Examples

Suspend a table and observe the effect through
[`wal_tables()`](/docs/query/functions/meta/#wal_tables), where `sequencerTxn`
is the last committed transaction and `writerTxn` the last applied one:

```questdb-sql
ALTER TABLE trades SUSPEND WAL;

INSERT INTO trades VALUES ('2026-08-28T10:00:00.000000Z', 'EURUSD', 1.0842);

SELECT name, suspended, writerTxn, sequencerTxn
FROM wal_tables()
WHERE name = 'trades';
```

| name   | suspended | writerTxn | sequencerTxn |
| ------ | --------- | --------- | ------------ |
| trades | true      | 0         | 1            |

The transaction is committed (`sequencerTxn` is `1`) but not applied
(`writerTxn` is `0`), so a count returns no rows:

```questdb-sql
SELECT count() FROM trades;
```

| count |
| ----- |
| 0     |

Resuming applies the queued transactions:

```questdb-sql
ALTER TABLE trades RESUME WAL;

SELECT count() FROM trades;
```

| count |
| ----- |
| 1     |

## Suspending across a restart

`SUSPEND WAL` applies at runtime and does not survive a restart. To keep a table
suspended permanently, list it in
[`cairo.wal.apply.suspended.tables`](/docs/configuration/wal/#cairowalapplysuspendedtables),
which is reloadable and applies the same "hard suspend" from configuration.

## See also

- [`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/)
- [`ALTER TABLE REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/)
- [Write-ahead log](/docs/concepts/write-ahead-log/)
