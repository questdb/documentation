---
title: ALTER MATERIALIZED VIEW SET EXPIRE
sidebar_label: SET EXPIRE
description:
  ALTER MATERIALIZED VIEW SET EXPIRE ROWS / DROP EXPIRE SQL keyword reference
  documentation.
---

Sets, replaces, or removes an [`EXPIRE ROWS`](/docs/concepts/deep-dive/expire-rows/)
row-retention policy on a materialized view (designed for **passthrough**
views — see the concept page). Expired rows are hidden from queries immediately
and reclaimed on disk in the background.

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
| `WHEN predicate` | Per-row (or window) predicate; a row expires when it evaluates `TRUE`             |
| `KEEP LATEST`    | Keep the latest row per `PARTITION BY` key, by the designated timestamp           |
| `KEEP [N] HIGHEST\|LOWEST col` | Keep the rows at the max/min of `col` per group, or the top `N`     |
| `CLEANUP EVERY`  | Background reclamation cadence (e.g. `30m`, `1h`). Defaults to `1h` if omitted     |

For the full description of each mode and its semantics, see the
[Expiring rows](/docs/concepts/deep-dive/expire-rows/) concept page.

## When to use

- Add a retention policy to a passthrough view created without one
- Switch a view between modes (e.g. from a value predicate to `KEEP LATEST`)
- Tune the `CLEANUP EVERY` cadence
- Remove a policy with `DROP EXPIRE` so the view keeps all rows again

## How it works

`SET EXPIRE ROWS` validates the new policy against the view's columns first
(compiling the predicate / checking the key columns), so an invalid predicate or
an unknown column is rejected immediately rather than breaking later reads. Once
set, queries against the view are filtered to the kept rows immediately; physical
reclamation follows in the background. See
[How it works](/docs/concepts/deep-dive/expire-rows/#how-it-works).

## Examples

```questdb-sql title="Per-row predicate, with a tighter cleanup cadence"
ALTER MATERIALIZED VIEW trades_mirror
  SET EXPIRE ROWS WHEN amount < 1.5 CLEANUP EVERY 30m;
```

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

```questdb-sql title="Remove the policy"
ALTER MATERIALIZED VIEW trades_mirror DROP EXPIRE;
```

## Behavior

| Aspect                  | Description                                                                  |
| ----------------------- | ---------------------------------------------------------------------------- |
| Passthrough recommended | An aggregating view is accepted with a logged advisory: a later refresh can regenerate reclaimed rows, so align base-table retention with the expiry horizon |
| No dependent views      | Rejected when other materialized views derive from this view (they would copy expired rows on refresh) |
| Validation              | The policy is checked against the view's columns before it is applied        |
| Immediate effect        | Reads are filtered to the kept rows as soon as the policy is set             |
| Replication             | The policy and the reclamation it drives replicate as normal WAL traffic     |

## Permissions (Enterprise)

Changing the policy requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_mirror TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with the specified name doesn't exist |
| `cannot set an EXPIRE ROWS policy on '...': it is the base of N materialized view(s), which would copy expired rows on refresh` | Other materialized views derive from this view |
| `EXPIRE ROWS KEEP LATEST ON must name the designated timestamp ...` | `ON` names a column other than the designated timestamp |
| `invalid EXPIRE ROWS KEEP LATEST column: ...` | A `PARTITION BY` key column does not exist |
| `EXPIRE ROWS KEEP / window retention cannot be used on a view with a column named '__qdb_re_keep'` | The view exposes a column named like the reserved keep column |
| `invalid EXPIRE ROWS predicate: ...` | The predicate does not parse, bind, or type-check against the view's columns |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Expiring rows (EXPIRE ROWS) concept](/docs/concepts/deep-dive/expire-rows/)
- [CREATE MATERIALIZED VIEW](/docs/query/sql/create-mat-view/)
- [Materialized views concept](/docs/concepts/materialized-views/)
- [ALTER MATERIALIZED VIEW SET TTL](/docs/query/sql/alter-mat-view-set-ttl/)
