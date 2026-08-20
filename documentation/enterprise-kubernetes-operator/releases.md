---
title: Kubernetes Operator releases
description: Release history for the QuestDB Enterprise Kubernetes Operator.
---

<!-- Generated from questdb/questdb-enterprise-operator v0.2.0 (8f7b6fbeebe98a9d26a676215fcf7369f8664536).
     Do not edit directly. Run: make docs-sync DOCS_REPO=/path/to/documentation RELEASE_TAG=v0.2.0 -->
# Changelog

Notable changes to the QuestDB Enterprise Operator are documented here.

<!-- generated latest operator artifacts: start -->
## Latest operator artifacts

Latest stable release: **0.2.0**

### Operator images

**AWS ECR**

```text
695242380269.dkr.ecr.eu-west-1.amazonaws.com/questdb-enterprise-operator:0.2.0
```

**Non-AWS mirror**

```text
registry.distribution.questdb.io/questdb-enterprise-operator:0.2.0
```

Both references require the registry access supplied by QuestDB.

### Helm chart

[View available chart versions on GitHub Packages](https://github.com/orgs/questdb/packages/container/package/charts%2Fquestdb-operator).

```sh
helm install questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system --create-namespace \
  --version 0.2.0
```

<!-- generated latest operator artifacts: end -->
## [0.2.0] - 2026-08-20

### Fixed

- Planned promotions no longer stall in `Validating` under continuous writes (#205). The
  catch-up gate now admits a target that is continuously streaming — reachable, no
  suspended tables, self-consistent, and having applied everything the primary committed
  a 15-second window ago — in addition to a target at exactly zero lag. The bound is
  wall-clock, so it is independent of write rate. Frozen or genuinely behind targets still
  hold; unreachable targets fail closed.

### Added

- `spec.protocols.qwp.udp.enabled` opts a cluster into the QWP UDP receiver.
  Port 9007/UDP is opened on the Pod and published on the cluster and `-rw`
  Services only while it is enabled. It is **not** published on `-ro`, since a
  datagram aimed at a replica is discarded and fire-and-forget means nothing is
  returned to say so. The headless `<cluster>` Service still resolves to every
  instance, so per-pod DNS remains a way to address a specific one deliberately
  — it is not an availability endpoint and should not be used as one.

  The receiver is **unauthenticated**. QWP authenticates on the WebSocket
  upgrade request and UDP has no upgrade, so anything that can reach the port
  can write. Restrict it with a NetworkPolicy.

  Requires an engine that ships the QWP UDP receiver; QuestDB Enterprise 3.3.4
  and later do. Clusters that leave it disabled are unaffected: no `qwp.udp.*`
  key is written and no pod is rolled on operator upgrade.

### Changed

- `qwp.udp.enabled`, `qwp.udp.bind.to`, `qwp.udp.unicast`, and `qwp.udp.join`
  are operator-owned and rejected in both `spec.config` and
  `spec.replication.config` — both maps are merged into one `server.conf`, so a
  key owned in only one of them is not owned at all. The first two are set through
  `spec.protocols.qwp.udp`; the multicast pair cannot be fronted by the unicast
  ClusterIP the operator publishes. The remaining `qwp.udp.*` tuning keys stay
  settable.

## [0.1.0] - 2026-08-13

Initial beta release for named design partners, supporting QuestDB Enterprise
clusters on Amazon EKS and Azure AKS. See the [installation guide](https://questdb.com/docs/enterprise-kubernetes-operator/installation/)
and [known limitations](https://questdb.com/docs/enterprise-kubernetes-operator/known-limitations/)
before deployment.
