---
title: Sankey and Funnel Diagrams
sidebar_label: Sankey/funnel diagrams
description: Create flow analysis data for Sankey diagrams and conversion funnels using session-based queries and state transitions
---

Build user journey flow data for Sankey diagrams and conversion funnels by tracking state transitions across sessions. This pattern is essential for visualizing how users navigate through your application, where they drop off, and which paths are most common.

## Problem: Track User Flow Through States

You have event data tracking user actions:

| timestamp | user_id | page |
|-----------|---------|------|
| 10:00:00  | user_1  | home |
| 10:00:15  | user_1  | products |
| 10:00:45  | user_1  | cart |
| 10:01:00  | user_1  | checkout |
| 10:00:05  | user_2  | home |
| 10:00:20  | user_2  | products |
| 10:00:30  | user_2  | home |

You want to count transitions between states:

| from | to | count |
|------|----|-------|
| home | products | 2 |
| products | cart | 1 |
| products | home | 1 |
| cart | checkout | 1 |

This data can be visualized as a Sankey diagram or used for funnel analysis.

## Solution: LAG Window Function for State Transitions

Use LAG to get the previous state for each user, then aggregate transitions:

```questdb-sql demo title="Count state transitions for Sankey diagram"
WITH transitions AS (
  SELECT
    user_id,
    page as current_state,
    lag(page) OVER (PARTITION BY user_id ORDER BY timestamp) as previous_state,
    timestamp
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
)
SELECT
  previous_state as from_state,
  current_state as to_state,
  count(*) as transition_count
FROM transitions
WHERE previous_state IS NOT NULL
GROUP BY previous_state, current_state
ORDER BY transition_count DESC;
```

**Results:**

| from_state | to_state | transition_count |
|------------|----------|------------------|
| home | products | 1,245 |
| products | home | 567 |
| products | details | 489 |
| details | cart | 234 |
| cart | checkout | 156 |
| checkout | complete | 134 |

## How It Works

### Step 1: Get Previous State with LAG

```sql
lag(page) OVER (PARTITION BY user_id ORDER BY timestamp) as previous_state
```

For each event, looks back to the previous event for that user:
- `PARTITION BY user_id`: Separate window for each user
- `ORDER BY timestamp`: Previous means earlier in time
- Returns NULL for the first event (no previous state)

**Example for user_1:**

| timestamp | page | previous_state |
|-----------|------|----------------|
| 10:00:00  | home | NULL |
| 10:00:15  | products | home |
| 10:00:45  | cart | products |
| 10:01:00  | checkout | cart |

### Step 2: Filter and Aggregate

```sql
WHERE previous_state IS NOT NULL
GROUP BY previous_state, current_state
```

- Remove first events (NULL previous_state)
- Count occurrences of each transition pair
- Order by count to see most common paths

## Conversion Funnel Analysis

Calculate conversion rates through a specific funnel:

```questdb-sql demo title="E-commerce funnel with conversion rates"
WITH user_pages AS (
  SELECT DISTINCT user_id, page
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
    AND page IN ('home', 'products', 'cart', 'checkout', 'complete')
),
funnel AS (
  SELECT
    count(CASE WHEN page = 'home' THEN 1 END) as step1_home,
    count(CASE WHEN page = 'products' THEN 1 END) as step2_products,
    count(CASE WHEN page = 'cart' THEN 1 END) as step3_cart,
    count(CASE WHEN page = 'checkout' THEN 1 END) as step4_checkout,
    count(CASE WHEN page = 'complete' THEN 1 END) as step5_complete
  FROM user_pages
)
SELECT
  'Home' as step, step1_home as users, 100.0 as conversion_rate
FROM funnel
UNION ALL
SELECT 'Products', step2_products, (step2_products * 100.0 / step1_home)
FROM funnel
UNION ALL
SELECT 'Cart', step3_cart, (step3_cart * 100.0 / step1_home)
FROM funnel
UNION ALL
SELECT 'Checkout', step4_checkout, (step4_checkout * 100.0 / step1_home)
FROM funnel
UNION ALL
SELECT 'Complete', step5_complete, (step5_complete * 100.0 / step1_home)
FROM funnel;
```

**Results:**

