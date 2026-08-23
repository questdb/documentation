---
title: OpenID Connect (OIDC)
description: "QuestDB Enterprise acl.oidc.* settings reference: minimum configuration and startup rules, endpoints, TLS, user and group claims, caching and buffers."
---

:::note

OpenID Connect is [Enterprise](/enterprise/) only.

:::

OpenID Connect (OIDC) support is part of QuestDB's Identity and Access
Management. The database can be integrated with any OAuth2/OIDC Identity
Provider (IdP).

For detailed information about OIDC, see the
[OpenID Connect (OIDC) integration guide](/docs/security/oidc).

## Minimum configuration

OIDC requires [`acl.enabled`](/docs/configuration/iam/#aclenabled) to be `true`,
which is the default. With access control disabled no OIDC authentication takes
place, but the OIDC settings are still validated at startup: with
`acl.oidc.enabled=true` the server enforces every rule below and downloads the
provider's configuration document, so an inconsistent OIDC configuration still
prevents it from starting. Set `acl.oidc.enabled=false` to take the settings out
of play entirely.

A working setup against a Ping Identity provider needs four settings. Every
other setting has a usable default:

```shell
acl.oidc.enabled=true
acl.oidc.host=oidc.provider
acl.oidc.client.id=questdb
acl.oidc.groups.claim=groups
```

QuestDB refuses to start when the OIDC configuration is inconsistent. With
`acl.oidc.enabled=true`:

- [`acl.oidc.client.id`](#acloidcclientid) and
  [`acl.oidc.groups.claim`](#acloidcgroupsclaim) must be set.
- Exactly one of [`acl.oidc.host`](#acloidchost) and
  [`acl.oidc.configuration.url`](#acloidcconfigurationurl) must be set.
- [`acl.basic.auth.realm.enabled`](/docs/configuration/iam/#aclbasicauthrealmenabled)
  must be `false`.
- [`acl.oidc.tls.keystore.path`](#acloidctlskeystorepath) and
  [`acl.oidc.tls.keystore.password`](#acloidctlskeystorepassword) must both be
  set, or neither.
- [`acl.oidc.tls.enabled`](#acloidctlsenabled) must match the scheme of every
  OIDC Provider URL.
- When [`acl.oidc.configuration.url`](#acloidcconfigurationurl) is set, the
  document must be downloadable and parseable, and must name the authorization,
  token, user info and JWKS endpoints.

## General

### acl.oidc.audience

- **Default**: none (defaults to the client ID)
- **Reloadable**: no

OAuth2 audience as set on the tokens issued by the OIDC Provider. Defaults
to the client ID if not set.

Only used when
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) is `true`,
which is the only case in which QuestDB validates tokens itself. In the default
user info flow the OIDC Provider decides whether the token is valid, and
QuestDB does not check the audience at all.

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
`acl.oidc.host` or `acl.oidc.configuration.url`. See
[Minimum configuration](#minimum-configuration) for the full set of startup
requirements.

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
scope `openid` is mandatory and must always be included. That is an OIDC
protocol requirement enforced by the provider, not a QuestDB startup check:
QuestDB passes the value on without inspecting it, so leaving `openid` out
fails at the provider rather than at startup.

QuestDB uses the scopes in the requests it makes itself, in the
[ROPC flow](#acloidcropcflowenabled), and publishes them on the
[settings endpoint](/docs/security/oidc/#settings-endpoint) for clients which
run the flow themselves.

## Authentication flows

QuestDB publishes [`acl.oidc.pkce.required`](#acloidcpkcerequired) and
[`acl.oidc.state.required`](#acloidcstaterequired) to clients through the
[settings endpoint](/docs/security/oidc/#settings-endpoint), and enforces
neither. The client generates the code verifier and the `state` value; the
provider checks the verifier, and the client checks the `state` value it gets
back.

### acl.oidc.pg.token.as.password.enabled

- **Default**: `false`
- **Reloadable**: no

When enabled, the PGWire endpoint supports OIDC authentication. The OAuth2
token should be sent in the password field, while the username field should
contain the string `_sso`, or left empty if that is an option.

### acl.oidc.pkce.required

- **Default**: `true`
- **Reloadable**: no

Tells clients that PKCE is required for the Authorization Code Flow. This
should always be enabled in production. The Web Console is not fully secure
without it.

### acl.oidc.ropc.flow.enabled

- **Default**: `false`
- **Reloadable**: no

Enables or disables the Resource Owner Password Credentials flow. When
enabled, this flow must also be configured in the OIDC Provider.

With it enabled QuestDB runs the flow itself: a username and password arriving
over HTTP basic authentication or PGWire that match no local user are sent on to
the OIDC Provider's token endpoint as a password grant, and the user is logged
in if the provider issues a token. This lets clients which cannot follow a
browser redirect, such as `psql`, authenticate with their SSO credentials.

Local users are matched first, so a QuestDB user whose name also exists in the
Identity Provider is authenticated against its local password, without involving
the provider.

Unlike [`acl.oidc.pkce.required`](#acloidcpkcerequired) and
[`acl.oidc.state.required`](#acloidcstaterequired), this setting is not
published on the
[settings endpoint](/docs/security/oidc/#settings-endpoint), so a client cannot
discover whether the flow is available.

### acl.oidc.state.required

- **Default**: `false`
- **Reloadable**: no

Tells clients that the `state` parameter is required in the Authorization Code
Flow, which protects against CSRF attacks. Enable it if the OIDC Provider
requires the `state` parameter, or to add CSRF protection on top of PKCE.

The [Web Console](/docs/getting-started/web-console/overview/) generates the
value, sends it in the authorization request, and checks that the provider
returns it unchanged. See
[Secret generation](/docs/security/oidc/#1-secret-generation).

## Endpoints

These settings apply only when the OIDC Provider is configured by host. When
`acl.oidc.configuration.url` is set, QuestDB takes every endpoint from the
provider's configuration document and the settings below are not used.

### acl.oidc.authorization.endpoint

- **Default**: `/as/authorization.oauth2`
- **Reloadable**: no

OIDC Authorization Endpoint. The default value should work for the Ping
Identity Platform.

### acl.oidc.device.authorization.endpoint

- **Default**: none
- **Reloadable**: no

OIDC Device Authorization Endpoint. Unlike the other endpoint settings this one
has no default, and QuestDB never calls it. QuestDB resolves the endpoint and
publishes it on the
[settings endpoint](/docs/security/oidc/#settings-endpoint), for clients which
implement the Device Authorization Flow themselves.

Left unset, and absent from the provider's configuration document, the endpoint
stays unresolved and the key is omitted from the settings response.

### acl.oidc.public.keys.endpoint

- **Default**: `/pf/JWKS`
- **Reloadable**: no

JSON Web Key Set (JWKS) Endpoint. Provides the list of public keys used to
decode and validate ID tokens issued by the OIDC Provider. The default value
should work for the Ping Identity Platform.

The keys are only used to validate tokens when
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) is `true`.
With the default user info flow QuestDB validates tokens by calling the user
info endpoint instead.

QuestDB downloads the keys from this endpoint at startup either way, so that the
cache is never empty. A failure to download them is logged, and does not stop
the server.

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
When OIDC is enabled, setting either one without the other fails server
startup.

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

If the claim is missing from the user information, or it is an empty list,
authentication fails. See
[Mapping user permissions](/docs/security/oidc/#mapping-user-permissions).

### acl.oidc.groups.encoded.in.token

- **Default**: `false`
- **Reloadable**: no

When `true`, QuestDB looks for group memberships in the ID token instead of
calling the User Info endpoint. Set to `true` if the OIDC Provider encodes
group memberships directly into the token.

This also changes which token the client has to send: the ID token when the
setting is `true`, the access token when it is `false`. QuestDB publishes the
setting on the
[settings endpoint](/docs/security/oidc/#settings-endpoint) so that clients can
[pick the right one](/docs/security/oidc/#which-token-to-send).

It changes how tokens are validated too. In the default user info flow QuestDB
hands the token to the OIDC Provider on every cache miss, so the provider
decides whether it is still valid. With this setting enabled QuestDB validates
the token itself and never asks the provider about it:

| Checked | Not checked |
| --- | --- |
| the signature, against the public key named by the token's `kid` | `exp`, the expiry |
| `aud`, against [`acl.oidc.audience`](#acloidcaudience) | `nbf`, the not-before time |
| that `sub` and the group memberships are present | `iss`, the issuer |

:::caution

An expired token is therefore still accepted. Once issued, a token stays valid
for as long as the key that signed it is in QuestDB's cache, which is governed
by [`acl.oidc.public.keys.expiry`](#acloidcpublickeysexpiry) and by how long the
provider publishes the key. Neither
[`acl.oidc.cache.ttl`](#acloidccachettl) nor a shorter token lifetime in the
provider shortens it.

Do not enable this setting where you rely on being able to revoke a token, or on
the provider's token lifetimes being enforced.

:::

### acl.oidc.sub.claim

- **Default**: `sub`
- **Reloadable**: no

The name of the claim in the user information that contains the user's name.
Could be a username, full name, or email. Displayed in the Web Console and
logged for audit purposes.

If the claim is missing from the user information, or empty, authentication
fails. The same applies to the claim named by
[`acl.oidc.groups.claim`](#acloidcgroupsclaim). See
[Mapping user permissions](/docs/security/oidc/#mapping-user-permissions).

## Caching and buffers

### acl.oidc.cache.ttl

- **Default**: `30000`
- **Reloadable**: no

User info cache entry TTL in milliseconds, as a plain integer only. QuestDB
caches user info responses for each valid access token. This setting controls
how often the access token is validated and user info refreshed.

Set it to `0` to disable the cache, so that every request is checked again. In
the default user info flow that means a call to the OIDC Provider on every
request. When
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) is `true`
QuestDB checks the token locally instead, and contacts the provider only when
the public keys have to be reloaded.

That local check does not test the token's expiry, so shortening this TTL does
not shorten how long an issued token is accepted. See
[`acl.oidc.groups.encoded.in.token`](#acloidcgroupsencodedintoken) for what is
and is not validated.

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

Size of the buffer used to receive and parse HTTP responses from the OIDC
Provider. Accepts a plain byte count, or a value with a `K` or `M` suffix, such
as `512K`. There is no `G` suffix.

When a request to the OIDC Provider fails, authentication fails with it and the
reason is logged by the server.

### acl.oidc.string.pool.capacity

- **Default**: `128`
- **Reloadable**: no

Initial capacity of the string pool used when parsing JSON responses received
from the OIDC Provider.
