---
title: Replication setup guide
sidebar_label: Setup Guide
description:
  Step-by-step guide to setting up QuestDB Enterprise replication with object
  storage, primary and replica nodes.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  This guide covers setting up primary-replica replication.
</EnterpriseNote>

This guide walks you through setting up QuestDB Enterprise replication.

**Prerequisites:** Read the [Replication overview](/docs/high-availability/overview/)
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

**Connection string:**

```ini
replication.object.store=s3::bucket=${BUCKET_NAME};root=${DB_INSTANCE_NAME};region=${AWS_REGION};access_key_id=${AWS_ACCESS_KEY};secret_access_key=${AWS_SECRET_ACCESS_KEY};
```

`DB_INSTANCE_NAME` can be any unique alphanumeric string (dashes allowed). Use
the same value across all nodes in your replication cluster.

:::tip[Using IAM roles]
If your instance has an IAM role attached (EC2 instance profile, EKS pod identity,
or ECS task role), you can omit the credentials:

```ini
replication.object.store=s3::bucket=${BUCKET_NAME};root=${DB_INSTANCE_NAME};region=${AWS_REGION};
```

QuestDB will automatically use the instance's IAM role for authentication.
:::

### S3-compatible stores

A store that implements the S3 API, such as MinIO, uses the `s3::` scheme with
the store's address in `endpoint`, as in the
[TLS example](#tls-with-a-private-or-self-signed-ca) below.

From QuestDB Enterprise 4.2.0, an S3-compatible store must support or ignore
`If-Match` and `If-None-Match` on `PutObject`. The primary sends these
conditional requests when it writes the replication index, `index.msgpack`:
`If-None-Match` to create it in an empty location, `If-Match` to replace it.
AWS S3, Azure Blob Storage, and Google Cloud Storage support them, and on an NFS
(`fs`) store the primary writes the index without them. On an S3-compatible
store that rejects them:

- A primary cannot start: QuestDB exits during startup.
- A replica cannot be promoted: `SWITCH ROLE TO PRIMARY` fails and leaves the
  node in the `UNKNOWN` state, see
  [Refusals and the torn state](/docs/high-availability/failover/#refusals-and-the-torn-state).
- Every [backup](/docs/operations/backup/) to the store fails, because backups
  write their own index the same way.

No setting turns these requests off. Before you upgrade, check the store's
documentation for conditional writes, or test the store: from a new instance on
QuestDB Enterprise 4.2.0 or later, run a first backup to it. That backup
creates its index and then replaces it, so if it completes, the store supports
or ignores both headers.

### Azure Blob Storage

Create a Storage Account following
[Azure documentation](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-create?tabs=azure-portal),
then create a Blob Container.

**Recommendations:**
- Select a region close to your primary node
- Disable blob versioning

**Connection string:**

```ini
replication.object.store=azblob::endpoint=https://${STORE_ACCOUNT}.blob.core.windows.net;container=${BLOB_CONTAINER};root=${DB_INSTANCE_NAME};account_name=${STORE_ACCOUNT};account_key=${STORE_KEY};
```

:::tip[Using Managed Identity]
If your instance has a Managed Identity assigned (Azure VM, AKS pod identity,
or Container Apps), you can omit the `account_key`:

```ini
replication.object.store=azblob::endpoint=https://${STORE_ACCOUNT}.blob.core.windows.net;container=${BLOB_CONTAINER};root=${DB_INSTANCE_NAME};account_name=${STORE_ACCOUNT};
```

QuestDB will automatically use the Managed Identity for authentication. Ensure
the identity has the **Storage Blob Data Contributor** role on the container.
:::

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

Alternatively, use `credential_path` to reference the key file directly, or
supply a pre-obtained static OAuth `token` to skip the token exchange
altogether. A static `token` is required when the store sits behind a private
or intercepting CA; see
[TLS with a private or self-signed CA](#tls-with-a-private-or-self-signed-ca).

:::tip[Using Workload Identity]
If your instance uses Workload Identity (GKE) or runs on a GCE VM with a service
account attached, you can omit the credentials entirely:

```ini
replication.object.store=gcs::bucket=${BUCKET_NAME};root=/;
```

QuestDB will automatically use Application Default Credentials for authentication.
:::

### NFS

Mount the shared filesystem on all nodes. Ensure the QuestDB user has read/write
permissions.

**Important:** Both the WAL folder and scratch folder must be on the same NFS
mount to prevent write corruption.

**Connection string:**

```ini
replication.object.store=fs::root=/mnt/nfs_replication/final;atomic_write_dir=/mnt/nfs_replication/scratch;
```

### TLS with a private or self-signed CA

By default, QuestDB trusts only the built-in Mozilla root certificates
when connecting to an object store over HTTPS. Public AWS S3, Azure Blob, and
GCS endpoints work out of the box, but a private or on-prem
S3/Azure/GCS-compatible store fronted by an internal CA, a self-signed
certificate, or a TLS-intercepting proxy fails the TLS handshake. Two optional
connection-string parameters add the trusted CA:

- `ca_cert_file`: path to a PEM file holding one or more CA root certificates to
  trust, in addition to the built-in roots. The file may hold a single
  certificate or a bundle.
- `ca_builtin_roots` (optional): `true` (default) or `false`. Set to `false` to
  trust only the certificates from `ca_cert_file` and drop the built-in roots.
  Valid only together with `ca_cert_file`.

```ini
replication.object.store=s3::bucket=${BUCKET_NAME};root=${DB_INSTANCE_NAME};region=${AWS_REGION};endpoint=https://minio.internal;ca_cert_file=/etc/ssl/private-ca.pem;
```

Both parameters are valid only for the HTTP-based backends (`s3`, `azblob`,
`gcs`) and are rejected for `fs` (NFS). They belong to the object store
connection string, so they work the same way in `backup.object.store` and
`cold.storage.object.store`. The file
is read and parsed at startup, so a missing or malformed PEM fails fast with an
`InvalidObjectStoreConfigurationException`.

:::caution

- **Point it at the CA, not the server certificate.** `ca_cert_file` must hold
  the CA certificate(s) that issued the store's certificate (the root plus any
  intermediates), not the store's own server certificate. Startup validation
  only checks that the PEM parses, so a server certificate passes validation but
  then fails every request with a certificate-trust error.
- **No `;` in the path.** The connection string is split on `;` with no escape,
  so a certificate path must not contain a `;`. A parameter with no `=` (for
  example, a path truncated at a `;`) is rejected at startup.
- **Data requests only.** The custom CA applies to object store data requests
  (read, write, list, delete). Dynamic credential and token fetches (S3
  IMDS/STS/assume-role and the GCS OAuth token endpoint) go through a separate
  client that always trusts the built-in roots. Stores that authenticate with
  static credentials (S3 `access_key_id` and `secret_access_key`, or Azure
  `account_key`) make no such fetch and are unaffected. A `gcs` store reached
  through a private or intercepting CA must therefore also be given a static
  OAuth `token`, otherwise its token fetch fails the handshake at runtime even
  though the configuration validates.

:::

## 2. Configure the primary node

Add to `server.conf`:

| Setting                      | Value                              |
| ---------------------------- | ---------------------------------- |
| `replication.role`           | `primary`                          |
| `replication.object.store`   | Your connection string from step 1 |
| `cairo.snapshot.instance.id` | Unique UUID for this node          |

Restart QuestDB.

## 3. Take a snapshot

Replicas are initialized from a snapshot of the primary's data. This involves
creating a backup of the primary and preparing it for restoration on replica
nodes.

See [Backup and restore](/docs/operations/backup/) for the full procedure.

:::tip
Set up regular snapshots (daily or weekly).
:::

## 4. Configure replica node(s)

Create a new QuestDB instance. Add to `server.conf`:

| Setting                      | Value                             |
| ---------------------------- | --------------------------------- |
| `replication.role`           | `replica`                         |
| `replication.object.store`   | Same connection string as primary |
| `cairo.snapshot.instance.id` | Unique UUID for this replica      |

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

For the full list of replication properties, see the
[Replication configuration](/docs/configuration/database-replication/) reference.

For tuning options, see the [Tuning guide](/docs/high-availability/tuning/).

## WAL data cleanup

Replicated WAL data accumulates in object storage over time. The **WAL
cleaner** runs on the primary node and automatically removes data that is no
longer needed, based on your backup and checkpoint history.

The cleaner is enabled by default and requires no configuration when backups
or checkpoint history are active. By default, it retains replication data
for the most recent 5 backups or checkpoints and deletes everything older.

See the [WAL Cleanup guide](/docs/high-availability/wal-cleanup/) for
configuration options, tuning, and troubleshooting.

## Next steps

- [Disaster recovery](/docs/high-availability/disaster-recovery/) - Failure
  scenarios and the migration procedures that recover from them
- [Tuning guide](/docs/high-availability/tuning/) - Optimize replication
  performance
- [Client failover](/docs/high-availability/client-failover/concepts/) -
  Configure your applications with a multi-host address list so they follow a
  primary promotion automatically. Replication moves the data; client failover
  keeps your clients connected to it.
