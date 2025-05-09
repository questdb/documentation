---
title: REFRESH MATERIALIZED VIEW
sidebar_label: REFRESH MATERIALIZED VIEW
description:
  Documentation for the REFRESH MATERIALIZED VIEW SQL keyword in QuestDB.
---

:::info

Materialized View support is now generally available (GA) and ready for
production use.

If you are using versions earlier than `8.3.1`, we suggest you upgrade at your
earliest convenience.

:::

`REFRESH MATERIALIZED VIEW` refreshes a materialized view. This is helpful when
a view becomes invalid, and no longer refreshes incrementally.

When the `FULL` keyword is specified, this command deletes the data in the
target materialized view and inserts the results of the query into the view. It
also marks the materialized view as valid, reactivating the incremental refresh
processes.

When the `INCREMENTAL` keyword is used, the `REFRESH` command schedules an
incremental refresh of the materialized view. Usually, incremental refresh is
automatic, so this command is useful only in niche situations when incremental
refresh is not working as expected, but the view is still valid.

When the `INTERVAL` keyword is specified, this command refreshes the data in the
specified time interval only. This command is useful for a valid materialized
view with configured
[`REFRESH LIMIT`](/docs/reference/sql/alter-mat-view-set-refresh-limit/). That's
because inserted base table rows with timestamps older than the refresh limit
are ignored by incremental refresh, so interval refresh may be used to
recalculate materialized view on older rows. Interval refresh does not affect
incremental refresh, e.g. it does not update the last base table transaction
used by incremental refresh.

## Syntax

![Flow chart showing the syntax of the REFRESH MATERIALIZED VIEW keyword](/images/docs/diagrams/refreshMatView.svg)

## Examples

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h FULL;
```

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h INCREMENTAL;
```

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h INTERVAL FROM '2025-05-05T01:00:00.000000Z' TO '2025-05-05T02:00:00.000000Z';
```

## See also

For more information on the concept, see the the
[introduction](/docs/concept/mat-views/) and [guide](/docs/guides/mat-views/) on
materialized views.
