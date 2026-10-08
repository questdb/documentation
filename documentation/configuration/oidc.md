---
title: OpenID Connect (OIDC)
description: Configuration settings for OpenID Connect integration in QuestDB Enterprise.
---

:::note

OpenID Connect is [Enterprise](/enterprise/) only.

:::

OpenID Connect (OIDC) support is part of QuestDB's Identity and Access
Management. The database can be integrated with any OAuth2/OIDC Identity
Provider (IdP).

For detailed information about OIDC, see the
[OpenID Connect (OIDC) integration guide](/docs/security/oidc).

## General

### acl.oidc.audience

- **Default**: none (defaults to the client ID)
- **Reloadable**: no

OAuth2 audience as set on the tokens issued by the OIDC Provider. Defaults
to the client ID if not set.

With `acl.oidc.groups.encoded.in.token=true`, QuestDB accepts a token only when
its `aud` claim matches this value, and accepts a single audience. Keep the
default: the ID tokens that the Web Console sends carry the client ID, so
another value makes Web Console logins fail. See
[Token validation](/docs/security/oidc/#token-validation).

### acl.oidc.client.id

- **Default**: none
- **Reloadable**: no

Client name assigned to QuestDB in the OIDC server. Required when OIDC is
enabled.

### acl.oidc.configuration.url

- **Default**: none
- **Reloadable**: no

URL where the OpenID Provider's configuration information can be loaded in
JSON format. Should always end with `/.well-known/openid-configuration`.

### acl.oidc.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables OIDC authentication. When enabled, several other
configuration options must also be set.

### acl.oidc.host

- **Default**: none
- **Reloadable**: no

OIDC provider hostname. Required when OIDC is enabled, unless the OIDC
configuration URL is set.

### acl.oidc.http.timeout

- **Default**: `30000`
- **Reloadable**: no

OIDC provider HTTP request timeout in milliseconds.

### acl.oidc.port

- **Default**: `443`
- **Reloadable**: no

OIDC provider port number.

### acl.oidc.redirect.uri

- **Default**: none
- **Reloadable**: no

The redirect URI tells the OIDC server where to redirect the user after
successful authentication. If not set, the Web Console defaults it to the
location where it was loaded from (`window.location.href`).

### acl.oidc.scope

- **Default**: `openid`
- **Reloadable**: no

The OIDC server asks consent for the scopes listed in this property. The
scope `openid` is mandatory and must always be included.

## Authentication flows

### acl.oidc.pg.token.as.password.enabled

- **Default**: `false`
- **Reloadable**: no

When enabled, the PGWire endpoint supports OIDC authentication. The OAuth2
token should be sent in the password field, while the username field should
contain the string `_sso`, or left empty if that is an option.

### acl.oidc.pkce.required

- **Default**: `true`
- **Reloadable**: no

Whether the Web Console uses PKCE (Proof Key for Code Exchange) in the
Authorization Code Flow. This should always be enabled in production. The Web
Console is not fully secure without it.

`acl.oidc.pkce.enabled` is not a QuestDB setting. QuestDB reports it as an
invalid setting at startup and does not apply its value, and with
[`config.validation.strict=true`](/docs/configuration/overview/#configvalidationstrict)
it refuses to start. Use `acl.oidc.pkce.required` instead.

### acl.oidc.ropc.flow.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables the Resource Owner Password Credentials flow. When
enabled, this flow must also be configured in the OIDC Provider.

## Endpoints

### acl.oidc.authorization.endpoint

- **Default**: `/as/authorization.oauth2`
- **Reloadable**: no

OIDC Authorization Endpoint. The default value should work for the Ping
Identity Platform.

### acl.oidc.public.keys.endpoint

- **Default**: `/pf/JWKS`
- **Reloadable**: no

JSON Web Key Set (JWKS) Endpoint. Provides the list of public keys used to
decode and validate ID tokens issued by the OIDC Provider. The default value
should work for the Ping Identity Platform.

### acl.oidc.token.endpoint

- **Default**: `/as/token.oauth2`
- **Reloadable**: no

OIDC Token Endpoint. The default value should work for the Ping Identity
Platform.

### acl.oidc.userinfo.endpoint

- **Default**: `/idp/userinfo.openid`
- **Reloadable**: no

OIDC User Info Endpoint. Used to retrieve additional user information
containing group memberships. The default value should work for the Ping
Identity Platform.

## TLS

These settings control TLS between QuestDB and the OIDC provider. For general
TLS encryption across QuestDB interfaces, see the
[TLS configuration](/docs/configuration/tls/).

### acl.oidc.tls.enabled

- **Default**: `true`
- **Reloadable**: no

Whether the OIDC provider requires a secure connection. If the OpenID
Provider endpoints do not require TLS, this can be set to `false`. This is
unlikely in production.

### acl.oidc.tls.keystore.password

- **Default**: none
- **Reloadable**: no

Keystore password. Required if a keystore file is configured and is password
protected.

### acl.oidc.tls.keystore.path

- **Default**: none
- **Reloadable**: no

Path to a keystore file containing trusted Certificate Authorities. Used when
validating the certificate of the OIDC provider. Not required if the
provider's certificate is signed by a public CA.

### acl.oidc.tls.validation.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables TLS certificate validation. Disable this if working with
self-signed certificates. Validation is strongly recommended in production.
QuestDB checks that the certificate is valid and issued for the server to
which it connects.

## User and group claims

QuestDB reads the principal and the group memberships of an external user from
the user information: the User Info endpoint's response or, when
`acl.oidc.groups.encoded.in.token` is `true`, the payload of a JWT, such as an
ID token. `acl.oidc.sub.claim` and `acl.oidc.groups.claim` each take a single
claim name or, since QuestDB Enterprise 4.0.2, a comma-separated list of claim
names in priority order. For how QuestDB picks the claims, with examples, see
[User and group claims](/docs/security/oidc/#user-and-group-claims) in the
OIDC guide. For how versions before 4.0.2 differ, see
[Versions before 4.0.2](/docs/security/oidc/#versions-before-402).

### acl.oidc.cache.ttl

- **Default**: `30000`
- **Reloadable**: no

How long QuestDB caches the user information of a valid token, in
milliseconds: the User Info endpoint's response or, when
`acl.oidc.groups.encoded.in.token` is `true`, the result of validating the
token. This setting controls how often a token is validated again and the user
information refreshed. With `acl.oidc.groups.encoded.in.token=true`, the user
information comes from the token itself, so a change to it takes effect when
the client presents a new token.

### acl.oidc.groups.claim

- **Default**: none
- **Reloadable**: no

The claim in the user information that contains the group memberships of the
user, as an array of group names or as a single group name. Required when OIDC
is enabled.

Since QuestDB Enterprise 4.0.2, accepts a comma-separated list of claims in
priority order, such as `roles,groups`. QuestDB takes the groups from the first
claim on the list that holds at least one group name, and does not combine
groups from several claims. A login is rejected when none of the listed claims
holds a group name. With OIDC enabled, QuestDB refuses to start when the list
names a claim twice, or names a claim that `acl.oidc.sub.claim` also lists.

On earlier versions, a list makes every OIDC login fail. With
`acl.oidc.groups.encoded.in.token=true`, earlier versions also require a
`groups` array in the token, whatever this setting names.

See [How QuestDB picks a claim](/docs/security/oidc/#how-questdb-picks-a-claim)
and [Startup validation](/docs/security/oidc/#startup-validation).

### acl.oidc.groups.encoded.in.token

- **Default**: `false`
- **Reloadable**: no

When `true`, QuestDB reads the principal and the group memberships from a JWT
instead of calling the User Info endpoint: the ID token, which the Web Console
sends and QuestDB obtains itself in the ROPC flow, or a token that a client
presents, such as an Entra ID app-only access token. QuestDB validates the
token itself, as described in
[Token validation](/docs/security/oidc/#token-validation). Set to `true` if the
OIDC Provider encodes group memberships directly into the token.

Since QuestDB Enterprise 4.0.2, QuestDB also rejects expired tokens and tokens
without an `exp` claim. Earlier versions do not check the `exp` claim of the
token.

### acl.oidc.sub.claim

- **Default**: `sub`
- **Reloadable**: no

The claim in the user information that contains the user's principal, such as
a username, an email address, or an object ID. Displayed in the Web Console,
returned by `current_user()`, and logged for audit purposes. The principal must
be unique for each user: QuestDB keeps one external user per principal and
replaces its groups at every login, so users who share a principal share
permissions. Avoid display names, such as the `name` claim.

Since QuestDB Enterprise 4.0.2, accepts a comma-separated list of claims in
priority order, such as `preferred_username,oid`. QuestDB takes the principal
from the first claim on the list that holds a non-empty value. A login is
rejected when none of the listed claims holds one. With OIDC enabled, QuestDB
refuses to start when the value is empty, when the list names a claim twice, or
when it names a claim that `acl.oidc.groups.claim` also lists. An empty value
does not fall back to the default `sub`.

On earlier versions, a list makes every OIDC login fail.

See [How QuestDB picks a claim](/docs/security/oidc/#how-questdb-picks-a-claim)
and [Startup validation](/docs/security/oidc/#startup-validation).
