# Database Views

Views are **virtual tables** defined by a SQL `SELECT` statement. They do not store data themselves; instead, their defining query is executed as a sub-query whenever the view is referenced.

## Creating Views

### Basic Syntax

```sql
CREATE VIEW view_name AS (query)
```

### Examples

**Simple view on a table:**
```sql
CREATE VIEW daily_prices AS (
  SELECT ts, symbol, last(price) as closing_price
  FROM trades
  SAMPLE BY 1d
)
```

**View with filtering:**
```sql
CREATE VIEW high_value_trades AS (
  SELECT ts, symbol, price, quantity
  FROM trades
  WHERE price * quantity > 10000
)
```

**View referencing another view:**
```sql
CREATE VIEW weekly_summary AS (
  SELECT date_trunc('week', ts) as week, avg(closing_price) as avg_price
  FROM daily_prices
)
```

**View with JOINs:**
```sql
CREATE VIEW enriched_trades AS (
  SELECT t.ts, t.symbol, t.price, m.name as company_name
  FROM trades t
  JOIN metadata m ON t.symbol = m.symbol
)
```

**View with UNION:**
```sql
CREATE VIEW all_markets AS (
  SELECT ts, symbol, price FROM nyse_trades
  UNION
  SELECT ts, symbol, price FROM nasdaq_trades
)
```

### CREATE IF NOT EXISTS

To avoid errors when the view already exists:

```sql
CREATE VIEW IF NOT EXISTS price_view AS (
  SELECT symbol, last(price) as price FROM trades SAMPLE BY 1h
)
```

### CREATE OR REPLACE

To update an existing view or create it if it doesn't exist:

```sql
CREATE OR REPLACE VIEW price_view AS (
  SELECT symbol, last(price) as price, ts FROM trades SAMPLE BY 1h
)
```

## Altering Views

To modify an existing view's definition:

```sql
ALTER VIEW view_name AS (new_query)
```

**Example:**
```sql
-- Original view
CREATE VIEW summary AS (SELECT ts, k, max(v) as v_max FROM table1 WHERE v > 5)

-- Alter to change aggregation
ALTER VIEW summary AS (SELECT ts, k, min(v) as v_min FROM table1 WHERE v > 6)
```

## Dropping Views

```sql
DROP VIEW view_name
```

To avoid errors when the view doesn't exist:

```sql
DROP VIEW IF EXISTS view_name
```

## Querying Views

Views are queried exactly like tables:

```sql
SELECT * FROM my_view

SELECT ts, price FROM my_view WHERE symbol = 'AAPL'

SELECT v1.ts, v2.value
FROM view1 v1
JOIN view2 v2 ON v1.id = v2.id
```

### Using Aliases

```sql
SELECT v.ts, v.price FROM price_view v WHERE v.price > 100
```

### Filter Push-down

Filters applied to views are pushed down to the underlying tables for optimal performance:

```sql
-- View definition
CREATE VIEW trades_view AS (
  SELECT ts, symbol, max(price) as max_price FROM trades WHERE price > 0
)

-- Query with additional filter - filter is pushed to the base table
SELECT * FROM trades_view WHERE symbol = 'AAPL'
-- Equivalent to: SELECT ts, symbol, max(price) FROM trades WHERE price > 0 AND symbol = 'AAPL'
```

## Parameterized Views with DECLARE

Views support the `DECLARE` statement to define parameters with default values that can be overridden at query time.

### Creating a Parameterized View

```sql
CREATE VIEW filtered_trades AS (
  DECLARE @min_price := 100
  SELECT ts, symbol, price FROM trades WHERE price >= @min_price
)
```

### Querying with Default Parameters

```sql
SELECT * FROM filtered_trades
-- Uses default @min_price = 100
```

### Overriding Parameters

```sql
DECLARE @min_price := 500 SELECT * FROM filtered_trades
-- Overrides @min_price to 500
```

### Multiple Parameters

