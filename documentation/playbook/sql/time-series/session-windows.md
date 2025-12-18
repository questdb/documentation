---
title: Calculate Sessions and Elapsed Time
sidebar_label: Session windows
description: Identify sessions by detecting state changes and calculate elapsed time between events using window functions
---

Calculate sessions and elapsed time by identifying when state changes occur in time-series data. This "flip-flop" or "session" pattern is useful for analyzing user sessions, vehicle rides, machine operating cycles, or any scenario where you need to track duration between state transitions.

## Problem: Track Time Between State Changes

You have a table tracking vehicle lock status over time and want to calculate ride duration. A ride starts when `lock_status` changes from `true` (locked) to `false` (unlocked), and ends when it changes back to `true`.

**Table schema:**
```sql
CREATE TABLE vehicle_events (
  vehicle_id SYMBOL,
  lock_status BOOLEAN,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY;
```

**Sample data:**

| timestamp | vehicle_id | lock_status |
|-----------|------------|-------------|
| 10:00:00  | V001       | true        |
| 10:05:00  | V001       | false       | ← Ride starts
| 10:25:00  | V001       | true        | ← Ride ends (20 min)
| 10:30:00  | V001       | false       | ← Next ride starts
| 10:45:00  | V001       | true        | ← Ride ends (15 min)

You want to calculate the duration of each ride.

## Solution: Session Detection with Window Functions

Use window functions to detect state changes, assign session IDs, then calculate durations:

```questdb-sql demo title="Calculate ride duration from lock status changes"
WITH prevEvents AS (
  SELECT *,
    first_value(CASE WHEN lock_status=false THEN 0 WHEN lock_status=true THEN 1 END)
      OVER (
        PARTITION BY vehicle_id ORDER BY timestamp
        ROWS 1 PRECEDING EXCLUDE CURRENT ROW
      ) as prev_status
  FROM vehicle_events
  WHERE timestamp IN today()
),
ride_sessions AS (
  SELECT *,
    SUM(CASE
      WHEN lock_status = true AND prev_status = 0 THEN 1
      WHEN lock_status = false AND prev_status = 1 THEN 1
      ELSE 0
    END) OVER (PARTITION BY vehicle_id ORDER BY timestamp) as ride
  FROM prevEvents
),
global_sessions AS (
  SELECT *, concat(vehicle_id, '#', ride) as session
  FROM ride_sessions
),
totals AS (
  SELECT
    first(timestamp) as ts,
    session,
    FIRST(lock_status) as lock_status,
    first(vehicle_id) as vehicle_id
  FROM global_sessions
  GROUP BY session
),
prev_ts AS (
  SELECT *,
    first_value(timestamp::long) OVER (
      PARTITION BY vehicle_id ORDER BY timestamp
      ROWS 1 PRECEDING EXCLUDE CURRENT ROW
    ) as prev_ts
  FROM totals
)
SELECT
  timestamp as ride_end,
  vehicle_id,
  (timestamp::long - prev_ts) / 1000000 as duration_seconds
FROM prev_ts
WHERE lock_status = false AND prev_ts IS NOT NULL;
```

**Results:**

| ride_end | vehicle_id | duration_seconds |
|----------|------------|------------------|
| 10:25:00 | V001       | 1200             |
| 10:45:00 | V001       | 900              |

## How It Works

The query uses a five-step approach:

### 1. Get Previous Status (`prevEvents`)

```sql
first_value(...) OVER (... ROWS 1 PRECEDING EXCLUDE CURRENT ROW)
```

For each row, get the status from the previous row. Convert boolean to numbers (0/1) since `first_value` requires numeric types.

### 2. Detect State Changes (`ride_sessions`)

```sql
SUM(CASE WHEN lock_status != prev_status THEN 1 ELSE 0 END)
  OVER (PARTITION BY vehicle_id ORDER BY timestamp)
```

Whenever status changes, increment a counter. This creates sequential session IDs for each vehicle:
- Ride 0: Initial state
- Ride 1: After first state change
- Ride 2: After second state change
- ...

### 3. Create Global Session IDs (`global_sessions`)

```sql
concat(vehicle_id, '#', ride)
```

Combine vehicle_id with ride number to create unique session identifiers across all vehicles.

### 4. Get Session Start Times (`totals`)

```sql
SELECT first(timestamp) as ts, ...
FROM global_sessions
GROUP BY session
```

For each session, get the timestamp and status at the beginning of that session.

### 5. Calculate Duration (`prev_ts`)

```sql
first_value(timestamp::long) OVER (... ROWS 1 PRECEDING)
```

Get the timestamp from the previous session (for the same vehicle), then calculate duration by subtracting.

### Filter for Rides

```sql
WHERE lock_status = false
```

Only show sessions where status is `false` (unlocked), which represents completed rides. The duration is from the previous session end (lock) to this session start (unlock).

## Monthly Aggregation

Calculate total ride duration per vehicle per month:

