# Views FAQ

Frequently asked questions about database views in QuestDB.

## General Questions

### What is a view?

A view is a virtual table defined by a SQL SELECT statement. It doesn't store data—instead, the defining query runs whenever you query the view.

### How are views different from tables?

| Aspect | Table | View |
|--------|-------|------|
| Data storage | Yes | No |
| INSERT/UPDATE | Yes | No |
| Indexes | Yes | No |
| Query on access | No | Yes |
| Disk space | Yes | Zero |

### How are views different from materialized views?

Views execute their query every time. Materialized views store pre-computed results. See [Views vs Materialized Views](views-vs-materialized-views.md) for details.

### Can views reference other views?

Yes! Views can reference tables, materialized views, and other views:

```sql
CREATE VIEW level1 AS (SELECT * FROM base_table WHERE x > 0)
CREATE VIEW level2 AS (SELECT * FROM level1 WHERE y > 0)
CREATE VIEW level3 AS (SELECT * FROM level2 WHERE z > 0)
```

### Is there a limit on view nesting depth?

No hard limit, but deep nesting may impact query planning time and readability. Recommended maximum: 4-5 levels.

---

## Creation and Management

### How do I create a view?

```sql
CREATE VIEW my_view AS (SELECT * FROM my_table WHERE condition)
```

### How do I update a view definition?

Use `ALTER VIEW` or `CREATE OR REPLACE VIEW`:

```sql
ALTER VIEW my_view AS (SELECT * FROM my_table WHERE new_condition)
-- or
CREATE OR REPLACE VIEW my_view AS (SELECT * FROM my_table WHERE new_condition)
```

### How do I delete a view?

```sql
DROP VIEW my_view
-- or safely:
DROP VIEW IF EXISTS my_view
```

### How do I see all views?

```sql
SELECT * FROM views()
```

### How do I see a view's definition?

```sql
SHOW CREATE VIEW my_view
```

### Can I rename a view?

Not directly. Drop and recreate with the new name:

```sql
-- Save definition
SHOW CREATE VIEW old_name

-- Drop old view
DROP VIEW old_name

-- Create with new name
CREATE VIEW new_name AS (...)
```

---

## Querying Views

### How do I query a view?

Just like a table:

```sql
SELECT * FROM my_view
SELECT col1, col2 FROM my_view WHERE condition
```

### Can I use JOINs with views?

Yes:

```sql
SELECT v.*, t.extra
FROM my_view v
JOIN other_table t ON v.id = t.id
```

### Can I use SAMPLE BY on views?

Yes, if the view returns data with a timestamp:

```sql
SELECT ts, avg(value) FROM my_view SAMPLE BY 1h
```

### Why is my LIMIT being ignored?

If the view contains an internal LIMIT, the outer LIMIT may not work as expected. Restructure your query:

```sql
-- Instead of:
SELECT * FROM (SELECT * FROM t LIMIT 100) LIMIT 10  -- May not work

-- Use:
SELECT * FROM t LIMIT 10  -- Works
```

---

## Parameters (DECLARE)

### What are parameterized views?

Views that use `DECLARE` to define parameters with default values that can be overridden at query time:

```sql
CREATE VIEW filtered AS (
  DECLARE @threshold := 100
  SELECT * FROM data WHERE value > @threshold
)
```

### How do I override a parameter?

Use DECLARE before your query:

```sql
DECLARE @threshold := 500 SELECT * FROM filtered
```

### What is CONST in DECLARE?

CONST prevents parameter override:

```sql
CREATE VIEW secure AS (
  DECLARE CONST @min := 0
  SELECT * FROM data WHERE id >= @min
)

-- This fails:
DECLARE @min := -1 SELECT * FROM secure
-- Error: cannot override CONST variable: @min
```

### Can I have multiple parameters?

Yes:

```sql
CREATE VIEW range_filter AS (
  DECLARE @lo := 0, @hi := 100
  SELECT * FROM data WHERE value BETWEEN @lo AND @hi
)

DECLARE @lo := 50, @hi := 75 SELECT * FROM range_filter
```

---

## View Invalidation

### What makes a view invalid?

