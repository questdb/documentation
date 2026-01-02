---
title: Role-based Access Control (RBAC)
description:
  Granular access control from database level down to individual columns and
  rows. Learn how to secure your QuestDB instance with users, groups, and
  fine-grained permissions.
---

import Screenshot from "@theme/Screenshot"
import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Role-based Access Control (RBAC) provides fine-grained permissions for your QuestDB instance.
</EnterpriseNote>

QuestDB Enterprise provides fine-grained access control that can restrict access
at **database**, **table**, **column**, and even **row** level (using views).

## Quick start

Here's a complete example to create a read-only analyst user in under a minute:

```questdb-sql
-- 1. Create the user
CREATE USER analyst WITH PASSWORD 'secure_password_here';

-- 2. Grant endpoint access (required to connect)
GRANT PGWIRE, HTTP TO analyst;

-- 3. Grant read access to specific tables
GRANT SELECT ON trades, prices TO analyst;

-- Done! The analyst can now connect and query trades and prices tables
```

To verify:

```questdb-sql
SHOW PERMISSIONS analyst;
```

## Access control depth

QuestDB's access control operates across two dimensions:

### Data access granularity

Control *what data* users can access:

| Level | What you can control | Example |
|-------|---------------------|---------|
| **Database** | All tables, global operations | `GRANT SELECT ON ALL TABLES TO user` |
| **Table** | Specific tables | `GRANT SELECT ON trades TO user` |
| **Column** | Specific columns within a table | `GRANT SELECT ON trades(ts, price) TO user` |
| **Row** | Specific rows via views | Create a view with WHERE clause, grant access to view |

### Connection access granularity

Control *how* users can connect:

| Permission | Protocol | Use case |
|------------|----------|----------|
| `HTTP` | REST API, Web Console, ILP/HTTP | Interactive users, web applications |
| `PGWIRE` | PostgreSQL Wire Protocol | SQL clients, BI tools, programmatic access |
| `ILP` | InfluxDB Line Protocol (TCP) | High-throughput data ingestion |

```questdb-sql
-- User can connect via PostgreSQL protocol only (not web console)
GRANT PGWIRE TO analyst;

-- Service can only ingest via ILP, cannot query
GRANT ILP TO ingest_service;

-- Full interactive access
GRANT HTTP, PGWIRE TO developer;
```

These dimensions are independent: a user might have `SELECT` on all tables but
only be allowed to connect via `PGWIRE`, or have `INSERT` permission but only
via `ILP`.

### Column-level access

Restrict users to see only certain columns:

```questdb-sql
-- User can only see timestamp and price, not quantity or trader_id
GRANT SELECT ON trades(ts, price) TO analyst;
```

### Row-level access with views

For row-level security, create a [view](/docs/concepts/views/) that filters rows,
then grant access to the view instead of the underlying table:

```questdb-sql
-- Create a view that only shows AAPL trades
CREATE VIEW aapl_trades AS (
  SELECT * FROM trades WHERE symbol = 'AAPL'
);

-- Grant access to the view, not the base table
GRANT SELECT ON aapl_trades TO aapl_analyst;
-- No GRANT on trades table = user cannot see other symbols
```

The user `aapl_analyst` can only see AAPL trades. They have no access to the
underlying `trades` table.

## Common scenarios

### Read-only analyst

A user who can query data but cannot modify anything:

```questdb-sql
CREATE USER analyst WITH PASSWORD 'pwd';
GRANT HTTP, PGWIRE TO analyst;
GRANT SELECT ON ALL TABLES TO analyst;
```

### Application service account

A service account for an application that ingests data into specific tables:

```questdb-sql
CREATE SERVICE ACCOUNT ingest_app WITH PASSWORD 'pwd';
GRANT ILP TO ingest_app;                    -- InfluxDB Line Protocol access
GRANT INSERT ON sensor_data TO ingest_app;  -- Can only insert into sensor_data
```

### Team-based access with groups

Multiple users sharing the same permissions:

```questdb-sql
-- Create a group
CREATE GROUP trading_team;

-- Grant permissions to the group
GRANT HTTP, PGWIRE TO trading_team;
GRANT SELECT ON trades, positions TO trading_team;
GRANT INSERT ON trades TO trading_team;

-- Add users to the group - they inherit all permissions
CREATE USER alice WITH PASSWORD 'pwd1';
CREATE USER bob WITH PASSWORD 'pwd2';
ADD USER alice TO trading_team;
ADD USER bob TO trading_team;
```

