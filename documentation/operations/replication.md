---
title: Database replication operations
sidebar_label: Replication
description:
  Explains operational details for QuestDB replication. Provides a setup guide
  object storage, basic hot replication, and thorough configuration details.
---

import Screenshot from "@theme/Screenshot"

import { ConfigTable } from "@theme/ConfigTable"

import replicationConfig from "../configuration-utils/\_replication.config.json"

QuestDB Enterprise supports high availability through primary-replica
replication and point-in-time recovery.

This document will walk you through setup for database replication.

If the cluster is already running, enabling replication requires minimal steps:

1. Create and configure object storage for
   [Write Ahead Log (WAL)](/docs/concept/write-ahead-log/) files in AWS, Azure,
   or NFS
2. Enable a **primary** node and upload WAL files to the object storage
3. Take a data [Snapshot](/docs/operations/backup/) of the
   **primary** node
4. Configure a **replica** node or and restore via snapshot or allow sync via
   WAL files

If the cluster is new and not already running:

1. Create and configure object storage for
   [Write Ahead Log (WAL)](/docs/concept/write-ahead-log/) files in AWS, Azure,
   or NFS
1. Enable a **primary** node and upload WAL files to the object storage
1. Enable one or more replica nodes

Before you begin the setup process, consider reading
[Replication concepts](/docs/concept/replication/).

## Setup object storage

Choose where you intend to store replication data:

