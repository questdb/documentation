# Migrating from CTEs to Views

This guide helps you migrate common table expressions (CTEs) to persistent views in QuestDB.

## Why Migrate CTEs to Views?

| CTE | View |
|-----|------|
| Defined per query | Defined once, reused everywhere |
| Not discoverable | Listed in `views()` |
| No permission control | Granular permissions |
| Duplicated across queries | Single source of truth |
| No validation until runtime | Validated at creation time |

## Basic Migration

### CTE Syntax

```sql
WITH hourly_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
)
SELECT * FROM hourly_summary WHERE symbol = 'AAPL'
```

### Equivalent View

```sql
-- Create once
CREATE VIEW hourly_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
);

-- Use anywhere
SELECT * FROM hourly_summary WHERE symbol = 'AAPL';
```

## Migration Patterns

### Pattern 1: Simple CTE

**Before (CTE):**
```sql
WITH active_users AS (
  SELECT user_id, name, email
  FROM users
  WHERE status = 'active'
)
SELECT * FROM active_users WHERE name LIKE 'A%';
```

**After (View):**
```sql
CREATE VIEW active_users AS (
  SELECT user_id, name, email
  FROM users
  WHERE status = 'active'
);

SELECT * FROM active_users WHERE name LIKE 'A%';
```

### Pattern 2: CTE with Aggregation

**Before (CTE):**
```sql
WITH daily_totals AS (
  SELECT date_trunc('day', ts) as date, sum(amount) as total
  FROM transactions
  SAMPLE BY 1d
)
SELECT * FROM daily_totals WHERE total > 10000;
```

**After (View):**
```sql
CREATE VIEW daily_totals AS (
  SELECT date_trunc('day', ts) as date, sum(amount) as total
  FROM transactions
  SAMPLE BY 1d
);

SELECT * FROM daily_totals WHERE total > 10000;
```

### Pattern 3: Chained CTEs

**Before (CTE):**
```sql
WITH
  raw_trades AS (
    SELECT * FROM trades WHERE quantity > 0
  ),
  hourly AS (
    SELECT ts, symbol, sum(quantity) as volume
    FROM raw_trades
    SAMPLE BY 1h
  ),
  daily AS (
    SELECT date_trunc('day', ts) as date, symbol, sum(volume) as volume
    FROM hourly
    SAMPLE BY 1d
  )
SELECT * FROM daily WHERE symbol = 'AAPL';
```

**After (Views):**
```sql
-- Create view hierarchy
CREATE VIEW trades_valid AS (
  SELECT * FROM trades WHERE quantity > 0
);

CREATE VIEW trades_hourly AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades_valid
  SAMPLE BY 1h
);

CREATE VIEW trades_daily AS (
  SELECT date_trunc('day', ts) as date, symbol, sum(volume) as volume
  FROM trades_hourly
  SAMPLE BY 1d
);

-- Query the final view
SELECT * FROM trades_daily WHERE symbol = 'AAPL';
```

### Pattern 4: CTE with JOIN

**Before (CTE):**
```sql
WITH enriched AS (
  SELECT t.ts, t.symbol, t.price, m.company_name
  FROM trades t
  JOIN metadata m ON t.symbol = m.symbol
)
SELECT * FROM enriched WHERE company_name LIKE 'Apple%';
```

**After (View):**
```sql
CREATE VIEW trades_enriched AS (
  SELECT t.ts, t.symbol, t.price, m.company_name
  FROM trades t
  JOIN metadata m ON t.symbol = m.symbol
);

SELECT * FROM trades_enriched WHERE company_name LIKE 'Apple%';
```

### Pattern 5: CTE with UNION

**Before (CTE):**
```sql
WITH all_exchanges AS (
  SELECT ts, 'NYSE' as exchange, symbol, price FROM nyse
  UNION ALL
  SELECT ts, 'NASDAQ' as exchange, symbol, price FROM nasdaq
)
SELECT * FROM all_exchanges WHERE symbol = 'AAPL';
```

