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

:::

## Description

If you're interested in storing and analyzing only recent data with QuestDB, you
can configure a time-to-live for the table data using `ALTER TABLE SET TTL`.
Follow the `TTL` keyword with a number and a time unit, one of `HOURS`, `DAYS`,
`WEEKS`, `MONTHS` or `YEARS`. The last two units are flexible: they match the
same date in a future month. The first three are fixed time periods. QuestDB
accepts both the singular and plural form of these units. It also accepts
shorthand syntax, like `3H` or `2M`.

Keep in mind that the TTL feature is designed only to limit the stored data
size, and doesn't have strict semantics. It works at the granularity of
partitions, and a partition is eligible for eviction once the entire time period
it's responsible for falls behind the TTL deadline. QuestDB measures the age of
the data relative to the most recent timestamp in the table, so the data doesn't
become stale just through the passage of time.

Refer to the [section on TTL](/docs/concept/ttl) for more details.

## Examples

Set the TTL to 3 weeks:

```sql
ALTER TABLE weather SET TTL 3 WEEKS;
```

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

```sql
ALTER TABLE weather SET TTL 12H;
```
