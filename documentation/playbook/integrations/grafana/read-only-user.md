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

## Grafana Configuration

Configure Grafana to use the read-only user:

### PostgreSQL Data Source

When adding a QuestDB data source using the PostgreSQL plugin:

1. **Host:** `your-questdb-host:8812`
2. **Database:** `qdb`
3. **User:** `grafana_reader` (your read-only username)
4. **Password:** `secure_password_here` (your read-only password)
5. **SSL Mode:** Depends on your setup (typically `disable` for local, `require` for remote)

### QuestDB Data Source Plugin

When using the [native QuestDB Grafana plugin](https://grafana.com/grafana/plugins/questdb-questdb-datasource/):

1. **URL:** `http://your-questdb-host:9000`
2. **Authentication:** Select PostgreSQL Wire
3. **User:** `grafana_reader`
4. **Password:** `secure_password_here`

## Verification

Test that permissions are working correctly:

**Read-only user should succeed:**
```sql
-- These queries should work
SELECT * FROM trades LIMIT 10;
SELECT count(*) FROM trades;
SELECT symbol, avg(price) FROM trades GROUP BY symbol;
```

**Read-only user should fail:**
```sql
-- These operations should be rejected
INSERT INTO trades VALUES ('BTC-USDT', 'buy', 50000, 0.1, now());
UPDATE trades SET price = 60000 WHERE symbol = 'BTC-USDT';
DELETE FROM trades WHERE timestamp < dateadd('d', -30, now());
CREATE TABLE test_table (id INT, name STRING);
DROP TABLE trades;
```

Expected error for write operations: `permission denied` or similar.

## Security Best Practices

### Strong Passwords

Change default passwords immediately:
```ini
# Don't use the defaults in production
pg.user=custom_admin_username
pg.password=strong_admin_password_here

pg.readonly.user=custom_readonly_username
pg.readonly.password=strong_readonly_password_here
```

### Network Access Control

Restrict network access at the infrastructure level:
- Use firewalls to limit which hosts can connect to port 8812
- For cloud deployments, use security groups or network policies
- Consider using a VPN for remote access

### Connection Encryption

Enable TLS for PostgreSQL connections:
- QuestDB Enterprise has native TLS support
- For Open Source, consider using a TLS termination proxy (e.g., HAProxy, nginx)

### Regular Password Rotation

Implement a password rotation policy:
1. Update the password in QuestDB configuration
2. Restart QuestDB to apply changes
3. Update Grafana data source configuration
4. Test connections before rotating further

## Troubleshooting

**Connection refused:**
- Verify QuestDB is running and listening on port 8812
- Check firewall rules allow connections
- Ensure the PostgreSQL wire protocol is enabled (it is by default)

**Authentication failed:**
- Verify the read-only user is enabled: `pg.readonly.user.enabled=true`
- Check username and password match your configuration
- Restart QuestDB after configuration changes

**Queries failing for read-only user:**
- Ensure queries are SELECT-only (no INSERT, UPDATE, DELETE, CREATE, DROP, ALTER)
- Check table names are correct (case-sensitive in some contexts)
- Verify user has been correctly configured as read-only

**DDL statements fail from web console:**
- Verify you're using the admin user, not the read-only user
- Check the web console is configured to use admin credentials

## Alternative: Connection Pooling with PgBouncer

For advanced setups with many concurrent Grafana users, consider using PgBouncer:

1. **Configure PgBouncer** to connect to QuestDB with the read-only user
2. **Set authentication** in PgBouncer for your Grafana instances
3. **Point Grafana** to PgBouncer instead of directly to QuestDB

This provides connection pooling benefits and an additional authentication layer.

:::tip Multiple Dashboards
You can use the same read-only credentials across multiple Grafana instances or dashboards. Each connection will be independently managed by QuestDB's PostgreSQL wire protocol implementation.
:::

:::warning Write Operations from Web Console
The web console uses different authentication than the PostgreSQL wire protocol. Enabling a read-only user does NOT restrict the web console - it will still have full access via the admin user and the REST API.
:::

:::info Related Documentation
- [PostgreSQL wire protocol](/docs/reference/api/postgres/)
- [QuestDB Enterprise RBAC](/docs/operations/rbac/)
- [Configuration reference](/docs/configuration/)
- [Grafana QuestDB data source](https://grafana.com/grafana/plugins/questdb-questdb-datasource/)
:::
