---
title: ALTER VIEW
sidebar_label: ALTER VIEW
description: Documentation for the ALTER VIEW SQL keyword in QuestDB.
---

Modifies an existing view's definition. The view must exist before it can be
altered.

For more information on views, see the [Views](/docs/concept/views/)
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
| `view does not exist` | View with specified name doesn't exist |
| `table does not exist` | Referenced table in new query doesn't exist |
| `Invalid column` | Column in new query doesn't exist |
| `cycle detected` | New definition would create circular reference |

## Notes

- Altering a view replaces its entire definition
- The new query must be valid at the time of alteration
- Dependent views may become invalid if the altered view's output changes
- Use `CREATE OR REPLACE VIEW` as an alternative if you want to create the view
  when it doesn't exist

## See also

- [Views concept](/docs/concept/views/)
- [CREATE VIEW](/docs/reference/sql/create-view/)
- [DROP VIEW](/docs/reference/sql/drop-view/)
- [COMPILE VIEW](/docs/reference/sql/compile-view/)