### Column-level restrictions (hide sensitive data)

Allow access to a table but hide sensitive columns:

```questdb-sql
CREATE USER auditor WITH PASSWORD 'pwd';
GRANT HTTP, PGWIRE TO auditor;

-- Grant access to non-sensitive columns only
GRANT SELECT ON employees(id, name, department, hire_date) TO auditor;
-- Columns salary and ssn are not granted = invisible to auditor
```

### Row-level security (multi-tenant)

Different users see different subsets of data:

```questdb-sql
-- Base table has data for all regions
CREATE TABLE sales (ts TIMESTAMP, region SYMBOL, amount DOUBLE) TIMESTAMP(ts);

-- Create region-specific views
CREATE VIEW sales_emea AS (SELECT * FROM sales WHERE region = 'EMEA');
CREATE VIEW sales_apac AS (SELECT * FROM sales WHERE region = 'APAC');

-- Grant users access to their region only
CREATE USER emea_manager WITH PASSWORD 'pwd';
GRANT HTTP, PGWIRE TO emea_manager;
GRANT SELECT ON sales_emea TO emea_manager;

CREATE USER apac_manager WITH PASSWORD 'pwd';
GRANT HTTP, PGWIRE TO apac_manager;
GRANT SELECT ON sales_apac TO apac_manager;
```

### Database administrator

A user with full control (but not the built-in admin):

```questdb-sql
CREATE USER dba WITH PASSWORD 'pwd';
GRANT DATABASE ADMIN TO dba;
```

:::warning

`DATABASE ADMIN` grants all current and future permissions. Use sparingly.

:::

## Core concepts

<Screenshot
  alt="Diagram showing users, service accounts and groups in QuestDB"
  title="Users, service accounts and groups"
  src="images/docs/acl/users_service_accounts_groups.webp"
  width={745}
/>

### Users and service accounts

QuestDB has two types of principals:

- **Users**: For human individuals. Can belong to multiple groups and inherit
  permissions from them. Cannot be assumed by others.
- **Service accounts**: For applications. Cannot belong to groups - all
  permissions must be granted directly. Can be assumed by authorized users for
  testing.

```questdb-sql
CREATE USER human_user WITH PASSWORD 'pwd';
CREATE SERVICE ACCOUNT app_account WITH PASSWORD 'pwd';
```

Names must be unique across all users, service accounts, and groups.

#### Why service accounts?

Service accounts provide **clean, testable application access**:

| Aspect | User | Service Account |
|--------|------|-----------------|
| Permission source | Direct + inherited from groups | Direct only |
| Can belong to groups | Yes | No |
| Can be assumed (SU) | No | Yes |
| Typical use | Human individuals | Applications, services |

Because service accounts have no inherited permissions, their access is fully
explicit and predictable. Combined with the ability to assume them, this makes
it easy to verify exactly what an application can and cannot do:

```questdb-sql
-- Create service account with specific permissions
CREATE SERVICE ACCOUNT trading_app WITH PASSWORD 'pwd';
GRANT ILP TO trading_app;
GRANT INSERT ON trades TO trading_app;
GRANT SELECT ON positions TO trading_app;

-- Developer can assume the service account to test its access
GRANT ASSUME SERVICE ACCOUNT trading_app TO developer;

-- Developer switches to service account context
ASSUME SERVICE ACCOUNT trading_app;
-- Now operating with trading_app's exact permissions
-- Test what works and what doesn't...
EXIT SERVICE ACCOUNT;
```

This makes service accounts ideal for applications where you need predictable,
auditable, and testable access control.

### Groups

Groups simplify permission management when multiple users need the same access:

```questdb-sql
CREATE GROUP analysts;
GRANT SELECT ON ALL TABLES TO analysts;

-- All users added to this group can read all tables
ADD USER alice TO analysts;
ADD USER bob TO analysts;
```

Users inherit permissions from their groups. Inherited permissions cannot be
revoked directly from the user - revoke from the group instead. When a group is
dropped, all members lose the permissions they inherited from that group.

### Authentication methods {#authentication}

