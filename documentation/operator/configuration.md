---
title: Configure the Kubernetes Operator
description: Configure QuestDB clusters, object storage, backup, replication, storage, and scheduling.
---

# Configuration

Use this page for the common choices. The generated
[API Reference](/docs/operator/reference/api/) is the source for every field, default,
validation, and status property.

## Object storage

`QuestDBObjectStore` is namespaced configuration for an existing S3 bucket or
Azure Blob container. It has no controller. The operator never creates, lists,
reads, or deletes objects and needs no cloud permissions; QuestDB pods perform
all object-store I/O.

```yaml
apiVersion: questdb.io/v1alpha1
kind: QuestDBObjectStore
metadata:
  name: questdb-store
spec:
  provider: S3
  s3:
    bucket: my-questdb-bucket
    region: eu-west-1
    # Omit for pod ambient identity, such as EKS IRSA.
    credentialsSecret:
      name: s3-credentials
```

```yaml
apiVersion: questdb.io/v1alpha1
kind: QuestDBObjectStore
metadata:
  name: questdb-store
spec:
  provider: Azure
  azure:
    accountName: mystorageaccount
    container: questdb
    credentialsSecret:
      name: azure-credentials
```

Static credential Secrets use these keys:

| Provider | Keys |
| --- | --- |
| S3 | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN` |
| Azure | `AZURE_STORAGE_KEY` |

The store, credentials Secret, and consuming cluster must be in the same
namespace. Prefer one cloud identity and least-privilege policy per tenant or
cluster. On EKS, IRSA is attached to the tenant namespace's `default`
ServiceAccount; it is for QuestDB pod S3 access, not image pulls.

### Prefix isolation

QuestDB has no instance-name key in object storage, so prefixes are its isolation
boundary:

- `spec.backup.root` defaults to `backup/`. Give each cluster a distinct backup
  root when clusters share a bucket or container.
- `spec.replication.root` defaults to the identity-scoped
  `db/<namespace>/<cluster>/`. Leave it unset unless deliberately adopting an
  existing WAL stream.

A provider-level `root` on `QuestDBObjectStore` does **not** add a base prefix;
the per-use backup or replication root overrides it. Scope cloud permissions to
the effective per-use prefixes.

## Backup and HA

Backups run inside QuestDB Enterprise on the primary. Enabling backup requires
`objectStoreRef` and a schedule:

```yaml
spec:
  objectStoreRef:
    name: questdb-store
  backup:
    enabled: true
    schedule: "0 * * * *"
    # timezone: UTC       # default
    # retention: 5        # default
    # root: backup/       # default
```

`spec.backup` absent means no backup. Watch `BackupHealthy` and
`status.backup.lastBackup`; configuration alone is not proof that an object was
written.

For HA, set `instances` above 1 only after a successful seed backup. HA requires
`objectStoreRef`, enabled scheduled backup, a completed backup, and
`instances > 1`. `spec.replication` is optional: omit it for the identity-scoped
WAL root, default WAL cleaner, no seed pin, and no lag gate. Add it only for
tuning:

```yaml
spec:
  instances: 3
  replication:
    maxLagTxns: 1000
```

The operator creates `<name>-rw` for the current primary. For store-backed
replication it also creates `<name>-ro` for read-eligible replicas; when none are
eligible, `<name>-ro` falls back to the primary. Use the [database
operations](/docs/operator/operations/database/#services-and-ports) and
[high-availability](/docs/operator/high-availability/) runbooks for routing and failover.

The WAL cleaner is enabled by default. Do not disable it unless another process
owns replication-WAL retention; otherwise WAL grows without bound.

## Storage

Each instance receives its own persistent volume:

```yaml
spec:
  storage:
    storageClassName: gp3
    size: 100Gi
  pvcRetentionPolicy: Retain
```

Use a CSI StorageClass with `ReadWriteOnce`, `fsGroup` support, and
`allowVolumeExpansion: true`. Do not use `ReadWriteOncePod`: supported cloud CSI
drivers do not apply the required non-root ownership in that mode. Size may only
increase. `pvcRetentionPolicy` defaults to `Retain` for removed replica PVCs;
`Delete` reclaims them. The primary PVC is never deleted by scale-down.

## Resources and private images

Set a firm memory budget with equal request and limit. A CPU limit is optional:

```yaml
spec:
  image: registry.distribution.questdb.io/questdb:3.3.4-enterprise
  imagePullSecrets:
    - name: questdb-registry
  resources:
    requests:
      cpu: "1"
      memory: 4Gi
    limits:
      memory: 4Gi
```

`spec.imagePullSecrets` names Secrets in the tenant namespace for database pods.
It is separate from the Helm value
`controllerManager.imagePullSecrets`, which applies only to the operator image
in `questdb-operator-system`. On EKS, worker-node IAM can provide ambient ECR
pull access; IRSA cannot.

## Scheduling and disruption budgets

`spec.scheduling` supports node selectors, affinity, tolerations, topology spread,
priority class, and an operator-managed PodDisruptionBudget (PDB). Without an
override, pods get soft hostname anti-affinity, soft zone spread, and a PDB with
`minAvailable: 1` for one instance or `instances-1` for HA.

The single-instance default intentionally blocks voluntary eviction. Before a
node drain, scale out, lower `spec.scheduling.podDisruptionBudget.minAvailable`,
or disable the PDB after accepting the availability risk. Follow the [node
maintenance runbook](/docs/operator/operations/database/#node-maintenance-and-disruption-budgets).
Custom affinity or topology spread replaces the corresponding default rather
than merging with it.

## Extra engine options

`spec.config` passes `server.conf` key/value strings to QuestDB. Operator-owned
authentication, role, snapshot identity, health-auth, and TLS keys are rejected.
Object-store keys are **not** rejected, but operator-provided primary
`backup.object.store` and `replication.object.store` settings use the engine's
`_FILE` mechanism and take precedence.

Never put access keys, passwords, or credential-bearing connection strings in
`spec.config`: the custom resource and rendered ConfigMap are plaintext.
Additional backup destinations (`backup.object.store.1` through `.9`) and
`cold.storage.object.store` are suitable only for credential-free,
ambient-identity settings until a Secret-backed mechanism is available.

Use `spec.replication.config` for supported replication tuning. Values cannot
contain line separators.

## Changes and immutable fields

Changes to the image, resources, engine configuration, image pull Secrets, or
pod scheduling roll affected pods. A primary roll remains single-writer-safe but
briefly interrupts writes. Plan these as disruptive changes; do not combine an
unrelated credential rotation with routine reconciliation.

Important immutable choices include:

- `spec.objectStoreRef` once set;
- `spec.storage.storageClassName`;
- `spec.bootstrap` in presence and value;
- `spec.replication.root` in presence and value; and
- `QuestDBObjectStore.spec.provider`.

Storage size is expand-only. For exact transition rules and less common fields,
use the [generated API Reference](/docs/operator/reference/api/) rather than copying the full
schema from this guide.
