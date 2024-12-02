---
title: Microsoft EntraID OIDC guide
description: ""
---

import Screenshot from "@theme/Screenshot"

This document helps to set up SSO authentication for the Web Console in
[Microsoft EntraID](https://www.microsoft.com/en-gb/security/business/identity-access/microsoft-entra-id), formerly known as Azure AD.

For a general introduction to OpenID Connect and QuestDB, see the
[OIDC Operations page](/docs/operations/openid-connect-oidc-integration/).

## Set up the client application in Entra ID

First thing first, let's pick a name for the client!

Then head to _Microsoft Entra Admin Center_, and register the application
under _Identity - App registrations - New registration_.

<Screenshot
  alt="EntraID image, app registration."
  src="images/guides/active-directory-entraid/1_app_registration.webp"
  title="App registration"
  width={750}
/>

QuestDB [Web Console](/docs/web-console/) is a SPA (Single Page App).

As a result, it cannot store safely a client secret.

Instead, it can use PKCE (Proof Key for Code Exchange) to secure the flow.

When registering the application, select the SPA platform.

We also have to specify the URL of the [Web Console](/docs/web-console/) as Redirect URI.

<Screenshot
  alt="EntraID image, SPA and redirection URI"
  src="images/guides/active-directory-entraid/2_spa_redirect_uri.webp"
  title="Add SPA platform with the redirection URI"
  width={600}
/>

After clicking _Register_, we have created a client application with the
name _QuestDB_.

Each application is assigned a unique id (known as Client ID in the
OAuth2 - OIDC standard). The client will identify itself with this id
when sending requests to Entra ID.

<Screenshot
alt="EntraID image, application ID"
src="images/guides/active-directory-entraid/3_application_id.webp"
title="Application ID"
width={600}
/>

We find the platform configurations under _Authentication_. This is the place where
the previously set redirect URI can be viewed and modified. We can also specify
additional redirect URIs, if necessary.

The redirect URIs of the application are automatically eligible for the
_Authorization Code Flow with PKCE_, which is a special version of the OAuth2 standard's
Authorization Code Flow. It is specifically designed for applications where a client
secret (e.g. a password) could not be kept safely. As single page applications run in
the browser, they fall into this category.

The redirect URIs are also added to the _CORS_ (Cross-Origin Resource Sharing) policy
of EntraID. CORS is a mechanism to allow a web page, such as the Web Console, to access
resources from a different domain than the one that served the page. In this context
this means that we let the Web Console to access Entra ID, while it is origin is the
HTTP endpoint of QuestDB.

<Screenshot
alt="EntraID image, PKCE and CORS"
src="images/guides/active-directory-entraid/4_cors_pkce.webp"
title="PKCE and CORS"
width={600}
/>

If we scroll down to the bottom of this page, we can also find a section where we
can enable the _Resource Owner Password Credential Flow_.

This OAuth2 flow is legacy, and should be enabled only if there is a requirement
of connecting to QuestDB using SSO (Single Sign-On) via clients not supporting
redirect based web flows.
This could mean a Postgres client without OAuth2 integration, such as _psql_, or
a standalone in-house client application, or could be just a jupyter notebook.

The main issue with this flow is that the client application has to be trusted
with the user's login details. The user's credentials are passed to the
application, in this case to QuestDB, and the client application uses these
credentials to authenticate the user by forwarding them to the identity provider,
in this case to Entra ID.

It is guaranteed that QuestDB does not store the user's credentials in any way.
They are not persisted into the database, not even in encrypted form.
The login details are treated as passthrough information. Only exception is
that server logs can contain the username, logged for audit purposes.

<Screenshot
alt="EntraID image, enable ROPC"
src="images/guides/active-directory-entraid/5_ropc.webp"
title="Enable ROPC"
width={600}
/>

Our next stop is the _Token configuration_, where the OAuth2/OIDC access and ID
tokens can be customized.

Users could be authenticated without customized tokens, but authorization
would prove to be challenging, as the user's security groups are not included
in the tokens by default.

QuestDB can be configured to request the user's groups from the UserInfo
endpoint of the OAuth2 server, but Entra ID cannot be configured to provide
this information via the UserInfo endpoint.
Therefore, we choose to customize the tokens, QuestDB will decode and
validate the ID token, and take the group information from there.

QuestDB authorization relies on receiving the group memberships of the user.
Entra ID groups should be mapped to QuestDB groups, and permissions can be
granted to the QuestDB groups. Detailed information about group mappings can
be found in the [OIDC integration](/docs/operations/openid-connect-oidc-integration/#user-permissions)
documentation.

<Screenshot
alt="EntraID image, token customization"
src="images/guides/active-directory-entraid/6_token_customization.webp"
title="Token customization"
width={600}
/>

The customized tokens contain user information which cannot be accessed
without permission. User information is provided by Microsoft Graph, so
the client application needs specific permissions to access
Microsoft Graph APIs.

These permissions can be configured under _API permissions_. It is important
to note that we will be setting _Delegated_ permissions here, meaning we
are not granting actual permissions to access user data. Instead, each user
logging into QuestDB will have to consent to accessing their user profile.

<Screenshot
alt="EntraID image, API permissions"
src="images/guides/active-directory-entraid/7_API_permissions.webp"
title="API permissions"
width={600}
/>

By default, the _User.Read_ permission is added to list, but what we
really need is:
 - openid: to be able to issue ID tokens
 - profile: to access user information
 - offline_access: to be able to issue refresh tokens

By clicking on _Microsoft Graph_ we can select and add these permissions.

<Screenshot
alt="EntraID image, add openid permissions"
src="images/guides/active-directory-entraid/8_add_openid_permissions.webp"
title="Add openid permissions"
width={600}
/>

The _User.Read_ permission is not needed. It can be removed by clicking
on the `...` at the end of the row, and selecting _Remove permission_ from
the popup menu.

<Screenshot
alt="EntraID image, permissions final"
src="images/guides/active-directory-entraid/9_permissions_final.webp"
title="Permissions final list"
width={600}
/>

With this we have finished setting up the QuestDB client application
in Entra ID, and now we can wire QuestDB and Entra ID together by
adding OIDC configuration to QuestDB.

## QuestDB configuration

The below should be set in QuestDB's `server.conf`:

```shell
# enable OIDC
acl.oidc.enabled=true

# the claim contains the username or user id
acl.oidc.sub.claim=name

# the claim contains the user's group memberships
acl.oidc.groups.claim=groups

# groups are encoded in the token
acl.oidc.groups.encoded.in.token=true

# OIDC configuration endpoint of Entra ID
acl.oidc.configuration.url=https://login.microsoftonline.com/12345678-1234-1234-1234-123456789abc/v2.0/.well-known/openid-configuration

# application ID taken from Entra ID
acl.oidc.client.id=8de84b90-1ea5-4e41-9e84-dba860aa01a6

# redirect URI, QuestDB's HTTP endpoint
acl.oidc.redirect.uri=http://localhost:9000

# OAuth scopes the user has to consent to
acl.oidc.scope=openid profile offline_access

# enable ROPC flow
# optional, required only if ROPC is enabled in Entra ID
acl.oidc.ropc.flow.enabled=true
```

The application ID and the OIDC configuration endpoint's URL can be found
in the Overview of the application in Entra ID.

The application ID is displayed right under the application's name, the
OIDC configuration endpoint is displayed on the panel which opens up when
the _Endpoints_ button is clicked.

<Screenshot
alt="EntraID image, overview"
src="images/guides/active-directory-entraid/10_overview.webp"
title="Application overview"
width={600}
/>

## Map groups and grant permissions

Now we can start QuestDB, and login with the built-in admin to create
group mappings.

As mentioned earlier, authorization works by mapping Entra ID groups
to QuestDB groups. When the user logs in, QuestDB decodes Entra ID
group memberships from the token, then finds the QuestDB groups
mapped to them, and the user gets the permissions based on the
mapped groups.

```questdb-sql title="Create a group which is mapped to an Entra ID group"
CREATE GROUP extUsers WITH EXTERNAL ALIAS '87654321-1234-1234-1234-123456789abc';
```
The above command maps the Entra ID group identified by object
id `87654321-1234-1234-1234-123456789abc` to a QuestDB group called `extUsers`.

We should grant the necessary QuestDB endpoint permissions first
to make sure users can access the Web Console, Postgres and ILP
interfaces as required. More about endpoint
permissions [here](/docs/operations/rbac/#endpoint-permissions).

```questdb-sql title="Grant endpoint permissions"
GRANT HTTP, PGWIRE TO groupName;
```

Now we can grant the rest of the permissions as required. We can
grant access to tables, for example.

```questdb-sql title="Grant database permissions"
GRANT SELECT ON table1, table2 to groupName;
```

## Confirm group mappings and login

To test, head to the Web Console and login.

If all has been wired up well, then login will succeed, and the user
will have the access granted to them.

<br />
