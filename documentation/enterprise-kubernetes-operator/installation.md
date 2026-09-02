---
title: Install the Kubernetes Operator
description:
  Install the QuestDB Enterprise Kubernetes Operator from its supported OCI Helm
  chart.
---

# Installation

The QuestDB Enterprise Operator is available to named design partners on these
tested combinations:

| Platform   | Kubernetes | QuestDB Enterprise |
| ---------- | ---------- | ------------------ |
| Amazon EKS | 1.31–1.36  | 4.0.0              |
| Azure AKS  | 1.33–1.36  | 4.0.0              |

Other Kubernetes distributions and versions are untested. Only the latest
release receives fixes; obtain its `<operator-version>` and private registry
credentials or AWS account grant from your QuestDB design-partner contact.

## Before you install

The installer needs cluster-admin-equivalent access. The chart creates CRDs,
ClusterRoles, ClusterRoleBindings, a validating webhook, and resources in
`questdb-operator-system`. The controller and its RBAC are cluster-scoped so one
installation can reconcile tenants in multiple namespaces. `QuestDBCluster`,
`QuestDBObjectStore`, their referenced Secrets, Pods, PVCs, and Services remain
namespaced.

Check these prerequisites:

- `kubectl` configured for the target cluster, Helm 3.10 or later, and the cloud
  CLI used by your onboarding guide.
- A CSI driver and a `ReadWriteOnce` StorageClass that applies pod `fsGroup` and
  has `allowVolumeExpansion: true`. Do not use `ReadWriteOncePod`.
- Enough schedulable CPU, memory, and zonal disk capacity for every database
  instance. QuestDB memory request and limit must be equal.
- Cluster DNS and network paths for the Kubernetes API server to reach the
  operator webhook on TCP 9443; the operator to reach tenant pods on TCP 8812
  and 9003; and nodes/pods to reach the private image registry, object store,
  and cloud identity endpoints over HTTPS.
- Pull access for two private images. The **operator** pull credential belongs
  in `questdb-operator-system`; each **database** pull credential belongs in its
  tenant namespace and is named by `spec.imagePullSecrets`. Do not reuse a
  short-lived ECR login token as a long-lived Secret.

Follow the complete cloud checklist before installing:

- [Amazon EKS onboarding](/docs/enterprise-kubernetes-operator/getting-started/aws/)
- [Azure AKS onboarding](/docs/enterprise-kubernetes-operator/getting-started/azure/)

## Canonical Helm install

The OCI chart on GHCR is public; its operator image is private. Replace the
placeholders first. Your QuestDB contact supplies the current operator version
and, off AWS, static credentials for `registry.distribution.questdb.io`.

```bash
export OPERATOR_VERSION='<operator-version>'
export REGISTRY_USER='<registry-user>'

kubectl create namespace questdb-operator-system
read -r -s -p 'Registry password: ' REGISTRY_PASSWORD; echo
kubectl create secret docker-registry questdb-operator-registry \
  --namespace questdb-operator-system \
  --docker-server=registry.distribution.questdb.io \
  --docker-username="$REGISTRY_USER" \
  --docker-password="$REGISTRY_PASSWORD"
unset REGISTRY_PASSWORD

helm install questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system \
  --version "$OPERATOR_VERSION" \
  --set controllerManager.container.image.repository=registry.distribution.questdb.io/questdb-enterprise-operator \
  --set-json 'controllerManager.imagePullSecrets=[{"name":"questdb-operator-registry"}]'
```

On EKS with QuestDB's cross-account ECR repository grant, kubelets pull through
the worker-node IAM role. Omit the Secret and both `--set` flags; do not use
IRSA for image pulls.

Verify the deployment and APIs:

```sh
kubectl rollout status deployment/questdb-operator-controller-manager \
  --namespace questdb-operator-system --timeout=5m
kubectl get crd questdbclusters.questdb.io \
  questdbobjectstores.questdb.io questdbpromotions.questdb.io
```

Expected result: the Deployment reports `successfully rolled out`, and all three
CRDs are listed.

## Common safe values

| Value                        | Default         | Guidance                                                                                                                                                                                                |
| ---------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `controllerManager.replicas` | `1`             | Keep at `1` unless QuestDB advises otherwise.                                                                                                                                                           |
| `crd.enable` / `crd.keep`    | `true` / `true` | Install CRDs and retain them on Helm uninstall.                                                                                                                                                         |
| `webhook.enable`             | `true`          | Keep admission validation enabled. Reconcile-time validation remains a backstop.                                                                                                                        |
| `webhook.certMode`           | `self-signed`   | The operator creates and rotates its serving certificate; cert-manager is not required.                                                                                                                 |
| `webhook.failurePolicy`      | `Ignore`        | Fail-open avoids blocking cluster writes during a webhook outage. Use `Fail` only after accepting that availability trade-off.                                                                          |
| `metrics.enable`             | `true`          | Exposes authenticated HTTPS metrics on 8443.                                                                                                                                                            |
| `prometheus.enable`          | `false`         | Requires Prometheus Operator `ServiceMonitor` CRDs. Bind the scraper identity to `questdb-operator-metrics-reader`.                                                                                     |
| `certmanager.enable`         | `false`         | When combined with `prometheus.enable=true`, the chart issues and mounts a metrics serving certificate and renders a ServiceMonitor with certificate verification. Install cert-manager first.          |
| `networkPolicy.enable`       | `false`         | Selects the manager only. It restricts metrics ingress to namespaces labeled `metrics=enabled` and leaves webhook 9443 open for managed API servers. It does not create database/tenant ingress policy. |

## Operator scheduling and availability

The chart can place and annotate the manager independently of database
`spec.scheduling`. Use `controllerManager.nodeSelector`, `tolerations`,
`affinity`, `topologySpreadConstraints`, and `priorityClassName` for the manager
Pod. Use `controllerManager.pod.annotations`, `controllerManager.pod.labels`,
`controllerManager.serviceAccount.annotations`, and
`controllerManager.container.env` for integration metadata and environment.

The default manager has one replica and leader election enabled, so only one
reconciler is active. The manager PDB is disabled by default because
`replicas=1`; enable it only after running multiple replicas across failure
domains, for example:

```yaml
controllerManager:
  replicas: 2
  podDisruptionBudget:
    enabled: true
    minAvailable: 1
```

The manager PDB accepts integer and percentage `minAvailable` values. The
database CRD PDB uses an integer only.

Treat upgrades, rollback, and removal as separate lifecycle procedures; use the
[operator operations runbook](/docs/enterprise-kubernetes-operator/operations/operator/)
rather than inferring them from installation commands.
