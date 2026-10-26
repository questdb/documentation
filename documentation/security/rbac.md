---
title: Role-based Access Control (RBAC)
description:
  Users, groups, service accounts, and permissions down to column and row level,
  which tables each principal can see, and query memory limits in QuestDB
  Enterprise.
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

| Level        | What you can control            | Example                                               |
| ------------ | ------------------------------- | ----------------------------------------------------- |
| **Database** | All tables, global operations   | `GRANT SELECT ON ALL TABLES TO user`                  |
| **Table**    | Specific tables                 | `GRANT SELECT ON trades TO user`                      |
| **Column**   | Specific columns within a table | `GRANT SELECT ON trades(ts, price) TO user`           |
| **Row**      | Specific rows via views         | Create a view with WHERE clause, grant access to view |

### Connection access granularity

Control *how* users can connect:

| Permission | Protocol                        | Use case                                   |
| ---------- | ------------------------------- | ------------------------------------------ |
| `HTTP`     | REST API, Web Console, ILP/HTTP | Interactive users, web applications        |
| `PGWIRE`   | PostgreSQL Wire Protocol        | SQL clients, BI tools, programmatic access |
| `ILP`      | InfluxDB Line Protocol (TCP)    | High-throughput data ingestion             |

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
-- User can read only ts and price, not quantity or trader_id
GRANT SELECT ON trades(ts, price) TO analyst;
```

To grant on every column except a few, use the `*` wildcard with an `EXCLUDE`
list:

```questdb-sql
-- User can see all columns except trader_id
GRANT SELECT ON trades(* EXCLUDE (trader_id)) TO analyst;
```

The wildcard covers the columns that exist when the statement runs, not columns
added later. See
[GRANT](/docs/query/sql/acl/grant/#grant-on-all-columns-of-a-table) for details.

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
underlying `trades` table, and since they hold no permission on it, the table is
[hidden](#object-visibility) from them: it is missing from `SHOW TABLES`, and
querying it fails with `table does not exist [table=trades]`.

To also record who read the view, and with which parameters, create it as an
[audited view](/docs/security/audited-views/).

## Common scenarios

### Read-only analyst

A user who can query data but cannot modify anything:

```questdb-sql
CREATE USER analyst WITH PASSWORD 'pwd';
GRANT HTTP, PGWIRE TO analyst;
GRANT SELECT ON ALL TABLES TO analyst;
```

`SELECT ON ALL TABLES` also covers the tables behind
[audited views](/docs/security/audited-views/), and their audit trail, so its
holder reads that data with no audit row. Where audited views guard data, grant
`SELECT` on those views instead. See
[Audited views permissions](/docs/security/audited-views/#permissions).

### Application service account

A service account for an application that ingests data into specific tables:

```questdb-sql
CREATE SERVICE ACCOUNT ingest_app WITH PASSWORD 'pwd';
GRANT ILP TO ingest_app;                    -- InfluxDB Line Protocol access
GRANT INSERT ON sensor_data TO ingest_app;  -- Can only insert into sensor_data
```

### Cap a noisy tenant's query memory

Bound the native memory each of a user's queries may allocate, so one tenant's
runaway query fails instead of exhausting shared memory:

```questdb-sql
ALTER USER tenant_a SET MEMORY LIMIT 1G;
```

See [Memory limits](#memory-limits) for how limits resolve.

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
-- salary and ssn are not granted, so auditor cannot read them
```

