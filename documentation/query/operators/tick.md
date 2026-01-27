---
title: TICK interval syntax
sidebar_label: TICK intervals
description:
  TICK (Temporal Interval Calendar Kit) - a powerful syntax for expressing
  complex temporal intervals in QuestDB queries.
---

TICK (Temporal Interval Calendar Kit) is a syntax for expressing complex
temporal intervals in a single string. Use it with the `IN` operator to query
multiple time ranges, schedules, and patterns efficiently.

```questdb-sql
-- NYSE trading hours on workdays for January
SELECT * FROM trades
WHERE ts IN '2024-01-[01..31]T09:30@America/New_York#workday;6h30m';
```

This single expression generates interval scans for every weekday in January,
each starting at 9:30 AM New York time and lasting 6 hours 30 minutes.

:::tip Key Points
- TICK = declarative syntax for complex time intervals in `WHERE ts IN '...'`
- **Syntax order:** `date@timezone#dayFilter;duration`
- Each generated interval uses optimized [interval scan](/docs/concepts/deep-dive/interval-scan/) (binary search)
- Use `[a,b,c]` for values, `[a..b]` for ranges, `#workday` for day filters
- Overlapping intervals are automatically merged
:::

## Grammar summary

```
TICK_EXPR     = DATE_PART [TIME] [TIMEZONE] [FILTER] [DURATION]

DATE_PART     = literal_date                    -- '2024-01-15'
              | date_list                       -- '[2024-01-15, 2024-01-20]'
              | date_variable                   -- '$today', '$now - 2h'
              | bracket_expansion               -- '2024-01-[10..15]'
              | iso_week                        -- '2024-W01-1'

TIME          = 'T' time_value                  -- 'T09:30'
              | 'T' bracket_expansion           -- 'T[09:00,14:30]'

TIMEZONE      = '@' iana_name                   -- '@America/New_York'
              | '@' offset                      -- '@+02:00', '@UTC'

FILTER        = '#workday' | '#weekend'         -- business day filters
              | '#' day_list                    -- '#Mon,Wed,Fri'

DURATION      = ';' duration_value              -- ';6h30m'

date_variable = '$today' | '$yesterday' | '$tomorrow' | '$now'
              | date_variable ('+' | '-') amount unit

unit          = 'y' | 'M' | 'w' | 'd' | 'bd' | 'h' | 'm' | 's' | 'T' | 'u' | 'n'
              --  ↑    ↑         ↑    ↑
              -- 'bd' (business days) valid only in date arithmetic, not duration
```

## Why TICK

Traditional approaches to complex time queries require:
- Multiple `UNION ALL` statements
- Application-side date generation
- Complex `BETWEEN` logic with many `OR` clauses

TICK replaces all of these with a declarative syntax that generates multiple
optimized interval scans from a single expression.

**Use TICK when:**
- Querying relative time windows (`$now - 1h..$now`, `$today`)
- Building rolling windows with business day calculations
- Working with schedules (workdays, weekends, specific days)
- Needing timezone-aware time windows with DST handling
- Querying multiple non-contiguous dates or time windows

**Use simple `IN` or `BETWEEN` when:**
- Single continuous time range with absolute dates (`WHERE ts IN '2024-01-15'`)
- Simple date/time literals without patterns or variables

## Quick start

Common patterns to get started:

```questdb-sql
-- Last hour of data
WHERE ts IN '$now - 1h..$now'

-- Last 30 minutes
WHERE ts IN '$now - 30m..$now'

-- Today's data (full day)
WHERE ts IN '$today'

-- Last 5 business days
WHERE ts IN '$today-5bd..$today-1bd'

-- Workdays only with time window
WHERE ts IN '2024-01-[01..31]T09:00#workday;8h'

-- Multiple times on one day
WHERE ts IN '2024-01-15T[09:00,12:00,18:00];1h'

-- With timezone
WHERE ts IN '2024-01-15T09:30@America/New_York;6h30m'
```