| step | users | conversion_rate |
|------|-------|-----------------|
| Home | 10,000 | 100.00% |
| Products | 6,500 | 65.00% |
| Cart | 2,300 | 23.00% |
| Checkout | 1,800 | 18.00% |
| Complete | 1,500 | 15.00% |

This shows that 85% of users who reach checkout complete the purchase (1,500 / 1,800).

## Session-Based Flow Analysis

Group transitions within sessions (defined by inactivity timeout):

```questdb-sql demo title="Flow analysis within sessions"
WITH session_events AS (
  SELECT
    user_id,
    page,
    timestamp,
    lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) as prev_timestamp,
    SUM(CASE
      WHEN timestamp - lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) > 1800000000
        OR lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) IS NULL
      THEN 1
      ELSE 0
    END) OVER (PARTITION BY user_id ORDER BY timestamp) as session_id
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
),
transitions AS (
  SELECT
    user_id,
    session_id,
    page as current_state,
    lag(page) OVER (PARTITION BY user_id, session_id ORDER BY timestamp) as previous_state
  FROM session_events
)
SELECT
  previous_state as from_state,
  current_state as to_state,
  count(*) as transition_count,
  count(DISTINCT user_id) as unique_users
FROM transitions
WHERE previous_state IS NOT NULL
GROUP BY previous_state, current_state
ORDER BY transition_count DESC;
```

**Key points:**
- Sessions defined by 30-minute inactivity (1800000000 microseconds)
- Transitions counted within sessions only
- Includes unique user count for each transition

## Visualizing in Grafana/Plotly

Format output for Sankey diagram tools:

```questdb-sql demo title="Sankey diagram data format"
WITH transitions AS (
  SELECT
    page as current_state,
    lag(page) OVER (PARTITION BY user_id ORDER BY timestamp) as previous_state
  FROM user_events
  WHERE timestamp >= dateadd('d', -1, now())
)
SELECT
  previous_state as source,
  current_state as target,
  count(*) as value
FROM transitions
WHERE previous_state IS NOT NULL
  AND previous_state != current_state  -- Exclude self-loops
GROUP BY previous_state, current_state
HAVING count(*) >= 10  -- Minimum flow threshold
ORDER BY value DESC;
```

This format works directly with:
- **Plotly**: `go.Sankey(node=[...], link=[source, target, value])`
- **D3.js**: Standard Sankey input format
- **Grafana Flow plugin**: Source/target/value format

## Multi-Step Path Analysis

Find most common complete paths (not just transitions):

```questdb-sql demo title="Most common 3-step user paths"
WITH paths AS (
  SELECT
    user_id,
    page,
    lag(page, 1) OVER (PARTITION BY user_id ORDER BY timestamp) as prev_1,
    lag(page, 2) OVER (PARTITION BY user_id ORDER BY timestamp) as prev_2,
    timestamp
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
)
SELECT
  prev_2 || ' → ' || prev_1 || ' → ' || page as path,
  count(*) as occurrences,
  count(DISTINCT user_id) as unique_users
FROM paths
WHERE prev_2 IS NOT NULL
GROUP BY path
ORDER BY occurrences DESC
LIMIT 20;
```

**Results:**

| path | occurrences | unique_users |
|------|-------------|--------------|
| home → products → details | 1,234 | 987 |
| products → details → cart | 892 | 765 |
| home → products → home | 654 | 543 |
| cart → checkout → complete | 543 | 543 |

## Filter by Successful Conversions

Analyze only paths that led to conversion:

```questdb-sql demo title="Paths of users who converted"
WITH converting_users AS (
  SELECT DISTINCT user_id
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
    AND page = 'purchase_complete'
),
transitions AS (
  SELECT
    e.user_id,
    e.page as current_state,
    lag(e.page) OVER (PARTITION BY e.user_id ORDER BY e.timestamp) as previous_state
  FROM user_events e
  INNER JOIN converting_users cu ON e.user_id = cu.user_id
  WHERE e.timestamp >= dateadd('d', -7, now())
)
SELECT
  previous_state as from_state,
  current_state as to_state,
  count(*) as transition_count
FROM transitions
WHERE previous_state IS NOT NULL
GROUP BY previous_state, current_state
ORDER BY transition_count DESC;
```

