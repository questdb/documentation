---
title: CREATE GROUP reference
sidebar_label: CREATE GROUP
description:
  "CREATE GROUP creates an RBAC group, optionally mapped to an external OIDC or
  LDAP group with WITH EXTERNAL ALIAS. Applies to QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`CREATE GROUP` - create a new group

For full documentation of the Access Control List and Role-based Access Control,
see the [RBAC operations](/docs/security/rbac) page.

---

## Syntax

```questdb-sql
CREATE GROUP [IF NOT EXISTS] groupName;
```

```questdb-sql title="Create a group mapped to an external group"
CREATE GROUP groupName WITH EXTERNAL ALIAS externalAlias;
```

## Description

`CREATE GROUP` adds a new user group with no permissions.

`CREATE GROUP groupName WITH EXTERNAL ALIAS externalAlias` also maps an external
OIDC or LDAP group to the new group in one statement, so members of the external
group inherit its permissions on login. The group and the mapping are created
atomically. `WITH EXTERNAL ALIAS` cannot be combined with `IF NOT EXISTS`. To
map or unmap an existing group, use
[`ALTER GROUP`](/docs/query/sql/acl/alter-group/). For the external group
mapping flow, see the
[OpenID Connect (OIDC) integration](/docs/security/oidc/#mapping-user-permissions)
guide.

The chosen name must be unique across all users (including the built-in admin),
groups and service accounts. If the name has already been reserved, the command
fails and an error is raised, unless the `IF NOT EXISTS` clause is included in
the statement.

Contrary to users and service accounts, it is not possible to log in as group. A
group only serves as a container for permissions which are shared between users.

## Examples

```questdb-sql
CREATE GROUP admins;

CREATE GROUP IF NOT EXISTS admins;

CREATE GROUP analysts WITH EXTERNAL ALIAS 'CN=Analysts,OU=Users,DC=example,DC=com';
```

It can be verified with:

```questdb-sql
SHOW GROUPS;
```

that yields:

| name     | external_alias                          | memory_limit |
| -------- | --------------------------------------- | ------------ |
| admins   |                                         | null         |
| analysts | CN=Analysts,OU=Users,DC=example,DC=com  | null         |
