---
title: ALTER USER ENABLE reference
sidebar_label: ENABLE
description:
  "ALTER USER ENABLE turns a disabled user account back on. Applies to RBAC in
  QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... ENABLE` turns a disabled user account back on.

---

## Syntax

```questdb-sql
ALTER USER userName ENABLE;
```

## Description

The user can authenticate again, with the permissions, group memberships and
tokens it had before it was disabled. Nothing is restored or re-granted, because
nothing was removed.

A user is enabled when created, so this is only needed after
[`DISABLE`](/docs/query/sql/acl/alter-user-disable/).

## Examples

```questdb-sql
ALTER USER john ENABLE;
```

Verify with [`SHOW USERS`](/docs/query/sql/show/#show-users), which reports
`true` in its `enabled` column.

## See also

- [ALTER USER DISABLE](/docs/query/sql/acl/alter-user-disable/)
- [CREATE USER](/docs/query/sql/acl/create-user/)
