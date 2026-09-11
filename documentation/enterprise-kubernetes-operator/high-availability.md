---
title: High availability
description:
  Operate replication, planned promotion, emergency failover, and migration with
  the Kubernetes Operator.
---

# High availability

Store-backed replication has one primary and zero or more replicas. A new
replica is born from a completed backup, then consumes the primary's
object-store WAL.

For more information about replication mechanics, please refer to the
[official documentation](/docs/high-availability/overview/).

Before running any command, replace every `<angle-bracket>` value; an unreplaced
placeholder can be interpreted as shell redirection.

`status.replication.replicas[].caughtUp` is a sticky "caught up at least once"
latch used for read routing. On an ordinary cluster, `caughtUpNow=true` means
reachable, unsuspended, self-consistent, and either exactly zero lag or bounded
streaming: the replica has applied everything the primary committed within the
operator's short lookback window. On a primaryless follower, only the zero-lag
proof is available. `false` means behind or stale; absent means freshness was
not determined and fails closed.

## Failure behavior

There is no automatic promotion or failover decision.

| Failure                                                | Operator behavior                                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Primary pod is lost, PVC survives, and fencing is safe | Recreate the same primary identity on its PVC.                                                                                  |
| Primary is stranded on an unreachable node             | Report `InstanceUnreachable`; do not risk a second writer.                                                                      |
| Established primary PVC is missing or Terminating      | Fence the primary Pod, set `PromotionRequired=True`, remove ready RW endpoints, and do not create an empty replacement primary. |
| Replica is lost                                        | Recreate/re-seed it from backup and WAL when prerequisites are available.                                                       |

A `QuestDBPromotion` records one explicit, one-shot cutover and remains as its
audit object. If a same-name primary Pod was recreated before its PVC deletion
began, do not wait forever for the mounted Terminating claim: current operator
versions automatically fence that established Pod so `pvc-protection` can
release the PVC. `status.currentPrimary` remains the non-empty primary of record
until an explicit promotion; fencing is not automatic failover.

## Promotion and failover

:::note

The operator performs a cutover by changing configuration and re-rolling pods.
It does not use the database's in-place
[role switch](/docs/high-availability/failover/) (`SWITCH ROLE`,
`POST /lifecycle/switch`). Do not run those against instances managed by the
operator: `status.currentPrimary` and the PVC role labels would no longer
describe the cluster.

:::

| Mode        | Use                                                                | Data effect                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Planned`   | Healthy primary and live replica                                   | Drains the old primary and verifies the target before promotion. Fails rather than becoming lossy.                                                                                                                                                |
| `Emergency` | Primary is lost/wedged and service restoration outweighs data loss | Skips the drain. Unreplicated writes may be lost, but QWP clients using [durable acknowledgements](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in) retain and retry writes that were not durably acknowledged. |

### Planned prechecks

Start only when the ordinary writer-health contract is current
(`Available=True/PrimaryReady`, `Progressing=False/Settled`, and
`WriteHealthy=True/Healthy`), the target is a live replica, and its
`caughtUpNow` is explicitly `true`. `WriteHealthy=True` is an observation, not a
synthetic write or disk-capacity guarantee:

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='generation={.metadata.generation}{" observed="}{.status.observedGeneration}{" primary="}{.status.currentPrimary}{"\n"}{range .status.replication.replicas[*]}{.instance}{" caughtUpNow="}{.caughtUpNow}{" lagTxns="}{.lagTxns}{" suspended="}{.suspendedTables}{"\n"}{end}'
kubectl get pods -n <namespace> -l questdb.io/cluster=<name> \
  -L questdb.io/instance,questdb.io/role -o wide
```

Choose the integer serial from the target instance name (`<name>-2` has target
`2`). Confirm no active cutover:

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.status.replication.activePromotion}{"\n"}'
```

The defaults reflect two different costs:

- `catchUpTimeoutSeconds: 900` bounds pre-drain catch-up while the old primary
  continues serving writes.
- `primaryGracePeriodSeconds: 120` bounds loss-of-primary and post-drain tail
  verification while writes are unavailable.
- `0` means wait indefinitely, not "do not wait". Use it only after accepting an
  unbounded outage/wait.

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

Use a bounded progress loop that stops on both success and failure without
terminating your interactive shell:

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

The final test succeeds only for `Completed`; `Failed` and the 30-minute timeout
return a non-zero command status after printing the latest reason/message,
without calling `exit`.

### Verify

```sh
kubectl get questdbpromotion <promotion-name> -n <namespace> \
  -o jsonpath='phase={.status.phase}{" mode="}{.status.mode}{" reason="}{.status.reason}{" message="}{.status.message}{"\n"}'
