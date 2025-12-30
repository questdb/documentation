# QuestDB Views Documentation

Welcome to the QuestDB Views documentation. This guide covers everything you need to know about using database views in QuestDB.

## What are Views?

Views are **virtual tables** defined by SQL SELECT statements. They provide:

- **Abstraction**: Hide complex queries behind simple table-like interfaces
- **Reusability**: Define queries once, use everywhere
- **Security**: Control data access without exposing underlying tables
- **Maintainability**: Single source of truth for business logic

## Quick Start

```sql
-- Create a view
CREATE VIEW hourly_summary AS (
  SELECT ts, symbol, sum(quantity) as volume
  FROM trades
  SAMPLE BY 1h
);

-- Query the view
SELECT * FROM hourly_summary WHERE symbol = 'AAPL';

-- List all views
SELECT * FROM views();
```

## Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [Views Guide](views.md) | Comprehensive guide to views |
| [Quick Reference](views-quick-reference.md) | Syntax cheat sheet |
| [SQL Reference](views-sql-reference.md) | Complete SQL syntax |

### Learning

| Document | Description |
|----------|-------------|
| [Cookbook](views-cookbook.md) | Real-world examples and patterns |
| [FAQ](views-faq.md) | Frequently asked questions |
| [Migration from CTEs](views-migration-from-ctes.md) | Convert CTEs to views |

### Deep Dives

| Document | Description |
|----------|-------------|
| [Performance Guide](views-performance.md) | Optimization strategies |
| [Security Guide](views-security.md) | Permissions and access control |
| [Views vs Materialized Views](views-vs-materialized-views.md) | Choosing the right approach |

### Operations

| Document | Description |
|----------|-------------|
| [Troubleshooting](views-troubleshooting.md) | Diagnose and fix issues |

## Key Features

### Parameterized Views

```sql
CREATE VIEW trades_filtered AS (
  DECLARE @min_price := 100
  SELECT * FROM trades WHERE price >= @min_price
);

-- Override at query time
DECLARE @min_price := 500 SELECT * FROM trades_filtered;
```

### View Hierarchies

```sql
CREATE VIEW level1 AS (SELECT * FROM raw_data WHERE valid = true);
CREATE VIEW level2 AS (SELECT ts, avg(value) FROM level1 SAMPLE BY 1h);
CREATE VIEW level3 AS (SELECT * FROM level2 WHERE avg > 100);
```

### Automatic Invalidation/Recovery

Views automatically track dependencies and update their status when:
- Tables are dropped/recreated
- Columns are dropped/renamed
- Schema changes occur

## SQL Commands at a Glance

| Command | Purpose |
|---------|---------|
| `CREATE VIEW` | Create a new view |
| `CREATE OR REPLACE VIEW` | Create or update a view |
| `ALTER VIEW` | Modify view definition |
| `DROP VIEW` | Remove a view |
| `COMPILE VIEW` | Force recompilation |
| `SHOW CREATE VIEW` | Show view DDL |
| `views()` | List all views |

## Best Practices Summary

1. **Name views descriptively** - `daily_revenue_report` not `v1`
2. **Use parameters** for flexible filtering
3. **Check query plans** with `EXPLAIN`
4. **Monitor view status** via `views()`
5. **Consider materialized views** for expensive aggregations
6. **Use views for security** boundaries

## Need Help?

- Check the [FAQ](views-faq.md) for common questions
- See [Troubleshooting](views-troubleshooting.md) for error resolution
- Review [examples](views-cookbook.md) for implementation patterns
