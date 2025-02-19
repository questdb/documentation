---
title: REFRESH MATERIALIZED VIEW
sidebar_label: REFRESH MATERIALIZED VIEW
description: Documentation for the REFRESH MATERIALIZED VIEW SQL keyword in QuestDB.
---

`REFRESH MATERIALIZED VIEW` refreshes the given materialized view. Helpful in situations when the view is invalid and no longer refreshes incrementally.

When the FULL keyword is specified, this command deletes the data in the target
materialized view and inserts the results of the query into the view. It also marks
the materialized view as valid, so that it activates the incremental refresh.

With the `INCREMENTAL` keyword, the `REFRESH` command schedules an incremental
refresh of the materialized view. Usually, incremental refresh is automatic, so
this command is useful only in niche situations when incremental refresh is no
longer happening due to a problem.

## Syntax

![Flow chart showing the syntax of the REFRESH MATERIALIZED VIEW keyword](/images/docs/diagrams/refreshMatView.svg)

## Examples

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h FULL;
```

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h INCREMENTAL;
```

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
