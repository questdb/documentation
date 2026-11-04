---
title: ALTER GROUP DROP EXTERNAL ALIAS reference
sidebar_label: DROP EXTERNAL ALIAS
description:
  "ALTER GROUP DROP EXTERNAL ALIAS removes an external OIDC or LDAP group
  mapping. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER GROUP ... DROP EXTERNAL ALIAS` removes an external OIDC or LDAP group
mapping.

---

## Syntax

```questdb-sql
ALTER GROUP groupName DROP EXTERNAL ALIAS externalAlias;
```

## Description

Removing an alias requires the `REMOVE EXTERNAL ALIAS` permission. Quote the
alias when it contains commas, spaces, or `=`, as LDAP distinguished names do.

Members of the external group stop inheriting this group's permissions on their
next login. The QuestDB group itself, and any user explicitly added to it, are
unaffected.

## Examples

```questdb-sql
ALTER GROUP analysts DROP EXTERNAL ALIAS 'CN=Analysts,OU=Users,DC=example,DC=com';
```

[`SHOW GROUPS`](/docs/query/sql/show/#show-groups) then reports an empty
`external_alias` column for the group.

## See also

- [ALTER GROUP WITH EXTERNAL ALIAS](/docs/query/sql/acl/alter-group-with-external-alias/)
- [DROP GROUP](/docs/query/sql/acl/drop-group/)
- [OpenID Connect (OIDC) integration](/docs/security/oidc/#mapping-user-permissions)