## Syntax order

Components must appear in this order:

```
date @ timezone # dayFilter ; duration
 │       │          │           │
 │       │          │           └─ interval length (e.g., ;6h30m)
 │       │          └─ day filter (e.g., #workday)
 │       └─ timezone (e.g., @America/New_York)
 └─ date/time with optional brackets (e.g., 2024-01-[01..31]T09:30)
```

**Examples showing the order:**

| Expression | Components used |
|------------|-----------------|
| `'2024-01-15'` | date only |
| `'2024-01-15T09:30'` | date + time |
| `'2024-01-15T09:30@UTC'` | date + time + timezone |
| `'2024-01-15T09:30#workday'` | date + time + filter |
| `'2024-01-15T09:30;1h'` | date + time + duration |
| `'2024-01-15T09:30@America/New_York#workday;6h30m'` | all components |

## Quick reference

| Feature | Syntax | Example |
|---------|--------|---------|
| Bracket expansion | `[a,b,c]` | `'2024-01-[10,15,20]'` |
| Range expansion | `[a..b]` | `'2024-01-[10..15]'` |
| Date list | `[date1,date2]` | `'[2024-01-15,2024-03-20]'` |
| Time list | `T[time1,time2]` | `'2024-01-15T[09:00,14:30]'` |
| Timezone | `@timezone` | `'T09:00@America/New_York'` |
| Day filter | `#filter` | `'#workday'`, `'#Mon,Wed,Fri'` |
| Duration | `;duration` | `';6h30m'`, `';1h'` |
| ISO week | `YYYY-Www-D` | `'2024-W01-1'` |
| Date variable | `$var` | `'$today'`, `'$now - 2h'` |
| Date arithmetic | `$var ± Nu` | `'$today+5bd'`, `'$now-30m'`, `'$today+1M'` |
| Variable range | `$start..$end` | `'$now-2h..$now'`, `'$today..$today+5d'` |

## Interval behavior

### Whitespace

Whitespace inside brackets is allowed and ignored:

```questdb-sql
-- These are equivalent:
'2024-01-[10,15,20]'
'2024-01-[ 10 , 15 , 20 ]'
```

### Interval merging

When expanded intervals overlap, they are automatically merged:

```questdb-sql
'2024-01-15T[09:00,10:30];2h'
-- 09:00-11:00 overlaps with 10:30-12:30
-- Result: single merged interval 09:00-12:30
```

This ensures efficient query execution without duplicate scans.

### Optional brackets

Date variable expressions can be written with or without brackets:

```questdb-sql
-- These are equivalent:
WHERE ts IN '[$today]'
WHERE ts IN '$today'

-- Ranges work without brackets:
WHERE ts IN '$today..$today+5d'
WHERE ts IN '$now - 1h..$now'

-- Suffixes work as expected:
WHERE ts IN '$todayT09:30'         -- time suffix
WHERE ts IN '$now - 1h;30m'        -- duration suffix
WHERE ts IN '$today@Europe/London' -- timezone suffix
```

Brackets are still required for comma-separated lists:

```questdb-sql
-- Brackets required for lists:
WHERE ts IN '[$today, $yesterday, 2024-01-15]'
```

## Bracket expansion

Brackets expand a single field into multiple values:

```questdb-sql
-- Days 10, 15, and 20 of January
SELECT * FROM trades WHERE ts IN '2024-01-[10,15,20]';

-- Days 10 through 15 (inclusive range)
SELECT * FROM trades WHERE ts IN '2024-01-[10..15]';

-- Mixed: specific values and ranges
SELECT * FROM trades WHERE ts IN '2024-01-[5,10..12,20]';
```

### Multiple brackets (Cartesian product)

Multiple bracket groups produce all combinations:

