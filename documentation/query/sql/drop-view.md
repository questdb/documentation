---
title: DROP VIEW
sidebar_label: DROP VIEW
description: Documentation for the DROP VIEW SQL keyword in QuestDB.
---

Removes a view from the database. The view definition is deleted, but underlying
tables are not affected.

For more information on views, see the [Views](/docs/concepts/views/)
documentation.

## Syntax

```questdb-sql
DROP VIEW [ IF EXISTS ] view_name
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `IF EXISTS` | Prevents error if view doesn't exist |
| `view_name` | Name of the view to drop |

## Examples

### Drop a view

```questdb-sql title="Drop view"
DROP VIEW my_view
```

### Drop if exists

To avoid errors when the view might not exist:

```questdb-sql title="Drop view if it exists"
DROP VIEW IF EXISTS my_view
```

### Drop multiple views

Views must be dropped one at a time:

```questdb-sql title="Drop multiple views"
DROP VIEW view1;
DROP VIEW view2;
DROP VIEW view3;
```

## Behavior

- Dropping a view does not affect the underlying tables
- Dependent views (views that reference the dropped view) become invalid
- The view can be recreated later with the same or different definition

### Effect on dependent views

When a view is dropped, any views that reference it become invalid:

```questdb-sql title="Dependent view invalidation"
-- Create view hierarchy
CREATE VIEW level1 AS (SELECT * FROM trades WHERE price > 0);
CREATE VIEW level2 AS (SELECT * FROM level1 WHERE quantity > 0);

-- Drop base view
DROP VIEW level1;

-- level2 is now invalid
SELECT view_status FROM views() WHERE view_name = 'level2';
-- Returns: invalid
```

If the dropped view is later recreated, dependent views automatically become
valid again.

## Errors

| Error | Cause |
| ----- | ----- |
| `view does not exist` | View doesn't exist and `IF EXISTS` not specified |

## See also

- [Views concept](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [ALTER VIEW](/docs/query/sql/alter-view/)
- [COMPILE VIEW](/docs/query/sql/compile-view/)