The auditor can still see that `salary` and `ssn` exist, and their types,
because any permission on a table discloses its whole schema (see
[object visibility](#object-visibility)). To hide the columns themselves,
expose a [view](#row-level-access-with-views) that leaves them out instead of
the table.

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

Since Enterprise 2.3.1, a database-level `GRANT ALL` includes
`DATABASE ADMIN`, so the warning above applies to it, and it covers permissions
added in later versions, such as `SWITCH ROLE`, `SET MEMORY LIMIT` and
`AUDIT VIEW`. A principal granted `ALL` before 2.3.1, or individual permissions
without `DATABASE ADMIN`, needs each new permission granted explicitly: no
migration adds them. To check a principal, look for `DATABASE ADMIN` in its
`SHOW PERMISSIONS` output.

### Failover operator

A service account that can move the primary role between nodes, for an external
coordinator or a runbook, without any other administrative right:

```questdb-sql
CREATE SERVICE ACCOUNT failover_bot WITH PASSWORD 'pwd';
GRANT HTTP TO failover_bot;         -- POST /lifecycle/switch on port 9003
GRANT SWITCH ROLE TO failover_bot;  -- SWITCH ROLE, SWITCH STATUS, the endpoint
```

`SYSTEM ADMIN` is neither required nor sufficient for a role switch, and
`DATABASE ADMIN` includes `SWITCH ROLE`. Monitoring accounts do not need it:
`node_role()` and `GET /lifecycle` are open to any authenticated principal. See
[Failover and role switch](/docs/high-availability/failover/).

### Monitoring account

A service account that watches the health of every table, view, materialized
view, and live view, such as
[suspended tables](/docs/operations/monitoring-alerting/#detect-suspended-tables),
without reading table data:

```questdb-sql
CREATE SERVICE ACCOUNT health_monitor WITH PASSWORD 'pwd';
GRANT HTTP TO health_monitor;          -- REST API queries
GRANT SYSTEM ADMIN TO health_monitor;  -- sees every object, reads no rows
```

The account polls the WAL status of every object:

```questdb-sql
SELECT name, errorTag, errorMessage FROM wal_tables() WHERE suspended;
```

With `SYSTEM ADMIN`, the account [sees](#object-visibility) every unprotected
object in `tables()` and `wal_tables()`, also sees the protected access control
tables in `wal_tables()`, and can call `reader_pool()` and `writer_pool()`. It
still cannot read rows: `SELECT * FROM trades` fails with `Access denied`.

`SYSTEM ADMIN` is an administrative permission, so protect the account's
credentials like an administrator's. Besides visibility, it authorizes:

- [`ALTER TABLE REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/), which
  discards a table's pending WAL, and
  [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/)
- System functions, such as `hydrate_table_metadata()` and `reload_tls()`
- `files()` and `glob()` on any directory of the server

An account that does not need `reader_pool()`, `writer_pool()`, or the protected
tables can hold a single table-level permission granted `ON ALL TABLES` instead.
It makes every unprotected object visible, including objects created later,
without `SYSTEM ADMIN`:

```questdb-sql
GRANT RESUME WAL ON ALL TABLES TO health_monitor;  -- can also resume WAL
```

An account granted a permission on specific tables only sees those tables, so
a suspended table hidden from it raises no alert.

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

| Aspect               | User                           | Service Account        |
| -------------------- | ------------------------------ | ---------------------- |
| Permission source    | Direct + inherited from groups | Direct only            |
| Can belong to groups | Yes                            | No                     |
| Can be assumed (SU)  | No                             | Yes                    |
| Typical use          | Human individuals              | Applications, services |

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

| Method             | Use case                 | Endpoints                 |
| ------------------ | ------------------------ | ------------------------- |
| **Password**       | Interactive users        | REST API, PostgreSQL Wire |
| **JWK Token**      | ILP ingestion            | InfluxDB Line Protocol    |
| **REST API Token** | Programmatic REST access | REST API                  |

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

| Permission | Allows access to                       |
| ---------- | -------------------------------------- |
| `HTTP`     | REST API, Web Console, ILP over HTTP   |
| `PGWIRE`   | PostgreSQL Wire Protocol (port 8812)   |
| `ILP`      | InfluxDB Line Protocol TCP (port 9009) |

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

In a replicated cluster, keep in mind that the built-in admin authorizes a
[role switch](/docs/high-availability/failover/) from its own credentials,
independently of the replicated access lists. It is the break-glass account
when a `SWITCH ROLE` grant has not yet replicated to the node you need to
promote.

## Permission levels

Permissions have different granularities determining where they can be applied:

| Granularity | Can be granted at                     |
| ----------- | ------------------------------------- |
| Database    | Database only                         |
| Table       | Database or specific tables           |
| Column      | Database, tables, or specific columns |

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

## Object visibility {#object-visibility}

QuestDB Enterprise hides tables, views, materialized views, and live views from
principals that hold no permission on them, so that users and applications
cannot list the objects they have no access to, or read their schema through
SQL. To such a principal, a hidden object looks like a missing one: catalogue
queries such as `tables()`, `SHOW TABLES`, `information_schema`, and
`pg_catalog` leave it out, and statements that name it fail with the error a
missing object returns. A few paths still reveal a hidden object, see
[Limitations](#limitations). Object visibility is available since QuestDB
Enterprise 4.1.0 and applies whenever access control is enabled.

:::warning Breaking change

Before QuestDB Enterprise 4.1.0, every principal could list every object and
read its schema through catalogue queries, `SHOW` statements, and functions
such as `table_columns()`, and statements that read or changed an object it
held no permission on failed with `Access denied` or `Grant denied`. Both now
behave as for a missing object: catalogue queries leave the object out,
statements fail with the [errors for hidden objects](#errors-for-hidden-objects),
and the `IF EXISTS` forms do nothing. Over the REST API, a `does not exist`
error returns HTTP status 400, where `Access denied` returned 403. Clients and
tests that read the schema of such objects, or match the old messages, must
expect the missing-object behavior instead, or the principal needs a permission
on the object. See the
[4.1.0 upgrade checklist](/docs/operations/upgrade/#upgrading-to-410).

:::

### Visibility rules

A principal sees an object when any of the following holds:

- It is the [built-in admin](#built-in-admin) and has not assumed a service
  account.
- It holds `DATABASE ADMIN` or `SYSTEM ADMIN`.
- It holds any permission granted `ON ALL TABLES`, such as
  `GRANT INSERT ON ALL TABLES`.
- It holds any permission on the object itself, granted on the table or on any
  one of its columns.
- The object is public. The telemetry tables and the
  [`storage_policies`](/docs/query/functions/meta/#storage_policies) view are
  visible to every principal.

Protected tables are the exception. These system tables, such as
`sys.acl_entities` and `sys.acl_permissions`, store principals, credentials,
and grants, and only the built-in admin sees them. To every other principal,
including one holding `DATABASE ADMIN`, they look missing. For recovery,
`DATABASE ADMIN` and `SYSTEM ADMIN` holders still see them in
[`wal_tables()`](/docs/query/functions/meta/#wal_tables), `wal_transactions()`,
and `wait_wal_table()`, and WAL recovery statements such as
[`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/) reach them
for principals that hold the permission the statement requires.

Permissions count from every source the principal is authorized with: its own
grants and those of its groups or, after
[`ASSUME SERVICE ACCOUNT`](/docs/query/sql/acl/assume-service-account/), the
grants of the assumed service account. Database-level permissions that do not
apply to objects, such as `HTTP`, `CREATE TABLE`, or `LIST USERS`, make no
object visible. A principal that creates an object sees it through its
[owner grants](#owner-grants). A `GRANT` or `REVOKE` changes what a principal
sees from its next query, including on connections that are already open.

### What visibility discloses

Any permission on an object makes its metadata visible, even a permission that
reads no data. This includes the object's name, every column and its type, its
DDL through `SHOW CREATE`, and statistics such as row counts, timestamp ranges,
and partition sizes from `tables()`, `table_partitions()`, and
`table_storage()`. A grant on a single column discloses every column of the
table, including those the principal cannot read.

Visibility grants no access by itself. Statements on a visible object are
authorized as before, so an operation the principal holds no permission for
still fails with `Access denied`. For example, a service account that only
inserts into `positions`:

```questdb-sql
CREATE SERVICE ACCOUNT positions_feed WITH PASSWORD 'pwd';
GRANT HTTP TO positions_feed;
GRANT INSERT ON positions TO positions_feed;
```

sees `positions`, with all of its columns, and no other table:

```questdb-sql title="Connected as positions_feed"
-- Lists positions only
SHOW TABLES;

-- Every column of positions, with its type
SHOW COLUMNS FROM positions;

-- Access denied for positions_feed [SELECT on positions(timestamp)]
SELECT * FROM positions;

-- table does not exist [table=risk_limits]
SELECT * FROM risk_limits;
```

### Errors for hidden objects

A statement that names a hidden object fails with the same message and error
position as it does for a missing object. The most common errors are:

| Error                                          | Statements                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table does not exist [table=name]`            | `SELECT`, `EXPLAIN`, `UPDATE`, `ALTER TABLE`, `DROP TABLE`, `TRUNCATE TABLE`, `RENAME TABLE`, `SHOW COLUMNS`, `SHOW PARTITIONS`, `SHOW CREATE TABLE`, `REVOKE`, `table_columns()`, `table_partitions()`, and `GRANT` with a `*` column list |
| `view does not exist [view=name]`              | `ALTER VIEW`, `COMPILE VIEW`, `DROP VIEW`, `SHOW CREATE VIEW`                                                                                                                                                                               |
| `materialized view does not exist [view=name]` | `DROP MATERIALIZED VIEW`, `REFRESH MATERIALIZED VIEW`, `SHOW CREATE MATERIALIZED VIEW`                                                                                                                                                      |
| `live view does not exist`                     | `DROP LIVE VIEW`, `SHOW CREATE LIVE VIEW`                                                                                                                                                                                                   |
| `Invalid table name`                           | `INSERT`, and `GRANT` without a `*` column list                                                                                                                                                                                             |

The `IF EXISTS` forms, such as `DROP TABLE IF EXISTS`, do nothing for a hidden
object, and [`DROP ALL TABLES`](/docs/query/sql/drop/) leaves hidden objects in
place without naming them in its error report.

### Views

A principal with `SELECT` on a [view](/docs/concepts/views/) reads its rows
while the objects the view reads stay hidden, as in the
[row-level access](#row-level-access-with-views) example. The view's
definition, visible through `views()`, `SHOW CREATE VIEW`, and `EXPLAIN`, still
names those objects. In a view's definition, table-name functions such as
`table_columns()` and `SHOW` statements that name an object, such as
`SHOW COLUMNS`, can also publish the metadata of a table hidden from the view's
readers, as described in
[metadata functions in views](/docs/concepts/views/#metadata-functions-in-views).
Functions and statements that list objects, such as `tables()` and
`SHOW TABLES`, list only what the reader can see, also inside a view.

### Administrative and catalogue functions

`reader_pool()`, `writer_pool()`, `files()`, and `glob()` list objects whether
or not the caller can see them. They require `SYSTEM ADMIN`, `glob()` only with
an absolute pattern outside
[`cairo.sql.copy.root`](/docs/configuration/copy-settings/#cairosqlcopyroot),
and otherwise fail with `Access denied for <principal> [SYSTEM ADMIN]`.

Materialized and live views refresh under a context that sees every object, so
they accept catalogue functions and `SHOW` statements only in their own query,
and only from a principal with `SYSTEM ADMIN`. See
[catalogue functions](/docs/query/sql/create-mat-view/#catalogue-functions).

### Limitations

Visibility keeps hidden objects out of catalogue queries and SQL statements,
but some paths still reveal that an object exists, and ILP writes reveal the
columns of a hidden table:

- Any principal can test whether a name is taken, because the name is checked
  before the permission to create. Creating an object fails when a hidden
  object already has its name, whether through `CREATE` or
  `RENAME TABLE ... TO`: `CREATE TABLE` fails with `table already exists`,
  where a free name fails with `Access denied` for a principal without
  `CREATE TABLE`. `CREATE ... IF NOT EXISTS` returns without creating anything
  when the hidden object is of the same kind. Otherwise it fails with an error
  such as `view or materialized view with the requested name already exists`.
  `COPY ... FROM` and CSV import into a hidden table fail with
  `Access denied for <principal> [INSERT on <table>]`.
- An ILP over HTTP write to a hidden table fails with
  `Access denied for <principal> [INSERT on <table>]` when the table has every
  column the line writes, and with `[ADD COLUMN on <table>]` when it lacks one.
  A value of the wrong type fails with a cast error that names the column and
  its type. A principal that knows a hidden table's name can therefore probe
  its column names and types.
- `USER DETAILS` holders see the object names in other principals' grants,
  through `SHOW PERMISSIONS`, and `SQL ENGINE ADMIN` holders see the text of
  every running query in
  [`query_activity()`](/docs/query/functions/meta/#query_activity).
- Table ids are allocated database-wide, so gaps between visible ids reveal
  that other tables exist. The public `sys.telemetry_wal` table records every
  WAL write by table id, with its row count and timestamp range, so it also
  shows how much data each hidden table receives.

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

You can grant permissions on tables and columns that don't exist yet:

```questdb-sql
GRANT INSERT ON future_table TO app;
-- Permission activates when future_table is created
```

Only the built-in admin can grant on a table that doesn't exist yet. Any other
granter, including one holding `DATABASE ADMIN`, gets `Invalid table name`, the
same error as for a table it [cannot see](#object-visibility).

`GRANT` does not check that the grantee exists either. Use `WITH VERIFICATION`
to catch a misspelled user, group, or service account:

```questdb-sql
GRANT SELECT ON trades TO anlayst WITH VERIFICATION;
-- Fails: Grantee does not exist [name=anlayst]
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

### Access control on replicas {#replicas}

Users, groups, service accounts, and their permissions are managed on the
primary. A read-only [replica](/docs/high-availability/overview/) rejects
statements such as `CREATE USER` and `GRANT`, and receives the changes through
replication instead. Before it authorizes a statement, the replica reloads its
access lists if new changes have arrived.

A statement that finds another session already reloading waits for that reload
for up to 30 seconds. If the access lists are still out of date after that, the
statement fails instead of being authorized against outdated permissions:

```text
timed out waiting for the access lists to refresh [timeout=30000ms]
```

Retry the statement.

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

`SHOW USERS`, `SHOW GROUPS`, and `SHOW SERVICE ACCOUNTS` also report each
entity's [memory limit](#memory-limits).

Example output from `SHOW USER`:

```
auth_type    enabled
---------    -------
Password     true
JWK Token    false
REST Token   true
```

To audit permissions across all users, groups, and service accounts in one
query, use the
[access control functions](/docs/query/functions/access-control/):

```questdb-sql
SELECT * FROM active_permissions();  -- Effective, including group permissions
SELECT * FROM active_grants();       -- Direct grants only
```

:::note

Viewing other users' information requires `LIST USERS` (to list all) or
`USER DETAILS` (to see details) permissions. Users can always view their own
information without these permissions. `active_permissions()` and
`active_grants()` list the permissions of every entity, so they require both,
even to read your own rows.

:::

## Memory limits {#memory-limits}

QuestDB Enterprise can limit the native memory tracked for a single query,
overriding the server-wide query memory limit for a specific user, group, or
service account. Use it to help prevent one tenant's runaway query from
exhausting shared memory, or to grant a trusted principal more headroom than the
default. Per-principal limits are available since QuestDB Enterprise 4.0.2; the
server-wide [workload limits](/docs/configuration/cairo-engine/#memory-limits)
they override are available since QuestDB 10.0.0.

Set a limit with
[`ALTER USER`](/docs/query/sql/acl/alter-user-set-memory-limit/),
[`ALTER GROUP`](/docs/query/sql/acl/alter-group-set-memory-limit/), or
[`ALTER SERVICE ACCOUNT`](/docs/query/sql/acl/alter-service-account-set-memory-limit/):

```questdb-sql
ALTER USER john SET MEMORY LIMIT 512M;
ALTER GROUP analysts SET MEMORY LIMIT 2G;
ALTER SERVICE ACCOUNT ingest_app SET MEMORY LIMIT 1G;
ALTER USER john SET MEMORY LIMIT UNLIMITED;  -- clear the user's own limit
```

The value is a byte count or a size with a `K`, `M`, or `G` suffix. Each suffix
multiplies by 1024, so `512M` is 536870912 bytes. Setting a limit requires the
`SET MEMORY LIMIT` permission, which is included in `GRANT ALL` and held
implicitly by database admins.

:::warning

Treat `SET MEMORY LIMIT` as an administrative permission, not a self-service
one. It takes no entity name, so its holder can set the limit of any principal,
including its own. Because a per-principal limit overrides the workload limit
rather than tightening it (see [How limits resolve](#how-limits-resolve)), a
non-admin who holds it can raise its own ceiling above
`cairo.query.memory.limit.bytes`. The built-in admin is exempt only as a
target: its limit cannot be set at all.

A database-level `GRANT ALL` issued on Enterprise 2.3.1 or later includes
`DATABASE ADMIN`, and so `SET MEMORY LIMIT`. A principal that holds individual
permissions without `DATABASE ADMIN`, or `ALL` granted before 2.3.1, does not
acquire it, and no migration backfills it. Grant it explicitly to such
administrators: `GRANT SET MEMORY LIMIT TO admins;`. See
[Database administrator](#database-administrator).

:::

### How limits resolve

QuestDB resolves the limit for a query by strict precedence. It takes the first
level that is set, not the smallest across levels:

1. **The principal's own limit.** For a user this is the user's own limit; for a
   query that assumes a service account it is the service account's limit.
2. **A group limit** (users only). When a user has no limit of its own, it
   inherits the
   most restrictive (smallest positive) limit among the groups it belongs to.
   Service accounts never inherit group limits.
3. **The workload limit.** Otherwise the server-wide
   [`cairo.query.memory.limit.bytes`](/docs/configuration/cairo-engine/#cairoquerymemorylimitbytes)
   applies.

A value of `0` (or `UNLIMITED`) means "not set" at that level, so resolution
falls through to the next one. A more specific level, when set, fully overrides
the broader one and binds even when it is larger, so a per-user or per-group
override can raise a principal's ceiling above the workload limit, not only lower
it. A user who assumes a service account takes on the service account's limit.
The built-in admin cannot be given a limit, so `ALTER USER admin SET MEMORY
LIMIT` is rejected with `Cannot set memory limit for built-in admin`, and the
admin runs under the workload limit. Size that limit with the admin's
diagnostic queries in mind.

The cap applies to the principal's queries on both the primary and replicas. The
statement itself runs on the primary only: a replica rejects it with
`replica cannot set memory limit` and receives the new value through the
replicated ACL tables. A changed limit applies to the
principal's next query, including on connections that are already open, while a
query already running keeps the limit it started with.

A query that crosses its limit fails with the same
`query memory limit exceeded [workload=QUERY, ...]` error as a breach of the
workload limit. See
[memory limits](/docs/configuration/cairo-engine/#memory-limits) for the message
format.

:::note

A limit bounds a single query. Two concurrent queries by the same principal each
run under the full limit, so the principal's aggregate usage can exceed it. The
cap guards against one runaway workload, not total concurrent usage.

:::

### What a per-principal limit covers

Per-principal limits have the same
[coverage](/docs/configuration/cairo-engine/#memory-limits) as workload limits.
They apply to tracked native allocations for:

- The principal's queries.
- Its background [`COPY ... TO`](/docs/query/sql/copy/) exports, which use the
  issuing principal's limit. Some memory used to produce the export file is not
  yet covered, and exports do not appear in `query_activity`, so their usage
  cannot be observed while they run.
- `UPDATE` on a non-WAL table, which is applied on the caller's own thread and
  acquires its own query-workload tracker.

It does not reach work that runs under an internal context rather than a
principal. That work stays bounded only by its own
[workload limit](/docs/configuration/cairo-engine/#memory-limits):

- `UPDATE` on a WAL table, the default table type, because the statement
  is applied by the WAL apply job and draws on that job's
  `cairo.wal.apply.memory.limit.bytes` budget instead. Whether a large `UPDATE`
  is capped by a `SET MEMORY LIMIT` override therefore depends on the table
  type. A WAL-table `UPDATE` that breaches the WAL apply limit suspends the
  table for every principal until
  [`ALTER TABLE RESUME WAL`](/docs/query/sql/alter-table-resume-wal/), so the
  failure is not isolated to the tenant that issued it.
- Materialized view refresh, live view refresh, and WAL apply itself. A WAL
  apply batches many principals' transactions into one tracker, so it could not
  attribute usage to a single principal in any case.
- `COPY ... FROM` imports, which acquire no memory tracker at all and are
  unaffected by either kind of limit.

:::note

An external (SSO/OIDC) user can only receive a limit by inheriting one from a
group: `ALTER USER ... SET MEMORY LIMIT` on an external user is rejected with
`Cannot set memory limit for external user`. The user receives its inherited
group limit at login. On the primary, a later `ALTER GROUP ... SET MEMORY LIMIT`
also reaches the user's open sessions at their next query. On a replica, and on
the primary after a restart or promotion, an existing external session keeps
the limit it logged in with until it reconnects.

:::

### Inspecting limits

- `SHOW USERS`, `SHOW GROUPS`, and `SHOW SERVICE ACCOUNTS` report per-principal
  limits in a `memory_limit` column, in bytes. For users, it is the user's own
  limit or, when it has none, the most restrictive of its groups'. For groups
  and service accounts, it is the entity's own limit. The column excludes the
  server-wide workload limit. `null` means the entity has no limit of its own
  and, for a user, no inherited one either, so the workload limit applies to
  its queries.
- The filtered forms `SHOW GROUPS userName` and
  `SHOW SERVICE ACCOUNTS { userName | groupName }` carry the column too, reporting each
  listed group's or service account's own limit. This shows which inherited
  limit binds for a user with no limit of its own.
- [`query_activity`](/docs/query/functions/meta/#query_activity) exposes the
  effective limit and live usage of each running query through its `memory_limit`
  and `memory_used` columns.
- `SHOW USER` does not carry the column. The unfiltered `SHOW USERS`,
  `SHOW GROUPS`, and `SHOW SERVICE ACCOUNTS` require `LIST USERS`; the filtered
  forms require `USER DETAILS` unless the caller names itself or one of its own
  groups. A user without `LIST USERS` can still read its own effective cap from the
  `memory_limit` column of `query_activity`, which always lists the caller's
  own queries.
- The stored value is persisted on the `sys.acl_entities` system table. That
  table is [protected](#visibility-rules): only the built-in admin can see and
  read it, and to an ACL principal holding `DATABASE ADMIN` it looks missing.

### Upgrading {#memory-limit-upgrade}

:::warning Breaking change

`memory_limit` is appended as the last column of `SHOW USERS`, `SHOW GROUPS`,
and `SHOW SERVICE ACCOUNTS`, including their filtered forms, whether or not any
limit is set. `SELECT *` on `sys.acl_entities` returns one more column as well.
Clients that read these results by position must be updated; clients that read
by column name are unaffected.

:::

The `SHOW` results carry the column from the first start of the upgraded
binary, reading `null` until limits are set. The `sys.acl_entities` column that
stores the value is added by an automatic migration when an upgraded node first
starts as a primary or is promoted from replica to primary. Persisted principal
limits are not enforced until the migration has been applied. The migration passes
through two windows, and each refuses a different set of statements:

- Before the column exists, a `SET MEMORY LIMIT` with a non-zero size is refused
  with:

  ```
  Cannot modify ACL entities: the memory_limit column has not been migrated in yet; retry shortly, or restart the node if it persists
  ```

  `SET MEMORY LIMIT UNLIMITED` and `ALTER ... ENABLE` or `DISABLE` still
  succeed.

- Once the column has been added but WAL apply has not yet reached it,
  `SET MEMORY LIMIT UNLIMITED` and `ALTER ... ENABLE` or `DISABLE` are refused
  as well, so that a stale in-memory value cannot overwrite a stored limit. A
  non-zero `SET MEMORY LIMIT` keeps the first message; the others read:

  ```
  Cannot set memory limit while the ACL memory_limit column migration is still being applied, retry [name=john]
  ```

  or `Cannot enable while ...` and `Cannot disable while ...` for a status
  change.

The window normally closes on its own once WAL apply catches up, so retry the
statement first. If the error persists, restart the node: the migration runs
again at startup.

## Permissions reference {#permissions}

Use [`all_permissions()`](/docs/query/functions/access-control/#all_permissions)
to list all available permissions and the levels they can be granted at:

```questdb-sql
SELECT * FROM all_permissions();
```

<details>
<summary>Full permissions table (click to expand)</summary>

### Database permissions

| Permission                | Level                               | Description                             |
| ------------------------- | ----------------------------------- | --------------------------------------- |
| ADD COLUMN                | Database &#124; Table               | Add columns to tables                   |
| ADD INDEX                 | Database &#124; Table &#124; Column | Add index on symbol columns             |
| ALTER COLUMN CACHE        | Database &#124; Table &#124; Column | Enable/disable symbol caching           |
| ALTER COLUMN TYPE         | Database &#124; Table &#124; Column | Change column types                     |
| ATTACH PARTITION          | Database &#124; Table               | Attach partitions                       |
| AUDIT VIEW                | Database                            | Create, alter and drop [audited views](/docs/security/audited-views/#permissions) |
| BACKUP DATABASE           | Database                            | Create database backups                 |
| CANCEL ANY COPY           | Database                            | Cancel COPY operations                  |
| CREATE TABLE              | Database                            | Create tables                           |
| CREATE MATERIALIZED VIEW  | Database                            | Create materialized views               |
| CREATE LIVE VIEW          | Database                            | Create live views                       |
| DEDUP ENABLE              | Database &#124; Table               | Enable deduplication                    |
| DEDUP DISABLE             | Database &#124; Table               | Disable deduplication                   |
| DETACH PARTITION          | Database &#124; Table               | Detach partitions                       |
| DISABLE STORAGE POLICY    | Database &#124; Table               | Disable storage policies                |
| DROP COLUMN               | Database &#124; Table &#124; Column | Drop columns                            |
| DROP INDEX                | Database &#124; Table &#124; Column | Drop indexes                            |
| DROP PARTITION            | Database &#124; Table               | Drop partitions                         |
| DROP TABLE                | Database &#124; Table               | Drop tables                             |
| DROP MATERIALIZED VIEW    | Database &#124; Table               | Drop materialized views                 |
| DROP LIVE VIEW            | Database &#124; Table               | Drop live views                         |
| ENABLE STORAGE POLICY     | Database &#124; Table               | Enable storage policies                 |
| INSERT                    | Database &#124; Table               | Insert data                             |
| REFRESH MATERIALIZED VIEW | Database &#124; Table               | Refresh materialized views              |
| REINDEX                   | Database &#124; Table &#124; Column | Reindex columns                         |
| REMOVE STORAGE POLICY     | Database &#124; Table               | Remove storage policies                 |
| RENAME COLUMN             | Database &#124; Table &#124; Column | Rename columns                          |
| RENAME TABLE              | Database &#124; Table               | Rename tables                           |
| RESOURCE GROUP ADMIN      | Database                            | Manage and map resource groups, read `resource_groups()` |
| RESUME WAL                | Database &#124; Table               | Resume WAL processing                   |
| SELECT                    | Database &#124; Table &#124; Column | Read data                               |
| SET STORAGE POLICY        | Database &#124; Table               | Set storage policies                    |
| SET TABLE PARAM           | Database &#124; Table               | Set table parameters                    |
| SET TABLE TYPE            | Database &#124; Table               | Change table type                       |
| SETTINGS                  | Database                            | Change instance settings in Web Console |
| SNAPSHOT                  | Database                            | Create snapshots                        |
| SQL ENGINE ADMIN          | Database                            | List/cancel running queries             |
| SWITCH ROLE               | Database                            | Switch the replication role, read SWITCH STATUS |
| SYSTEM ADMIN              | Database                            | System functions (reload_tls, reader_pool, etc.); makes objects [visible](#object-visibility) |
| TRUNCATE TABLE            | Database &#124; Table               | Truncate tables                         |
| UPDATE                    | Database &#124; Table &#124; Column | Update data                             |
| VACUUM TABLE              | Database &#124; Table               | Reclaim storage                         |

### User management permissions

| Permission             | Description                             |
| ---------------------- | --------------------------------------- |
| ADD EXTERNAL ALIAS     | Create external group mappings          |
| ADD PASSWORD           | Set user passwords                      |
| ADD USER               | Add users to groups                     |
| CREATE GROUP           | Create groups                           |
| CREATE JWK             | Create JWK tokens                       |
| CREATE REST TOKEN      | Create REST API tokens                  |
| CREATE SERVICE ACCOUNT | Create service accounts                 |
| CREATE USER            | Create users                            |
| DISABLE USER           | Disable users                           |
| DROP GROUP             | Drop groups                             |
| DROP JWK               | Drop JWK tokens                         |
| DROP REST TOKEN        | Drop REST API tokens                    |
| DROP SERVICE ACCOUNT   | Drop service accounts                   |
| DROP USER              | Drop users                              |
| ENABLE USER            | Enable users                            |
| LIST USERS             | List users/groups/service accounts      |
| REMOVE EXTERNAL ALIAS  | Remove external group mappings          |
| REMOVE PASSWORD        | Remove passwords                        |
| REMOVE USER            | Remove users from groups                |
| SET MEMORY LIMIT       | Set memory limits on users, groups, and service accounts |
| USER DETAILS           | View user/group/service account details |

### Special permissions

| Permission     | Description                                                           |
| -------------- | --------------------------------------------------------------------- |
| ALL            | All permissions at the granted level (database/table/column). At database level, includes `DATABASE ADMIN` since Enterprise 2.3.1: see [Database administrator](#database-administrator) |
| DATABASE ADMIN | All permissions including future ones; can assume any service account |

A few operations have no permission of their own. They require `SYSTEM ADMIN`, which the built-in admin and `DATABASE ADMIN` holders have:

| Operation                                                               | Notes                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`ALTER TABLE REBASE WAL`](/docs/query/sql/alter-table-rebase-wal/)     | Rebuilds a suspended WAL table under a fresh sequencer                                      |
| [`SWITCH COLD STORAGE ROLE`](/docs/query/sql/switch-cold-storage-role/) | Moves the [cold storage](/docs/concepts/cold-storage/) manager role, including with `FORCE` |

By contrast, [`SWITCH ROLE`](/docs/query/sql/switch-role/), which moves the
replication role, is an ordinary grantable permission.

</details>

## SQL commands reference

- [ADD USER](/docs/query/sql/acl/add-user/)
- ALTER GROUP
  - [DROP EXTERNAL ALIAS](/docs/query/sql/acl/alter-group-drop-external-alias/)
  - [SET MEMORY LIMIT](/docs/query/sql/acl/alter-group-set-memory-limit/)
  - [SET RESOURCE GROUP](/docs/query/sql/acl/alter-group-set-resource-group/)
  - [UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-group-unset-resource-group/)
  - [WITH EXTERNAL ALIAS](/docs/query/sql/acl/alter-group-with-external-alias/)
- ALTER SERVICE ACCOUNT
  - [CREATE TOKEN](/docs/query/sql/acl/alter-service-account-create-token/)
  - [DISABLE](/docs/query/sql/acl/alter-service-account-disable/)
  - [DROP TOKEN](/docs/query/sql/acl/alter-service-account-drop-token/)
  - [ENABLE](/docs/query/sql/acl/alter-service-account-enable/)
  - [SET MEMORY LIMIT](/docs/query/sql/acl/alter-service-account-set-memory-limit/)
  - [SET RESOURCE GROUP](/docs/query/sql/acl/alter-service-account-set-resource-group/)
  - [UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-service-account-unset-resource-group/)
  - [WITH NO PASSWORD](/docs/query/sql/acl/alter-service-account-with-no-password/)
  - [WITH PASSWORD](/docs/query/sql/acl/alter-service-account-with-password/)
- ALTER USER
  - [CREATE TOKEN](/docs/query/sql/acl/alter-user-create-token/)
  - [DISABLE](/docs/query/sql/acl/alter-user-disable/)
  - [DROP TOKEN](/docs/query/sql/acl/alter-user-drop-token/)
  - [ENABLE](/docs/query/sql/acl/alter-user-enable/)
  - [SET MEMORY LIMIT](/docs/query/sql/acl/alter-user-set-memory-limit/)
  - [SET RESOURCE GROUP](/docs/query/sql/acl/alter-user-set-resource-group/)
  - [UNSET RESOURCE GROUP](/docs/query/sql/acl/alter-user-unset-resource-group/)
  - [WITH NO PASSWORD](/docs/query/sql/acl/alter-user-with-no-password/)
  - [WITH PASSWORD](/docs/query/sql/acl/alter-user-with-password/)
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