```questdb-sql
-- January and June, 10th and 15th = 4 intervals
SELECT * FROM trades WHERE ts IN '2024-[01,06]-[10,15]';
-- Expands to: 2024-01-10, 2024-01-15, 2024-06-10, 2024-06-15
```

### Bracket positions

Brackets work in any numeric field:

| Field | Example | Result |
|-------|---------|--------|
| Month | `'2024-[01,06]-15'` | Jan 15, Jun 15 |
| Day | `'2024-01-[10,15]'` | 10th, 15th |
| Hour | `'2024-01-10T[09,14]:30'` | 09:30, 14:30 |
| Minute | `'2024-01-10T10:[00,30]'` | 10:00, 10:30 |

## Date lists

Start with `[` for non-contiguous dates:

```questdb-sql
-- Specific dates
SELECT * FROM trades WHERE ts IN '[2024-01-15,2024-03-20,2024-06-01]';

-- With nested bracket expansion
SELECT * FROM trades WHERE ts IN '[2024-12-31,2025-01-[01..05]]';
-- Expands to: Dec 31, Jan 1, Jan 2, Jan 3, Jan 4, Jan 5
```

### Date lists with time suffix

```questdb-sql
-- 09:30 on specific dates
SELECT * FROM trades WHERE ts IN '[2024-01-15,2024-01-20]T09:30';

-- Trading hours on specific dates
SELECT * FROM trades WHERE ts IN '[2024-01-15,2024-01-20]T09:30;6h30m';
```

## Time lists

Specify multiple complete times with colons inside brackets:

```questdb-sql
-- Morning and evening sessions
SELECT * FROM trades WHERE ts IN '2024-01-15T[09:00,18:00];1h';

-- Three daily check-ins
SELECT * FROM metrics WHERE ts IN '2024-01-15T[08:00,12:00,18:00];30m';
```

:::warning Time list vs numeric expansion

The presence of `:` inside the bracket determines the mode:

| Syntax | Mode | Expands to |
|--------|------|------------|
| `T[09,14]:30` | Numeric expansion (hour field) | 09:30 and 14:30 |
| `T[09:00,14:30]` | Time list (complete times) | 09:00 and 14:30 |

Use **numeric expansion** when times share the same minutes (e.g., both at :30).
Use **time lists** when times differ completely (e.g., 09:00 and 14:30).

:::

## Timezone support

Add `@timezone` after the time component:

```questdb-sql
-- 09:30 in New York time (automatically handles DST)
SELECT * FROM trades WHERE ts IN '2024-01-15T09:30@America/New_York';

-- Numeric offset
SELECT * FROM trades WHERE ts IN '2024-01-15T09:30@+02:00';

-- UTC
SELECT * FROM trades WHERE ts IN '2024-01-15T09:30@UTC';
```

### Supported timezone formats

| Format | Example |
|--------|---------|
| IANA name | `@America/New_York`, `@Europe/London` |
| Offset | `@+03:00`, `@-05:00` |
| Compact offset | `@+0300`, `@-0500` |
| Hour-only | `@+03`, `@-05` |
| UTC/GMT | `@UTC`, `@GMT`, `@Z` |

### Per-element timezones

Each date or time can have its own timezone:

```questdb-sql
-- Market opens in different cities
SELECT * FROM trades
WHERE ts IN '2024-01-15T[09:30@America/New_York,08:00@Europe/London,09:00@Asia/Tokyo];6h';

-- Per-date timezone (comparing same local time in winter vs summer)
SELECT * FROM trades
WHERE ts IN '[2024-01-15@Europe/London,2024-07-15@Europe/London]T08:00';
```

## Day-of-week filter

Add `#filter` to include only specific days:

```questdb-sql
-- Workdays only (Monday-Friday)
SELECT * FROM trades WHERE ts IN '2024-01-[01..31]#workday';

-- Weekends only
SELECT * FROM logs WHERE ts IN '2024-01-[01..31]T02:00#weekend;4h';

-- Specific days
SELECT * FROM attendance WHERE ts IN '2024-01-[01..31]#Mon,Wed,Fri';
```