```sql
CREATE VIEW price_range AS (
  DECLARE @lo := 100, @hi := 1000
  SELECT ts, symbol, price FROM trades WHERE price >= @lo AND price <= @hi
)

-- Query with custom range
DECLARE @lo := 50, @hi := 200 SELECT * FROM price_range
```

### CONST Parameters (Cannot Be Overridden)

Use `CONST` to prevent parameter override:

```sql
CREATE VIEW secure_view AS (
  DECLARE CONST @min_value := 0
  SELECT * FROM trades WHERE value >= @min_value
)

-- This will fail with "cannot override CONST variable: @min_value"
DECLARE @min_value := -100 SELECT * FROM secure_view
```

### Mixed CONST and Non-CONST Parameters

```sql
CREATE VIEW mixed_params AS (
  DECLARE CONST @fixed := 5, @adjustable := 10
  SELECT * FROM data WHERE a >= @fixed AND b <= @adjustable
)

-- @adjustable can be overridden, @fixed cannot
DECLARE @adjustable := 20 SELECT * FROM mixed_params  -- OK
DECLARE @fixed := 0 SELECT * FROM mixed_params        -- ERROR
```

## View Management

### Listing Views

```sql
SELECT * FROM views()
```

Returns:
| Column | Description |
|--------|-------------|
| `view_name` | Name of the view |
| `view_sql` | The SQL definition |
| `view_table_dir_name` | Internal directory name |
| `invalidation_reason` | Error message if view is invalid |
| `view_status` | `valid` or `invalid` |
| `view_status_update_time` | Timestamp of last status change |

### Show View Definition

```sql
SHOW CREATE VIEW view_name
```

Returns the `CREATE VIEW` statement that would recreate the view.

### Show View Columns

```sql
SHOW COLUMNS FROM view_name
```

### Compile View (Manual Validation)

Force recompilation to check if a view is valid:

```sql
COMPILE VIEW view_name
```

## View Invalidation

Views are automatically invalidated when their dependencies change:

| Operation | Effect |
|-----------|--------|
| `DROP TABLE` | View becomes invalid |
| `RENAME TABLE` | View becomes invalid |
| `DROP COLUMN` | View becomes invalid if column is referenced |
| `RENAME COLUMN` | View becomes invalid if column is referenced |
| Column type change | View metadata is updated |

### Automatic Recovery

Views are automatically revalidated when the invalidating condition is reversed:
- If a table is dropped and later recreated, dependent views become valid again
- If a column is renamed back to its original name, dependent views become valid again

### Checking View Status

```sql
SELECT view_name, view_status, invalidation_reason
FROM views()
WHERE view_status = 'invalid'
```

## Views in tables() Output

Views appear in the `tables()` function with `table_type = 'V'`:

```sql
SELECT table_name, table_type FROM tables()
```

| table_type | Description |
|------------|-------------|
| `T` | Regular table |
| `V` | View |
| `M` | Materialized view |

## Unicode Support

View and table names support Unicode characters:

```sql
CREATE VIEW 股票 AS (SELECT * FROM trades)
CREATE VIEW Részvény_árak AS (SELECT * FROM prices)
```

## Specifying Timestamp Column

When a view's result doesn't have an obvious designated timestamp, you can specify one:

```sql
CREATE VIEW with_timestamp AS (
  (SELECT ts, value FROM view1 ORDER BY ts) timestamp(ts)
)
```

## Limitations

1. **No Data Storage**: Views don't store data - the query runs each time
2. **No Indexes**: Views cannot have indexes; filtering relies on underlying table indexes
3. **Circular References**: Views cannot reference themselves or create circular dependencies
4. **DDL Operations**: You cannot run DDL operations (like `RENAME TABLE`) on views

## Best Practices

1. **Use views for complex queries** that are executed frequently
2. **Leverage filter push-down** by keeping view definitions simple
3. **Use parameterized views** for reusable queries with variable filters
4. **Monitor view status** to catch invalidation early
5. **Name views clearly** to indicate their purpose

