---
title: Expiring rows (EXPIRE ROWS)
sidebar_label: Expiring rows
description:
  EXPIRE ROWS is a way to keep only some rows in a passthrough materialized
  view. Keep the latest row per key, the top-N per group, or rows that match a
  condition. Once a policy is set, queries hide the expired rows right away, and
  a background job frees their disk space later when it is safe to do so.
---

`EXPIRE ROWS` lets you keep only some of the rows in a
[materialized view](/docs/concepts/materialized-views/), and drop the rest.

[TTL](/docs/concepts/ttl/) works at the partition level: it deletes a whole
partition once it is old enough. `EXPIRE ROWS` works **one row at a time**. You
can keep the latest row for each key, the highest few rows per group, only the
rows that match a condition, and so on. QuestDB keeps that set up to date as the
view refreshes.

Once you set a policy, queries against the view stop showing the expired rows
straight away. You do not have to wait for anything to be cleaned up on disk.
Two things to keep in mind:

- Setting a policy does not instantly invalidate other views that read this one.
  That happens later, when those views next refresh.
- A background job deletes the expired rows from disk afterwards, but only for
  the policies where that is safe (the plain `WHEN` condition). The other modes
  (`KEEP LATEST`, `KEEP HIGHEST/LOWEST`, `KEEP N`, and window conditions) hide
  the rows from queries but leave them on disk.

