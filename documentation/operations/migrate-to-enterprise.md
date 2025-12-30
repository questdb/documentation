---
title: Upgrade to QuestDB Enterprise
sidebar_label: Upgrade to QuestDB Enterprise
description:
  Upgrade from QuestDB Open Source to QuestDB Enterprise in minutes by swapping
  binaries.
---

Upgrading from QuestDB Open Source to QuestDB Enterprise is straightforward:
**download the Enterprise binaries, swap them in, and restart**. Your data
stays in place and works immediately.

## What you get with QuestDB Enterprise

- **TLS encryption** for all network interfaces
- **Role-based access control (RBAC)** with users, groups, and permissions
- **Single Sign-On (SSO)** via OpenID Connect
- **Database replication** for high availability
- **Multi-tier storage** with seamless object storage integration
- **Automated backup and recovery** for data protection

## Upgrade steps

### 1. Download Enterprise binaries

You should have received an email with download credentials for the Enterprise
binaries. Download the version matching your operating system and architecture.

:::tip
Check the [release notes](https://questdb.com/release-notes/?ref=docs&type=enterprise)
for the latest features and improvements.
:::

### 2. Swap binaries and restart

1. Stop your running QuestDB instance
2. Replace the existing QuestDB binaries with the Enterprise ones
3. Start QuestDB with the new binaries

That's it! The database will automatically prepare your existing tables for
Enterprise features on first startup.

:::tip Optional: Create a backup first
While upgrades are safe, you can create a restore point before upgrading:

```questdb-sql
CHECKPOINT CREATE
```

Then back up your data directory (e.g., create a `.tar` archive or cloud
snapshot). See [Backup and restore](/docs/operations/backup/) for details.
:::

## Configure QuestDB Enterprise features

These steps are **optional** - configure only the features you need.

### TLS encryption

Secure all network connections with TLS. You'll need a certificate in PEM
format, or you can use a
[self-signed demo certificate](/docs/operations/tls/#demo-certificates) to get
started.

See the [TLS Encryption guide](/docs/operations/tls/).

### User accounts and permissions

Replace the default admin credentials in `server.conf`:

```ini title="server.conf"
acl.admin.user=myadmin
acl.admin.password=mypwd
```

For production, create proper admin accounts and disable the built-in admin:

```questdb-sql
CREATE USER administrator WITH PASSWORD adminpwd;
GRANT ALL TO administrator WITH GRANT OPTION;
```

```ini title="server.conf"
acl.admin.user.enabled=false
```

See the [RBAC documentation](/docs/operations/rbac/) for complete setup.

### Single Sign-On (SSO)

Integrate with your identity provider (Microsoft Entra ID, PingFederate, etc.)
for centralized authentication.

See the [OIDC Integration guide](/docs/operations/openid-connect-oidc-integration).

### Replication

Set up database replication for high availability and disaster recovery.

See the [Database Replication guide](/docs/operations/replication).

## Important notes

The upgrade process modifies table metadata to enable Enterprise features. For
this reason:

- Always perform an **in-place upgrade** (swap binaries in the same
  installation)
- Don't copy data directories between Open Source and Enterprise installations
- If reusing an object store from a test Enterprise instance, clear it first

Have a complex migration scenario?
[Contact us](https://questdb.com/contact/) and we'll help with your setup.
