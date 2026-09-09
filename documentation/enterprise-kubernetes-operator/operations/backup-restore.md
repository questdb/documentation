---
title: Backup and restore
description:
  Configure backups and restore Operator-managed QuestDB clusters, including
  point-in-time recovery.
---

# Backup and restore

QuestDB Enterprise schedules and performs backups on the primary. The operator
configures the engine and observes `backups()`; it does not upload data, create
a Kubernetes CronJob, expose an on-demand backup API, or read the object store.
Status can lag the database by roughly the manager's resync/observation interval
(about two minutes).

For more information about backup and restore mechanics, please refer to the
[official documentation](/docs/operations/backup).

Before running any command, replace every `<angle-bracket>` value; an unreplaced
placeholder can be interpreted as shell redirection.

## Configure and verify backup

### Before you start

Create and validate a same-namespace `QuestDBObjectStore` as described in
[Configuration](/docs/enterprise-kubernetes-operator/configuration/#object-storage).
The object-store CR has no readiness status; proof comes from a consuming
database.

Use a prefix reserved for this cluster:

```yaml
spec:
  objectStoreRef:
    name: <store-name>
  backup:
    enabled: true
    schedule: "0 * * * *"
    timezone: UTC
    retention: 5
    root: backup/<namespace>/<name>/
    stalledAfterSeconds: 3600
```

Apply the cluster change. It can recreate the primary to install the new
configuration, briefly interrupting writes.

### Watch

Before the first run, `BackupHealthy` may be `Unknown` with reason
`NoBackupYet`. The bounded deadline must exceed the schedule interval plus the
roughly two-minute observation delay; this hourly example allows about 75
minutes:

```sh
for _ in $(seq 1 450); do
  STATUS="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.backup.lastBackup.status}')"
  REASON="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.conditions[?(@.type=="BackupHealthy")].reason}')"
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && break
  [ "$REASON" = "Stalled" ] && break
  sleep 10
done
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{range .status.conditions[?(@.type=="BackupHealthy")]}{.status}{" "}{.reason}{" "}{.message}{"\n"}{end}{.status.backup.lastBackup}{"\nlastProgressAt="}{.status.backup.lastProgressAt}{"\n"}'
[ "$STATUS" = "completed" ]
```

Verify both the first successful run and continued recent successful runs. A
failed engine run has `lastBackup.status=failed` and
`BackupHealthy=False/Failed`; inspect `.status.backup.lastBackup.error`,
database logs, Secret metadata, cloud IAM, DNS, and network access.

A stalled run is deliberately different: the engine status remains
`in_progress`, while `BackupHealthy=False/Stalled` reports that
`progressPercent` has not changed for the configured threshold.
`.status.backup.lastProgressAt` is when the operator first observed the current
run or most recently observed its percentage change. `stalledAfterSeconds`
defaults to 3600 seconds. Setting it explicitly to `0` disables stall detection;
it does not cancel the backup, mark it failed, or bound how long `in_progress`
can remain. Diagnose and remediate the engine/store path rather than editing
status.

There is no safe "force backup" command. Temporarily shortening
`spec.backup.schedule` is a schedule/configuration change, **not** an on-demand
backup. It can recreate pods and briefly interrupt writes; if used for a
controlled test, restore the production schedule afterward.

## Restore into a new cluster

Restore always creates a **new** `QuestDBCluster`. Its immutable
`spec.bootstrap.recovery` makes the genesis primary start from backup or not
start at all.

The source `QuestDBObjectStore` must exist in the destination cluster's
namespace. A missing source CR safely withholds genesis and retries. Invalid
store configuration or an engine/runtime restore problem fails recovery instead
of initializing an empty database.

### Before you start

- identify the source store and backup root;
- choose a destination name, PVCs, and backup/WAL prefixes that cannot collide
  with the source or another live cluster;
- for a multi-instance source, determine `sourceInstanceName` and copy it
  exactly; it must match the lowercase hyphen-separated pattern
  `^[a-z0-9]+(-[a-z0-9]+)*$`;
- for PITR, confirm the retained time window before choosing a target.

For an operator-managed source, the current seed identity is normally published
here:

```sh
kubectl get questdbcluster <source-name> -n <namespace> \
  -o jsonpath='{.status.replication.seed.backupInstanceName}{"\n"}'
```

Confirm it against the source database when possible:

```sql
SELECT backup_instance_name();
```

Set `spec.bootstrap.recovery.sourceInstanceName` when the source store holds
backups from more than one instance. If omitted, the engine selects the only
instance in a single-instance source and fails when selection is ambiguous. The
operator cannot list the store for you.

### Change

Copy the working tenant cluster's `spec.image` and `spec.imagePullSecrets`. Set
`<questdb-enterprise-image>` to that private image and
`<tenant-image-pull-secret>` to the pull Secret in the destination namespace.
Remove the entire `imagePullSecrets` block only when every destination node has
ambient pull access, such as an authorized EKS worker-node role.

```yaml
apiVersion: questdb.io/v1alpha1
kind: QuestDBCluster
metadata:
  name: <restored-name>
  namespace: <namespace>
spec:
  image: <questdb-enterprise-image>
  imagePullSecrets:
    - name: <tenant-image-pull-secret>
  storage:
    storageClassName: <storage-class>
    size: 100Gi
  resources:
    requests:
      memory: 4Gi
    limits:
      memory: 4Gi
  objectStoreRef:
    name: <destination-store>
  bootstrap:
    recovery:
      source:
        objectStoreRef:
          name: <source-store>
          root: backup/<source-namespace>/<source-name>/
      sourceInstanceName: <source-backup-instance-name>
  backup:
    enabled: true
    schedule: "0 * * * *"
    root: backup/<namespace>/<restored-name>/
  # Optional tuning block. If set, this root is immutable.
  replication:
    root: db/<namespace>/<restored-name>/
```

Apply the reviewed manifest:

```sh
kubectl apply -f <restore-file.yaml>
```

The destination backup and replication prefixes must be distinct from the
source/live cluster's prefixes. When omitted, the destination replication root
defaults to the identity-scoped `db/<namespace>/<restored-name>/`; confirm that
identity is unique.

### Watch and verify

```sh
GENERATION="$(kubectl get questdbcluster <restored-name> -n <namespace> \
  -o jsonpath='{.metadata.generation}')"
for _ in $(seq 1 180); do
  OBSERVED="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{.status.observedGeneration}')"
  RECOVERED="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{.status.conditions[?(@.type=="Recovered")].status}')"
  FAILED="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{.status.conditions[?(@.type=="RecoveryFailed")].status}')"
  AVAILABLE="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{range .status.conditions[?(@.type=="Available")]}{.status} {.reason}{end}')"
  PROGRESSING="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{range .status.conditions[?(@.type=="Progressing")]}{.status} {.reason}{end}')"
  WRITE_HEALTHY="$(kubectl get questdbcluster <restored-name> -n <namespace> \
    -o jsonpath='{range .status.conditions[?(@.type=="WriteHealthy")]}{.status} {.reason}{end}')"
  if [ "$OBSERVED" = "$GENERATION" ] && \
     [ "$RECOVERED" = "True" ] && [ "$FAILED" != "True" ] && \
     [ "$AVAILABLE" = "True PrimaryReady" ] && \
     [ "$PROGRESSING" = "False Settled" ] && \
     [ "$WRITE_HEALTHY" = "True Healthy" ]; then
    break
  fi
  [ "$FAILED" = "True" ] && break
  sleep 10
done
kubectl get questdbcluster <restored-name> -n <namespace> \
  -o jsonpath='{range .status.conditions[*]}{.type}{"="}{.status}{" "}{.reason}{" "}{.message}{"\n"}{end}'
[ "$OBSERVED" = "$GENERATION" ] && \
[ "$RECOVERED" = "True" ] && [ "$FAILED" != "True" ] && \
[ "$AVAILABLE" = "True PrimaryReady" ] && \
[ "$PROGRESSING" = "False Settled" ] && \
[ "$WRITE_HEALTHY" = "True Healthy" ]
```

`Recovered=True` means the engine reported restore completion; the other gates
establish current ordinary writer readiness, including observed WAL write
health. They still do not prove that you selected the intended data or guarantee
free disk capacity. Before sending traffic, query the restored database and
validate critical tables, minimum/maximum timestamps, expected row counts,
application invariants, and storage headroom.

### If it fails

Read `Recovered`/`RecoveryFailed`, then inspect the genesis pod and its recovery
init container:

```sh
kubectl get pods -n <namespace> -l questdb.io/cluster=<restored-name> -o wide
kubectl describe questdbcluster <restored-name> -n <namespace>
kubectl logs -n <namespace> <restored-name>-1 -c recovery-bootstrap --tail=500
kubectl logs -n <namespace> <restored-name>-1 -c questdb --tail=500
```

Container names can be confirmed with
`kubectl get pod <restored-name>-1 -n <namespace> -o jsonpath='{.spec.initContainers[*].name}{" "}{.spec.containers[*].name}{"\n"}'`.

Because `spec.bootstrap` is immutable, correct a wrong source, identity, root,
or target in a new cluster. A live failed destination CR continues reconciling
and can race cleanup or recreate its pods, so remove it before touching retained
storage:

```sh
CLEANUP_READY=false
if kubectl delete questdbcluster <restored-name> -n <namespace> --timeout=5m; then
  for _ in $(seq 1 120); do
    if PODS="$(kubectl get pods -n <namespace> \
      -l questdb.io/cluster=<restored-name> -o name)" && [ -z "$PODS" ]; then
      CLEANUP_READY=true
      break
    fi
    sleep 5
  done
fi
[ "${CLEANUP_READY:-false}" = "true" ] &&
  kubectl get pvc -n <namespace> -l questdb.io/cluster=<restored-name> -o wide
```

Proceed only if the PVC inventory command ran successfully. Confirm the listed
PVC belongs only to the failed destination and contains no needed data.

:::danger Deleting the retained destination PVC permanently destroys its
incomplete restore data. Delete only the PVC you have confirmed is disposable.
:::

In the same shell, delete only the confirmed PVC:

```sh
[ "${CLEANUP_READY:-false}" = "true" ] &&
  kubectl delete pvc <confirmed-disposable-pvc> -n <namespace> --timeout=5m
```

Apply the corrected restore with a **fresh cluster name**, which creates a
distinct fresh PVC. Do not reuse `<restored-name>` or its old PVC.

## Point-in-time recovery (PITR)

PITR selects the newest retained backup at or before an RFC3339 target. Its
granularity is the backup cadence, not continuous WAL time. The operator cannot
inspect the object store to pre-validate the recoverable window.

Kubernetes accepts RFC3339 offsets and fractional seconds; the operator
normalizes the target to UTC `Z` and truncates fractional seconds to six digits
rather than rounding, preserving the at-or-before boundary.

Add this immutable block when creating the restored cluster:

```yaml
spec:
  bootstrap:
    recovery:
      source:
        objectStoreRef:
          name: <source-store>
          root: backup/<source-namespace>/<source-name>/
      sourceInstanceName: <source-backup-instance-name>
      recoveryTarget:
        timestamp: "2026-06-30T14:00:00Z"
```

:::warning If the target is older than the retained window, supported QuestDB
Enterprise 4.0.0 fails startup with no backup timestamp at or before the target,
and the operator reports `RecoveryFailed=True/RestoreError`. Because
`spec.bootstrap` is immutable, delete the failed destination safely and create a
fresh cluster with a valid target. :::

Confirm the source retention window before creating the immutable destination,
then follow the same bounded watch, failure checks, and data validation as a
normal restore.
