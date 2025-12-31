---
title: ALTER MATERIALIZED VIEW SET TTL
sidebar_label: SET TTL
description:
  ALTER MATERIALIZED VIEW SET TTL SQL keyword reference documentation.
---

Sets the [time-to-live](/docs/concepts/ttl/) (TTL) period on a materialized view.

## Syntax

![Flow chart showing the syntax of ALTER MATERIALIZED VIEW SET TTL command](/images/docs/diagrams/alterMatViewSetTtl.svg)

## Description

To keep only recent aggregated data in a materialized view, configure a
time-to-live (TTL) period on the view using the
`ALTER MATERIALIZED VIEW SET TTL` command.

The value follows the same rules as the one in the
[`ALTER TABLE SET TTL`](/docs/query/sql/alter-table-set-ttl) command.

:::note

QuestDB drops data that exceeded its TTL only a whole partition at a time. For
this reason, the TTL period must be a whole number multiple of the view's
partition size.

:::

## Examples

Set the TTL to 3 days:

```sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET TTL 3 DAYS;
```

Set the TTL to 12 hours, using the shorthand syntax for the time unit:

```sql
ALTER MATERIALIZED VIEW trades_hourly_prices SET TTL 12h;
```
