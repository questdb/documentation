# Views SQL Reference

Complete SQL syntax reference for database views in QuestDB.

## CREATE VIEW

Creates a new view.

### Syntax

```sql
CREATE VIEW [IF NOT EXISTS] view_name AS (query)

CREATE OR REPLACE VIEW view_name AS (query)
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `IF NOT EXISTS` | Prevents error if view already exists |
| `OR REPLACE` | Replaces existing view or creates new one |
| `view_name` | Name of the view (case-insensitive, Unicode supported) |
| `query` | SELECT statement defining the view |

### Examples

```sql
-- Basic view
CREATE VIEW my_view AS (SELECT * FROM my_table)

-- With IF NOT EXISTS
CREATE VIEW IF NOT EXISTS my_view AS (SELECT * FROM my_table)

-- With OR REPLACE
CREATE OR REPLACE VIEW my_view AS (SELECT * FROM my_table)

-- With aggregation
CREATE VIEW hourly_data AS (
  SELECT ts, symbol, sum(qty) as volume
  FROM trades
  SAMPLE BY 1h
)

-- With DECLARE parameters
CREATE VIEW parameterized AS (
  DECLARE @threshold := 100
  SELECT * FROM data WHERE value > @threshold
)

-- With DECLARE CONST
CREATE VIEW with_const AS (
  DECLARE CONST @fixed := 0, @adjustable := 100
  SELECT * FROM data WHERE id >= @fixed AND value <= @adjustable
)

-- Unicode view name
CREATE VIEW 日本語ビュー AS (SELECT * FROM data)
```

### Errors

| Error | Cause |
|-------|-------|
| `view already exists` | View exists and IF NOT EXISTS not specified |
| `table does not exist` | Referenced table doesn't exist |
| `Invalid column` | Column in query doesn't exist |
| `cycle detected` | View would create circular reference |

---

## ALTER VIEW

Modifies an existing view's definition.

### Syntax

```sql
ALTER VIEW view_name AS (query)
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `view_name` | Name of existing view to modify |
| `query` | New SELECT statement |

### Examples

```sql
-- Change view query
ALTER VIEW my_view AS (SELECT col1, col2 FROM my_table WHERE col1 > 0)

-- Change aggregation
ALTER VIEW summary AS (
  SELECT ts, avg(value) as avg_val  -- was sum(value)
  FROM data
  SAMPLE BY 1h
)
```

### Errors

| Error | Cause |
|-------|-------|
| `view does not exist` | View doesn't exist |
| Same errors as CREATE VIEW | Invalid query |

---

## DROP VIEW

Removes a view.

### Syntax

```sql
DROP VIEW [IF EXISTS] view_name
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `IF EXISTS` | Prevents error if view doesn't exist |
| `view_name` | Name of view to drop |

### Examples

```sql
-- Drop view
DROP VIEW my_view

-- Drop if exists
DROP VIEW IF EXISTS my_view
```

### Errors

| Error | Cause |
|-------|-------|
| `view does not exist` | View doesn't exist and IF EXISTS not specified |

---

## COMPILE VIEW

Forces recompilation of a view to validate its definition.

### Syntax

```sql
COMPILE VIEW view_name
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `view_name` | Name of view to compile |

### Examples

```sql
-- Validate view
COMPILE VIEW my_view
```

### Behavior

- If view compiles successfully: status becomes `valid`
- If view fails to compile: status becomes `invalid`, reason stored in `invalidation_reason`

---

## SHOW CREATE VIEW

Returns the DDL statement to recreate a view.

### Syntax

```sql
SHOW CREATE VIEW view_name
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `view_name` | Name of view |

### Output

| Column | Type | Description |
|--------|------|-------------|
| `ddl` | VARCHAR | CREATE VIEW statement |

### Examples

```sql
SHOW CREATE VIEW my_view

-- Output:
-- ddl
-- CREATE VIEW 'my_view' AS (
-- SELECT * FROM my_table
-- );
```

---

## views()

Table-valued function returning all views.

### Syntax

```sql
SELECT * FROM views()
```

### Output Columns

| Column | Type | Description |
|--------|------|-------------|
| `view_name` | VARCHAR | Name of the view |
| `view_sql` | VARCHAR | SQL definition (without CREATE VIEW wrapper) |
| `view_table_dir_name` | VARCHAR | Internal directory name |
| `invalidation_reason` | VARCHAR | Error message if invalid, empty if valid |
| `view_status` | VARCHAR | `valid` or `invalid` |
| `view_status_update_time` | TIMESTAMP | Last status change timestamp |

### Examples

```sql
-- List all views
SELECT * FROM views()

-- Find invalid views
SELECT view_name, invalidation_reason
FROM views()
WHERE view_status = 'invalid'

-- Order by name
SELECT * FROM views() ORDER BY view_name
```

---

## DECLARE

Defines parameters with default values for views.

### Syntax (in view definition)

```sql
CREATE VIEW view_name AS (
  DECLARE [@var := value] [, @var2 := value2] ...
  SELECT ...
)
```

### Syntax (when querying)

```sql
DECLARE @var := value [, @var2 := value2] ...
SELECT * FROM view_name
```

### CONST Modifier

```sql
DECLARE CONST @var := value
```

Prevents the variable from being overridden at query time.

### Examples

```sql
-- View with parameter
CREATE VIEW filtered AS (
  DECLARE @min := 0
  SELECT * FROM data WHERE value >= @min
)

-- Query with default
SELECT * FROM filtered  -- uses @min = 0

-- Query with override
DECLARE @min := 100 SELECT * FROM filtered

-- CONST parameter
CREATE VIEW secure AS (
  DECLARE CONST @base := 0
  SELECT * FROM data WHERE id >= @base
)

-- This fails:
-- DECLARE @base := -1 SELECT * FROM secure
-- Error: cannot override CONST variable: @base

-- Mixed CONST and regular
CREATE VIEW mixed AS (
  DECLARE CONST @fixed := 0, @adjustable := 100
  SELECT * FROM data WHERE id >= @fixed AND value <= @adjustable
)

-- @adjustable can be overridden, @fixed cannot
DECLARE @adjustable := 50 SELECT * FROM mixed  -- OK
```

---

## Querying Views

Views are queried like tables.

### Basic Query

```sql
SELECT * FROM view_name
SELECT col1, col2 FROM view_name
SELECT * FROM view_name WHERE condition
```

### With Alias

```sql
SELECT v.col1, v.col2 FROM view_name v WHERE v.col1 > 0
```

### With JOIN

```sql
SELECT v.*, t.extra
FROM view_name v
JOIN other_table t ON v.id = t.id
```

### With SAMPLE BY

```sql
SELECT ts, avg(value) FROM view_name SAMPLE BY 1h
```

### With Explicit Timestamp

```sql
(SELECT * FROM view_name ORDER BY ts) timestamp(ts)
```

---

## View in tables()

Views appear in the `tables()` function with specific characteristics.

### Output for Views

| Column | Value for Views |
|--------|-----------------|
| `table_name` | View name |
| `table_type` | `V` |
| `designatedTimestamp` | Empty or from query |
| `partitionBy` | `N/A` |
| `walEnabled` | `true` |

### Example

```sql
SELECT table_name, table_type FROM tables() WHERE table_type = 'V'
```

---

## Reserved Names

View names cannot:
- Be the same as an existing table name
- Be the same as an existing materialized view name
- Use reserved SQL keywords without quoting

### Quoting Names

```sql
CREATE VIEW 'select' AS (...)  -- Quoted reserved word
CREATE VIEW "My View" AS (...)  -- Quoted with spaces
```
