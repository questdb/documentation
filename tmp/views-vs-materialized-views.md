# Views vs Materialized Views

This guide explains the differences between views and materialized views in QuestDB, helping you choose the right approach for your use case.

## Quick Comparison

| Feature | View | Materialized View |
|---------|------|-------------------|
| Data Storage | None (virtual) | Physical storage |
| Query Execution | On every access | Pre-computed |
| Data Freshness | Always current | Depends on refresh |
| Creation | `CREATE VIEW` | `CREATE MATERIALIZED VIEW` |
| Performance | Query-time cost | Read-time benefit |
| Storage Cost | Zero | Proportional to result size |
| Refresh | N/A | Manual or automatic |

## When to Use Views

### Best For:
- **Simple transformations** that execute quickly
- **Data that must always be current**
- **Ad-hoc analysis** where requirements change frequently
- **Complex JOINs** that don't need caching
- **Parameterized queries** with `DECLARE`
- **Low-frequency queries** (occasional access)

### Examples:

```sql
-- Simple column selection and filtering (fast enough without materialization)
CREATE VIEW active_users AS (
  SELECT user_id, name, email FROM users WHERE status = 'active'
)

-- Parameterized view for flexible querying
CREATE VIEW user_activity AS (
  DECLARE @user_id := 0
  SELECT * FROM events WHERE user_id = @user_id
)

-- Data must be real-time
CREATE VIEW live_positions AS (
  SELECT symbol, sum(quantity) as position
  FROM trades
  GROUP BY symbol
)
```

## When to Use Materialized Views

### Best For:
- **Heavy aggregations** over large datasets
- **Frequently accessed** summary data
- **Dashboard queries** that run repeatedly
- **Historical summaries** that don't need real-time accuracy
- **Expensive computations** (percentiles, complex window functions)

### Examples:

```sql
-- Heavy aggregation over large dataset
CREATE MATERIALIZED VIEW hourly_stats AS (
  SELECT ts, symbol,
    sum(quantity) as volume,
    avg(price) as avg_price
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY

-- Dashboard query accessed every second
CREATE MATERIALIZED VIEW kpi_dashboard AS (
  SELECT
    count() as total_orders,
    sum(amount) as total_revenue,
    avg(amount) as avg_order_value
  FROM orders
  WHERE ts > dateadd('d', -30, now())
  SAMPLE BY 1d
)
```

## Performance Comparison

### Scenario: Hourly OHLCV for 1 billion trades

**With View:**
```sql
CREATE VIEW ohlcv_1h AS (
  SELECT ts, symbol, first(price), max(price), min(price), last(price), sum(volume)
  FROM trades
  SAMPLE BY 1h
)
-- Query time: Scans all 1B rows every time
-- Latency: Seconds to minutes depending on data
```

**With Materialized View:**
```sql
CREATE MATERIALIZED VIEW ohlcv_1h AS (
  SELECT ts, symbol, first(price), max(price), min(price), last(price), sum(volume)
  FROM trades
  SAMPLE BY 1h
) PARTITION BY DAY
-- Query time: Reads pre-computed result
-- Latency: Milliseconds
```

## Hybrid Approach: View on Materialized View

Combine both for flexibility with performance:

```sql
-- Materialized view for heavy computation
CREATE MATERIALIZED VIEW trades_hourly AS (
  SELECT ts, symbol, sum(quantity) as volume, sum(price*quantity) as turnover
  FROM trades
  SAMPLE BY 1h
)

-- View for additional filtering/transformation (fast because it reads from mat view)
CREATE VIEW trades_hourly_filtered AS (
  DECLARE @symbol := 'AAPL'
  SELECT *, turnover/volume as vwap
  FROM trades_hourly
  WHERE symbol = @symbol
)
```

## Decision Matrix

| Condition | Use View | Use Materialized View |
|-----------|----------|----------------------|
| Data size < 1M rows | ✓ | |
| Data size > 100M rows | | ✓ |
| Query frequency < 1/min | ✓ | |
| Query frequency > 1/sec | | ✓ |
| Real-time accuracy required | ✓ | |
| 5-minute delay acceptable | | ✓ |
| Complex aggregation | | ✓ |
| Simple SELECT/WHERE | ✓ | |
| Parameterized query | ✓ | |
| Dashboard/reporting | | ✓ |

## Migration Between View Types

### View to Materialized View

If a view becomes too slow:

```sql
-- Original view
CREATE VIEW slow_summary AS (
  SELECT ts, count(*), avg(value) FROM big_table SAMPLE BY 1h
)

-- Convert to materialized view
DROP VIEW slow_summary;
CREATE MATERIALIZED VIEW slow_summary AS (
  SELECT ts, count(*), avg(value) FROM big_table SAMPLE BY 1h
) PARTITION BY DAY
```

### Materialized View to View

If you need real-time data:

```sql
-- Original materialized view
CREATE MATERIALIZED VIEW summary AS (
  SELECT ts, symbol, last(price) FROM trades SAMPLE BY 1m
)

-- Convert to view for real-time
DROP MATERIALIZED VIEW summary;
CREATE VIEW summary AS (
  SELECT ts, symbol, last(price) FROM trades SAMPLE BY 1m
)
```

## Cost-Benefit Analysis

### View Costs:
- CPU cost on every query
- Memory for query execution
- No storage cost
- No maintenance cost

### Materialized View Costs:
- Storage for result data
- Refresh computation (CPU/IO)
- Refresh scheduling/management
- Potential staleness

### Break-Even Point

The break-even point depends on:
1. **Query frequency**: Higher frequency favors materialized views
2. **Data change rate**: Lower change rate favors materialized views
3. **Query complexity**: More complex queries favor materialized views
4. **Freshness requirement**: Stricter requirements favor views

**Rule of Thumb:**
- If `(query_time × queries_per_hour) > (refresh_time × refreshes_per_hour)`, consider materialized view
- If real-time accuracy matters more than latency, use a view

## Summary

| Choose View When | Choose Materialized View When |
|------------------|------------------------------|
| Data freshness is critical | Query performance is critical |
| Query patterns change often | Query patterns are stable |
| Data volume is manageable | Data volume is massive |
| Parameterization is needed | Static aggregations suffice |
| Storage is limited | Compute is limited |
