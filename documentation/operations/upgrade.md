---
title: Upgrade QuestDB
sidebar_label: Upgrade QuestDB
description:
  How to upgrade QuestDB to a newer version using Docker or binaries, for both
  open source and enterprise editions.
---

Upgrading QuestDB to a newer version requires replacing the server binary (or
pulling a new Docker image) and restarting the process. Your existing data
directory stays in place. This applies to both QuestDB Open Source and QuestDB
Enterprise.

:::info Looking for a fresh install?
If this is your first time setting up QuestDB, see the
[Quick start](/docs/getting-started/quick-start/) guide instead.
:::

## Before you upgrade

1. **Read the [release notes](https://questdb.com/release-notes/).** QuestDB is
   generally backwards compatible, but breaking changes do occur and are
   documented in the release notes.

2. **Back up your data.** On first startup, the new version may automatically
   migrate internal metadata. Once this happens, rolling back to the previous
   version may produce errors. Create a backup or snapshot before upgrading,
   especially for production instances. See
   [Backup and restore](/docs/operations/backup/) for details.

## Upgrade steps

### Docker

Pull the latest image and restart the container, pointing to the same data
volume:

```shell
docker pull questdb/questdb:latest
```

Then recreate your container with the new image, using the same volume mount for
your QuestDB root directory:

```shell
docker stop questdb
docker rm questdb
docker run -d --name questdb \
  -p 9000:9000 -p 9009:9009 -p 8812:8812 \
  -v /path/to/questdb-data:/var/lib/questdb \
  questdb/questdb:latest
```

Replace `/path/to/questdb-data` with the path to your existing data directory.

### Binaries

1. Stop the running QuestDB process.
2. Download the new binary from the
   [GitHub releases page](https://github.com/questdb/questdb/releases) (or
   build from source).
3. Replace the old binary with the new one.
4. Start QuestDB, pointing to the same root directory.

## QuestDB Enterprise

:::tip QuestDB Enterprise BYOC
If you are a QuestDB Enterprise BYOC customer, upgrades are managed for you. See
[QuestDB Enterprise BYOC](#questdb-enterprise-byoc) below.
:::

The upgrade process for Enterprise is identical: replace the binary or pull the
new image, then restart.

The difference is how you obtain the new version:

- **Binaries**: download from the SFTP or distribution channel provided by
  QuestDB during onboarding.
- **Docker**: pull from the Enterprise ECR registry that was whitelisted for your
  AWS account.

If you are unsure where to get the latest Enterprise version, contact
[support@questdb.com](mailto:support@questdb.com).

### Replication: upgrade order

When running QuestDB Enterprise with replication, **upgrade all replicas before
upgrading the primary**.

The primary may write WAL segments containing new metadata formats to the object
store. If a replica running an older version encounters metadata it does not
recognize, it will error. Upgrading replicas first ensures they can handle any
new metadata the primary produces after its upgrade.

### QuestDB Enterprise BYOC

For QuestDB Enterprise BYOC customers, QuestDB manages the upgrade process. The
QuestDB team will reach out to coordinate when a new version is available. If
you would like to upgrade sooner, contact
[support@questdb.com](mailto:support@questdb.com).
