# Views Performance Guide

This guide covers performance considerations when working with database views in QuestDB.

## How Views Execute

When you query a view, QuestDB:

1. **Parses** your query referencing the view
2. **Expands** the view definition inline as a subquery
3. **Optimizes** the combined query plan
4. **Executes** the optimized plan

This means view queries have the same execution characteristics as equivalent inline subqueries.

## Query Plan Analysis

Always examine query plans when optimizing view performance:

```sql
-- View definition
CREATE VIEW trades_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  WHERE quantity > 0
  SAMPLE BY 1h
)

-- Check plan for view query
EXPLAIN SELECT * FROM trades_summary WHERE symbol = 'AAPL'
```

**Good plan** - filter pushed to base table:
```
Async Group By workers: 4
  keys: [ts,symbol]
  values: [sum(quantity)]
  filter: (quantity > 0 AND symbol = 'AAPL')  -- Combined filter
    PageFrame
      Frame forward scan on: trades
```

**Suboptimal plan** - filter not pushed:
```
Filter filter: symbol = 'AAPL'  -- Filter applied after aggregation
  Async Group By workers: 4
    keys: [ts,symbol]
    values: [sum(quantity)]
    filter: quantity > 0
      PageFrame
        Frame forward scan on: trades
```

## Filter Push-Down

QuestDB optimizes view queries by pushing filters down to base tables when possible.

### Filters That Push Down

```sql
CREATE VIEW v AS (SELECT ts, symbol, price FROM trades)

-- These filters push down:
SELECT * FROM v WHERE symbol = 'AAPL'           -- Equality
SELECT * FROM v WHERE price > 100               -- Comparison
SELECT * FROM v WHERE symbol IN ('AAPL', 'GOOG') -- IN list
SELECT * FROM v WHERE ts > '2024-01-01'         -- Timestamp filter
```

### Filters That May Not Push Down

```sql
-- Filters on computed columns may not push down
CREATE VIEW v AS (SELECT ts, price * quantity as notional FROM trades)
SELECT * FROM v WHERE notional > 10000  -- May scan all rows first

-- Solution: Include raw columns and filter on those
CREATE VIEW v AS (SELECT ts, price, quantity, price * quantity as notional FROM trades)
SELECT * FROM v WHERE price > 100 AND quantity > 10  -- Pushes down
```

## Aggregation Performance

### View Aggregation Overhead

Each view query recalculates aggregations:

```sql
-- This aggregation runs every time the view is queried
CREATE VIEW hourly_volume AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades  -- 1 billion rows
  SAMPLE BY 1h
)

SELECT * FROM hourly_volume WHERE symbol = 'AAPL'
-- Aggregates all matching rows on every query
```

**When to consider materialized views:**
- Base table > 100 million rows
- Aggregation query time > 1 second
- Query frequency > 1 per minute

### Layered Aggregation

Build view hierarchies for progressive summarization:

```sql
-- Level 1: Minute aggregation (reduces 1B to ~525K rows/year)
CREATE VIEW trades_1min AS (
  SELECT ts, symbol, sum(quantity) as volume, sum(price*quantity) as turnover
  FROM trades SAMPLE BY 1m
)

-- Level 2: Hour aggregation (reduces to ~8.7K rows/year)
CREATE VIEW trades_1h AS (
  SELECT ts, symbol, sum(volume) as volume, sum(turnover) as turnover
  FROM trades_1min SAMPLE BY 1h
)

-- Level 3: Day aggregation (reduces to 365 rows/year)
CREATE VIEW trades_1d AS (
  SELECT ts, symbol, sum(volume) as volume, sum(turnover) as turnover
  FROM trades_1h SAMPLE BY 1d
)
```

**Note:** This doesn't save computation (each level recalculates), but makes development clearer. For actual performance gains, use materialized views.

## JOIN Performance

### View-to-View JOINs

JOINing views compounds execution cost:

