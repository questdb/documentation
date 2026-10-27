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

With `acl.oidc.groups.encoded.in.token=true`, QuestDB accepts a token only
when its `aud` claim contains this value. The ID tokens that the Web Console
sends carry the client ID, so keep the default when users sign in to the Web
Console. See [Token validation](/docs/security/oidc/#token-validation).

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

### acl.oidc.issuer

- **Default**: none
- **Reloadable**: no

The issuer that the `iss` claim of a token must match when
`acl.oidc.groups.encoded.in.token` is `true`, in QuestDB Enterprise 4.1.0 and
later. When not set, QuestDB uses the `issuer` field of the discovery document
that it downloads from
[`acl.oidc.configuration.url`](#acloidcconfigurationurl). When set, it takes
precedence over the discovery document. The comparison is exact and
case-sensitive, and includes the path and any trailing slash.

Set it when QuestDB has no discovery document, because it uses
[`acl.oidc.host`](#acloidchost) and the endpoint settings, or when the
discovery document names a template instead of an issuer, such as
`https://login.microsoftonline.com/{tenantid}/v2.0` for the multi-tenant
endpoints of Microsoft Entra ID. Set the issuer of your tenant, never a
template or a wildcard. With issuer validation enabled, QuestDB refuses to
start in token mode without an expected issuer:

```text
required to set acl.oidc.issuer or provide an issuer in the OIDC discovery document when acl.oidc.groups.encoded.in.token and acl.oidc.issuer.validation.enabled are true
```

See [Token validation](/docs/security/oidc/#token-validation).

### acl.oidc.issuer.validation.enabled

- **Default**: `true`
- **Reloadable**: no

Whether QuestDB checks the `iss` claim of a token when
`acl.oidc.groups.encoded.in.token` is `true`, in QuestDB Enterprise 4.1.0 and
later. With `false`, QuestDB neither requires nor compares the `iss` claim,
even when [`acl.oidc.issuer`](#acloidcissuer) is set, and logs an advisory at
startup. It still checks the signature, the audience, the expiry, and the
`sub` claim of a token.

Disable it only for a provider whose tokens carry no `iss` claim. Without the
check, QuestDB accepts the token of any issuer or tenant that the provider
signs with a key that QuestDB trusts, for the expected audience.

Accepts `true` or `false`, in any letter case. Any other value, an empty one
included, stops QuestDB from starting, even when OIDC is disabled:
`invalid configuration value [key=acl.oidc.issuer.validation.enabled, value=...]`.

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

### acl.oidc.pkce.enabled

- **Default**: `true`
- **Reloadable**: no

Enables or disables PKCE for the Authorization Code Flow. This should always
be enabled in production. The Web Console is not fully secure without it.

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

QuestDB reads the principal and the group memberships of an external user
from the user information: the response of the User Info endpoint, or, when
`acl.oidc.groups.encoded.in.token` is `true`, the payload of the token. For
how QuestDB picks the claims, see
[User and group claims](/docs/security/oidc/#user-and-group-claims) in the
OIDC guide.

### acl.oidc.cache.ttl

- **Default**: `30000`
- **Reloadable**: no

How long QuestDB caches the result of checking a token, in milliseconds: the
User Info response, or, when `acl.oidc.groups.encoded.in.token` is `true`, the
result of validating the token. QuestDB checks the token again once its cache
entry expires, so in User Info mode, this setting also controls how soon a
change in the Identity Provider, such as a disabled user, takes effect. `0`
disables the cache.

In QuestDB Enterprise 4.1.0 and later, the same interval applies to HTTP
sessions, even with OIDC disabled. A session reuses the check of a password
that QuestDB verifies itself, the password of a database user or of the
built-in admin, until this interval has passed since the session last checked
it. A session never reuses the check of a REST token or an OIDC credential.
See [HTTP sessions](/docs/security/rbac/#http-sessions).

### acl.oidc.groups.claim

- **Default**: none
- **Reloadable**: no

The claim in the user information that contains the group memberships of the
user, as an array of group names or as a single name. Required when OIDC is
enabled.

In QuestDB Enterprise 4.1.0 and later, accepts a comma-separated list of claim
names in priority order, such as `roles,groups`. QuestDB takes the groups from
the first claim on the list that holds at least one group name, and does not
combine the groups of several claims. QuestDB refuses to start when the list
is empty, names a claim twice, or names a claim that
[`acl.oidc.sub.claim`](#acloidcsubclaim) also lists. See
[User and group claims](/docs/security/oidc/#user-and-group-claims).

### acl.oidc.groups.encoded.in.token

- **Default**: `false`
- **Reloadable**: no

When `true`, QuestDB reads the principal and the group memberships from a
JWT, such as the ID token, instead of calling the User Info endpoint, and
validates the token itself. Set to `true` if the OIDC Provider encodes group
memberships directly into the token, as Microsoft Entra ID does. In QuestDB
Enterprise 4.1.0 and later, the validation includes the issuer of the token.
See [Token validation](/docs/security/oidc/#token-validation).

### acl.oidc.sub.claim

- **Default**: `sub`
- **Reloadable**: no

The claim in the user information that contains the principal of the user,
such as a username, an email address, or an object ID. `current_user()`
returns the principal, the Web Console displays it, and QuestDB logs it for
audit purposes. Pick a claim whose value the Identity Provider never gives to
anyone else: users who share a principal share their permissions. Avoid
display names, such as the `name` claim.

In QuestDB Enterprise 4.1.0 and later, accepts a comma-separated list of claim
names in priority order, such as `preferred_username,oid`. QuestDB takes the
principal from the first claim on the list that holds a non-empty value.
QuestDB refuses to start when the list is empty, names a claim twice, or names
a claim that [`acl.oidc.groups.claim`](#acloidcgroupsclaim) also lists. An
empty value does not fall back to the default `sub`. See
[User and group claims](/docs/security/oidc/#user-and-group-claims).
