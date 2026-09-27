---
title: Kubernetes Operator releases
description: Release history for the QuestDB Enterprise Kubernetes Operator.
---

<!-- Generated from questdb/questdb-enterprise-operator v0.3.0 (b215e4b84ecda400969e9c386f2c86ebafa5f2a3).
     Do not edit directly. Run: make docs-sync DOCS_REPO=/path/to/documentation RELEASE_TAG=v0.3.0 -->
# Changelog

Notable changes to the QuestDB Enterprise Operator are documented here.

<!-- generated latest operator artifacts: start -->
## Latest operator artifacts

Latest stable release: **0.3.0**

### Operator images

**AWS ECR**

```text
695242380269.dkr.ecr.eu-west-1.amazonaws.com/questdb-enterprise-operator:0.3.0
```

**Non-AWS mirror**

```text
registry.distribution.questdb.io/questdb-enterprise-operator:0.3.0
```

Both references require the registry access supplied by QuestDB.

### Helm chart

[View available chart versions on GitHub Packages](https://github.com/orgs/questdb/packages/container/package/charts%2Fquestdb-operator).

```sh
helm install questdb-operator oci://ghcr.io/questdb/charts/questdb-operator \
  --namespace questdb-operator-system --create-namespace \
  --version 0.3.0
```

<!-- generated latest operator artifacts: end -->
## [0.3.0] - 2026-09-14

### Added

- Native cold storage is available through `spec.coldStorage`:

  ```yaml
  coldStorage:
    objectStoreRef:
      name: questdb-cold-store
      root: cold/questdb/
    manager: 1
  ```

  The selected 1-based serial is the independent cold-storage manager and all
  other instances are refreshers. Recognizable QuestDB Enterprise versions below
  4.0.0 are rejected; unknown custom tags and digest-only images are allowed.
  Cold health is reported through the `ColdStorageHealthy` condition and
  `status.coldStorage` (configured store, current manager, manager term).

### Changed

- Existing raw `spec.config` cold-storage settings remain compatible when
  `spec.coldStorage` is absent. The operator never manages object-store data or
  table storage policies, and it never forces a cold-manager handoff.
- A Planned promotion on a cluster with `spec.coldStorage` requires settled
  cold-manager ownership on an instance other than the departing primary;
  otherwise the promotion fails fast with `ColdManagerMoveRequired`. Move
  `spec.coldStorage.manager` to a ready replica, wait for `ManagerReady`, and
  create a new promotion request. The default `manager: 1` normally selects the
  primary, so move it before the first Planned promotion. Emergency promotion
  never waits on cold ownership.
- `QuestDBObjectStore` provider and physical coordinates (S3 bucket, region,
  and endpoint; Azure container, account name, and endpoint; GCS bucket and
  endpoint) are immutable after creation, for every store use. Credential
  references, Secret contents, `root`, and non-coordinate transport options
  remain mutable. OpenDAL coordinate aliases persisted under older CRDs stay
  accepted while their key and value remain unchanged; new aliases are
  rejected.
- The CRDs now use Kubernetes validation ratcheting, which requires Kubernetes
  1.30 or later — within the supported platform matrix.

### Fixed

- The Emergency-only migration gate no longer fires on Planned promotions, where
  one transient API read could silently revert a completed drain by re-shaping
  the departing serial as primary and wedging the promotion in `Promoting`.
- A Planned promotion no longer fails terminally with `ColdManagerMoveRequired`
  on a one-pass cold-storage observation transient. A trustworthy misplacement
  or an in-flight handoff still fails fast; an unsettled observation waits in
  `Validating`, bounded by `catchUpTimeoutSeconds`.
- Emergency promotion persists the `Promoting` phase before fencing and waits
  for the departed primary Pod to be absent from the API server before shaping
  the target migration; promotion actions are authorized only from the exact
  controller-owner UID.
- A completed promotion settles the follower's status against the committed
  primary in the same pass and emits a `PromotionCompleted` event, instead of
  leaving a stale `Available=True/Following` status.
- The undetermined follower replication status message is simplified while
  retaining `Unknown/StreamNotDetermined` semantics.

## [0.2.1] - 2026-09-02

### Added

- Verified Secret-backed PGWire TLS for new clusters.
- Manager scheduling, metadata, environment, replica, and PodDisruptionBudget chart values.
- Chart-managed verified controller metrics TLS.
- Opt-in per-cluster database ingress policy example.

### Changed

- QuestDB Enterprise 4.0.0 canonical certification.
- PGWire TLS block presence is creation-time immutable while certificate and verification fields remain mutable.
- Port 9003 is Pod-only.
- Strict config-key and source-instance validation.

### Fixed

- Updated the bundled gRPC dependency to 1.83.1 to address CVE-2026-84304.
- Serialized replica-first rollout/read-route overlap and terminal Pod replacement.
- Filtered-cache live-object confirmation.
- Per-table follower progress/quiet evidence and oversized metrics rejection.
- Backup phase/stall, PITR normalization/fail-closed restore, promotion fencing diagnostics, terminating-cluster behavior, chart typing/webhook/PDB validation.

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

Initial release, supporting QuestDB Enterprise clusters on Amazon EKS and Azure
AKS. See the [installation guide](https://questdb.com/docs/enterprise-kubernetes-operator/installation/)
and [known limitations](https://questdb.com/docs/enterprise-kubernetes-operator/known-limitations/)
before deployment.
