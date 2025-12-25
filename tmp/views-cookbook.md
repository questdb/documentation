# Views Cookbook: Real-World Examples

This cookbook provides practical examples of using views in QuestDB for common use cases.

## Financial Data Analysis

### OHLCV Candlestick View

```sql
CREATE VIEW ohlcv_1h AS (
  SELECT
    ts,
    symbol,
    first(price) as open,
    max(price) as high,
    min(price) as low,
    last(price) as close,
    sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
)
```

**Usage:**
```sql
SELECT * FROM ohlcv_1h WHERE symbol = 'BTC-USD' AND ts > dateadd('d', -7, now())
```

### Moving Average View

```sql
CREATE VIEW price_with_ma AS (
  SELECT
    ts,
    symbol,
    price,
    avg(price) OVER (PARTITION BY symbol ORDER BY ts ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) as ma20,
    avg(price) OVER (PARTITION BY symbol ORDER BY ts ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) as ma50
  FROM trades
)
```

### Best Bid/Offer Spread

```sql
CREATE VIEW spread_analysis AS (
  SELECT
    ts,
    symbol,
    best_bid,
    best_ask,
    best_ask - best_bid as spread,
    (best_ask - best_bid) / best_bid * 100 as spread_pct
  FROM quotes
  WHERE best_bid > 0
)
```

### Portfolio Value Tracker

```sql
CREATE VIEW portfolio_value AS (
  SELECT
    p.ts,
    sum(p.quantity * t.price) as total_value
  FROM positions p
  ASOF JOIN trades t ON p.symbol = t.symbol
  SAMPLE BY 1h
)
```

## IoT / Sensor Data

### Sensor Health Dashboard

```sql
CREATE VIEW sensor_health AS (
  SELECT
    sensor_id,
    count() as reading_count,
    min(value) as min_val,
    max(value) as max_val,
    avg(value) as avg_val,
    last(ts) as last_reading,
    now() - last(ts) as time_since_last
  FROM sensor_readings
  WHERE ts > dateadd('h', -24, now())
)
```

### Anomaly Detection View

```sql
CREATE VIEW sensor_anomalies AS (
  DECLARE @threshold := 3.0
  SELECT
    ts,
    sensor_id,
    value,
    avg(value) OVER w as moving_avg,
    stddev(value) OVER w as moving_stddev,
    abs(value - avg(value) OVER w) / stddev(value) OVER w as z_score
  FROM sensor_readings
  WINDOW w AS (PARTITION BY sensor_id ORDER BY ts ROWS BETWEEN 100 PRECEDING AND CURRENT ROW)
)
-- Query anomalies
-- DECLARE @threshold := 2.5 SELECT * FROM sensor_anomalies WHERE z_score > @threshold
```

### Downsampled Sensor Data

```sql
CREATE VIEW sensors_1min AS (
  SELECT
    ts,
    sensor_id,
    avg(temperature) as temp,
    avg(humidity) as humidity,
    avg(pressure) as pressure
  FROM sensor_readings
  SAMPLE BY 1m
)

CREATE VIEW sensors_1h AS (
  SELECT
    ts,
    sensor_id,
    avg(temp) as temp,
    avg(humidity) as humidity,
    avg(pressure) as pressure
  FROM sensors_1min
  SAMPLE BY 1h
)
```

## Log Analysis

### Error Rate by Service

```sql
CREATE VIEW error_rates AS (
  SELECT
    ts,
    service_name,
    count() as total_requests,
    count_if(status_code >= 500) as server_errors,
    count_if(status_code >= 400 AND status_code < 500) as client_errors,
    count_if(status_code >= 500) * 100.0 / count() as error_rate_pct
  FROM access_logs
  SAMPLE BY 5m
)
```

### Slow Queries View

```sql
CREATE VIEW slow_queries AS (
  DECLARE @threshold_ms := 1000
  SELECT
    ts,
    query_id,
    user_name,
    query_text,
    duration_ms
  FROM query_logs
  WHERE duration_ms > @threshold_ms
)

-- Find queries slower than 5 seconds
-- DECLARE @threshold_ms := 5000 SELECT * FROM slow_queries
```

### Request Latency Percentiles