### Available filters

| Filter | Days included |
|--------|---------------|
| `#workday` or `#wd` | Monday - Friday |
| `#weekend` | Saturday, Sunday |
| `#Mon`, `#Tue`, etc. | Specific day |
| `#Mon,Wed,Fri` | Multiple days |

Day names are case-insensitive. Both `#Mon` and `#Monday` work.

### Filter with timezone

The filter applies to **local time** before timezone conversion:

```questdb-sql
-- 09:30 New York time, workdays only
-- "Monday" means Monday in New York, not Monday in UTC
SELECT * FROM trades
WHERE ts IN '2024-01-[01..31]T09:30@America/New_York#workday;6h30m';
```

## Duration suffix

Add `;duration` to specify interval length:

```questdb-sql
-- 1-hour intervals
SELECT * FROM trades WHERE ts IN '2024-01-15T09:00;1h';

-- 6 hours 30 minutes (NYSE trading day)
SELECT * FROM trades WHERE ts IN '2024-01-15T09:30;6h30m';

-- Precise sub-second duration
SELECT * FROM hft_data WHERE ts IN '2024-01-15T09:30:00;1s500T';
```

### Time units

| Unit | Name | Description | Duration | Arithmetic |
|------|------|-------------|:--------:|:----------:|
| `y` | Years | Calendar years (handles leap years) | Yes | Yes |
| `M` | Months | Calendar months (handles varying lengths) | Yes | Yes |
| `w` | Weeks | 7 days | Yes | Yes |
| `d` | Days | 24 hours | Yes | Yes |
| `bd` | Business days | Weekdays only (skips Sat/Sun) | No | Yes |
| `h` | Hours | 60 minutes | Yes | Yes |
| `m` | Minutes | 60 seconds | Yes | Yes |
| `s` | Seconds | 1,000 milliseconds | Yes | Yes |
| `T` | Milliseconds | 1,000 microseconds | Yes | Yes |
| `u` | Microseconds | 1,000 nanoseconds | Yes | Yes |
| `n` | Nanoseconds | Base unit | Yes | Yes |

Units are case-sensitive: `M` = months, `m` = minutes, `T` = milliseconds.
The `d` unit also accepts uppercase `D` for backward compatibility.

### Multi-unit durations

Combine units for precise specifications:

```questdb-sql
-- 2 hours, 15 minutes, 30 seconds
';2h15m30s'

-- 500 milliseconds + 250 microseconds
';500T250u'

-- NYSE trading hours
';6h30m'
```

## ISO week dates

Use ISO 8601 week format for weekly schedules:

```questdb-sql
-- Week 1 of 2024 (entire week)
SELECT * FROM trades WHERE ts IN '2024-W01';

-- Monday of week 1 (day 1 = Monday)
SELECT * FROM trades WHERE ts IN '2024-W01-1';

-- Friday of week 1 at 09:00
SELECT * FROM trades WHERE ts IN '2024-W01-5T09:00';
```

### Week bracket expansion

```questdb-sql
-- First 4 weeks of the year
SELECT * FROM trades WHERE ts IN '2024-W[01..04]';

-- Weekdays (Mon-Fri) of week 1
SELECT * FROM trades WHERE ts IN '2024-W01-[1..5]';

-- Every Monday and Friday of weeks 1-4
SELECT * FROM trades WHERE ts IN '2024-W[01..04]-[1,5]';
```

### Day-of-week values

| Value | Day |
|-------|-----|
| 1 | Monday |
| 2 | Tuesday |
| 3 | Wednesday |
| 4 | Thursday |
| 5 | Friday |
| 6 | Saturday |
| 7 | Sunday |

## Date variables

Use dynamic date references that resolve at query time:

