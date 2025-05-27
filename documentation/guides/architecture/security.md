---
title: Security
slug: security
description: QuestDB provides real-time metrics, a health check endpoint, and logging to monitor performance and simplify troubleshooting.
---


## Security

- **Built-in admin and read-only users:**
  QuestDB includes built-in admin and read-only users for the pgwire protocol and HTTP endpoints using HTTP Basic Auth.

- **HTTP basic authentication:**
  You can enable HTTP Basic Authentication for the HTTP API, web console, and pgwire
  protocol. Health-check and metrics endpoints can be configured independently.

- **Token-based authentication:**
  QuestDB Enterprise offers HTTP and JWT token authentication. QuestDB Open Source
  supports token authentication for ILP over TCP.

- **TLS on all protocols:**
  QuestDB Enterprise supports TLS on all protocols and endpoints.

- **Single sign-on:**
  QuestDB Enterprise supports SSO via OIDC with Active Directory, EntraID, or OAuth2.

- **Role-based access control:**
  Enterprise users can create user groups and assign service accounts and users.
   Grants [can be configured](/docs/operations/rbac/) individually or at the
   group level with fine granularity, including column-level  access.

## Next Steps

- Back to the [QuestDB Architecture](/docs/guides/architecture/questdb-architecture) overview
- [QuestDB GitHub Repository](https://github.com/questdb/questdb)
- [QuestDB Documentation](/docs)
