---
title: Kubernetes Operator releases
description: Release history for the QuestDB Enterprise Kubernetes Operator.
---

<!-- Generated from questdb/questdb-enterprise-operator v0.1.0 (db63afd4df91d1eed3af49eca809c99807453d5d).
     Do not edit directly. Run: make docs-sync DOCS_REPO=/path/to/documentation RELEASE_TAG=v0.1.0 -->
# Changelog

Notable changes to the QuestDB Enterprise Operator are documented here.

<!-- generated latest operator artifacts: start -->
## Latest operator artifacts

Latest stable release: **0.1.0**

### Operator images

**AWS ECR**

```text
695242380269.dkr.ecr.eu-west-1.amazonaws.com/questdb-enterprise-operator:0.1.0
```

**Non-AWS mirror**

```text
registry.distribution.questdb.io/questdb-enterprise-operator:0.1.0
```

Both references require the registry access supplied by QuestDB.

### Helm chart

[View available chart versions on GitHub Packages](https://github.com/orgs/questdb/packages/container/package/charts%2Fquestdb-operator).

```sh
helm install questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system --create-namespace \
  --version 0.1.0
```

<!-- generated latest operator artifacts: end -->
## [0.1.0] - 2026-08-13

Initial beta release for named design partners, supporting QuestDB Enterprise
clusters on Amazon EKS and Azure AKS. See the [installation guide](/docs/operator/installation/)
and [known limitations](/docs/operator/known-limitations/)
before deployment.
