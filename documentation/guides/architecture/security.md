---
title: Security
slug: security
description: QuestDB implements enterprise-grade security with TLS, single-sign-on, and role-based access control with fine-grained granularity.
---


## Security

 QuestDB implements enterprise-grade security with TLS, single-sign-on, and role-based access control with
  fine-grained granularity.

- **Built-in admin and read-only users:**
  QuestDB OSS includes built-in admin and read-only users for the PGWire protocol and HTTP endpoints using HTTP Basic Auth.

- **HTTP basic authentication:**
  You can enable HTTP Basic Authentication for the HTTP API, web console, and PGWire
  protocol. Health-check and metrics endpoints can be configured independently.

- **Token-based authentication:**
  QuestDB Enterprise offers [HTTP and JWT token authentication](/docs/operations/rbac/#user-management). QuestDB Open Source supports [token authentication](/docs/reference/api/ilp/overview/#tcp-token-authentication-setup) for ILP over TCP.

- **TLS on all protocols:**
  QuestDB Enterprise supports [TLS on all protocols](/docs/operations/tls/) and endpoints.

- **Single sign-on:**
  QuestDB Enterprise supports SSO via [OIDC](/docs/operations/openid-connect-oidc-integration/) with Active Directory, EntraID, or OAuth2.

- **Role-based access control:**
  Enterprise users can create user groups and assign service accounts and users.
   Grants [can be configured](/docs/operations/rbac/) individually or at the
   group level with fine granularity, including column-level  access.

- **Auditing:**
  QuestDB allows [query tracing](/docs/concept/query-tracing), to monitor the executed
  queries, how long they took, and —for Enterprise users— which user executed the query.


## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
