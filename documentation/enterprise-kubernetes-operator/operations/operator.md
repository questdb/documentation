---
title: Operator operations
description: Monitor, upgrade, roll back, and safely remove the Kubernetes Operator.
---

# Operator operations

The operator is cluster-scoped and normally runs in `questdb-operator-system`. An operator outage does not stop existing QuestDB pods, but it stops reconciliation and failover workflows.

Before running any command, replace every `<angle-bracket>` value; an unreplaced placeholder can be interpreted as shell redirection.

## Check the manager

```sh
kubectl rollout status deployment/questdb-operator-controller-manager \
  -n questdb-operator-system --timeout=5m

kubectl get deployment/questdb-operator-controller-manager \
  -n questdb-operator-system \
  -o jsonpath='ready={.status.readyReplicas}/{.status.replicas}{" image="}{.spec.template.spec.containers[?(@.name=="manager")].image}{"\n"}'

helm list -n questdb-operator-system
helm status questdb-operator -n questdb-operator-system
```

The manager exposes `/healthz` for liveness and `/readyz` for readiness on port 8081 inside its pod. Confirm the configured probes and recent results:

```sh
kubectl describe deployment/questdb-operator-controller-manager \
  -n questdb-operator-system
kubectl get pods -n questdb-operator-system \
  -l control-plane=controller-manager -o wide
```

Read current logs and Kubernetes events before restarting anything:

```sh
kubectl logs -n questdb-operator-system \
  deployment/questdb-operator-controller-manager \
  -c manager --since=30m --tail=1000
kubectl get events -n questdb-operator-system \
  --sort-by=.metadata.creationTimestamp
```

## Secure controller metrics

The chart's metrics endpoint is authenticated HTTPS on TCP 8443. It is not an unauthenticated HTTP endpoint. A scraper needs a Kubernetes service-account token and permission to read `/metrics` through the chart-created `questdb-operator-metrics-reader` ClusterRole.

Before enabling the chart's `ServiceMonitor`:

1. Install a compatible Prometheus Operator and its `ServiceMonitor` CRD.
2. Bind the scraper ServiceAccount to `questdb-operator-metrics-reader`.
3. Accept the default lack of certificate verification, or have QuestDB review a separate certificate/scraper integration.
4. If chart NetworkPolicies are enabled, label the **scraper's namespace** `metrics=enabled`.

Example RBAC and namespace preparation:

```sh
kubectl create clusterrolebinding questdb-operator-prometheus-metrics \
  --clusterrole=questdb-operator-metrics-reader \
  --serviceaccount=<scraper-namespace>:<scraper-service-account>
kubectl label namespace <scraper-namespace> metrics=enabled --overwrite
```

With `prometheus.enable=true`, the default ServiceMonitor uses `insecureSkipVerify: true`. Traffic is encrypted and authenticated, but the scraper does not verify the serving certificate.

