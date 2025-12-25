---
title: Views
sidebar_label: Views
description:
  Views are virtual tables defined by SQL SELECT statements. Learn how to create,
  query, and manage views in QuestDB for query reusability and abstraction.
---

A view is a **virtual table** defined by a SQL `SELECT` statement. Views do not
store data themselves; instead, their defining query is executed as a sub-query
whenever the view is referenced.

## What are views for?

Views provide several benefits:

- **Abstraction**: Hide complex queries behind simple table-like interfaces
- **Reusability**: Define queries once, use them everywhere
- **Security**: Control data access without exposing underlying tables
- **Maintainability**: Single source of truth for business logic

```questdb-sql title="Quick example"
-- Create a view
CREATE VIEW hourly_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
);

-- Query the view like a table
SELECT * FROM hourly_summary WHERE symbol = 'AAPL';
```

## Creating views

Use `CREATE VIEW` to define a new view:

```questdb-sql title="Basic view"
CREATE VIEW daily_prices AS (
  SELECT ts, symbol, last(price) as closing_price
  FROM trades
  SAMPLE BY 1d
)
```

### CREATE IF NOT EXISTS

To avoid errors when the view already exists:

```questdb-sql
CREATE VIEW IF NOT EXISTS price_view AS (
  SELECT symbol, last(price) as price FROM trades SAMPLE BY 1h
)
```

### CREATE OR REPLACE

To update an existing view or create it if it doesn't exist:

```questdb-sql
CREATE OR REPLACE VIEW price_view AS (
  SELECT symbol, last(price) as price, ts FROM trades SAMPLE BY 1h
)
```

For full syntax details, see
[CREATE VIEW](/docs/reference/sql/create-view/).

## Querying views

Views are queried exactly like tables:

```questdb-sql
SELECT * FROM my_view

SELECT ts, price FROM my_view WHERE symbol = 'AAPL'

SELECT v1.ts, v2.value
FROM view1 v1
JOIN view2 v2 ON v1.id = v2.id
```

### Optimizer transparency

Views in QuestDB are fully transparent to the query optimizer. When you query a
view, the optimizer treats it exactly as if you had written the view's query
inline as a sub-query. This means views benefit from the complete suite of
query optimizations:

- **Filter push-down**: WHERE conditions are pushed to base tables
- **Projection push-down**: Only required columns are read from storage
- **Join optimization**: Join order and strategies are optimized across view boundaries
- **ORDER BY optimization**: Sorting can leverage table indexes
- **Timestamp optimizations**: Time-based operations use partition pruning

```questdb-sql
-- View definition
CREATE VIEW trades_view AS (
  SELECT ts, symbol, price, quantity FROM trades WHERE price > 0
)

-- This query is optimized as if written inline
SELECT ts, price FROM trades_view WHERE symbol = 'AAPL' ORDER BY ts
-- Optimizer sees: SELECT ts, price FROM trades WHERE price > 0 AND symbol = 'AAPL' ORDER BY ts
-- Only ts and price columns are read, filters applied at scan, ordering uses index
```

Use `EXPLAIN` to see how the optimizer processes view queries:

```questdb-sql
EXPLAIN SELECT * FROM trades_view WHERE symbol = 'AAPL'
```

There is no performance penalty for using views compared to writing equivalent
sub-queries directly.

## Parameterized views

Views support the `DECLARE` statement to define parameters with default values
that can be overridden at query time.

### Creating a parameterized view

```questdb-sql
CREATE VIEW filtered_trades AS (
  DECLARE @min_price := 100
  SELECT ts, symbol, price FROM trades WHERE price >= @min_price
)
```

### Querying with default parameters

```questdb-sql
SELECT * FROM filtered_trades
-- Uses default @min_price = 100
```

### Overriding parameters

```questdb-sql
DECLARE @min_price := 500 SELECT * FROM filtered_trades
-- Overrides @min_price to 500
```

### Multiple parameters

```questdb-sql
CREATE VIEW price_range AS (
  DECLARE @lo := 100, @hi := 1000
  SELECT ts, symbol, price FROM trades WHERE price >= @lo AND price <= @hi
)

-- Query with custom range
DECLARE @lo := 50, @hi := 200 SELECT * FROM price_range
```

### CONST parameters

Use `CONST` to prevent parameter override:

```questdb-sql
CREATE VIEW secure_view AS (
  DECLARE CONST @min_value := 0
  SELECT * FROM trades WHERE value >= @min_value
)

-- This will fail with "cannot override CONST variable: @min_value"
DECLARE @min_value := -100 SELECT * FROM secure_view
```

## View hierarchies

Views can reference other views, tables, and materialized views:

```questdb-sql
-- Level 1: Raw data filtering
CREATE VIEW valid_trades AS (
  SELECT * FROM trades WHERE price > 0 AND quantity > 0
)

-- Level 2: Aggregation
CREATE VIEW hourly_stats AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM valid_trades
  SAMPLE BY 1h
)

-- Level 3: Derived metrics
CREATE VIEW hourly_vwap AS (
  SELECT ts, symbol, volume, turnover / volume as vwap
  FROM hourly_stats
  WHERE volume > 0
)
```

:::tip

Keep view hierarchies shallow (3-4 levels maximum) for better query planning
and maintainability.

:::

## View management

### Listing views

```questdb-sql
SELECT * FROM views()
```

Returns:

| Column | Description |
| ------ | ----------- |
| `view_name` | Name of the view |
| `view_sql` | The SQL definition |
| `view_table_dir_name` | Internal directory name |
| `invalidation_reason` | Error message if view is invalid |
| `view_status` | `valid` or `invalid` |
| `view_status_update_time` | Timestamp of last status change |

