---
title: COMPILE VIEW
sidebar_label: COMPILE VIEW
description: Documentation for the COMPILE VIEW SQL keyword in QuestDB.
---

Forces recompilation of a view to validate its definition against current
database state. This is useful for checking if a view is valid after schema
changes or for updating view metadata.

For more information on views, see the [Views](/docs/concept/views/)
documentation.

## Syntax

```questdb-sql
COMPILE VIEW view_name
```

## Parameters

| Parameter | Description |
| --------- | ----------- |
| `view_name` | Name of the view to compile |

## Examples

### Validate a view

```questdb-sql title="Compile view"
COMPILE VIEW my_view
```

### Check and fix invalid view

```questdb-sql title="Diagnose and compile view"
-- Check view status
SELECT view_name, view_status, invalidation_reason
FROM views()
WHERE view_name = 'my_view';

-- If invalid, fix the underlying issue, then compile
COMPILE VIEW my_view;

-- Verify it's now valid
SELECT view_status FROM views() WHERE view_name = 'my_view';
```

### Bulk view repair

When multiple views are broken due to schema changes:

```questdb-sql title="Compile multiple views"
-- Find all invalid views
SELECT view_name, invalidation_reason
FROM views()
WHERE view_status = 'invalid';

-- Compile each view after fixing underlying issues
COMPILE VIEW view1;
COMPILE VIEW view2;
COMPILE VIEW view3;
```

## Behavior

- If the view compiles successfully, its status becomes `valid`
- If the view fails to compile, its status becomes `invalid` and the reason is
  stored in `invalidation_reason`
- Compiling an already valid view re-validates it against current schema
- Views are often automatically revalidated when underlying issues are fixed,
  but `COMPILE VIEW` forces immediate revalidation

### When to use COMPILE VIEW

Use `COMPILE VIEW` when:

1. A view shows as valid but queries fail
2. You've fixed an underlying schema issue and want to verify the view
3. You want to update view metadata after column type changes
4. You need to force revalidation after complex schema migrations

### Automatic vs manual compilation

Views are automatically revalidated in certain cases:

- When a dropped table is recreated
- When a renamed column is renamed back

However, `COMPILE VIEW` is needed when:

- Column types have changed
- You want immediate validation without waiting for automatic recovery
- The automatic recovery didn't trigger as expected

## Errors

| Error | Cause |
| ----- | ----- |
| `view does not exist` | View with specified name doesn't exist |
| Compilation errors | View definition is invalid (missing table, column, etc.) |

## See also

- [Views concept](/docs/concept/views/)
- [CREATE VIEW](/docs/reference/sql/create-view/)
- [ALTER VIEW](/docs/reference/sql/alter-view/)
- [DROP VIEW](/docs/reference/sql/drop-view/)
