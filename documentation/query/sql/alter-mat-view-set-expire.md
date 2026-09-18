---
title: ALTER MATERIALIZED VIEW SET EXPIRE
sidebar_label: SET EXPIRE
description:
  ALTER MATERIALIZED VIEW SET EXPIRE ROWS / DROP EXPIRE SQL keyword reference
  documentation.
---

Sets, replaces, or removes an [`EXPIRE ROWS`](/docs/concepts/expire-rows/)
row-retention policy on a materialized view. It is meant for **passthrough
views**; see the concept page. For how expired rows are filtered and freed from
disk, see [How `EXPIRE ROWS` works](/docs/concepts/expire-rows/#how-it-works).

## Syntax

```
ALTER MATERIALIZED VIEW viewName SET EXPIRE ROWS
  { WHEN predicate
  | KEEP LATEST [ ON timestampColumn ] PARTITION BY col [, col ...]
  | KEEP [ N ] ( HIGHEST | LOWEST ) col [ PARTITION BY col [, col ...] ] }
  [ CLEANUP EVERY duration ]

ALTER MATERIALIZED VIEW viewName DROP EXPIRE
```

## Parameters

| Parameter        | Description                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `viewName`       | Name of the passthrough materialized view to modify                               |
| `WHEN predicate` | A per-row (or window) condition; a row expires when it is `TRUE`                  |
| `KEEP LATEST`    | Keep the latest row per `PARTITION BY` key, by the designated timestamp           |
| `KEEP [N] HIGHEST\|LOWEST col` | Keep the rows at the highest/lowest value of `col` per group, or the top `N` |
| `CLEANUP EVERY`  | How often the background cleanup job runs, as `<number><unit>`, where `unit` is `s`, `m`, `h`, `d`, or `w`. Defaults to `1h` |

Without `N`, the keep column must be `BYTE`, `SHORT`, `INT`, `LONG`, `FLOAT`,
`DOUBLE`, `DATE`, `TIMESTAMP`, or `DECIMAL`. `KEEP N HIGHEST/LOWEST` sorts rows
with `ORDER BY`, so it accepts any column type you can sort.

For a full description of each mode and how it behaves, see the
[Expiring rows](/docs/concepts/expire-rows/) concept page.

## When to use

- Add a retention policy to a passthrough view created without one
- Switch a view between modes (e.g. from a value predicate to `KEEP LATEST`)
- Tune the `CLEANUP EVERY` cadence
- Remove a policy with `DROP EXPIRE` so the view keeps all rows again

## How it works

`SET EXPIRE ROWS` checks the new policy against the view's columns first (it
compiles the condition and checks the key columns), so an invalid condition or an
unknown column is rejected right away instead of breaking later reads. Once set,
the policy takes effect without rebuilding the view. See
[How it works](/docs/concepts/expire-rows/#how-it-works).

You can run `SET EXPIRE` even when other materialized or live views already read
this view. Those dependents notice the policy the next time they refresh, and
then become invalid. This does not happen at the same moment as the `ALTER`: an
idle dependent may stay active, and a refresh already running may finish with the
data it started from. Rows the dependents already stored are not removed.
Dropping the policy later does not automatically make an invalid dependent valid
again. See
[Dependent materialized and live views](/docs/concepts/expire-rows/#dependent-materialized-and-live-views)
for the details and how to recover.

## Examples

These examples use `trades_mirror`, a passthrough materialized view over a
`trades` table with `symbol`, `side`, `price`, `amount`, and designated
`timestamp` columns:

```questdb-sql title="Create the passthrough view"
CREATE MATERIALIZED VIEW trades_mirror AS (SELECT * FROM trades);
```

```questdb-sql title="Rolling 7-day window, with a tighter cleanup cadence"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS WHEN timestamp < dateadd('d', -7, now()) CLEANUP EVERY 30m;
```

A `WHEN` condition is the right tool for a cutoff that moves with the clock like
this one. A fixed rule such as `amount < 1.5` is also accepted, but it picks out
the same rows more cheaply as a `WHERE` clause in the view's query. See
[`WHERE` filter or `EXPIRE ROWS`?](/docs/concepts/expire-rows/#where-filter-or-expire-rows).

```questdb-sql title="Keep the latest row per symbol"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS KEEP LATEST PARTITION BY symbol;
```

```questdb-sql title="Keep the highest-priced row per symbol"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS KEEP HIGHEST price PARTITION BY symbol;
```

```questdb-sql title="Keep the 2 highest-priced rows per symbol"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS KEEP 2 HIGHEST price PARTITION BY symbol;
```

For a rule the `KEEP` shortcuts do not cover, write a window condition directly
with `WHEN ... OVER (...)`. This example keeps only the rows within 5% of each
symbol's highest price, and expires the rest:

```questdb-sql title="Window condition: keep rows within 5% of each symbol's peak"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS WHEN price < 0.95 * max(price) OVER (PARTITION BY symbol);
```

A window condition is always `FILTER_ONLY`: reads hide the expired rows, but the
cleanup job never frees their disk (a later row can change which rows qualify).
See
[When expired rows are deleted from disk](/docs/concepts/expire-rows/#monotonicity-and-cleanup-safety).

```questdb-sql title="Remove the policy"
ALTER MATERIALIZED VIEW trades_mirror DROP EXPIRE;
```

## Behavior

| Aspect                  | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| Passthrough recommended | An aggregating view is allowed, but only with a warning in the log: a later refresh can rebuild deleted rows, so line the base table's retention up with the expiry cutoff |
| Dependent views         | SET is allowed; existing materialized and live views notice the conflict and become invalid on their next refresh, not at the same moment as the ALTER |
| Validation              | The policy is checked against the view's columns before it is applied        |
| Replication             | The policy and the row deletions it causes replicate as ordinary WAL traffic |

## Permissions (Enterprise)

Changing the policy requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_mirror TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with the specified name doesn't exist |
| `EXPIRE ROWS KEEP LATEST ON must name the designated timestamp ...` | `ON` names a column other than the designated timestamp |
| `invalid EXPIRE ROWS KEEP LATEST PARTITION BY column: ...` | A `PARTITION BY` key column does not exist |
| `EXPIRE ROWS KEEP HIGHEST/LOWEST requires a BYTE, SHORT, INT, LONG, FLOAT, DOUBLE, DATE, TIMESTAMP or DECIMAL column, but '<col>' is <type>; use KEEP <N> HIGHEST/LOWEST to rank an orderable column of any type` | The bare `KEEP HIGHEST/LOWEST` form was given an unsupported column type; use a supported numeric/date type or the top-N form |
| `EXPIRE ROWS KEEP <N> HIGHEST/LOWEST requires an orderable column, but '<col>' is <type>` | The top-N form was given a column type that cannot be ordered |
| `EXPIRE ROWS KEEP / window retention cannot be used on a view with a column named '__qdb_re_keep'` | The view exposes a column named like the reserved keep column |
| `invalid EXPIRE ROWS predicate: ...` | The predicate does not parse, bind, or type-check against the view's columns |
| `invalid EXPIRE ROWS predicate: the threshold is NULL, so no row can ever expire` | A `WHEN` threshold that is constant at definition time evaluates to `NULL`, e.g. `CAST(NULL AS TIMESTAMP)` or arithmetic that overflows |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Expiring rows (EXPIRE ROWS) concept](/docs/concepts/expire-rows/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [Materialized views concept](/docs/concepts/materialized-views/)
- [ALTER MATERIALIZED VIEW SET TTL](/docs/query/sql/alter-mat-view-set-ttl/)
