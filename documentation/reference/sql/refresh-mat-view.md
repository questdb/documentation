---
title: REFRESH MATERIALIZED VIEW keyword
sidebar_label: REFRESH MATERIALIZED VIEW
description: REFRESH MATERIALIZED VIEW SQL keyword reference documentation.
---

`REFRESH MATERIALIZED VIEW` forcefully rebuilds the given materialized view. It
is very helpful in situations when the view got invalid and is not longer
refreshed incrementally.

## Syntax

![Flow chart showing the syntax of the REFRESH MATERIALIZED VIEW keyword](/images/docs/diagrams/refreshMatView.svg)

## Description

This command deletes the data in the target materialized view and inserts
results of the query into the view. It also marks the materialized view as
valid, so that incremental refresh starts working for it.

## Example

```questdb-sql
REFRESH MATERIALIZED VIEW trades_1h;
```

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
