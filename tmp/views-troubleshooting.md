# Views Troubleshooting Guide

This guide helps diagnose and resolve common issues with database views in QuestDB.

## View Status Issues

### View Shows as "invalid"

**Symptoms:**
- `views()` shows `view_status = 'invalid'`
- `invalidation_reason` contains an error message
- Queries against the view fail

**Diagnosis:**
```sql
SELECT view_name, view_status, invalidation_reason
FROM views()
WHERE view_status = 'invalid'
```

**Common Causes and Solutions:**

#### 1. Table Does Not Exist

**Error:** `table does not exist [table=table_name]`

```sql
-- Check if table exists
SELECT * FROM tables() WHERE table_name = 'table_name'

-- Solutions:
-- A) Recreate the table
CREATE TABLE table_name (...)

-- B) Drop the view if table is no longer needed
DROP VIEW view_name

-- C) Alter view to use different table
ALTER VIEW view_name AS (SELECT ... FROM different_table)
```

#### 2. Invalid Column

**Error:** `Invalid column: column_name`

```sql
-- Check available columns
SHOW COLUMNS FROM table_name

-- Solutions:
-- A) Add the missing column back
ALTER TABLE table_name ADD COLUMN column_name TYPE

-- B) Rename column back
ALTER TABLE table_name RENAME COLUMN new_name TO column_name

-- C) Update view to use correct column
ALTER VIEW view_name AS (SELECT correct_column FROM table_name)
```

#### 3. Type Mismatch After Column Recreation

If a column was dropped and recreated with a different type:

```sql
-- View was created with column 'k' as SYMBOL
-- Column was dropped and recreated as VARCHAR
-- View metadata may be stale

-- Solution: Force recompilation
COMPILE VIEW view_name
```

### View is Valid but Query Fails

**Symptoms:**
- `view_status = 'valid'`
- But `SELECT * FROM view_name` throws an error

**Possible Causes:**
1. Recent schema change not yet detected
2. Permission issues
3. Runtime evaluation errors

**Solutions:**
```sql
-- Force view recompilation
COMPILE VIEW view_name

-- Check view status again
SELECT * FROM views() WHERE view_name = 'view_name'
```

## Creation Errors

### "view already exists"

```sql
-- Error: view already exists [view=view_name]

-- Solutions:
-- A) Use IF NOT EXISTS
CREATE VIEW IF NOT EXISTS view_name AS (...)

-- B) Use CREATE OR REPLACE
CREATE OR REPLACE VIEW view_name AS (...)

-- C) Drop first
DROP VIEW view_name;
CREATE VIEW view_name AS (...)
```

### "table does not exist" During Creation

```sql
-- Error during CREATE VIEW: table does not exist

-- Ensure referenced tables exist before creating view
SELECT * FROM tables() WHERE table_name = 'referenced_table'

-- Create table first if missing
CREATE TABLE referenced_table (...)
```

### "cannot create view: cycle detected"

**Error:** View creation would create circular dependency

```sql
-- This is not allowed:
CREATE VIEW v1 AS (SELECT * FROM v2)
CREATE VIEW v2 AS (SELECT * FROM v1)  -- ERROR: cycle detected

-- Solution: Redesign view structure to avoid cycles
-- Consider if you really need the circular reference
-- Use a table or materialized view to break the cycle
```

### "invalid column" During Creation

```sql
-- Column doesn't exist in referenced table

-- Check available columns
SHOW COLUMNS FROM table_name

-- Fix the query to use existing columns
CREATE VIEW view_name AS (
  SELECT existing_column1, existing_column2 FROM table_name
)
```

## Query Errors

### "cannot override CONST variable"

```sql
-- Error: cannot override CONST variable: @var_name

-- The view uses DECLARE CONST, which cannot be overridden
-- Check view definition:
SHOW CREATE VIEW view_name

-- Solutions:
-- A) Don't try to override CONST variables
SELECT * FROM view_name  -- Use default value

-- B) Alter view to remove CONST if override is needed
ALTER VIEW view_name AS (
  DECLARE @var_name := default_value  -- Remove CONST
  SELECT ...
)
```

### SAMPLE BY Errors with Views

**Error:** `ASC order over TIMESTAMP column is required`