Chart-managed verified metrics TLS is [not operational](/docs/enterprise-kubernetes-operator/known-limitations/#chart-managed-verified-controller-metrics-tls-is-not-operational). Do **not** enable `certmanager.enable=true` as a verified-metrics solution. Customers requiring certificate verification should use a separately reviewed scraper/certificate integration with QuestDB support.

Do not enable `prometheus.enable` until the ServiceMonitor CRD exists. The chart does not create Prometheus, a scraper ServiceAccount, dashboards, or alerts.

## Upgrade the operator

Only the latest release is supported. Read its release notes before changing the controller or CRDs; `questdb.io/v1alpha1` may have breaking changes.

### Before you start

Check every cluster has fresh status and inspect the condition status and reason:

```sh
kubectl get questdbclusters -A \
  -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{" generation="}{.metadata.generation}{" observed="}{.status.observedGeneration}{" phase="}{.status.phase}{" ready="}{.status.readyInstances}{"/"}{.spec.instances}{" following="}{.status.replication.following}{"\n  Available="}{.status.conditions[?(@.type=="Available")].status}{"/"}{.status.conditions[?(@.type=="Available")].reason}{" Progressing="}{.status.conditions[?(@.type=="Progressing")].status}{"/"}{.status.conditions[?(@.type=="Progressing")].reason}{" WriteHealthy="}{.status.conditions[?(@.type=="WriteHealthy")].status}{"/"}{.status.conditions[?(@.type=="WriteHealthy")].reason}{" ReplicationHealthy="}{.status.conditions[?(@.type=="ReplicationHealthy")].status}{"/"}{.status.conditions[?(@.type=="ReplicationHealthy")].reason}{"\n"}{end}'
kubectl get pvc -A -l questdb.io/cluster \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,ROLE:.metadata.labels.questdb\.io/role,BOOTSTRAP:.metadata.labels.questdb\.io/bootstrap,DELETING:.metadata.deletionTimestamp'
```

For an ordinary writable cluster, do not proceed until `generation` equals `observed`, `Available=True/PrimaryReady`, `Progressing=False/Settled`, and `WriteHealthy=True/Healthy`. `Available=True` does not by itself prove that the writer or every WAL table accepts writes. `WriteHealthy=True` is an engine observation, not a synthetic write or a free-disk guarantee.

An intentional replica-only follower is the exception: it correctly has no primary and omits `WriteHealthy`. Require current generation, `phase=Following`, `following=true`, the expected `readyInstances`, and an appropriate follower `ReplicationHealthy` result. This is normally `True/FollowingExternalSource` when lag is observable; a quiet source can report `Unknown/StreamNotDetermined`, which is acceptable only after confirming the source identity and roots. Do not proceed on `ReplicationHealthy=False`.

Do not skip the PVC deletion-timestamp inventory. On the established replicated/object-store-backed path, a pre-existing Terminating primary PVC can be held by a same-name primary Pod recreated by an older controller. Do not wait forever for that claim: current versions fence that established primary Pod, release `pvc-protection`, keep the RW Service without ready endpoints, and require explicit storage recovery or Emergency promotion instead of creating blank primary storage. Record the affected cluster, stop/repoint writers, preserve events and PVC/PV identity, and plan that outage/failover before upgrading the controller. A standalone cluster does not have this replicated-primary loss guard or a replica to promote; PVC loss can recreate it on fresh empty storage, so treat standalone storage loss as data loss/recovery and restore from backup rather than waiting for `PromotionRequired`.

Also:

- confirm a recent successful backup for every protected cluster;
- read release notes and API compatibility/migration instructions;
- export the current Helm values and namespaced custom resources to a protected location;
- record database pod UIDs and restart counts;
- render and review the new chart before applying it.

Run the remaining upgrade commands in the same shell so they share the protected workspace:

```sh
UPGRADE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/questdb-operator-upgrade.XXXXXX")"
chmod 700 "$UPGRADE_DIR"
printf 'Upgrade evidence: %s\n' "$UPGRADE_DIR"

helm get values questdb-operator -n questdb-operator-system -o yaml \
  > "$UPGRADE_DIR/values.yaml"
helm get manifest questdb-operator -n questdb-operator-system \
  > "$UPGRADE_DIR/current.yaml"
kubectl get questdbclusters,questdbobjectstores,questdbpromotions -A -o yaml \
  > "$UPGRADE_DIR/custom-resources.yaml"
kubectl get pods -A -l questdb.io/cluster \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,UID:.metadata.uid,RESTARTS:.status.containerStatuses[0].restartCount' \
  > "$UPGRADE_DIR/database-pods-before.txt"

helm template questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  -n questdb-operator-system --version '<operator-version>' --is-upgrade \
  -f "$UPGRADE_DIR/values.yaml" \
  > "$UPGRADE_DIR/proposed.yaml"
diff -u "$UPGRADE_DIR/current.yaml" "$UPGRADE_DIR/proposed.yaml" || true
```

Review the diff, especially CRDs, manager arguments, RBAC, webhook configuration, image repository, and image-pull Secret names.

### Change

Use the same saved user-values file that produced the reviewed render. The new chart supplies its new defaults, while this file reapplies the customer's overrides, including the operator image repository and `controllerManager.imagePullSecrets`.

```sh
helm upgrade questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  -n questdb-operator-system --version '<operator-version>' \
  -f "$UPGRADE_DIR/values.yaml" --wait --timeout=5m
```

### Verify

```sh
kubectl rollout status deployment/questdb-operator-controller-manager \
  -n questdb-operator-system --timeout=5m
kubectl get crd questdbclusters.questdb.io \
  questdbobjectstores.questdb.io questdbpromotions.questdb.io
kubectl get questdbclusters -A \
  -o jsonpath='{range .items[*]}{.metadata.namespace}{"/"}{.metadata.name}{" generation="}{.metadata.generation}{" observed="}{.status.observedGeneration}{" available="}{.status.conditions[?(@.type=="Available")].status}{"/"}{.status.conditions[?(@.type=="Available")].reason}{" progressing="}{.status.conditions[?(@.type=="Progressing")].status}{"/"}{.status.conditions[?(@.type=="Progressing")].reason}{" writeHealthy="}{.status.conditions[?(@.type=="WriteHealthy")].status}{"/"}{.status.conditions[?(@.type=="WriteHealthy")].reason}{"\n"}{end}'
kubectl get pods -A -l questdb.io/cluster \
  -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name,UID:.metadata.uid,RESTARTS:.status.containerStatuses[0].restartCount' \
  > "$UPGRADE_DIR/database-pods-after.txt"
diff -u "$UPGRADE_DIR/database-pods-before.txt" \
  "$UPGRADE_DIR/database-pods-after.txt"
```

An operator-only upgrade should not roll database pods except where the new controller must fence an established replicated/object-store-backed primary already found on a missing or Terminating PVC. Investigate every changed UID or restart count, re-run the PVC deletion-timestamp inventory, and require the full writer-health or separate follower contract before declaring success. After the upgrade is verified and any required evidence is transferred according to policy, remove the local workspace:

```sh
rm -rf -- "$UPGRADE_DIR"
unset UPGRADE_DIR
```

## Roll back an operator release

Start with history and the failed revision's events/logs:

```sh
helm history questdb-operator -n questdb-operator-system
helm status questdb-operator -n questdb-operator-system
kubectl logs -n questdb-operator-system \
  deployment/questdb-operator-controller-manager -c manager --tail=1000
```

| Situation | Action |
| --- | --- |
| The new manager never became ready and release notes confirm API compatibility | Consider `helm rollback` to the last known-good revision. |
| The manager is ready but a cluster is unhealthy | Diagnose the cluster first; controller rollback may not repair database or spec state. |
| The release changed a CRD schema or required object migration | Follow the release-specific recovery procedure or contact support. Do not blindly roll back. |
| Database pods or data changed | Stop and assess the database. A Helm rollback is not a data rollback. |

```sh
helm rollback questdb-operator <revision> \
  -n questdb-operator-system --wait --timeout=5m
kubectl rollout status deployment/questdb-operator-controller-manager \
  -n questdb-operator-system --timeout=5m
```

:::warning
Rolling back the Helm release or controller does **not** reverse CRD schemas already sent to the API server, mutations to custom resources, or database state. Never blindly cross a breaking schema change.
:::

## Uninstall or remove the operator

Choose one of these paths. Do not uninstall the controller first when permanent cleanup is intended: active `QuestDBPromotion` finalizers need a compatible running operator to finish or resolve their cutovers.

### A. Temporarily remove the operator and leave databases unmanaged

A Helm uninstall removes the controller but, with the default `crd.keep=true`, retains all three CRDs and their custom resources:

```sh
helm uninstall questdb-operator -n questdb-operator-system --wait --timeout=5m
```

Existing database pods continue running, but they are **unmanaged**: no reconciliation, promotion/failover workflow, certificate or Secret convergence, or configuration convergence occurs. Reinstall a compatible operator promptly if the databases are to remain in service.

### B. Permanently remove all managed resources

Keep a compatible operator running throughout the tenant cleanup. First inventory and export the resources, PVCs, and store locations to a protected path:

```sh
kubectl get questdbclusters,questdbobjectstores,questdbpromotions -A
kubectl get pvc -A -l questdb.io/cluster
kubectl get questdbclusters,questdbobjectstores,questdbpromotions -A -o yaml \
  > /secure/path/questdb-custom-resources.yaml
```

Record every object-store bucket/container and effective backup and replication prefix; the operator never deletes those objects. Stop all applications and other clients that can write to or read from the databases.

In each namespace, delete or resolve `QuestDBPromotion` objects first. A promotion already in `Draining` or `Promoting` keeps its finalizer while the compatible operator completes the shaped cutover; wait until every promotion is gone before proceeding:

```sh
kubectl get questdbpromotions -n <namespace>
kubectl delete questdbpromotion <promotion-name> -n <namespace> --wait=false
kubectl wait --for=delete questdbpromotion/<promotion-name> \
  -n <namespace> --timeout=30m
kubectl get questdbpromotions -n <namespace>
```

Then delete each `QuestDBCluster` and verify its pods are gone and its retained PVCs match the intended retention decision. See [Delete a database cluster](/docs/enterprise-kubernetes-operator/operations/database/#delete-a-database-cluster). Stop on any deletion or verification failure; do not inspect or act on PVCs afterward.

```sh
CLUSTER_DELETE_ACCEPTED=false
PODS_GONE=false
if kubectl delete questdbcluster <name> -n <namespace> --timeout=5m; then
  CLUSTER_DELETE_ACCEPTED=true
fi
if [ "$CLUSTER_DELETE_ACCEPTED" = true ]; then
  for _ in $(seq 1 120); do
    if PODS="$(kubectl get pods -n <namespace> \
      -l questdb.io/cluster=<name> -o name)"; then
      if [ -z "$PODS" ]; then
        PODS_GONE=true
        break
      fi
    else
      break
    fi
    sleep 5
  done
fi
[ "$CLUSTER_DELETE_ACCEPTED" = true ] && [ "$PODS_GONE" = true ] && \
  kubectl get pvc -n <namespace> -l questdb.io/cluster=<name> -o wide
```

After every cluster in the namespace is gone, delete its `QuestDBObjectStore` configuration objects. Repeat for every namespace, then uninstall the operator:

```sh
kubectl delete questdbobjectstore <store-name> -n <namespace> --timeout=5m
helm uninstall questdb-operator -n questdb-operator-system --wait --timeout=5m
```

:::danger
Deleting a CRD deletes **every** remaining custom resource of that kind in every namespace. Only after the permanent cleanup above, and only with explicit acceptance of the service interruption and potential data/control-plane loss, verify PVC/object-store retention and remove the retained CRDs:
:::

```sh
kubectl delete crd questdbclusters.questdb.io \
  questdbobjectstores.questdb.io questdbpromotions.questdb.io \
  --timeout=5m
```
