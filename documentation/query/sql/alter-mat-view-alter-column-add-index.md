---
title: ALTER MATERIALIZED VIEW ADD INDEX
sidebar_label: ADD INDEX
description: ADD INDEX SQL keyword. Materialized Views reference documentation.
---

Adds an [index](/docs/concepts/deep-dive/indexes/) to a
[`SYMBOL`](/docs/concepts/symbol/) column in a materialized view, improving
query performance for filtered lookups.

## Syntax

```
ALTER MATERIALIZED VIEW viewName ALTER COLUMN columnName ADD INDEX [ CAPACITY n ]
ALTER MATERIALIZED VIEW viewName ALTER COLUMN columnName ADD INDEX TYPE POSTING
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `viewName` | Name of the materialized view |
| `columnName` | Name of the `SYMBOL` column to index |
| `CAPACITY` | Optional index capacity for bitmap indexes (advanced; use default unless you understand implications) |
| `TYPE POSTING` | Use a [posting index](/docs/concepts/deep-dive/posting-index/) instead of the default bitmap index |

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

:::note

An explicit `INCLUDE` clause for covering indexes is not currently
accepted on materialized views — the parser rejects it. The view's
designated timestamp is still auto-added, so `INDEX TYPE POSTING` on a
view's symbol column produces a covering index over the timestamp,
which is enough to accelerate `WHERE symbol = … LATEST ON ts` and
similar timestamp-only covering queries.

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
