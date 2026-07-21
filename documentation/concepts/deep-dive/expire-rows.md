---
title: Expiring rows (EXPIRE ROWS)
sidebar_label: Expiring rows
description:
  EXPIRE ROWS is a row-level retention policy for passthrough materialized
  views. Keep the latest row per key, the top-N per group, or rows matching a
  predicate — recomputed continuously, with expired rows hidden immediately and
  reclaimed in the background.
---

`EXPIRE ROWS` is a row-level retention policy for
[materialized views](/docs/concepts/materialized-views/). Where
[TTL](/docs/concepts/ttl/) drops whole partitions once they age out, `EXPIRE
ROWS` decides retention **row by row** — keep the latest row per key, the top-N
per group, rows matching a predicate, and so on — and recomputes the result
continuously as the view refreshes.

Expired rows disappear from query results **immediately**; their on-disk storage
is reclaimed afterwards by a background job.

:::note

`EXPIRE ROWS` is **materialized-view-only**: `CREATE TABLE ... EXPIRE ROWS` is
rejected. It is designed for a **passthrough** (non-aggregating) view — `SELECT
* FROM base` with no `SAMPLE BY` / `GROUP BY` — where the view mirrors base
rows 1:1 and reclamation is permanent. An aggregating view is **accepted with a
logged advisory**: reads stay filtered, but a later refresh can regenerate
reclaimed rows from base rows that still exist (see
[Requirements](#requirements)). For base-table retention use
[TTL](/docs/concepts/ttl/) or, on Enterprise,
[storage policies](/docs/concepts/storage-policy/).

:::

## When to use EXPIRE ROWS

Reach for `EXPIRE ROWS` on a passthrough materialized view when you want a
continuously-maintained, pruned copy of a base table:

- **Current-state-per-key tables** — keep only the latest row per device,
  symbol, or session (`KEEP LATEST`).
- **Per-group extremes or leaderboards** — keep the highest/lowest value per
  group, or the top-N (`KEEP HIGHEST/LOWEST`, `KEEP N`).
- **Rolling row-level windows** — keep rows newer than a cutoff, or matching any
  predicate, at finer granularity than TTL's whole-partition drops
  (`WHEN predicate`).

Use [TTL](/docs/concepts/ttl/) instead when partition-granularity, age-based
retention on a base table is enough — it is cheaper and has no passthrough-view
requirement.

## Requirements

`EXPIRE ROWS` is designed for a **passthrough materialized view**:

- The view query is `SELECT * FROM base`. A column subset and a `WHERE` filter
  keep the view passthrough; aggregation, `SAMPLE BY`, `GROUP BY`, `LATEST ON`,
  `DISTINCT`, `UNION`, and `JOIN` make it non-passthrough.
- The view inherits the base table's
  [designated timestamp](/docs/concepts/designated-timestamp/) and partitioning.

A passthrough view mirrors its base table 1:1 and refreshes incrementally, so it
is effectively a continuously-maintained replica. `EXPIRE ROWS` prunes that
replica down to the rows you want to keep — without touching the base table.

A **non-passthrough (aggregating) view is accepted with a logged advisory**
rather than rejected: the read filter still hides expired rows, but physical
reclamation only sticks when base-table retention is aligned with the expiry
horizon — a later incremental or full refresh can regenerate a reclaimed row
from base rows that still exist.

A policied view must also stand alone: `CREATE MATERIALIZED VIEW` rejects a
defining query that reads a policied view (as its base or in a join), and
`ALTER ... SET EXPIRE` is rejected on a view that other materialized views
derive from — otherwise those views would copy expired rows on refresh.

## The modes

Every mode keeps a defined set of rows and expires the rest. A row is expired
only when the rule selects it for removal.

| Mode                  | What it keeps                                        | Syntax                                                          |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| Per-row predicate     | Rows for which the predicate is **not** `TRUE`       | `EXPIRE ROWS WHEN predicate`                                    |
| Keep latest           | The latest row per key (current state per key)       | `EXPIRE ROWS KEEP LATEST [ON ts] PARTITION BY cols`            |
| Keep highest / lowest | Rows tied at the group max / min of a column         | `EXPIRE ROWS KEEP HIGHEST\|LOWEST col [PARTITION BY cols]`     |
| Keep top-N            | The `N` highest / lowest rows per group              | `EXPIRE ROWS KEEP N HIGHEST\|LOWEST col [PARTITION BY cols]`   |
| Window predicate      | Rows for which a window predicate is **not** `TRUE`  | `EXPIRE ROWS WHEN windowPredicate`                             |

`KEEP HIGHEST/LOWEST` and `KEEP N` are convenience forms that desugar to a
window predicate, so the window `WHEN` is the general escape hatch.

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

## Worked examples

The following walks through every mode on a small fixed dataset so you can see
exactly which rows each policy keeps.

### Setup

```questdb-sql title="Base table and sample data"
CREATE TABLE trades (
  symbol SYMBOL,
  price  DOUBLE,
  amount DOUBLE,
  ts     TIMESTAMP
) TIMESTAMP(ts) PARTITION BY DAY WAL;

INSERT INTO trades VALUES
  ('BTC', 100.0, 1.0, '2024-01-01T10:00:00.000000Z'),
  ('BTC', 105.0, 2.0, '2024-01-01T11:00:00.000000Z'),
  ('BTC', 102.0, 1.5, '2024-01-02T09:00:00.000000Z'),
  ('ETH',  50.0, 3.0, '2024-01-01T10:30:00.000000Z'),
  ('ETH',  55.0, 1.0, '2024-01-02T08:00:00.000000Z');
```

:::note

A materialized view starts an **asynchronous initial refresh** on creation, so
it may briefly return no rows. Check progress with
`SELECT view_name, view_status, base_table_txn, refresh_base_table_txn FROM materialized_views();`
— the view is up to date when `refresh_base_table_txn = base_table_txn`. With
this small dataset that is effectively instant.

:::

### Per-row predicate: `WHEN`

A per-row predicate expires a row when it evaluates `TRUE`. Here, expire small
trades (`amount < 1.5`):

```questdb-sql title="Expire rows where amount < 1.5"
CREATE MATERIALIZED VIEW trades_sized AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN amount < 1.5;

SELECT * FROM trades_sized;
```

| symbol | price | amount | ts                          |
| ------ | ----- | ------ | --------------------------- |
| BTC    | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| BTC    | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |
| ETH    | 50.0  | 3.0    | 2024-01-01T10:30:00.000000Z |

The two `amount = 1.0` rows are expired. `amount = 1.5` is kept (`1.5 < 1.5` is
`FALSE`), and any `NULL` amount would be kept too (the comparison is `UNKNOWN`,
not `TRUE` — see [NULLs](#nulls)).

A predicate on the designated timestamp gives a **rolling retention window**,
re-evaluated on every read so the visible set rolls forward with the clock:

```questdb-sql title="Keep the last 1 day"
CREATE MATERIALIZED VIEW trades_recent AS (
  SELECT * FROM trades
) EXPIRE ROWS WHEN ts < dateadd('d', -1, now());
```

(With the 2024 sample timestamps above, every row is already older than a day
and would be hidden; use recent data to see rows retained.)

### Keep latest per key: `KEEP LATEST`

Keep only the most recent row per key — turning the passthrough view into a
live, current-state-per-symbol table:

```questdb-sql title="Keep the latest row per symbol"
CREATE MATERIALIZED VIEW trades_latest AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP LATEST PARTITION BY symbol;

SELECT * FROM trades_latest;
```

| symbol | price | amount | ts                          |
| ------ | ----- | ------ | --------------------------- |
| BTC    | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |
| ETH    | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |

One row per symbol — the latest by the designated timestamp `ts`. As new trades
arrive, the kept row advances automatically. `PARTITION BY` may list multiple key
columns. You may write `KEEP LATEST ON ts PARTITION BY symbol`, but the `ON`
column must be the view's designated timestamp.

### Keep extremes per group: `KEEP HIGHEST` / `KEEP LOWEST`

Keep the rows tied at the group maximum (or minimum) of a column:

```questdb-sql title="Keep the highest-priced trade per symbol"
CREATE MATERIALIZED VIEW trades_peak AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP HIGHEST price PARTITION BY symbol;

SELECT * FROM trades_peak;
```

| symbol | price | amount | ts                          |
| ------ | ----- | ------ | --------------------------- |
| BTC    | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| ETH    | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |

`KEEP LOWEST price PARTITION BY symbol` keeps the cheapest instead (BTC `100.0`,
ETH `50.0`). All rows **tied** at the extreme are kept, and `NULL`-valued rows
are kept (a `NULL` is never less than the max).

### Keep top-N per group: `KEEP N HIGHEST` / `KEEP N LOWEST`

Keep a per-group leaderboard — the `N` highest (or lowest) rows:

```questdb-sql title="Keep the 2 highest-priced trades per symbol"
CREATE MATERIALIZED VIEW trades_top2 AS (
  SELECT * FROM trades
) EXPIRE ROWS KEEP 2 HIGHEST price PARTITION BY symbol;

SELECT * FROM trades_top2 ORDER BY symbol, price DESC;
```

| symbol | price | amount | ts                          |
| ------ | ----- | ------ | --------------------------- |
| BTC    | 105.0 | 2.0    | 2024-01-01T11:00:00.000000Z |
| BTC    | 102.0 | 1.5    | 2024-01-02T09:00:00.000000Z |
| ETH    | 55.0  | 1.0    | 2024-01-02T08:00:00.000000Z |
| ETH    | 50.0  | 3.0    | 2024-01-01T10:30:00.000000Z |

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
symbol survives — the same result as `trades_peak` above. From here you can
express richer rules, for example keeping rows within 5% of the peak
(`WHEN price < 0.95 * max(price) OVER (PARTITION BY symbol)`) or a ranked window
(`WHEN row_number() OVER (PARTITION BY symbol ORDER BY ts DESC) > 100`).

## How it works

`EXPIRE ROWS` has two cooperating parts: an authoritative read-time filter and a
best-effort background cleanup.

### Read-time filter (authoritative)

Every query against a policied view is transparently rewritten so that only the
kept rows are visible — **immediately, and regardless of whether cleanup has
run**. This is what makes results correct at all times:

- **Per-row `WHEN`** keeps rows where the predicate is not `TRUE`. QuestDB
  filtering is three-valued, so `FALSE` **and** `NULL` are kept (see
  [NULLs](#nulls)).
- **`KEEP LATEST`** returns the latest row per key using the designated
  timestamp.
- **`KEEP HIGHEST/LOWEST/N` and window `WHEN`** compute the keep-set with a
  window function over the whole view.

Because the filter is applied at query time, a freshly-refreshed row that should
be expired is hidden the moment it lands, and a row that should reappear (under a
time-based predicate) reappears on the next read.

### Physical cleanup (best-effort)

A background job reclaims disk for non-active partitions: a fully-expired
partition is removed, and a partially-expired one is compacted down to its
survivors. It runs at the `CLEANUP EVERY` cadence (default `1h`) and is
**best-effort** — the read filter is authoritative, so deferred or skipped
reclamation only affects disk usage, never query results.

On QuestDB Enterprise, cleanup runs on the **primary only**, but the reclamation
still replicates: the compaction commits are ordinary WAL transactions, so
replicas reclaim the identical rows by applying them. A read-only replica neither
runs the job nor needs to. Disable the job with `cairo.row.expiry.enabled=false`
in `server.conf` (reads stay filtered; only reclamation stops); the setting is
read at startup, so changing it requires a restart. A failing sweep retries
after one second, doubling the per-view retry gap up to a 10-minute cap.

To observe reclamation, compare the physical row count per partition before and
after a sweep:

```questdb-sql title="Physical rows still on disk per partition"
SELECT name, numRows FROM table_partitions('trades_latest');
```

Reclamation **defers while a view is being refreshed continuously** and resumes
on a quiet sweep.

## Semantics

### NULLs

The keep-set is computed with three-valued logic, so a `NULL` value is never
*less than* a group maximum (the comparison is `UNKNOWN`, not `TRUE`).
Therefore:

- **`KEEP HIGHEST/LOWEST` and value-based `WHEN`** predicates **keep** rows whose
  value is `NULL`.
- **`KEEP LATEST`** uses the designated timestamp, which is never `NULL`.
- **`KEEP N` is the exception.** It ranks rows with `row_number()`, and QuestDB
  has no `NULLS LAST`, so where a `NULL` lands is **type-dependent**: under
  `DESC` a floating-point `NULL` (NaN) sorts first (kept while there is room in
  `N`), while an integer/timestamp `NULL` sorts last (expired first). Use
  `KEEP HIGHEST/LOWEST` (no `N`) when every `NULL` must be kept regardless of
  type.

### Ties and determinism

`KEEP HIGHEST/LOWEST` keeps **all** rows tied at the max/min — deterministic by
construction. `KEEP N` makes the order total by appending the designated
timestamp as a tiebreak, so the N-th boundary is deterministic (pair the base
table with [`DEDUP UPSERT KEYS`](/docs/concepts/deduplication/) if `(col, ts)`
is not already unique).

### Monotonicity and cleanup safety

Physical deletion is only safe when expiry is **monotonic**: a row that is
expired now must stay expired forever. All the relative modes (`KEEP LATEST`,
`KEEP HIGHEST/LOWEST`, `KEEP N`) are monotonic by construction. A scalar
`WHEN predicate` is arbitrary SQL, so the cleanup job reclaims disk only for
predicates it can **prove** monotonic:

- clock-free predicates (`WHEN amount < 1.5`), and
- designated-timestamp thresholds of a proven advancing-clock shape: a bare
  clock (`ts < now()`), a bare clock minus a non-negative constant
  (`ts < now() - 7200000000`), or a fixed-unit look-back `dateadd` on a bare
  clock (`ts < dateadd('d', -1, now())`, units `s`/`m`/`h`/`d`/`w` and finer).

Anything else **skips cleanup**: calendar units (`dateadd('M', -1, now())` — a
month is a variable amount), look-forward offsets (`dateadd('h', 1, now())`),
further clock arithmetic, non-constant offsets, and arbitrary window `WHEN`
predicates. A skipped policy stays correct at read time (the filter recomputes
on every read), but its disk is not reclaimed until the policy is changed to a
proven shape.

:::warning

A non-monotonic predicate such as `WHEN ts > now()` expires *future* rows that
**un-expire** as `now()` advances. The read filter recomputes `now()` on every
read and stays correct, and the cleanup job skips such a policy rather than
risk physically deleting a row a later read must show — at the cost of disk
never being reclaimed for it. Write `WHEN` predicates that expire things in the
**past** or against fixed thresholds — never rows that the passage of time will
later keep.

:::

## Inspecting a policy

`SHOW CREATE MATERIALIZED VIEW` renders the clause as written:

```questdb-sql
SHOW CREATE MATERIALIZED VIEW trades_latest;
-- ... EXPIRE ROWS KEEP LATEST PARTITION BY symbol
```

The [`materialized_views()`](/docs/query/functions/meta/) function exposes the
policy in the `expire_clause` and `expire_cleanup_every` columns (both
`NULL` when no policy is set):

```questdb-sql title="List EXPIRE ROWS policies"
SELECT view_name, expire_clause, expire_cleanup_every
FROM materialized_views();
```

| view_name     | expire_clause                   | expire_cleanup_every |
| ------------- | ------------------------------- | -------------------- |
| trades_sized  | amount < 1.5                    | 1h                   |
| trades_latest | KEEP LATEST PARTITION BY symbol | 1h                   |
| trades_top2   | KEEP 2 HIGHEST price ...        | 1h                   |

## Changing or removing a policy

Set, change, or drop a policy on an existing passthrough view — see
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
  modes (and non-indexed keep-latest) scan the view. A tighter `CLEANUP EVERY`
  keeps the physical residue — and therefore the read cost — small.
- **Cleanup defers under continuous refresh.** Reclamation only proceeds when the
  view is quiescent and fully applied, so a view being refreshed continuously
  defers reclamation to a quiet sweep. The read filter stays authoritative
  meanwhile.
- **`KEEP LATEST [ON ts]`.** The optional `ON ts` is accepted for familiarity but
  the view's designated timestamp is always used; naming a different column is
  rejected.
- **Non-monotonic `WHEN` predicates are unsupported for cleanup** — see
  [monotonicity](#monotonicity-and-cleanup-safety) above.
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

- [Materialized views](/docs/concepts/materialized-views/) — the view type
  `EXPIRE ROWS` runs on
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/) — full create
  syntax, including the `EXPIRE ROWS` clause
- [ALTER MATERIALIZED VIEW SET EXPIRE](/docs/query/sql/alter-mat-view-set-expire/)
  — set, change, or drop a policy
- [Time To Live (TTL)](/docs/concepts/ttl/) — partition-level retention by age
- [Storage policy](/docs/concepts/storage-policy/) — graduated partition
  lifecycle (Enterprise)
