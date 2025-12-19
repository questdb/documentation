---
title: Configure Read-Only User for Grafana
sidebar_label: Read-only user
description: Set up a read-only PostgreSQL user for Grafana dashboards while maintaining admin access for DDL operations
---

Configure a dedicated read-only user for Grafana to improve security by preventing accidental data modifications through dashboards. This allows you to maintain separate credentials for visualization (read-only) and administration (full access), following the principle of least privilege.

:::note QuestDB Enterprise
For QuestDB Enterprise, use the comprehensive [Role-Based Access Control (RBAC)](/docs/operations/rbac/) system to create granular user permissions and roles. The configuration below applies to QuestDB Open Source.
:::

## Problem: Separate Read and Write Access

You want to:
1. Connect Grafana with read-only credentials
2. Prevent accidental `INSERT`, `UPDATE`, `DELETE`, or `DROP` operations from dashboards
3. Still be able to execute DDL statements (`CREATE TABLE`, etc.) from the QuestDB web console

However, QuestDB's PostgreSQL wire protocol doesn't support standard PostgreSQL user management commands like `CREATE USER` or `GRANT`.

## Solution: Enable the Read-Only User

QuestDB Open Source supports a built-in read-only user that can be enabled via configuration. This gives you two users:
- **Admin user** (default: `admin`): Full access for DDL and DML operations
- **Read-only user** (default: `user`): Query-only access for dashboards

### Configuration

Add these settings to your `server.conf` file or set them as environment variables:

**Via server.conf:**
```ini
# Enable the read-only user
pg.readonly.user.enabled=true

# Optional: Customize username (default is "user")
pg.readonly.user=grafana_reader

# Optional: Customize password (default is "quest")
pg.readonly.password=secure_password_here
```

**Via environment variables:**
```bash
export QDB_PG_READONLY_USER_ENABLED=true
export QDB_PG_READONLY_USER=grafana_reader
export QDB_PG_READONLY_PASSWORD=secure_password_here
```

**Via Docker:**
```bash
docker run \
  -p 9000:9000 -p 8812:8812 \
  -e QDB_PG_READONLY_USER_ENABLED=true \
  -e QDB_PG_READONLY_USER=grafana_reader \
  -e QDB_PG_READONLY_PASSWORD=secure_password_here \
  questdb/questdb:latest
```

### Using the Read-Only User

After enabling, you have two separate users:

**Admin user (web console):**
- Username: `admin` (default)
- Password: `quest` (default)
- Permissions: Full access - `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`, `ALTER`
- Use for: QuestDB web console, administrative tasks, schema changes

**Read-only user (Grafana):**
- Username: `grafana_reader` (or whatever you configured)
- Password: `secure_password_here` (or whatever you configured)
- Permissions: `SELECT` queries only
- Use for: Grafana dashboards, monitoring tools, analytics applications

:::info Related Documentation
- [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- [QuestDB Enterprise RBAC](/docs/operations/rbac/)
- [Configuration reference](/docs/configuration/)
- [Grafana QuestDB data source](https://grafana.com/grafana/plugins/questdb-questdb-datasource/)
:::
