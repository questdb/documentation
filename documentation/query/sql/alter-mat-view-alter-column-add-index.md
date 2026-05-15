---
title: ALTER MATERIALIZED VIEW ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Materialized Views reference documentation.
---

Adds an [index](/docs/concepts/deep-dive/indexes/) to a
[`SYMBOL`](/docs/concepts/symbol/) column in a materialized view, improving
query performance for filtered lookups.

## Syntax

Bitmap index (default):

```questdb-sql
ALTER MATERIALIZED VIEW viewName ALTER COLUMN columnName ADD INDEX [CAPACITY n]
```

[Posting index](/docs/concepts/deep-dive/posting-index/), with optional
encoding variant:

```questdb-sql
ALTER MATERIALIZED VIEW viewName ALTER COLUMN columnName
  ADD INDEX TYPE POSTING [DELTA | EF]
```

An explicit `INCLUDE` clause is not accepted on materialized views — the
parser rejects it. `ADD INDEX TYPE POSTING` on a view's symbol column
therefore creates a posting index for fast symbol filtering, but the
view itself does not get a covering layer; selecting columns beyond the
indexed symbol still reads from the view's column files. See
[INCLUDE restriction](#include-restriction) and
[Covering index during refresh](#covering-index-during-refresh) for
details.

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view |
| `columnName` | Name of the `SYMBOL` column to index |
| `CAPACITY` | Optional index capacity for bitmap indexes (advanced; use default unless you understand implications) |
| `TYPE POSTING` | Use a [posting index](/docs/concepts/deep-dive/posting-index/) instead of the default bitmap index |
| `DELTA` / `EF` | Force a row-ID encoding variant — see [encoding options](/docs/concepts/deep-dive/posting-index/#encoding-options) |

## When to use

Add an index when:

- Queries frequently filter by a `SYMBOL` column (e.g., `WHERE symbol = 'BTC-USD'`)
- The column has high cardinality (many distinct values)
- Query performance on the materialized view needs improvement

## Examples

### Adding a bitmap index (default)

```questdb-sql title="Add bitmap index to symbol column"
ALTER MATERIALIZED VIEW trades_hourly
  ALTER COLUMN symbol ADD INDEX;
```

### Adding a posting index

```questdb-sql title="Add posting index to symbol column"
ALTER MATERIALIZED VIEW trades_hourly
  ALTER COLUMN symbol ADD INDEX TYPE POSTING;
```

### INCLUDE restriction

:::note

An explicit `INCLUDE` clause is not currently accepted on materialized
views — the parser rejects it. Without `INCLUDE`, an `INDEX TYPE POSTING`
on a view's symbol column gives you fast filtering on that symbol but
**no covering layer**: any query that selects columns beyond the indexed
symbol still reads them from the view's column files.

If a covering layout is what you want, build the covering posting index
on the **base table** instead and let the view inherit the acceleration
during refresh (subject to the gate described below).

:::

### Covering index during refresh

:::warning

If the *base table* feeding this view has a covering posting index
(declared with an `INCLUDE` clause), the SQL planner skips the covering
path during view refresh by default because the async group-by and
filter paths through the covering index are currently slower than the
regular plan in some workloads — opting the refresh out preserves
predictable refresh latency until that gap is closed. To re-enable
covering for refresh queries, set
[`cairo.mat.view.covering.index.enabled`](/docs/configuration/cairo-engine/#cairomatviewcoveringindexenabled)
to `true`. Ad-hoc queries you issue against base tables that have
covering indexes are not affected by this flag.

:::

## Behavior

| Aspect | Description |
| ------ | ----------- |
| Operation type | Atomic, non-blocking, non-waiting |
| Immediate effect | SQL optimizer starts using the index once created |
| Column requirement | Column must be of type `SYMBOL` |

:::note
Index capacity and [symbol capacity](/docs/concepts/symbol/) are different
settings. Only change index capacity if you understand the
[implications](/docs/concepts/deep-dive/indexes/#index-capacity).
:::

## Permissions (Enterprise)

Adding an index requires the `ALTER MATERIALIZED VIEW` permission:

```questdb-sql title="Grant alter permission"
GRANT ALTER MATERIALIZED VIEW ON trades_hourly TO user1;
```

## Errors

| Error | Cause |
| ----- | ----- |
| `materialized view does not exist` | View with specified name doesn't exist |
| `column does not exist` | Column not found in the view |
| `column is not a symbol` | Index can only be added to `SYMBOL` columns |
| `index already exists` | Column is already indexed |
| `permission denied` | Missing `ALTER MATERIALIZED VIEW` permission (Enterprise) |

## See also

- [Materialized views concept](/docs/concepts/materialized-views/)
- [Index concept](/docs/concepts/deep-dive/indexes/)
- [Symbol type](/docs/concepts/symbol/)
- [ALTER MATERIALIZED VIEW DROP INDEX](/docs/query/sql/alter-mat-view-alter-column-drop-index/)
- [ALTER TABLE ADD INDEX](/docs/query/sql/alter-table-alter-column-add-index/)
