---
title: Kubernetes Operator API reference
description: Custom resources provided by the QuestDB Enterprise Kubernetes Operator.
---

<!-- Generated from questdb/questdb-enterprise-operator v0.2.0 (8f7b6fbeebe98a9d26a676215fcf7369f8664536).
     Do not edit directly. Run: make docs-sync DOCS_REPO=/path/to/documentation RELEASE_TAG=v0.2.0 -->
# API Reference

Packages:

- [questdb.io/v1alpha1](#questdbiov1alpha1)

## questdb.io/v1alpha1 {#questdbiov1alpha1}

Resource Types:

- [QuestDBCluster](#questdbcluster)

- [QuestDBObjectStore](#questdbobjectstore)

- [QuestDBPromotion](#questdbpromotion)




## QuestDBCluster






QuestDBCluster is the Schema for the questdbclusters API.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
      <td><b>apiVersion</b></td>
      <td>string</td>
      <td>questdb.io/v1alpha1</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b>kind</b></td>
      <td>string</td>
      <td>QuestDBCluster</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b><a href="https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#objectmeta-v1-meta">metadata</a></b></td>
      <td>object</td>
      <td>Refer to the Kubernetes API documentation for the fields of the `metadata` field.</td>
      <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspec">spec</a></b></td>
        <td>object</td>
        <td>
          spec defines the desired state of QuestDBCluster<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.instances &lt;= 1 || (has(self.backup) && has(self.backup.enabled) && self.backup.enabled): instances &gt; 1 requires an enabled spec.backup (replicas seed from a backup)</li><li>!((has(self.backup) && has(self.backup.enabled) && self.backup.enabled) || self.instances &gt; 1) || has(self.objectStoreRef): spec.objectStoreRef is required when backup is enabled or instances &gt; 1</li><li>(has(oldSelf.replication) && has(oldSelf.replication.root) && size(oldSelf.replication.root) &gt; 0) == (has(self.replication) && has(self.replication.root) && size(self.replication.root) &gt; 0): spec.replication.root is immutable in presence as well as value: it cannot be added to, or removed from, an existing cluster. Omitted, the replication WAL root is the per-cluster default db/&#123;namespace&#125;/&#123;name&#125;/, so setting or clearing it re-points live WAL shipping at a different stream. To run against a different root, create a new cluster with it set (born-from-backup)</li><li>has(oldSelf.bootstrap) == has(self.bootstrap): spec.bootstrap is immutable in presence as well as value: it cannot be added to, or removed from, an existing cluster. It only initializes the genesis primary, so adding it later restores nothing and would only make status.recovery lie. To restore from a backup, create a NEW cluster with spec.bootstrap.recovery</li><li>!has(oldSelf.objectStoreRef) || has(self.objectStoreRef): spec.objectStoreRef cannot be removed once set: it backs this cluster's replication WAL and backup history, so dropping it converges a replicated cluster down to a single unreplicated primary and strands its backups. Adding a store to a cluster that never had one is allowed</li><li>!has(self.bootstrap) || !has(self.bootstrap.follow) || (has(self.objectStoreRef) && has(self.backup) && has(self.backup.enabled) && self.backup.enabled): spec.bootstrap.follow requires spec.objectStoreRef and an enabled spec.backup, whatever spec.instances is: a follower has no primary of its own, so it restores its baseline from the external source's backup and then follows that source's WAL — both through the shared store. Without them a single-instance follower would be admitted and silently come up as an ordinary standalone primary</li><li>!has(self.bootstrap) || !has(self.bootstrap.follow) || (has(self.replication) && has(self.replication.root) && size(self.replication.root) &gt; 0): spec.bootstrap.follow requires an explicit spec.replication.root naming the external source's WAL prefix. Omitted, the root defaults to this cluster's own identity-scoped db/&#123;namespace&#125;/&#123;name&#125;/, which is a stream nothing is writing to — the follower would restore and then never advance</li><li>!has(self.bootstrap) || !has(self.bootstrap.follow) || (has(self.backup) && has(self.backup.root) && size(self.backup.root) &gt; 0): spec.bootstrap.follow requires an explicit spec.backup.root naming the external source's backup prefix. Omitted, it defaults to a bare 'backup/' that is not scoped to any cluster, so the follower would look for its baseline wherever that happens to point</li><li>!has(self.bootstrap) || !has(self.bootstrap.follow) || !has(self.replication) || !has(self.replication.seedFrom): spec.replication.seedFrom is meaningless under spec.bootstrap.follow: a follower's replicas seed from the external source's backup named by follow.sourceInstanceName, not from an instance of this cluster. Remove seedFrom</li></ul>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatus">status</a></b></td>
        <td>object</td>
        <td>
          status defines the observed state of QuestDBCluster<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec
<sup><sup>[↩ Parent](#questdbcluster)</sup></sup>



spec defines the desired state of QuestDBCluster

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>image</b></td>
        <td>string</td>
        <td>
          image is the QuestDB container image.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecstorage">storage</a></b></td>
        <td>object</td>
        <td>
          storage describes the per-instance persistent volume.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecauth">auth</a></b></td>
        <td>object</td>
        <td>
          auth configures authentication. If omitted, the operator generates a
bootstrap admin password into a Secret named &lt;cluster&gt;-admin.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecbackup">backup</a></b></td>
        <td>object</td>
        <td>
          backup configures in-database object-store backups. Absent ⇒ no backups.
When set and enabled, schedule must be non-empty.<br/>
          <br/>
            <i>Validations</i>:<ul><li>!has(self.enabled) || !self.enabled || (has(self.schedule) && self.schedule != ''): backup.schedule is required when backup.enabled is true</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecbootstrap">bootstrap</a></b></td>
        <td>object</td>
        <td>
          bootstrap selects how the genesis primary is initialized. Absent ⇒ fresh primary.
Immutable in presence as well as value: it cannot be added to, or removed from,
an existing cluster (see the spec-level rules).<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: spec.bootstrap is immutable</li><li>!has(self.follow) || !has(self.recovery): spec.bootstrap.recovery and spec.bootstrap.follow are mutually exclusive: both initialize the genesis instances from the same store and they do it in incompatible ways. recovery restores a backup into a writable primary (the source must already be stopped); follow restores the same backup into replicas that keep consuming the source's WAL while it still serves</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>config</b></td>
        <td>map[string]string</td>
        <td>
          config is server.conf passthrough (key=value). Operator-owned keys
(acl.admin.*, http.health.check.authentication.required, replication.role,
cairo.snapshot.instance.id, *.tls.*) are rejected.

The object-store keys are NOT rejected, and setting backup.object.store or
replication.object.store here has no effect: the operator supplies both through
the engine's _FILE mechanism, which takes precedence over server.conf. The
additional backup destinations (backup.object.store.1 … .9) and
cold.storage.object.store are yours to set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecimagepullsecretsindex">imagePullSecrets</a></b></td>
        <td>[]object</td>
        <td>
          imagePullSecrets references Secrets in the cluster's namespace used to pull
spec.image. The QuestDB Enterprise image is private, and pull access to it is
the entitlement to run it, so this is how a licensed instance is authorized on
a cluster whose nodes have no ambient registry credentials (any AKS cluster, and
any EKS cluster whose node role lacks a cross-account ECR grant).

Mutable: changing it rolls the pods, because a rotated pull secret must reach a
pod that is restarted for an unrelated reason without a stale reference.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.all(s, s.name != ''): imagePullSecrets entries must have a non-empty name</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>instances</b></td>
        <td>integer</td>
        <td>
          instances is the total number of nodes (1 primary + the rest replicas).
Requires an enabled spec.backup (which itself requires spec.objectStoreRef)
when &gt; 1, because replicas seed from a backup. Replication itself is gated on
spec.objectStoreRef, not on this count.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Default</i>: 1<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecobjectstoreref">objectStoreRef</a></b></td>
        <td>object</td>
        <td>
          objectStoreRef references the QuestDBObjectStore (same namespace) that backs
BOTH backup and replication for this cluster. Backup and replication WAL share
this one store/bucket/provider under per-use roots
(spec.backup.root, spec.replication.root). Immutable: re-pointing a live
cluster's store would diverge replicas from the primary's WAL shipping
(split-brain) and strand backup history; a deliberate migration must be an
explicit gated flow (e.g. born-from-backup into a new cluster), not an
in-place edit. Required when spec.backup is enabled or spec.instances &gt; 1.

It also cannot be REMOVED once set — that would converge a replicated cluster
down to a single unreplicated primary and strand its backups. ADDING one to a
cluster that never had it IS allowed: turning on backup/replication later is a
legitimate day-2 operation that strands nothing (see the spec-level rules).<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: spec.objectStoreRef is immutable</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecprotocols">protocols</a></b></td>
        <td>object</td>
        <td>
          protocols configures the optional client-facing wire protocols. Absent ⇒ the
QWP UDP receiver is off.

The always-on surface is not represented here and is not configurable:
HTTP/REST and the Web Console (9000), PGWire (8812), ILP over TCP (9009), and
the min server's health check and /metrics (9003) are served by every cluster.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>pvcRetentionPolicy</b></td>
        <td>enum</td>
        <td>
          pvcRetentionPolicy controls whether a stale replica's PVC is deleted when the
instance is removed on scale-down. Retain (default) keeps the durable data;
Delete reclaims it (a re-scale then born-from-backup re-seeds cleanly). The
primary's PVC is never deleted regardless of this policy.<br/>
          <br/>
            <i>Enum</i>: Retain, Delete<br/>
            <i>Default</i>: Retain<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecreplication">replication</a></b></td>
        <td>object</td>
        <td>
          replication optionally tunes primary+replica HA, which is active whenever
objectStoreRef is set. instances &gt; 1 requires objectStoreRef and an enabled
scheduled backup, not this block.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecresources">resources</a></b></td>
        <td>object</td>
        <td>
          resources is the compute resource requirements for the QuestDB container.
When a memory request and limit are both set they must be EQUAL: QuestDB
mmaps/off-heaps heavily, so the memory limit must be firm and sized for the
page cache. CPU is intentionally left flexible — a CPU limit is optional
(CFS throttling can hurt tail latency; prefer pinning/dedicated nodes), so
the pod may be Burstable rather than strictly Guaranteed.<br/>
          <br/>
            <i>Validations</i>:<ul><li>!has(self.requests) || !has(self.limits) || !('memory' in self.requests) || !('memory' in self.limits) || quantity(self.requests['memory']).compareTo(quantity(self.limits['memory'])) == 0: memory request and limit must be equal (firm memory limit for QuestDB)</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecscheduling">scheduling</a></b></td>
        <td>object</td>
        <td>
          scheduling configures placement (nodeSelector/affinity/tolerations/
topologySpread/priorityClass) and the disruption budget for instance Pods.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.storage
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



storage describes the per-instance persistent volume.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>size</b></td>
        <td>int or string</td>
        <td>
          size is the requested volume size (e.g. 100Gi). Expand-only: it may grow
(if the StorageClass allows expansion) but never shrink.<br/>
          <br/>
            <i>Validations</i>:<ul><li>quantity(self).compareTo(quantity(oldSelf)) &gt;= 0: storage size cannot be reduced (expand-only)</li></ul>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>storageClassName</b></td>
        <td>string</td>
        <td>
          storageClassName selects the StorageClass for the instance PVC. It is
immutable: changing it would orphan the bound volume.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: storageClassName is immutable</li></ul>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.auth
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



auth configures authentication. If omitted, the operator generates a
bootstrap admin password into a Secret named &lt;cluster&gt;-admin.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecauthadminsecret">adminSecret</a></b></td>
        <td>object</td>
        <td>
          adminSecret optionally supplies the bootstrap admin password. If unset, the
operator generates one into &lt;cluster&gt;-admin (key "password"). The selected
key's value is injected via QDB_ACL_ADMIN_PASSWORD_FILE (the native _FILE convention), not written to server.conf.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.auth.adminSecret
<sup><sup>[↩ Parent](#questdbclusterspecauth)</sup></sup>



adminSecret optionally supplies the bootstrap admin password. If unset, the
operator generates one into &lt;cluster&gt;-admin (key "password"). The selected
key's value is injected via QDB_ACL_ADMIN_PASSWORD_FILE (the native _FILE convention), not written to server.conf.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The key of the secret to select from.  Must be a valid secret key.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent.
This field is effectively required, but due to backwards compatibility is
allowed to be empty. Instances of this type with an empty value here are
almost certainly wrong.
More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
          <br/>
            <i>Default</i>: <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>optional</b></td>
        <td>boolean</td>
        <td>
          Specify whether the Secret or its key must be defined<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.backup
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



backup configures in-database object-store backups. Absent ⇒ no backups.
When set and enabled, schedule must be non-empty.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>enabled</b></td>
        <td>boolean</td>
        <td>
          enabled turns on QuestDB's backup subsystem (backup.enabled).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>retention</b></td>
        <td>integer</td>
        <td>
          retention is how many recent backups QuestDB keeps
(backup.cleanup.keep.latest.n). Defaults to QuestDB's default (5) when unset.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is the prefix within spec.objectStoreRef's bucket/container for backups
(e.g. "backup/"). It may share spec.replication.root or differ — QuestDB keeps
backup sets and replication WAL separate within a shared prefix. Defaults to
"backup/" when omitted. Mutable (changing only the backup sub-prefix is the
same low-risk operation the old mutable backup ref allowed).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>schedule</b></td>
        <td>string</td>
        <td>
          schedule is a 5- or 6-field cron expression (backup.schedule.cron). Required
when enabled.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>stalledAfterSeconds</b></td>
        <td>integer</td>
        <td>
          stalledAfterSeconds is how long an in-progress backup may show no change in
progressPercent before BackupHealthy becomes False/Stalled. The default is
3600 seconds. 0 disables stall detection.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Default</i>: 3600<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>timezone</b></td>
        <td>string</td>
        <td>
          timezone is the IANA zone for the schedule (backup.schedule.tz). Defaults to
QuestDB's default (UTC) when unset.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



bootstrap selects how the genesis primary is initialized. Absent ⇒ fresh primary.
Immutable in presence as well as value: it cannot be added to, or removed from,
an existing cluster (see the spec-level rules).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecbootstrapfollow">follow</a></b></td>
        <td>object</td>
        <td>
          follow makes the cluster a replica-only FOLLOWER of an external QuestDB the
operator does not manage: every instance is a replica, there is no primary, and
the fleet seeds from that source's backup and then follows its WAL stream through
the shared object store. Promote one instance later to take over.

This is the low-downtime migration path onto the operator. spec.bootstrap.recovery
requires stopping the source BEFORE the restore begins, so it loses every write
since the last backup; a follower keeps consuming the source's stream while the
source still serves, and downtime shrinks to "stop the source, drain it, promote".

Mutually exclusive with recovery: both initialize the genesis instances, from the
same store, in incompatible ways.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecbootstraprecovery">recovery</a></b></td>
        <td>object</td>
        <td>
          recovery makes the genesis primary born from a backup (DR / PITR) instead of fresh.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap.follow
<sup><sup>[↩ Parent](#questdbclusterspecbootstrap)</sup></sup>



follow makes the cluster a replica-only FOLLOWER of an external QuestDB the
operator does not manage: every instance is a replica, there is no primary, and
the fleet seeds from that source's backup and then follows its WAL stream through
the shared object store. Promote one instance later to take over.

This is the low-downtime migration path onto the operator. spec.bootstrap.recovery
requires stopping the source BEFORE the restore begins, so it loses every write
since the last backup; a follower keeps consuming the source's stream while the
source still serves, and downtime shrinks to "stop the source, drain it, promote".

Mutually exclusive with recovery: both initialize the genesis instances, from the
same store, in incompatible ways.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>sourceInstanceName</b></td>
        <td>string</td>
        <td>
          sourceInstanceName is the external source's backup_instance_name. It pins which
backup in the shared store each replica restores as its baseline, and the operator
cannot discover it — discovering it would mean querying the unmanaged source, which
is exactly what this design does not do.

It must name the same database the WAL under spec.replication.root belongs to. A
mismatch is not rejected here (nothing in the cluster can check it) and presents at
runtime as a follower that restores cleanly and then never advances.<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap.recovery
<sup><sup>[↩ Parent](#questdbclusterspecbootstrap)</sup></sup>



recovery makes the genesis primary born from a backup (DR / PITR) instead of fresh.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecbootstraprecoverysource">source</a></b></td>
        <td>object</td>
        <td>
          source references the QuestDBObjectStore holding the backup to restore from.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecbootstraprecoveryrecoverytarget">recoveryTarget</a></b></td>
        <td>object</td>
        <td>
          recoveryTarget bounds the restore to a point in time. Omitted ⇒ restore the
latest available backup. Restore snaps to the latest backup at-or-before the
timestamp (granularity = the source's backup cadence; not continuous PITR).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>sourceInstanceName</b></td>
        <td>string</td>
        <td>
          sourceInstanceName selects which backup instance to restore when the store
holds more than one. Optional when the store has exactly one instance.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap.recovery.source
<sup><sup>[↩ Parent](#questdbclusterspecbootstraprecovery)</sup></sup>



source references the QuestDBObjectStore holding the backup to restore from.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecbootstraprecoverysourceobjectstoreref">objectStoreRef</a></b></td>
        <td>object</td>
        <td>
          objectStoreRef names a QuestDBObjectStore in the cluster's namespace.<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap.recovery.source.objectStoreRef
<sup><sup>[↩ Parent](#questdbclusterspecbootstraprecoverysource)</sup></sup>



objectStoreRef names a QuestDBObjectStore in the cluster's namespace.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          name references a QuestDBObjectStore in the cluster's namespace.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is the prefix within the store's bucket/container for THIS use
(e.g. "backup/", "db/"). It is the only isolation when multiple uses or
clusters share a bucket.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.bootstrap.recovery.recoveryTarget
<sup><sup>[↩ Parent](#questdbclusterspecbootstraprecovery)</sup></sup>



recoveryTarget bounds the restore to a point in time. Omitted ⇒ restore the
latest available backup. Restore snaps to the latest backup at-or-before the
timestamp (granularity = the source's backup cadence; not continuous PITR).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>timestamp</b></td>
        <td>string</td>
        <td>
          timestamp is an RFC3339 instant. Restore selects the latest backup at-or-before it.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.imagePullSecrets[index]
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



LocalObjectReference contains enough information to let you locate the
referenced object inside the same namespace.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent.
This field is effectively required, but due to backwards compatibility is
allowed to be empty. Instances of this type with an empty value here are
almost certainly wrong.
More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
          <br/>
            <i>Default</i>: <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.objectStoreRef
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



objectStoreRef references the QuestDBObjectStore (same namespace) that backs
BOTH backup and replication for this cluster. Backup and replication WAL share
this one store/bucket/provider under per-use roots
(spec.backup.root, spec.replication.root). Immutable: re-pointing a live
cluster's store would diverge replicas from the primary's WAL shipping
(split-brain) and strand backup history; a deliberate migration must be an
explicit gated flow (e.g. born-from-backup into a new cluster), not an
in-place edit. Required when spec.backup is enabled or spec.instances &gt; 1.

It also cannot be REMOVED once set — that would converge a replicated cluster
down to a single unreplicated primary and strand its backups. ADDING one to a
cluster that never had it IS allowed: turning on backup/replication later is a
legitimate day-2 operation that strands nothing (see the spec-level rules).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          name references an object in the same namespace as the object holding this
reference. Which kind is determined by the field: see its documentation.<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.protocols
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



protocols configures the optional client-facing wire protocols. Absent ⇒ the
QWP UDP receiver is off.

The always-on surface is not represented here and is not configurable:
HTTP/REST and the Web Console (9000), PGWire (8812), ILP over TCP (9009), and
the min server's health check and /metrics (9003) are served by every cluster.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecprotocolsqwp">qwp</a></b></td>
        <td>object</td>
        <td>
          qwp configures the QuestDB Wire Protocol (QWP).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.protocols.qwp
<sup><sup>[↩ Parent](#questdbclusterspecprotocols)</sup></sup>



qwp configures the QuestDB Wire Protocol (QWP).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecprotocolsqwpudp">udp</a></b></td>
        <td>object</td>
        <td>
          udp configures the QWP UDP receiver.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.protocols.qwp.udp
<sup><sup>[↩ Parent](#questdbclusterspecprotocolsqwp)</sup></sup>



udp configures the QWP UDP receiver.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>enabled</b></td>
        <td>boolean</td>
        <td>
          enabled serves the QWP UDP receiver on port 9007, opened on the Pod and
published on the cluster and -rw Services only while this is true. It is NOT
published on -ro: the protocol is ingest-only, so a datagram aimed at a
replica is discarded, and fire-and-forget means nothing is returned to say so.

Defaults to false, matching the engine. UDP ingestion is fire-and-forget: it
is intended for metrics workloads where occasional message loss is
acceptable, and it neither acknowledges writes nor applies backpressure. Use
the WebSocket transport for reliable ingestion.

The receiver is UNAUTHENTICATED. QWP authenticates on the WebSocket upgrade
request, and UDP has no upgrade, so there is no credential path on this port:
anything that can reach it can write. Restrict it with a NetworkPolicy.

Requires an engine that ships the QWP UDP receiver; QuestDB Enterprise 3.3.4
and later do.<br/>
          <br/>
            <i>Default</i>: false<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.replication
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



replication optionally tunes primary+replica HA, which is active whenever
objectStoreRef is set. instances &gt; 1 requires objectStoreRef and an enabled
scheduled backup, not this block.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>config</b></td>
        <td>map[string]string</td>
        <td>
          config is replication tuning passthrough (replication.primary.* /
replication.requests.*). Operator-owned keys (replication.role,
replication.object.store, the structured walCleaner keys) are rejected.
replication.object.store stays rejected HERE (unlike in spec.config) because
this block is specifically about replication: silently ignoring a store
re-point written into the replication config would be the most misleading
possible place to ignore it.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>maxLagTxns</b></td>
        <td>integer</td>
        <td>
          maxLagTxns optionally imposes a STRICT freshness gate on -ro membership: a
replica more than this many transactions behind drops out. Unset =&gt;
readiness gates on initial-catch-up + not-suspended only.<br/>
          <br/>
            <i>Format</i>: int64<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is the prefix within spec.objectStoreRef's bucket/container for this
cluster's replication WAL. It may share spec.backup.root or differ — QuestDB
keeps replication WAL and backup sets separate within a shared prefix.

DEFAULT WHEN OMITTED: the identity-scoped prefix "db/&#123;namespace&#125;/&#123;name&#125;/" — NOT
the bare "db/". Do NOT "make the default explicit" by writing root: "db/": that
names a DIFFERENT, shared stream and moves a live cluster's WAL onto it. QuestDB
has no instance-name key in the object store, so the prefix is the only isolation
between clusters that share a bucket. Deriving it from the cluster's own
namespace/name (both immutable on a QuestDBCluster, so the default is stable for
the object's lifetime) makes store-sharing safe by construction: a restore/DR
clone pointed at the source's bucket inherits the source's data_id from the
backup and would otherwise collide with the live source's WAL stream and
crash-loop with ER002 (#74). Clusters chained A→B→C each own a distinct stream
with no lineage tracking.

SET IT ONLY to opt into a SPECIFIC existing stream — that is the declarative way
to adopt/continue another cluster's WAL (a stream take-over), fenced by the
keepalive lease (ER005/ER006).

Immutable in VALUE and in PRESENCE (the presence half is enforced by a
spec-level rule, since a field-level transition rule cannot see the absent
case): re-pointing live WAL shipping would diverge replicas from the primary
(split-brain risk), and adding or clearing it moves the stream off/onto the
identity-scoped default just as destructively. A deliberate migration must be an
explicit gated flow (born-from-backup into a new cluster), not an in-place edit.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: replication.root is immutable</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>seedFrom</b></td>
        <td>integer</td>
        <td>
          seedFrom optionally pins the seed source for NEW replicas to an instance
serial. Default (unset): the most-recent completed backup among live
instances. The operator resolves the serial to its backup_instance_name and
persists it, so the pin survives that instance's deletion.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecreplicationwalcleaner">walCleaner</a></b></td>
        <td>object</td>
        <td>
          walCleaner manages the primary's WAL cleaner — the engine job that bounds shared
replication-WAL growth in the object store. It is on by default; these are the
operator-surfaced knobs. Other replication.primary.cleaner.* tuning stays available
via config above.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.replication.walCleaner
<sup><sup>[↩ Parent](#questdbclusterspecreplication)</sup></sup>



walCleaner manages the primary's WAL cleaner — the engine job that bounds shared
replication-WAL growth in the object store. It is on by default; these are the
operator-surfaced knobs. Other replication.primary.cleaner.* tuning stays available
via config above.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>backupWindowCount</b></td>
        <td>integer</td>
        <td>
          backupWindowCount is how many backup windows of WAL history the cleaner retains
(replication.primary.cleaner.backup.window.count). Higher keeps more WAL (a wider
PITR/seed window) at the cost of more storage. Defaults to QuestDB's default when unset.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>enabled</b></td>
        <td>boolean</td>
        <td>
          enabled toggles the WAL cleaner (replication.primary.cleaner.enabled). Defaults to
true (the engine default). DISABLING IT LETS THE REPLICATION WAL GROW UNBOUNDED in
the object store — set false only if you manage WAL retention externally.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.resources
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



resources is the compute resource requirements for the QuestDB container.
When a memory request and limit are both set they must be EQUAL: QuestDB
mmaps/off-heaps heavily, so the memory limit must be firm and sized for the
page cache. CPU is intentionally left flexible — a CPU limit is optional
(CFS throttling can hurt tail latency; prefer pinning/dedicated nodes), so
the pod may be Burstable rather than strictly Guaranteed.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecresourcesclaimsindex">claims</a></b></td>
        <td>[]object</td>
        <td>
          Claims lists the names of resources, defined in spec.resourceClaims,
that are used by this container.

This field depends on the
DynamicResourceAllocation feature gate.

This field is immutable. It can only be set for containers.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>limits</b></td>
        <td>map[string]int or string</td>
        <td>
          Limits describes the maximum amount of compute resources allowed.
More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>requests</b></td>
        <td>map[string]int or string</td>
        <td>
          Requests describes the minimum amount of compute resources required.
If Requests is omitted for a container, it defaults to Limits if that is explicitly specified,
otherwise to an implementation-defined value. Requests cannot exceed Limits.
More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.resources.claims[index]
<sup><sup>[↩ Parent](#questdbclusterspecresources)</sup></sup>



ResourceClaim references one entry in PodSpec.ResourceClaims.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name must match the name of one entry in pod.spec.resourceClaims of
the Pod where this field is used. It makes that resource available
inside a container.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>request</b></td>
        <td>string</td>
        <td>
          Request is the name chosen for a request in the referenced claim.
If empty, everything from the claim is made available, otherwise
only the result of this request.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling
<sup><sup>[↩ Parent](#questdbclusterspec)</sup></sup>



scheduling configures placement (nodeSelector/affinity/tolerations/
topologySpread/priorityClass) and the disruption budget for instance Pods.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinity">affinity</a></b></td>
        <td>object</td>
        <td>
          affinity sets pod/node (anti-)affinity for instance Pods. When set, it
FULLY REPLACES the operator's default soft anti-affinity (no merge) — the
default per-hostname spreading is NOT retained, so re-add an anti-affinity
term if you still want it.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>nodeSelector</b></td>
        <td>map[string]string</td>
        <td>
          nodeSelector constrains instance Pods to nodes with matching labels.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingpoddisruptionbudget">podDisruptionBudget</a></b></td>
        <td>object</td>
        <td>
          podDisruptionBudget tunes the operator-managed PodDisruptionBudget.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>priorityClassName</b></td>
        <td>string</td>
        <td>
          priorityClassName sets the Pod priority class for instance Pods.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingtolerationsindex">tolerations</a></b></td>
        <td>[]object</td>
        <td>
          tolerations allow instance Pods onto tainted nodes.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingtopologyspreadconstraintsindex">topologySpreadConstraints</a></b></td>
        <td>[]object</td>
        <td>
          topologySpreadConstraints spread instance Pods across failure domains.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity
<sup><sup>[↩ Parent](#questdbclusterspecscheduling)</sup></sup>



affinity sets pod/node (anti-)affinity for instance Pods. When set, it
FULLY REPLACES the operator's default soft anti-affinity (no merge) — the
default per-hostname spreading is NOT retained, so re-add an anti-affinity
term if you still want it.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinity">nodeAffinity</a></b></td>
        <td>object</td>
        <td>
          Describes node affinity scheduling rules for the pod.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinity">podAffinity</a></b></td>
        <td>object</td>
        <td>
          Describes pod affinity scheduling rules (e.g. co-locate this pod in the same node, zone, etc. as some other pod(s)).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinity">podAntiAffinity</a></b></td>
        <td>object</td>
        <td>
          Describes pod anti-affinity scheduling rules (e.g. avoid putting this pod in the same node, zone, etc. as some other pod(s)).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinity)</sup></sup>



Describes node affinity scheduling rules for the pod.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindex">preferredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>[]object</td>
        <td>
          The scheduler will prefer to schedule pods to nodes that satisfy
the affinity expressions specified by this field, but it may choose
a node that violates one or more of the expressions. The node that is
most preferred is the one with the greatest sum of weights, i.e.
for each node that meets all of the scheduling requirements (resource
request, requiredDuringScheduling affinity expressions, etc.),
compute a sum by iterating through the elements of this field and adding
"weight" to the sum if the node matches the corresponding matchExpressions; the
node(s) with the highest sum are the most preferred.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecution">requiredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>object</td>
        <td>
          If the affinity requirements specified by this field are not met at
scheduling time, the pod will not be scheduled onto the node.
If the affinity requirements specified by this field cease to be met
at some point during pod execution (e.g. due to an update), the system
may or may not try to eventually evict the pod from its node.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinity)</sup></sup>



An empty preferred scheduling term matches all objects with implicit weight 0
(i.e. it's a no-op). A null preferred scheduling term matches no objects (i.e. is also a no-op).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindexpreference">preference</a></b></td>
        <td>object</td>
        <td>
          A node selector term, associated with the corresponding weight.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>weight</b></td>
        <td>integer</td>
        <td>
          Weight associated with matching the corresponding nodeSelectorTerm, in the range 1-100.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].preference
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindex)</sup></sup>



A node selector term, associated with the corresponding weight.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindexpreferencematchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          A list of node selector requirements by node's labels.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindexpreferencematchfieldsindex">matchFields</a></b></td>
        <td>[]object</td>
        <td>
          A list of node selector requirements by node's fields.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].preference.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindexpreference)</sup></sup>



A node selector requirement is a selector that contains values, a key, and an operator
that relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          Represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          An array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. If the operator is Gt or Lt, the values
array must have a single element, which will be interpreted as an integer.
This array is replaced during a strategic merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].preference.matchFields[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinitypreferredduringschedulingignoredduringexecutionindexpreference)</sup></sup>



A node selector requirement is a selector that contains values, a key, and an operator
that relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          Represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          An array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. If the operator is Gt or Lt, the values
array must have a single element, which will be interpreted as an integer.
This array is replaced during a strategic merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinity)</sup></sup>



If the affinity requirements specified by this field are not met at
scheduling time, the pod will not be scheduled onto the node.
If the affinity requirements specified by this field cease to be met
at some point during pod execution (e.g. due to an update), the system
may or may not try to eventually evict the pod from its node.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsindex">nodeSelectorTerms</a></b></td>
        <td>[]object</td>
        <td>
          Required. A list of node selector terms. The terms are ORed.<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecution)</sup></sup>



A null or empty node selector term matches no objects. The requirements of
them are ANDed.
The TopologySelectorTerm type implements a subset of the NodeSelectorTerm.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsindexmatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          A list of node selector requirements by node's labels.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsindexmatchfieldsindex">matchFields</a></b></td>
        <td>[]object</td>
        <td>
          A list of node selector requirements by node's fields.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[index].matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsindex)</sup></sup>



A node selector requirement is a selector that contains values, a key, and an operator
that relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          Represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          An array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. If the operator is Gt or Lt, the values
array must have a single element, which will be interpreted as an integer.
This array is replaced during a strategic merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[index].matchFields[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitynodeaffinityrequiredduringschedulingignoredduringexecutionnodeselectortermsindex)</sup></sup>



A node selector requirement is a selector that contains values, a key, and an operator
that relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          The label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          Represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists, DoesNotExist. Gt, and Lt.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          An array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. If the operator is Gt or Lt, the values
array must have a single element, which will be interpreted as an integer.
This array is replaced during a strategic merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinity)</sup></sup>



Describes pod affinity scheduling rules (e.g. co-locate this pod in the same node, zone, etc. as some other pod(s)).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindex">preferredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>[]object</td>
        <td>
          The scheduler will prefer to schedule pods to nodes that satisfy
the affinity expressions specified by this field, but it may choose
a node that violates one or more of the expressions. The node that is
most preferred is the one with the greatest sum of weights, i.e.
for each node that meets all of the scheduling requirements (resource
request, requiredDuringScheduling affinity expressions, etc.),
compute a sum by iterating through the elements of this field and adding
"weight" to the sum if the node has pods which matches the corresponding podAffinityTerm; the
node(s) with the highest sum are the most preferred.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindex">requiredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>[]object</td>
        <td>
          If the affinity requirements specified by this field are not met at
scheduling time, the pod will not be scheduled onto the node.
If the affinity requirements specified by this field cease to be met
at some point during pod execution (e.g. due to a pod label update), the
system may or may not try to eventually evict the pod from its node.
When there are multiple elements, the lists of nodes corresponding to each
podAffinityTerm are intersected, i.e. all terms must be satisfied.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinity)</sup></sup>



The weights of all of the matched WeightedPodAffinityTerm fields are added per-node to find the most preferred node(s)

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm">podAffinityTerm</a></b></td>
        <td>object</td>
        <td>
          Required. A pod affinity term, associated with the corresponding weight.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>weight</b></td>
        <td>integer</td>
        <td>
          weight associated with matching the corresponding podAffinityTerm,
in the range 1-100.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindex)</sup></sup>



Required. A pod affinity term, associated with the corresponding weight.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>topologyKey</b></td>
        <td>string</td>
        <td>
          This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching
the labelSelector in the specified namespaces, where co-located is defined as running on a node
whose value of the label with key topologyKey matches that of any node on which any of the
selected pods is running.
Empty topologyKey is not allowed.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselector">labelSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key in (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both matchLabelKeys and labelSelector.
Also, matchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mismatchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MismatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key notin (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both mismatchLabelKeys and labelSelector.
Also, mismatchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselector">namespaceSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>namespaces</b></td>
        <td>[]string</td>
        <td>
          namespaces specifies a static list of namespace names that the term applies to.
The term is applied to the union of the namespaces listed in this field
and the ones selected by namespaceSelector.
null or empty namespaces list and null namespaceSelector means "this pod's namespace".<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.labelSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm)</sup></sup>



A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.labelSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.namespaceSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm)</sup></sup>



A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.namespaceSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinity)</sup></sup>



Defines a set of pods (namely those matching the labelSelector
relative to the given namespace(s)) that this pod should be
co-located (affinity) or not co-located (anti-affinity) with,
where co-located is defined as running on a node whose value of
the label with key &lt;topologyKey&gt; matches that of any node on which
a pod of the set of pods is running

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>topologyKey</b></td>
        <td>string</td>
        <td>
          This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching
the labelSelector in the specified namespaces, where co-located is defined as running on a node
whose value of the label with key topologyKey matches that of any node on which any of the
selected pods is running.
Empty topologyKey is not allowed.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexlabelselector">labelSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key in (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both matchLabelKeys and labelSelector.
Also, matchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mismatchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MismatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key notin (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both mismatchLabelKeys and labelSelector.
Also, mismatchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselector">namespaceSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>namespaces</b></td>
        <td>[]string</td>
        <td>
          namespaces specifies a static list of namespace names that the term applies to.
The term is applied to the union of the namespaces listed in this field
and the ones selected by namespaceSelector.
null or empty namespaces list and null namespaceSelector means "this pod's namespace".<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].labelSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindex)</sup></sup>



A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexlabelselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].labelSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexlabelselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].namespaceSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindex)</sup></sup>



A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].namespaceSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinity)</sup></sup>



Describes pod anti-affinity scheduling rules (e.g. avoid putting this pod in the same node, zone, etc. as some other pod(s)).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindex">preferredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>[]object</td>
        <td>
          The scheduler will prefer to schedule pods to nodes that satisfy
the anti-affinity expressions specified by this field, but it may choose
a node that violates one or more of the expressions. The node that is
most preferred is the one with the greatest sum of weights, i.e.
for each node that meets all of the scheduling requirements (resource
request, requiredDuringScheduling anti-affinity expressions, etc.),
compute a sum by iterating through the elements of this field and subtracting
"weight" from the sum if the node has pods which matches the corresponding podAffinityTerm; the
node(s) with the highest sum are the most preferred.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindex">requiredDuringSchedulingIgnoredDuringExecution</a></b></td>
        <td>[]object</td>
        <td>
          If the anti-affinity requirements specified by this field are not met at
scheduling time, the pod will not be scheduled onto the node.
If the anti-affinity requirements specified by this field cease to be met
at some point during pod execution (e.g. due to a pod label update), the
system may or may not try to eventually evict the pod from its node.
When there are multiple elements, the lists of nodes corresponding to each
podAffinityTerm are intersected, i.e. all terms must be satisfied.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinity)</sup></sup>



The weights of all of the matched WeightedPodAffinityTerm fields are added per-node to find the most preferred node(s)

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm">podAffinityTerm</a></b></td>
        <td>object</td>
        <td>
          Required. A pod affinity term, associated with the corresponding weight.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>weight</b></td>
        <td>integer</td>
        <td>
          weight associated with matching the corresponding podAffinityTerm,
in the range 1-100.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindex)</sup></sup>



Required. A pod affinity term, associated with the corresponding weight.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>topologyKey</b></td>
        <td>string</td>
        <td>
          This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching
the labelSelector in the specified namespaces, where co-located is defined as running on a node
whose value of the label with key topologyKey matches that of any node on which any of the
selected pods is running.
Empty topologyKey is not allowed.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselector">labelSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key in (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both matchLabelKeys and labelSelector.
Also, matchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mismatchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MismatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key notin (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both mismatchLabelKeys and labelSelector.
Also, mismatchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselector">namespaceSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>namespaces</b></td>
        <td>[]string</td>
        <td>
          namespaces specifies a static list of namespace names that the term applies to.
The term is applied to the union of the namespaces listed in this field
and the ones selected by namespaceSelector.
null or empty namespaces list and null namespaceSelector means "this pod's namespace".<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.labelSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm)</sup></sup>



A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.labelSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermlabelselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.namespaceSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinityterm)</sup></sup>



A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.preferredDuringSchedulingIgnoredDuringExecution[index].podAffinityTerm.namespaceSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinitypreferredduringschedulingignoredduringexecutionindexpodaffinitytermnamespaceselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinity)</sup></sup>



