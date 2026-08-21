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

QuestDB downloads the document at startup and takes every endpoint from it,
so the settings under [Endpoints](#endpoints) and `acl.oidc.port` are not
used. The server does not start if the document cannot be downloaded or
parsed, or if it is missing the authorization, token, user info or JWKS
endpoint.

Mutually exclusive with `acl.oidc.host`: setting both fails server startup.

### acl.oidc.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables OIDC authentication. When enabled, `acl.oidc.client.id`
and `acl.oidc.groups.claim` must also be set, along with either
`acl.oidc.host` or `acl.oidc.configuration.url`.

OIDC cannot be enabled together with
[`acl.basic.auth.realm.enabled`](/docs/configuration/iam/#aclbasicauthrealmenabled).
Setting both to `true` fails server startup.

### acl.oidc.host

- **Default**: none
- **Reloadable**: no

OIDC provider hostname. Required when OIDC is enabled, unless
`acl.oidc.configuration.url` is set. The two are mutually exclusive: setting
both fails server startup.

### acl.oidc.http.timeout

- **Default**: `30000`
- **Reloadable**: no

OIDC provider HTTP request timeout in milliseconds. Accepts a plain integer
only.

### acl.oidc.port

- **Default**: `443`
- **Reloadable**: no

OIDC provider port number. Not used when `acl.oidc.configuration.url` is
set, because the port is taken from the discovered endpoint URLs.

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

Enables or disables PKCE for the Authorization Code Flow. This should always
be enabled in production. The Web Console is not fully secure without it.

### acl.oidc.ropc.flow.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables the Resource Owner Password Credentials flow. When
enabled, this flow must also be configured in the OIDC Provider.

### acl.oidc.state.required

- **Default**: `false`
- **Reloadable**: no

Requires the `state` parameter in the Authorization Code Flow, which protects
against CSRF attacks. QuestDB does not see the value itself. It publishes the
setting to clients through the
[settings endpoint](/docs/security/oidc/#settings-endpoint), the same way it
publishes `acl.oidc.pkce.required`, and the client is what generates and checks
the value.

Enable it if the OIDC Provider requires the `state` parameter, or to add CSRF
protection on top of PKCE. The
[Web Console](/docs/security/oidc/#1-secret-generation) generates the value,
sends it in the authorization request, and checks that the provider returns it
unchanged.

## Endpoints

These settings apply only when the OIDC Provider is configured by host. When
`acl.oidc.configuration.url` is set, QuestDB takes every endpoint from the
provider's configuration document and the settings below are not used.

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

The keys are only read when
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) is `true`.
With the default user info flow QuestDB validates tokens by calling the user
info endpoint instead.

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

This setting must match the scheme of every OIDC Provider URL QuestDB uses,
including `acl.oidc.configuration.url` and each endpoint discovered from it.
A URL whose scheme does not match fails server startup.

### acl.oidc.tls.keystore.password

- **Default**: none
- **Reloadable**: no

Keystore password. Must be set whenever `acl.oidc.tls.keystore.path` is set.
Setting either one without the other fails server startup.

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

### acl.oidc.groups.claim

- **Default**: none
- **Reloadable**: no

The name of the custom claim in the user information that contains the
group memberships of the user. Required when OIDC is enabled.

### acl.oidc.groups.encoded.in.token

- **Default**: `false`
- **Reloadable**: no

When `true`, QuestDB looks for group memberships in the ID token instead of
calling the User Info endpoint. Set to `true` if the OIDC Provider encodes
group memberships directly into the token.

### acl.oidc.sub.claim

- **Default**: `sub`
- **Reloadable**: no

The name of the claim in the user information that contains the user's name.
Could be a username, full name, or email. Displayed in the Web Console and
logged for audit purposes.

## Caching and buffers

### acl.oidc.cache.ttl

- **Default**: `30000`
- **Reloadable**: no

User info cache entry TTL in milliseconds, as a plain integer only. QuestDB
caches user info responses for each valid access token. This setting controls
how often the access token is validated and user info refreshed.

Set it to `0` to disable the cache, so that every request is validated against
the OIDC Provider.

### acl.oidc.public.keys.expiry

- **Default**: `120000`
- **Reloadable**: no

Expiry of the cached JSON Web Key Set (JWKS) in milliseconds. Also accepts a
duration, such as `2m` or `120s`.

QuestDB caches the public keys used to validate tokens issued by the OIDC
Provider, and reloads them from the public keys endpoint when the cache expires.

Key rotation does not depend on this setting: a token signed with a key QuestDB
has not cached triggers an immediate reload. The expiry governs how long a key
the provider has already withdrawn stays usable, so lower it if signing keys are
revoked, at the cost of more requests to the endpoint.

Only used when
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) is `true`,
which is the only case in which QuestDB validates token signatures itself.

### acl.oidc.response.buffer.size

- **Default**: `1M`
- **Reloadable**: no

Size of the buffer used to receive HTTP responses from the OIDC Provider.
Increase it if the provider sends large responses, such as user info
containing a long list of group memberships.

### acl.oidc.string.pool.capacity

- **Default**: `128`
- **Reloadable**: no

Initial capacity of the string pool used when parsing JSON responses received
from the OIDC Provider.
