---
title: Active Directory (PingFederate) guide
description: ""
---

import Screenshot from "@theme/Screenshot"

This document helps set up SSO authentication for the Web Console in
[PingFederate](https://www.pingidentity.com/en/platform/capabilities/authentication-authority/pingfederate.html).

It is assumed that the Azure Active Directory serves as the Identity Provider
(IdP).

For a general introduction to OpenID Connect and QuestDB, see the
[OIDC Operations page](/docs/operations/openid-connect-oidc-integration/).

## Set up PingFederate client

First thing first, let's pick a name for the client!

<Screenshot
  alt="PingFederate image, naming the client."
  src="images/guides/active-directory/1.webp"
  title="Picking a name"
  width={750}
/>

The QuestDB [Web Console](/docs/web-console/) is a SPA (Single Page App).

As a result, it cannot store safely a client secret.

Instead it can use PKCE (Proof Key for Code Exchange) to secure the flow.

As shown above, leave the client authentication disabled.

We also have to white list the URL of the [Web Console](/docs/web-console/) as a redirection URL:

<Screenshot
  alt="PingFederate image, redirection URL"
  src="images/guides/active-directory/2.webp"
  title="Whitelist the redirection URL"
  width={600}
/>

We can instruct PingFederate to automatically authorize the scopes requested by
the [Web Console](/docs/web-console/).

The user will not be presented the extra window asking for consent after
authentication:

<Screenshot
  alt="PingFederate, bypass approval"
  src="images/guides/active-directory/3.webp"
  title="Bypass, please"
  width={500}
/>

The [Web Console](/docs/web-console/) uses the
[Authorization Code Flow](/docs/operations/openid-connect-oidc-integration/#authentication-and-authorization-flow),
and refreshes tokens automatically.

Next, enable the grant types required for this flow:

<Screenshot
  alt="PingFederate, granting types"
  src="images/guides/active-directory/4.webp"
  title="Granted"
  width={600}
/>

We've selected:

- Authorization Code
- Refresh Token
- Access Token Validation (Client is a Resource Server)

After that, select the token manager for the client.

The token manager is responsible for issuing access tokens.

All token related settings should be configured in the token manager.

<Screenshot
  alt=""
  src="images/guides/active-directory/5.webp"
  title="PKCE enabled"
  width={500}
/>

Finally, enable PKCE - as shown above - and save the settings.

## Access Token Manager settings

QuestDB does not require any special setup regarding the access token.

We recommend that you do not to use shorter tokens than the default 28
characters.

As the QuestDB [Web Console](/docs/web-console/) refreshes the token automatically, there is no need
for long-lived tokens:

<Screenshot
  alt="PingFederate, access token management UI"
  src="images/guides/active-directory/6.webp"
  title="Click to zoom"
  jumbo={true}
/>

We've selected:

- Token length: 28
- Token lifetime: 5
- Lifetime extension policy: None
- Maximum token lifetime: Null
- Lifetime extension threshold percentage: 30

For the next step, we tune the Authorization Server.

## Authorization Server settings

These settings relate to the authorization code, refresh token and CORS.

<Screenshot
  alt="PingFederate, auth server image"
  src="images/guides/active-directory/7.webp"
  title="Authorization server"
  width={750}
/>

In this section, we've entered:

- Authorization code timeout: 60
- Authorization code entropy: 30
- Client secret retention period: 0

Next, ensure the `ROLL REFRESH TOKEN VALUES` option is selected:

<Screenshot
  alt="PingFederate, auth server settings ui"
  src="images/guides/active-directory/8.webp"
  title="Click to zoom"
  jumbo={true}
/>

It is also important to whitelist the [Web Console](/docs/web-console/)'s URL on the CORS list:

<Screenshot
  alt="PingFederate, authorization server ui"
  src="images/guides/active-directory/9.webp"
  title="Port 9000, or your custom port"
  width={500}
/>

## Set up a Microsoft Entra ID Data Source

PingFederate needs a Data Source setup.

This is a secure LDAP connection to Microsoft Entra ID, formerly known as Azure
Active Directory.

The data source needs a:

- name
- hostname
- port
- username and password for the LDAP connection

<Screenshot
  alt="PingFederate, data and credential storage"
  src="images/guides/active-directory/10.webp"
  title="Configuring our data source"
  width={750}
/>

We have given it the name EntraDS and it will be applied later.

## Set up a Password Credential Validator

Now that PingFederate has an LDAP connection, we can use it for authentication.

First, create a Password Credential Validator:

<Screenshot
  alt="PingFederate, create a PCV view "
  src="images/guides/active-directory/11.webp"
  title="Create the PCV"
  width={750}
/>

We've entered:

- Instance name: EntraPCV
- Instance ID: EntraPCV
- Selected: LDAP Username Password Credential Validator
- Parent instance: None

Furthermore, we now declare our previously created data source (`EntraDS`):

<Screenshot
  alt="PingFederate, additional PCV details"
  src="images/guides/active-directory/12.webp"
  title="Click to zoom"
  jumbo={true}
/>

This links our data store (`EntraDS`) to our PCV (`EntraPCV`).

## Set up an Identity Provider

We can use our PCV once we set up an Identity Provider.

The IdP will be used to authenticate users against Active Directory using the
LDAP connection.

We do this in the Type subsection:

<Screenshot
  alt="PingFederate, IdP adapters"
  src="images/guides/active-directory/13.webp"
  title="Defining an adapter"
  width={750}
/>
Next, in the IdP Adapter section...

Click: Add a new row to Credential Validators.

Select the PCV (`EntraPCV`) we created.

Optionally alter number of retries:

<Screenshot
  alt="PingFederate, selecting PCV "
  src="images/guides/active-directory/14.webp"
  title="Select the PCV"
  jumbo={true}
/>

## Add groups to OIDC policy management

QuestDB now needs to know about the user's AD group memberships to find their
permissions.

Groups are passed to QuestDB inside the User Info object in a custom claim.

This has to be added in the OpenID Connect Policy Management.

The field is Multi-Valued, because it is a list of group names.

Under the Attribute Contract subsection, see:

<Screenshot
  alt="PingFederate, Attribute Contract subsection"
  src="images/guides/active-directory/15.webp"
  title="Click to zoom"
  jumbo={true}
/>

Next, click to the Attribute Scopes subsection.

Ensure `groups` is among the `openid` attributes:

<Screenshot
  alt="PingFederate, Attribute Scopes"
  src="images/guides/active-directory/16.webp"
  title="Click to zoom"
  jumbo={true}
/>

Onwards to the Attribute Sources & User Lookup Section.

From this view, you can add local data stores.

Note item `test` of type of LDAP:

<Screenshot
  alt="PingFederate, Attribute Sources & User Lookup ui"
  src="images/guides/active-directory/17.webp"
  title="Click to zoom"
  jumbo={true}
/>

We created it via the following choices in Add Attribute Source:

<Screenshot
  alt="PingFederate, Add Attribute Source ui"
  src="images/guides/active-directory/18.webp"
  title="Click to zoom"
  jumbo={true}
/>

Note where we specified the Data Store (`EntraDS`).

This is also where the directory search parameters are defined.

Back at the Attribute Sources & User Lookup Section section, note we have set
`email`.

The source is `LDAP (test)`, while the value is `usePrincipalName`:

<Screenshot
  alt="PingFederate, Policy Management ui"
  src="images/guides/active-directory/19.webp"
  title="Click to zoom"
  jumbo={true}
/>

And finally!

In the same Attribute Sources & User Lookup Section...

Find `groups`.

Note the definition of Source (`LDAP (test)`) that bridges our various parts.

The value is `memberOf`.

<Screenshot
  alt="PingFederate, associating groups with the source"
  src="images/guides/active-directory/20.webp"
  title="Click to zoom"
  jumbo={true}
/>

## Enable Resource Owner Password Credentials (ROPC) flow

As described in the
[OIDC operations document](/docs/operations/openid-connect-oidc-integration/#enable-ropc)
tools - such as `psql` - can be integrated with the OIDC provider using the ROPC flow.

When setting this flow up, enable the Resource Owner Password Credentials flow in the
client settings.

Next, create a Resource Owner Credentials Grant Mapping to map values obtained from
the Password Credential Validator (PCV) into the persistent grants.

When setting this up, select the previously created LDAP Data Source and IdP Adapter, which links
to the existing PCV.

Then select the `username` attribute of the PCV as `USER_KEY`.

## Confirm QuestDB mappings and login

QuestDB requires a mapping, as laid out in the
[OIDC operations document](/docs/operations/openid-connect-oidc-integration/#mapping-user-permissions).

If a given user has the HTTP permission, they will be able to now login via the
[Web Console](/docs/web-console/).

To test, head to [http://localhost:9000](http://localhost:9000) and login.

If all has been wired up well, then login will succeed.

<br />