```sql
CREATE VIEW latency_percentiles AS (
  SELECT
    ts,
    endpoint,
    count() as requests,
    avg(latency_ms) as avg_latency,
    percentile_approx(latency_ms, 0.50) as p50,
    percentile_approx(latency_ms, 0.95) as p95,
    percentile_approx(latency_ms, 0.99) as p99
  FROM api_requests
  SAMPLE BY 1m
)
```

## Multi-Source Data Integration

### Unified Market Data

```sql
CREATE VIEW all_exchanges AS (
  SELECT ts, 'NYSE' as exchange, symbol, price, volume FROM nyse_trades
  UNION ALL
  SELECT ts, 'NASDAQ' as exchange, symbol, price, volume FROM nasdaq_trades
  UNION ALL
  SELECT ts, 'LSE' as exchange, symbol, price, volume FROM lse_trades
)
```

### Cross-Reference View

```sql
CREATE VIEW trades_enriched AS (
  SELECT
    t.ts,
    t.symbol,
    t.price,
    t.quantity,
    t.price * t.quantity as notional,
    s.company_name,
    s.sector,
    s.market_cap
  FROM trades t
  LEFT JOIN securities s ON t.symbol = s.symbol
)
```

## Time-Based Filtering

### Recent Data Views

```sql
-- Last 24 hours
CREATE VIEW trades_24h AS (
  SELECT * FROM trades WHERE ts > dateadd('h', -24, now())
)

-- Last 7 days
CREATE VIEW trades_7d AS (
  SELECT * FROM trades WHERE ts > dateadd('d', -7, now())
)

-- Current month
CREATE VIEW trades_mtd AS (
  SELECT * FROM trades WHERE ts >= date_trunc('month', now())
)
```

### Parameterized Time Window

```sql
CREATE VIEW trades_window AS (
  DECLARE @hours := 24
  SELECT * FROM trades WHERE ts > dateadd('h', -@hours, now())
)

-- Last 4 hours
-- DECLARE @hours := 4 SELECT * FROM trades_window
```

## Chained Views (View Hierarchy)

```sql
-- Level 1: Raw data filtering
CREATE VIEW valid_trades AS (
  SELECT * FROM trades
  WHERE price > 0 AND quantity > 0 AND symbol IS NOT NULL
)

-- Level 2: Aggregation
CREATE VIEW hourly_stats AS (
  SELECT
    ts, symbol,
    sum(quantity) as volume,
    sum(price * quantity) as turnover,
    count() as trade_count
  FROM valid_trades
  SAMPLE BY 1h
)

-- Level 3: Derived metrics
CREATE VIEW hourly_vwap AS (
  SELECT
    ts, symbol,
    volume,
    trade_count,
    turnover / volume as vwap
  FROM hourly_stats
  WHERE volume > 0
)

-- Level 4: Cross-symbol comparison
CREATE VIEW relative_volume AS (
  SELECT
    h.ts,
    h.symbol,
    h.volume,
    h.volume * 100.0 / sum(h.volume) OVER (PARTITION BY h.ts) as volume_pct
  FROM hourly_stats h
)
```

## Reporting Views

### Daily Summary Report

```sql
CREATE VIEW daily_report AS (
  SELECT
    date_trunc('day', ts) as date,
    count(DISTINCT symbol) as symbols_traded,
    count() as total_trades,
    sum(price * quantity) as total_value,
    avg(price * quantity) as avg_trade_value
  FROM trades
  SAMPLE BY 1d
)
```

### Top N Analysis

```sql
CREATE VIEW top_symbols_by_volume AS (
  DECLARE @limit := 10
  SELECT
    symbol,
    sum(quantity) as total_volume,
    sum(price * quantity) as total_value,
    count() as trade_count
  FROM trades
  WHERE ts > dateadd('d', -1, now())
  GROUP BY symbol
  ORDER BY total_volume DESC
  LIMIT @limit
)
```

## Tips for Complex Views

1. **Build incrementally**: Start with simple views and layer complexity
2. **Test each level**: Verify intermediate views before building on them
3. **Use meaningful names**: `trades_valid_hourly_vwap` is clearer than `v3`
4. **Document with DECLARE**: Parameter names serve as documentation
5. **Consider performance**: Deep view hierarchies may impact query time
