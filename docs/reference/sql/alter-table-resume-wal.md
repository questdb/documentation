---
title: ALTER TABLE RESUME WAL
sidebar_label: RESUME WAL
description: ALTER TABLE RESUME WAL SQL keyword reference documentation.
---

Restarts transactions of a [WAL table](/docs/concept/write-ahead-log/) after
recovery from errors.

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/img/docs/diagrams/alterTable.svg)
![Flow chart showing the syntax of ALTER TABLE with RESUME WAL keyword](/img/docs/diagrams/alterTableResumeWal.svg)

## Description

`sequencerTxn` is the unique `txn` identification that the Sequencer issues to
transactions.

When `sequencerTxn` is not specified, the operation resumes the WAL apply job
from the next uncommitted transaction, including the failed one.

When `sequencerTxn` is not specified, the operation resumes the WAL apply job
from the provided `sequencerTxn` number explicitly.

`ALTER TABLE RESUME WAL` is used to restart WAL table transactions after
resolving errors. When transactions are stopped, the `suspended` status from the
[`wal_tables()`](/docs/reference/function/meta/#wal_tables) function is marked as
`true`, and the `sequencerTxn` value indicates the last successful commit in the
Sequencer. Once the error is resolved, `ALTER TABLE RESUME WAL` restarts the
suspended WAL transactions from the failed transaction. Alternatively, an
optional `sequencerTxn` value can be provided to skip the failed transaction.

## Examples

Using the [`wal_tables()`](/docs/reference/function/meta/#wal_tables) function to
investigate the table status:

```questdb-sql title="List all tables"
wal_tables();
```

| name        | suspended | writerTxn | sequencerTxn |
| ----------- |-----------|-----------|--------------|
| sensor_wal  | false     | 6         | 6            |
| weather_wal | true      | 3         | 5            |

The table `weather_wal` is suspended. The last successful commit in the
table is `3`.

The following query restarts transactions from the failed transaction, `4`:

```questdb-sql
ALTER TABLE  weather_wal RESUME WAL;
```

Alternatively, specifying the `sequencerTxn` to skip the failed commit (`4` in
this case):

```questdb-sql
ALTER TABLE  weather_wal RESUME WAL FROM TRANSACTION 5;

-- This is equivalent to

ALTER TABLE  weather_wal RESUME WAL FROM TXN 5;
```
