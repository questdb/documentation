---
title: High availability
description: Operate replication, planned promotion, emergency failover, and migration with the Kubernetes Operator.
---

# High availability

Store-backed replication has one primary and zero or more replicas. A new replica is born from a completed backup, then consumes the primary's object-store WAL.

For more information about replication mechanics, please refer to the [official documentation](/docs/high-availability/overview/).

Before running any command, replace every `<angle-bracket>` value; an unreplaced placeholder can be interpreted as shell redirection.

`status.replication.replicas[].caughtUp` is a sticky "caught up at least once" latch used for read routing. `caughtUpNow` is the current observation used by lossless promotion: `true` means reachable, unsuspended, and at zero observed lag; `false` means behind; absent means the operator could not determine freshness. An absent value fails closed.

## Failure behavior

There is no automatic promotion or failover decision.

| Failure | Operator behavior |
| --- | --- |
| Primary pod is lost, PVC survives, and fencing is safe | Recreate the same primary identity on its PVC. |
| Primary is stranded on an unreachable node | Report `InstanceUnreachable`; do not risk a second writer. |
| Established primary PVC is missing or Terminating | Fence the primary Pod, set `PromotionRequired=True`, remove ready RW endpoints, and do not create an empty replacement primary. |
| Replica is lost | Recreate/re-seed it from backup and WAL when prerequisites are available. |

A `QuestDBPromotion` records one explicit, one-shot cutover and remains as its audit object. If a same-name primary Pod was recreated before its PVC deletion began, do not wait forever for the mounted Terminating claim: current operator versions automatically fence that established Pod so `pvc-protection` can release the PVC. `status.currentPrimary` remains the non-empty primary of record until an explicit promotion; fencing is not automatic failover.

## Promotion and failover

| Mode | Use | Data effect |
| --- | --- | --- |
| `Planned` | Healthy primary and live replica | Drains the old primary and verifies the target before promotion. Fails rather than becoming lossy. |
| `Emergency` | Primary is lost/wedged and service restoration outweighs data loss | Skips the drain. Unreplicated writes may be lost, but QWP clients using [durable acknowledgements](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in) retain and retry writes that were not durably acknowledged. |

### Planned prechecks

Start only when the ordinary writer-health contract is current (`Available=True/PrimaryReady`, `Progressing=False/Settled`, and `WriteHealthy=True/Healthy`), the target is a live replica, and its `caughtUpNow` is explicitly `true`. `WriteHealthy=True` is an observation, not a synthetic write or disk-capacity guarantee:

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='generation={.metadata.generation}{" observed="}{.status.observedGeneration}{" primary="}{.status.currentPrimary}{"\n"}{range .status.replication.replicas[*]}{.instance}{" caughtUpNow="}{.caughtUpNow}{" lagTxns="}{.lagTxns}{" suspended="}{.suspendedTables}{"\n"}{end}'
kubectl get pods -n <namespace> -l questdb.io/cluster=<name> \
  -L questdb.io/instance,questdb.io/role -o wide
```

Choose the integer serial from the target instance name (`<name>-2` has target `2`). Confirm no active cutover:

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.status.replication.activePromotion}{"\n"}'
```

The defaults reflect two different costs:

- `catchUpTimeoutSeconds: 900` bounds pre-drain catch-up while the old primary continues serving writes.
- `primaryGracePeriodSeconds: 120` bounds loss-of-primary and post-drain tail verification while writes are unavailable.
- `0` means wait indefinitely, not "do not wait". Use it only after accepting an unbounded outage/wait.

### Create and watch

```sh
kubectl apply -f - <<EOF
apiVersion: questdb.io/v1alpha1
kind: QuestDBPromotion
metadata:
  name: <promotion-name>
  namespace: <namespace>
spec:
  clusterRef:
    name: <name>
  target: <target-serial>
  mode: Planned
  catchUpTimeoutSeconds: 900
  primaryGracePeriodSeconds: 120
EOF
```

Use a bounded progress loop that stops on both success and failure without terminating your interactive shell:

```sh
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
  -o jsonpath='{.status.phase}{" "}{.status.reason}{": "}{.status.message}{"\n"}'
[ "$PHASE" = "Completed" ]
```

The final test succeeds only for `Completed`; `Failed` and the 30-minute timeout return a non-zero command status after printing the latest reason/message, without calling `exit`.

### Verify