| Variable | Description | Interval type | Example value (Jan 22, 2026 at 14:35:22) |
|----------|-------------|---------------|------------------------------------------|
| `$today` | Current day | Full day | `2026-01-22T00:00:00` to `2026-01-22T23:59:59.999999` |
| `$yesterday` | Previous day | Full day | `2026-01-21T00:00:00` to `2026-01-21T23:59:59.999999` |
| `$tomorrow` | Next day | Full day | `2026-01-23T00:00:00` to `2026-01-23T23:59:59.999999` |
| `$now` | Current timestamp | Point-in-time | `2026-01-22T14:35:22.123456` (exact moment) |

:::info Interval vs point-in-time

- **`$today`**, **`$yesterday`**, **`$tomorrow`** produce **full day intervals** (midnight to midnight)
- **`$now`** produces a **point-in-time** (exact moment with microsecond precision)

Without a duration suffix, `$now` matches only the exact microsecond. Add a duration to create a window:

```questdb-sql
-- Point-in-time: matches only the exact microsecond (rarely useful alone)
WHERE ts IN '$now'

-- Practical: 1-hour window ending at current moment
WHERE ts IN '$now;1h'

-- Range: last 2 hours
WHERE ts IN '$now - 2h..$now'
```

:::

Variables are case-insensitive: `$TODAY`, `$Today`, and `$today` are equivalent.

### Date arithmetic

