---
title: Upgrade QuestDB
sidebar_label: Upgrade QuestDB
description:
  How to upgrade QuestDB to a newer version using Docker or binaries, for both
  open source and enterprise editions.
---

Upgrading QuestDB to a newer version requires replacing the server binary (or
pulling a new Docker image) and restarting the process. Your existing data
directory stays in place. This applies to both QuestDB Open Source and QuestDB
Enterprise.

:::info Looking for a fresh install?
If this is your first time setting up QuestDB, see the
[Quick start](/docs/getting-started/quick-start/) guide instead.
:::

## Before you upgrade

1. **Read the [release notes](https://questdb.com/release-notes/).** QuestDB is
   generally backwards compatible, but breaking changes do occur and are
   documented in the release notes.

2. **Back up your data.** On first startup, the new version may automatically
   migrate internal metadata. Once this happens, rolling back to the previous
   version may produce errors. Create a backup or snapshot before upgrading,
   especially for production instances. See
   [Backup and restore](/docs/operations/backup/) for details.

3. **Plan the way back.** QuestDB 10.2.1 and QuestDB Enterprise 4.2.1 lock
   every table they write against earlier releases. Before going back to an
   earlier release, restart once with `cairo.commit.mode=nosync` and
   `cairo.commit.mode.adaptive.downgrade=true` to unlock the database. See
   [Downgrade to an earlier release](/docs/concepts/durability/#downgrade).
   With cold storage, an upgrade to QuestDB Enterprise ENTERPRISE_VERSION_TBD
   cannot be undone this way, see
   [Upgrading to ENTERPRISE_VERSION_TBD](#upgrading-to-enterprise_version_tbd).

## Upgrade steps

### Docker

Pull the latest image and restart the container, pointing to the same data
volume:

```shell
docker pull questdb/questdb:latest
```

Then recreate your container with the new image, using the same volume mount for
your QuestDB root directory:

```shell
docker stop questdb
docker rm questdb
docker run -d --name questdb \
  -p 9000:9000 -p 9009:9009 -p 8812:8812 \
  -v /path/to/questdb-data:/var/lib/questdb \
  questdb/questdb:latest
```

Replace `/path/to/questdb-data` with the path to your existing data directory.

### Binaries

1. Stop the running QuestDB process.
2. Download the new binary from the
   [GitHub releases page](https://github.com/questdb/questdb/releases) (or
   build from source).
3. Replace the old binary with the new one.
4. Start QuestDB, pointing to the same root directory.

## QuestDB Enterprise

:::tip QuestDB Enterprise BYOC
If you are a QuestDB Enterprise BYOC customer, upgrades are managed for you. See
[QuestDB Enterprise BYOC](#questdb-enterprise-byoc) below.
:::

The upgrade process for Enterprise is identical: replace the binary or pull the
new image, then restart.

The difference is how you obtain the new version:

- **Binaries**: download from the SFTP or distribution channel provided by
  QuestDB during onboarding.
- **Docker**: pull from the Enterprise ECR registry that was whitelisted for your
  AWS account.

If you are unsure where to get the latest Enterprise version, contact
[support@questdb.com](mailto:support@questdb.com).

### Replication: upgrade order

When running QuestDB Enterprise with replication, **upgrade all replicas before
upgrading the primary**.

The primary may write WAL segments containing new metadata formats to the object
store. If a replica running an older version encounters metadata it does not
recognize, it will error. Upgrading replicas first ensures they can handle any
new metadata the primary produces after its upgrade.

With [cold storage](/docs/concepts/cold-storage/), also upgrade the instance
that runs the cold storage manager last: run the manager on the primary during
the upgrade, so that both orders agree. See
[Upgrading to ENTERPRISE_VERSION_TBD](#upgrading-to-enterprise_version_tbd).

When upgrading to 4.0.0 or later, grant the `SWITCH ROLE` permission only after
every node runs the new version. The permission is stored in a form older
versions cannot read. A principal that holds `DATABASE ADMIN`, including
through a database-level `GRANT ALL` issued on 2.3.1 or later, already has it.
Others, such as accounts that triggered role switches through `SYSTEM ADMIN` on
3.3.x, need an explicit `GRANT SWITCH ROLE`. See
[Failover operator](/docs/security/rbac/#failover-operator) and
[Database administrator](/docs/security/rbac/#database-administrator).

### Upgrading to ENTERPRISE_VERSION_TBD

This release changes how [cold storage](/docs/concepts/cold-storage/) writes its root, one-way. Without cold storage, only [Deduplicated tables](#deduplicated-tables) and [Strict configuration validation](#strict-configuration-validation) below apply. Whether or not you use cold storage, the release adds about 15 ns to each table that a query opens, and about 2.5 KB of memory per table.

#### Cold storage

A cold storage manager of this release writes the root's catalog and manifests at version 2.0. Earlier releases cannot use such a root: they log `incompatible version: got 2.0, expected major version 1`, pause cold storage, and cannot read the partitions uploaded since, until they are upgraded. There is no downgrade.

Check before upgrading:

- **Object store requirements.** The cold storage manager now writes the catalog, manifests and lock with conditional requests, which the store must support, including `If-Match` on `DeleteObject` for an S3-compatible store. An `fs` root needs hard links, and every instance that uses it must run on the same host, see [Prepare the object store root](/docs/operations/cold-storage/#1-prepare-the-object-store-root).
- **Backup permissions.** Instances that take backups need new permissions on the root, or their backups of cold partitions fail, see [Prepare the object store root](/docs/operations/cold-storage/#1-prepare-the-object-store-root).
- **Object key layout.** New uploads use one key per version of a partition, not Hive-style paths. Tools that read the root by path must take keys from `table_cold_partitions()`, see [Object store layout](/docs/concepts/cold-storage/#object-store-layout).
- **`table_cold_partitions()` states.** `live` and `sealed` become `active`, so update monitoring queries.
- **One root per database.** An instance of another database refuses the root with [`ER010`](/docs/troubleshooting/error-codes/#er010). A replica behind the root cannot be promoted, with [`ER011`](/docs/troubleshooting/error-codes/#er011), and neither can one with a table that went through `REBASE WAL` or a `SET TYPE` round trip on an earlier release, until the table's `sequencerTxn` reaches the `coldStorageSeqTxn` that the `ER011` message names. That can take as many transactions as the table had before its transaction numbers restarted.
- **Point-in-time recovery** needs a new root and a backup taken after the upgrade, see [Point-in-time recovery](/docs/operations/point-in-time-recovery/#cold-storage).
- **`DROP LOCAL`** no longer removes a partition that only cold storage holds. While cold storage is disabled, a query that reads one fails instead of skipping it.
- **New refusals** on cold storage tables, such as `REBASE WAL` and `SET TYPE`, see [Restrictions on cold storage tables](/docs/concepts/cold-storage/#restrictions-on-cold-storage-tables). `CONVERT PARTITION TO NATIVE` also refuses read-only partitions on every table.
- **From 4.0.x**, no extra step: this release reads the 4.0.x manager lock.

Upgrade the instance that runs the cold storage manager **last**. With a primary P and its replicas, which share one root, this also follows [Replication: upgrade order](#replication-upgrade-order):

1. Run the cold storage manager on P. If it runs on a replica, move it to P with a [manager handoff](/docs/operations/cold-storage/#manager-handoff) before you upgrade anything.
2. Upgrade each replica, and every other instance that uses the root, and start it with `cold.storage.role=refresher`.
3. Stop P. Until it is back, the database takes no writes, and uploads and garbage collection pause.
4. Upgrade P and start it with `cold.storage.role=manager`. It stamps the root with the database's Data ID and a new `root_id`, and writes version 2.0 from then on. This is the point of no return.
5. [Take a backup](/docs/operations/backup/) on each instance that takes backups: earlier backups pin no cold objects.
6. Optionally, move the manager back to a replica with a manager handoff, and update `cold.storage.role` in both instances' `server.conf`.

To keep writes available, replace step 3 with a [planned switchover](/docs/high-availability/failover/#planned-switchover) to an upgraded replica R that stays a cold storage refresher, and set `replication.role=primary` in R's `server.conf`. If R's promotion is refused with `ER011`, promote P back first. Stop P right after the switchover, since it still runs the earlier release, and in step 4 start it as a replica.

#### Late rows in cold storage

This release adds [late rows in cold storage](/docs/concepts/cold-storage-late-rows/), off by default. Enable them only once every instance that uses the root is upgraded, see [Before you enable late rows](/docs/concepts/cold-storage-late-rows/#before-you-enable-late-rows). Earlier releases refuse to open a table that keeps late rows.

#### Deduplicated tables

A transaction with rows for a read-only partition, such as one sealed by cold storage, now suspends a WAL table with deduplication, instead of dropping those rows. See [Rows for read-only partitions](/docs/concepts/deduplication/#rows-for-read-only-partitions).

#### Strict configuration validation

With `config.validation.strict=true`, which the `server.conf` of a new installation sets, a boolean setting whose value is not `true` or `false` now fails startup, see [Config validation](/docs/configuration/overview/#configvalidationstrict). Earlier releases read such a value as `false`.

### Upgrading to 4.2.1 {#upgrading-to-420}

QuestDB Enterprise 4.2.1 adds
[adaptive durability mode](/docs/concepts/durability/). The default stays
`nosync`. Check the following before upgrading:

- A replicating primary in `nosync` or `async` mode now refuses to start when,
  after a power loss or an operating system crash, its log of a table ends
  before the last transaction in the object store. Earlier releases started
  and diverged from the replicas. See
  [A primary refuses to start after a power loss](/docs/high-availability/disaster-recovery/#a-primary-refuses-to-start-after-a-power-loss).
- 4.1.0 and earlier refuse to open tables that 4.2.1 has written. To go back,
  first restart 4.2.1 once with `cairo.commit.mode=nosync` and
  `cairo.commit.mode.adaptive.downgrade=true`, see
  [Downgrade to an earlier release](/docs/concepts/durability/#downgrade).

QuestDB Enterprise 4.2.1 also changes `SHOW CREATE` output and restricts
administrative operations in views. Check schema-export scripts and stored
views for the following before upgrading:

- With access control enabled, plain `SHOW CREATE DATABASE` now requires both
  `LIST USERS` and `USER DETAILS`. Schema-only scripts should use
  `INCLUDE (SCHEMA)` instead of acquiring more permissions. See
  [database dumps](/docs/query/sql/show/#enterprise-access-control).
- Per-object `SHOW CREATE` and database dumps no longer append `OWNED BY`.
  Schema-only output does not restore grants. Use the ACL dump for permissions,
  and review
  [creator permissions on replay](/docs/query/sql/show/#enterprise-variant).
- With access control enabled, materialized and live views reject
  `SHOW CREATE DATABASE` with any ACL category, including the default. Change
  schema-metadata queries to `INCLUDE (SCHEMA)` under the
  [catalogue rules](/docs/query/sql/create-mat-view/#catalogue-functions).
- A regular view's `PIVOT IN` subquery rejects administrative functions and
  administrative `SHOW` statements. Existing definitions become invalid at
  their next compilation, including startup. See
  [view migration guidance](/docs/concepts/views/#administrative-operations-in-view-metadata).

QuestDB Enterprise 4.2.1 reserves to the
[built-in admin](/docs/security/rbac/#built-in-admin) the statements that remove
rows from `sys.view_audit`, the audit trail of
[audited views](/docs/security/audited-views/), or set it up to remove them. In
4.1.0, a principal granted the permission a statement needs, on the table or
`ON ALL TABLES`, could run it. After the upgrade, every other principal is
refused them, whatever it holds, with
`only the built-in admin can manage the retention, partitions and parameters of the view audit table`:

- `TRUNCATE TABLE`
- `ALTER TABLE DROP PARTITION` and `SQUASH PARTITIONS`
- `ALTER TABLE SET TTL` and `SET PARAM`
- `ALTER TABLE SET STORAGE POLICY`, with any policy, and
  `ENABLE STORAGE POLICY`

A storage policy already set on the trail keeps running, and `SELECT`,
`DISABLE STORAGE POLICY`, and `DROP STORAGE POLICY` stay grantable. Before you
upgrade, find the principals that can run these statements on the trail, and
move the scripts and jobs that run them to the built-in admin, or replace them
with a storage policy:

```questdb-sql title="On 4.1.0: who can remove rows from the trail"
SELECT entity_name, entity_type, permission, table_name
FROM active_permissions()
WHERE permission IN ('TRUNCATE TABLE', 'DROP PARTITION', 'SET TABLE PARAM',
    'SET STORAGE POLICY', 'ENABLE STORAGE POLICY')
  AND (table_name IS NULL OR table_name = 'sys.view_audit');
```

If the built-in admin is disabled,
[`acl.admin.user.enabled=false`](/docs/configuration/iam/#acladminuserenabled),
no principal can run these statements after the upgrade, not even the
administrators that replace the admin. A storage policy with a `DROP LOCAL`
stage keeps pruning the trail without any principal, so set one before you
upgrade, on the primary, as a principal that holds `SET STORAGE POLICY` on the
trail. The policy replicates, and keeps pruning the trail of every node:

```questdb-sql title="On 4.1.0: keep 90 days of trail on every node"
ALTER TABLE 'sys.view_audit'
    SET STORAGE POLICY(TO PARQUET 1d, DROP LOCAL 90d);
```

A TTL on the trail blocks the policy: clear it first with
`ALTER TABLE 'sys.view_audit' SET TTL 0 HOURS`. When upgrading from a release
before 4.1.0, which has no trail yet, set
[`view.audit.storage.policy`](/docs/configuration/audited-views/#viewauditstoragepolicy)
on every node instead, for example to `TO PARQUET 1d, DROP LOCAL 90d`: the
server creates the trail with it on the first start. Its default,
`TO PARQUET 1d`, never deletes a row.

After the upgrade, a principal that holds `DISABLE STORAGE POLICY` or
`REMOVE STORAGE POLICY` can still pause or remove the policy, but only the
built-in admin can enable it again or set another. To do that, to remove rows
by hand, or to repair the trail with `FORCE DROP PARTITION`, enable the admin:
set `acl.admin.user.enabled=true`, with a strong `acl.admin.password`, and
restart, since the setting is not reloadable. See
[Tamper protection](/docs/security/audited-views/#protection).

#### ACL audit log

QuestDB Enterprise 4.2.1 introduces the
[ACL audit log](/docs/security/acl-audit-log/). When upgrading from an earlier
release, the server creates `sys.acl_audit_log` and adds `change_id` columns to
ACL and credential tables.
Existing rows keep a `NULL` `change_id`; past changes are not reconstructed.
Review the following before upgrading:

- **Configure retention before the first start.** Set
  [`acl.audit.storage.policy`](/docs/configuration/iam/#aclauditstoragepolicy)
  on every node. Its default, `TO PARQUET 1d`, never deletes rows. Once the
  log exists, only the built-in admin can change its policy, so set retention
  before disabling that account. Verify it with
  `SHOW CREATE TABLE 'sys.acl_audit_log'` after startup and promotion.
- **Grant auditors the required permissions.** Reading the log takes
  `LIST USERS`, `USER DETAILS`, and `SELECT` on the table. A principal with
  only `SELECT ON ALL TABLES` cannot read it. Other table grants do not let a
  principal modify the log.
- **Check for a name collision.** An existing `sys.acl_audit_log` is reused,
  with its rows, only if it is a WAL table with the expected columns and types
  and `change_id` as its designated timestamp. Any other object with that
  name fails startup before the ACL migrations. Rename or drop the conflicting
  object using the previous release, then retry the upgrade. Do not disable
  ACL to get past this check: doing so can mark migrations as complete without
  applying them.
- **Check deferred migrations.** Tables with suspended WAL apply do not get
  `change_id` until a later startup after they are resumed. Databases restored
  from older backups have separate compatibility rules; see
  [Restoring access control tables](/docs/operations/backup/#restoring-access-control-tables).

A replica promoted before receiving the log creates it with its own retention
setting. If an older primary replicated a conflicting object with the log's
name, promotion itself does not fail, but ACL changes do. The built-in admin
must drop or rename that conflicting object; the next ACL statement or
startup creates the log. This exception applies to the conflicting object,
not to a valid audit log.

##### Embedded Enterprise Java integrations

Applications that directly implement Enterprise Java APIs must update and
rebuild:

- ACL write methods on `AccessListWriter`, and credential write methods on
  `PasswordStore`, `JwkStore`, and `PersistentRestTokenStore`, now take an
  `AclChange` as their first argument. Production callers use these methods,
  not the older overloads retained for tests.
- `EntSecurityContext` implementations must implement
  `isSessionPrincipalExternal()`. It describes the authenticated identity
  and must not change when the session assumes a service account. Forwarding
  contexts must forward this method too.

#### Service account creation

In QuestDB Enterprise 4.2.1 and later,
[`CREATE SERVICE ACCOUNT IF NOT EXISTS`](/docs/query/sql/acl/create-service-account/)
leaves an existing account unchanged. Before 4.2.1, the statement could assign
an existing account to the statement's owner with grant option. Ownership is
now assigned only when the statement creates the account. An invalid owner is
rejected before any changes, even when the account already exists.

Update provisioning scripts that relied on `IF NOT EXISTS ... OWNED BY` to
assign an existing account. Use
[`GRANT ASSUME SERVICE ACCOUNT ... WITH GRANT OPTION`](/docs/query/sql/acl/grant-assume-service-account/)
explicitly, from a principal authorized to grant it. Review existing
assignments with `SHOW SERVICE ACCOUNTS` for each user or group.

### Upgrading to 4.1.0

QuestDB Enterprise 4.1.0 hides tables and views from principals that hold no
permission on them, see
[object visibility](/docs/security/rbac/#object-visibility). The behavior
applies whenever access control is enabled and cannot be turned off. Check the
following before upgrading:

- Catalogue queries such as `tables()` and `SHOW TABLES` list only the objects
  a principal holds a permission on. Statements that name any other object fail
  with the missing-object error, such as `table does not exist [table=trades]`,
  instead of `Access denied`. Update clients and tests that match the old
  message.
- `reader_pool()`, `writer_pool()`, `files()`, and `glob()` with a pattern
  outside `cairo.sql.copy.root` require `SYSTEM ADMIN`. Monitoring accounts
  that call them need it, which also makes every unprotected object
  [visible](/docs/security/rbac/#visibility-rules) to them.
- Monitoring accounts that poll `tables()` or `wal_tables()`, for example to
  [detect suspended tables](/docs/operations/monitoring-alerting/#detect-suspended-tables),
  see only the tables they hold a permission on, so a suspended table hidden
  from them raises no alert. Grant such an account `SYSTEM ADMIN`, or a
  permission on every table it watches, see
  [monitoring account](/docs/security/rbac/#monitoring-account). Only
  `SYSTEM ADMIN` and `DATABASE ADMIN` holders also see the protected access
  control tables in `wal_tables()`.
- Creating a materialized or live view that calls a
  [catalogue function](/docs/query/sql/create-mat-view/#catalogue-functions),
  such as `tables()`, requires `SYSTEM ADMIN`. An existing materialized view
  that reads one through a regular view is invalidated at its first refresh.
- Existing materialized and live views that call a catalogue function in their
  own query keep refreshing, even when their creator does not hold
  `SYSTEM ADMIN`. Their refresh sees every object, so every principal with
  `SELECT` on such a view reads what the function lists, including objects
  hidden from it. Review who can read these views, and drop or rewrite the ones
  whose readers should not see every object.
- A view created on an earlier version that calls a table-name function, such
  as `table_columns('trades')`, resolves that table with the permissions of
  each reader. A reader that holds no permission on the table gets
  `table does not exist` from the view until you redefine the view after the
  upgrade, see
  [metadata functions in views](/docs/concepts/views/#metadata-functions-in-views).
- Compiled statements in the query caches are no longer shared between
  principals, so cache hit rates can drop when many principals run the same
  SQL.

#### Authentication changes in 4.1.0

QuestDB Enterprise 4.1.0 checks credentials more strictly. Before you upgrade,
check how these changes affect your users and clients:

- **HTTP sessions end with their credential.** A request that carries a
  session cookie and a credential that QuestDB rejects fails with
  `401 Unauthorized`, and ends the session, instead of being served from the
  session. A session also ends when its password changes, its REST token is
  dropped or expires, or its user is disabled or dropped. This applies to
  passwords and REST tokens, not only to OIDC. See
  [HTTP sessions](/docs/security/rbac/#http-sessions).
- **Expired OIDC tokens are rejected.** With
  `acl.oidc.groups.encoded.in.token=true`, QuestDB rejects a token that has no
  `exp` claim, or whose `exp` has passed, with 60 seconds of allowed clock
  skew. Earlier versions never checked the expiry, so a token kept working
  after it expired. A client that sends a fixed token, such as
  `token=<ID token>` in a connect string, stops working once that token
  expires, and an orphan drainer that presents an expired token sets the
  orphan's store-and-forward sender directory aside, and reports data loss, instead of draining
  it. Such a client must switch to a new token before the old one expires,
  or use a
  [rotating token provider](/docs/security/oidc/#rotating-bearer-tokens),
  available in the Java client 1.3.11 or later, the C, C++, and Rust clients
  7.3.0 or later, and the Python client 6.1.0 or later. See
  [Token validation](/docs/security/oidc/#token-validation).
- **OIDC tokens must come from the expected issuer.** With
  `acl.oidc.groups.encoded.in.token=true`, QuestDB rejects a token whose `iss`
  claim is missing or is not the expected issuer, and refuses to start without
  an expected issuer, such as with `acl.oidc.host` and no `acl.oidc.issuer`.
  With Microsoft Entra ID, v1.0 access tokens fail the check. See
  [Token validation](/docs/security/oidc/#token-validation).
- **Web Console users need a refresh token.** The session no longer keeps a
  Web Console logged in after its token expires. Without a refresh token, the
  user is logged out at that point. With Microsoft Entra ID, include
  `offline_access` in `acl.oidc.scope`. See
  [Web Console token renewal](/docs/security/oidc/#web-console-token-renewal).
- **Claim lists need every node on 4.1.0.** `acl.oidc.sub.claim` and
  `acl.oidc.groups.claim` accept comma-separated lists of claim names. Earlier
  versions read a list as one claim name, and reject every OIDC login, so in a
  replicated cluster, upgrade every node before you set a list. See
  [Fallback claim lists](/docs/security/oidc/#fallback-claim-lists).
- **Stricter claims.** A `null` or empty claim counts as missing, so a login
  that earlier versions accepted with the principal `null`, or with a group
  named `null`, is rejected. QuestDB also refuses to start with an empty
  `acl.oidc.sub.claim`, or with a claim listed in both settings: earlier
  versions started with them, then rejected every OIDC login. See
  [Startup validation](/docs/security/oidc/#startup-validation).

### QuestDB Enterprise BYOC

For QuestDB Enterprise BYOC customers, QuestDB manages the upgrade process. The
QuestDB team will reach out to coordinate when a new version is available. If
you would like to upgrade sooner, contact
[support@questdb.com](mailto:support@questdb.com).
