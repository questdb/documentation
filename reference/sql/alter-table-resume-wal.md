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
[`wal_tables()`](/docs/reference/function/meta/#wal_tables) function is marked
as `true`, and the `sequencerTxn` value indicates the last successful commit in
the Sequencer. Once the error is resolved, `ALTER TABLE RESUME WAL` restarts the
suspended WAL transactions from the failed transaction. Alternatively, an
optional `sequencerTxn` value can be provided to skip the failed transaction.

## Examples

Using the [`wal_tables()`](/docs/reference/function/meta/#wal_tables) function
to investigate the table status:

```questdb-sql title="List all tables"
wal_tables();
```

| name   | suspended | writerTxn | sequencerTxn |
| ------ | --------- | --------- | ------------ |
| trades | true      | 3         | 5            |

The table `trades` is suspended. The last successful commit in the table is
`3`.

The following query restarts transactions from the failed transaction, `4`:

```questdb-sql
ALTER TABLE trades RESUME WAL;
```

Alternatively, specifying the `sequencerTxn` to skip the failed commit (`4` in
this case):

```questdb-sql
ALTER TABLE trades RESUME WAL FROM TRANSACTION 5;

-- This is equivalent to

ALTER TABLE trades RESUME WAL FROM TXN 5;
```

## Diagnosting corrupted WAL transactions

Sometimes a table may get suspended due to full disk or [kernel limits](/docs/deployment/capacity-planning/#os-configuration). In this case, a whole WAL segment may get corrupted. This means that there will be multiple transactions that rely on the corrupted segment and finding the transaction number to resume from may be complicated. When you run RESUME WAL on such suspended table, you may see an error like this one:

```
2024-07-10T01:01:01.131720Z C i.q.c.w.ApplyWal2TableJob job failed, table suspended [table=trades~3, error=could not open read-only [file=/home/my_user/.questdb/db/trades~3/wal45/101/_event], errno=2]
```

In such a case, you may try skipping all transactions that rely on the corrupted WAL segment. To do that, first you need to find the last applied transaction number for the `trades` table:

```questdb-sql
SELECT writerTxn
FROM wal_tables()
WHERE name = 'trades';
```

| writerTxn |
| --------- |
| 1223      |

Next, you need to query the problematic transaction number:

```questdb-sql
SELECT max(sequencertxn)
FROM wal_transactions('trades')
WHERE sequencertxn > 1223
  AND walId = 45
  AND segmentId = 101;
```

Here, `1223` stands for the last applied transaction number, `45` stands for the WAL ID that may be seen in the error log above (`trades~3/wal45`), and `101` stands for the WAL segment ID from the log (`trades~3/wal45/101`).

| max  |
| ---- |
| 1242 |

Since the maximum number of the problematic transactions is `1242`, you can now run resume operation for the `1243` transaction:

```questdb-sql
ALTER TABLE trades RESUME WAL FROM TXN 1243;
```

Notice that in rare cases subsequent transactions may also involve corrupted WAL segments, so you may have to repeat the process.