kubectl get questdbcluster <name> -n <namespace> -o wide
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-rw
```

Confirm `status.currentPrimary` names the target and require current-generation
`Available=True/PrimaryReady`, `Progressing=False/Settled`, and
`WriteHealthy=True/Healthy`. Test `<name>-rw` connectivity, critical table
timestamps/row counts, and application writes before closing the change. Confirm
replicas return healthy after the demoted primary is re-seeded. Finally inspect
PVC labels: the target PVC must have `questdb.io/role=primary`, while every
demoted/re-seeded replica PVC must have `questdb.io/role=replica`. The separate
`questdb.io/bootstrap` label records ancestry/state and does not identify the
current role.

## Emergency promotion

Use the same object shape with `mode: Emergency` only after selecting a live
target and accepting data loss.

:::danger Emergency promotion may lose writes that the old primary had not
replicated. QWP clients configured with
[durable acknowledgements](/docs/high-availability/store-and-forward/when-to-use/#durable-ack-when-to-opt-in)
retain writes until object-store durability is confirmed and retry
unacknowledged writes after connecting to the new primary. Clients connected
directly to the old pod can briefly receive acknowledgements for writes that
will be discarded while it detects loss of store ownership. Stop/repoint writers
and use the stable `<name>-rw` Service, not pod addresses. :::

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

Use the bounded terminal-phase watcher above and perform the same primary, full
writer-health, connectivity, data, and PVC current-role checks. Before
promotion, the fenced loss state must have zero ready `<name>-rw` EndpointSlice
endpoints; afterward the selected target is the only live primary. Record the
accepted recovery point and any expected lost-write window.

## If promotion stalls or fails

Read the promotion's status first:

```sh
kubectl get questdbpromotion <promotion-name> -n <namespace> \
  -o jsonpath='phase={.status.phase}{" mode="}{.status.mode}{" reason="}{.status.reason}{" message="}{.status.message}{"\n"}{range .status.conditions[*]}{.type}{"="}{.status}{" reason="}{.reason}{" message="}{.message}{"\n"}{end}'
```

- `Stalled=True/TargetNotPrimary` means the shaped target has not become the
  serving primary.
- `Stalled=True/FenceNotEffective` means the target reports that the old owner
  still holds the stream. If the old Pod remains on a NotReady node, first power
  off or otherwise isolate that machine, then apply Kubernetes' out-of-service
  procedure. Do not remove the finalizer or force ownership while the old
  process may run. `Stalled` is an alarm, not a terminal failure or relaxation
  of fencing.
- A running `Planned` cutover may be escalated against the **same immutable
  target**. Do not create a second promotion while one is active; it is refused.
- A terminal `Failed` object is one-shot. Retry with a new name/object after
  correcting the cause.
- Deleting in `Pending` or `Validating` cancels because nothing has been shaped.
- Deleting in `Draining` or `Promoting` does not abort. The finalizer holds the
  object while the cutover continues.

:::danger Escalating an in-flight cutover to `Emergency` abandons the lossless
drain and accepts loss of unreplicated writes. :::

```sh
kubectl patch questdbpromotion <promotion-name> -n <namespace> --type merge \
  -p '{"spec":{"mode":"Emergency"}}'
```

A live but hung drain can remain in `Draining` because the operator cannot
distinguish a slow final upload from a wedged one; escalation is the human
decision. `Promoting` is also unbounded while the target fails to serve.
Diagnose the target pod, image pull, scheduling, PVC, Secret, network, and
object-store access. Do not start by removing the promotion finalizer: that
deletes the audit/control object but neither stops nor rolls back the shaped
cutover. Contact support before considering it.

## Migrate an existing QuestDB onto the operator

Use the [migration guide](/docs/enterprise-kubernetes-operator/getting-started/migrate/)
for the canonical replica-first migration procedure.

If the source is lost before it can be drained, see
[Emergency promotion](#emergency-promotion). For diagnosis and recovery from a
cutover problem, see [If promotion stalls or fails](#if-promotion-stalls-or-fails).
