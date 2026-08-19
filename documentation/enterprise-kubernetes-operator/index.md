---
title: QuestDB Enterprise Kubernetes Operator
description: Deploy and operate QuestDB Enterprise clusters on Kubernetes.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

# QuestDB Enterprise Kubernetes Operator

<EnterpriseNote>
  The Kubernetes Operator manages QuestDB Enterprise clusters. For open source
  QuestDB on Kubernetes, use the
  [QuestDB Helm chart](/docs/deployment/kubernetes/).
</EnterpriseNote>

:::warning[Beta for design partners]
The API is `questdb.io/v1alpha1` and may change between beta releases.
Amazon EKS and Azure AKS are supported on the tested versions in the
[support matrix](/docs/enterprise-kubernetes-operator/known-limitations/#supported-platforms-and-versions).
See [Support](/docs/enterprise-kubernetes-operator/support/) for beta expectations.
:::

The QuestDB Enterprise Operator manages the Kubernetes lifecycle of QuestDB
Enterprise: database pods and storage, configuration, engine-driven backup,
replication and promotion, restore and point-in-time recovery, and health
status.

You bring an existing object store. The operator has no cloud IAM or identity
and performs no object-store I/O: it never creates, reads, or deletes buckets or
containers. With static authentication, it reads the referenced Kubernetes
Secret only to inject database pod configuration; ambient EKS IRSA avoids that
static Secret. QuestDB database pods perform all object-store I/O.

## Choose your path

- **Amazon EKS:** follow the [EKS onboarding guide](/docs/enterprise-kubernetes-operator/getting-started/aws/).
- **Azure AKS:** follow the [AKS onboarding guide](/docs/enterprise-kubernetes-operator/getting-started/azure/).
- **Shared install requirements:** see [Installation](/docs/enterprise-kubernetes-operator/installation/).
- **Operate the operator:** use the [operator runbook](/docs/enterprise-kubernetes-operator/operations/operator/).
- **Operate a database:** use the [database](/docs/enterprise-kubernetes-operator/operations/database/),
  [backup and restore](/docs/enterprise-kubernetes-operator/operations/backup-restore/), or
  [high-availability](/docs/enterprise-kubernetes-operator/high-availability/) runbook.
- **Diagnose a problem:** use [Troubleshooting](/docs/enterprise-kubernetes-operator/troubleshooting/).

Use [Configuration](/docs/enterprise-kubernetes-operator/configuration/) for common resource shapes and the
[API Reference](/docs/enterprise-kubernetes-operator/reference/api/) for every field, default, and validation rule.