Add or subtract time from date variables using any [time unit](#time-units).
All units except `bd` (business days) work in both duration and arithmetic contexts.

```questdb-sql
-- Calendar day arithmetic
'$today + 5d'      -- 5 days from today
'$today - 3d'      -- 3 days ago

-- Business day arithmetic (skips weekends) - arithmetic only
'$today + 1bd'     -- next business day
'$today - 5bd'     -- 5 business days ago

-- Hour/minute/second arithmetic (typically with $now)
'$now - 2h'        -- 2 hours ago
'$now - 30m'       -- 30 minutes ago
'$now - 90s'       -- 90 seconds ago

-- Sub-second precision
'$now - 500T'      -- 500 milliseconds ago
'$now - 100u'      -- 100 microseconds ago

-- Calendar-aware units (handle varying month lengths, leap years)
'$today + 1M'      -- same day next month
'$today + 1y'      -- same day next year
'$today + 2w'      -- 2 weeks from today
```

### Date variable ranges

Generate multiple intervals from start to end:

```questdb-sql
-- Next 5 calendar days
'$today..$today+5d'

-- Next 5 business days (weekdays only)
'$today..$today+5bd'

-- Last work week
'$today-5bd..$today-1bd'

-- Last 2 hours
'$now - 2h..$now'

-- Last 30 minutes
'$now - 30m..$now'

-- Next 3 months
'$today..$today+3M'
```

:::note Ranges vs durations

**Ranges** (`$start..$end`) create a single continuous interval from start to end:

```questdb-sql
-- Single interval: from 2 hours ago until now
'$now - 2h..$now'

-- Single interval: from 3 days ago until today (end of day)
'$today - 3d..$today'
```

**Durations** (`;Nh`) extend from a point by the specified amount:

```questdb-sql
-- Single interval: starting at $now, lasting 2 hours forward
'$now;2h'
```

For multiple discrete intervals, use a list with duration:

```questdb-sql
-- Three separate 1-hour intervals
'[$now - 3h, $now - 2h, $now - 1h];1h'
```
:::

### Mixed date lists

Combine variables with static dates (brackets required for lists):

```questdb-sql
-- Today, yesterday, and a specific date
SELECT * FROM trades WHERE ts IN '[$today, $yesterday, 2024-01-15]';

-- Compare today vs same day last week
SELECT * FROM trades WHERE ts IN '[$today, $today - 7d]T09:30;6h30m';

-- Hourly windows starting 4 hours ago
SELECT * FROM trades WHERE ts IN '[$now - 4h, $now - 3h, $now - 2h, $now - 1h, $now]';
```

## Complete examples

### Trading hours

```questdb-sql
-- NYSE trading hours for January workdays
SELECT * FROM nyse_trades
WHERE ts IN '2024-01-[01..31]T09:30@America/New_York#workday;6h30m';

-- Compare trading sessions across markets
SELECT * FROM global_trades
WHERE ts IN '2024-01-15T[09:30@America/New_York,08:00@Europe/London,09:00@Asia/Tokyo];6h';
```

### Scheduled reports

```questdb-sql
-- Weekly Monday standup (52 weeks)
SELECT * FROM standup_notes
WHERE ts IN '2024-W[01..52]-1T09:00;1h';

-- Bi-weekly Friday reports
SELECT * FROM reports
WHERE ts IN '2024-W[02,04,06,08,10,12]-5T14:00;2h';
```

### Rolling windows

```questdb-sql
-- Last 5 trading days at market open
SELECT * FROM prices
WHERE ts IN '$today-5bd..$today-1bd T09:30@America/New_York;1m';

-- Same hour comparison across recent days
SELECT * FROM metrics
WHERE ts IN '[$today-2d,$yesterday,$today]T14:00;1h';
```

### Real-time monitoring

```questdb-sql
-- Last 2 hours of data
SELECT * FROM sensor_data
WHERE ts IN '$now - 2h..$now';

-- Last 30 minutes
SELECT * FROM metrics
WHERE ts IN '$now - 30m..$now';

-- Last 90 seconds (useful for dashboards)
SELECT * FROM logs
WHERE ts IN '$now - 90s..$now';

-- Sub-second precision for high-frequency data
SELECT * FROM hft_data
WHERE ts IN '$now - 500T..$now';

-- Hourly snapshots from last 4 hours
SELECT * FROM trades
WHERE ts IN '[$now - 4h, $now - 3h, $now - 2h, $now - 1h, $now];5m';
```

### Maintenance windows

```questdb-sql
-- Weekend maintenance (every Sat/Sun at 02:00)
SELECT * FROM system_logs
WHERE ts IN '2024-01-[01..31]T02:00#weekend;4h';

-- Quarterly maintenance (first Sunday of each quarter)
SELECT * FROM maintenance
WHERE ts IN '2024-[01,04,07,10]-[01..07]T02:00#Sun;6h';
```

## Performance

TICK expressions are fully optimized by QuestDB's query engine:

1. **Interval scan** — Each generated interval uses binary search on the
   [designated timestamp](/docs/concepts/designated-timestamp/)
2. **Partition pruning** — Partitions outside all intervals are skipped entirely
3. **Parallel expansion** — Complex expressions generate multiple efficient
   interval scans

A TICK expression like `'2024-01-[01..31]T09:00#workday;8h'` (22 workdays)
performs comparably to 22 separate simple queries, but with a single parse.

Use [EXPLAIN](/docs/query/sql/explain/) to see the generated intervals:

```questdb-sql
EXPLAIN SELECT * FROM trades
WHERE ts IN '2024-01-[15,16,17]T09:00;1h';
```

## Error messages

| Error | Cause |
|-------|-------|
| `Unclosed '[' in interval` | Missing closing bracket |
| `Empty bracket expansion` | Nothing inside brackets |
| `Range must be ascending: 15..10` | End before start in range |
| `Invalid timezone: xyz` | Unknown timezone |
| `Unknown date variable: $invalid` | Unrecognized variable |
| `Invalid day name: xyz` | Unknown day in filter |

## See also

- [Designated timestamp](/docs/concepts/designated-timestamp/) — Required for interval scan optimization
- [Interval scan](/docs/concepts/deep-dive/interval-scan/) — How QuestDB optimizes time queries
- [WHERE clause](/docs/query/sql/where/) — Full WHERE syntax reference
- [Date/time operators](/docs/query/operators/date-time/) — Additional timestamp operators