1. [Azure blob storage](/docs/operations/replication/#azure-blob-storage)
2. [Amazon S3](/docs/operations/replication/#amazon-aws-s3)
3. [NFS](/docs/operations/replication/#nfs)

Our goal is to build a string value for the `replication.object.store` key
within `server.conf`.

### Azure Blob Storage

Setup storage in Azure and retrieve values for:

- `STORE_ACCOUNT`
- `BLOB_CONTAINER`
- `STORE_KEY`

First, follow Azure documentation to
[create a Storage Account](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-create?tabs=azure-portal).

There are some important considerations.

For appropriate balance, be sure to:

- Select a geographical location close to the **primary** QuestDB node to reduce
  the network latency
- Choose optimal redundancy and performance options according to Microsoft
- Disable blob versioning

Keep your `STORE_ACCOUNT` value.

Next, set up
[Lifecycle Management](https://learn.microsoft.com/en-us/azure/storage/blobs/lifecycle-management-policy-configure?tabs=azure-portal)
for the blobs produced by replication. There are considerations to ensure
cost-effective WAL file storage. For further information, see the
[object store expiration policy](/docs/operations/replication/#snapshot-schedule-and-object-store-expiration-policy)
section.

After that,
[create a Blob Container ](https://learn.microsoft.com/en-us/azure/storage/blobs/quickstart-storage-explorer)to
be the root of your replicated data blobs.

It will will soon be referenced in the `BLOB_CONTAINER` variable.

Finally, save the
[Account Key](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-keys-manage?tabs=azure-portal).
It will be used to configure the QuestDB primary node as `STORE_KEY`.

In total, from Azure you will have retrieved:

- `STORE_ACCOUNT`
- `BLOB_CONTAINER`
- `STORE_KEY`

The value provided to `replication.object.store` is thus:

```conf
azblob::endpoint=https://${STORE_ACCOUNT}.blob.core.windows.net;container={BLOB_CONTAINER};root=${DB_INSTANCE_NAME};account_name=${STORE_ACCOUNT};account_key=${STORE_KEY};
```

The value of `DB_INSTANCE_NAME` can be any unique alphanumeric string, which
includes dashes `-`.

Be sure to use the same name across all the **primary** and **replica** nodes
within the replication cluster.

With your values, skip to the
[Setup database replication](/docs/operations/replication/#setup-database-replication)
section.

### Amazon AWS S3

Our goal is to setup AWS S3 storage and retrieve:

- `BUCKET_NAME`
- `AWS_REGION`
- `AWS_ACCESS_KEY` (Optional)
- `AWS_SECRET_ACCESS_KEY` (Optional)

First, create an S3 bucket as described in
[AWS documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html).
The name is our `BUCKET_NAME` & `AWS_REGION`. Prepare your `AWS_ACCESS_KEY` and
`AWS_SECRET_ACCESS_KEY` if needed, depending on how you manage AWS credentials.

There are some important considerations.

For appropriate balance, be sure to:

- Select a geographical location close to the **primary** QuestDB node to reduce
  the network latency
- Choose optimal redundancy and performance options according to Amazon
- Disable blob versioning

Finally,
[set up bucket lifecycle configuration policy ](https://docs.aws.amazon.com/AmazonS3/latest/userguide/how-to-set-lifecycle-configuration-intro.html)to
clean up WAL files after a period of time. There are considerations to ensure
that the storage of the WAL files remains cost-effective. For deeper background,
see the
[object storage expiration policy](/docs/operations/replication/#snapshot-schedule-and-object-store-expiration-policy)
section.

We have now prepared the following:

- `BUCKET_NAME`
- `AWS_REGION`
- `AWS_ACCESS_KEY` (Optional)
- `AWS_SECRET_ACCESS_KEY` (Optional)

And created a value for `replication.object.store`:

```conf
s3::bucket=${BUCKET_NAME};root=${DB_INSTANCE_NAME};region=${AWS_REGION};access_key_id=${AWS_ACCESS_KEY};secret_access_key=${AWS_SECRET_ACCESS_KEY};
```

The value of `DB_INSTANCE_NAME` can be any unique alphanumeric string, which
includes dashes `-`.

Be sure to use the same name across all the **primary** and **replica** nodes
within the replication cluster.

With your values, continue to the
[Setup database replication](/docs/operations/replication/#setup-database-replication)
section.

### NFS

Setup your NFS server and mount the shared file system on the **primary** and
any **replicas**. Make sure the user starting QuestDB has read and write
permissions for the shared mount.

There are some important considerations.

For appropriate balance, be sure to:

- Select a geographical location of the NFS server close to the **primary**
  QuestDB node to reduce the network latency
- Choose optimal redundancy and performance options

There are considerations to ensure cost-effective WAL file storage. For further
information, see the
[object store expiration policy](/docs/operations/replication/#snapshot-schedule-and-object-store-expiration-policy)
section.

Replication via NFS will use two folders, one for the WAL files, and one for
temporary — or scratch — files. The two folders will be created on **primary**'s
startup if they don't exist. It is **important** that both folders are under the
same NFS mount, as otherwise object writes might get corrupted.

The value provided to `replication.object.store` is thus:

```conf
fs::root=/mnt/nfs_replication/final;atomic_write_dir=/mnt/nfs_replication/scratch;
```

The example above uses `/mtn/nfs_replication` as the NFS mountpoint. Please
change accordingly on the **primary** and any **replicas** to match your local
configuration.

With your values, skip to the
[Setup database replication](/docs/operations/replication/#setup-database-replication)
section.

## Setup database replication

Set the following changes in their respective `server.conf` files:

1. Enable a **primary** node to upload to object storage

2. Set **replica(s)** to download from object storage

### Set up a primary node

| Setting                        | Description                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| **replication.role**           | Set to `primary` .                                                                               |
| **replication.object.store**   | Created based on provider specifications. The result of the above setup object storage sections. |
| **cairo.snapshot.instance.id** | Unique UUID of the primary node                                                                  |

After the node is configured for replication, restart QuestDB.

At this point, create a database [snapshot](/docs/reference/sql/snapshot/).

Frequent snapshots can alter the effectiveness of your replication strategy.

To help you determine the right snapshot, see the
[snapshot schedule](/docs/operations/replication/#snapshot-schedule-and-object-store-expiration-policy)
section.

Now that a primary is configured, next setup a replica - or two, or three - or
more!

### Set up replica node(s)

Create a new QuestDB instance.

Set `server.conf` properties:

| Setting                        | Value                                        |
| ------------------------------ | -------------------------------------------- |
| **replication.role**           | Set to `replica`.                            |
| **replication.object.store**   | The same string used in the **primary** node |
| **cairo.snapshot.instance.id** | Unique UUID of the replica node              |

:::note

Please do not copy `server.conf` files from the **primary** node when creating
the replica. Setting the same `replication.object.store` stream on 2 nodes and
enabling 2 nodes to act as **primary** will break the replication setup.

:::

After the blank replica database is created, restore the `db` directory folder
from the snapshot taken from the **primary** node. Then start the replica node.
The replica will download changes and will catch up with the **primary** node.

This concludes a walkthrough of basic replication.

For full configuration details, see the next section.

To learn more about the roadmap, architecture and topology types, see the
[Replication](/docs/concept/replication) concept page.

## Configuration

The following presents all available configuration and tuning options.

All replication configuration is kept in the same
[`server.conf`](/docs/configuration/) file as all other database settings.

:::note

These settings can be sensitive - especially within Azure.

Consider using environment variables.

For example, to specify the object store setting from an environment variable
specify:

```bash
export QDB_REPLICATION_OBJECT_STORE="azblob::DefaultEndPointsProtocol..."
```

:::

Once settings are changed, stop and restart the database.

Note that replication is performed by the database process itself.

There is no need to start external agents, register cron jobs or similar.

### Replication settings

> Read our in-depth [Replication tuning Guide](/docs/guides/replication-tuning/)
> for more information.

Some of these settings alter resource usage.

Replication is implemented using a set of worker threads for IO operations.

The defaults should be appropriate in most cases.

<ConfigTable rows={replicationConfig} />

## Snapshot schedule and object store expiration policy

Replication files are typically read by **replica** nodes shortly after upload
from the **primary** node. After initial access, these files are rarely used
unless a new **replica** node starts. To optimize costs, we suggest moving files
to cooler storage tiers using expiration policies after 1-7 days. These tiers
are more cost-effective for long-term storage of infrequently accessed files.

We recommend:

1. Set up periodic **primary** node snapshots on a 1-7 day interval
2. Keep [Write Ahead Log (WAL)](/docs/concept/write-ahead-log) files in the
   object store for at least 30 days

Taking snapshots every 7 days and storing WAL files for 30 days allows database
restoration within 23 days. Extending WAL storage to 60 days increases this to
53 days.

Ensure snapshot intervals are shorter than WAL expiration for successful data
restoration. Shorter intervals also speed up database rebuilding after a
failure. For instance, weekly snapshots take 7 times longer to restore than
daily ones due to the computational and IO demands of applying WAL files.

For systems with high daily data injection, daily snapshots are recommended.
Infrequent snapshots or long snapshot periods, such as 60 days with 30-day WAL
expiration, may prevent successful database restoration.

## Disaster Recovery

Deployed software can fail in a number of ways, some recoverable, and some unrecoverable.

In general, we can group them into a small matrix:

|         | recoverable     | unrecoverable                       |
|---------|-----------------|-------------------------------------|
| primary | restart primary | promote replica, create new replica |
| replica | restart replica | destroy and recreate replica        |

To successfully recover from serious failures, it is critical that you follow best practices and regularly [back up](../operations#backup)
your data.

### Network partitions

Temporary network partitions introduce delays between when data is written to the primary, and when it becomes available
for read in the replica. A temporary network partition is not necessarily a problem - for example, perhaps data can be
ingested into the primary, but the object-store is not available. In this case, the replicas will contain stale data,
and then catch-up when the primary reconnects and successfully uploads to the object store.

Permanent network partitions are not recoverable, and the [emergency primary migration](#emergency-primary-migration) flow should be followed.

### Instance crashes

An instance crash may be recoverable or unrecoverable, depending on the specific cause of the crash.
If the instance crashes during ingestion, then it is possible for transactions to be corrupted.
This will lead to a table suspension on restart. To recover in this case, you can skip the transaction,
and reload any missing data.

In the event that the corruption is severe, or confidence in the underlying instance is removed, you should follow the
[emergency primary migration](#emergency-primary-migration) flow.

### Disk or block storage failure

Disk failures can present in several forms, which may initially be hard to detect. Here are some possible symptoms:

1. High latency for reads and writes.
    - This could be a failing disk, which will need replacing
    - Alternatively, it could be caused by under-provisioned IOPS, and need upgrading.
2. Disk not available/unmounted
    - This could be a configuration issue between your server and storage
    - Alternatively, this could indicate a complete drive failure.
3. Data corruption reported by database (i.e. you see suspended tables)
    - This is usually caused by writes to disk partially or completely failing
    - This can also be caused by running out of disk space

As with an instance crash, the consequences can be far-reaching and not immediately clear in all cases.

To migrate to a new disk, follow the [emergency primary migration](#emergency-primary-migration) flow. When you create a new replica, you
can populate it with the latest snapshot you have taken, and then recover the rest using replicated WALs in the object
store.


### Flows


#### Scheduled primary migration

This flow should be used when you want to change your primary to another instance, but the primary has not failed.
The database can be started in a mode which prevents further ingestion, but allows replication. This means that you an
ensure that all outstanding data has been replicated before you start ingesting on a new primary instance.

- Ensure primary instance is still capable of replicating data  to the object store.
- Stop primary instance.
- Restart primary instance with `replication.role=primary_catchup_uploads`
- Wait for the instance to complete its uploads and exit with `code 0`.
- Then follow the [emergency primary migration](#emergency-primary-migration) flow.


#### Emergency primary migration

This flow should be used when you wish to discard a failed primary instance and move to a new one.

- Stop primary instance, and ensure it **cannot** restart.
- Stop the replica instance.
- Set `replication.role=primary` on the replica.
- Create a `_recovery_timestamp` file in your data directory (by default, `db`)
    - This file should contain either a `TIMESTAMP` value, or `latest`.
- Start the replica instance, which is now the new primary.
- Create a new replica instance to replace the promoted replica.

:::warning

Any data committed to the primary, but not yet replicated, will be lost. If the primary is not
completely failed, you can follow the [scheduled primary migration](#scheduled-primary-migration) flow
to ensure that all remaining data has been replicated before switching primary.

:::


## Multi-primary ingestion

[QuestDB Enterprise](/enterprise/) supports multi-primary ingestion, where
multiple primaries can write to the same database.

See the [Multi-primary ingestion](/docs/operations/multi-primary-ingestion/) page for
more information.
