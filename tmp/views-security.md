# Views Security and Permissions Guide

This guide covers security considerations and permission management for database views in QuestDB.

## Permission Model Overview

Views in QuestDB provide a security boundary between users and underlying data:

```
┌─────────────────────────────────────────────────────┐
│                      User Query                      │
│              SELECT * FROM my_view                   │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                    Permission Check                  │
│              Does user have SELECT on my_view?       │
└─────────────────────────────────────────────────────┘
                         │
                         ▼ (if granted)
┌─────────────────────────────────────────────────────┐
│                   View Execution                     │
│    Underlying tables accessed with view's context    │
│         (no additional permission check)             │
└─────────────────────────────────────────────────────┘
```

## Key Security Principle

**Users need permission on the view only, not on underlying tables.**

This allows administrators to:
- Expose specific data subsets to users
- Hide sensitive columns
- Enforce row-level security patterns
- Provide read-only access to aggregated data

## Permission Types

### View-Specific Permissions

| Permission | Allows |
|------------|--------|
| `SELECT` | Query the view |
| `CREATE VIEW` | Create new views |
| `DROP VIEW` | Drop views |
| `ALTER VIEW` | Modify view definitions |

### Granting View Access

```sql
-- Grant SELECT on specific view
GRANT SELECT ON view_name TO user_name;

-- Grant SELECT on all views in schema
GRANT SELECT ON ALL VIEWS TO user_name;

-- Grant view creation ability
GRANT CREATE VIEW TO user_name;
```

### Revoking View Access

```sql
REVOKE SELECT ON view_name FROM user_name;
```

## Security Use Cases

### 1. Column-Level Security

Hide sensitive columns from certain users:

```sql
-- Base table with sensitive data
CREATE TABLE employees (
  id LONG,
  name VARCHAR,
  email VARCHAR,
  salary DOUBLE,        -- Sensitive
  ssn VARCHAR,          -- Sensitive
  department VARCHAR,
  hire_date TIMESTAMP
);

-- View exposing only non-sensitive columns
CREATE VIEW employees_public AS (
  SELECT id, name, department, hire_date
  FROM employees
);

-- Grant access to public view only
GRANT SELECT ON employees_public TO analyst_role;
-- No grant on employees table
```

### 2. Row-Level Security

Limit data visibility based on criteria:

```sql
-- All trades table
CREATE TABLE trades (
  ts TIMESTAMP,
  trader_id LONG,
  symbol VARCHAR,
  quantity DOUBLE,
  price DOUBLE
);

-- View for specific trading desk
CREATE VIEW desk_a_trades AS (
  SELECT * FROM trades WHERE trader_id IN (101, 102, 103)
);

CREATE VIEW desk_b_trades AS (
  SELECT * FROM trades WHERE trader_id IN (201, 202, 203)
);

-- Grant appropriate view to each desk
GRANT SELECT ON desk_a_trades TO desk_a_users;
GRANT SELECT ON desk_b_trades TO desk_b_users;
```

### 3. Parameterized Row-Level Security

Dynamic filtering based on user context:

```sql
-- View with parameter for user-specific filtering
CREATE VIEW my_orders AS (
  DECLARE @user_id := 0
  SELECT * FROM orders WHERE user_id = @user_id
);

-- Users query with their ID
-- DECLARE @user_id := 12345 SELECT * FROM my_orders
```

### 4. Aggregation-Only Access

Provide summary access without raw data exposure:

```sql
-- Raw sensitive data
CREATE TABLE transactions (
  ts TIMESTAMP,
  customer_id LONG,
  amount DOUBLE,
  card_number VARCHAR  -- Very sensitive
);

-- Summary view (no individual transaction details)
CREATE VIEW daily_summary AS (
  SELECT
    date_trunc('day', ts) as date,
    count() as transaction_count,
    sum(amount) as total_amount,
    avg(amount) as avg_amount
  FROM transactions
  SAMPLE BY 1d
);

GRANT SELECT ON daily_summary TO reporting_users;
```

### 5. Time-Bounded Access

Limit access to recent data only:

```sql
CREATE VIEW recent_logs AS (
  SELECT * FROM audit_logs
  WHERE ts > dateadd('d', -30, now())
);

-- Users can only see last 30 days
GRANT SELECT ON recent_logs TO auditors;
```

## Query Cache and Permissions

QuestDB caches query execution plans. Permission checks are performed:

1. **At query compilation time** - Initial permission verification
2. **At query execution time** - Re-verification from cache

This ensures that even cached queries respect current permissions. If permissions change, subsequent executions will fail appropriately.

## View Creation Permissions

Creating a view requires:
- `CREATE VIEW` permission
- **No requirement** for SELECT on underlying tables

```sql
-- User with CREATE VIEW can create views on tables they can't query directly
-- The view will only work if the view definition is valid
CREATE VIEW my_view AS (SELECT * FROM restricted_table);
-- View is created, but user still can't query restricted_table directly
```

## View Definition Visibility

### SHOW CREATE VIEW

Users with SELECT permission on a view can see its definition:

```sql
SHOW CREATE VIEW my_view
-- Returns: CREATE VIEW 'my_view' AS (SELECT ...)
```

**Security consideration:** View definitions may reveal table structure and business logic. If this is sensitive:
- Limit who has SELECT on views that expose sensitive logic
- Consider using materialized views to hide the source query

### views() Function

The `views()` function shows all views the user can access:

```sql
SELECT view_name, view_sql FROM views();
```

## Best Practices

### 1. Principle of Least Privilege

```sql
-- DON'T: Grant broad access
GRANT SELECT ON ALL TABLES TO users;

-- DO: Create specific views and grant access to those
CREATE VIEW user_accessible_data AS (...);
GRANT SELECT ON user_accessible_data TO users;
```

### 2. Use Views as Security Boundaries

```sql
-- Create views for different access levels
CREATE VIEW data_level_1 AS (SELECT col1, col2 FROM sensitive_table);
CREATE VIEW data_level_2 AS (SELECT col1, col2, col3 FROM sensitive_table);
CREATE VIEW data_level_3 AS (SELECT * FROM sensitive_table);

-- Grant appropriate level to each role
GRANT SELECT ON data_level_1 TO basic_users;
GRANT SELECT ON data_level_2 TO power_users;
GRANT SELECT ON data_level_3 TO admins;
```

### 3. Audit View Access

Monitor who accesses sensitive views:

```sql
-- Create audit-enabled view
CREATE VIEW audited_sensitive_data AS (
  SELECT * FROM sensitive_table
  -- Access is logged by QuestDB's audit system
);
```

### 4. Document Security Intent

Use view names that indicate security level:

```sql
CREATE VIEW public_metrics AS (...);           -- Anyone can access
CREATE VIEW internal_reports AS (...);         -- Internal users only
CREATE VIEW confidential_financials AS (...);  -- Finance team only
```

### 5. Regular Permission Review

Periodically review:
- Which users have access to which views
- Whether views still expose appropriate data
- If any views need to be deprecated or restricted

## Security Limitations

### What Views DON'T Provide:

1. **Encryption**: Data in views is not encrypted
2. **Audit trail**: Basic views don't log access (use QuestDB audit features)
3. **Dynamic row-level security**: Views are static; use parameterized views for dynamic filtering
4. **Cross-database security**: Views only work within a single QuestDB instance

### Defense in Depth

Views are one layer of security. Combine with:
- Network security (firewall, VPN)
- Authentication (strong passwords, SSO)
- Encryption in transit (TLS)
- Audit logging
- Regular security reviews