See [Modes of expiry](#modes-of-expiry) and
[When expired rows are deleted from disk](#monotonicity-and-cleanup-safety).

## Modes of expiry

The modes come in two shapes. A `WHEN` condition describes the rows to
**expire**: a row expires when the condition is `TRUE`, and everything else is
kept. A `KEEP` mode does the opposite: it describes the rows to **keep**, and
everything else is expired.

| Mode                  | What it keeps                                       | Syntax                                                              | Frees disk            |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| Per-row condition     | Rows where the condition is **not** `TRUE`          | `EXPIRE ROWS WHEN predicate`                                        | Yes, when it is safe  |
| Window condition      | Rows where a condition using `OVER (...)` is **not** `TRUE` | `EXPIRE ROWS WHEN predicate OVER (...)`                     | No (hides only)       |
| Keep latest           | The latest row per key (the current value per key)  | `EXPIRE ROWS KEEP LATEST [ON timestamp] PARTITION BY cols`          | No (hides only)       |
| Keep highest / lowest | Rows tied at the group's highest / lowest value     | `EXPIRE ROWS KEEP HIGHEST\|LOWEST ON col [PARTITION BY cols]`       | No (hides only)       |
| Keep top-N            | The `N` highest / lowest rows per group             | `EXPIRE ROWS KEEP N HIGHEST\|LOWEST ON col [PARTITION BY cols]`     | No (hides only)       |

:::tip Which mode deletes rows from disk?

Only a per-row `WHEN` policy can delete expired rows from disk. QuestDB does this
when it can tell that an expired row will never be needed again. Deleting the
rows saves disk space and gives later queries fewer rows to scan.

To check a policy, run:

```questdb-sql
SELECT view_name, expire_enforcement FROM materialized_views();
```

`FILTER_AND_RECLAIM` means that QuestDB hides expired rows and later deletes them
from disk. `FILTER_ONLY` means that QuestDB hides the rows but leaves them on
disk. `KEEP` modes and window conditions are always `FILTER_ONLY`.

:::

`KEEP HIGHEST/LOWEST` and `KEEP N` are shortcuts. Under the hood they turn into
a window condition, so a window `WHEN` is the general-purpose form when the
shortcuts do not fit.

The plain `KEEP HIGHEST/LOWEST` form works on these column types: `BYTE`,
`SHORT`, `INT`, `LONG`, `FLOAT`, `DOUBLE`, `DATE`, `TIMESTAMP` and `DECIMAL`.
The top-N form (`KEEP N HIGHEST/LOWEST`) sorts rows with `ORDER BY`, so it works
on any column type you can sort. For example, to rank a `SYMBOL` column, use
`KEEP 1 HIGHEST ON symbol`, not `KEEP HIGHEST ON symbol`.

The two forms treat ties and `NULL`s differently:

- The top-N form keeps exactly one row per group. It breaks ties using the
  designated timestamp, newest first. An integer or timestamp `NULL` sorts last,
  so it is expired. A floating-point `NULL` sorts first, so it is kept.
- The plain form keeps every row tied at the highest (or lowest) value, and
  keeps every `NULL`.

To see how each mode handles hiding versus deleting on disk, see
[How it works](#how-it-works). To check which behavior a view uses, look at the
`expire_enforcement` column of `materialized_views()`; see
[Inspecting a policy](#inspecting-a-policy).

You attach the clause to a passthrough `CREATE MATERIALIZED VIEW` (after the
query, and after `PARTITION BY` if you use it), or add it later with
[`ALTER MATERIALIZED VIEW ... SET EXPIRE ROWS`](/docs/query/sql/alter-mat-view-set-expire/):

```
EXPIRE ROWS
  { WHEN predicate
  | KEEP LATEST [ ON timestampColumn ] PARTITION BY col [, col ...]
  | KEEP [ N ] ( HIGHEST | LOWEST ) ON col [ PARTITION BY col [, col ...] ] }
  [ CLEANUP EVERY duration ]
```

| Element            | Meaning                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `predicate`        | Any true/false expression over the view's columns. A row expires when it is `TRUE`.                                                 |
| `KEEP LATEST`      | Keep the latest row for each `PARTITION BY` key, by the designated timestamp.                                                       |
| `ON timestampCol`  | Optional. If given, it must be the view's designated timestamp.                                                                     |
| `HIGHEST\|LOWEST ON col` | Keep the rows at the highest / lowest value of `col` per group (no `N`), or the top `N`.                                      |
| `CLEANUP EVERY`    | How often the background cleanup job runs for this view: `<number><unit>`, where the unit is `s`/`m`/`h`/`d`/`w`. Defaults to `1h`. |

:::note

`EXPIRE ROWS` only works on materialized views. `CREATE TABLE ... EXPIRE ROWS`
is rejected. It is built for a **passthrough** view: one that copies base rows
directly (`SELECT * FROM base` with no `SAMPLE BY` / `GROUP BY`), so each view
row matches one base row. On a passthrough view, deleting an expired row is
permanent.

An aggregating view is **allowed, but only with a warning in the log**, because
a later refresh can rebuild a deleted row from base rows that still exist (see
[Requirements](#requirements)). To trim the base table instead, use
[TTL](/docs/concepts/ttl/) or, on Enterprise,
[storage policies](/docs/concepts/storage-policy/).

:::

## When to use EXPIRE ROWS

Use `EXPIRE ROWS` on a passthrough materialized view when you want a trimmed,
always-current copy of a base table:

- **Current value per key**: keep only the latest row per device, symbol, or
  session (`KEEP LATEST`).
- **Highest/lowest per group, or leaderboards**: keep the top value per group,
  or the top-N (`KEEP HIGHEST/LOWEST`, `KEEP N`).
- **A rolling time window**: keep rows newer than a moving cutoff such as
  `now() - 7d`. This is finer than TTL, which can only drop whole partitions
  (`WHEN predicate`).

The `WHEN` form is most useful when the rule depends on the **current time**. If
your rule only looks at a row's own values, put it in the view's `WHERE` clause
instead. That is cheaper, because those rows are never copied into the view in
the first place. See
[`WHERE` filter or `EXPIRE ROWS`?](#where-filter-or-expire-rows).

If age-based retention on a base table, one whole partition at a time, is all you
need, use [TTL](/docs/concepts/ttl/) instead. It is cheaper and does not require
a passthrough view.

## Requirements

`EXPIRE ROWS` is built for a **passthrough materialized view**:

- The view's query keeps one view row per base row. It reads a single table and
  projects columns from it, with or without a `WHERE` filter. See
  [which queries are passthrough](/docs/concepts/materialized-views/#which-queries-are-passthrough)
  for the full rules.
- The view takes its
  [designated timestamp](/docs/concepts/designated-timestamp/), partitioning,
  and symbol indexes from the base table.

Because a passthrough view mirrors its base table one-for-one and refreshes as
new data arrives, it is basically a live copy of the base table. `EXPIRE ROWS`
trims that copy down to the rows you want to keep. It never touches the base
table.

An **aggregating view is allowed, but you get a warning in the log** instead of
an error. Deleting rows from disk is only reliable if the base table's own
retention lines up with the expiry cutoff, because a later refresh can rebuild a
deleted row from base rows that are still there.

## Dependent materialized and live views

`CREATE MATERIALIZED VIEW` and `CREATE LIVE VIEW` will not let you create a view
whose query reads a materialized view that has an active `EXPIRE ROWS` policy.
This includes reading it through a join or a subquery.

You *can* add a policy with `SET EXPIRE` even when other views already read this
one:

```questdb-sql
-- Both views already exist.
ALTER MATERIALIZED VIEW source
SET EXPIRE ROWS WHEN v < 2;

-- The dependent view may keep working until it next refreshes.
```

A dependent view notices the conflict the next time it refreshes, and then marks
itself invalid. This does not happen at the same moment as the `ALTER`:

- A dependent view that is idle may keep reporting itself as active.
- A refresh that was already running may finish using the older data it started
  with.
- If the policy is on a table reached through a join, the dependent view may not
  notice until something triggers it to do work, or someone asks it to refresh.

Queries against the source view apply the expiry filter as soon as the policy is
set. The policy does not go back and remove rows that dependent views already
stored, and an invalidated view keeps serving whatever it already has.

`DROP EXPIRE` does not automatically bring an invalidated dependent back to life.
After you clear the conflict on the source, you have to rebuild the dependent:
materialized views need a
[FULL refresh](/docs/query/sql/refresh-mat-view/#full); live views need you to
save the definition and
[recreate them](/docs/concepts/live-views/#base-table-lifecycle). A FULL refresh
still deletes the view's contents before rebuilding (see the linked reference for
what queries see during the rebuild and what happens if it fails). Rebuilding
can only recover rows that still exist in the source.

## Examples

These examples run every mode over one small, fixed dataset, so you can see
exactly which rows each policy keeps.

### Setup

```questdb-sql title="Base table and sample data"
CREATE TABLE trades (
  symbol SYMBOL,
  side   SYMBOL,
  price  DOUBLE,
  amount DOUBLE,
  timestamp TIMESTAMP
) TIMESTAMP(timestamp) PARTITION BY DAY WAL;

INSERT INTO trades VALUES
  ('BTC', 'buy',  100.0, 1.0, '2026-01-01T10:00:00.000000Z'),
  ('BTC', 'sell', 105.0, 2.0, '2026-01-01T11:00:00.000000Z'),
  ('BTC', 'buy',  102.0, 1.5, '2026-01-02T09:00:00.000000Z'),
  ('ETH', 'sell',  50.0, 3.0, '2026-01-01T10:30:00.000000Z'),
  ('ETH', 'buy',   55.0, 1.0, '2026-01-02T08:00:00.000000Z');
```

:::note

A materialized view starts refreshing in the background as soon as you create
it, so it may return no rows for a moment. Check its progress with:
`SELECT view_name, view_status, base_table_txn, refresh_base_table_txn FROM materialized_views();`
The view is up to date when `refresh_base_table_txn = base_table_txn`. With a
dataset this small, that is basically instant.

:::

### Per-row condition: `WHEN`

A per-row condition expires a row when it is `TRUE`. The example below expires
small trades (`amount < 1.5`), just because it makes the kept rows easy to read
off the sample data.

In real use, that rule belongs in the view's `WHERE` clause
(`WHERE amount >= 1.5`), which keeps those rows out of the view entirely. The
rolling window further down is the case `WHEN` is really for.

```questdb-sql title="Expire rows where amount < 1.5"
CREATE MATERIALIZED VIEW trades_sized AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN amount < 1.5;

SELECT * FROM trades_sized ORDER BY timestamp;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| ETH    | sell | 50.0  | 3.0    | 2026-01-01T10:30:00.000000Z |
| BTC    | sell | 105.0 | 2.0    | 2026-01-01T11:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2026-01-02T09:00:00.000000Z |

The two `amount = 1.0` rows are expired. `amount = 1.5` is kept, because
`1.5 < 1.5` is `FALSE`. A row with a `NULL` amount would also be kept, because
comparing anything to `NULL` gives `FALSE` in QuestDB. See [NULLs](#nulls).

A condition on the designated timestamp gives you a **rolling window**, which is
the main reason to use `WHEN`. QuestDB re-checks it on every read, so the visible
rows move forward with the clock. You cannot do this with a `WHERE` clause,
because the view's query is not allowed to call `now()`:

```questdb-sql title="Keep the last 1 day"
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < dateadd('d', -1, now());
```

(With the 2026 timestamps above, every row is already more than a day old and
would be hidden. Use recent data to see rows stay.)

`WHEN timestamp < dateadd('d', -1, now())` and
`WHEN timestamp < now() - 86400000000` keep the same rows, and both let the
cleanup job free disk, because QuestDB can tell that either form only moves
forward in time.

### Keep latest per key: `KEEP LATEST`

Keep only the most recent row per key, to turn the view into a live
"current value per symbol" table:

```questdb-sql title="Keep the latest row per symbol"
CREATE MATERIALIZED VIEW trades_latest AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP LATEST ON timestamp PARTITION BY symbol;

SELECT * FROM trades_latest ORDER BY timestamp;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| ETH    | buy  | 55.0  | 1.0    | 2026-01-02T08:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2026-01-02T09:00:00.000000Z |

The designated `timestamp` column decides which row is the latest for each
symbol. As new trades arrive, the kept row moves forward on its own. You can list
several key columns in `PARTITION BY`. The `ON timestamp` part is optional -
`KEEP LATEST PARTITION BY symbol` means the same thing - but when you write it,
it has to name the view's designated timestamp.

:::note `KEEP LATEST` does not save the result ahead of time

`KEEP LATEST` makes application queries simpler, but older rows stay on disk.
Each time you query the view, QuestDB finds the latest row for every key from the
rows the view stores. To reduce the number of rows this lookup must search, use
the
[pre-aggregation approach for speeding up `LATEST ON`](/docs/concepts/materialized-views/#advanced-latest-on-optimization).

:::

### Keep highest/lowest per group: `KEEP HIGHEST` / `KEEP LOWEST`

Keep the rows tied at the highest (or lowest) value of a column, per group:

```questdb-sql title="Keep the highest-priced trade per symbol"
CREATE MATERIALIZED VIEW trades_peak AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP HIGHEST ON price PARTITION BY symbol;

SELECT * FROM trades_peak;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| BTC    | sell | 105.0 | 2.0    | 2026-01-01T11:00:00.000000Z |
| ETH    | buy  | 55.0  | 1.0    | 2026-01-02T08:00:00.000000Z |

`KEEP LOWEST ON price PARTITION BY symbol` keeps the cheapest instead (BTC `100.0`,
ETH `50.0`). Every row tied at the highest (or lowest) value is kept, and
`NULL`-valued rows are kept too (a `NULL` is never below the highest value).

### Keep top-N per group: `KEEP N HIGHEST` / `KEEP N LOWEST`

Keep a per-group leaderboard: the `N` highest (or lowest) rows.

```questdb-sql title="Keep the 2 highest-priced trades per symbol"
CREATE MATERIALIZED VIEW trades_top2 AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP 2 HIGHEST ON price PARTITION BY symbol;

SELECT * FROM trades_top2 ORDER BY symbol, price DESC;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| BTC    | sell | 105.0 | 2.0    | 2026-01-01T11:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2026-01-02T09:00:00.000000Z |
| ETH    | buy  | 55.0  | 1.0    | 2026-01-02T08:00:00.000000Z |
| ETH    | sell | 50.0  | 3.0    | 2026-01-01T10:30:00.000000Z |

BTC keeps its two highest (`105`, `102`) and drops `100`. ETH has only two rows,
so both stay. Ties are broken by the designated timestamp, so the cutoff at the
N-th row is always decided the same way.

### Window condition: the general-purpose form

`KEEP HIGHEST/LOWEST` and `KEEP N` are just shortcuts for window conditions. When
you need a rule they do not cover, write the window condition directly in `WHEN`.
For example, this is exactly what `KEEP HIGHEST ON price PARTITION BY symbol` turns
into:

```questdb-sql title="The same as KEEP HIGHEST, written as a window condition"
CREATE MATERIALIZED VIEW trades_peak_win AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN price < max(price) OVER (PARTITION BY symbol);
```

A row expires when its price is below the highest price for its symbol, so only
the peak per symbol survives. This gives the same result as `trades_peak` above.
From here you can write richer rules, for example keep rows within 5% of the peak
(`WHEN price < 0.95 * max(price) OVER (PARTITION BY symbol)`) or keep the 100
newest rows per symbol
(`WHEN row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) > 100`).

## `WHERE` filter or `EXPIRE ROWS`?

A passthrough view can drop rows in two places: a `WHERE` clause in its query, or
an `EXPIRE ROWS WHEN` condition. The deciding factor is whether the rule depends
on the current time.

**Use `EXPIRE ROWS WHEN` when the rule moves with the clock.** A rolling window
cannot be a `WHERE` clause at all, because a view's query is not allowed to call
non-deterministic functions, so `WHERE timestamp > dateadd('d', -7, now())` is
rejected. `EXPIRE ROWS WHEN timestamp < dateadd('d', -7, now())` is the supported
way to say "keep the last 7 days". The filter re-checks `now()` on every read, so
the window rolls forward by itself, and the cleanup job frees the disk behind it.
This is what `WHEN` is for.

**Put a rule that only looks at the row itself in the `WHERE` clause.** A
condition like `symbol = 'BTC'` or `amount >= 1.5` picks out the same rows either
way, so the view ends up with almost the same contents. But `WHERE` is cheaper at
every step, because a row the `WHERE` clause drops is never copied into the view:

| | `WHERE` in the query | `EXPIRE ROWS WHEN` |
| --- | --- | --- |
| Storage | Row is never written | Row is written; only a `FILTER_AND_RECLAIM` policy can delete it later |
| Read cost | None | The keep rule is applied on every read of the view |
| Write cost | None | Cleanup may rewrite partitions for `FILTER_AND_RECLAIM` policies |
| After a full refresh | Still dropped | Written again from the base, then hidden; an eligible policy sweeps it again |
| Can still be a source for other views | Yes | No: CREATE rejects an active policy; existing dependents notice a SET on refresh |

If this view has to stay usable as a source for other views, put the rule in the
query's `WHERE` clause. Existing dependents do not stop you from adding an expiry
policy, but they become invalid when a refresh notices it. See
[Dependent materialized and live views](#dependent-materialized-and-live-views).

The two forms are not exact opposites when it comes to `NULL`s. `WHERE` keeps a
row only when the condition is `TRUE`, while `EXPIRE ROWS WHEN` expires a row
only when the condition is `TRUE`. So a `NULL` amount is dropped by
`WHERE amount >= 1.5` but kept by `EXPIRE ROWS WHEN amount < 1.5`. See
[NULLs](#nulls).

You can use both together, and on a passthrough view that is usually the right
setup: the `WHERE` clause decides what the view is about, and the `WHEN` policy
decides how long it keeps what it has.

```questdb-sql title="A filter for the subject, a policy for the time window"
CREATE MATERIALIZED VIEW trades_btc_recent AS (
  SELECT * FROM trades WHERE symbol = 'BTC'
) EXPIRE ROWS WHEN timestamp < dateadd('d', -7, now()) CLEANUP EVERY 1h;
```

### When a fixed cutoff still belongs in a policy

There is one case where a fixed (non-time-based) cutoff still belongs in
`EXPIRE ROWS`: a threshold you plan to move by hand from time to time. There is
no `ALTER MATERIALIZED VIEW ... AS <new query>`, so changing a `WHERE` clause
means dropping the view and creating it again, which rebuilds it from the base.
Changing a policy is just a metadata change:

```questdb-sql title="Moving a cutoff without a rebuild"
ALTER MATERIALIZED VIEW trades_recent
  SET EXPIRE ROWS WHEN timestamp < '2026-06-01T00:00:00.000000Z';
ALTER MATERIALIZED VIEW trades_recent
  SET EXPIRE ROWS WHEN timestamp < '2026-07-01T00:00:00.000000Z';
ALTER MATERIALIZED VIEW trades_recent DROP EXPIRE;
```

Rebuilding for a `WHERE` change is not just slow, it can lose data. If the base
table has its own [TTL](/docs/concepts/ttl/), rebuilding the view reads a base
that no longer holds everything the view held. A view that keeps data for longer
than its base table cannot afford to be rebuilt, so its cutoff belongs in a
policy.

A rule that compares rows against each other has no `WHERE` equivalent either.
`KEEP LATEST`, `KEEP N HIGHEST/LOWEST`, and window conditions cannot go in the
query, because a `LATEST ON` or a window function there would stop the view from
being passthrough.

## How it works

`EXPIRE ROWS` has two parts that work together: a read-time filter that always
applies, and a background cleanup that runs when it can.

### Read-time filter (always applies)

Once a policy is set, queries against the view apply a filter so that only the
kept rows show up, **whether or not cleanup has run yet**. (Refreshes of
dependent views are the exception: they reject an active policy rather than try
to copy this moving set of rows.)

- **Per-row `WHEN`** keeps rows where the condition is not `TRUE`. In QuestDB, a
  comparison against `NULL` is `FALSE`, so whether a `NULL` row is kept or
  expired depends on the operators you use, such as `NOT`, `!=`, and `IS NULL`
  (see [NULLs](#nulls)).
- **`KEEP LATEST`** returns the latest row per key, using the designated
  timestamp.
- **`KEEP HIGHEST/LOWEST/N` and window `WHEN`** work out the kept rows with a
  window function over the whole view.

Because this filter runs at query time, a freshly-refreshed row that should be
expired is hidden the moment it lands, and a row that should come back (under a
time-based rule) shows up again on the next read.

### Physical cleanup (best effort)

A background job frees disk for partitions that are no longer being written to.
It never rewrites the active partition, the one currently receiving new rows. So
a young view with only one partition frees no disk yet, even if its policy is
`FILTER_AND_RECLAIM`. Once new data creates a newer active partition, the older
one can be cleaned up. Read filtering still works the whole time.

When a partition is fully expired and eligible, the job removes it. Under a
rolling time-based rule, a partition that is only partly expired is rewritten
down to just its surviving rows, but only once the share of expired rows reaches
`cairo.mat.view.row.expiry.cleanup.min.expired.fraction` (default `0.5`). This
avoids rewriting the same boundary partition over and over as the cutoff creeps
through it. Set the property to `0` to rewrite as soon as any row expires, or to
`1` to turn off rewriting of partly-expired partitions (fully-expired ones are
still removed). This threshold does not delay a fixed rule, whose expired rows
never change over time.

The job runs on the `CLEANUP EVERY` schedule (default `1h`) and is best effort.
Because the read filter is what queries rely on, cleanup running late or not at
all only affects disk usage, never query results.

The job only runs for a `WHEN` condition that QuestDB can prove only ever expires
more rows over time. It skips `KEEP LATEST`, `KEEP HIGHEST/LOWEST`, `KEEP N`, and
window policies entirely. In those modes, a later refresh can remove the row the
mode currently keeps, which would bring an older row back into the kept set, and
the job cannot bring back a row it already deleted. Those views keep their
expired rows on disk.

On QuestDB Enterprise, cleanup runs on the **primary only**, but the freed space
still shows up on replicas. The rewrites are ordinary WAL transactions, so
replicas delete the same rows when they apply them. A read-only replica does not
run the job and does not need to. Turn the job off with
`cairo.mat.view.row.expiry.cleanup.enabled=false` in `server.conf` (reads stay
filtered; this only stops disk cleanup, it does not turn off `EXPIRE ROWS`
itself). Cleanup settings are read at startup, so changing this property or the
minimum expired fraction needs a restart. If a cleanup pass fails, it retries
after one second, then doubles the gap for that view each time, up to a 10-minute
cap.

To watch cleanup happen, compare the number of rows per partition before and
after a pass:

```questdb-sql title="Rows still on disk per partition"
SELECT name, numRows FROM table_partitions('trades_recent');
```

Use a view whose `expire_enforcement` is `FILTER_AND_RECLAIM`, such as
`trades_recent`, for this check. Its active partition stays the same after a
pass. Insert data into a newer partition before you expect the current active
partition to be cleaned up.

Cleanup **pauses while a view is refreshing continuously** and resumes on a quiet
pass.

## Semantics

### NULLs

In QuestDB, a comparison against `NULL` is `FALSE` (not "unknown"), and
`EXPIRE ROWS WHEN` expires a row only when the whole condition is `TRUE`. So the
whole condition decides whether a `NULL` row survives:

- **A plain comparison like `amount < 1.5`** is `FALSE` for a `NULL` amount, so
  the row is kept.
- **`NOT (amount >= 1.5)`** is `TRUE` for a `NULL` amount (the inner comparison
  is `FALSE`), so the row is expired. Even though this looks like `amount < 1.5`,
  the two behave differently for `NULL`.
- **`amount != 1.5` and `amount IS NULL`** are also `TRUE` for a `NULL` amount,
  so both expire the row.
- **`KEEP HIGHEST/LOWEST`** keeps a `NULL`, because its comparison against the
  group's extreme is `FALSE`.
- **`KEEP LATEST`** uses the designated timestamp, which is never `NULL`.
- **`KEEP N` is the exception.** It ranks rows with `row_number()`, and QuestDB
  has no `NULLS LAST`, so where a `NULL` lands depends on the column type. Under
  `DESC`, a floating-point `NULL` (NaN) sorts first (kept while there is room in
  `N`), while an integer/timestamp `NULL` sorts last (expired first). Use
  `KEEP HIGHEST/LOWEST` (no `N`) when every `NULL` must be kept, whatever the
  type.

### A `NULL` threshold is rejected

A `WHEN` threshold that comes out as a constant `NULL` would expire nothing,
because `timestamp < NULL` is never `TRUE`. QuestDB rejects it at `CREATE` and
`ALTER` time rather than store a view that quietly never cleans up:

```questdb-sql title="Rejected: the threshold is NULL"
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < CAST(NULL AS TIMESTAMP);
-- invalid EXPIRE ROWS predicate: the threshold is NULL, so no row can ever expire
```

This check matters most when the `NULL` is not obvious. QuestDB stores a `NULL`
`TIMESTAMP`, `LONG`, or `INT` as a special value at the very bottom of the type's
range, and integer math wraps around silently when it overflows, so an arithmetic
threshold can land right on that value:

```questdb-sql title="Also rejected: math that overflows onto NULL"
-- LONG overflow
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < 4611686018427387904 * 2;

-- INT overflow, reached a thousand times sooner
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < 2147483647 + 1;
```

Only thresholds that are constant when the view is defined are checked this way.
A threshold built from the clock, such as `timestamp < now() - 3600000000`, is
worked out on every read and cannot be checked ahead of time.

### Ties and determinism

`KEEP HIGHEST/LOWEST` keeps **all** rows tied at the highest/lowest value, so the
result is always the same. `KEEP N` breaks ties with the designated timestamp, so
the cutoff at the N-th row is always decided the same way (pair the base table
with [`DEDUP UPSERT KEYS`](/docs/concepts/deduplication/) if `(col, timestamp)`
is not already unique).

### Combining with TTL

A view can have both a [TTL](/docs/concepts/ttl/) and an `EXPIRE ROWS` policy at
the same time, and the order is fixed: **TTL removes rows from the view first,
then the policy applies to what is left.** TTL drops whole partitions from the
view as they age out, and the kept set is worked out over whatever remains.

```questdb-sql title="Highest price per symbol, over a 3-day window"
CREATE MATERIALIZED VIEW trades_peak_3d AS (
  SELECT * FROM trades
) PARTITION BY DAY TTL 3 DAYS
  EXPIRE ROWS KEEP HIGHEST ON price PARTITION BY symbol;
```

`TTL` goes before `EXPIRE ROWS` in the statement, just as it goes after any
`PARTITION BY`.

This view reports the highest price of the **last three days**, so its answer can
go **down** as the window moves: when the day holding a symbol's high ages out,
the next-highest price still in the window takes over. That is what the two
clauses ask for together. The view is no longer "the highest price ever"; it is
"the highest price still kept". The base table is not affected; it keeps whatever
its own settings keep.

TTL is also the only way to cap the size of a `KEEP LATEST`, `KEEP HIGHEST/LOWEST`
or `KEEP N` view, because the cleanup job never frees disk for those modes.

### Monotonicity and cleanup safety

Deleting rows from disk is only safe when expiry is a one-way street: a row that
is expired now must stay expired forever. Two things can break that.

The relative and window modes (`KEEP LATEST`, `KEEP HIGHEST/LOWEST`, `KEEP N`,
window `WHEN`) decide each row's fate by comparing it against the other rows in
the view. A later refresh can remove or replace the row a key currently keeps,
which brings an older row back into the kept set. Because of this, the cleanup job
never deletes rows for these modes, no matter what their condition looks like.

A plain `WHEN predicate` judges each row on its own, so it can be eligible. It is
ordinary SQL. QuestDB treats `now()`, `now_ns()`, `sysdate()`, `systimestamp()`,
and `systimestamp_ns()` as clock functions and checks each the same way. The
cleanup job only frees disk for conditions it can **prove** are one-way:

- conditions that do not use the clock (`WHEN amount < 1.5`), and
- cutoffs on the designated timestamp that only ever move forward: a bare clock
  (for example `timestamp < now()`), a bare clock minus a fixed non-negative
  amount (for example `timestamp < now() - 7200000000`), or a fixed-unit
  look-back with `dateadd` on a bare clock (for example
  `timestamp < dateadd('d', -1, now())`, with units `s`/`m`/`h`/`d`/`w` and
  finer).

Everything else **skips cleanup**: calendar units such as
`dateadd('M', -1, now())` (a month is not a fixed length), look-forward offsets
(`dateadd('h', 1, now())`), further clock math, offsets that are not constant,
and general window `WHEN` conditions. A skipped policy still gives correct query
results (the filter re-runs on every read), but its disk is not freed until you
change the policy to a shape QuestDB can prove.

:::warning

A condition like `WHEN timestamp > now()` expires *future* rows, which
**un-expire** as `now()` moves forward. The read filter re-checks `now()` on
every read and stays correct, and the cleanup job skips this kind of policy
rather than risk deleting a row a later read has to show. The cost is that its
disk is never freed. Write `WHEN` conditions that expire things in the **past**,
or against fixed thresholds, never rows that time will later bring back.

:::

## Inspecting a policy

`SHOW CREATE MATERIALIZED VIEW` shows the policy as DDL you can replay. It leaves
out `CLEANUP EVERY` when the schedule is the default `1h`, and includes it
otherwise:

```questdb-sql
SHOW CREATE MATERIALIZED VIEW trades_latest;
-- ... EXPIRE ROWS KEEP LATEST ON timestamp PARTITION BY symbol
```

The [`materialized_views()`](/docs/query/functions/meta/) function shows the
policy in the `expire_clause`, `expire_cleanup_every`, and `expire_enforcement`
columns (all `NULL` when there is no policy):

```questdb-sql title="List EXPIRE ROWS policies"
SELECT view_name, expire_clause, expire_cleanup_every, expire_enforcement
FROM materialized_views();
```

| view_name     | expire_clause                   | expire_cleanup_every | expire_enforcement |
| ------------- | ------------------------------- | -------------------- | ------------------ |
| trades_sized  | amount < 1.5                    | 1h                   | FILTER_AND_RECLAIM |
| trades_latest | KEEP LATEST ON timestamp PARTITION BY symbol | 1h      | FILTER_ONLY        |
| trades_top2   | KEEP 2 HIGHEST ON price ...     | 1h                   | FILTER_ONLY        |

`expire_enforcement` tells you what the cleanup job does:

- `FILTER_AND_RECLAIM`: reads hide the expired rows, and the job also deletes
  them from disk.
- `FILTER_ONLY`: reads hide the expired rows, but they stay on disk. Every
  relative and window policy is `FILTER_ONLY`, and so is a `WHEN` condition that
  QuestDB cannot prove is one-way.

## Changing or removing a policy

You can set, change, or drop a policy on an existing passthrough view. See
[`ALTER MATERIALIZED VIEW SET EXPIRE`](/docs/query/sql/alter-mat-view-set-expire/):

```questdb-sql
-- set or replace the policy
ALTER MATERIALIZED VIEW trades_latest SET EXPIRE ROWS KEEP LATEST ON timestamp PARTITION BY symbol;

-- remove it (keeps all rows again)
ALTER MATERIALIZED VIEW trades_latest DROP EXPIRE;
```

`SET EXPIRE ROWS` checks the new policy against the view's columns before
applying it, so an invalid condition or an unknown column is rejected up front
instead of breaking later reads.

## Limitations and operational notes

- **Reads recompute the kept set.** A relative or window policy works out its
  kept set over the whole view on every read. `KEEP LATEST` on an
  [indexed](/docs/concepts/deep-dive/indexes/) symbol key is cheap; the window
  modes (and keep-latest on a non-indexed column) scan the view.
- **Cleanup tuning only affects reclaiming policies.** For a `WHEN` policy that
  reports `FILTER_AND_RECLAIM`, a shorter `CLEANUP EVERY` means expired rows are
  removed sooner from older partitions. It does nothing for relative or window
  policies that report `FILTER_ONLY`.
- **Cleanup pauses under continuous refresh.** Cleanup only runs when the view is
  idle and fully up to date, so a view that is refreshing continuously defers
  cleanup to a quiet pass. The read filter still works in the meantime.
- **`KEEP LATEST [ON timestamp]`.** The optional `ON timestamp` is accepted for
  readability, but the view always uses its designated timestamp; naming any
  other column is rejected.
- **When cleanup runs.** See
  [Monotonicity and cleanup safety](#monotonicity-and-cleanup-safety), and check
  a view's behavior with `materialized_views().expire_enforcement`.
- **Reserved column name.** The window/keep modes work through a hidden true/false
  column named `__qdb_re_keep`, so a policy is rejected on a view that already has
  a column with that name.
- **No line comments in the clause.** The clause text is stored as-is and put into
  generated SQL, so `--` comments are rejected inside an `EXPIRE ROWS` clause.
  Block comments (`/* ... */`) are fine.
- **Cleaning a Parquet partition rewrites it as native storage.** When cleanup
  rewrites a *partly*-expired partition held in Parquet, that partition goes back
  to native QuestDB storage until the Parquet-conversion job converts it again.
  The row deletion itself is still correct.

## Related documentation

- [Materialized views](/docs/concepts/materialized-views/): the view type
  `EXPIRE ROWS` runs on
- [Passthrough views](/docs/concepts/materialized-views/#passthrough-views): the
  non-aggregating views `EXPIRE ROWS` applies to
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/): full create
  syntax, including the `EXPIRE ROWS` clause
- [ALTER MATERIALIZED VIEW SET EXPIRE](/docs/query/sql/alter-mat-view-set-expire/):
  set, change, or drop a policy
- [Time To Live (TTL)](/docs/concepts/ttl/): partition-level retention by age
- [Storage policy](/docs/concepts/storage-policy/): staged partition lifecycle
  (Enterprise)
