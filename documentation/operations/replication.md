---
title: Replication setup guide
sidebar_label: Setup Guide
description:
  Step-by-step guide to setting up QuestDB Enterprise replication with object
  storage, primary and replica nodes.
---

import { ConfigTable } from "@theme/ConfigTable"
import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

import replicationConfig from "../configuration-utils/\_replication.config.json"

<EnterpriseNote>
  This guide covers setting up primary-replica replication.
</EnterpriseNote>

This guide walks you through setting up QuestDB Enterprise replication.

**Prerequisites:** Read the [Replication overview](/docs/concept/replication/)
to understand how replication works.

## Setup steps

1. Configure object storage (AWS S3, Azure Blob, GCS, or NFS)
2. Configure the **primary** node
3. Take a snapshot of the primary
4. Configure **replica** node(s)

## 1. Configure object storage

Choose your object storage provider and build the connection string for
`replication.object.store` in `server.conf`.

### AWS S3

Create an S3 bucket following
[AWS documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html).

**Recommendations:**
- Select a region close to your primary node
- Disable blob versioning
- Set up a
  [lifecycle policy](https://docs.aws.amazon.com/AmazonS3/latest/userguide/how-to-set-lifecycle-configuration-intro.html)
  to manage WAL file retention (see [Snapshot and expiration policies](#snapshot-and-expiration-policies))

**Connection string:**

```ini
replication.object.store=s3::bucket=${BUCKET_NAME};root=${DB_INSTANCE_NAME};region=${AWS_REGION};access_key_id=${AWS_ACCESS_KEY};secret_access_key=${AWS_SECRET_ACCESS_KEY};
```

`DB_INSTANCE_NAME` can be any unique alphanumeric string (dashes allowed). Use
the same value across all nodes in your replication cluster.

### Azure Blob Storage

Create a Storage Account following
[Azure documentation](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-create?tabs=azure-portal),
then create a Blob Container.

**Recommendations:**
- Select a region close to your primary node
- Disable blob versioning
- Set up
  [Lifecycle Management](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-configure?tabs=azure-portal)
  for WAL file retention

**Connection string:**

```ini
replication.object.store=azblob::endpoint=https://${STORE_ACCOUNT}.blob.core.windows.net;container=${BLOB_CONTAINER};root=${DB_INSTANCE_NAME};account_name=${STORE_ACCOUNT};account_key=${STORE_KEY};
```

### Google Cloud Storage

Create a GCS bucket, then create a service account with `Storage Admin` (or
equivalent) permissions. Download the JSON key and encode it as Base64:

```bash
cat <key>.json | base64
```

**Connection string:**

```ini
replication.object.store=gcs::bucket=${BUCKET_NAME};root=/;credential=${BASE64_ENCODED_KEY};
```

Alternatively, use `credential_path` to reference the key file directly.

### NFS

Mount the shared filesystem on all nodes. Ensure the QuestDB user has read/write
permissions.

**Important:** Both the WAL folder and scratch folder must be on the same NFS
mount to prevent write corruption.

**Connection string:**

```ini
replication.object.store=fs::root=/mnt/nfs_replication/final;atomic_write_dir=/mnt/nfs_replication/scratch;
```

## 2. Configure the primary node

Add to `server.conf`:

| Setting | Value |
|---------|-------|
| `replication.role` | `primary` |
| `replication.object.store` | Your connection string from step 1 |
| `cairo.snapshot.instance.id` | Unique UUID for this node |

Restart QuestDB.

## 3. Take a snapshot

Replicas are initialized from a snapshot of the primary's data. This involves
creating a backup of the primary and preparing it for restoration on replica
nodes.

See [Backup and restore](/docs/operations/backup/) for the full procedure.

:::tip
Set up regular snapshots (daily or weekly). See
[Snapshot and expiration policies](#snapshot-and-expiration-policies) for
guidance.
:::

## 4. Configure replica node(s)

Create a new QuestDB instance. Add to `server.conf`:

| Setting | Value |
|---------|-------|
| `replication.role` | `replica` |
| `replication.object.store` | Same connection string as primary |
| `cairo.snapshot.instance.id` | Unique UUID for this replica |

:::warning
Do not copy `server.conf` from the primary. Two nodes configured as primary
with the same object store will break replication.
:::

Restore the `db` directory from the primary's snapshot, then start the replica.
It will download and apply WAL files to catch up with the primary.

## Configuration reference

All replication settings go in `server.conf`. After changes, restart QuestDB.

:::tip
Use environment variables for sensitive settings:

```bash
export QDB_REPLICATION_OBJECT_STORE="azblob::..."
```
:::

<ConfigTable rows={replicationConfig} />

For tuning options, see the [Tuning guide](/docs/guides/replication-tuning/).

## Snapshot and expiration policies

WAL files are typically read by replicas shortly after upload. To optimize
costs, move files to cooler storage tiers after 1-7 days.

**Recommendations:**
- Take snapshots every 1-7 days
- Keep WAL files for at least 30 days
- Ensure snapshot interval is shorter than WAL expiration

Example: Weekly snapshots + 30-day WAL retention = ability to restore up to 23
days back. Daily snapshots restore faster but use more storage.

## Disaster recovery

### Failure scenarios

| Node | Recoverable | Unrecoverable |
|------|-------------|---------------|
| Primary | Restart | Promote replica, create new replica |
| Replica | Restart | Destroy and recreate |

### Network partitions

Temporary partitions cause replicas to lag, then catch up when connectivity
restores. This is normal operation.

Permanent partitions require [emergency primary migration](#emergency-primary-migration).

### Instance crashes

If a crash corrupts transactions, tables may suspend on restart. You can skip
the corrupted transaction and reload missing data, or follow the emergency
migration flow.

### Disk failures

Symptoms: high latency, unmounted disk, suspended tables. Follow the emergency
migration flow to move to new storage.

## Migration procedures

### Planned primary migration

Use when the current primary is healthy but you want to switch to a new one.

1. Stop the primary
2. Restart with `replication.role=primary-catchup-uploads`
3. Wait for uploads to complete (exits with code 0)
4. Follow emergency migration steps below

### Emergency primary migration

Use when the primary has failed.

1. Stop the failed primary (ensure it cannot restart)
2. Stop the replica
3. Set `replication.role=primary` on the replica
4. Create an empty `_migrate_primary` file in the installation directory
5. Start the replica (now the new primary)
6. Create a new replica to replace the promoted one

:::warning
Data committed to the primary but not yet replicated will be lost. Use planned
migration if the primary is still functional.
:::

### Point-in-time recovery

Restore the database to a specific historical timestamp.

1. Locate a snapshot from before your target timestamp
2. Create a new instance from the snapshot (do not start it)
3. Create a `_recover_point_in_time` file containing:
   ```ini
   replication.object.store=<source object store>
   replication.recovery.timestamp=YYYY-MM-DDThh:mm:ss.mmmZ
   ```
4. If using a snapshot, create a `_restore` file to trigger recovery
5. Optionally configure `server.conf` to replicate to a **new** object store
6. Start the instance

## Next steps

- [Multi-primary ingestion](/docs/operations/multi-primary-ingestion/) - Scale
  write throughput with multiple primaries
- [Tuning guide](/docs/guides/replication-tuning/) - Optimize replication
  performance
