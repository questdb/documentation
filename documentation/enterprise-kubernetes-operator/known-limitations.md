---
title: Kubernetes Operator known limitations
description:
  Review supported platforms, versions, lifecycle constraints, and current
  Kubernetes Operator limitations.
---

# Known limitations

Support is limited to a fixed platform matrix. These behaviors require
operational planning.

## Availability and promotion

### A singleton is not highly available

A one-instance cluster has no replica to promote. On an unreachable node, the
operator does not create a second pod while the old writer might still run.
Recovery waits for safe node/volume recovery or human action. Use store-backed
replication before an incident; see
[Scale out](/docs/enterprise-kubernetes-operator/operations/database/#scale-out).

### Singleton drain is blocked by default

The default PodDisruptionBudget has `minAvailable: 1`, so voluntary drain of the
singleton waits indefinitely. Before maintenance, scale out, lower
`minAvailable`, or disable the PDB after accepting downtime. See
[Node maintenance](/docs/enterprise-kubernetes-operator/operations/database/#node-maintenance-and-disruption-budgets).

### Failover is never automatic

For an established replicated/object-store-backed cluster, the operator
recreates a lost primary only when it can preserve the same PVC identity safely.
Primary PVC loss fences that primary and sets `PromotionRequired`; a human must
recover the storage before a lossless `Planned` cutover, or select a replica and
explicitly accept `Emergency` loss when the old primary cannot be drained. A
standalone cluster has no replicated-primary loss guard and no promotion target:
PVC loss can recreate it on fresh empty storage, so recovery is a restore from
backup rather than failover. See
[Promotion and failover](/docs/enterprise-kubernetes-operator/high-availability/#promotion-and-failover).

### Emergency promotion loses unreplicated writes

`Emergency` skips the old-primary drain. Any write not uploaded and replayed is
lost. A client connected directly to the old pod can briefly receive successful
acknowledgements while that pod discovers it no longer owns the stream; those
writes are also discarded. Use `<name>-rw`, stop/repoint writers, and treat
Emergency as explicit data-loss acceptance.

Increasing `replication.primary.keepalive.interval` lengthens this
stale-direct-client window. Leave its 10-second default unless QuestDB advises
otherwise.

### Promotion can be unbounded

A live but hung final upload can hold `Draining`: the operator cannot
distinguish slow progress from a wedged upload. After the target is shaped,
`Promoting` has no timeout and waits until it serves. Deleting during either
phase does not abort; a finalizer retains the `QuestDBPromotion` while work
continues. Diagnose the database pod and contact support rather than
force-removing the audit/control object. See
[If promotion stalls or fails](/docs/enterprise-kubernetes-operator/high-availability/#if-promotion-stalls-or-fails).

## Backup, restore, and migration

### There is no on-demand backup API

QuestDB Enterprise runs backups from its in-engine schedule. The operator
configures and observes it; there is no Kubernetes CronJob or force-backup
request. Status can lag the engine observation. See
[Backup and restore](/docs/enterprise-kubernetes-operator/operations/backup-restore/).

### The operator cannot pre-validate the PITR window

The operator does not read the object store, so it cannot pre-check whether a
PITR target is still retained. On supported QuestDB Enterprise 4.0.0, an
older-than-retained target fails startup and surfaces as
`RecoveryFailed=True/RestoreError`. Because `spec.bootstrap` is immutable,
delete the failed destination safely and create a fresh cluster with a valid
target. See
[Point-in-time recovery](/docs/enterprise-kubernetes-operator/operations/backup-restore/#point-in-time-recovery-pitr).

### Follower cutover cannot see WAL that was never uploaded

Migration gates observe the object store, not the source disk. A normal source
shutdown can leave an invisible local tail. Run the required source
`primary-catchup-uploads` completion step or accept that tail's loss with
Emergency mode.

### A quiet source is not proof of a stopped source

The follower gate can observe that transactions stopped advancing, but an idle
source process can look the same. The engine safely refuses takeover while the
source still owns the stream (`SourceStillOwnsStore`). Fully stop and
decommission the source as described in
[Migration](/docs/enterprise-kubernetes-operator/high-availability/#migrate-an-existing-questdb-onto-the-operator).

## Storage and networking

### PGWire TLS protects only PGWire

`spec.protocols.pgwire.tls` enables TLS for PGWire and the operator's own SQL
connections when selected at cluster creation. It does not add TLS for HTTP/Web
Console, minimal HTTP metrics, ILP, QWP, or client-certificate/mTLS
authentication. Existing plaintext clusters cannot enable PGWire TLS in place in
v0.2.1; create a new TLS-enabled cluster when that transport change is required.

### Database Pod network isolation is opt-in

The operator publishes ClusterIP Services for client ports, but direct Pod IP
access can still reach Pod-only 9003 unless your CNI policy blocks it. No tenant
database NetworkPolicy is installed automatically. Test any custom policy with
your CNI and kubelet probe behavior.

### The operator never cleans object storage

Deleting clusters, PVCs, or the operator never deletes backup or replication
objects. Inventory and remove cloud objects separately under customer policy.
The operator does not create, list, read, or delete the bucket/container.

### Database Services are ClusterIP only

The operator reconciles `<name>-rw` and `<name>-ro` as ClusterIP and `<name>` as
headless. Use temporary port-forwarding or a separate customer-managed Ingress,
Gateway, or LoadBalancer. Do not mutate operator-owned Service types.

## Supported platforms and versions

| Platform   | Tested Kubernetes | Tested QuestDB Enterprise |
| ---------- | ----------------- | ------------------------- |
| Amazon EKS | 1.31–1.36         | 4.0.0                     |
| Azure AKS  | 1.33–1.36         | 4.0.0                     |

Other Kubernetes distributions, versions, CSI/fsGroup behavior, and QuestDB
versions are untested. They are not blocked by admission.

Google Cloud Storage is rejected in this release.
`QuestDBObjectStore.spec.provider` supports the schema value `GCS`, but
admission rejects it because only S3 on EKS and Azure Blob on AKS have been
validated.

## API lifecycle

The API is `questdb.io/v1alpha1` and can change incompatibly between releases.
Read release notes and migration requirements before upgrades or rollback. Only
the latest release receives fixes; there are no backports. See
[Operator upgrades](/docs/enterprise-kubernetes-operator/operations/operator/#upgrade-the-operator)
and [Support](/docs/enterprise-kubernetes-operator/support/).
