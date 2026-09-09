---
title: Configure the Kubernetes Operator
description:
  Configure QuestDB clusters, object storage, backup, replication, storage, and
  scheduling.
---

# Configuration

Use this page for the common choices. The generated
[API Reference](/docs/enterprise-kubernetes-operator/reference/api/) is the
source for every field, default, validation, and status property.

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

| Provider | Keys                                                                       |
| -------- | -------------------------------------------------------------------------- |
| S3       | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, optional `AWS_SESSION_TOKEN` |
| Azure    | `AZURE_STORAGE_KEY`                                                        |

The store, credentials Secret, and consuming cluster must be in the same
namespace. Prefer one cloud identity and least-privilege policy per tenant or
cluster. On EKS, IRSA is attached to the tenant namespace's `default`
ServiceAccount; it is for QuestDB pod S3 access, not image pulls.

### Prefix isolation

QuestDB has no instance-name key in object storage, so prefixes are its
isolation boundary:

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
replication it also creates `<name>-ro` for read-eligible replicas; when none
are eligible, `<name>-ro` falls back to the primary. Use the
[database operations](/docs/enterprise-kubernetes-operator/operations/database/#services-and-ports)
and [high-availability](/docs/enterprise-kubernetes-operator/high-availability/)
runbooks for routing and failover.

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
  image: registry.distribution.questdb.io/questdb:4.0.0-enterprise
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
It is separate from the Helm value `controllerManager.imagePullSecrets`, which
applies only to the operator image in `questdb-operator-system`. On EKS,
worker-node IAM can provide ambient ECR pull access; IRSA cannot.

## Scheduling and disruption budgets

`spec.scheduling` supports node selectors, affinity, tolerations, topology
spread, priority class, and an operator-managed PodDisruptionBudget (PDB).
Without an override, pods get soft hostname anti-affinity, soft zone spread, and
a PDB with `minAvailable: 1` for one instance or `instances-1` for HA.

The single-instance default intentionally blocks voluntary eviction. Before a
node drain, scale out, lower `spec.scheduling.podDisruptionBudget.minAvailable`,
or disable the PDB after accepting the availability risk. Follow the
[node maintenance runbook](/docs/enterprise-kubernetes-operator/operations/database/#node-maintenance-and-disruption-budgets).
Custom affinity or topology spread replaces the corresponding default rather
than merging with it.

## Wire protocols

`spec.protocols` configures optional wire-protocol behavior. Omit it and HTTP,
PGWire, and ILP stay on their defaults: HTTP/Web Console/QWP WebSocket on 9000,
plaintext PGWire on 8812, and ILP over TCP on 9009.

### PGWire TLS

PGWire TLS is selected at cluster creation. If `spec.protocols.pgwire.tls` is
absent when the cluster is created, PGWire stays plaintext for that cluster's
lifetime. If the block is present at creation, the same setting enables TLS on
QuestDB and on every operator SQL connection for the cluster's lifetime. Adding
or removing the TLS block later is rejected in v0.2.1; the operator never
retries over plaintext.

```yaml
spec:
  protocols:
    pgwire:
      tls:
        certificateSecret:
          name: prod-pgwire-tls
        # Defaults to <cluster>-rw.<namespace>.svc
        # serverName: database.example.com
        # Development only: encryption without certificate/hostname verification.
        # insecureSkipVerify: true
```

The `certificateSecret` must be in the same namespace as the `QuestDBCluster`.
It may be type `kubernetes.io/tls` or `Opaque` and must contain `tls.crt` and
`tls.key`; optional `ca.crt` supplies additional trust roots for the operator.
`tls.crt` should include the leaf followed by intermediates. Cert-manager is
optional: the operator does not issue, renew, or rotate these certificates.

By default, verified operator SQL uses `<cluster>-rw.<namespace>.svc` as both
the certificate DNS identity and SNI. Strict mode checks trust, hostname,
validity period, and server-auth usage. `insecureSkipVerify` keeps traffic
encrypted but disables certificate and hostname authentication; use it only for
development and expect a Warning event.

Changing the Secret name or server certificate material safely rolls the
database Pods. Changing only `ca.crt`, `serverName`, or `insecureSkipVerify`
changes operator-client verification without rolling Pods. For CA rollover, make
old and new roots trusted at the same time until the Secret update and any Pod
rollout have converged.

PGWire TLS does not enable TLS on HTTP, minimal HTTP, ILP, QWP, or the Web
Console, and it does not add client-certificate/mTLS authentication.

### QWP UDP

```yaml
spec:
  protocols:
    qwp:
      udp:
        enabled: true
```

| Field                            | Default | Effect                                                                            |
| -------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `spec.protocols.qwp.udp.enabled` | `false` | Serves the [QWP UDP receiver](/docs/configuration/qwp/#qwpudpbindto) on 9007/UDP. |

Enabling it opens 9007/UDP on the pod and publishes it on `<name>` and
`<name>-rw`. It is deliberately **not** published on `<name>-ro`: QWP UDP is
ingest-only, so a datagram aimed at a replica is discarded, and because the
transport is fire-and-forget nothing is returned to say so.

Two properties are worth knowing before you enable it:

- **The receiver is unauthenticated.** QWP authenticates on the WebSocket
  upgrade request, and UDP has no upgrade, so anything that can reach 9007 can
  write. Restrict it with a NetworkPolicy.
- **Delivery is fire-and-forget.** It neither acknowledges writes nor applies
  backpressure, and is intended for metrics workloads where occasional message
  loss is acceptable. Use the WebSocket transport for reliable ingestion.

QuestDB Enterprise 4.0.0 ships the QWP UDP receiver. The operator writes the
`qwp.udp.*` keys only while the receiver is enabled, so a cluster that leaves it
off carries no trace of it.

There is no setting for QWP over WebSocket. Ingestion (`/write/v4`) and
streaming query results (`/read/v1`) are served by the HTTP server on port 9000
and share its network settings, so they are available on every cluster.

Changing `spec.protocols` within the same transport mode can roll affected pods.

### Database ingress isolation

The operator does not install a tenant/database NetworkPolicy automatically. If
your CNI enforces NetworkPolicy, add a reviewed policy before exposing tenants.
Direct Pod IP access can otherwise reach the unauthenticated minimal HTTP server
on 9003 even though that port is not published on Services.

This example shows the intended shape. Adjust namespace and application labels
for your cluster and test kubelet probes with your CNI before relying on it:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: questdb-database-ingress
  namespace: <tenant-namespace>
spec:
  podSelector:
    matchLabels:
      questdb.io/cluster: <cluster-name>
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: questdb-operator-system
          podSelector:
            matchLabels:
              control-plane: controller-manager
      ports:
        - protocol: TCP
          port: 8812
        - protocol: TCP
          port: 9003
    - from:
        - namespaceSelector:
            matchLabels:
              metrics: enabled
      ports:
        - protocol: TCP
          port: 9003
    - from:
        - namespaceSelector:
            matchLabels:
              questdb-client: enabled
      ports:
        - protocol: TCP
          port: 9000
        - protocol: TCP
          port: 8812
        - protocol: TCP
          port: 9009
        # Include only when spec.protocols.qwp.udp.enabled is true.
        - protocol: UDP
          port: 9007
```

Customer-managed Ingresses, Gateways, LoadBalancers, and service meshes can
source-NAT traffic; review those source addresses separately. QWP UDP remains
unauthenticated when enabled.

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

The `qwp.udp.*` receiver keys are also operator-owned: `qwp.udp.enabled` and
`qwp.udp.bind.to` are set through [`spec.protocols.qwp.udp`](#qwp-udp), and
`qwp.udp.unicast` and `qwp.udp.join` are rejected because multicast cannot be
reached through the unicast `ClusterIP` the operator publishes. The remaining
`qwp.udp.*` tuning keys — commit interval, buffer sizes, thread affinity — stay
available.

Keys in both `spec.config` and `spec.replication.config` must match
`^[A-Za-z0-9._-]+$`. Values cannot contain line separators. Use
`spec.replication.config` for supported replication tuning. It rejects the same
operator-owned QWP keys as `spec.config`: both maps are merged into one
`server.conf`, so a key owned in only one of them would not be owned at all.

## Changes and immutable fields

Changes to the image, image pull Secrets, resources, engine configuration,
protocol fields, or pod scheduling can roll affected Pods. Ordinary rollouts are
serialized: replicas roll in serial order before the primary, and at most one
ordinary drift delete is attempted per instanceset reconcile. The controller may
hold a rollout while topology, PVC usability, peer readiness, node health, or
read-route safety is not proven. Before deleting the only `ro-ready` replica, it
first adds the primary as an overlapping Service selector candidate; this is not
an EndpointSlice acknowledgement, connection-draining protocol, or zero-gap
guarantee. A singleton still has read/write downtime while its only Pod
restarts.

### Rotate static object-store credentials safely

1. Make the old and new provider credentials valid at the same time.
2. Update the same-namespace Kubernetes Secret.
3. Allow the manager's roughly two-minute resync plus the serialized Pod rollout
   to converge.
4. Verify expected Pod UIDs/restarts and `BackupHealthy`/`ReplicationHealthy`.
5. Revoke the old credential only after convergence.

Immediate provider-side revocation can interrupt in-flight engine object-store
I/O even though the operator preserves the single-writer gate.

Important immutable choices include:

- `spec.objectStoreRef` once set;
- `spec.storage.storageClassName`;
- `spec.bootstrap` in presence and value;
- `spec.protocols.pgwire.tls` in presence;
- `spec.replication.root` in presence and value; and
- `QuestDBObjectStore.spec.provider`.

Storage size is expand-only. For exact transition rules and less common fields,
use the
[generated API Reference](/docs/enterprise-kubernetes-operator/reference/api/)
rather than copying the full schema from this guide.