This shows the paths taken by users who successfully completed a purchase.

## Drop-Off Analysis

Identify where users exit the funnel:

```questdb-sql demo title="Last page visited before exit"
WITH user_last_page AS (
  SELECT
    user_id,
    page,
    timestamp,
    row_number() OVER (PARTITION BY user_id ORDER BY timestamp DESC) as rn
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
),
non_converters AS (
  SELECT ulp.user_id, ulp.page as exit_page
  FROM user_last_page ulp
  WHERE ulp.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM user_events e
      WHERE e.user_id = ulp.user_id
        AND e.page = 'purchase_complete'
        AND e.timestamp >= dateadd('d', -7, now())
    )
)
SELECT
  exit_page,
  count(*) as exit_count,
  (count(*) * 100.0 / (SELECT count(*) FROM non_converters)) as exit_percentage
FROM non_converters
GROUP BY exit_page
ORDER BY exit_count DESC;
```

**Results:**

| exit_page | exit_count | exit_percentage |
|-----------|------------|-----------------|
| products | 3,456 | 42.5% |
| details | 1,234 | 15.2% |
| cart | 987 | 12.1% |
| home | 876 | 10.8% |

Shows that most users who don't convert exit from the products page.

## Time-Based Flow Analysis

Analyze how quickly users move through states:

```questdb-sql demo title="Average time between transitions"
WITH transitions AS (
  SELECT
    page as current_state,
    lag(page) OVER (PARTITION BY user_id ORDER BY timestamp) as previous_state,
    timestamp - lag(timestamp) OVER (PARTITION BY user_id ORDER BY timestamp) as time_diff_micros
  FROM user_events
  WHERE timestamp >= dateadd('d', -7, now())
)
SELECT
  previous_state as from_state,
  current_state as to_state,
  count(*) as transition_count,
  cast(avg(time_diff_micros) / 1000000 as int) as avg_seconds
FROM transitions
WHERE previous_state IS NOT NULL
GROUP BY previous_state, current_state
HAVING count(*) >= 100
ORDER BY avg_seconds DESC;
```

**Results:**

| from_state | to_state | transition_count | avg_seconds |
|------------|----------|------------------|-------------|
| cart | checkout | 1,234 | 245 |
| details | cart | 2,345 | 180 |
| products | details | 3,456 | 45 |
| home | products | 4,567 | 12 |

Shows users spend an average of 4 minutes deciding to checkout from cart.

## Performance Considerations

**Index on user_id and timestamp:**
```sql
-- Ensure table is partitioned by timestamp
CREATE TABLE user_events (
  timestamp TIMESTAMP,
  user_id SYMBOL,
  page SYMBOL
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**Limit time range:**
```sql
WHERE timestamp >= dateadd('d', -7, now())
```

**Pre-aggregate for dashboards:**
```sql
-- Create hourly summary table
CREATE TABLE user_flow_hourly AS
SELECT
  timestamp_floor('h', timestamp) as hour,
  previous_state,
  current_state,
  count(*) as transitions
FROM (
  SELECT
    timestamp,
    page as current_state,
    lag(page) OVER (PARTITION BY user_id ORDER BY timestamp) as previous_state
  FROM user_events
)
WHERE previous_state IS NOT NULL
GROUP BY hour, previous_state, current_state;
```

:::tip When to Use Sankey vs Funnel
- **Sankey diagrams**: Show all possible paths and their volumes (exploratory analysis)
- **Funnel charts**: Show conversion through a specific linear path (monitoring KPIs)
- **Drop-off analysis**: Identify specific pain points where users exit
:::

:::warning Session Definition
Choose appropriate session timeout based on your use case:
- **E-commerce**: 30 minutes typical
- **Content sites**: 60+ minutes (users may pause to read)
- **Mobile apps**: 5-10 minutes (shorter attention spans)
:::

:::info Related Documentation
- [LAG window function](/docs/reference/function/window/#lag)
- [Window functions overview](/docs/reference/sql/select/#window-functions)
- [PARTITION BY](/docs/reference/sql/select/#partition-by)
- [Session windows pattern](/playbook/sql/time-series/session-windows)
:::