```sql
-- If view contains ORDER BY ... DESC, SAMPLE BY may fail

-- Solution: Wrap with explicit ordering
CREATE VIEW fixed_view AS (
  (SELECT * FROM problematic_view ORDER BY ts) timestamp(ts)
)

-- Then use SAMPLE BY on the fixed view
SELECT * FROM fixed_view SAMPLE BY 1h
```

### LATEST BY Issues

**Error:** `expected 'on' keyword` when using LATEST BY on view

```sql
-- Direct LATEST BY on view may fail
SELECT * FROM view_name LATEST BY symbol  -- May fail

-- Solution: Use subquery syntax
SELECT * FROM (SELECT * FROM view_name) LATEST BY symbol
```

### LIMIT Not Working

**Symptom:** Outer LIMIT appears to be ignored

```sql
-- If view has internal LIMIT, outer LIMIT may not work as expected
CREATE VIEW limited_view AS (SELECT * FROM table LIMIT 100)
SELECT * FROM limited_view LIMIT 10  -- Still returns 100 rows

-- Solution: Apply filter differently
SELECT * FROM (SELECT * FROM table) LIMIT 10
```

## Performance Issues

### View Query is Slow

**Diagnosis:**
```sql
-- Check query plan
EXPLAIN SELECT * FROM slow_view
```

**Solutions:**

1. **Add indexes to base table:**
```sql
ALTER TABLE base_table ALTER COLUMN symbol ADD INDEX
```

2. **Simplify view definition:**
```sql
-- Instead of complex view
CREATE VIEW complex AS (
  SELECT * FROM t1 JOIN t2 ON ... JOIN t3 ON ... WHERE ...
)

-- Break into simpler views
CREATE VIEW step1 AS (SELECT * FROM t1 JOIN t2 ON ...)
CREATE VIEW step2 AS (SELECT * FROM step1 JOIN t3 ON ...)
```

3. **Consider materialized view for expensive aggregations**

### Filter Not Being Pushed Down

**Symptom:** View query scans entire table despite filter

```sql
-- Check if filter appears in plan
EXPLAIN SELECT * FROM view_name WHERE symbol = 'AAPL'

-- If filter is not pushed down, consider restructuring view
-- to allow better optimization
```

## Permission Errors

### "permission denied"

```sql
-- User lacks permission to access view or underlying objects

-- Check user permissions
-- Grant necessary permissions:
GRANT SELECT ON view_name TO user_name
```

### View Access Without Table Access

Views allow users to query data without direct table access. The user needs permission on the view only:

```sql
-- Grant view access (user doesn't need table access)
GRANT SELECT ON view_name TO restricted_user
```

## Recovery Procedures

### Bulk View Repair

When multiple views are broken due to schema changes:

```sql
-- Find all invalid views
SELECT view_name, invalidation_reason FROM views() WHERE view_status = 'invalid';

-- Compile each view to attempt repair
-- (Views are automatically repaired when underlying issue is fixed)
COMPILE VIEW view1;
COMPILE VIEW view2;
COMPILE VIEW view3;
```

### View Metadata Corruption

If view metadata becomes corrupted:

```sql
-- Drop and recreate the view
-- First, save the definition
SHOW CREATE VIEW corrupted_view

-- Drop the view
DROP VIEW IF EXISTS corrupted_view

-- Recreate with saved definition
CREATE VIEW corrupted_view AS (...)
```

## Diagnostic Queries

### View Health Check

```sql
SELECT
  view_name,
  view_status,
  CASE WHEN invalidation_reason = '' THEN 'OK' ELSE invalidation_reason END as status_detail,
  view_status_update_time
FROM views()
ORDER BY view_status DESC, view_name
```

### View Dependencies

```sql
-- Check what tables a view references (from view SQL)
SELECT view_name, view_sql FROM views() WHERE view_name = 'my_view'
```

### Recently Modified Views

```sql
SELECT view_name, view_status, view_status_update_time
FROM views()
ORDER BY view_status_update_time DESC
LIMIT 10
```

## Getting Help

If you encounter issues not covered here:

1. Check view definition: `SHOW CREATE VIEW view_name`
2. Check view status: `SELECT * FROM views() WHERE view_name = 'view_name'`
3. Check query plan: `EXPLAIN SELECT * FROM view_name`
4. Try manual compilation: `COMPILE VIEW view_name`
5. Review QuestDB logs for detailed error messages
