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

### Authentication changes in 4.1.0

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