```sh
kubectl get questdbpromotion <promotion-name> -n <namespace> \
  -o jsonpath='phase={.status.phase}{" mode="}{.status.mode}{" reason="}{.status.reason}{" message="}{.status.message}{"\n"}'
kubectl get questdbcluster <name> -n <namespace> -o wide
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-rw
```

Confirm `status.currentPrimary` names the target and require current-generation `Available=True/PrimaryReady`, `Progressing=False/Settled`, and `WriteHealthy=True/Healthy`. Test `<name>-rw` connectivity, critical table timestamps/row counts, and application writes before closing the change. Confirm replicas return healthy after the demoted primary is re-seeded. Finally inspect PVC labels: the target PVC must have `questdb.io/role=primary`, while every demoted/re-seeded replica PVC must have `questdb.io/role=replica`. The separate `questdb.io/bootstrap` label records ancestry/state and does not identify the current role.

## Emergency promotion

Use the same object shape with `mode: Emergency` only after selecting a live target and accepting data loss.

:::danger
Emergency promotion may lose writes that the old primary had not replicated. QWP clients configured with [durable acknowledgements](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in) retain writes until object-store durability is confirmed and retry unacknowledged writes after connecting to the new primary. Clients connected directly to the old pod can briefly receive acknowledgements for writes that will be discarded while it detects loss of store ownership. Stop/repoint writers and use the stable `<name>-rw` Service, not pod addresses.
:::

```sh
kubectl apply -f - <<EOF
apiVersion: questdb.io/v1alpha1
kind: QuestDBPromotion
metadata:
  name: <promotion-name>
  namespace: <namespace>
spec:
  clusterRef:
    name: <name>
  target: <target-serial>
  mode: Emergency
EOF
```

Use the bounded terminal-phase watcher above and perform the same primary, full writer-health, connectivity, data, and PVC current-role checks. Before promotion, the fenced loss state must have zero ready `<name>-rw` EndpointSlice endpoints; afterward the selected target is the only live primary. Record the accepted recovery point and any expected lost-write window.

## If promotion stalls or fails

Read the promotion's status first:

```sh
kubectl get questdbpromotion <promotion-name> -n <namespace> \
  -o jsonpath='phase={.status.phase}{" mode="}{.status.mode}{" reason="}{.status.reason}{" message="}{.status.message}{"\n"}'
```

- A running `Planned` cutover may be escalated against the **same immutable target**. Do not create a second promotion while one is active; it is refused.
- A terminal `Failed` object is one-shot. Retry with a new name/object after correcting the cause.
- Deleting in `Pending` or `Validating` cancels because nothing has been shaped.
- Deleting in `Draining` or `Promoting` does not abort. The finalizer holds the object while the cutover continues.

:::danger
Escalating an in-flight cutover to `Emergency` abandons the lossless drain and accepts loss of unreplicated writes.
:::

```sh
kubectl patch questdbpromotion <promotion-name> -n <namespace> --type merge \
  -p '{"spec":{"mode":"Emergency"}}'
```

A live but hung drain can remain in `Draining` because the operator cannot distinguish a slow final upload from a wedged one; escalation is the human decision. `Promoting` is also unbounded while the target fails to serve. Diagnose the target pod, image pull, scheduling, PVC, Secret, network, and object-store access. Do not start by removing the promotion finalizer: that deletes the audit/control object but neither stops nor rolls back the shaped cutover. Contact support before considering it.

## Migrate an existing QuestDB onto the operator

A follower reduces migration downtime by restoring the source's backup and consuming its WAL while the external source continues serving.

### Source prerequisites

The source must:

- run a compatible QuestDB Enterprise version;
- create completed backups in a known object-store backup root;
- upload replication WAL to a known root in the same store;
- retain WAL back to the seed backup;
- expose its exact `SELECT backup_instance_name();` value; and
- support a controlled stop and one final `primary-catchup-uploads` run.

The operator never connects to, configures, stops, fences, or lists storage for the source.

### Create and verify the follower

All source selectors are immutable. Confirm `sourceInstanceName`, backup root, and WAL root before creating the cluster. Copy the working tenant cluster's `spec.image` and `spec.imagePullSecrets`: set `<questdb-enterprise-image>` to that private image and `<tenant-image-pull-secret>` to the pull Secret in this namespace. Remove the entire `imagePullSecrets` block only when every node has ambient pull access, such as an authorized EKS worker-node role.

