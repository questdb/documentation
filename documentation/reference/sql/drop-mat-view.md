---
title: DROP MATERIALIZED VIEW keyword
sidebar_label: DROP MATERIALIZED VIEW
description: DROP MATERIALIZED VIEW SQL keyword reference documentation.
---

`DROP MATERIALIZED VIEW` permanently deletes a materialized view and its
contents.

## Syntax

![Flow chart showing the syntax of the DROP MATERIALIZED VIEW keyword](/images/docs/diagrams/dropMatView.svg)

### IF EXISTS

An optional `IF EXISTS` clause may be added directly after the
`DROP MATERIALIZED VIEW` keywords to indicate that the selected materialized
view should be dropped if it exists.

## Description

This command irremediably deletes the data in the target materialized view.
Unless the view was created in a different volume than the standard, in which
case the table is only logically removed and data remains intact in its volume.

Disk space is reclaimed asynchronously after the materialized view is dropped.
Ongoing view reads might delay space reclamation.

## Example

```questdb-sql
DROP MATERIALIZED VIEW trades_1h;
```

## See also

For more information on the concept, see the
[reference](/docs/concept/mat-views/) on materialized views.
