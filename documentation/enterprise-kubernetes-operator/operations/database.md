---
title: Database operations
description:
  Operate, scale, resize, maintain, and delete Operator-managed QuestDB
  clusters.
---

# Database operations

Examples use `<name>` and `<namespace>`. Status is trustworthy only after the
controller has observed the current spec.

## Check database health

Check generation freshness first, then conditions. `status.phase` is only a
human-readable summary.

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='generation={.metadata.generation}{" observedGeneration="}{.status.observedGeneration}{" phase="}{.status.phase}{"\n"}'
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{range .status.conditions[*]}{.type}{"="}{.status}{" reason="}{.reason}{" observed="}{.observedGeneration}{" message="}{.message}{"\n"}{end}'
```

Do not act on old conditions while `.metadata.generation` differs from
`.status.observedGeneration`. For an ordinary writable cluster, writer readiness
requires all four signals: current generation, `Available=True/PrimaryReady`,
`Progressing=False/Settled`, and `WriteHealthy=True/Healthy`. `Available=True`
alone can mean only that a replica or a read-serving primary is available.
`WriteHealthy=False/PrimarySuspended` names the impaired WAL table or tables in
its message; reads and writes to other tables can remain available.
`WriteHealthy=True` reports the latest `wal_tables()` observation. It does not
perform a synthetic write and does not guarantee free disk capacity, so retain
application write probes and storage monitoring where those guarantees are
required.

An intentional replica-only follower is the exception: no primary is correct, so
`WriteHealthy` is omitted rather than reported healthy. Require current
generation, `phase=Following`, `status.replication.following=true`, the expected
`readyInstances`, and an appropriate `ReplicationHealthy` follower result.
`True/FollowingExternalSource` reports observed progress; a quiet source may
report `Unknown/StreamNotDetermined`, which is acceptable only after confirming
the source identity and roots. Treat `ReplicationHealthy=False` as unhealthy.

```sh
kubectl get questdbcluster <name> -n <namespace> -o wide
kubectl get pods -n <namespace> -l questdb.io/cluster=<name> \
  -L questdb.io/instance,questdb.io/role -o wide
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name> \
  -L questdb.io/role,questdb.io/bootstrap -o wide
```

## Services and ports

| Service     | Purpose                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<name>-rw` | Current primary. Use for writes and administration.                                                                                                                  |
| `<name>-ro` | Created for store-backed replication. Routes to qualified replicas, but falls back to the primary when no replica qualifies. It is **not** strict replica isolation. |
| `<name>`    | Headless, internal identity/DNS service. It publishes unready addresses and must not be used as a client availability endpoint.                                      |

| Port     | Scope                                                                   |
| -------- | ----------------------------------------------------------------------- |
| 9000/TCP | Published on database Services                                          |
| 8812/TCP | Published on database Services; optional TLS chosen at cluster creation |
| 9009/TCP | Published on database Services                                          |
| 9003/TCP | Always on Pods for kubelet/operator health and metrics; not on Services |
| 9007/UDP | Published on headless and `<name>-rw` only when enabled                 |

QWP over WebSocket has no port of its own. Ingestion (`/write/v4`) and streaming
query results (`/read/v1`) are served by the HTTP server on 9000 and share its
network settings, so they are available wherever 9000 is.

Existing Service-based database metrics scrapers must move to Pod discovery or a
`PodMonitor` that targets the named `metrics` port on QuestDB Pods. A Service
port-forward to 9003 no longer works.

