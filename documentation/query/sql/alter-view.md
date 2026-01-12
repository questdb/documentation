---
title: ALTER VIEW
sidebar_label: ALTER VIEW
description: Documentation for the ALTER VIEW SQL keyword in QuestDB.
---

Modifies an existing view's definition. The view must exist before it can be
altered.

For more information on views, see the [Views](/docs/concepts/views/)
documentation.

## Syntax

```questdb-sql
ALTER VIEW view_name AS ( query )
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `view_name` | Name of the existing view to modify |
| `query` | New SELECT statement defining the view |

## Examples

### Change view query

```questdb-sql title="Alter view definition"
-- Original view
CREATE VIEW summary AS (
  SELECT ts, symbol, max(price) as max_price
  FROM trades
  SAMPLE BY 1h
)

-- Alter to change aggregation
ALTER VIEW summary AS (
  SELECT ts, symbol, avg(price) as avg_price
  FROM trades
  SAMPLE BY 1h
)
```

### Add columns to view

```questdb-sql title="Expand view columns"
-- Original view
CREATE VIEW trade_view AS (
  SELECT ts, symbol, price FROM trades
)

-- Add volume column
ALTER VIEW trade_view AS (
  SELECT ts, symbol, price, quantity FROM trades
)
```

### Change filtering

```questdb-sql title="Modify view filter"
-- Original view
CREATE VIEW filtered AS (
  SELECT * FROM trades WHERE price > 100
)

-- Change filter threshold
ALTER VIEW filtered AS (
  SELECT * FROM trades WHERE price > 200
)
```

### Update parameterized view

```questdb-sql title="Modify parameterized view"
-- Original view with parameter
CREATE VIEW by_price AS (
  DECLARE @min := 0
  SELECT * FROM trades WHERE price >= @min
)

-- Change default value
ALTER VIEW by_price AS (
  DECLARE @min := 100
  SELECT * FROM trades WHERE price >= @min
)
```

### Add parameters to existing view

```questdb-sql title="Add DECLARE to view"
-- Original view without parameters
CREATE VIEW trades_filtered AS (
  SELECT * FROM trades WHERE price > 100
)

-- Add parameter
ALTER VIEW trades_filtered AS (
  DECLARE @threshold := 100
  SELECT * FROM trades WHERE price > @threshold
)
```

## Errors

| Error | Cause |
| ----- | ----- |
| `view does not exist [view=name]` | View with specified name doesn't exist |
| `table does not exist [table=name]` | Referenced table in new query doesn't exist |
| `Invalid column` | Column in new query doesn't exist |
| `circular dependency detected` | New definition would create circular reference |
| `Access denied [ALTER VIEW on view_name]` | User lacks `ALTER VIEW` permission (Enterprise) |
| `Access denied [SELECT on table_name]` | User lacks SELECT on tables in new definition (Enterprise) |

## Behavior

- Altering a view replaces its entire definition
- The new query must be valid at the time of alteration
- Dependent views may become invalid if the altered view's output changes
- Use `CREATE OR REPLACE VIEW` as an alternative if you want to create the view
  when it doesn't exist

### Definer permissions transfer (Enterprise)

When a user alters a view, the view's **definer permissions** transfer to that
user. This means:

- The view now runs with the permissions of the user who performed the ALTER
- Other users querying the view can access data the new definer has access to
- The original creator's permissions no longer apply to the view

```questdb-sql title="Definer transfer example"
-- UserA creates view on table1 (UserA has SELECT on table1)
-- UserA is the "definer"
CREATE VIEW my_view AS (SELECT * FROM table1);

-- UserB alters view to reference table2 (UserB has SELECT on table2)
-- UserB becomes the new "definer"
ALTER VIEW my_view AS (SELECT * FROM table2);

-- UserC (with SELECT on my_view) now sees table2 data
-- using UserB's permissions
SELECT * FROM my_view;
```

## Permissions (Enterprise)

Altering a view requires:

1. `ALTER VIEW` permission on the view
2. `SELECT` permission on all tables referenced in the **new** definition

```questdb-sql
-- Grant ALTER VIEW permission
GRANT ALTER VIEW ON my_view TO username;
```

You cannot use `ALTER VIEW` to access tables you don't have permission for:

```questdb-sql
-- This fails if user doesn't have SELECT on secret_table
ALTER VIEW my_view AS (SELECT * FROM secret_table);
-- Error: Access denied for username [SELECT on secret_table]
```

## See also

- [Views concept](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [DROP VIEW](/docs/query/sql/drop-view/)
- [COMPILE VIEW](/docs/query/sql/compile-view/)
