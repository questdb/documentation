---
title: REFRESH MATERIALIZED VIEW keyword
sidebar_label: REFRESH MATERIALIZED VIEW
description: REFRESH MATERIALIZED VIEW SQL keyword reference documentation.
---

`REFRESH MATERIALIZED VIEW` refreshes the given materialized view. It is very
helpful in situations when the view got invalid and is not longer refreshed
incrementally.

## Syntax

![Flow chart showing the syntax of the REFRESH MATERIALIZED VIEW keyword](/images/docs/diagrams/refreshMatView.svg)

## Description

When the FULL keyword is specified, this command deletes the data in the target
materialized view and inserts results of the query into the view. It also marks
the materialized view as valid, so that incremental refresh starts working for
it.

With the INCREMENTAL keyword, the REFRESH command schedules an incremental
refresh of the materialized view. Usually, incremental refresh is automatic, so
this command is useful only in niche situations when incremental refresh is no
longer happening due to a problem.

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
