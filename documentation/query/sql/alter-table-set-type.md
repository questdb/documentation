---
title: ALTER TABLE SET TYPE
sidebar_label: SET TYPE
description: ALTER TABLE SET TYPE SQL keyword reference documentation.
---

Converts a non-WAL table to WAL, or a WAL table to non-WAL.

:::info

**Upgrading QuestDB?**

Apply table conversions separately from the version upgrade.

If upgrading, match the following sequence:

1. Convert/`ALTER` tables
2. Restart
3. Upgrade
4. Restart

:::

## Syntax

```questdb-sql
ALTER TABLE tableName SET TYPE [BYPASS] WAL;
```

## Description

The command schedules the conversion of the specified table to WAL or non-WAL
type. The actual conversion takes place on the next restart of the server.

For a table that may hold
[merge-append partitions](/docs/concepts/merge-append-partitions/), first set
`cairo.o3.partition.merge.append.enabled=false`, restart, and run
`ALTER TABLE trades SQUASH PARTITIONS`; only then issue
`ALTER TABLE trades SET TYPE BYPASS WAL` and restart again.
Skipping these steps is unsupported.

If the command is issued more than once before the restart, the last command
overrides all previous ones.

If the target type of the conversion is the same as the current type of the
table, the conversion request is ignored.

Since QuestDB 10.2.0 and QuestDB Enterprise 4.2.0, a conversion to non-WAL
loses no committed transaction: the restart first applies every transaction
still waiting in the WAL and flushes the table, then converts it. If that
cannot finish, because the table is suspended or a transaction fails to apply,
the conversion is refused: the table stays a WAL table, keeps its WAL and the
pending conversion, and the start logs a critical error (one line in the log,
wrapped here):

```text
could not apply the WAL before the conversion to non-WAL, the table stays a WAL
table; resume it, let it catch up and restart [table=..., seqTxn=...,
lastSeqTxn=..., suspended=...]
```

Resume the table with
[`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/), let the
WAL apply catch up, and restart: the next start tries the conversion again. If
a flush fails during the conversion, QuestDB stops, in every commit mode.

A non-WAL table gets no power-loss protection from
[adaptive commit mode](/docs/concepts/durability/): it behaves as in `nosync`.

## Examples

To convert a non-WAL table to WAL:

```sql
ALTER TABLE weather SET TYPE WAL;
-- now restart instance
```

To convert a WAL table to non-WAL:

```sql
ALTER TABLE weather SET TYPE BYPASS WAL;
-- now restart instance
```
