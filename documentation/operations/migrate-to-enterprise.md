---
title: Migrate to Enterprise edition
sidebar_label: Migrate to Enterprise edition
description:
  Instructions on how to upgrade a QuestDB open source installation to QuestDB
  Enterprise.
---

This page covers the steps to migrate a database instance from QuestDB open
source edition to QuestDB Enterprise edition.

## Overview

The QuestDB Enterprise edition is based on the Open Source edition of the
database.

Migrating from QuestDB Open Source to QuestDB Enterprise is a straightforward
process. It is nonetheless important to follow the steps carefully to ensure a
successful migration.

## Migration Workflow

### Step 0: Backup your data

Before you start the migration process, consider backing up your data.

You can follow the instructions in the
[Backup and restore](/docs/operations/backup/) guide create a restore point.
It is unlikely that you will need the restore point, but it is a good idea to
have it in case something goes wrong.

In short:

* Checkpoint the database:
  ```questdb-sql
  CHECKPOINT CREATE
  ```

* Back up the files, such as creating a `.tar` archive or taking an AWS EBS
  volume snapshot.

:::info
If backing up is not possible, you can safely skip this step.
:::

### Step 1: Download the Enterprise binaries

You should have received an email detailing the download steps and credentials
to obtain the Enterprise binaries.

Each Enterprise version is built for a specific operating system and
architecture. You should always opt for the latest version of the Enterprise
edition.

:::tip
You may consult the [release notes](https://questdb.com/release-notes/?type=enterprise)
to consult the latest changes and features.
:::

### Step 2: Install and restart the database

* Unpack the binaries in a directory of your choice.
* Replace your existing QuestDB binaries with the new ones.
* Stop the database.
* Start the database with the new binaries _in place_.

:::info
The first time you start the database with the new binaries, the migration
process will kick in and ready the database state for the new features.
:::

### Step 3: Set up TLS connection encryption

Prepare your server TLS certificates in PEM format and continue with the
[TLS Encryption](/docs/operations/tls/) guide.

:::info
If you don't have a TLS certificate yet, you can ask QuestDB to
generate a
[self-signed demo certificate](/docs/operations/tls/#demo-certificates).
:::

### Step 4: Set up user accounts and permissions

First override the default admin credentials in `server.conf`.
It is recommended to select a non-trivial username and password.
```
acl.admin.user=myadmin
acl.admin.password=mypwd
```
The above settings will replace the default built-in admin account
(`admin`/`quest`) to make the database safer.

However, the password is still stored in the configuration file as
plain text.
We also recommend to create your own admin account(s), and completely
disable the built-in admin.

To create your own database administrators, start the database up, and
login via the Web Console with the admin credentials specified previously
in `server.conf`. Then create one or more admin accounts which will be
used for database and user management.

For example, the simplest way to create a full admin:
```questdb-sql
CREATE USER administrator WITH PASSWORD adminpwd;
GRANT ALL TO administrator WITH GRANT OPTION;
```

The above `administrator` user replaces the built-in admin, which can be
disabled now in the configuration file:
```
acl.admin.user.enabled=false
```

The built-in admin settings can stay in `server.conf`, and can be
re-enabled in emergency situations, such as all database administrators
have forgotten their passwords.

Now we can go ahead and setup groups, user and service accounts with the
help of the new database administrator(s).
More details on this topic can be found in the
[RBAC documentation](/docs/operations/rbac/#user-management).

For setting up Single Sign-On (SSO), please, refer to the
[OIDC Integration](/docs/operations/openid-connect-oidc-integration) guide,
which explains how QuestDB integrates with OAuth2/OIDC providers in general.
Although we cannot cover all OAuth2 providers, we also documented
[PingFederate](/docs/guides/active-directory-pingfederate)
and [Microsoft EntraID](/docs/guides/microsoft-entraid-oidc)
example setups. Other providers should be configured similarly.

### Step 5: Setting up replication

If you wish to use the replication features, continue with setting up the
object store and `server.conf` changes as detailed in the
[Database Replication](/docs/operations/replication) guide.

## Unsupported Migration Workflows

When a database is migrated from the Open Source to the Enterprise edition, the
database upgrades the state in each of the database tables to enable the new
features of the Enterprise edition, such as database replication.

Because of this, we only support an in-place edition migration.

:::warning

We do not support directly copying table data directories and files from an Open
Source installation to an Enterprise installation, as the required state for
Enterprise features would not be initialized and the database would not operate
correctly.

If you have a production instance of QuestDB Open Source and have already been 
testing the new features of the Enterprise edition on a second instance,
ensure that the two instances don't share any filesystem directories.
If you had activated the replication features on this second instance and want
to reuse the same object store location, you must first clear it to transfer
object store ownership to the new migrated database instance.

If you have a more complex migration scenario, please contact us and we'll be
happy to help with your specific setup.

:::
