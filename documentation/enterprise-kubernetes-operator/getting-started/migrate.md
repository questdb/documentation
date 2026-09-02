---
title: Migrate QuestDB onto the Kubernetes Operator
description:
  Migrate an existing QuestDB Enterprise deployment onto the Kubernetes
  Operator with a replica-first cutover.
---

# Migrate QuestDB onto the Kubernetes Operator

This guide creates an operator-managed, replica-only follower of an external
QuestDB Enterprise deployment, lets it restore the source backup and consume
replication WAL, then promotes it after a controlled source drain.

The workflow is cloud-neutral. The provider-specific bucket or container,
credentials, and pod identity are kept in an existing `QuestDBObjectStore`.

:::warning
Before running a command, replace every `<angle-bracket>` value. An unreplaced
placeholder can be interpreted as shell redirection.
:::

## Before you start

This guide assumes that:

- the QuestDB Enterprise Kubernetes Operator is installed;
- the tenant namespace exists;
- the namespace has access to the QuestDB Enterprise image, either through an
  `imagePullSecret` or ambient node credentials;
- a `ReadWriteOnce` StorageClass with `fsGroup` support is available;
- a same-namespace `QuestDBObjectStore` and any referenced credential Secret
  already provide access to the source object store; and
- you know the source backup and replication WAL prefixes.

