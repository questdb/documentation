---
title: Expiring rows (EXPIRE ROWS)
sidebar_label: EXPIRE ROWS
description:
  EXPIRE ROWS is a row-level retention policy for passthrough materialized
  views. Keep the latest row per key, the top-N per group, or rows matching a
  predicate. Policies are recomputed continuously, with expired rows hidden
  immediately and reclaimed in the background under the modes that allow it.
---

`EXPIRE ROWS` is a row-level retention policy for
[materialized views](/docs/concepts/materialized-views/). Where
[TTL](/docs/concepts/ttl/) drops whole partitions once they age out, `EXPIRE
ROWS` decides retention **row by row**. It can keep the latest row per key, the
top-N per group, rows matching a predicate, and so on. It recomputes the result
continuously as the view refreshes.

Expired rows disappear from query results **immediately** in every mode. Their
on-disk storage is reclaimed afterwards by a background job under a monotonic
`WHEN` predicate; the relative modes (`KEEP LATEST`, `KEEP HIGHEST/LOWEST`,
`KEEP N`) and window predicates hide rows without freeing disk. See
[The modes](#the-modes) and
[Monotonicity and cleanup safety](#monotonicity-and-cleanup-safety).

## The modes

Every mode keeps a defined set of rows and expires the rest. A row is expired
only when the rule selects it for removal.

| Mode                  | What it keeps                                       | Syntax                                                              | Frees disk            |
| --------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| Per-row predicate     | Rows for which the predicate is **not** `TRUE`      | `EXPIRE ROWS WHEN predicate`                                        | Yes, when monotonic   |
| Keep latest           | The latest row per key (current state per key)      | `EXPIRE ROWS KEEP LATEST [ON timestamp] PARTITION BY cols`           | No (read filter only) |
| Keep highest / lowest | Rows tied at the group max / min of a column        | `EXPIRE ROWS KEEP HIGHEST\|LOWEST col [PARTITION BY cols]`          | No (read filter only) |
| Keep top-N            | The `N` highest / lowest rows per group             | `EXPIRE ROWS KEEP N HIGHEST\|LOWEST col [PARTITION BY cols]`        | No (read filter only) |
| Window predicate      | Rows for which a window predicate is **not** `TRUE` | `EXPIRE ROWS WHEN windowPredicate`                                  | No (read filter only) |

`KEEP HIGHEST/LOWEST` and `KEEP N` are convenience forms that desugar to a
window predicate, so the window `WHEN` is the general escape hatch.

The bare `KEEP HIGHEST/LOWEST` form accepts `BYTE`, `SHORT`, `INT`, `LONG`,
`FLOAT`, `DOUBLE`, `DATE`, `TIMESTAMP` and `DECIMAL` columns. The top-N form has
a broader type surface: `KEEP N HIGHEST/LOWEST` ranks with `ORDER BY`, so it
accepts any orderable column type. For example, use `KEEP 1 HIGHEST symbol`, not
`KEEP HIGHEST symbol`, to rank a `SYMBOL` column. This changes tie and `NULL`
behavior: the top-N form keeps exactly one row per group using the designated
timestamp as a descending tiebreaker. An integer or timestamp `NULL` sorts last
and is expired, while a floating-point `NULL` sorts first. The bare form keeps
every row tied at the extreme and every `NULL`.

For how read filtering and physical reclamation differ between modes, see
[How it works](#how-it-works). You can inspect the behavior selected for a view
through `materialized_views().expire_enforcement`; see
[Inspecting a policy](#inspecting-a-policy).

The clause is attached to a passthrough `CREATE MATERIALIZED VIEW` (after the
query, and after `PARTITION BY` if present), or set later with
[`ALTER MATERIALIZED VIEW ... SET EXPIRE ROWS`](/docs/query/sql/alter-mat-view-set-expire/):

```
EXPIRE ROWS
  { WHEN predicate
  | KEEP LATEST [ ON timestampColumn ] PARTITION BY col [, col ...]
  | KEEP [ N ] ( HIGHEST | LOWEST ) col [ PARTITION BY col [, col ...] ] }
  [ CLEANUP EVERY duration ]
```

| Element            | Meaning                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `predicate`        | Any boolean expression over the view's columns. A row expires when it evaluates `TRUE`.  |
| `KEEP LATEST`      | Keep the latest row per `PARTITION BY` key, by the designated timestamp.                  |
| `ON timestampCol`  | Optional; if given it must name the view's designated timestamp.                          |
| `HIGHEST\|LOWEST`  | Keep rows at the max / min of `col` per group (`N` omitted), or the top `N` per group.    |
| `CLEANUP EVERY`    | How often the background reclamation job runs for this view: `<number><unit>` with unit `s`/`m`/`h`/`d`/`w`. Defaults to `1h` if omitted. |

:::note

`EXPIRE ROWS` is **materialized-view-only**: `CREATE TABLE ... EXPIRE ROWS` is
rejected. It is designed for a **passthrough** (non-aggregating) view, where
`SELECT * FROM base` has no `SAMPLE BY` / `GROUP BY`, the view mirrors base rows
1:1, and reclamation is permanent. An aggregating view is **accepted with a
logged advisory** because a later refresh can regenerate reclaimed rows from
base rows that still exist (see
[Requirements](#requirements)). For base-table retention use
[TTL](/docs/concepts/ttl/) or, on Enterprise,
[storage policies](/docs/concepts/storage-policy/).

:::

## When to use EXPIRE ROWS

Reach for `EXPIRE ROWS` on a passthrough materialized view when you want a
continuously-maintained, pruned copy of a base table:

- **Current-state-per-key tables**: keep only the latest row per device,
  symbol, or session (`KEEP LATEST`).
- **Per-group extremes or leaderboards**: keep the highest/lowest value per
  group, or the top-N (`KEEP HIGHEST/LOWEST`, `KEEP N`).
- **Rolling row-level windows**: keep rows newer than a moving cutoff such as
  `now() - 7d`, at finer granularity than TTL's whole-partition drops
  (`WHEN predicate`).

The `WHEN` form earns its keep on predicates that involve **wall-clock time**. A
deterministic predicate depends only on the row's own values and selects the
same rows more cheaply as a `WHERE` clause in the view's defining query, which
never copies the excluded rows into the view at all. See
[`WHERE` filter or `EXPIRE ROWS`?](#where-filter-or-expire-rows).

Use [TTL](/docs/concepts/ttl/) instead when partition-granularity, age-based
retention on a base table is enough. It is cheaper and has no passthrough-view
requirement.

## Requirements

`EXPIRE ROWS` is designed for a **passthrough materialized view**:

- The view query keeps view rows 1:1 with base rows as a projection over a single
  table, with or without a `WHERE` filter. See
  [which queries are passthrough](/docs/concepts/materialized-views/#which-queries-are-passthrough)
  for the full rules.
- The view inherits the base table's
  [designated timestamp](/docs/concepts/designated-timestamp/), partitioning and
  symbol indexes.

A passthrough view mirrors its base table 1:1 and refreshes incrementally, so it
is effectively a continuously-maintained replica. `EXPIRE ROWS` prunes that
replica down to the rows you want to keep without touching the base table.

A **non-passthrough (aggregating) view is accepted with a logged advisory**
rather than rejected: physical reclamation only sticks when base-table retention
is aligned with the expiry horizon because a later incremental or full refresh
can regenerate a reclaimed row from base rows that still exist.

A policied view must also stand alone: `CREATE MATERIALIZED VIEW` rejects a
defining query that reads a policied view (as its base or in a join), and
`ALTER ... SET EXPIRE` is rejected on a view that other materialized views
derive from because those views would copy expired rows on refresh.

## Worked examples

The following walks through every mode on a small fixed dataset so you can see
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
  ('BTC', 'buy',  100.0, 1.0, '2024-01-01T10:00:00.000000Z'),
  ('BTC', 'sell', 105.0, 2.0, '2024-01-01T11:00:00.000000Z'),
  ('BTC', 'buy',  102.0, 1.5, '2024-01-02T09:00:00.000000Z'),
  ('ETH', 'sell',  50.0, 3.0, '2024-01-01T10:30:00.000000Z'),
  ('ETH', 'buy',   55.0, 1.0, '2024-01-02T08:00:00.000000Z');
```

:::note

A materialized view starts an **asynchronous initial refresh** on creation, so
it may briefly return no rows. Check progress with
`SELECT view_name, view_status, base_table_txn, refresh_base_table_txn FROM materialized_views();`
The view is up to date when `refresh_base_table_txn = base_table_txn`. With
this small dataset that is effectively instant.

:::

### Per-row predicate: `WHEN`

A per-row predicate expires a row when it evaluates `TRUE`. The example below
uses a deterministic predicate to expire small trades (`amount < 1.5`) because
it makes the keep-set easy to read off the sample data. In production
that rule belongs in the view's `WHERE` clause (`WHERE amount >= 1.5`), which
keeps those rows out of the view entirely; the rolling window further down is
the case `WHEN` exists for.

```questdb-sql title="Expire rows where amount < 1.5"
CREATE MATERIALIZED VIEW trades_sized AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN amount < 1.5;

SELECT * FROM trades_sized ORDER BY timestamp;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| ETH    | sell | 50.0  | 3.0    | 2024-01-01T10:30:00.000000Z |
| BTC    | sell | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |

The two `amount = 1.0` rows are expired. `amount = 1.5` is kept (`1.5 < 1.5` is
`FALSE`), and any `NULL` amount would be kept too because a comparison against
`NULL` evaluates to `FALSE` in QuestDB. See [NULLs](#nulls).

A predicate on the designated timestamp gives a **rolling retention window**,
which is the main use for `WHEN`. It is re-evaluated on every read, so the
visible set rolls forward with the clock, and no `WHERE` clause can express it
because the defining query rejects `now()`:

```questdb-sql title="Keep the last 1 day"
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < dateadd('d', -1, now());
```

(With the 2024 sample timestamps above, every row is already older than a day
and would be hidden; use recent data to see rows retained.)

`WHEN timestamp < dateadd('d', -1, now())` and
`WHEN timestamp < now() - 86400000000` retain the same rows and both reclaim
disk because the cleanup job proves either form monotonic.

### Keep latest per key: `KEEP LATEST`

Keep only the most recent row per key to turn the passthrough view into a live,
current-state-per-symbol table:

```questdb-sql title="Keep the latest row per symbol"
CREATE MATERIALIZED VIEW trades_latest AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP LATEST PARTITION BY symbol;

SELECT * FROM trades_latest ORDER BY timestamp;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| ETH    | buy  | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |

The designated `timestamp` column determines the latest row for each symbol. As
new trades arrive, the kept row advances automatically. `PARTITION BY` may list
multiple key columns. You may write
`KEEP LATEST ON timestamp PARTITION BY symbol`, but the `ON` column must be the
view's designated timestamp.

### Keep extremes per group: `KEEP HIGHEST` / `KEEP LOWEST`

Keep the rows tied at the group maximum (or minimum) of a column:

```questdb-sql title="Keep the highest-priced trade per symbol"
CREATE MATERIALIZED VIEW trades_peak AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP HIGHEST price PARTITION BY symbol;

SELECT * FROM trades_peak;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| BTC    | sell | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| ETH    | buy  | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |

`KEEP LOWEST price PARTITION BY symbol` keeps the cheapest instead (BTC `100.0`,
ETH `50.0`). All rows **tied** at the extreme are kept, and `NULL`-valued rows
are kept (a `NULL` is never less than the max).

### Keep top-N per group: `KEEP N HIGHEST` / `KEEP N LOWEST`

Keep a per-group leaderboard with the `N` highest (or lowest) rows:

```questdb-sql title="Keep the 2 highest-priced trades per symbol"
CREATE MATERIALIZED VIEW trades_top2 AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP 2 HIGHEST price PARTITION BY symbol;

SELECT * FROM trades_top2 ORDER BY symbol, price DESC;
```

| symbol | side | price | amount | timestamp                   |
| ------ | ---- | ----- | ------ | --------------------------- |
| BTC    | sell | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| BTC    | buy  | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |
| ETH    | buy  | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |
| ETH    | sell | 50.0  | 3.0    | 2024-01-01T10:30:00.000000Z |

BTC keeps its two highest (`105`, `102`) and drops `100`; ETH has only two rows,
so both survive. Ties are broken by the designated timestamp, so the N-th
boundary is deterministic.

### Window predicate: the escape hatch

`KEEP HIGHEST/LOWEST` and `KEEP N` are shorthand for window predicates. When you
need a rule they do not cover, write the window predicate directly in `WHEN`.
For example, this is exactly what `KEEP HIGHEST price PARTITION BY symbol`
expands to:

```questdb-sql title="Equivalent to KEEP HIGHEST, written as a window predicate"
CREATE MATERIALIZED VIEW trades_peak_win AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN price < max(price) OVER (PARTITION BY symbol);
```

A row expires when its price is below its symbol's maximum, so only the peak per
symbol survives. This produces the same result as `trades_peak` above. From here
you can express richer rules, for example keeping rows within 5% of the peak
(`WHEN price < 0.95 * max(price) OVER (PARTITION BY symbol)`) or a ranked window
(`WHEN row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) > 100`).

## `WHERE` filter or `EXPIRE ROWS`?

A passthrough view can exclude rows in two places: a `WHERE` clause in its
defining query, or an `EXPIRE ROWS WHEN` predicate. The dividing line is the
clock.

**Use `EXPIRE ROWS WHEN` for rules that move with wall-clock time.** A rolling
window cannot be written as a `WHERE` clause at all: a view's defining query
rejects non-deterministic functions, so
`WHERE timestamp > dateadd('d', -7, now())` is not accepted.
`EXPIRE ROWS WHEN timestamp < dateadd('d', -7, now())` is the supported way to
say "keep the last 7 days". The read filter re-evaluates `now()` on every read,
so the window rolls forward on its own and the cleanup job reclaims the disk
behind it. This is what the `WHEN` form is for.

**Put a deterministic predicate in the `WHERE` clause.** A predicate that
depends only on the row's own values, such as `symbol = 'BTC'` or
`amount >= 1.5`, describes the same surviving rows either way, so the two are
near-equivalent in what the view contains, and `WHERE` is the cheaper of the two
at every stage. A row the `WHERE` clause excludes is never copied into the view:

| | `WHERE` in the query | `EXPIRE ROWS WHEN` |
| --- | --- | --- |
| Storage | Row is never written | Row is written; only a `FILTER_AND_RECLAIM` policy can reclaim it later |
| Read cost | None | The keep-set filter is applied on every read of the view |
| Write cost | None | Cleanup can rewrite partitions for `FILTER_AND_RECLAIM` policies |
| After a full refresh | Still excluded | Re-materialized from the base, then hidden; eligible policies sweep it again |
| Can be another view's base | Yes | No (a policied view is rejected as a base) |

That last row is a hard constraint rather than a preference. If any other view
will read this one, the policy is not available and the predicate has to go in
the `WHERE` clause.

The two forms are not exact negations of each other on `NULL`s: `WHERE` keeps a
row only when the predicate is `TRUE`, while `EXPIRE ROWS WHEN` expires a row
only when it is `TRUE`. A `NULL` amount is dropped by `WHERE amount >= 1.5` and
kept by `EXPIRE ROWS WHEN amount < 1.5`. See [NULLs](#nulls).

The two compose, and on a passthrough view that combination is usually the right
shape: the `WHERE` clause fixes what the view is about, and the `WHEN` policy
fixes how long it keeps what it has.

```questdb-sql title="A filter for the subject, a policy for the horizon"
CREATE MATERIALIZED VIEW trades_btc_recent AS (
  SELECT * FROM trades WHERE symbol = 'BTC'
) EXPIRE ROWS WHEN timestamp < dateadd('d', -7, now()) CLEANUP EVERY 1h;
```

### When a deterministic cutoff still belongs in a policy

One case pulls a deterministic predicate back into `EXPIRE ROWS`: a fixed
threshold you expect to advance by hand. There is no
`ALTER MATERIALIZED VIEW ... AS <new query>`, so changing a `WHERE` clause means
dropping the view and re-creating it, which re-materializes it from the base.
Changing a policy is a metadata operation:

```questdb-sql title="Retuning a retention horizon without a rebuild"
ALTER MATERIALIZED VIEW trades_recent
  SET EXPIRE ROWS WHEN timestamp < '2024-06-01T00:00:00.000000Z';
ALTER MATERIALIZED VIEW trades_recent
  SET EXPIRE ROWS WHEN timestamp < '2024-07-01T00:00:00.000000Z';
ALTER MATERIALIZED VIEW trades_recent DROP EXPIRE;
```

The rebuild a `WHERE` change forces is not only slow, it can lose data: if the
base table has its own [TTL](/docs/concepts/ttl/), re-creating the view reads a
base that no longer holds everything the view held. A view whose retention
horizon is longer than its base table's cannot afford to be rebuilt, so its
cutoff belongs in a policy.

A rule that compares rows against each other has no `WHERE` equivalent either:
`KEEP LATEST`, `KEEP N HIGHEST/LOWEST` and window predicates cannot be expressed
in the defining query, because a `LATEST ON` or a window function there makes
the view non-passthrough.

## How it works

`EXPIRE ROWS` has two cooperating parts: an authoritative read-time filter and a
best-effort background cleanup.

### Read-time filter (authoritative)

Every query against a policied view is transparently rewritten so that only the
kept rows are visible **immediately, regardless of whether cleanup has run**.
This is what makes results correct at all times:

- **Per-row `WHEN`** keeps rows where the predicate is not `TRUE`. QuestDB
  comparisons use two-valued boolean semantics, so a comparison against `NULL`
  is `FALSE`. Whether the complete predicate keeps or expires a `NULL` row
  depends on operators such as `NOT`, `!=`, and `IS NULL` (see [NULLs](#nulls)).
- **`KEEP LATEST`** returns the latest row per key using the designated
  timestamp.
- **`KEEP HIGHEST/LOWEST/N` and window `WHEN`** compute the keep-set with a
  window function over the whole view.

Because the filter is applied at query time, a freshly-refreshed row that should
be expired is hidden the moment it lands, and a row that should reappear (under a
time-based predicate) reappears on the next read.

### Physical cleanup (best-effort)

A background job reclaims disk for non-active partitions. It never rewrites the
active logical partition that receives new rows. A young view with only one
partition therefore reclaims no disk yet, even when its policy reports
`FILTER_AND_RECLAIM`. Once data creates a newer active partition, the older one
becomes eligible for cleanup. Read filtering remains effective throughout.

A fully-expired eligible partition is removed. Under a rolling clock-based
predicate, a partially-expired partition is compacted down to its survivors only
when the expired-row fraction reaches
`cairo.mat.view.row.expiry.cleanup.min.expired.fraction`, which defaults to
`0.5`. This avoids repeatedly rewriting a boundary partition as the cutoff moves
through it. Set the property to `0` to compact on the first expired row, or to
`1` to disable partial-partition compaction; fully-expired partitions are still
removed. The threshold does not delay a fixed, deterministic predicate, whose
expired-row verdicts cannot change with time.

The job runs at the `CLEANUP EVERY` cadence (default `1h`) and is **best-effort**.
The read filter is authoritative, so deferred or skipped reclamation only
affects disk usage, never query results.

The job runs only under a monotonic `WHEN` predicate. It skips `KEEP LATEST`,
`KEEP HIGHEST/LOWEST`, `KEEP N` and window policies entirely: a later refresh
can remove the row those modes currently keep, which promotes an older row back
into the keep-set, and the job cannot reconstruct a row it has already deleted.
Those views accumulate their expired rows on disk.

On QuestDB Enterprise, cleanup runs on the **primary only**, but the reclamation
still replicates: the compaction commits are ordinary WAL transactions, so
replicas reclaim the identical rows by applying them. A read-only replica neither
runs the job nor needs to. Disable the job with
`cairo.mat.view.row.expiry.cleanup.enabled=false` in `server.conf` (reads stay
filtered, but only reclamation stops; the setting does not disable `EXPIRE ROWS`
itself). Cleanup settings are read at startup, so changing this property or the
minimum expired fraction requires a restart. A failing sweep retries after one
second, doubling the per-view retry gap up to a 10-minute cap.

To observe reclamation, compare the physical row count per partition before and
after a sweep:

```questdb-sql title="Physical rows still on disk per partition"
SELECT name, numRows FROM table_partitions('trades_recent');
```

Use a view whose `expire_enforcement` is `FILTER_AND_RECLAIM`, such as
`trades_recent`, for this check. Its active partition remains unchanged after a
sweep. Insert data into a newer partition before expecting the current active
partition to become eligible for reclamation.

Reclamation **defers while a view is being refreshed continuously** and resumes
on a quiet sweep.

## Semantics

### NULLs

QuestDB comparisons use two-valued boolean semantics: a comparison against
`NULL` evaluates to `FALSE`, not `UNKNOWN`, and `EXPIRE ROWS WHEN` expires a row
only when the complete predicate evaluates to `TRUE`. The complete predicate
therefore determines whether a `NULL` row survives:

- **A direct comparison such as `amount < 1.5`** is `FALSE` for a `NULL` amount,
  so the policy keeps the row.
- **`NOT (amount >= 1.5)`** is `TRUE` for a `NULL` amount because the inner
  comparison is `FALSE`, so the policy expires the row. Although this predicate
  resembles `amount < 1.5`, the two differ for `NULL` values.
- **`amount != 1.5` and `amount IS NULL`** are also `TRUE` for a `NULL` amount,
  so both expire the row.
- **`KEEP HIGHEST/LOWEST`** keeps a `NULL` because its comparison against the
  group extreme is `FALSE`.
- **`KEEP LATEST`** uses the designated timestamp, which is never `NULL`.
- **`KEEP N` is the exception.** It ranks rows with `row_number()`, and QuestDB
  has no `NULLS LAST`, so where a `NULL` lands is **type-dependent**: under
  `DESC` a floating-point `NULL` (NaN) sorts first (kept while there is room in
  `N`), while an integer/timestamp `NULL` sorts last (expired first). Use
  `KEEP HIGHEST/LOWEST` (no `N`) when every `NULL` must be kept regardless of
  type.

### A `NULL` threshold is rejected

A `WHEN` threshold that evaluates to a constant `NULL` expires nothing because
`timestamp < NULL` is never `TRUE`, so the policy would be inert. QuestDB
refuses it at `CREATE` and `ALTER` time rather than storing a view that silently
never reclaims:

```questdb-sql title="Rejected: the threshold is NULL"
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < CAST(NULL AS TIMESTAMP);
-- invalid EXPIRE ROWS predicate: the threshold is NULL, so no row can ever expire
```

The check matters most where the `NULL` is not written down. QuestDB stores a
`NULL` `TIMESTAMP`, `LONG` or `INT` as a reserved value at the bottom of the
type's range, and integer arithmetic wraps silently when it overflows, so an
arithmetic threshold can land on that value:

```questdb-sql title="Also rejected: arithmetic that overflows onto NULL"
-- LONG overflow
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < 4611686018427387904 * 2;

-- INT overflow, reached three orders of magnitude sooner
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN timestamp < 2147483647 + 1;
```

Only thresholds that are constant at definition time are checked this way. One
built from a clock, such as `timestamp < now() - 3600000000`, is evaluated per
read and cannot be checked in advance.

### Ties and determinism

`KEEP HIGHEST/LOWEST` keeps **all** rows tied at the max/min, making the result
deterministic by construction. `KEEP N` makes the order total by appending the
designated timestamp as a tiebreak, so the N-th boundary is deterministic (pair
the base table with [`DEDUP UPSERT KEYS`](/docs/concepts/deduplication/) if
`(col, timestamp)` is not already unique).

### Combining with TTL

A view can carry a [TTL](/docs/concepts/ttl/) and an `EXPIRE ROWS` policy at the
same time, and the order is fixed: **TTL removes rows from the view first, then
the policy applies to the rows that stay.** TTL drops whole partitions from the
view's own storage as they age out, and the keep-set is computed over what
remains.

```questdb-sql title="Highest price per symbol, over a 3-day window"
CREATE MATERIALIZED VIEW trades_peak_3d AS (
  SELECT * FROM trades
) PARTITION BY DAY TTL 3 DAYS
  EXPIRE ROWS KEEP HIGHEST price PARTITION BY symbol;
```

`TTL` goes before `EXPIRE ROWS` in the statement, as it does after any
`PARTITION BY`.

This view reports the highest price of the **last three days**, so its answer
can go **down** as the window moves: when the day holding a symbol's maximum
ages out, the next-highest price within the window takes over. That is what the
two clauses ask for together. The view is no longer "the highest price ever";
it is "the highest price still retained". The base table is unaffected; it keeps
whatever its own retention settings keep.

TTL is also the only control that bounds the size of a `KEEP LATEST`,
`KEEP HIGHEST/LOWEST` or `KEEP N` view, since the cleanup job never reclaims
disk for those modes.

### Monotonicity and cleanup safety

Physical deletion is only safe when expiry is **monotonic**: a row that is
expired now must stay expired forever. Two separate things can break that.

The relative and window modes (`KEEP LATEST`, `KEEP HIGHEST/LOWEST`, `KEEP N`,
window `WHEN`) decide each row's fate by comparing it against the other rows in
the view. A later refresh can remove or replace the row a key currently keeps,
which promotes an older row back into the keep-set. For this reason, the cleanup
job never deletes for these modes, whatever their predicate looks like.

A scalar `WHEN predicate` judges each row on its own, so it is eligible. It is
arbitrary SQL. QuestDB recognizes `now()`, `now_ns()`, `sysdate()`,
`systimestamp()` and `systimestamp_ns()` as wall-clock functions, and gives each
the same monotonicity proof. The cleanup job reclaims disk only for predicates
it can **prove** monotonic:

- clock-free predicates (`WHEN amount < 1.5`), and
- designated-timestamp thresholds of a proven advancing-clock shape: a bare
  clock (for example, `timestamp < now()`), a bare clock minus a non-negative
  constant (for example, `timestamp < now() - 7200000000`), or a fixed-unit
  look-back `dateadd` on a bare clock (for example,
  `timestamp < dateadd('d', -1, now())`, with units `s`/`m`/`h`/`d`/`w` and
  finer).

Anything else **skips cleanup**: calendar units such as
`dateadd('M', -1, now())` (a month is a variable amount), look-forward offsets
(`dateadd('h', 1, now())`),
further clock arithmetic, non-constant offsets, and arbitrary window `WHEN`
predicates. A skipped policy stays correct at read time (the filter recomputes
on every read), but its disk is not reclaimed until the policy is changed to a
proven shape.

:::warning

A non-monotonic predicate such as `WHEN timestamp > now()` expires *future*
rows that **un-expire** as `now()` advances. The read filter recomputes `now()`
on every read and stays correct, and the cleanup job skips such a policy rather
than risk physically deleting a row a later read must show. The tradeoff is that
its disk is never reclaimed. Write `WHEN` predicates that expire things in the
**past** or against fixed thresholds, never rows that the passage of time will
later keep.

:::

## Inspecting a policy

`SHOW CREATE MATERIALIZED VIEW` renders the policy in replayable DDL. It omits
`CLEANUP EVERY` when the cadence is the default `1h` and includes it for a
non-default cadence:

```questdb-sql
SHOW CREATE MATERIALIZED VIEW trades_latest;
-- ... EXPIRE ROWS KEEP LATEST PARTITION BY symbol
```

The [`materialized_views()`](/docs/query/functions/meta/) function exposes the
policy in the `expire_clause`, `expire_cleanup_every` and `expire_enforcement`
columns (all `NULL` when no policy is set):

```questdb-sql title="List EXPIRE ROWS policies"
SELECT view_name, expire_clause, expire_cleanup_every, expire_enforcement
FROM materialized_views();
```

| view_name     | expire_clause                   | expire_cleanup_every | expire_enforcement |
| ------------- | ------------------------------- | -------------------- | ------------------ |
| trades_sized  | amount < 1.5                    | 1h                   | FILTER_AND_RECLAIM |
| trades_latest | KEEP LATEST PARTITION BY symbol | 1h                   | FILTER_ONLY        |
| trades_top2   | KEEP 2 HIGHEST price ...        | 1h                   | FILTER_ONLY        |

`expire_enforcement` is the verdict the cleanup job acts on:

- `FILTER_AND_RECLAIM`: reads hide the expired rows and the job deletes them
  from disk.
- `FILTER_ONLY`: reads hide the expired rows and they stay on disk. Every
  relative and window policy reports this, as does a `WHEN` predicate that
  cannot be proven monotonic.

## Changing or removing a policy

Set, change, or drop a policy on an existing passthrough view. See
[`ALTER MATERIALIZED VIEW SET EXPIRE`](/docs/query/sql/alter-mat-view-set-expire/):

```questdb-sql
-- set or replace the policy
ALTER MATERIALIZED VIEW trades_latest SET EXPIRE ROWS KEEP LATEST PARTITION BY symbol;

-- remove it (keeps all rows again)
ALTER MATERIALIZED VIEW trades_latest DROP EXPIRE;
```

`SET EXPIRE ROWS` validates the new policy against the view's columns before
applying it, so an invalid predicate or an unknown column is rejected up front
rather than breaking subsequent reads.

## Limitations and operational notes

- **Reads recompute the keep-set.** A relative/window policy computes its
  keep-set over the whole physical view on every read. `KEEP LATEST` on an
  [indexed](/docs/concepts/deep-dive/indexes/) symbol key is cheap; the window
  modes (and non-indexed keep-latest) scan the view.
- **Cleanup tuning applies only to reclaiming policies.** For a monotonic scalar
  `WHEN` policy that reports `FILTER_AND_RECLAIM`, a tighter `CLEANUP EVERY`
  reduces how long expired rows remain in eligible non-active partitions. It has
  no reclamation effect on relative or window policies that report
  `FILTER_ONLY`.
- **Cleanup defers under continuous refresh.** Reclamation only proceeds when the
  view is quiescent and fully applied, so a view being refreshed continuously
  defers reclamation to a quiet sweep. The read filter stays authoritative
  meanwhile.
- **`KEEP LATEST [ON timestamp]`.** The optional `ON timestamp` is accepted for
  familiarity, but the view's designated timestamp is always used; naming a
  different column is rejected.
- **Cleanup eligibility.** See
  [monotonicity and cleanup safety](#monotonicity-and-cleanup-safety), and check
  a view's verdict with `materialized_views().expire_enforcement`.
- **Reserved column name.** The window/keep modes compute the keep-set through a
  synthetic boolean column named `__qdb_re_keep`; a policy is rejected on a view
  that exposes a column with that name.
- **No line comments in the clause.** The clause text is stored verbatim and
  embedded into generated SQL, so `--` comments are rejected inside an
  `EXPIRE ROWS` clause; terminated block comments (`/* ... */`) are fine.
- **Compacting a Parquet partition rewrites it as native storage.** When cleanup
  compacts a *partially*-expired partition held in Parquet, the partition
  reverts to native QuestDB storage until the Parquet-conversion job re-converts
  it. Reclamation correctness is unaffected.

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
- [Storage policy](/docs/concepts/storage-policy/): graduated partition
  lifecycle (Enterprise)