### Show view definition

```questdb-sql
SHOW CREATE VIEW my_view
```

Returns the `CREATE VIEW` statement that would recreate the view.

### Show view columns

```questdb-sql
SHOW COLUMNS FROM my_view
```

### Altering views

To modify an existing view's definition:

```questdb-sql
ALTER VIEW my_view AS (SELECT col1, col2 FROM my_table WHERE col1 > 0)
```

For full syntax, see [ALTER VIEW](/docs/reference/sql/alter-view/).

### Dropping views

```questdb-sql
DROP VIEW my_view

-- Or safely:
DROP VIEW IF EXISTS my_view
```

For full syntax, see [DROP VIEW](/docs/reference/sql/drop-view/).

### Compiling views

Force recompilation to validate a view:

```questdb-sql
COMPILE VIEW my_view
```

For full syntax, see [COMPILE VIEW](/docs/reference/sql/compile-view/).

## View invalidation

Views are automatically invalidated when their dependencies change:

| Operation | Effect |
| --------- | ------ |
| `DROP TABLE` | View becomes invalid |
| `RENAME TABLE` | View becomes invalid |
| `DROP COLUMN` | View becomes invalid if column is referenced |
| `RENAME COLUMN` | View becomes invalid if column is referenced |
| Column type change | View metadata is updated |

### Automatic recovery

Views are automatically revalidated when the invalidating condition is reversed:

- If a table is dropped and later recreated, dependent views become valid again
- If a column is renamed back to its original name, dependent views become valid
  again

### Checking view status

```questdb-sql
SELECT view_name, view_status, invalidation_reason
FROM views()
WHERE view_status = 'invalid'
```

## Views in tables() output

Views appear in the `tables()` function with `table_type = 'V'`:

```questdb-sql
SELECT table_name, table_type FROM tables()
```

| table_type | Description |
| ---------- | ----------- |
| `T` | Regular table |
| `V` | View |
| `M` | Materialized view |

## Views vs materialized views

Understanding when to use each type is important for performance:

| Feature | View | Materialized View |
| ------- | ---- | ----------------- |
| Data storage | None (virtual) | Physical storage |
| Query execution | On every access | Pre-computed |
| Data freshness | Always current | Depends on refresh |
| Performance | Query-time cost | Read-time benefit |
| Storage cost | Zero | Proportional to result size |

### When to use views

- Simple transformations that execute quickly
- Data that must always be current
- Ad-hoc analysis where requirements change frequently
- Parameterized queries with `DECLARE`
- Low-frequency queries

### When to use materialized views

- Heavy aggregations over large datasets
- Frequently accessed summary data
- Dashboard queries that run repeatedly
- Historical summaries that don't need real-time accuracy

For detailed comparisons and examples, see
[Materialized Views](/docs/concept/mat-views/).

## Security with views

Views provide a security boundary between users and underlying data. Users need
permission on the view only, not on underlying tables.

This allows you to:

- Expose specific data subsets to users
- Hide sensitive columns
- Enforce row-level security patterns
- Provide read-only access to aggregated data

### Column-level security example

```questdb-sql
-- Base table with sensitive data
CREATE TABLE employees (
  id LONG,
  name VARCHAR,
  salary DOUBLE,        -- Sensitive
  department VARCHAR,
  hire_date TIMESTAMP
);

-- View exposing only non-sensitive columns
CREATE VIEW employees_public AS (
  SELECT id, name, department, hire_date
  FROM employees
);

-- Grant access to public view only
GRANT SELECT ON employees_public TO analyst_role;
```

### Row-level security example

```questdb-sql
-- View for specific trading desk
CREATE VIEW desk_a_trades AS (
  SELECT * FROM trades WHERE trader_id IN (101, 102, 103)
);

GRANT SELECT ON desk_a_trades TO desk_a_users;
```

For more details on permissions, see
[Role-Based Access Control (RBAC)](/docs/operations/rbac/).

## Performance considerations

### Views don't cache results

Every query against a view executes the underlying query. For expensive
aggregations accessed frequently, consider materialized views.

### Optimize with indexes

Create indexes on base table columns used in view filters:

```questdb-sql
ALTER TABLE trades ALTER COLUMN symbol ADD INDEX
```

### Check query plans

Always examine query plans when optimizing:

```questdb-sql
EXPLAIN SELECT * FROM my_view WHERE symbol = 'AAPL'
```

### Best practices

- Use indexed columns in filters for best performance
- Use parameterized views for common filter patterns
- Avoid deeply nested view hierarchies (>3-4 levels) for maintainability
- Consider materialized views for expensive aggregations that run frequently

## Limitations

1. **No data storage**: Views don't store data - the query runs each time
2. **No indexes**: Views cannot have indexes; filtering relies on underlying
   table indexes
3. **Circular references**: Views cannot reference themselves or create circular
   dependencies
4. **Read-only**: You cannot INSERT, UPDATE, or DELETE on views
5. **No DDL operations**: You cannot run DDL operations (like `RENAME TABLE`) on
   views

## Related documentation

- **SQL Commands**
  - [`CREATE VIEW`](/docs/reference/sql/create-view/): Create a new view
  - [`ALTER VIEW`](/docs/reference/sql/alter-view/): Modify a view definition
  - [`DROP VIEW`](/docs/reference/sql/drop-view/): Remove a view
  - [`COMPILE VIEW`](/docs/reference/sql/compile-view/): Force view
    recompilation

- **Related Concepts**
  - [Materialized Views](/docs/concept/mat-views/): Pre-computed query results
  - [DECLARE](/docs/reference/sql/declare/): Parameter declaration for views
