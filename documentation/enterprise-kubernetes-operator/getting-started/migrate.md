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

The source must run a QuestDB Enterprise version compatible with the destination
image. Replication only carries changes to WAL-enabled tables. Inventory the
source before enabling replication:

```questdb-sql title="Check source tables"
SELECT table_name, walEnabled
FROM tables()
ORDER BY table_name;
```

:::warning[Non-WAL tables do not replicate]
Data already present in a non-WAL table is included in the seed backup, but
later changes to that table are not replicated. Stop writes to non-WAL tables
before the seed backup and keep them stopped through cutover, or arrange to
synchronize them separately.
:::

Choose a backup prefix and a replication WAL prefix in the **same bucket**. The
follower has one `QuestDBObjectStore` for both uses, so separate source buckets
cannot be represented by the follower specification. The roots must be distinct,
stable prefixes with a trailing `/`. No other live primary may write to the WAL
prefix.

The following S3 example uses ambient AWS credentials from an EC2 instance
profile. Add it to the source's `server.conf`, replacing every placeholder:

```ini title="server.conf on the external source"
backup.enabled=true
backup.object.store=s3::bucket=<source-bucket>;root=<source-backup-root>;region=<aws-region>;
backup.schedule.cron=0 * * * *
backup.schedule.tz=UTC
backup.cleanup.keep.latest.n=5

replication.role=primary
replication.object.store=s3::bucket=<source-bucket>;root=<source-wal-root>;region=<aws-region>;
replication.primary.cleaner.enabled=false
```

The example disables WAL cleanup on the source for the rest of the migration.
WAL objects will accumulate in object storage, but QuestDB will not delete them
before the follower consumes them.

Separately, `backup.cleanup.keep.latest.n=5` retains the five most recent
completed backups—not five hours of backups. Before creating the follower,
confirm that at least one completed backup is still available.

:::note Other object-store providers
The backup and replication mechanics are provider-independent. For another
provider supported by your Operator release, replace the two S3 connection
strings with that provider's
[object-store connection strings](/docs/high-availability/setup/#1-configure-object-storage).
Keep the backup and WAL roots distinct, and configure the destination
`QuestDBObjectStore` for the same underlying store.
:::

Every `server.conf` setting can instead be supplied as an environment variable.
See [Environment variables](/docs/configuration/overview/#environment-variables)
for the naming convention. If an object-store string contains static
credentials, load it from a protected file as described in
[Secrets from files](/docs/configuration/overview/#secrets-from-files).

The object-store and replication-role settings are not reloadable. Restart the
source with its normal service manager or container runtime, then trigger the
seed backup:

```questdb-sql title="Take the seed backup"
BACKUP DATABASE;
```

`BACKUP DATABASE` starts the backup asynchronously. Poll its latest record until
it reports `backup complete`:

```questdb-sql title="Check the seed backup"
SELECT status, progress_percent, start_ts, end_ts, backup_error
FROM backups()
ORDER BY start_ts DESC
LIMIT 1;
```

After the backup completes, record the source's exact backup instance name:

```questdb-sql title="Get the source backup instance name"
SELECT backup_instance_name();
```

QuestDB generates the name as three random lowercase words separated by hyphens,
for example `happy-green-turtle`. Copy the entire value exactly. Then confirm
that both prefixes contain objects:

```bash title="Check the S3 source prefixes"
aws s3api list-objects-v2 \
  --region '<aws-region>' \
  --bucket '<source-bucket>' \
  --prefix '<source-backup-root>' \
  --max-keys 5
aws s3api list-objects-v2 \
  --region '<aws-region>' \
  --bucket '<source-bucket>' \
  --prefix '<source-wal-root>' \
  --max-keys 5
```

Do not create the follower unless the seed backup is complete, both commands
return objects, the source WAL cleaner remains disabled, all source selectors
match the intended store, and the source can later be stopped and restarted once
with `replication.role=primary-catchup-uploads`. Copy the backup prefix, WAL
prefix, and backup instance name exactly into the follower specification; those
source selectors are immutable.

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

```sh
kubectl wait questdbcluster/<follower-cluster> -n <namespace> \
  --for=jsonpath='{.status.phase}'=Following --timeout=30m
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

Record the UTC cutover start time:

```sh
date -u +%FT%TZ
```

Keep this timestamp so you can confirm that the first completed backup happened
after cutover began.

Then perform these steps with the external source's service manager or container
runtime:

1. Stop all application writes to the external source.
2. Stop the source QuestDB process.
3. Configure the source to start once with
   `replication.role=primary-catchup-uploads`.
4. Start the source and watch its logs.
5. Wait for the source process to exit with code `0`. A non-zero exit means the
   final WAL upload did not complete; do not promote.
6. Disable automatic restarts.

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

Wait for the promoted cluster to report `Running`:

```sh
kubectl wait questdbcluster/<follower-cluster> -n <namespace> \
  --for=jsonpath='{.status.phase}'=Running --timeout=20m
kubectl get questdbcluster <follower-cluster> -n <namespace> -o wide
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

First, record the primary pod's current UID:

```sh
kubectl get pod <follower-cluster>-1 -n <namespace> \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid'
```

Then wait for the first backup to complete and print its completion time:

```sh
kubectl wait questdbcluster/<follower-cluster> -n <namespace> \
  --for=jsonpath='{.status.backup.lastBackup.status}'=completed --timeout=75m
kubectl get questdbcluster <follower-cluster> -n <namespace> \
  -o jsonpath='{.status.backup.lastBackup.endTime}{" completed\n"}'
```

Confirm that the completion time is later than the cutover start time recorded
in step 5.

Releasing the WAL cleaner rolls the primary once. Watch the pod until it has a
new UID and is ready, then press Control-C:

```sh
kubectl get pod <follower-cluster>-1 -n <namespace> --watch \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,READY:.status.containerStatuses[0].ready,PHASE:.status.phase'
```

After the new pod appears, repeat the writer-health check from the previous step
and require it to settle before declaring the migration complete.

For emergency source loss, multiple followers, or detailed failure handling, use
the full
[high-availability migration runbook](/docs/enterprise-kubernetes-operator/high-availability/#migrate-an-existing-questdb-onto-the-operator).