Defines a set of pods (namely those matching the labelSelector
relative to the given namespace(s)) that this pod should be
co-located (affinity) or not co-located (anti-affinity) with,
where co-located is defined as running on a node whose value of
the label with key &lt;topologyKey&gt; matches that of any node on which
a pod of the set of pods is running

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>topologyKey</b></td>
        <td>string</td>
        <td>
          This pod should be co-located (affinity) or not co-located (anti-affinity) with the pods matching
the labelSelector in the specified namespaces, where co-located is defined as running on a node
whose value of the label with key topologyKey matches that of any node on which any of the
selected pods is running.
Empty topologyKey is not allowed.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexlabelselector">labelSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key in (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both matchLabelKeys and labelSelector.
Also, matchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mismatchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MismatchLabelKeys is a set of pod label keys to select which pods will
be taken into consideration. The keys are used to lookup values from the
incoming pod labels, those key-value labels are merged with `labelSelector` as `key notin (value)`
to select the group of existing pods which pods will be taken into consideration
for the incoming pod's pod (anti) affinity. Keys that don't exist in the incoming
pod labels will be ignored. The default value is empty.
The same key is forbidden to exist in both mismatchLabelKeys and labelSelector.
Also, mismatchLabelKeys cannot be set when labelSelector isn't set.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselector">namespaceSelector</a></b></td>
        <td>object</td>
        <td>
          A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>namespaces</b></td>
        <td>[]string</td>
        <td>
          namespaces specifies a static list of namespace names that the term applies to.
