---
title: Working with time zones
sidebar_label: Time zones
description:
  How to filter and convert timestamps by time zone in QuestDB using TICK
  syntax and conversion functions.
---

QuestDB stores all timestamps in UTC without time zone information. To query
data at your local time, use [TICK syntax](/docs/query/operators/tick/). To
display results in local time, use conversion functions.

:::tip Key Points
- All timestamps are stored in UTC — no time zone information is preserved
- Use [TICK syntax](/docs/query/operators/tick/) with `@timezone` to query data at your local time
- Prefer full time zone names (`America/New_York`) over abbreviations (`EST`)
- Use `to_timezone()` only when displaying local time in results
:::

## How to refer to time zones

QuestDB uses the [IANA tz database](https://en.wikipedia.org/wiki/Tz_database).
Specify time zones by geographic region or UTC offset:

| Format | Example | Recommended? |
|--------|---------|--------------|
| Geographic region | `America/New_York` | ✅ Best |
| UTC offset | `+02:00`, `-05:00` | ✅ Good |
| Abbreviation | `EST`, `CST` | ⚠️ Avoid |

**Avoid abbreviations** — the same abbreviation often maps to multiple time
zones. For example, `CST` could mean U.S. Central Standard Time or China
Standard Time. QuestDB can only recognize one, leading to unexpected results.

For valid time zone names, see the
[IANA time zone database](https://www.iana.org/time-zones).

:::note

The tz database includes historic transitions. QuestDB applies the correct
offset based on the timestamp value, accounting for historical daylight saving
time changes.

:::

## Querying by local time

You're in New York and want trades from 9am your time. Use
[TICK syntax](/docs/query/operators/tick/) with `@timezone`:

```questdb-sql
SELECT * FROM trades
WHERE ts IN '2024-01-15T09:00@America/New_York;1h';
```

TICK converts your local time to UTC intervals, enabling efficient
[interval scans](/docs/concepts/deep-dive/interval-scan/). More examples:

```questdb-sql
-- London business hours (09:00-17:00) for January workdays
SELECT * FROM trades
WHERE ts IN '2024-01-[01..31]T09:00@Europe/London#wd;8h';

-- NYSE trading hours (09:30-16:00 Eastern)
SELECT * FROM trades
WHERE ts IN '2024-01-[01..31]T09:30@America/New_York#wd;6h30m';

-- Last 5 business days, Tokyo morning session
SELECT * FROM trades
WHERE ts IN '[$today-5bd..$today-1bd]T09:00@Asia/Tokyo;2h30m';
```

TICK handles DST transitions automatically — a 9 AM start time in New York
maps to different UTC times in winter vs summer.

### Why TICK instead of conversion functions

TICK generates UTC intervals at query planning time, enabling binary search.
Converting each row forces a full table scan:

```questdb-sql
-- Efficient: interval scan (sub-millisecond on billions of rows)
WHERE ts IN '2024-01-[01..31]T09:00@Europe/London;8h'

-- Inefficient: full table scan (must read every row)
WHERE extract(hour FROM to_timezone(ts, 'Europe/London')) BETWEEN 9 AND 17
```

## Converting timestamps for display

When you need local time in query results (not filtering), use `to_timezone()`:

```questdb-sql
SELECT
    to_timezone(ts, 'Europe/Berlin') as local_time,
    symbol,
    price
FROM trades
WHERE ts IN '2024-01-15';
```

| local_time                  | symbol  | price |
|-----------------------------|---------|-------|
| 2024-01-15T10:30:00.000000Z | BTC-USD | 42000 |

### to_utc() for ingestion

If source data arrives in local time, convert to UTC before storing:

```questdb-sql
INSERT INTO trades
SELECT to_utc(local_ts, 'America/New_York'), symbol, price
FROM source_data;
```

This ensures consistent ordering and avoids ambiguity during DST transitions.

## See also

- [TICK intervals](/docs/query/operators/tick/) — Complete `@timezone` syntax reference
- [Designated timestamp](/docs/concepts/designated-timestamp/) — How timestamps define table structure
- [Date/time functions](/docs/query/functions/date-time/) — `to_timestamp()`, `to_utc()`, `to_timezone()`
