---
title: QuestDB Enterprise Kubernetes Operator
description: Deploy and operate QuestDB Enterprise clusters on Kubernetes.
---

# QuestDB Enterprise Operator

:::warning[Beta for design partners]
The API is `questdb.io/v1alpha1` and may change between beta releases.
Amazon EKS and Azure AKS are supported on the tested versions in the
[support matrix](/docs/operator/known-limitations/#supported-platforms-and-versions).
See [Support](/docs/operator/support/) for beta expectations.
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

- **Amazon EKS:** follow the [EKS onboarding guide](/docs/operator/getting-started/aws/).
- **Azure AKS:** follow the [AKS onboarding guide](/docs/operator/getting-started/azure/).
- **Shared install requirements:** see [Installation](/docs/operator/installation/).
- **Operate the operator:** use the [operator runbook](/docs/operator/operations/operator/).
- **Operate a database:** use the [database](/docs/operator/operations/database/),
  [backup and restore](/docs/operator/operations/backup-restore/), or
  [high-availability](/docs/operator/high-availability/) runbook.
- **Diagnose a problem:** use [Troubleshooting](/docs/operator/troubleshooting/).

Use [Configuration](/docs/operator/configuration/) for common resource shapes and the
[API Reference](/docs/operator/reference/api/) for every field, default, and validation rule.