**After (View):**
```sql
CREATE VIEW all_exchanges AS (
  SELECT ts, 'NYSE' as exchange, symbol, price FROM nyse
  UNION ALL
  SELECT ts, 'NASDAQ' as exchange, symbol, price FROM nasdaq
);

SELECT * FROM all_exchanges WHERE symbol = 'AAPL';
```

### Pattern 6: Parameterized CTE

CTEs can use variables defined with DECLARE. Views support this directly:

**Before (CTE with DECLARE):**
```sql
DECLARE @min_price := 100
WITH filtered AS (
  SELECT * FROM trades WHERE price >= @min_price
)
SELECT * FROM filtered;
```

**After (Parameterized View):**
```sql
CREATE VIEW trades_filtered AS (
  DECLARE @min_price := 100
  SELECT * FROM trades WHERE price >= @min_price
);

-- Use with default
SELECT * FROM trades_filtered;

-- Override parameter
DECLARE @min_price := 200 SELECT * FROM trades_filtered;
```

## Handling Recursive CTEs

QuestDB doesn't support recursive CTEs, and views cannot be recursive either. If you have recursive logic, consider:

1. **Flattening the hierarchy** in application code
2. **Using iterative queries** with multiple statements
3. **Pre-computing hierarchy** in a table

## Migration Checklist

For each CTE you want to migrate:

- [ ] Identify the CTE definition
- [ ] Choose a descriptive view name
- [ ] Create the view with `CREATE VIEW`
- [ ] Test the view returns expected results
- [ ] Update all queries using the CTE to use the view
- [ ] Remove the CTE definitions from queries
- [ ] Document the view's purpose
- [ ] Set appropriate permissions

## Side-by-Side Comparison

### Complex Query: Before

```sql
DECLARE @start := '2024-01-01', @end := '2024-12-31'

WITH
  filtered_trades AS (
    SELECT * FROM trades
    WHERE ts BETWEEN @start AND @end
  ),
  hourly_stats AS (
    SELECT ts, symbol,
      sum(quantity) as volume,
      sum(price * quantity) as turnover
    FROM filtered_trades
    SAMPLE BY 1h
  ),
  with_vwap AS (
    SELECT *,
      turnover / volume as vwap
    FROM hourly_stats
    WHERE volume > 0
  )
SELECT symbol, avg(vwap) as avg_vwap
FROM with_vwap
GROUP BY symbol
ORDER BY avg_vwap DESC;
```

### Complex Query: After

```sql
-- Create views (one-time setup)
CREATE VIEW trades_ytd AS (
  DECLARE @start := '2024-01-01', @end := '2024-12-31'
  SELECT * FROM trades
  WHERE ts BETWEEN @start AND @end
);

CREATE VIEW hourly_stats AS (
  SELECT ts, symbol,
    sum(quantity) as volume,
    sum(price * quantity) as turnover
  FROM trades_ytd
  SAMPLE BY 1h
);

CREATE VIEW hourly_vwap AS (
  SELECT *,
    turnover / volume as vwap
  FROM hourly_stats
  WHERE volume > 0
);

-- Query (clean and simple)
SELECT symbol, avg(vwap) as avg_vwap
FROM hourly_vwap
GROUP BY symbol
ORDER BY avg_vwap DESC;

-- Or with different date range
DECLARE @start := '2023-01-01', @end := '2023-12-31'
SELECT symbol, avg(vwap) as avg_vwap
FROM hourly_vwap
GROUP BY symbol
ORDER BY avg_vwap DESC;
```

## When to Keep Using CTEs

CTEs are still useful for:

1. **Truly ad-hoc queries** that won't be reused
2. **Query development** before committing to a view
3. **One-off analysis** scripts
4. **Complex logic** that's specific to a single report

## Hybrid Approach

Use views for stable, shared logic and CTEs for query-specific additions:

```sql
-- Shared view
CREATE VIEW base_metrics AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
);

-- Query-specific CTE on top of view
WITH ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY symbol ORDER BY volume DESC) as rank
  FROM base_metrics
)
SELECT * FROM ranked WHERE rank <= 10;
```
