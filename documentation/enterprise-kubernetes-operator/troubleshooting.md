---
title: Troubleshoot the Kubernetes Operator
description:
  Diagnose Operator and QuestDB cluster conditions, events, logs, and
  object-store configuration.
---

# Troubleshooting

Diagnose from the API outward. Avoid deleting pods, PVCs, or promotion objects
until status and events have been captured.

Before running any command, replace every `<angle-bracket>` value; an unreplaced
placeholder can be interpreted as shell redirection.

## First response

1. **Generation:** confirm `.metadata.generation == .status.observedGeneration`.
2. **Conditions:** read every status, reason, message, and condition generation.
3. **Events:** inspect the cluster and namespace event timeline.
4. **Kubernetes objects:** inspect pods, PVCs, Services, endpoints, nodes, and
   scheduling.
5. **Logs:** then read operator logs and the relevant QuestDB/init-container
   logs.

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='generation={.metadata.generation}{" observed="}{.status.observedGeneration}{" phase="}{.status.phase}{"\n"}{range .status.conditions[*]}{.type}{"="}{.status}{" reason="}{.reason}{" observed="}{.observedGeneration}{" message="}{.message}{"\n"}{end}'
kubectl describe questdbcluster <name> -n <namespace>
kubectl get events -n <namespace> --sort-by=.metadata.creationTimestamp
kubectl get pods,services -n <namespace> -l questdb.io/cluster=<name> -o wide
kubectl get pvc -n <namespace> -l questdb.io/cluster=<name> \
  -L questdb.io/role,questdb.io/bootstrap -o wide
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-rw
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-ro
```

If status is stale, check manager readiness, logs, RBAC, webhook/API
connectivity, and events in `questdb-operator-system` before diagnosing an old
condition.

## Decision table

| Signal or symptom                                                            | Meaning                                                                                                                                                                     | Next checks                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigRejected=True`                                                        | An engine setting is invalid, injection-prone, or operator-owned.                                                                                                           | Read reason/message; remove the rejected key from `spec.config` or `spec.replication.config`. Keys must match `^[A-Za-z0-9._-]+$`; values must not contain line separators. Compare with [Configuration](/docs/enterprise-kubernetes-operator/configuration/#extra-engine-options).                                                                                                                         |
| `TLSReady=True/Ready`                                                        | PGWire TLS is applied and the operator can use verified SQL when TLS was selected at creation.                                                                              | Keep clients on TLS and monitor certificate expiry/rotation.                                                                                                                                                                                                                                                                                                                                                |
| `TLSReady=True/VerificationDisabled`                                         | PGWire TLS encryption is active, but operator certificate/hostname authentication is disabled.                                                                              | Treat this as development-only; remove `insecureSkipVerify` after installing a trusted certificate.                                                                                                                                                                                                                                                                                                         |
| `TLSReady=False`                                                             | Requested PGWire TLS cannot be applied or the stored cluster attempts to add/remove the TLS block after creation.                                                           | Read reason/message. For `SecretNotFound` or `InvalidSecret`, verify Secret namespace/name, `tls.crt`, `tls.key`, optional `ca.crt`, certificate validity, server-auth usage, trust chain, and SAN/serverName. For `ImmutableModeChange` or `AppliedModeUnknown`, return the spec to the original transport mode or create a new cluster. Do not work around it by switching operator traffic to plaintext. |
| `OperatorIdentityReady=False`                                                | The operator could not provision/converge its least-privilege `questdb_operator` **SQL service account** from the admin identity. It is not cloud or object-store identity. | Check QuestDB pgwire reachability, admin Secret name/keys/permissions, ACL settings, and the condition reason. `WaitingForInstance` and brief `QuestDBUnreachable` can be boot states; persistent `AdminInsufficient` needs credential/privilege correction.                                                                                                                                                |
| `WriteHealthy=False/PrimaryNotReady`                                         | The primary is not Ready, so WAL write health cannot be established.                                                                                                        | Diagnose primary Pod readiness, scheduling, mounts, probes, resources, and logs. Do not infer healthy writes from a read-serving replica or `Available=True`.                                                                                                                                                                                                                                               |
| `WriteHealthy=False/PrimarySuspended`                                        | One or more named primary WAL tables are write-impaired; reads and other tables can remain available.                                                                       | Read the condition message for every table; inspect `wal_tables()`, QuestDB logs, table/disk state, and application errors. `Available=True` does not override this failure.                                                                                                                                                                                                                                |
| `WriteHealthy=Unknown`                                                       | Operator identity is not ready, or the latest `wal_tables()` query/observation was unavailable or failed.                                                                   | Read reason/message; check operator SQL identity, pgwire reachability, and logs. Do not infer healthy writes from `Available=True`.                                                                                                                                                                                                                                                                         |
| `BackupHealthy=Unknown`                                                      | No observed backup yet, an engine run is still progressing within its threshold, or configuration cannot be observed.                                                       | Confirm schedule, `status.backup.configured`, `lastBackup.status`, `lastProgressAt`, manager observation delay, store config, and primary logs.                                                                                                                                                                                                                                                             |
| `BackupHealthy=False/Failed`                                                 | Latest observed engine backup run failed.                                                                                                                                   | Read `.status.backup.lastBackup.error`; check pod identity/static Secret, prefix permissions, DNS/network, and provider service health.                                                                                                                                                                                                                                                                     |
| `BackupHealthy=False/Stalled`                                                | The engine run remains `in_progress`, but `progressPercent` has not changed since `lastProgressAt` for `stalledAfterSeconds`.                                               | Inspect `lastBackup`, `lastProgressAt`, database logs, IAM/Secret, network, and object-store health. Default threshold is 3600 seconds; explicit `0` disables detection and does not cancel the run.                                                                                                                                                                                                        |
| `ReplicationHealthy=False` or `Unknown`                                      | Replicas are suspended, behind, unreachable, unseeded, or freshness was not determined.                                                                                     | Inspect `.status.replication.seed`, `replicas[]`, `caughtUpNow`, `lagTxns`, and `suspendedTables`; then database metrics/logs and object-store access. Absent freshness is not zero lag.                                                                                                                                                                                                                    |
| `InstanceUnreachable=True`                                                   | Operator cannot safely observe an instance, or its node is unreachable.                                                                                                     | Inspect pod readiness, node Ready condition, pgwire/metrics network paths, probes, CPU/memory pressure, and logs. Do not force-create another primary.                                                                                                                                                                                                                                                      |
| `PromotionRequired=True`                                                     | Established primary PVC is missing/Terminating; the operator fences its Pod, refuses an empty replacement, preserves `currentPrimary`, and does not auto-promote.           | Confirm PVC/PV/cloud-disk and zero ready RW endpoints. Restore the volume or select a replica and follow [promotion and failover](/docs/enterprise-kubernetes-operator/high-availability/#promotion-and-failover), accepting emergency loss when a drain is impossible.                                                                                                                                     |
| `Recovered=True`                                                             | Engine reported restore completion.                                                                                                                                         | Still validate actual tables, timestamps, and row counts before traffic.                                                                                                                                                                                                                                                                                                                                    |
| `RecoveryFailed=True`                                                        | Restore init/runtime failed or was incomplete.                                                                                                                              | Read reason/message and genesis init logs; verify source store/root/instance/target. `RestoreError` on an older-than-retained PITR target is fail-closed. `spec.bootstrap` is immutable, so correct it in a fresh destination. Source instance names must match `^[a-z0-9]+(-[a-z0-9]+)*$`.                                                                                                                 |
| `StorageResizeBlocked=True`                                                  | StorageClass/CSI expansion is unavailable.                                                                                                                                  | Confirm `allowVolumeExpansion`, driver support, PVC events, and requested size. Never shrink; restore to a new class if needed.                                                                                                                                                                                                                                                                             |
| `Progressing=True/RollingUpdate`                                             | The controller is rolling or safely holding a mutable spec change.                                                                                                          | Check Pods, PVCs, peer health, Node readiness, and read-route labels. The hold may be protecting topology, storage, peer, Node, or read-routing conditions rather than being stuck.                                                                                                                                                                                                                         |
| Promotion `Pending`/`Validating`                                             | Request awaits acceptance, catch-up, or drain prerequisites.                                                                                                                | Read `.status.reason/message`, active promotion, target live status, and `caughtUpNow`. A request left Pending for 10 minutes becomes `StaleRequest`.                                                                                                                                                                                                                                                       |
| Promotion `Draining`                                                         | Old primary is stopping writes and uploading its tail, or target is replaying it.                                                                                           | Check old-primary and target logs. A live hung upload is not automatically timed out; decide whether to continue or explicitly escalate with data-loss acceptance.                                                                                                                                                                                                                                          |
| Promotion `Stalled=True/TargetNotPrimary`                                    | The target has been shaped but has not become the serving primary.                                                                                                          | Diagnose target Pod readiness, image, scheduling, PVC, Secret, network, and store access.                                                                                                                                                                                                                                                                                                                   |
| Promotion `Stalled=True/FenceNotEffective`                                   | The target reports that the old owner still holds the stream. Fencing is not relaxed.                                                                                       | If the old Pod remains on a NotReady node, power off or otherwise isolate the machine, then use Kubernetes' out-of-service procedure. Do not remove the finalizer while the old process may run.                                                                                                                                                                                                            |
| Promotion `Promoting`                                                        | Target has been shaped as primary but has not served yet.                                                                                                                   | Diagnose target image, scheduling, PVC mount, Secret, network, and store access. This phase and its deletion finalizer are unbounded.                                                                                                                                                                                                                                                                       |
| Promotion `Failed`                                                           | One-shot cutover ended.                                                                                                                                                     | Read `.status.reason` and `.status.message`; correct the cause and create a new promotion name. Do not patch the terminal object.                                                                                                                                                                                                                                                                           |
| `ImagePullBackOff` / `ErrImagePull`                                          | Kubelet cannot pull operator or QuestDB image.                                                                                                                              | Check the correct namespace's imagePullSecret metadata, repository/tag, node registry reachability, and entitlement. Operator and database pull credentials are separate.                                                                                                                                                                                                                                   |
| PVC `Pending`                                                                | No matching volume can bind.                                                                                                                                                | Describe PVC; check StorageClass, topology, quota, CSI controller, capacity, and cloud events.                                                                                                                                                                                                                                                                                                              |
| Primary PVC `Terminating`                                                    | Deletion is in progress; a mounted same-name primary Pod may hold `pvc-protection`.                                                                                         | Do not remove the finalizer. Current versions fence an established primary Pod automatically. Watch for the Pod to terminate, the old PVC UID to disappear, `PromotionRequired=True`, and zero ready RW endpoints.                                                                                                                                                                                          |
| Pod `Pending`                                                                | Scheduler or volume attachment cannot place it.                                                                                                                             | Describe pod; check requests, taints/tolerations, affinity, topology, PDB context, PVC binding, and single-node disk attachment.                                                                                                                                                                                                                                                                            |
| Store Secret/IAM/network error                                               | QuestDB pod cannot read/write object storage.                                                                                                                               | Confirm the `QuestDBObjectStore` provider fields, referenced Secret **names and keys** (not values), pod cloud identity, prefix-level IAM, DNS, HTTPS egress, endpoint, region/account, and provider audit logs.                                                                                                                                                                                            |
| Follower has no primary, no `WriteHealthy`, and `<name>-rw` has no endpoints | Healthy follower behavior when `.status.replication.following=true`.                                                                                                        | Do not wait for `WriteHealthy`; use `<name>-ro` for reads and complete the migration cutover when ready.                                                                                                                                                                                                                                                                                                    |

## Primary PVC deletion and fencing

For an established replicated primary, missing or Terminating storage is a fence
condition. This includes the Pod-delete → replacement → PVC-delete race: the
replacement may become Ready on the old PVC before deletion starts, but the
current operator then deletes that Pod so Kubernetes can release the claim. Do
not keep waiting indefinitely, create a same-name PVC manually, remove
`pvc-protection`, or send clients directly to the Pod.

Watch identities and routing with bounded commands:

```sh
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='currentPrimary={.status.currentPrimary}{" PromotionRequired="}{.status.conditions[?(@.type=="PromotionRequired")].status}{"/"}{.status.conditions[?(@.type=="PromotionRequired")].reason}{"\n"}'
kubectl get pod <primary-instance> -n <namespace> \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,DELETING:.metadata.deletionTimestamp'
kubectl get pvc <primary-instance> -n <namespace> \
  -o custom-columns='NAME:.metadata.name,UID:.metadata.uid,ROLE:.metadata.labels.questdb\.io/role,BOOTSTRAP:.metadata.labels.questdb\.io/bootstrap,DELETING:.metadata.deletionTimestamp'
kubectl get endpointslice -n <namespace> \
  -l kubernetes.io/service-name=<name>-rw -o yaml
```

The fenced state keeps a non-empty `status.currentPrimary` as the primary of
record but has no ready RW endpoint and no replacement primary PVC. Recover the
original storage if possible; otherwise select a live replica and make the
explicit Emergency decision. After promotion, verify
`WriteHealthy=True/Healthy`, exactly one live primary, target PVC
`questdb.io/role=primary`, and final replica PVCs `questdb.io/role=replica`.
`questdb.io/bootstrap` remains ancestry/state and must not be used as current
role.

## Inspect logs

Operator logs:

```sh
kubectl logs -n questdb-operator-system \
  deployment/questdb-operator-controller-manager \
  -c manager --since=30m --tail=1000
```

Database and prior-crash logs:

```sh
kubectl logs -n <namespace> <instance-name> -c questdb --since=30m --tail=1000
kubectl logs -n <namespace> <instance-name> -c questdb \
  --previous --tail=500
kubectl get pod <instance-name> -n <namespace> \
  -o jsonpath='{.spec.initContainers[*].name}{"\n"}'
kubectl logs -n <namespace> <instance-name> \
  -c <init-container-name> --tail=500
```

Do not paste credentials from logs or custom resources into a shared ticket.
Redact according to your policy.

## Object-store configuration has no readiness status

`QuestDBObjectStore` is a validated configuration holder, not a managed
bucket/container and not a probe controller. It has no status condition to wait
for. Diagnose it through the consuming cluster's `BackupHealthy`,
`ReplicationHealthy`, or recovery conditions and through QuestDB pod logs, cloud
identity/audit logs, and network tests. The operator itself has no object-store
permissions and cannot list or clean the store.

If the cause remains unclear, collect the
[support bundle](/docs/enterprise-kubernetes-operator/support/#collect-a-support-bundle)
before changing the failing resources.
