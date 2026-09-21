---
title: Kubernetes Operator support
description: Understand support expectations and collect a safe support bundle.
---

# Support and expectations

Before running any command, replace every `<angle-bracket>` value; an unreplaced placeholder can be interpreted as shell redirection.

## Support scope

- `questdb.io/v1alpha1` may change incompatibly between releases.
- Amazon EKS and Azure AKS are supported only on the [tested version matrix](/docs/enterprise-kubernetes-operator/known-limitations/#supported-platforms-and-versions).
- Only the latest release receives fixes; there are no backports.
- Response times have no contractual SLA.

Use the shared design-partner channel supplied during onboarding for questions and incidents.

## Collect a support bundle

Capture evidence before deleting or restarting resources. Create the bundle in a protected local directory and keep this shell open while collecting it:

```sh
BUNDLE="$(mktemp -d "${TMPDIR:-/tmp}/questdb-support.XXXXXX")"
chmod 700 "$BUNDLE"
printf 'Support bundle: %s\n' "$BUNDLE"

kubectl get questdbcluster <name> -n <namespace> -o yaml \
  > "$BUNDLE/cluster.yaml"
kubectl describe questdbcluster <name> -n <namespace> \
  > "$BUNDLE/cluster-describe.txt"
kubectl get questdbpromotion -n <namespace> -o yaml \
  > "$BUNDLE/promotions.yaml"
kubectl get questdbobjectstore -n <namespace> -o yaml \
  > "$BUNDLE/object-stores.yaml"

kubectl get pods,pvc,services -n <namespace> \
  -l questdb.io/cluster=<name> -o wide \
  > "$BUNDLE/workloads.txt"
kubectl describe pods -n <namespace> -l questdb.io/cluster=<name> \
  > "$BUNDLE/pod-describe.txt"
kubectl describe pvc -n <namespace> -l questdb.io/cluster=<name> \
  > "$BUNDLE/pvc-describe.txt"
kubectl get events -n <namespace> --sort-by=.metadata.creationTimestamp \
  > "$BUNDLE/tenant-events.txt"

kubectl logs -n questdb-operator-system \
  deployment/questdb-operator-controller-manager -c manager \
  --since=2h --tail=5000 \
  > "$BUNDLE/operator.log"
kubectl get events -n questdb-operator-system \
  --sort-by=.metadata.creationTimestamp \
  > "$BUNDLE/operator-events.txt"

kubectl logs -n <namespace> <instance-name> -c questdb \
  --since=2h --tail=5000 \
  > "$BUNDLE/instance-questdb.log"
kubectl get pod <instance-name> -n <namespace> \
  -o jsonpath='{.spec.initContainers[*].name}{"\n"}' \
  > "$BUNDLE/instance-init-containers.txt"
# For a relevant failed init container:
kubectl logs -n <namespace> <instance-name> -c <init-container-name> \
  --tail=1000 \
  > "$BUNDLE/instance-init.log"

helm get values questdb-operator -n questdb-operator-system -o yaml \
  > "$BUNDLE/helm-values.yaml"
helm history questdb-operator -n questdb-operator-system \
  > "$BUNDLE/helm-history.txt"
helm status questdb-operator -n questdb-operator-system \
  > "$BUNDLE/helm-status.txt"
kubectl get deployment/questdb-operator-controller-manager \
  -n questdb-operator-system \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="manager")].image}{"\n"}' \
  > "$BUNDLE/operator-image.txt"
kubectl get questdbcluster <name> -n <namespace> \
  -o jsonpath='{.spec.image}{"\n"}' \
  > "$BUNDLE/questdb-image.txt"
kubectl version -o yaml > "$BUNDLE/kubernetes-version.yaml"

# Secret metadata and names only; never export Secret data.
kubectl get secrets -n <namespace> \
  -o custom-columns='NAME:.metadata.name,TYPE:.type,CREATED:.metadata.creationTimestamp' \
  > "$BUNDLE/secret-metadata.txt"
```

Repeat database and init log commands only for relevant instances. Also include:

- cloud provider, region, cluster version, node image/version, and CSI driver version;
- QuestDB Enterprise version/image and operator/chart version;
- incident start time in UTC, impact, recent spec/Helm/cloud changes, and expected versus actual behavior; and
- whether backup, replication, restore, or promotion was active.

:::warning
Never include Secret values. Review every file before sharing: custom resources, logs, Helm values, or customer-added `spec.config` can contain sensitive material. `QuestDBObjectStore` YAML contains bucket/container, endpoint, account, and region coordinates; redact those when customer policy requires it. Preserve field names and condition messages where possible so the report remains diagnosable.
:::

Review the printed bundle path and every file, transfer it only through an approved secure channel, and remove the local copy after support confirms receipt:

```sh
rm -rf -- "$BUNDLE"
unset BUNDLE
```

For common triage, use the [Troubleshooting decision table](/docs/enterprise-kubernetes-operator/troubleshooting/#decision-table).

## Report a security issue

Do not report a vulnerability in the shared channel or a public issue. Email **support@questdb.com** with `security` in the subject. Do not attach credentials or live Secret data; the security team will arrange an appropriate transfer if needed.