The term is applied to the union of the namespaces listed in this field
and the ones selected by namespaceSelector.
null or empty namespaces list and null namespaceSelector means "this pod's namespace".<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].labelSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindex)</sup></sup>



A label query over a set of resources, in this case pods.
If it's null, this PodAffinityTerm matches with no Pods.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexlabelselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].labelSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexlabelselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].namespaceSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindex)</sup></sup>



A label query over the set of namespaces that the term applies to.
The term is applied to the union of the namespaces selected by this field
and the ones listed in the namespaces field.
null selector and null or empty namespaces list means "this pod's namespace".
An empty selector (&#123;&#125;) matches all namespaces.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.affinity.podAntiAffinity.requiredDuringSchedulingIgnoredDuringExecution[index].namespaceSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingaffinitypodantiaffinityrequiredduringschedulingignoredduringexecutionindexnamespaceselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.podDisruptionBudget
<sup><sup>[↩ Parent](#questdbclusterspecscheduling)</sup></sup>



podDisruptionBudget tunes the operator-managed PodDisruptionBudget.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>enabled</b></td>
        <td>boolean</td>
        <td>
          enabled controls whether the operator maintains a PDB. Defaults to true.
Set false to remove the PDB entirely (e.g. to permit unrestricted node drains).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>minAvailable</b></td>
        <td>integer</td>
        <td>
          minAvailable overrides the computed integer minAvailable. When unset:
single instance =&gt; 1; replicated =&gt; instances-1.

LIMITATION: instance Pods have no controller to reschedule them, so a PDB
that leaves no disruption budget HARD-BLOCKS voluntary evictions (`kubectl
drain` hangs) until a human deletes the Pod or the PDB. This happens whenever
minAvailable &gt;= the number of currently-Ready instances — including the
single-instance default (minAvailable=1 over one Pod). It is intentional
protection for a database, NOT auto-clamped: set a lower minAvailable, scale
out, or disable the PDB if you need drains to proceed unattended.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.tolerations[index]
<sup><sup>[↩ Parent](#questdbclusterspecscheduling)</sup></sup>



The pod this Toleration is attached to tolerates any taint that matches
the triple &lt;key,value,effect&gt; using the matching operator &lt;operator&gt;.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>effect</b></td>
        <td>string</td>
        <td>
          Effect indicates the taint effect to match. Empty means match all taint effects.
When specified, allowed values are NoSchedule, PreferNoSchedule and NoExecute.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          Key is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be Exists; this combination means to match all values and all keys.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          Operator represents a key's relationship to the value.
Valid operators are Exists, Equal, Lt, and Gt. Defaults to Equal.
Exists is equivalent to wildcard for value, so that a pod can
tolerate all taints of a particular category.
Lt and Gt perform numeric comparisons (requires feature gate TaintTolerationComparisonOperators).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>tolerationSeconds</b></td>
        <td>integer</td>
        <td>
          TolerationSeconds represents the period of time the toleration (which must be
of effect NoExecute, otherwise this field is ignored) tolerates the taint. By default,
it is not set, which means tolerate the taint forever (do not evict). Zero and
negative values will be treated as 0 (evict immediately) by the system.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>value</b></td>
        <td>string</td>
        <td>
          Value is the taint value the toleration matches to.
If the operator is Exists, the value should be empty, otherwise just a regular string.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.topologySpreadConstraints[index]
<sup><sup>[↩ Parent](#questdbclusterspecscheduling)</sup></sup>



TopologySpreadConstraint specifies how to spread matching pods among the given topology.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>maxSkew</b></td>
        <td>integer</td>
        <td>
          MaxSkew describes the degree to which pods may be unevenly distributed.
When `whenUnsatisfiable=DoNotSchedule`, it is the maximum permitted difference
between the number of matching pods in the target topology and the global minimum.
The global minimum is the minimum number of matching pods in an eligible domain
or zero if the number of eligible domains is less than MinDomains.
For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same
labelSelector spread as 2/2/1:
In this case, the global minimum is 1.
&#124; zone1 | zone2 | zone3 |
&#124;  P P  |  P P  |   P   |
&#45; if MaxSkew is 1, incoming pod can only be scheduled to zone3 to become 2/2/2;
scheduling it onto zone1(zone2) would make the ActualSkew(3-1) on zone1(zone2)
violate MaxSkew(1).
&#45; if MaxSkew is 2, incoming pod can be scheduled onto any zone.
When `whenUnsatisfiable=ScheduleAnyway`, it is used to give higher precedence
to topologies that satisfy it.
It's a required field. Default value is 1 and 0 is not allowed.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>topologyKey</b></td>
        <td>string</td>
        <td>
          TopologyKey is the key of node labels. Nodes that have a label with this key
and identical values are considered to be in the same topology.
We consider each &lt;key, value&gt; as a "bucket", and try to put balanced number
of pods into each bucket.
We define a domain as a particular instance of a topology.
Also, we define an eligible domain as a domain whose nodes meet the requirements of
nodeAffinityPolicy and nodeTaintsPolicy.
e.g. If TopologyKey is "kubernetes.io/hostname", each Node is a domain of that topology.
And, if TopologyKey is "topology.kubernetes.io/zone", each zone is a domain of that topology.
It's a required field.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>whenUnsatisfiable</b></td>
        <td>string</td>
        <td>
          WhenUnsatisfiable indicates how to deal with a pod if it doesn't satisfy
the spread constraint.
&#45; DoNotSchedule (default) tells the scheduler not to schedule it.
&#45; ScheduleAnyway tells the scheduler to schedule the pod in any location,
  but giving higher precedence to topologies that would help reduce the
  skew.
A constraint is considered "Unsatisfiable" for an incoming pod
if and only if every possible node assignment for that pod would violate
"MaxSkew" on some topology.
For example, in a 3-zone cluster, MaxSkew is set to 1, and pods with the same
labelSelector spread as 3/1/1:
&#124; zone1 | zone2 | zone3 |
&#124; P P P |   P   |   P   |
If WhenUnsatisfiable is set to DoNotSchedule, incoming pod can only be scheduled
to zone2(zone3) to become 3/2/1(3/1/2) as ActualSkew(2-1) on zone2(zone3) satisfies
MaxSkew(1). In other words, the cluster can still be imbalanced, but scheduler
won't make it *more* imbalanced.
It's a required field.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbclusterspecschedulingtopologyspreadconstraintsindexlabelselector">labelSelector</a></b></td>
        <td>object</td>
        <td>
          LabelSelector is used to find matching pods.
Pods that match this label selector are counted to determine the number of pods
in their corresponding topology domain.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabelKeys</b></td>
        <td>[]string</td>
        <td>
          MatchLabelKeys is a set of pod label keys to select the pods over which
spreading will be calculated. The keys are used to lookup values from the
incoming pod labels, those key-value labels are ANDed with labelSelector
to select the group of existing pods over which spreading will be calculated
for the incoming pod. The same key is forbidden to exist in both MatchLabelKeys and LabelSelector.
MatchLabelKeys cannot be set when LabelSelector isn't set.
Keys that don't exist in the incoming pod labels will
be ignored. A null or empty list means only match against labelSelector.

This is a beta field and requires the MatchLabelKeysInPodTopologySpread feature gate to be enabled (enabled by default).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>minDomains</b></td>
        <td>integer</td>
        <td>
          MinDomains indicates a minimum number of eligible domains.
When the number of eligible domains with matching topology keys is less than minDomains,
Pod Topology Spread treats "global minimum" as 0, and then the calculation of Skew is performed.
And when the number of eligible domains with matching topology keys equals or greater than minDomains,
this value has no effect on scheduling.
As a result, when the number of eligible domains is less than minDomains,
scheduler won't schedule more than maxSkew Pods to those domains.
If value is nil, the constraint behaves as if MinDomains is equal to 1.
Valid values are integers greater than 0.
When value is not nil, WhenUnsatisfiable must be DoNotSchedule.

For example, in a 3-zone cluster, MaxSkew is set to 2, MinDomains is set to 5 and pods with the same
labelSelector spread as 2/2/2:
&#124; zone1 | zone2 | zone3 |
&#124;  P P  |  P P  |  P P  |
The number of domains is less than 5(MinDomains), so "global minimum" is treated as 0.
In this situation, new pod with the same labelSelector cannot be scheduled,
because computed skew will be 3(3 - 0) if new Pod is scheduled to any of the three zones,
it will violate MaxSkew.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>nodeAffinityPolicy</b></td>
        <td>string</td>
        <td>
          NodeAffinityPolicy indicates how we will treat Pod's nodeAffinity/nodeSelector
when calculating pod topology spread skew. Options are:
&#45; Honor: only nodes matching nodeAffinity/nodeSelector are included in the calculations.
&#45; Ignore: nodeAffinity/nodeSelector are ignored. All nodes are included in the calculations.

If this value is nil, the behavior is equivalent to the Honor policy.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>nodeTaintsPolicy</b></td>
        <td>string</td>
        <td>
          NodeTaintsPolicy indicates how we will treat node taints when calculating
pod topology spread skew. Options are:
&#45; Honor: nodes without taints, along with tainted nodes for which the incoming pod
has a toleration, are included.
&#45; Ignore: node taints are ignored. All nodes are included.

If this value is nil, the behavior is equivalent to the Ignore policy.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.topologySpreadConstraints[index].labelSelector
<sup><sup>[↩ Parent](#questdbclusterspecschedulingtopologyspreadconstraintsindex)</sup></sup>



LabelSelector is used to find matching pods.
Pods that match this label selector are counted to determine the number of pods
in their corresponding topology domain.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbclusterspecschedulingtopologyspreadconstraintsindexlabelselectormatchexpressionsindex">matchExpressions</a></b></td>
        <td>[]object</td>
        <td>
          matchExpressions is a list of label selector requirements. The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>matchLabels</b></td>
        <td>map[string]string</td>
        <td>
          matchLabels is a map of &#123;key,value&#125; pairs. A single &#123;key,value&#125; in the matchLabels
map is equivalent to an element of matchExpressions, whose key field is "key", the
operator is "In", and the values array contains only "value". The requirements are ANDed.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.spec.scheduling.topologySpreadConstraints[index].labelSelector.matchExpressions[index]
<sup><sup>[↩ Parent](#questdbclusterspecschedulingtopologyspreadconstraintsindexlabelselector)</sup></sup>



A label selector requirement is a selector that contains values, a key, and an operator that
relates the key and values.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>key</b></td>
        <td>string</td>
        <td>
          key is the label key that the selector applies to.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>operator</b></td>
        <td>string</td>
        <td>
          operator represents a key's relationship to a set of values.
Valid operators are In, NotIn, Exists and DoesNotExist.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>values</b></td>
        <td>[]string</td>
        <td>
          values is an array of string values. If the operator is In or NotIn,
the values array must be non-empty. If the operator is Exists or DoesNotExist,
the values array must be empty. This array is replaced during a strategic
merge patch.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status
<sup><sup>[↩ Parent](#questdbcluster)</sup></sup>



status defines the observed state of QuestDBCluster

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>adminSecretName</b></td>
        <td>string</td>
        <td>
          adminSecretName is the Secret holding the bootstrap admin password in effect
(operator-generated &lt;cluster&gt;-admin, or the user-supplied auth.adminSecret).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusbackup">backup</a></b></td>
        <td>object</td>
        <td>
          backup reports observed backup configuration + the latest run.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusconditionsindex">conditions</a></b></td>
        <td>[]object</td>
        <td>
          conditions represent the current state of the QuestDBCluster.
Types: Available, Progressing, InstanceUnreachable, ConfigRejected,
OperatorIdentityReady, BackupHealthy, WriteHealthy, ReplicationHealthy,
PromotionRequired, Recovered, RecoveryFailed, StorageResizeBlocked.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>currentPrimary</b></td>
        <td>string</td>
        <td>
          currentPrimary is the instance name of the current primary (e.g. prod-1).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>instances</b></td>
        <td>integer</td>
        <td>
          instances is the number of instances the operator is currently managing.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>latestSerial</b></td>
        <td>integer</td>
        <td>
          latestSerial is the highest instance serial ever allocated. Serials are
1-based and monotonic; a zero/absent value means no instance has ever been
minted (the reconciler allocates serial 1 from that state). It is never
reused and does NOT increment when a pod is recreated for the same identity.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>observedGeneration</b></td>
        <td>integer</td>
        <td>
          observedGeneration is the most recent generation observed by the controller.
When it equals .metadata.generation, the reported status reflects the
current spec.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>operatorSecretName</b></td>
        <td>string</td>
        <td>
          operatorSecretName is the Secret holding the questdb_operator service-account
password (&lt;cluster&gt;-operator).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>phase</b></td>
        <td>string</td>
        <td>
          phase is a short, human-facing lifecycle summary surfaced as a printer
column. Use conditions for machine-readable state; phase is not load-bearing
for control flow.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>readyInstances</b></td>
        <td>integer</td>
        <td>
          readyInstances is the number of instances whose pod reports Ready.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusrecovery">recovery</a></b></td>
        <td>object</td>
        <td>
          recovery reports genesis-primary restore state (nil unless spec.bootstrap.recovery set).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusreplication">replication</a></b></td>
        <td>object</td>
        <td>
          replication reports observed replication state (nil when spec.objectStoreRef is unset).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.backup
<sup><sup>[↩ Parent](#questdbclusterstatus)</sup></sup>



backup reports observed backup configuration + the latest run.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>configured</b></td>
        <td>boolean</td>
        <td>
          configured is true once the operator has injected backup config into the pod.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusbackuplastbackup">lastBackup</a></b></td>
        <td>object</td>
        <td>
          lastBackup is the most recent run observed via backups() (nil until one runs).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>lastProgressAt</b></td>
        <td>string</td>
        <td>
          lastProgressAt is when the operator first observed the current in-progress
backup or most recently observed its progressPercent change.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.backup.lastBackup
<sup><sup>[↩ Parent](#questdbclusterstatusbackup)</sup></sup>



lastBackup is the most recent run observed via backups() (nil until one runs).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>endTime</b></td>
        <td>string</td>
        <td>
          <br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>error</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>progressPercent</b></td>
        <td>integer</td>
        <td>
          <br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>startTime</b></td>
        <td>string</td>
        <td>
          <br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>status</b></td>
        <td>string</td>
        <td>
          status is in_progress|completed|failed|unknown.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.conditions[index]
<sup><sup>[↩ Parent](#questdbclusterstatus)</sup></sup>



Condition contains details for one aspect of the current state of this API Resource.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>lastTransitionTime</b></td>
        <td>string</td>
        <td>
          lastTransitionTime is the last time the condition transitioned from one status to another.
This should be when the underlying condition changed.  If that is not known, then using the time when the API field changed is acceptable.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>message</b></td>
        <td>string</td>
        <td>
          message is a human readable message indicating details about the transition.
This may be an empty string.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>reason</b></td>
        <td>string</td>
        <td>
          reason contains a programmatic identifier indicating the reason for the condition's last transition.
Producers of specific condition types may define expected values and meanings for this field,
and whether the values are considered a guaranteed API.
The value should be a CamelCase string.
This field may not be empty.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>status</b></td>
        <td>enum</td>
        <td>
          status of the condition, one of True, False, Unknown.<br/>
          <br/>
            <i>Enum</i>: True, False, Unknown<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>type</b></td>
        <td>string</td>
        <td>
          type of condition in CamelCase or in foo.example.com/CamelCase.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>observedGeneration</b></td>
        <td>integer</td>
        <td>
          observedGeneration represents the .metadata.generation that the condition was set based upon.
For instance, if .metadata.generation is currently 12, but the .status.conditions[x].observedGeneration is 9, the condition is out of date
with respect to the current state of the instance.<br/>
          <br/>
            <i>Format</i>: int64<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.recovery
<sup><sup>[↩ Parent](#questdbclusterstatus)</sup></sup>



recovery reports genesis-primary restore state (nil unless spec.bootstrap.recovery set).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>sourceInstanceName</b></td>
        <td>string</td>
        <td>
          <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.replication
<sup><sup>[↩ Parent](#questdbclusterstatus)</sup></sup>



replication reports observed replication state (nil when spec.objectStoreRef is unset).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>activePromotion</b></td>
        <td>string</td>
        <td>
          activePromotion names the QuestDBPromotion currently being serviced for this
cluster, or is absent when no cutover is in flight.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>following</b></td>
        <td>boolean</td>
        <td>
          following is true while the cluster is a replica-only follower of the external
QuestDB named by spec.bootstrap.follow. Such a cluster has no primary and accepts
no writes. It becomes false after an instance is promoted.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>maxLagTxns</b></td>
        <td>integer</td>
        <td>
          maxLagTxns is the worst observed end-to-end lag across replicas and tables. Zero
means all observed replicas are caught up; absent means lag is undetermined.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>primaryEstablished</b></td>
        <td>boolean</td>
        <td>
          primaryEstablished is true once the primary has been Ready at least once. When
true, primary-PVC-loss protection is active and the operator will not initialize
an empty replacement primary if that PVC is missing.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusreplicationreplicasindex">replicas</a></b></td>
        <td>[]object</td>
        <td>
          replicas reports per-replica observed state.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusreplicationseed">seed</a></b></td>
        <td>object</td>
        <td>
          seed is the effective seed for the next replica bootstrap: the durable,
monotonically advanced last-known-good pointer (source=auto) or the resolved
pinned source (source=pinned).<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbclusterstatusreplicationstream">stream</a></b></td>
        <td>object</td>
        <td>
          stream reports the observed follower and source WAL progress over time.<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.replication.replicas[index]
<sup><sup>[↩ Parent](#questdbclusterstatusreplication)</sup></sup>



ReplicaStatus reports observed state for a single replica instance.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>caughtUp</b></td>
        <td>boolean</td>
        <td>
          caughtUp is a sticky indication that the replica completed its initial catch-up at
least once and became eligible for the read-only Service. It does not report current
freshness; use caughtUpNow for that.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>instance</b></td>
        <td>string</td>
        <td>
          instance is the replica's instance/pod name.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>caughtUpNow</b></td>
        <td>boolean</td>
        <td>
          caughtUpNow reports current observed freshness: true means the replica was reachable,
had no suspended tables, and was either at zero end-to-end lag or bounded-streaming
(applied everything the primary committed a short window ago, so its remaining lag
is at most one window of writes); false means it was behind or stale; absent means
freshness was undetermined.
On a primaryless (follower) cluster the bounded-streaming reading is not available —
there is no primary to reference — so this field carries the stricter zero-lag
meaning there.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>lagTxns</b></td>
        <td>integer</td>
        <td>
          lagTxns is the replica's observed end-to-end transaction lag behind the primary.
A non-zero value does not by itself mean the replica is not caught up (see
caughtUpNow); absent means lag was undetermined.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>suspendedTables</b></td>
        <td>[]string</td>
        <td>
          suspendedTables lists tables whose replication is suspended (unhealthy).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.replication.seed
<sup><sup>[↩ Parent](#questdbclusterstatusreplication)</sup></sup>



seed is the effective seed for the next replica bootstrap: the durable,
monotonically advanced last-known-good pointer (source=auto) or the resolved
pinned source (source=pinned).

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>backupInstanceName</b></td>
        <td>string</td>
        <td>
          backupInstanceName is QuestDB's 3-word backup identity for that set,
written into a replica's _backup_restore trigger.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>serial</b></td>
        <td>integer</td>
        <td>
          serial is the instance serial whose backup set seeds new replicas.<br/>
          <br/>
            <i>Format</i>: int32<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>source</b></td>
        <td>enum</td>
        <td>
          source is how the seed was chosen: "auto" (most-recent-live) or "pinned"
(spec.replication.seedFrom).<br/>
          <br/>
            <i>Enum</i>: auto, pinned<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>timestamp</b></td>
        <td>string</td>
        <td>
          timestamp is the completion time of the backup this seed points at.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBCluster.status.replication.stream
<sup><sup>[↩ Parent](#questdbclusterstatusreplication)</sup></sup>



stream reports the observed follower and source WAL progress over time.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>advancedAt</b></td>
        <td>string</td>
        <td>
          advancedAt is when writtenTxn last increased, or when observation began if no
increase has been observed.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>receivedAdvancedAt</b></td>
        <td>string</td>
        <td>
          receivedAdvancedAt is when receivedTxn last increased, or when observation began
if no increase has been observed. A quiet value does not prove the source process
has stopped.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>receivedTxn</b></td>
        <td>integer</td>
        <td>
          receivedTxn is the highest source transaction observed in sampled replication
indexes. It reports source publication progress and never decreases.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>writtenTxn</b></td>
        <td>integer</td>
        <td>
          writtenTxn is the highest transaction observed as applied locally across sampled
tables and follower instances. It never decreases.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>

## QuestDBObjectStore






QuestDBObjectStore is the Schema for the questdbobjectstores API.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
      <td><b>apiVersion</b></td>
      <td>string</td>
      <td>questdb.io/v1alpha1</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b>kind</b></td>
      <td>string</td>
      <td>QuestDBObjectStore</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b><a href="https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#objectmeta-v1-meta">metadata</a></b></td>
      <td>object</td>
      <td>Refer to the Kubernetes API documentation for the fields of the `metadata` field.</td>
      <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespec">spec</a></b></td>
        <td>object</td>
        <td>
          spec defines the desired state of QuestDBObjectStore<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.provider != 'S3' || (has(self.s3) && !has(self.azure) && !has(self.gcs)): provider S3 requires the s3 block and no other provider block</li><li>self.provider != 'Azure' || (has(self.azure) && !has(self.s3) && !has(self.gcs)): provider Azure requires the azure block and no other provider block</li><li>self.provider != 'GCS' || (has(self.gcs) && !has(self.s3) && !has(self.azure)): provider GCS requires the gcs block and no other provider block</li><li>self.provider != 'GCS': provider GCS is not supported in this release; supported providers are S3 and Azure</li></ul>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorestatus">status</a></b></td>
        <td>object</td>
        <td>
          status defines the observed state of QuestDBObjectStore<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec
<sup><sup>[↩ Parent](#questdbobjectstore)</sup></sup>



spec defines the desired state of QuestDBObjectStore

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>provider</b></td>
        <td>enum</td>
        <td>
          provider selects the backend. It is immutable: changing the backend of a
live store would orphan every object (data + backups) written under the old
backend while consumers silently re-point to an empty new one.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: provider is immutable</li></ul>
            <i>Enum</i>: S3, Azure, GCS<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecazure">azure</a></b></td>
        <td>object</td>
        <td>
          azure configures an Azure Blob store. Set iff provider is Azure.<br/>
          <br/>
            <i>Validations</i>:<ul><li>!has(self.extraOptions) || self.extraOptions.all(k, !k.contains(';') && !k.contains('=') && !self.extraOptions[k].contains(';')): extraOptions keys must not contain ';' or '='; values must not contain ';'</li><li>!has(self.extraOptions) || self.extraOptions.all(k, !(k.lowerAscii() in ['container','account_name','account_key','root','endpoint'])): extraOptions key is reserved; set it via the dedicated structured field</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecgcs">gcs</a></b></td>
        <td>object</td>
        <td>
          gcs configures a Google Cloud Storage store. Set iff provider is GCS.<br/>
          <br/>
            <i>Validations</i>:<ul><li>!has(self.extraOptions) || self.extraOptions.all(k, !k.contains(';') && !k.contains('=') && !self.extraOptions[k].contains(';')): extraOptions keys must not contain ';' or '='; values must not contain ';'</li><li>!has(self.extraOptions) || self.extraOptions.all(k, !(k.lowerAscii() in ['bucket','root','endpoint','credential','credential_path','token'])): extraOptions key is reserved; set it via the dedicated structured field</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecs3">s3</a></b></td>
        <td>object</td>
        <td>
          s3 configures an AWS S3 (or S3-compatible) store. Set iff provider is S3.<br/>
          <br/>
            <i>Validations</i>:<ul><li>!has(self.extraOptions) || self.extraOptions.all(k, !k.contains(';') && !k.contains('=') && !self.extraOptions[k].contains(';')): extraOptions keys must not contain ';' or '='; values must not contain ';'</li><li>!has(self.extraOptions) || self.extraOptions.all(k, !(k.lowerAscii() in ['bucket','root','region','endpoint','access_key_id','secret_access_key','session_token'])): extraOptions key is reserved; set it via the dedicated structured field</li></ul>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.azure
<sup><sup>[↩ Parent](#questdbobjectstorespec)</sup></sup>



azure configures an Azure Blob store. Set iff provider is Azure.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>accountName</b></td>
        <td>string</td>
        <td>
          accountName is the storage account name used to construct the default Azure
Blob endpoint and provider configuration.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>container</b></td>
        <td>string</td>
        <td>
          container is the blob container name.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecazurecredentialssecret">credentialsSecret</a></b></td>
        <td>object</td>
        <td>
          credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>endpoint</b></td>
        <td>string</td>
        <td>
          endpoint overrides the default endpoint (MinIO / Azurite / fake-gcs).
For Azure, when omitted the operator derives
https://&lt;accountName&gt;.blob.core.windows.net.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>extraOptions</b></td>
        <td>map[string]string</td>
        <td>
          extraOptions are appended verbatim as OpenDAL key=value pairs (e.g.
ca_builtin_roots). Keys must not contain ';' or '='; values must not
contain ';'.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.all(k, k.size() &lt;= 256): extraOptions keys must be at most 256 characters</li><li>self.all(k, self[k].size() &lt;= 256): extraOptions values must be at most 256 characters</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is a path prefix within the bucket/container. NOTE: on a QuestDBObjectStore
this field does NOT isolate data — the effective prefix is the consuming cluster's
per-use root (spec.backup.root / spec.replication.root), which overrides it. Those
per-use roots are what isolate clusters that share a bucket (QuestDB has no
instance-name key).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.azure.credentialsSecret
<sup><sup>[↩ Parent](#questdbobjectstorespecazure)</sup></sup>



credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent.
This field is effectively required, but due to backwards compatibility is
allowed to be empty. Instances of this type with an empty value here are
almost certainly wrong.
More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
          <br/>
            <i>Default</i>: <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.gcs
<sup><sup>[↩ Parent](#questdbobjectstorespec)</sup></sup>



gcs configures a Google Cloud Storage store. Set iff provider is GCS.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>bucket</b></td>
        <td>string</td>
        <td>
          bucket is the GCS bucket name.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecgcscredentialssecret">credentialsSecret</a></b></td>
        <td>object</td>
        <td>
          credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>endpoint</b></td>
        <td>string</td>
        <td>
          endpoint overrides the default endpoint (MinIO / Azurite / fake-gcs).
For Azure, when omitted the operator derives
https://&lt;accountName&gt;.blob.core.windows.net.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>extraOptions</b></td>
        <td>map[string]string</td>
        <td>
          extraOptions are appended verbatim as OpenDAL key=value pairs (e.g.
ca_builtin_roots). Keys must not contain ';' or '='; values must not
contain ';'.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.all(k, k.size() &lt;= 256): extraOptions keys must be at most 256 characters</li><li>self.all(k, self[k].size() &lt;= 256): extraOptions values must be at most 256 characters</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is a path prefix within the bucket/container. NOTE: on a QuestDBObjectStore
this field does NOT isolate data — the effective prefix is the consuming cluster's
per-use root (spec.backup.root / spec.replication.root), which overrides it. Those
per-use roots are what isolate clusters that share a bucket (QuestDB has no
instance-name key).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.gcs.credentialsSecret
<sup><sup>[↩ Parent](#questdbobjectstorespecgcs)</sup></sup>



credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent.
This field is effectively required, but due to backwards compatibility is
allowed to be empty. Instances of this type with an empty value here are
almost certainly wrong.
More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
          <br/>
            <i>Default</i>: <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.s3
<sup><sup>[↩ Parent](#questdbobjectstorespec)</sup></sup>



s3 configures an AWS S3 (or S3-compatible) store. Set iff provider is S3.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>bucket</b></td>
        <td>string</td>
        <td>
          bucket is the S3 bucket name.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbobjectstorespecs3credentialssecret">credentialsSecret</a></b></td>
        <td>object</td>
        <td>
          credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>endpoint</b></td>
        <td>string</td>
        <td>
          endpoint overrides the default endpoint (MinIO / Azurite / fake-gcs).
For Azure, when omitted the operator derives
https://&lt;accountName&gt;.blob.core.windows.net.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>extraOptions</b></td>
        <td>map[string]string</td>
        <td>
          extraOptions are appended verbatim as OpenDAL key=value pairs (e.g.
ca_builtin_roots). Keys must not contain ';' or '='; values must not
contain ';'.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self.all(k, k.size() &lt;= 256): extraOptions keys must be at most 256 characters</li><li>self.all(k, self[k].size() &lt;= 256): extraOptions values must be at most 256 characters</li></ul>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>region</b></td>
        <td>string</td>
        <td>
          region is the bucket region.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>root</b></td>
        <td>string</td>
        <td>
          root is a path prefix within the bucket/container. NOTE: on a QuestDBObjectStore
this field does NOT isolate data — the effective prefix is the consuming cluster's
per-use root (spec.backup.root / spec.replication.root), which overrides it. Those
per-use roots are what isolate clusters that share a bucket (QuestDB has no
instance-name key).<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.spec.s3.credentialsSecret
<sup><sup>[↩ Parent](#questdbobjectstorespecs3)</sup></sup>



credentialsSecret holds static credentials. The operator never configures a
ServiceAccount, pod identity label, or provider identity; omit this field only
when the QuestDB pod already has provider-supported ambient identity. The
beta-supported wiring is EKS IRSA through the tenant default ServiceAccount;
the AKS guide uses AZURE_STORAGE_KEY. Expected Secret keys: S3 —
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN; Azure —
AZURE_STORAGE_KEY; GCS — GOOGLE_APPLICATION_CREDENTIALS_JSON.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          Name of the referent.
This field is effectively required, but due to backwards compatibility is
allowed to be empty. Instances of this type with an empty value here are
almost certainly wrong.
More info: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#names<br/>
          <br/>
            <i>Default</i>: <br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBObjectStore.status
<sup><sup>[↩ Parent](#questdbobjectstore)</sup></sup>



status defines the observed state of QuestDBObjectStore

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>observedGeneration</b></td>
        <td>integer</td>
        <td>
          observedGeneration is the most recent .metadata.generation observed.<br/>
          <br/>
            <i>Format</i>: int64<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>

## QuestDBPromotion






QuestDBPromotion is the Schema for the questdbpromotions API. One object is one
cutover: it is created to request a promotion, runs once, and reaches a terminal phase.
Retrying means creating a new object.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
      <td><b>apiVersion</b></td>
      <td>string</td>
      <td>questdb.io/v1alpha1</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b>kind</b></td>
      <td>string</td>
      <td>QuestDBPromotion</td>
      <td>true</td>
      </tr>
      <tr>
      <td><b><a href="https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.27/#objectmeta-v1-meta">metadata</a></b></td>
      <td>object</td>
      <td>Refer to the Kubernetes API documentation for the fields of the `metadata` field.</td>
      <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbpromotionspec">spec</a></b></td>
        <td>object</td>
        <td>
          spec defines the desired state of QuestDBPromotion<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b><a href="#questdbpromotionstatus">status</a></b></td>
        <td>object</td>
        <td>
          status defines the observed state of QuestDBPromotion<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBPromotion.spec
<sup><sup>[↩ Parent](#questdbpromotion)</sup></sup>



spec defines the desired state of QuestDBPromotion

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b><a href="#questdbpromotionspecclusterref">clusterRef</a></b></td>
        <td>object</td>
        <td>
          clusterRef names the QuestDBCluster to cut over, in this object's namespace. It is
immutable: re-pointing a live cutover at a different cluster is never a coherent
request.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: clusterRef is immutable; create a new QuestDBPromotion instead</li></ul>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>target</b></td>
        <td>integer</td>
        <td>
          target is the instance serial that should become the primary. Immutable, so an
escalation to mode: Emergency is structurally against the same cutover and cannot
silently substitute a different node.<br/>
          <br/>
            <i>Validations</i>:<ul><li>self == oldSelf: target is immutable; create a new QuestDBPromotion instead</li></ul>
            <i>Format</i>: int32<br/>
            <i>Minimum</i>: 1<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>catchUpTimeoutSeconds</b></td>
        <td>integer</td>
        <td>
          catchUpTimeoutSeconds is how long a Planned cutover waits for the target replica to
catch up before failing. Nothing is shaped while it waits — the old primary is still
primary and still serving writes — so a timeout here leaves the cluster exactly as it
was and costs only the cutover. Raise it for a replica with a large lag to work
through. It is measured from the start of the cutover, so time spent waiting on a
non-drainable primary counts against it. 0 means wait indefinitely. Ignored when mode
is Emergency, which never waits. The post-drain wait for the target to confirm it
applied the drained tail is downtime, so it is bounded by primaryGracePeriodSeconds
instead — see there.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Default</i>: 900<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mode</b></td>
        <td>enum</td>
        <td>
          mode selects the cutover strategy. The operator never chooses between a lossless
cutover and a lossy one on your behalf — that choice is always yours.

Planned (the default) drains the old primary before promoting the target, so every
committed write reaches the new primary. If the old primary cannot be drained — its
data PVC is lost, or it is stranded on an unreachable node — the promotion FAILS and
nothing is promoted. It never falls back to Emergency.

Emergency skips the drain: it fences the old primary and promotes the target
immediately. Writes the old primary had not yet replicated are LOST. Use it when the
primary is dead, or alive but wedged and you accept the loss.

It is the one field editable on a running cutover, and only in one direction:
Planned may be escalated to Emergency, never the reverse, because a fence cannot be
undone.<br/>
          <br/>
            <i>Validations</i>:<ul><li>oldSelf != 'Emergency' || self == 'Emergency': mode cannot be de-escalated from Emergency back to Planned: the old primary has already been fenced</li></ul>
            <i>Enum</i>: Planned, Emergency<br/>
            <i>Default</i>: Planned<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>primaryGracePeriodSeconds</b></td>
        <td>integer</td>
        <td>
          primaryGracePeriodSeconds is how long a Planned cutover tolerates an old primary it
cannot drain before failing. It covers both the start of the cutover and a primary
lost mid-drain, and it exists so a brief node blip does not fail an otherwise
healthy cutover.

It also bounds the wait AFTER a successful drain, while the target confirms it has
applied what that drain uploaded (measured from status.drainCompletedAt; reason
TargetNotReplayed). The rule is the cost, not the phase: while the cluster is not
serving writes, this field is the limit; while it is still serving, it is
catchUpTimeoutSeconds.

This wait IS downtime: the primary is gone, so the cluster is not serving writes for
its duration, and reaching it fails this cutover for good (reason PrimaryNotDrainable,
or PrimaryLostDuringDrain if the primary was lost part-way through). A promotion is
one-shot: there is nothing to re-request on a terminal object, so accepting the loss
means creating a NEW QuestDBPromotion with mode: Emergency. Keep it short. 0 means wait
indefinitely, which trades a bounded outage for an unbounded one. Ignored when mode is
Emergency, which never waits.<br/>
          <br/>
            <i>Format</i>: int32<br/>
            <i>Default</i>: 120<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBPromotion.spec.clusterRef
<sup><sup>[↩ Parent](#questdbpromotionspec)</sup></sup>



clusterRef names the QuestDBCluster to cut over, in this object's namespace. It is
immutable: re-pointing a live cutover at a different cluster is never a coherent
request.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>name</b></td>
        <td>string</td>
        <td>
          name references an object in the same namespace as the object holding this
reference. Which kind is determined by the field: see its documentation.<br/>
        </td>
        <td>true</td>
      </tr></tbody>
</table>


### QuestDBPromotion.status
<sup><sup>[↩ Parent](#questdbpromotion)</sup></sup>



status defines the observed state of QuestDBPromotion

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>completedAt</b></td>
        <td>string</td>
        <td>
          completedAt is when this cutover reached a terminal phase.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b><a href="#questdbpromotionstatusconditionsindex">conditions</a></b></td>
        <td>[]object</td>
        <td>
          conditions carries Succeeded: Unknown while running, True on Completed, False on
Failed.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>drainCompletedAt</b></td>
        <td>string</td>
        <td>
          drainCompletedAt is when the old primary's drain was first observed to finish — its
primary-catchup-uploads container exiting 0, which is the moment the object store
became final for this cutover. Nil until then, and while a Planned cutover shows a
Draining phase with this set, it is waiting for the TARGET to confirm it has applied
what that drain uploaded. primaryGracePeriodSeconds bounds that wait, measured from
here.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>message</b></td>
        <td>string</td>
        <td>
          message is a human-readable explanation naming what happened, what state the cluster
is in, and what to do next.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>mode</b></td>
        <td>string</td>
        <td>
          mode is the strategy this cutover RAN (Planned|Emergency): decided once at entry
from spec.mode and never escalated on the operator's own initiative. It only ever
differs from the request if you explicitly escalated to mode: Emergency while the
drain was still running.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>phase</b></td>
        <td>enum</td>
        <td>
          phase is the saga phase. Completed and Failed are terminal.<br/>
          <br/>
            <i>Enum</i>: Pending, Validating, Draining, Promoting, Completed, Failed<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>reason</b></td>
        <td>string</td>
        <td>
          reason is a machine-readable outcome code (CamelCase), set on a terminal phase.<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>startedAt</b></td>
        <td>string</td>
        <td>
          startedAt is when this cutover left Pending. It is the clock catchUpTimeoutSeconds
is measured against.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr><tr>
        <td><b>undrainableSince</b></td>
        <td>string</td>
        <td>
          undrainableSince is when the old primary most recently became non-drainable, or nil
while it is drainable. It is cleared the moment the primary becomes drainable again,
so a blip that recovers resets the grace clock rather than consuming it.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>


### QuestDBPromotion.status.conditions[index]
<sup><sup>[↩ Parent](#questdbpromotionstatus)</sup></sup>



Condition contains details for one aspect of the current state of this API Resource.

<table>
    <thead>
        <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Description</th>
            <th>Required</th>
        </tr>
    </thead>
    <tbody><tr>
        <td><b>lastTransitionTime</b></td>
        <td>string</td>
        <td>
          lastTransitionTime is the last time the condition transitioned from one status to another.
This should be when the underlying condition changed.  If that is not known, then using the time when the API field changed is acceptable.<br/>
          <br/>
            <i>Format</i>: date-time<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>message</b></td>
        <td>string</td>
        <td>
          message is a human readable message indicating details about the transition.
This may be an empty string.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>reason</b></td>
        <td>string</td>
        <td>
          reason contains a programmatic identifier indicating the reason for the condition's last transition.
Producers of specific condition types may define expected values and meanings for this field,
and whether the values are considered a guaranteed API.
The value should be a CamelCase string.
This field may not be empty.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>status</b></td>
        <td>enum</td>
        <td>
          status of the condition, one of True, False, Unknown.<br/>
          <br/>
            <i>Enum</i>: True, False, Unknown<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>type</b></td>
        <td>string</td>
        <td>
          type of condition in CamelCase or in foo.example.com/CamelCase.<br/>
        </td>
        <td>true</td>
      </tr><tr>
        <td><b>observedGeneration</b></td>
        <td>integer</td>
        <td>
          observedGeneration represents the .metadata.generation that the condition was set based upon.
For instance, if .metadata.generation is currently 12, but the .status.conditions[x].observedGeneration is 9, the condition is out of date
with respect to the current state of the instance.<br/>
          <br/>
            <i>Format</i>: int64<br/>
            <i>Minimum</i>: 0<br/>
        </td>
        <td>false</td>
      </tr></tbody>
</table>