```sql
CREATE VIEW v1 AS (SELECT ts, symbol, sum(qty) as vol FROM t1 SAMPLE BY 1h)
CREATE VIEW v2 AS (SELECT ts, symbol, avg(price) as avg FROM t2 SAMPLE BY 1h)

-- Both views execute fully before JOIN
SELECT v1.ts, v1.symbol, v1.vol, v2.avg
FROM v1 JOIN v2 ON v1.symbol = v2.symbol AND v1.ts = v2.ts
```

**Optimization strategies:**

1. **Combine into single view:**
```sql
CREATE VIEW combined AS (
  SELECT t1.ts, t1.symbol, sum(t1.qty) as vol, avg(t2.price) as avg
  FROM t1 JOIN t2 ON t1.symbol = t2.symbol AND t1.ts = t2.ts
  SAMPLE BY 1h
)
```

2. **Use ASOF JOIN for time-series:**
```sql
CREATE VIEW efficient_join AS (
  SELECT t1.ts, t1.symbol, t1.qty, t2.price
  FROM t1 ASOF JOIN t2 ON t1.symbol = t2.symbol
)
```

## UNION Performance

UNION views execute all branches:

```sql
CREATE VIEW all_trades AS (
  SELECT ts, symbol, price FROM nyse
  UNION ALL
  SELECT ts, symbol, price FROM nasdaq
  UNION ALL
  SELECT ts, symbol, price FROM lse
)

-- All three tables scanned even if filter matches only one
SELECT * FROM all_trades WHERE symbol = 'AAPL'
```

**Optimization:** QuestDB may not push filters into all UNION branches optimally. Consider:

```sql
-- Explicit filtering in view definition with parameters
CREATE VIEW all_trades AS (
  DECLARE @sym := ''
  SELECT ts, symbol, price FROM nyse WHERE symbol = @sym OR @sym = ''
  UNION ALL
  SELECT ts, symbol, price FROM nasdaq WHERE symbol = @sym OR @sym = ''
  UNION ALL
  SELECT ts, symbol, price FROM lse WHERE symbol = @sym OR @sym = ''
)
```

## Parameterized View Performance

Parameters are resolved at query time and can enable optimizations:

```sql
CREATE VIEW by_symbol AS (
  DECLARE @sym := 'AAPL'
  SELECT * FROM trades WHERE symbol = @sym
)

-- Parameter enables index usage
DECLARE @sym := 'GOOG' SELECT * FROM by_symbol
```

**Benefits:**
- Filter is applied at scan level
- Can use indexes on base table
- Avoids full table scan

## Memory Considerations

Views don't store data, but query execution uses memory:

| Operation | Memory Usage |
|-----------|--------------|
| Simple SELECT | Low |
| GROUP BY | Proportional to cardinality |
| ORDER BY | Proportional to result size |
| Window functions | Proportional to partition size |
| JOIN | Proportional to smaller side |

**Memory-intensive view example:**
```sql
CREATE VIEW high_memory AS (
  SELECT symbol,
    percentile_disc(0.99) WITHIN GROUP (ORDER BY price) as p99
  FROM trades
  GROUP BY symbol  -- Must hold all prices per symbol in memory
)
```

## Best Practices Summary

### Do:
- ✓ Check query plans with `EXPLAIN`
- ✓ Use indexed columns in filters
- ✓ Push filters to base tables when possible
- ✓ Use parameterized views for common filter patterns
- ✓ Consider materialized views for expensive aggregations
- ✓ Use ASOF JOIN for time-series data

### Don't:
- ✗ Create deeply nested view hierarchies (>3-4 levels)
- ✗ Use views for extremely large aggregations without caching
- ✗ Apply filters on computed columns when base columns are available
- ✗ JOIN multiple expensive views without measuring impact
- ✗ Assume views cache results (they don't)

## Performance Checklist

Before deploying a view to production:

1. [ ] Run `EXPLAIN` on typical queries
2. [ ] Verify filters push down to base tables
3. [ ] Measure query time with realistic data volumes
4. [ ] Test with expected query concurrency
5. [ ] Consider materialized view if query time > acceptable latency
6. [ ] Monitor memory usage during query execution
7. [ ] Index base table columns used in filters/joins
