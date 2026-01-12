---
title: ALTER MATERIALIZED VIEW SET REFRESH
sidebar_label: SET REFRESH
description:
  ALTER MATERIALIZED VIEW SET REFRESH SQL keyword reference documentation.
---

Changes a materialized view's refresh strategy and parameters without recreating
the view.

## Syntax

```
ALTER MATERIALIZED VIEW viewName SET REFRESH
[ IMMEDIATE | MANUAL | EVERY interval [ START timestamp ] [ TIME ZONE timezone ] ]
[ PERIOD ( LENGTH length [ TIME ZONE timezone ] [ DELAY delay ] ) ]
[ PERIOD ( SAMPLE BY INTERVAL ) ]
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view to modify |
| `IMMEDIATE` | Refresh after each base table transaction |
| `MANUAL` | Refresh only when explicitly triggered |
| `EVERY interval` | Refresh on a timer (e.g., `10m`, `1h`, `1d`) |
| `START timestamp` | When to begin the timer schedule |
| `TIME ZONE` | Timezone for schedule alignment |
| `PERIOD LENGTH` | Define fixed-length refresh periods |
| `PERIOD SAMPLE BY INTERVAL` | Match period to the view's `SAMPLE BY` interval |
| `DELAY` | Grace period before period closes |

## When to use

Change refresh strategy when:

- Switching from real-time (`IMMEDIATE`) to batched (`EVERY`) for performance
- Adding period-based refresh for data that arrives at fixed intervals
- Switching to `MANUAL` for full control during maintenance windows

## Examples

### Switch to timer-based refresh

```questdb-sql title="Refresh every 12 hours"
ALTER MATERIALIZED VIEW trades_hourly
SET REFRESH EVERY 12h START '2025-12-31T00:00:00Z' TIME ZONE 'Europe/London';
```

### Add period-based refresh

```questdb-sql title="Daily periods with 1-hour delay for late data"
ALTER MATERIALIZED VIEW trades_daily
SET REFRESH PERIOD (LENGTH 1d DELAY 1h);
```

### Match period to SAMPLE BY

```questdb-sql title="Period matches view's aggregation interval"
ALTER MATERIALIZED VIEW trades_hourly
SET REFRESH PERIOD (SAMPLE BY INTERVAL);
```

### Switch to immediate refresh

```questdb-sql title="Real-time refresh"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH IMMEDIATE;
```

### Switch to manual refresh

```questdb-sql title="Manual control"
ALTER MATERIALIZED VIEW trades_hourly SET REFRESH MANUAL;
```

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Existing data | Preserved; only future refresh behavior changes |
| Pending refresh | Completes before new strategy takes effect |
| Timer reset | `EVERY` schedule resets based on `START` time |

## Permissions (Enterprise)

Changing refresh settings requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `invalid interval` | Timer interval is invalid or below minimum (`1m`) |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [REFRESH MATERIALIZED VIEW](/docs/query/sql/refresh-mat-view/)
