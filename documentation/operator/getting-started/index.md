---
title: Get started with the Kubernetes Operator
description: Choose a supported cloud onboarding path for the QuestDB Enterprise Kubernetes Operator.
---

# Getting Started

The beta is available to named design partners on the tested Amazon EKS and
Azure AKS versions. Choose the guide for your cluster:

## Amazon EKS

Use EBS, cross-account ECR image pulls, S3, and IRSA for the QuestDB pods.

[Start on EKS](/docs/operator/getting-started/aws/)

## Azure AKS

Use Azure Disk, the QuestDB distribution registry, and Azure Blob Storage.

[Start on AKS](/docs/operator/getting-started/azure/)

Both guides install the operator, create a single-instance cluster with backups,
verify the first backup, and connect through the cluster's read-write Service.
For shared prerequisites and Helm values, see [Installation](/docs/operator/installation/).