<Screenshot
  alt="Diagram shows authentication and authorization flow in QuestDB"
  title="Authentication and authorization flow"
  src="images/docs/acl/auth_flow.webp"
  width={745}
/>

QuestDB supports three authentication methods:

| Method | Use case | Endpoints |
|--------|----------|-----------|
| **Password** | Interactive users | REST API, PostgreSQL Wire |
| **JWK Token** | ILP ingestion | InfluxDB Line Protocol |
| **REST API Token** | Programmatic REST access | REST API |

Users can have multiple authentication methods enabled simultaneously:

```questdb-sql
-- Add JWK token for ILP access
ALTER USER sensor_writer CREATE TOKEN TYPE JWK;

-- Add REST API token (with 30-day expiry)
ALTER USER api_user CREATE TOKEN TYPE REST WITH TTL '30d';
```

:::warning

QuestDB does not store private keys or tokens after creation. Save them
immediately - they cannot be recovered.

:::

:::tip

Authentication should happen via a [secure TLS connection](/docs/security/tls/)
to protect credentials in transit.

:::

### Endpoint permissions

Before a user can connect, they need endpoint permissions:

| Permission | Allows access to |
|------------|------------------|
| `HTTP` | REST API, Web Console, ILP over HTTP |
| `PGWIRE` | PostgreSQL Wire Protocol (port 8812) |
| `ILP` | InfluxDB Line Protocol TCP (port 9009) |

```questdb-sql
-- Typical setup for an interactive user
GRANT HTTP, PGWIRE TO analyst;

-- Typical setup for an ingestion service
GRANT ILP TO ingest_service;
```

### Built-in admin

Every QuestDB instance starts with a built-in admin account:

- Default username: `admin`
- Default password: `quest`

**Change these immediately in production** via `server.conf`:

```ini
acl.admin.user=your_admin_name
acl.admin.password=your_secure_password
```

The built-in admin has irrevocable root access. After creating other admin
users, disable it:

```ini
acl.admin.user.enabled=false
```

## Permission levels

Permissions have different granularities determining where they can be applied:

| Granularity | Can be granted at |
|-------------|-------------------|
| Database | Database only |
| Table | Database or specific tables |
| Column | Database, tables, or specific columns |

Examples:

```questdb-sql
-- Database-level: applies to all tables
GRANT SELECT ON ALL TABLES TO user;

-- Table-level: applies to specific tables
GRANT SELECT ON trades, prices TO user;

-- Column-level: applies to specific columns
GRANT SELECT ON trades(ts, symbol, price) TO user;
```

### The GRANT option

When granting permissions, you can allow the recipient to grant that permission
to others:

```questdb-sql
GRANT SELECT ON trades TO team_lead WITH GRANT OPTION;

-- team_lead can now grant SELECT on trades to others
```

### Owner permissions {#owner-grants}

When a user creates a table, they automatically receive all permissions on it
with the GRANT option. This ownership does not persist - if revoked, they cannot
get it back without someone re-granting it.

## Advanced topics

### Permission re-adjustment {#permission-level-re-adjustment}

Database-level permissions include access to future tables. If you revoke access
to one table, QuestDB automatically converts the database-level grant to
individual table-level grants:

```questdb-sql
GRANT SELECT ON ALL TABLES TO user;  -- Database level
REVOKE SELECT ON secret_table FROM user;

-- Result: user now has table-level SELECT on all tables EXCEPT secret_table
-- Future tables will NOT be accessible
```

The same applies from table to column level:

```questdb-sql
GRANT SELECT ON trades TO user;           -- Table level
REVOKE SELECT ON trades(ssn) FROM user;   -- Revoke one column

-- Result: user has column-level SELECT on all columns EXCEPT ssn
-- Future columns will NOT be accessible
```

:::note

When dropping a table, permissions on it are preserved by default (useful if
the table is recreated). Use `DROP TABLE ... CASCADE PERMISSIONS` to also
remove all associated permissions.

:::

### Implicit timestamp permissions {#implicit-permissions}

If a user has SELECT or UPDATE on any column of a table, they automatically get
the same permission on the designated timestamp column. This ensures time-series
operations (SAMPLE BY, LATEST ON, etc.) work correctly.

### Granting on non-existent objects {#grant-verification}

You can grant permissions on tables/columns that don't exist yet:

```questdb-sql
GRANT INSERT ON future_table TO app;
-- Permission activates when future_table is created
```

