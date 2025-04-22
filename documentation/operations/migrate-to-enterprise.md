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

### Step 1: Backup your data

Before you start the migration process, follow the instructions in the
[Backup and restore](/docs/operations/backup/) section to back up your QuestDB
installation. It is unlikely that you will need the restore point, but it is
a good idea to have it in case something goes wrong.

In short:

* Checkpoint the database:
  ```questdb-sql
  CHECKPOINT CREATE
  ```

* Back up the files, such as creating a `.tar` archive or taking an AWS EBS
  volume snapshot.


### Step 2: Identify the QuestDB Open Source base version

Each release of QuestDB Enterprise is based on a specific version of the open
source edition.

Consult the [release notes](https://questdb.com/release-notes/?type=enterprise)
of the Enterprise version you are migrating to, and identify the base Open
Source version.

For example, _QuestDB Enterprise 2.2.4_ is based on _QuestDB Open Source 8.2.3_.

### Step 3: Update your Open Source installation

Now update your Open Source installation to the base Open Source version
specified in the
[release notes](https://questdb.com/release-notes/?type=enterprise)
for your target Enterprise version.

You can do this by downloading the specific version from the
[Releases](https://github.com/questdb/questdb/releases) on GitHub.

Once downloaded, the upgrade process consists simply of restarting the database
with the new binaries _in place_.

### Step 4: Migrate to Enterprise

Once you have updated your Open Source installation to the base version, you
can now migrate to the Enterprise edition.

Stop the database and restart it with the Enterprise binaries _in place_.

The first time you start the database with the new binaries, the migration
process will kick in and ready the database state for the new features.

### Step 5: Set up TLS connection encryption

Prepare your server TLS certificates in PEM format and continue with the
[TLS Encryption](/docs/operations/tls/) guide.

:::info
If you don't have a TLS certificate yet, you can ask QuestDB to
generate a
[self-signed demo certificate](/docs/operations/tls/#demo-certificates).
:::

### Step 6: Set up user accounts and permissions


### Step 7: Setting up replication

If you wish to use the replication features, continue with setting up the
object store and `server.conf` changes as detailed in the
[Database Replication](/docs/operations/replication/) guide.

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
testing the new features of the Enterprise edition, delete all files and
settings from this test instance first. If you had activated the replication
features, this includes clearing out the object store.

If you have a more complex migration scenario, please contact us and we'll be
happy to help with your specific setup.

:::
