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

TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO

### Step 5: Setting up replication

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
testing the new features of the Enterprise edition on a second instance,
ensure that the two instances don't share any filesystem directories.
If you had activated the replication features on this second instance and want
to reuse the same object store location, you must first clear it to transfer
object store ownership to the new migrated database instance.

If you have a more complex migration scenario, please contact us and we'll be
happy to help with your specific setup.

:::