Use `WITH VERIFICATION` to catch typos:

```questdb-sql
GRANT SELECT ON trdaes TO user WITH VERIFICATION;
-- Fails immediately because 'trdaes' doesn't exist
```

### Service account assumption

Users can temporarily assume a service account's permissions for debugging:

```questdb-sql
-- Grant ability to assume
GRANT ASSUME SERVICE ACCOUNT ingest_app TO developer;

-- Developer can now switch context
ASSUME SERVICE ACCOUNT ingest_app;
-- ... debug with app's permissions ...
EXIT SERVICE ACCOUNT;
```

## User management reference {#user-management}

### Creating and removing principals

```questdb-sql
-- Users
CREATE USER username WITH PASSWORD 'pwd';
DROP USER username;

-- Service accounts
CREATE SERVICE ACCOUNT appname WITH PASSWORD 'pwd';
DROP SERVICE ACCOUNT appname;

-- Groups
CREATE GROUP groupname;
DROP GROUP groupname;
```

### Managing group membership

```questdb-sql
ADD USER username TO group1, group2;
REMOVE USER username FROM group1;
```

### Managing authentication

```questdb-sql
-- Change password
ALTER USER username WITH PASSWORD 'new_pwd';

-- Remove password (disables password auth)
ALTER USER username WITH NO PASSWORD;

-- Create tokens
ALTER USER username CREATE TOKEN TYPE JWK;
ALTER USER username CREATE TOKEN TYPE REST WITH TTL '30d';
ALTER USER username CREATE TOKEN TYPE REST WITH TTL '1d' REFRESH;  -- Auto-refresh

-- Remove tokens
ALTER USER username DROP TOKEN TYPE JWK;
ALTER USER username DROP TOKEN TYPE REST;  -- Drops all REST tokens
ALTER USER username DROP TOKEN TYPE REST 'token_value_here';  -- Drop specific token
```

Removing all authentication methods (password and tokens) effectively disables
the user - they can no longer connect to the database.

### Viewing information

```questdb-sql
SHOW USERS;                    -- List all users
SHOW SERVICE ACCOUNTS;         -- List all service accounts
SHOW GROUPS;                   -- List all groups
SHOW GROUPS username;          -- List groups for a user
SHOW USER username;            -- Show auth methods for user
SHOW PERMISSIONS username;     -- Show permissions for user
```

Example output from `SHOW USER`:

```
auth_type    enabled
---------    -------
Password     true
JWK Token    false
REST Token   true
```

:::note

Viewing other users' information requires `LIST USERS` (to list all) or
`USER DETAILS` (to see details) permissions. Users can always view their own
information without these permissions.

:::

## Permissions reference {#permissions}

Use `all_permissions()` to see all available permissions:

```questdb-sql
SELECT * FROM all_permissions();
```

<details>
<summary>Full permissions table (click to expand)</summary>

### Database permissions

| Permission | Level | Description |
|-----------|-------|-------------|
| ADD COLUMN | Database &#124; Table | Add columns to tables |
| ADD INDEX | Database &#124; Table &#124; Column | Add index on symbol columns |
| ALTER COLUMN CACHE | Database &#124; Table &#124; Column | Enable/disable symbol caching |
| ALTER COLUMN TYPE | Database &#124; Table &#124; Column | Change column types |
| ATTACH PARTITION | Database &#124; Table | Attach partitions |
| BACKUP DATABASE | Database | Create database backups |
| BACKUP TABLE | Database &#124; Table | Create table backups |
| CANCEL ANY COPY | Database | Cancel COPY operations |
| CREATE TABLE | Database | Create tables |
| CREATE MATERIALIZED VIEW | Database | Create materialized views |
| DEDUP ENABLE | Database &#124; Table | Enable deduplication |
| DEDUP DISABLE | Database &#124; Table | Disable deduplication |
| DETACH PARTITION | Database &#124; Table | Detach partitions |
| DROP COLUMN | Database &#124; Table &#124; Column | Drop columns |
| DROP INDEX | Database &#124; Table &#124; Column | Drop indexes |
| DROP PARTITION | Database &#124; Table | Drop partitions |
| DROP TABLE | Database &#124; Table | Drop tables |
| DROP MATERIALIZED VIEW | Database &#124; Table | Drop materialized views |
| INSERT | Database &#124; Table | Insert data |
| REFRESH MATERIALIZED VIEW | Database &#124; Table | Refresh materialized views |
| REINDEX | Database &#124; Table &#124; Column | Reindex columns |
| RENAME COLUMN | Database &#124; Table &#124; Column | Rename columns |
| RENAME TABLE | Database &#124; Table | Rename tables |
| RESUME WAL | Database &#124; Table | Resume WAL processing |
| SELECT | Database &#124; Table &#124; Column | Read data |
| SET TABLE PARAM | Database &#124; Table | Set table parameters |
| SET TABLE TYPE | Database &#124; Table | Change table type |
| SETTINGS | Database | Change instance settings in Web Console |
| SNAPSHOT | Database | Create snapshots |
| SQL ENGINE ADMIN | Database | List/cancel running queries |
| SYSTEM ADMIN | Database | System functions (reload_tls, etc.) |
| TRUNCATE TABLE | Database &#124; Table | Truncate tables |
| UPDATE | Database &#124; Table &#124; Column | Update data |
| VACUUM TABLE | Database &#124; Table | Reclaim storage |

