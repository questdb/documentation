# Views Quick Reference Card

## DDL Commands

| Command | Syntax |
|---------|--------|
| Create | `CREATE VIEW name AS (query)` |
| Create if not exists | `CREATE VIEW IF NOT EXISTS name AS (query)` |
| Create or replace | `CREATE OR REPLACE VIEW name AS (query)` |
| Alter | `ALTER VIEW name AS (query)` |
| Drop | `DROP VIEW name` |
| Drop if exists | `DROP VIEW IF EXISTS name` |
| Compile/validate | `COMPILE VIEW name` |

## Query Commands

| Command | Syntax |
|---------|--------|
| List all views | `SELECT * FROM views()` |
| Show definition | `SHOW CREATE VIEW name` |
| Show columns | `SHOW COLUMNS FROM name` |
| Query view | `SELECT * FROM name` |

## views() Output Columns

| Column | Type | Description |
|--------|------|-------------|
| `view_name` | VARCHAR | View name |
| `view_sql` | VARCHAR | SQL definition |
| `view_table_dir_name` | VARCHAR | Internal directory |
| `invalidation_reason` | VARCHAR | Error if invalid |
| `view_status` | VARCHAR | `valid` or `invalid` |
| `view_status_update_time` | TIMESTAMP | Last status change |

## Parameterized Views

```sql
-- Define with defaults
CREATE VIEW v AS (
  DECLARE @param := default_value
  SELECT * FROM t WHERE col = @param
)

-- Override at query time
DECLARE @param := new_value SELECT * FROM v

-- Prevent override with CONST
CREATE VIEW v AS (
  DECLARE CONST @fixed := value
  SELECT * FROM t WHERE col >= @fixed
)
```

## Table Types in tables()

| Type | Meaning |
|------|---------|
| `T` | Table |
| `V` | View |
| `M` | Materialized View |

## Invalidation Triggers

| Operation | Invalidates View? |
|-----------|-------------------|
| DROP TABLE | Yes |
| RENAME TABLE | Yes |
| DROP COLUMN (used in view) | Yes |
| RENAME COLUMN (used in view) | Yes |
| INSERT/UPDATE data | No |
| ADD COLUMN | No |

## Common Patterns

```sql
-- View with aggregation
CREATE VIEW hourly_avg AS (
  SELECT ts, symbol, avg(price) FROM trades SAMPLE BY 1h
)

-- View with JOIN
CREATE VIEW enriched AS (
  SELECT t.*, m.name FROM trades t JOIN meta m ON t.sym = m.sym
)

-- View on view
CREATE VIEW filtered AS (
  SELECT * FROM hourly_avg WHERE avg > 100
)

-- Parameterized filter
CREATE VIEW by_symbol AS (
  DECLARE @sym := 'AAPL'
  SELECT * FROM trades WHERE symbol = @sym
)

-- With explicit timestamp
CREATE VIEW ordered AS (
  (SELECT * FROM v ORDER BY ts) timestamp(ts)
)
```