The QWP UDP receiver is off by default. Enable it with
[`spec.protocols.qwp.udp.enabled`](/docs/enterprise-kubernetes-operator/configuration/#qwp-udp);
until then, port 9007 is neither opened on the pod nor published on any Service.
It is not published on `<name>-ro`.

The operator owns these Services and reconciles them as `ClusterIP` (the
identity Service is headless). For temporary access, use port-forwarding. For
durable external access, create a separate customer-managed Ingress, Gateway, or
LoadBalancer that targets the operator Service. Do not mutate the operator-owned
Service type.

## Connect

Find the admin Secret without printing its value:

```sh
ADMIN_SECRET="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.status.adminSecretName}')"
kubectl get secret "$ADMIN_SECRET" -n <namespace> \
  -o custom-columns='NAME:.metadata.name,CREATED:.metadata.creationTimestamp'
```

When an administrator explicitly needs the credential, load it into the
environment without echoing it and clear it after use:

```sh
ADMIN_PASSWORD="$(kubectl get secret "$ADMIN_SECRET" -n <namespace> \
  -o jsonpath='{.data.password}' | base64 -d)"

kubectl port-forward -n <namespace> service/<name>-rw 8812:8812 \
  >/tmp/questdb-pgwire-port-forward.log 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null; unset ADMIN_PASSWORD' EXIT
sleep 2
PGPASSWORD="$ADMIN_PASSWORD" psql -h 127.0.0.1 -p 8812 -U admin -d qdb
kill "$PF_PID"
unset ADMIN_PASSWORD
trap - EXIT
```

For a TLS-enabled cluster whose certificate uses the default Service identity,
keep the same port-forward but give `psql` both the certificate identity and the
local address:

```bash
PGPASSWORD="$ADMIN_PASSWORD" psql \
  "host=<name>-rw.<namespace>.svc hostaddr=127.0.0.1 port=8812 user=admin dbname=qdb sslmode=verify-full sslrootcert=/secure/path/ca.crt"
```

`host` supplies the certificate identity and SNI; `hostaddr` directs the
connection to the local tunnel.

Use `service/<name>-ro` only for read-only traffic that can tolerate primary
fallback. To access the Web Console temporarily, forward `service/<name>-rw`
from local port 9000 and stop the process after the session.

## Make mutable changes safely

Changes to `spec.image`, `spec.imagePullSecrets`, `spec.resources`,
`spec.config`, replication tuning, protocol fields within their allowed mode, or
scheduling recreate affected pods. Ordinary rollout is serialized: replicas roll
in serial order before the primary, and at most one ordinary delete is attempted
per instanceset reconcile. The operator may hold a rollout for exact topology,
usable PVCs, healthy peers, node readiness, or read-route safety. A rolling
change remains single-writer-safe, but recreating the primary can briefly
interrupt writes; a singleton has read/write downtime while its only Pod
restarts. Before deleting the only `ro-ready` replica, the operator first adds
the primary as an overlapping Service-selector candidate. That overlap is not an
EndpointSlice acknowledgement, connection drain, or zero-gap guarantee.

### Before you start

1. For an ordinary writable cluster, confirm current generation,
   `Available=True/PrimaryReady`, `Progressing=False/Settled`, and
   `WriteHealthy=True/Healthy`. `Available=True` alone is not writer readiness.
2. For an intentional follower, instead confirm current generation,
   `phase=Following`, `status.replication.following=true`, the expected ready
   count, and an appropriate non-failing follower `ReplicationHealthy` result as
   described above.
3. Save the current spec.
4. Make one logical change at a time.

```sh
kubectl get questdbcluster <name> -n <namespace> -o yaml \
  > /secure/path/<name>-before.yaml
```

### Change and watch

Apply a reviewed manifest or a narrow patch. This example changes an engine
setting:

```sh
kubectl patch questdbcluster <name> -n <namespace> --type merge \
  -p '{"spec":{"config":{"cairo.max.uncommitted.rows":"500000"}}}'

GEN="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.metadata.generation}')"
for _ in $(seq 1 60); do
  OBS="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.observedGeneration}')"
  [ "$OBS" = "$GEN" ] && break
  sleep 5
done
[ "$OBS" = "$GEN" ]
kubectl wait questdbcluster/<name> -n <namespace> \
  --for=condition=Available --timeout=5m
```

The `kubectl wait` above is only an availability gate. Before declaring the
writer ready, re-read the current-generation conditions and require
`Available=True/PrimaryReady`, `Progressing=False/Settled`, and
`WriteHealthy=True/Healthy`. Then verify pod UIDs/restarts, connectivity, and
the intended setting. `Progressing=True/RollingUpdate` can mean the controller
is safely waiting on topology, PVC, peer, Node, or read-routing conditions. If
the change fails, inspect `ConfigRejected`, events, and pod logs. Recover by
reverting the mutable spec to the saved value and repeat the bounded generation
and full writer-health checks. Do not try to revert immutable fields; create a
new cluster when required by the
[API Reference](/docs/enterprise-kubernetes-operator/reference/api/).

### Rotate static object-store credentials safely

1. Make old and new provider credentials valid concurrently.
2. Update the same-namespace Secret referenced by `QuestDBObjectStore`.
3. Allow the manager's roughly two-minute resync plus serialized Pod restart to
   converge.
4. Verify expected Pod UID changes and `BackupHealthy`/`ReplicationHealthy`.
5. Revoke the old credentials only after convergence.

Immediate provider-side revocation can interrupt in-flight QuestDB object-store
I/O.

## Scale out

A replica is born from a completed backup and then consumes object-store WAL.
Before increasing `spec.instances`, the cluster needs:

- `spec.objectStoreRef`;
- enabled scheduled backup; and
- a completed seed in `.status.replication.seed`.

An explicit `spec.replication` block is optional; add it only for tuning.

```sh
BACKUP_STATUS="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.status.backup.lastBackup.status}')"
SEED="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.status.replication.seed.backupInstanceName}')"
printf 'backup=%s seed=%s\n' "$BACKUP_STATUS" "$SEED"
[ "$BACKUP_STATUS" = "completed" ] && [ -n "$SEED" ]

kubectl patch questdbcluster <name> -n <namespace> --type merge \
  -p '{"spec":{"instances":3}}'
```

Watch with bounded checks:

```sh
for _ in $(seq 1 90); do
  READY="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.readyInstances}')"
  [ "$READY" = "3" ] && break
  sleep 10
done
[ "$READY" = "3" ]
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{range .status.conditions[?(@.type=="ReplicationHealthy")]}{.status}{" "}{.reason}{" "}{.message}{"\n"}{end}{range .status.replication.replicas[*]}{.instance}{" caughtUp="}{.caughtUp}{" caughtUpNow="}{.caughtUpNow}{" lagTxns="}{.lagTxns}{"\n"}{end}'
```

Verify `readyInstances` equals the requested count, `ReplicationHealthy=True`,
and each current replica is healthy. `caughtUp` means it has caught up at least
once; it is a latch. `caughtUpNow` is the live freshness reading. An absent
`caughtUpNow` means freshness was not determined and must fail closed.

## Scale in

Lowering `spec.instances` removes replicas. Instance serials are monotonic and
are never reused, so names may not remain contiguous after scale or promotion.

| `spec.pvcRetentionPolicy` | Removed replica PVC                                                                 |
| ------------------------- | ----------------------------------------------------------------------------------- |
| `Retain` (default)        | Kept for deliberate inspection or cleanup.                                          |
| `Delete`                  | Deleted during replica scale-in. A later replica gets a new serial and seeds again. |

The policy applies only to replicas removed by scale-in. It never deletes the
current primary PVC and does not govern whole-cluster deletion. On every managed
PVC, `questdb.io/role` is the instance's **current** role and changes across
promotion; `questdb.io/bootstrap` records how the volume was born and remains
ancestry/state. Do not infer the current primary from `bootstrap`.

Before scaling in, identify the primary and replicas, choose the retention
policy, and inventory PVCs:

```sh
kubectl get questdbcluster <name> -n <namespace> -o wide
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name>
kubectl patch questdbcluster <name> -n <namespace> --type merge \
  -p '{"spec":{"instances":1,"pvcRetentionPolicy":"Retain"}}'
GENERATION="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.metadata.generation}')"
OBSERVED=""
AVAILABLE_OBSERVED=""
for _ in $(seq 1 120); do
  OBSERVED="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.observedGeneration}')"
  AVAILABLE_OBSERVED="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.conditions[?(@.type=="Available")].observedGeneration}')"
  [ "$OBSERVED" = "$GENERATION" ] && \
    [ "$AVAILABLE_OBSERVED" = "$GENERATION" ] && break
  sleep 5
done
if [ "$OBSERVED" = "$GENERATION" ] && \
   [ "$AVAILABLE_OBSERVED" = "$GENERATION" ]; then
  kubectl wait questdbcluster/<name> -n <namespace> \
    --for=condition=Available=True --timeout=10m &&
  kubectl get questdbcluster <name> -n <namespace> -o wide &&
  kubectl get pods,pvc -n <namespace> -l questdb.io/cluster=<name> -o wide
else
  printf 'Timed out waiting for generation %s (status %s, Available %s)\n' \
    "$GENERATION" "$OBSERVED" "$AVAILABLE_OBSERVED" >&2
  false
fi
```

Verify the managed and ready counts, current primary, the full ordinary
writer-health or separate follower contract, and the expected retained or
deleted replica PVCs. Confirm each current primary/replica PVC's
`questdb.io/role` label matches that role.

## Grow storage

Storage is expand-only, and `spec.storage.storageClassName` is immutable.

### Before you start

```sh
STORAGE_CLASS="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.spec.storage.storageClassName}')"
kubectl get storageclass "$STORAGE_CLASS" \
  -o jsonpath='allowVolumeExpansion={.allowVolumeExpansion}{"\n"}'
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name>
```

Proceed only when `allowVolumeExpansion=true` and the CSI driver supports the
requested expansion.

### Change and verify

```sh
kubectl patch questdbcluster <name> -n <namespace> --type merge \
  -p '{"spec":{"storage":{"size":"200Gi"}}}'
GENERATION="$(kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.metadata.generation}')"
OBSERVED=""
AVAILABLE_OBSERVED=""
for _ in $(seq 1 120); do
  OBSERVED="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.observedGeneration}')"
  AVAILABLE_OBSERVED="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.conditions[?(@.type=="Available")].observedGeneration}')"
  [ "$OBSERVED" = "$GENERATION" ] && \
    [ "$AVAILABLE_OBSERVED" = "$GENERATION" ] && break
  sleep 5
done
if [ "$OBSERVED" = "$GENERATION" ] && \
   [ "$AVAILABLE_OBSERVED" = "$GENERATION" ]; then
  kubectl wait questdbcluster/<name> -n <namespace> \
    --for=condition=Available=True --timeout=10m &&
  kubectl get questdbcluster <name> -n <namespace> -o wide &&
  kubectl get pvc -n <namespace> -l questdb.io/cluster=<name> \
    -o custom-columns='NAME:.metadata.name,REQUESTED:.spec.resources.requests.storage,CAPACITY:.status.capacity.storage,PHASE:.status.phase'
else
  printf 'Timed out waiting for generation %s (status %s, Available %s)\n' \
    "$GENERATION" "$OBSERVED" "$AVAILABLE_OBSERVED" >&2
  false
fi
```

The availability wait is not proof of writer health. Require the
current-generation `Available=True/PrimaryReady`, `Progressing=False/Settled`,
and `WriteHealthy=True/Healthy` conditions before closing the change. If
`StorageResizeBlocked=True`, read its reason/message and fix the StorageClass or
CSI limitation. A size reduction is rejected. To change StorageClass, restore
into a new cluster.

## Node maintenance and disruption budgets

The default PodDisruptionBudget (PDB) uses `minAvailable: 1` for a singleton and
`instances-1` for a replicated cluster. A singleton therefore blocks voluntary
eviction and can make `kubectl drain` wait indefinitely.

Before planned maintenance, choose one safe option:

1. scale out and wait for a healthy, current replica;
2. lower `spec.scheduling.podDisruptionBudget.minAvailable`; or
3. set `spec.scheduling.podDisruptionBudget.enabled: false` only after accepting
   database downtime.

```yaml
spec:
  scheduling:
    podDisruptionBudget:
      enabled: true
      minAvailable: 0
```

Restore the normal PDB after maintenance and verify the current-generation
writer contract: `Available=True/PrimaryReady`, `Progressing=False/Settled`, and
`WriteHealthy=True/Healthy`.

A PDB protects only voluntary disruption. On node loss, the operator reports
`InstanceUnreachable` and does not automatically promote a replica. It avoids
recreating a pod while the old pod may still run on an unreachable node. Restore
the node/volume or follow the explicit
[promotion and failover](/docs/enterprise-kubernetes-operator/high-availability/#promotion-and-failover)
procedure.

## Delete a database cluster

Deleting a `QuestDBCluster` removes operator-owned pods, Services, ConfigMaps,
and related resources. Its data PVCs are deliberately unowned and remain, and
object-store backup/WAL data also remains. `pvcRetentionPolicy` does not change
this whole-cluster behavior.

### Before you start

Inventory and export the CR, PVCs, PV reclaim policies, store reference, and
effective object prefixes:

```sh
kubectl get questdbcluster <name> -n <namespace> -o yaml \
  > /secure/path/<name>-cluster.yaml
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name> -o wide
kubectl get questdbobjectstore -n <namespace>
```

:::danger Deleting the custom resource stops the database and removes its
managed runtime objects. Confirm applications are stopped and that the CR export
and data-retention inventory are complete. :::

```sh
kubectl delete questdbcluster <name> -n <namespace> --timeout=5m
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name>
```

Decide separately whether to retain or delete each PVC/PV according to its
StorageClass reclaim policy. Decide separately whether to retain or delete cloud
objects using customer-owned cloud tooling and policy. The operator never cleans
the object store.