### User management permissions

| Permission | Description |
|-----------|-------------|
| ADD EXTERNAL ALIAS | Create external group mappings |
| ADD PASSWORD | Set user passwords |
| ADD USER | Add users to groups |
| CREATE GROUP | Create groups |
| CREATE JWK | Create JWK tokens |
| CREATE REST TOKEN | Create REST API tokens |
| CREATE SERVICE ACCOUNT | Create service accounts |
| CREATE USER | Create users |
| DISABLE USER | Disable users |
| DROP GROUP | Drop groups |
| DROP JWK | Drop JWK tokens |
| DROP REST TOKEN | Drop REST API tokens |
| DROP SERVICE ACCOUNT | Drop service accounts |
| DROP USER | Drop users |
| ENABLE USER | Enable users |
| LIST USERS | List users/groups/service accounts |
| REMOVE EXTERNAL ALIAS | Remove external group mappings |
| REMOVE PASSWORD | Remove passwords |
| REMOVE USER | Remove users from groups |
| USER DETAILS | View user/group/service account details |

### Special permissions

| Permission | Description |
|-----------|-------------|
| ALL | All permissions at the granted level (database/table/column) |
| DATABASE ADMIN | All permissions including future ones; can assume any service account |

</details>

## SQL commands reference

- [ADD USER](/docs/query/sql/acl/add-user/)
- [ALTER USER](/docs/query/sql/acl/alter-user/)
- [ALTER SERVICE ACCOUNT](/docs/query/sql/acl/alter-service-account/)
- [ASSUME SERVICE ACCOUNT](/docs/query/sql/acl/assume-service-account/)
- [CREATE GROUP](/docs/query/sql/acl/create-group/)
- [CREATE SERVICE ACCOUNT](/docs/query/sql/acl/create-service-account/)
- [CREATE USER](/docs/query/sql/acl/create-user/)
- [DROP GROUP](/docs/query/sql/acl/drop-group/)
- [DROP SERVICE ACCOUNT](/docs/query/sql/acl/drop-service-account/)
- [DROP USER](/docs/query/sql/acl/drop-user/)
- [EXIT SERVICE ACCOUNT](/docs/query/sql/acl/exit-service-account/)
- [GRANT](/docs/query/sql/acl/grant/)
- [GRANT ASSUME SERVICE ACCOUNT](/docs/query/sql/acl/grant-assume-service-account/)
- [REMOVE USER](/docs/query/sql/acl/remove-user/)
- [REVOKE](/docs/query/sql/acl/revoke/)
- [REVOKE ASSUME SERVICE ACCOUNT](/docs/query/sql/acl/revoke-assume-service-account/)
- [SHOW USER](/docs/query/sql/show/#show-user)
- [SHOW USERS](/docs/query/sql/show/#show-users)
- [SHOW GROUPS](/docs/query/sql/show/#show-groups)
- [SHOW SERVICE ACCOUNT](/docs/query/sql/show/#show-service-account)
- [SHOW SERVICE ACCOUNTS](/docs/query/sql/show/#show-service-accounts)
- [SHOW PERMISSIONS](/docs/query/sql/show/#show-permissions-for-current-user)
