---
title: ALTER TABLE SET TTL
sidebar_label: SET TTL
description: ALTER TABLE SET TTL SQL keyword reference documentation.
---

Sets the time-to-live period on a table.

:::info

## Syntax

![Flow chart showing the syntax of the ALTER TABLE keyword](/images/docs/diagrams/alterTable.svg)

![Flow chart showing the syntax of ALTER TABLE with SET TTL keyword](/images/docs/diagrams/setTtl.svg)

## Description

If you're interested in storing and analyzing only recent data with QuestDB, you
can configure a time-to-live for the table data using `ALTER TABLE SET TTL`.
Follow the `TTL` keyword with a number and a time unit, one of `HOURS`, `DAYS`,
`WEEKS`, `MONTHS` or `YEARS`. The last two units are flexible: they match the
same date in a future month. The first three are fixed time periods. QuestDB
accepts both the singular and plural form of these units. It also accepts
shorthand syntax, like `3H` or `2M`.

Note that QuestDB doesn't respect TTL as data semantics: as long as it's
physically present in the table, it appears in queries as well. QuestDB only
removes full partitions, and a partition is eligible for removal once the entire
time period it's responsible for falls behind the TTL deadline. QuestDB will
take action and remove stale partitions only during a data commit operation, so
if you don't add any new data, the stale data lingers on.

## Examples

Set the TTL to 3 weeks:

```sql
ALTER TABLE weather SET TTL 3 WEEKS;
```

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

```sql
ALTER TABLE weather SET TTL 12H;
```
