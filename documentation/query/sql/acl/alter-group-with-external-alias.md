---
title: ALTER GROUP WITH EXTERNAL ALIAS reference
sidebar_label: WITH EXTERNAL ALIAS
description:
  "ALTER GROUP WITH EXTERNAL ALIAS maps an external OIDC or LDAP group to a
  QuestDB group. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER GROUP ... WITH EXTERNAL ALIAS` maps an external OIDC or LDAP group to a
QuestDB group, so members of the external group inherit its permissions on
login.

---

## Syntax

```questdb-sql
ALTER GROUP groupName WITH EXTERNAL ALIAS externalAlias;
```

## Description

Adding an alias requires the `ADD EXTERNAL ALIAS` permission. Quote the alias
when it contains commas, spaces, or `=`, as LDAP distinguished names do.

For the external group mapping flow, see the
[OpenID Connect (OIDC) integration](/docs/security/oidc/#mapping-user-permissions)
guide. To create a group and its alias in one statement, use
[`CREATE GROUP ... WITH EXTERNAL ALIAS`](/docs/query/sql/acl/create-group/).

:::note

This is identity mapping: it decides which QuestDB group an external identity
lands in. It is unrelated to
[`SET RESOURCE GROUP`](/docs/query/sql/acl/alter-group-set-resource-group/),
which decides how much of the instance that group's queries may consume.

:::

## Examples

```questdb-sql
ALTER GROUP analysts WITH EXTERNAL ALIAS 'CN=Analysts,OU=Users,DC=example,DC=com';
```

The alias can be verified with
[`SHOW GROUPS`](/docs/query/sql/show/#show-groups), which reports it in the
`external_alias` column.

## See also

- [ALTER GROUP DROP EXTERNAL ALIAS](/docs/query/sql/acl/alter-group-drop-external-alias/)
- [CREATE GROUP](/docs/query/sql/acl/create-group/)
- [OpenID Connect (OIDC) integration](/docs/security/oidc/#mapping-user-permissions)
