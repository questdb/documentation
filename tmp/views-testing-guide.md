# Views Testing Guide

This guide provides strategies and examples for testing views in QuestDB.

## Testing Strategies

### 1. Unit Testing Views

Test individual views in isolation to ensure they return expected results.

```sql
-- Setup: Create test table
CREATE TABLE test_trades (
  ts TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  quantity LONG
) TIMESTAMP(ts) PARTITION BY DAY WAL;

-- Insert test data
INSERT INTO test_trades VALUES
  ('2024-01-01T10:00:00Z', 'AAPL', 150.0, 100),
  ('2024-01-01T10:30:00Z', 'AAPL', 151.0, 200),
  ('2024-01-01T11:00:00Z', 'AAPL', 152.0, 150),
  ('2024-01-01T10:15:00Z', 'GOOG', 140.0, 50);

-- Create view under test
CREATE VIEW hourly_volume AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM test_trades
  SAMPLE BY 1h
);

-- Test: Verify aggregation
SELECT * FROM hourly_volume ORDER BY ts, symbol;
-- Expected:
-- ts                          | symbol | volume
-- 2024-01-01T10:00:00.000000Z | AAPL   | 300
-- 2024-01-01T10:00:00.000000Z | GOOG   | 50
-- 2024-01-01T11:00:00.000000Z | AAPL   | 150

-- Cleanup
DROP VIEW hourly_volume;
DROP TABLE test_trades;
```

### 2. Integration Testing

Test views with their dependencies.

```sql
-- Setup: Create related tables
CREATE TABLE products (id LONG, name VARCHAR, category VARCHAR);
CREATE TABLE sales (ts TIMESTAMP, product_id LONG, amount DOUBLE) TIMESTAMP(ts);

INSERT INTO products VALUES (1, 'Widget', 'A'), (2, 'Gadget', 'B');
INSERT INTO sales VALUES
  ('2024-01-01T00:00:00Z', 1, 100),
  ('2024-01-01T00:00:00Z', 2, 200);

-- Create view with JOIN
CREATE VIEW sales_by_category AS (
  SELECT p.category, sum(s.amount) as total
  FROM sales s
  JOIN products p ON s.product_id = p.id
);

-- Test: Verify JOIN works correctly
SELECT * FROM sales_by_category ORDER BY category;
-- Expected:
-- category | total
-- A        | 100
-- B        | 200

-- Cleanup
DROP VIEW sales_by_category;
DROP TABLE sales;
DROP TABLE products;
```

### 3. Parameterized View Testing

Test views with DECLARE parameters.

```sql
-- Setup
CREATE TABLE data (ts TIMESTAMP, value LONG) TIMESTAMP(ts);
INSERT INTO data VALUES
  ('2024-01-01T00:00:00Z', 10),
  ('2024-01-01T00:00:01Z', 20),
  ('2024-01-01T00:00:02Z', 30);

-- Create parameterized view
CREATE VIEW filtered_data AS (
  DECLARE @min := 0
  SELECT * FROM data WHERE value > @min
);

-- Test: Default parameter
SELECT count() FROM filtered_data;
-- Expected: 3

-- Test: Override parameter
DECLARE @min := 15 SELECT count() FROM filtered_data;
-- Expected: 2

DECLARE @min := 25 SELECT count() FROM filtered_data;
-- Expected: 1

-- Cleanup
DROP VIEW filtered_data;
DROP TABLE data;
```

### 4. CONST Parameter Testing

```sql
CREATE TABLE data (id LONG, value LONG);
INSERT INTO data VALUES (1, 10), (2, 20);

-- Create view with CONST
CREATE VIEW const_view AS (
  DECLARE CONST @min := 0
  SELECT * FROM data WHERE id >= @min
);

-- Test: CONST cannot be overridden (should fail)
-- DECLARE @min := -1 SELECT * FROM const_view;
-- Expected: Error "cannot override CONST variable: @min"

-- Cleanup
DROP VIEW const_view;
DROP TABLE data;
```

### 5. Invalidation Testing

Test that views properly invalidate when dependencies change.

```sql
-- Setup
CREATE TABLE base_table (id LONG, name VARCHAR);
INSERT INTO base_table VALUES (1, 'test');

CREATE VIEW dependent_view AS (SELECT * FROM base_table);

-- Verify view is valid
SELECT view_status FROM views() WHERE view_name = 'dependent_view';
-- Expected: valid

-- Test: Drop column used by view
ALTER TABLE base_table DROP COLUMN name;

-- Verify view is now invalid
SELECT view_status, invalidation_reason FROM views() WHERE view_name = 'dependent_view';
-- Expected: invalid, "Invalid column: name"

-- Test: Fix by adding column back
ALTER TABLE base_table ADD COLUMN name VARCHAR;

-- Compile to re-validate
COMPILE VIEW dependent_view;

-- Verify view is valid again
SELECT view_status FROM views() WHERE view_name = 'dependent_view';
-- Expected: valid

-- Cleanup
DROP VIEW dependent_view;
DROP TABLE base_table;
```

### 6. View Hierarchy Testing

```sql
-- Setup
CREATE TABLE raw (ts TIMESTAMP, v LONG) TIMESTAMP(ts);
INSERT INTO raw VALUES ('2024-01-01', 1), ('2024-01-01', 2), ('2024-01-01', 3);

-- Create view hierarchy
CREATE VIEW level1 AS (SELECT * FROM raw WHERE v > 0);
CREATE VIEW level2 AS (SELECT * FROM level1 WHERE v > 1);
CREATE VIEW level3 AS (SELECT * FROM level2 WHERE v > 2);

-- Test each level
SELECT count() FROM level1;  -- Expected: 3
SELECT count() FROM level2;  -- Expected: 2
SELECT count() FROM level3;  -- Expected: 1

-- Test cascade invalidation: drop base table
DROP TABLE raw;

-- All views should be invalid
SELECT view_name, view_status FROM views() ORDER BY view_name;
-- Expected: all invalid

-- Cleanup
DROP VIEW level3;
DROP VIEW level2;
DROP VIEW level1;
```

