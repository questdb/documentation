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

### acl.oidc.cache.ttl

- **Default**: `30000`
- **Reloadable**: no

User info cache entry TTL in milliseconds. QuestDB caches user info responses
for each valid access token. This setting controls how often the access token
is validated and user info refreshed.

### acl.oidc.groups.claim

- **Default**: `groups`
- **Reloadable**: no

The name of the custom claim in the user information that contains the
group memberships of the user.

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
