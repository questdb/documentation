---
title: COMPILE VIEW
sidebar_label: COMPILE VIEW
description: Documentation for the COMPILE VIEW SQL keyword in QuestDB.
---

Manually triggers recompilation of a view to validate its definition against the
current database state.

**This command is optional.** Views are automatically compiled when queried, so
you don't need to run `COMPILE VIEW` for normal operation. Use it when you want
to validate a view without executing it, or to check if schema changes have
broken a view.

For more information on views, see the [Views](/docs/concepts/views/)
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
- Dependent views (views that reference the compiled view) are also recompiled
  recursively

### Automatic compilation

Views are **automatically compiled** in these situations:

- **On query**: When you `SELECT` from a view, it is compiled if needed
- **On schema fix**: When a dropped table is recreated or a renamed column is
  renamed back
- **Background job**: A background job periodically recompiles invalid views

Because of automatic compilation, `COMPILE VIEW` is rarely needed for normal
operation.

### When to use COMPILE VIEW

Use `COMPILE VIEW` when you want to:

1. **Validate without executing**: Check if a view is valid without running the
   actual query
2. **Pre-validate after schema changes**: Verify views work before users hit
   errors
3. **Update metadata**: Force view metadata refresh after column type changes
4. **Diagnose issues**: Check why a view is invalid by triggering compilation
   errors

## Errors

| Error | Cause |
| ----- | ----- |
| `view does not exist [view=name]` | View with specified name doesn't exist |
| `table does not exist [table=name]` | View references a table that doesn't exist |
| `Invalid column` | View references a column that doesn't exist |
| `Access denied [COMPILE VIEW on view_name]` | User lacks permission (Enterprise) |

## Permissions (Enterprise)

Compiling a view requires the `COMPILE VIEW` permission on that view:

```questdb-sql
-- Grant COMPILE VIEW permission
GRANT COMPILE VIEW ON my_view TO username;

-- Grant on multiple views
GRANT COMPILE VIEW ON view1, view2 TO username;
```

Note: `COMPILE VIEW` does **not** require `SELECT` permission on the underlying
tables. The compilation validates the view definition using system privileges,
not user privileges.

## See also

- [Views concept](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [ALTER VIEW](/docs/query/sql/alter-view/)
- [DROP VIEW](/docs/query/sql/drop-view/)
