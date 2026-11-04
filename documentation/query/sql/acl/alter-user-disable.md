---
title: ALTER USER DISABLE reference
sidebar_label: DISABLE
description:
  "ALTER USER DISABLE turns off a user account without deleting it. Applies to
  RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER USER ... DISABLE` turns off a user account without deleting it.

---

## Syntax

```questdb-sql
ALTER USER userName DISABLE;
```

## Description

A disabled user keeps its permissions, group memberships and tokens; it simply
cannot authenticate until it is enabled again. Existing sessions are not the
subject of this statement, so disable is not a way to evict a connected user.

To remove a user permanently instead, use
[`DROP USER`](/docs/query/sql/acl/drop-user/).

## Examples

```questdb-sql
ALTER USER john DISABLE;
```

Verify with [`SHOW USERS`](/docs/query/sql/show/#show-users), which reports
`false` in its `enabled` column.

## See also

- [ALTER USER ENABLE](/docs/query/sql/acl/alter-user-enable/)
- [DROP USER](/docs/query/sql/acl/drop-user/)