## Test Scenarios Checklist

### Creation Tests
- [ ] CREATE VIEW with simple SELECT
- [ ] CREATE VIEW with WHERE clause
- [ ] CREATE VIEW with JOIN
- [ ] CREATE VIEW with UNION
- [ ] CREATE VIEW with SAMPLE BY
- [ ] CREATE VIEW with window functions
- [ ] CREATE VIEW IF NOT EXISTS (new view)
- [ ] CREATE VIEW IF NOT EXISTS (existing view)
- [ ] CREATE OR REPLACE VIEW (new view)
- [ ] CREATE OR REPLACE VIEW (existing view)
- [ ] CREATE VIEW with Unicode name
- [ ] CREATE VIEW with DECLARE
- [ ] CREATE VIEW with DECLARE CONST

### Query Tests
- [ ] Simple SELECT from view
- [ ] SELECT with WHERE on view
- [ ] SELECT with ORDER BY on view
- [ ] SELECT with LIMIT on view
- [ ] SELECT with SAMPLE BY on view
- [ ] JOIN view with table
- [ ] JOIN view with view
- [ ] UNION with views
- [ ] Subquery from view
- [ ] CTE using view

### Filter Push-Down Tests
- [ ] Equality filter pushes down
- [ ] Range filter pushes down
- [ ] IN clause pushes down
- [ ] Timestamp filter pushes down
- [ ] Computed column filter behavior

### Parameter Tests
- [ ] Default parameter value used
- [ ] Parameter override works
- [ ] Multiple parameters work
- [ ] CONST parameter prevents override
- [ ] Mixed CONST and non-CONST parameters

### Invalidation Tests
- [ ] DROP TABLE invalidates view
- [ ] RENAME TABLE invalidates view
- [ ] DROP COLUMN invalidates view
- [ ] RENAME COLUMN invalidates view
- [ ] Recreating table re-validates view
- [ ] Renaming column back re-validates view
- [ ] Cascade invalidation to dependent views

### Error Tests
- [ ] CREATE VIEW with non-existent table
- [ ] CREATE VIEW with non-existent column
- [ ] CREATE VIEW with cycle
- [ ] DROP VIEW non-existent
- [ ] Override CONST parameter

### Management Tests
- [ ] views() lists created view
- [ ] views() shows correct status
- [ ] SHOW CREATE VIEW returns definition
- [ ] COMPILE VIEW updates status
- [ ] ALTER VIEW changes definition

## Performance Testing

### Baseline Measurement

```sql
-- Create test data
CREATE TABLE perf_test (
  ts TIMESTAMP,
  symbol SYMBOL,
  price DOUBLE,
  quantity LONG
) TIMESTAMP(ts) PARTITION BY DAY WAL;

-- Insert significant data (adjust for your needs)
INSERT INTO perf_test
SELECT
  dateadd('s', x, '2024-01-01'),
  rnd_symbol('AAPL', 'GOOG', 'MSFT'),
  rnd_double() * 1000,
  rnd_long(1, 10000, 0)
FROM long_sequence(1000000);

-- Create view
CREATE VIEW perf_view AS (
  SELECT ts, symbol, sum(quantity) as vol, avg(price) as avg_price
  FROM perf_test
  SAMPLE BY 1h
);

-- Measure query time
SELECT * FROM perf_view WHERE symbol = 'AAPL';

-- Compare with direct query
SELECT ts, symbol, sum(quantity) as vol, avg(price) as avg_price
FROM perf_test
WHERE symbol = 'AAPL'
SAMPLE BY 1h;

-- Cleanup
DROP VIEW perf_view;
DROP TABLE perf_test;
```

### Query Plan Verification

```sql
-- Verify filter push-down
EXPLAIN SELECT * FROM perf_view WHERE symbol = 'AAPL';

-- Look for: filter applied at PageFrame level, not after aggregation
```

## Continuous Integration

### Sample Test Script

```bash
#!/bin/bash
# views_test.sh

QUESTDB_URL="http://localhost:9000"

# Helper function
run_sql() {
  curl -s -G "${QUESTDB_URL}/exec" --data-urlencode "query=$1"
}

# Test 1: Create and query view
echo "Test 1: Basic view creation"
run_sql "CREATE TABLE t1 (x LONG)"
run_sql "INSERT INTO t1 VALUES (1), (2), (3)"
run_sql "CREATE VIEW v1 AS (SELECT * FROM t1 WHERE x > 1)"

result=$(run_sql "SELECT count() FROM v1" | jq -r '.dataset[0][0]')
if [ "$result" == "2" ]; then
  echo "PASS: View returns correct count"
else
  echo "FAIL: Expected 2, got $result"
  exit 1
fi

# Cleanup
run_sql "DROP VIEW v1"
run_sql "DROP TABLE t1"

echo "All tests passed!"
```

## Debugging Failed Tests

### Check View Status

```sql
SELECT view_name, view_status, invalidation_reason, view_sql
FROM views()
WHERE view_name = 'problem_view';
```

### Check Query Plan

```sql
EXPLAIN SELECT * FROM problem_view WHERE filter_column = 'value';
```

### Force Recompilation

```sql
COMPILE VIEW problem_view;
```

### Check Dependencies

```sql
-- View the SQL to see what tables/views are referenced
SHOW CREATE VIEW problem_view;
```