```yaml
apiVersion: questdb.io/v1alpha1
kind: QuestDBCluster
metadata:
  name: <name>
  namespace: <namespace>
spec:
  image: <questdb-enterprise-image>
  imagePullSecrets:
    - name: <tenant-image-pull-secret>
  instances: 2
  storage:
    storageClassName: <storage-class>
    size: 100Gi
  objectStoreRef:
    name: <source-store>
  backup:
    enabled: true
    schedule: "0 * * * *"
    root: <source-backup-root>
  replication:
    root: <source-wal-root>
  bootstrap:
    follow:
      sourceInstanceName: <source-backup-instance-name>
```

A healthy follower has `.status.replication.following=true`, no current primary, an empty `<name>-rw`, and reads through `<name>-ro`. It intentionally omits `WriteHealthy` because it has no primary; do not wait for that condition. Verify all instances and `ReplicationHealthy`; a quiet source can make progress indeterminate, so also confirm the immutable source identity and roots directly against the source configuration.

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='following={.status.replication.following}{" primary="}{.status.currentPrimary}{"\n"}{range .status.conditions[?(@.type=="ReplicationHealthy")]}{.status}{" "}{.reason}{" "}{.message}{"\n"}{end}{.status.replication.stream}{"\n"}'
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-rw
```

### Cut over

Immediately before stopping the source, record when cutover preparation began in the same Bash shell you will use for the post-cutover check:

```bash
CUTOVER_TIME_CAPTURED=false
CUTOVER_STARTED_AT=""
if CUTOVER_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" && \
   [ -n "$CUTOVER_STARTED_AT" ]; then
  CUTOVER_TIME_CAPTURED=true
fi
[ "$CUTOVER_TIME_CAPTURED" = true ] && \
  printf 'Cutover preparation started at: %s\n' "$CUTOVER_STARTED_AT"
```

1. Stop application writes to the source, then stop the source database.
2. Restart the source once with `replication.role=primary-catchup-uploads`.
3. Wait for `CLOSE_REASON_UPLOADS_COMPLETE_SUCCESS` in the **source** logs, then stop it again. This final upload may itself be unbounded; supervise it at the source. A normal shutdown does not prove the tail reached object storage.
4. Create a `Planned` `QuestDBPromotion` for a healthy follower instance and use the bounded watcher above.

The planned follower gate requires the source stream to remain quiet for at least 60 seconds and the target to consume the published WAL before promotion. It still cannot prove an idle source process is stopped. If the engine reports `SourceStillOwnsStore`, stop the source fully and retry with a new promotion object.

:::danger
Emergency follower promotion accepts losing source WAL that was not uploaded or not consumed. Use it only when the source cannot be drained and that loss is explicitly accepted.
:::

5. After a completed cutover, verify `<name>-rw`, data, writes, and `currentPrimary`.
6. Permanently decommission the source so it cannot restart and contend for the adopted WAL root.
7. Wait for this cluster's own first post-cutover backup. The hourly deadline must exceed one schedule interval plus the roughly two-minute observation delay, so this check allows about 75 minutes. Do not accept an old `completed` status: require a non-empty `endTime` later than the captured cutover-start time. Both values are RFC3339 UTC timestamps, so the Bash string comparison proves the observed backup completed after cutover preparation began. The WAL cleaner remains off until this backup completes; its release rolls the primary once. Verify the roll and writer readiness afterward.

```bash
BACKUP_VERIFIED=false
STATUS=""
END_TIME=""
for _ in $(seq 1 450); do
  STATUS="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.backup.lastBackup.status}')"
  END_TIME="$(kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{.status.backup.lastBackup.endTime}')"
  if [ "${CUTOVER_TIME_CAPTURED:-false}" = true ] && \
     [ "$STATUS" = "completed" ] && [ -n "$END_TIME" ] && \
     [[ "$END_TIME" > "$CUTOVER_STARTED_AT" ]]; then
    BACKUP_VERIFIED=true
    break
  fi
  [ "$STATUS" = "failed" ] && break
  sleep 10
done
[ "$BACKUP_VERIFIED" = true ] && \
  kubectl get questdbcluster <name> -n <namespace> \
    -o jsonpath='{range .status.conditions[?(@.type=="Available")]}Available={.status}{"/"}{.reason}{"\n"}{end}{range .status.conditions[?(@.type=="Progressing")]}Progressing={.status}{"/"}{.reason}{"\n"}{end}{range .status.conditions[?(@.type=="WriteHealthy")]}WriteHealthy={.status}{"/"}{.reason}{"\n"}{end}'
```

After the roll, require `Available=True/PrimaryReady`, `Progressing=False/Settled`, and `WriteHealthy=True/Healthy` at the current generation before declaring the cluster writer-ready and the WAL cleaner released.