```questdb-sql demo title="Monthly ride duration by vehicle"
WITH prevEvents AS (
  SELECT *,
    first_value(CASE WHEN lock_status=false THEN 0 WHEN lock_status=true THEN 1 END)
      OVER (
        PARTITION BY vehicle_id ORDER BY timestamp
        ROWS 1 PRECEDING EXCLUDE CURRENT ROW
      ) as prev_status
  FROM vehicle_events
  WHERE timestamp >= dateadd('M', -3, now())
),
ride_sessions AS (
  SELECT *,
    SUM(CASE
      WHEN lock_status = true AND prev_status = 0 THEN 1
      WHEN lock_status = false AND prev_status = 1 THEN 1
      ELSE 0
    END) OVER (PARTITION BY vehicle_id ORDER BY timestamp) as ride
  FROM prevEvents
),
global_sessions AS (
  SELECT *, concat(vehicle_id, '#', ride) as session
  FROM ride_sessions
),
totals AS (
  SELECT
    first(timestamp) as ts,
    session,
    FIRST(lock_status) as lock_status,
    first(vehicle_id) as vehicle_id
  FROM global_sessions
  GROUP BY session
),
prev_ts AS (
  SELECT *,
    first_value(timestamp::long) OVER (
      PARTITION BY vehicle_id ORDER BY timestamp
      ROWS 1 PRECEDING EXCLUDE CURRENT ROW
    ) as prev_ts
  FROM totals
)
SELECT
  timestamp_floor('M', timestamp) as month,
  vehicle_id,
  SUM((timestamp::long - prev_ts) / 1000000) as total_ride_duration_seconds,
  COUNT(*) as ride_count
FROM prev_ts
WHERE lock_status = false AND prev_ts IS NOT NULL
GROUP BY month, vehicle_id
ORDER BY month, vehicle_id;
```

## Adapting to Different Use Cases

**User website sessions (1 hour timeout):**
```sql
WITH prevEvents AS (
  SELECT *,
    first_value(timestamp::long) OVER (
      PARTITION BY user_id ORDER BY timestamp
      ROWS 1 PRECEDING EXCLUDE CURRENT ROW
    ) as prev_ts
  FROM page_views
),
sessions AS (
  SELECT *,
    SUM(CASE
      WHEN datediff('h', prev_ts::timestamp, timestamp) > 1 THEN 1
      ELSE 0
    END) OVER (PARTITION BY user_id ORDER BY timestamp) as session_id
  FROM prevEvents
)
SELECT
  user_id,
  session_id,
  min(timestamp) as session_start,
  max(timestamp) as session_end,
  datediff('s', min(timestamp), max(timestamp)) as session_duration_seconds,
  count(*) as page_views
FROM sessions
GROUP BY user_id, session_id;
```

**Machine operating cycles:**
```sql
-- When machine changes from 'off' to 'running' to 'off'
WITH prevStatus AS (
  SELECT *,
    first_value(status) OVER (
      PARTITION BY machine_id ORDER BY timestamp
      ROWS 1 PRECEDING EXCLUDE CURRENT ROW
    ) as prev_status
  FROM machine_status
),
cycles AS (
  SELECT *,
    SUM(CASE
      WHEN status != prev_status THEN 1
      ELSE 0
    END) OVER (PARTITION BY machine_id ORDER BY timestamp) as cycle
  FROM prevStatus
)
SELECT
  machine_id,
  cycle,
  min(timestamp) as cycle_start,
  max(timestamp) as cycle_end
FROM cycles
WHERE status = 'running'
GROUP BY machine_id, cycle;
```

## Performance Considerations

**Filter by timestamp first:**
```sql
-- Good: Reduce dataset before windowing
WHERE timestamp >= dateadd('M', -1, now())
```

**Partition by high-cardinality column:**
```sql
-- Good: Each vehicle processed independently
PARTITION BY vehicle_id

-- Avoid: All vehicles in one partition (slow)
-- (no PARTITION BY)
```

**Limit output:**
```sql
-- For testing, limit to specific vehicles
WHERE vehicle_id IN ('V001', 'V002', 'V003')
```

## Alternative: Using LAG (QuestDB 8.0+)

With `LAG` function, the query is simpler:

```sql
WITH prevEvents AS (
  SELECT *,
    LAG(lock_status) OVER (PARTITION BY vehicle_id ORDER BY timestamp) as prev_status,
    LAG(timestamp) OVER (PARTITION BY vehicle_id ORDER BY timestamp) as prev_timestamp
  FROM vehicle_events
  WHERE timestamp IN today()
)
SELECT
  timestamp as ride_end,
  vehicle_id,
  datediff('s', prev_timestamp, timestamp) as duration_seconds
FROM prevEvents
WHERE lock_status = false    -- Ride ended (locked)
  AND prev_status = true      -- Previous state was unlocked (riding)
  AND prev_timestamp IS NOT NULL;
```

This directly accesses the previous row's values without converting to numbers.

:::tip Common Session Patterns
This pattern applies to many scenarios:
- **User sessions**: Time between last action and timeout
- **IoT device cycles**: Power on/off cycles
- **Vehicle trips**: Ignition on/off periods
- **Connection sessions**: Login/logout tracking
- **Process steps**: Start/complete state transitions
:::

:::warning First Row Handling
The first row in each partition will have `NULL` for previous values. Always filter these out with `WHERE prev_ts IS NOT NULL` or similar conditions.
:::

:::info Related Documentation
- [first_value() window function](/docs/reference/function/window/#first_value)
- [LAG window function](/docs/reference/function/window/#lag)
- [Window functions](/docs/reference/sql/select/#window-functions)
- [datediff()](/docs/reference/function/date-time/#datediff)
:::