See
[Configuration](/docs/enterprise-kubernetes-operator/configuration/#object-storage)
if object-store access is not ready. The operator does not test, list, read, or
write the store. QuestDB pods perform the object-store I/O, and the consuming
cluster's conditions are the readiness signal.

Confirm the APIs, source store, and StorageClass before continuing:

```sh
kubectl get crd questdbclusters.questdb.io \
  questdbobjectstores.questdb.io questdbpromotions.questdb.io
kubectl get questdbobjectstore <source-store> -n <namespace>
kubectl get storageclass <storage-class>
```

Copy the exact QuestDB Enterprise image and `imagePullSecrets` from a working
cluster when possible. Remove the `imagePullSecrets` block from the examples
only when every destination node has ambient pull access.

## Migration workflow

This path keeps the external source writable while an operator-managed replica
restores its backup and consumes its replication WAL. Cutover downtime is
limited to stopping and draining the source, consuming the final WAL, and
promoting the follower.

The operator does not connect to, configure, stop, or fence the external source.
Those steps remain your responsibility.

### 1. Prepare the source

Before creating the follower, confirm that the external source:

- runs a QuestDB Enterprise version compatible with the destination image;
- has a completed backup under a known backup prefix;
- uploads replication WAL under a known WAL prefix in the same object store;
- retains WAL back to the seed backup;
- returns an exact, non-empty value from `SELECT backup_instance_name();`; and
- can be stopped and restarted once with
  `replication.role=primary-catchup-uploads` during cutover.

The backup instance name must match `^[a-z0-9]+(-[a-z0-9]+)*$`. Confirm the
backup prefix, WAL prefix, and instance name against the source configuration;
they become immutable on the follower.

### 2. Create a replica-only follower

Save the following as `follower.yaml`:

```yaml
apiVersion: questdb.io/v1alpha1
kind: QuestDBCluster
metadata:
  name: <follower-cluster>
  namespace: <namespace>
spec:
  image: <questdb-enterprise-image>
  imagePullSecrets:
    - name: <tenant-image-pull-secret>
  instances: 1
  storage:
    storageClassName: <storage-class>
    size: 100Gi
  resources:
    requests:
      memory: 4Gi
    limits:
      memory: 4Gi
  objectStoreRef:
    name: <source-store>
  backup:
    enabled: true
    schedule: "0 * * * *"
    timezone: UTC
    retention: 5
    root: <source-backup-root>
  replication:
    root: <source-wal-root>
  bootstrap:
    follow:
      sourceInstanceName: <source-backup-instance-name>
```

While the cluster is following, every instance is a replica and the backup
scheduler is paused. After promotion, this cluster adopts the source prefixes
and begins taking its own backups there.

Review all immutable source selectors, then apply the file:

```sh
kubectl apply -f follower.yaml
```

### 3. Wait for the follower to serve reads

Wait until the replica has restored its baseline and reconciliation is settled:

```bash
for _ in $(seq 1 180); do
  STATE="$(kubectl get questdbcluster <follower-cluster> -n <namespace> \
    -o jsonpath='{.status.replication.following}{"|"}{.status.readyInstances}{"|"}{range .status.conditions[?(@.type=="Available")]}{.status}{"/"}{.reason}{end}{"|"}{range .status.conditions[?(@.type=="Progressing")]}{.status}{"/"}{.reason}{end}')"
  IFS='|' read -r FOLLOWING READY AVAILABLE PROGRESSING <<< "$STATE"
  if [ "$FOLLOWING" = "true" ] && [ "$READY" = "1" ] && \
     [ "$AVAILABLE" = "True/Following" ] && \
     [ "$PROGRESSING" = "False/Settled" ]; then
    break
  fi
  sleep 10
done
printf 'following=%s ready=%s available=%s progressing=%s\n' \
  "$FOLLOWING" "$READY" "$AVAILABLE" "$PROGRESSING"
[ "$FOLLOWING" = "true" ] && [ "$READY" = "1" ] && \
[ "$AVAILABLE" = "True/Following" ] && \
[ "$PROGRESSING" = "False/Settled" ]
```

A healthy follower deliberately has no current primary and no RW endpoint.
Confirm both properties:

```sh
kubectl get questdbcluster <follower-cluster> -n <namespace> \
  -o jsonpath='following={.status.replication.following}{" primary="}{.status.currentPrimary}{"\n"}'
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<follower-cluster>-rw \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses}{"\n"}{end}'
```

The second command must print no endpoint addresses.

### 4. Confirm replication catch-up

Inspect the live follower position:

```sh
kubectl get questdbcluster <follower-cluster> -n <namespace> \
  -o jsonpath='{range .status.replication.replicas[*]}{.instance}{" caughtUpNow="}{.caughtUpNow}{" lagTxns="}{.lagTxns}{" suspended="}{.suspendedTables}{"\n"}{end}{range .status.conditions[?(@.type=="ReplicationHealthy")]}ReplicationHealthy={.status}{"/"}{.reason}{" "}{.message}{"\n"}{end}{.status.replication.stream}{"\n"}'
```

Prefer to begin cutover with `caughtUpNow=true` and `lagTxns=0`. A busy source
may briefly move away from zero. A quiet source may report `StreamNotDetermined`
because the engine omits already-caught-up tables from its poll; that is not
proof of success. In that case, reconfirm the immutable source identity and
roots, then query `<follower-cluster>-ro` and verify a recent, known source
record.

Do not proceed with `ReplicationHealthy=False`, suspended tables, a known
backlog that is not advancing, or unverified source selectors. The planned
promotion performs a final fail-closed check after the source is drained.

### 5. Stop writes and drain the source

Record the start of cutover in the Bash shell you will keep open:

```bash
CUTOVER_TIME_CAPTURED=false
CUTOVER_STARTED_AT=""
if CUTOVER_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
   [ -n "$CUTOVER_STARTED_AT" ]; then
  CUTOVER_TIME_CAPTURED=true
fi
[ "$CUTOVER_TIME_CAPTURED" = true ] && \
  printf 'Cutover started at %s\n' "$CUTOVER_STARTED_AT"
```

Continue in this shell only if `CUTOVER_TIME_CAPTURED=true`; the final backup
check rejects a missing timestamp.

Then perform these steps with the external source's service manager or container
runtime:

1. Stop all application writes to the external source.
2. Stop the source QuestDB process.
3. Configure the source to start once with
   `replication.role=primary-catchup-uploads`.
4. Start the source and watch its logs.
5. Wait for `CLOSE_REASON_UPLOADS_COMPLETE_SUCCESS`. A normal shutdown without
   this close reason does not prove that the final WAL reached object storage.
6. Confirm the source process has exited, and disable automatic restarts.

The final upload has no safe fixed timeout. Supervise it at the source until it
succeeds.

:::danger
Do not promote while the external source may still be running as a primary. The
operator cannot fence an unmanaged process. Keep the old data available for
rollback investigation, but ensure the process and its supervisor cannot restart
it.
:::

### 6. Promote the follower

Create a one-shot planned promotion targeting the follower's instance serial
`1`:

```sh
kubectl apply -f - <<EOF
apiVersion: questdb.io/v1alpha1
kind: QuestDBPromotion
metadata:
  name: <promotion-name>
  namespace: <namespace>
spec:
  clusterRef:
    name: <follower-cluster>
  target: 1
  mode: Planned
  catchUpTimeoutSeconds: 900
  primaryGracePeriodSeconds: 120
EOF
```

The promotion waits for the source stream to remain quiet for at least 60
seconds and for the target to consume the published WAL. It fails closed rather
than silently accepting a lossy cutover.

Watch until the promotion completes or fails:

```bash
PHASE=""
for _ in $(seq 1 180); do
  PHASE="$(kubectl get questdbpromotion <promotion-name> -n <namespace> \
    -o jsonpath='{.status.phase}')"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$PHASE"
  case "$PHASE" in
    Completed|Failed) break ;;
  esac
  sleep 10
done
kubectl get questdbpromotion <promotion-name> -n <namespace> \
  -o jsonpath='{.status.phase}{" "}{.status.reason}{": "}{.status.message}{"\n"}{range .status.conditions[*]}{.type}{"="}{.status}{"/"}{.reason}{" "}{.message}{"\n"}{end}'
[ "$PHASE" = "Completed" ]
```

If it fails, leave the source stopped and read the reported reason before taking
another action. A failed promotion is terminal; correct the cause and create a
new promotion object. Do not remove the promotion finalizer. See
[If promotion stalls or fails](/docs/enterprise-kubernetes-operator/high-availability/#if-promotion-stalls-or-fails).

### 7. Verify the new primary

Wait for the promoted cluster's writer-health contract:

```bash
GENERATION="$(kubectl get questdbcluster <follower-cluster> -n <namespace> \
  -o jsonpath='{.metadata.generation}')"
for _ in $(seq 1 120); do
  STATE="$(kubectl get questdbcluster <follower-cluster> -n <namespace> \
    -o jsonpath='{.status.observedGeneration}{"|"}{.status.currentPrimary}{"|"}{.status.replication.following}{"|"}{range .status.conditions[?(@.type=="Available")]}{.status}{"/"}{.reason}{end}{"|"}{range .status.conditions[?(@.type=="Progressing")]}{.status}{"/"}{.reason}{end}{"|"}{range .status.conditions[?(@.type=="WriteHealthy")]}{.status}{"/"}{.reason}{end}')"
  IFS='|' read -r OBSERVED PRIMARY FOLLOWING AVAILABLE PROGRESSING WRITE_HEALTHY <<< "$STATE"
  if [ "$OBSERVED" = "$GENERATION" ] && \
     [ "$PRIMARY" = "<follower-cluster>-1" ] && \
     [ "$FOLLOWING" != "true" ] && \
     [ "$AVAILABLE" = "True/PrimaryReady" ] && \
     [ "$PROGRESSING" = "False/Settled" ] && \
     [ "$WRITE_HEALTHY" = "True/Healthy" ]; then
    break
  fi
  sleep 10
done
printf 'observed=%s primary=%s following=%s available=%s progressing=%s writeHealthy=%s\n' \
  "$OBSERVED" "$PRIMARY" "$FOLLOWING" "$AVAILABLE" "$PROGRESSING" "$WRITE_HEALTHY"
[ "$OBSERVED" = "$GENERATION" ] && \
[ "$PRIMARY" = "<follower-cluster>-1" ] && \
[ "$FOLLOWING" != "true" ] && \
[ "$AVAILABLE" = "True/PrimaryReady" ] && \
[ "$PROGRESSING" = "False/Settled" ] && \
[ "$WRITE_HEALTHY" = "True/Healthy" ]
```

Confirm that `<follower-cluster>-rw` now has an endpoint, then connect through
that Service and validate recent data and application writes:

```sh
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<follower-cluster>-rw
```

Permanently decommission the old source so that it cannot restart and contend
for the adopted WAL stream.

### 8. Verify the first post-cutover backup

The WAL cleaner remains held until the promoted cluster completes its own first
backup. With the hourly schedule in this guide, allow one schedule interval plus
the operator's roughly two-minute observation delay:

```bash
PRIMARY_UID_CAPTURED=false
PRIMARY_UID_BEFORE_BACKUP=""
if PRIMARY_UID_BEFORE_BACKUP="$(kubectl get pod <follower-cluster>-1 \
     -n <namespace> -o jsonpath='{.metadata.uid}')" && \
   [ -n "$PRIMARY_UID_BEFORE_BACKUP" ]; then
  PRIMARY_UID_CAPTURED=true
fi

BACKUP_VERIFIED=false
STATUS=""
END_TIME=""
for _ in $(seq 1 450); do
  STATUS="$(kubectl get questdbcluster <follower-cluster> -n <namespace> \
    -o jsonpath='{.status.backup.lastBackup.status}')"
  END_TIME="$(kubectl get questdbcluster <follower-cluster> -n <namespace> \
    -o jsonpath='{.status.backup.lastBackup.endTime}')"
  if [ "${CUTOVER_TIME_CAPTURED:-false}" = true ] && \
     [ -n "$CUTOVER_STARTED_AT" ] && \
     [ "$STATUS" = "completed" ] && [ -n "$END_TIME" ] && \
     [[ "$END_TIME" > "$CUTOVER_STARTED_AT" ]]; then
    BACKUP_VERIFIED=true
    break
  fi
  [ "$STATUS" = "failed" ] && break
  sleep 10
done
printf 'status=%s endTime=%s cutoverStartedAt=%s\n' \
  "$STATUS" "$END_TIME" "$CUTOVER_STARTED_AT"
[ "${CUTOVER_TIME_CAPTURED:-false}" = true ] && \
[ -n "$CUTOVER_STARTED_AT" ] && [ "$BACKUP_VERIFIED" = true ]
```

Releasing the WAL cleaner rolls the primary once. Prove that the asynchronous
roll occurred by waiting for the pod UID to change:

```bash
PRIMARY_ROLLED=false
PRIMARY_UID_AFTER_BACKUP=""
for _ in $(seq 1 120); do
  if PRIMARY_UID_AFTER_BACKUP="$(kubectl get pod <follower-cluster>-1 \
       -n <namespace> -o jsonpath='{.metadata.uid}' 2>/dev/null)" && \
     [ "$PRIMARY_UID_CAPTURED" = true ] && \
     [ -n "$PRIMARY_UID_AFTER_BACKUP" ] && \
     [ "$PRIMARY_UID_AFTER_BACKUP" != "$PRIMARY_UID_BEFORE_BACKUP" ]; then
    PRIMARY_ROLLED=true
    break
  fi
  sleep 10
done
printf 'before=%s after=%s rolled=%s\n' \
  "$PRIMARY_UID_BEFORE_BACKUP" "$PRIMARY_UID_AFTER_BACKUP" "$PRIMARY_ROLLED"
[ "$PRIMARY_UID_CAPTURED" = true ] && [ "$PRIMARY_ROLLED" = true ]
```

After the new pod appears, repeat the writer-health check from the previous step
and require it to settle before declaring the migration complete.

For emergency source loss, multiple followers, or detailed failure handling, use
the full
[high-availability migration runbook](/docs/enterprise-kubernetes-operator/high-availability/#migrate-an-existing-questdb-onto-the-operator).
