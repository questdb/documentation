---
title: DROP MATERIALIZED VIEW
sidebar_label: DROP MATERIALIZED VIEW
description:
  Documentation for the DROP MATERIALIZED VIEW SQL keyword in QuestDB.
---

`DROP MATERIALIZED VIEW` permanently deletes a materialized view and its
contents.

The deletion is **permanent** and **not recoverable**, except if the view was
created in a non-standard volume. In such cases, the view is only logically removed while the underlying data
remains intact in its volume.

Disk space is reclaimed asynchronously after the materialized view is dropped.

Existing read queries for this view may delay space reclamation.

## Syntax

![Flow chart showing the syntax of the DROP MATERIALIZED VIEW keyword](/images/docs/diagrams/dropMatView.svg)

## Example

```questdb-sql
DROP MATERIALIZED VIEW trades_1h;
```

## IF EXISTS

Add an optional `IF EXISTS` clause after the `DROP MATERIALIZED VIEW` keywords
to indicate that the selected materialized view should be dropped, but only if
it exists.

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
