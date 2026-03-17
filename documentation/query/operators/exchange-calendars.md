---
title: Exchange calendars
sidebar_label: Exchange calendars
description:
  Exchange calendars filter TICK intervals to real exchange trading sessions,
  handling holidays, early closes, lunch breaks, and DST automatically.
  QuestDB Enterprise feature.
keywords:
  - NYSE
  - NASDAQ
  - trading hours
  - market hours
  - exchange schedule
  - XNYS
  - XNAS
  - MIC code
  - stock exchange
  - trading session
  - market holiday
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Exchange calendars provide real exchange trading schedules for TICK interval
  filtering.
</EnterpriseNote>

Exchange calendars extend [TICK interval syntax](/docs/query/operators/tick/)
with real exchange trading schedules. Instead of manually specifying trading
hours, day filters, and holidays, reference an exchange by its
[ISO 10383 MIC code](https://www.iso20022.org/market-identifier-codes):

```questdb-sql
-- NYSE regular trading hours for January, holidays excluded automatically
SELECT * FROM trades
WHERE ts IN '2025-01-[01..31]#XNYS';
```

This single expression generates interval scans for every trading session in
January, automatically handling weekends, holidays (New Year's Day, MLK Day),
and the exact trading hours including DST transitions.

## Syntax

Exchange calendars use the `#` filter position in TICK expressions:

```text
date [T time] [@timezone] [#EXCHANGE] [;duration]
```

The exchange code replaces the day-of-week filter (`#workday`, `#Mon,Wed,Fri`).
You cannot combine an exchange calendar with a day-of-week filter in the same
position.

```questdb-sql
-- Single day
WHERE ts IN '2025-01-24#XNYS'

-- Date range
WHERE ts IN '2025-01-[06..10]#XNYS'

-- Full month
WHERE ts IN '2025-03#XNYS'

-- Full year
WHERE ts IN '2025#XNYS'
```

Exchange codes are **case-insensitive**: `#XNYS`, `#xnys`, and `#Xnys` are all
equivalent.

## What the calendar provides

An exchange calendar defines, for each trading day of the year:

- **Session open and close times** in UTC
- **Holiday closures** (the day is skipped entirely)
- **Early closes** (shortened trading hours)
- **Multiple sessions per day** (e.g., morning and afternoon with a lunch break)
- **DST transitions** (UTC times shift when the exchange's local timezone
  changes clocks)

### Single-session exchanges

Most exchanges have one continuous trading session per day. For example, NYSE
(XNYS) trades from 9:30 AM to 4:00 PM Eastern Time:

```questdb-sql
WHERE ts IN '2025-01-24#XNYS'
-- Winter (EST, UTC-5): 14:30 - 21:00 UTC
-- Summer (EDT, UTC-4): 13:30 - 20:00 UTC
```

### Multi-session exchanges

Some exchanges have a lunch break, producing two intervals per trading day. Hong
Kong (XHKG) has morning and afternoon sessions:

```questdb-sql
WHERE ts IN '2025-02-03#XHKG'
-- Morning:   01:30 - 04:00 UTC  (09:30 - 12:00 HKT)
-- Afternoon: 05:00 - 08:00 UTC  (13:00 - 16:00 HKT)
```

## Holidays and early closes

Exchange calendars automatically exclude holidays and apply early closes.

### Holiday closure

The day is completely removed from results:

```questdb-sql
-- April 14-18, 2025: Good Friday (Apr 18) is a NYSE holiday
WHERE ts IN '2025-04-[14..18]#XNYS'
-- Returns intervals for Mon-Thu only; Friday is skipped
```

### Early close

The session ends earlier than usual:

```questdb-sql
-- July 2-7, 2025: July 3 is an early close (1:00 PM ET), July 4 is closed
WHERE ts IN '2025-07-[02..07]#XNYS'
-- Jul 2 (Wed): 13:30 - 20:00 UTC  (normal)
-- Jul 3 (Thu): 13:30 - 17:00 UTC  (early close, 3h shorter)
-- Jul 4 (Fri): closed
-- Jul 7 (Mon): 13:30 - 20:00 UTC  (normal)
```

### Multi-session early close

For exchanges with multiple sessions, an early close may mean only the morning
session runs:

```questdb-sql
-- XHKG around Lunar New Year 2025
WHERE ts IN '2025-01-[27..31]#XHKG'
-- Jan 27 (Mon): morning 01:30-04:00 + afternoon 05:00-08:00 (normal)
-- Jan 28 (Tue): morning 01:30-04:00 only (LNY Eve, no afternoon session)
-- Jan 29-31:   closed (Lunar New Year holidays)
```

## Interaction with TICK features

Exchange calendars combine with all standard
[TICK features](/docs/query/operators/tick/). The behaviors specific to exchange
calendars are described below.

### Duration

The `;duration` suffix extends the close of each trading session:

```questdb-sql
WHERE ts IN '2025-01-24#XNYS;1h'
-- Without duration: 14:30 - 21:00 UTC
-- With ;1h:         14:30 - 22:00 UTC
```

For multi-session exchanges, each session is extended independently. If extended
sessions overlap, they merge into a single continuous interval:

```questdb-sql
WHERE ts IN '2025-01-24#XHKG;1h'
-- Morning:   01:30 - 05:00 UTC  (extended from 04:00)
-- Afternoon: 05:00 - 09:00 UTC  (extended from 08:00)
```

Non-trading days remain excluded even with a duration.

### Timezone

The `@timezone` resolves the date to a UTC range first, then the exchange
schedule intersects that range:

```questdb-sql
WHERE ts IN '2025-01-24@-05:00#XNYS'
-- Jan 24 in EST = 05:00Z Jan 24 to 05:00Z Jan 25
-- Intersected with NYSE hours: 14:30 - 21:00 UTC on Jan 24
```

This matters when timezone offsets shift a date across midnight UTC. A large
positive offset like `@+14:00` causes the UTC range to span two calendar days,
so trading sessions from both days may appear.

### Time suffix

A `T time` suffix is intersected with trading sessions. Times outside trading
hours produce an empty result:

```questdb-sql
-- 15:00 UTC is within NYSE hours
WHERE ts IN '2025-01-24T15:00#XNYS'
-- Result: 15:00 - 15:59:59.999999 UTC

-- 04:30 UTC falls in the XHKG lunch break
WHERE ts IN '2025-02-03T04:30#XHKG'
-- Result: [] (empty)
```

### Per-element filters

Each element in a date list can specify its own exchange. A per-element filter
takes precedence over a global filter for that element:

```questdb-sql
-- Different exchanges per date
WHERE ts IN '[2025-01-24#XNYS, 2025-02-03#XHKG]'

-- Per-element overrides global
WHERE ts IN '[2025-01-24#XNYS, 2025-02-03]#XHKG'
-- Jan 24 uses XNYS; Feb 3 uses XHKG
```

## Custom calendars

### Built-in schedules

QuestDB Enterprise ships with a Parquet file inside the JAR containing
pre-configured schedules for major exchanges. On every startup, this file is
extracted to:

```text
<dbRoot>/import/.questdb-internal/tick_calendars.parquet
```

The file is **overwritten on each restart**, so any manual edits to it are lost.
To customize schedules, use the `_tick_calendars_custom` table described below.
Custom entries are merged with the built-in data at query time, and take
precedence when both define the same session.

### Setup

Call `reload_tick_calendars()` to create the table where you'll put your custom
calendar data:

```questdb-sql
SELECT reload_tick_calendars();
```

This function creates the `_tick_calendars_custom` table if it does not exist.
It requires system admin privileges. You'll use the same function to reload the
calendars after you make changes to this table.

### Custom table schema

The `_tick_calendars_custom` table has the following columns:

| Column | Type | Description |
| ------ | ---- | ----------- |
| `exchange` | `SYMBOL` | Exchange MIC code (e.g., `XNYS`) |
| `session` | `VARCHAR` | Session key, typically a date string (e.g., `2025-01-24`) |
| `open` | `TIMESTAMP` | Session open time (UTC) |
| `break_start` | `TIMESTAMP` | Lunch break start (UTC), or `NULL` if no break |
| `break_end` | `TIMESTAMP` | Lunch break end (UTC), or `NULL` if no break |
| `close` | `TIMESTAMP` | Session close time (UTC) |
| `deleted` | `BOOLEAN` | Set to `true` to soft-delete this custom row |

The `session` column is the merge key. When a custom row has the same `exchange`
and `session` as a built-in entry, the custom row takes precedence.

### Add a session

Insert a row with the exchange, session date, and UTC timestamps:

```questdb-sql
-- Add a Saturday trading session to NYSE
INSERT INTO _tick_calendars_custom
    (exchange, session, open, close)
VALUES
    ('XNYS', '2025-01-25',
     '2025-01-25T10:00:00.000000Z', '2025-01-25T14:00:00.000000Z');

SELECT reload_tick_calendars();
```

After reloading, `2025-01-25#XNYS` returns a 10:00-14:00 UTC session instead of
being empty.

### Override a built-in session

Insert a custom row with the same session key to replace it:

```questdb-sql
-- Override NYSE Jan 27: late open at 16:00 instead of 14:30
INSERT INTO _tick_calendars_custom
    (exchange, session, open, close)
VALUES
    ('XNYS', '2025-01-27',
     '2025-01-27T16:00:00.000000Z', '2025-01-27T21:00:00.000000Z');

SELECT reload_tick_calendars();
```

### Remove a built-in session

Insert a row with all four timestamp columns left as `NULL`:

```questdb-sql
-- Close NYSE on Jan 27 (remove the built-in session entirely)
INSERT INTO _tick_calendars_custom
    (exchange, session)
VALUES
    ('XNYS', '2025-01-27');

SELECT reload_tick_calendars();
```

### Define a custom exchange

You can define entirely new exchange codes not present in the built-in data:

```questdb-sql
-- Define a custom exchange with a lunch break
INSERT INTO _tick_calendars_custom
    (exchange, session, open, break_start, break_end, close)
VALUES
    ('MINE', '2025-03-03',
     '2025-03-03T09:00:00.000000Z', '2025-03-03T12:00:00.000000Z',
     '2025-03-03T13:00:00.000000Z', '2025-03-03T17:00:00.000000Z'),
    ('MINE', '2025-03-04',
     '2025-03-04T09:00:00.000000Z', '2025-03-04T12:00:00.000000Z',
     '2025-03-04T13:00:00.000000Z', '2025-03-04T17:00:00.000000Z');

SELECT reload_tick_calendars();
```

Then use it like any other exchange:

```questdb-sql
SELECT * FROM trades WHERE ts IN '2025-03-[03..04]#MINE';
```

### Undo a custom override

QuestDB does not support `DELETE`. Instead, the `deleted` column provides
soft-delete semantics. To restore a built-in session after overriding it, mark
the custom row as deleted:

```questdb-sql
UPDATE _tick_calendars_custom
SET deleted = true
WHERE exchange = 'XNYS' AND session = '2025-01-27';

SELECT reload_tick_calendars();
```

The built-in session is restored because deleted rows are excluded from the
merge.

### Inspect effective schedules

Use `tick_calendars()` to view the merged result of built-in and custom data:

```questdb-sql
-- All effective sessions for NYSE
SELECT * FROM tick_calendars() WHERE exchange = 'XNYS';

-- Check a specific session
SELECT * FROM tick_calendars()
WHERE exchange = 'XNYS' AND session = '2025-01-27';
```

The function returns one row per session with columns: `exchange`, `session`,
`open`, `break_start`, `break_end`, `close`.

### Validation rules

Custom rows are validated on load. Invalid rows are skipped with a log warning:

- `open` and `close` must both be `NULL` (removal) or both non-`NULL`
- `break_start` and `break_end` must both be `NULL` or both non-`NULL`
- When non-`NULL`: `open < break_start < break_end < close` (or `open < close`
  without a break)
- Session duration must be less than 24 hours
- If multiple non-deleted rows share the same `exchange` and `session`, the last
  row wins

:::warning Changes require reload

Custom calendar changes are **not** applied automatically. You must call
`reload_tick_calendars()` after modifying the `_tick_calendars_custom` table.
Until then, queries continue using the cached schedules.

:::

## Processing order

Within a TICK expression, components are applied in this order:

1. **Date and time** are parsed as local time (or UTC if no timezone is given)
2. **Timezone** (`@`) converts local time intervals to UTC
3. **Exchange calendar** (`#EXCHANGE`) intersects with the UTC trading sessions
4. **Duration** (`;`) extends the close of each resulting interval
5. **Interval merging** combines any overlapping intervals

:::note Exchange calendars vs day-of-week filters

[Day-of-week filters](/docs/query/operators/tick/#day-of-week-filter) like
`#workday` apply to the **local date** (before timezone conversion), so "Monday"
means Monday in the specified timezone. Exchange calendars apply **after**
conversion to UTC, because exchange schedules are defined in UTC.

:::

## See also

- [TICK interval syntax](/docs/query/operators/tick/) — Full TICK syntax
  reference
- [Interval scan](/docs/concepts/deep-dive/interval-scan/) — How QuestDB
  optimizes time queries
