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

When upgrading to 4.0.0 or later, grant the `SWITCH ROLE` permission only after
every node runs the new version. The permission is stored in a form older
versions cannot read. A principal that holds `DATABASE ADMIN`, including
through a database-level `GRANT ALL` issued on 2.3.1 or later, already has it.
Others, such as accounts that triggered role switches through `SYSTEM ADMIN` on
3.3.x, need an explicit `GRANT SWITCH ROLE`. See
[Failover operator](/docs/security/rbac/#failover-operator) and
[Database administrator](/docs/security/rbac/#database-administrator).

### ACL audit log

:::note Upcoming Enterprise feature

This section describes an unreleased feature and its migrations. The ACL audit
log is not available in QuestDB Enterprise 4.1.0 or earlier. These instructions
apply when upgrading to a release that includes it.

:::

When upgrading from a version without the
[ACL audit log](/docs/security/acl-audit-log/), the server creates
`sys.acl_audit_log` and adds `change_id` columns to ACL and credential tables.
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

:::warning Rollback limitations

An older release does not enforce the audit log's special read or write
protections. It treats the log as an ordinary table, so existing broad table
grants may expose or allow changes to audit evidence. A later upgrade reuses
a structurally compatible log, including any rows written during the rollback.

An older release also cannot compact `sys.acl_permissions` after it gains
`change_id`. Compaction reports
`unexpected acl permissions column count, refusing to compact` and is
disabled until the next restart. Plan rollback around your pre-upgrade backup
rather than assuming the migrated database behaves as it did before.

:::

#### Embedded Enterprise Java integrations

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

### Service account creation

:::note Upcoming Enterprise behavior change

The behavior described here is unreleased. It does not apply to QuestDB
Enterprise 4.1.0 or earlier.

:::

In the upcoming release,
[`CREATE SERVICE ACCOUNT IF NOT EXISTS`](/docs/query/sql/acl/create-service-account/)
leaves an existing account unchanged. In Enterprise 4.1.0 and earlier, the
statement could assign the existing account to the statement's owner with grant
option. With the new behavior, ownership is assigned only when the statement
creates the account. An invalid owner is rejected before any changes, even when
the account already exists.

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
  expires, and an orphan drainer that presents an expired token sets its
  store-and-forward slot aside, and reports data loss, instead of draining
  it. Such a client must switch to a new token before the old one expires,
  or use a
  [token provider](/docs/connect/clients/java/#token-providers) in the Java
  client. See [Token validation](/docs/security/oidc/#token-validation).
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