- Dropping a referenced table
- Renaming a referenced table
- Dropping a referenced column
- Renaming a referenced column

### How do I check if a view is valid?

```sql
SELECT view_name, view_status, invalidation_reason
FROM views()
WHERE view_name = 'my_view'
```

### How do I fix an invalid view?

1. Fix the underlying issue (recreate table, add column back, etc.)
2. The view auto-recovers, or run `COMPILE VIEW my_view`

### Are invalid views automatically fixed?

Yes! When the underlying issue is resolved (e.g., table recreated), the view automatically becomes valid again.

---

## Performance

### Do views cache results?

No. The query runs every time you access the view.

### Are views slow?

Views have the same performance as running the query directly. For expensive queries accessed frequently, consider materialized views.

### Do filters push down through views?

Yes, QuestDB optimizes queries to push filters to base tables when possible:

```sql
CREATE VIEW v AS (SELECT * FROM big_table)
SELECT * FROM v WHERE id = 123  -- Filter pushes to big_table scan
```

### How can I see the query plan for a view?

```sql
EXPLAIN SELECT * FROM my_view WHERE condition
```

---

## Permissions and Security

### What permissions are needed to query a view?

Only SELECT permission on the view itself. You don't need access to underlying tables.

### Can I use views for row-level security?

Yes! Create views that filter data and grant access to the view:

```sql
CREATE VIEW team_a_data AS (SELECT * FROM data WHERE team = 'A')
GRANT SELECT ON team_a_data TO team_a_users
```

### Who can see view definitions?

Users with SELECT permission on a view can see its definition using `SHOW CREATE VIEW`.

---

## Compatibility

### Can I INSERT into a view?

No. Views are read-only virtual tables.

### Can I create indexes on views?

No. Create indexes on the underlying tables instead.

### Can I use views in INSERT...SELECT?

Yes:

```sql
INSERT INTO target_table SELECT * FROM my_view
```

### Can views use window functions?

Yes:

```sql
CREATE VIEW with_rank AS (
  SELECT *, row_number() OVER (ORDER BY value DESC) as rank
  FROM data
)
```

### Can views use CTEs?

The view definition itself is like a CTE. You can't nest WITH inside the view, but you can:

```sql
-- Use CTE when querying the view
WITH ranked AS (SELECT * FROM my_view ORDER BY x)
SELECT * FROM ranked WHERE rank <= 10
```

---

## Unicode and Naming

### Can view names contain Unicode characters?

Yes:

```sql
CREATE VIEW 日本語ビュー AS (SELECT * FROM data)
CREATE VIEW Részvény_árak AS (SELECT * FROM prices)
```

### Are view names case-sensitive?

No. `MyView`, `myview`, and `MYVIEW` refer to the same view.

### Can I use spaces in view names?

Yes, with quoting:

```sql
CREATE VIEW "My View" AS (SELECT * FROM data)
SELECT * FROM "My View"
```

---

## Troubleshooting

### "view already exists"

Use `IF NOT EXISTS` or `CREATE OR REPLACE`:

```sql
CREATE VIEW IF NOT EXISTS my_view AS (...)
CREATE OR REPLACE VIEW my_view AS (...)
```

### "table does not exist"

The view references a table that doesn't exist. Create the table first or fix the view definition.

### "Invalid column"

The view references a column that doesn't exist. Check column names with `SHOW COLUMNS FROM table_name`.

### "cycle detected"

You tried to create a circular dependency. Views cannot reference themselves directly or indirectly.

### View is valid but query fails

Try forcing recompilation:

```sql
COMPILE VIEW my_view
```

---

## Best Practices

### Should I always use views instead of CTEs?

No. Use views for reusable, shared queries. Use CTEs for one-off, ad-hoc queries.

### How should I name views?

Use descriptive names indicating purpose:
- `trades_hourly_summary`
- `active_users`
- `daily_revenue_report`

### Should I create many small views or few large views?

Prefer smaller, focused views that can be composed. This improves reusability and maintainability.

### How do I document views?

- Use descriptive names
- Use parameter names as documentation (`@min_price`, `@start_date`)
- Maintain external documentation
- Consider comments in a documentation system
