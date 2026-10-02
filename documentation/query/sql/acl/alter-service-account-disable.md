---
title: ALTER SERVICE ACCOUNT DISABLE reference
sidebar_label: DISABLE
description:
  "ALTER SERVICE ACCOUNT DISABLE turns off a service account without deleting
  it. Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... DISABLE` turns off a service account without deleting
it.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName DISABLE;
```

## Description

A disabled service account keeps its permissions and tokens; it simply cannot
authenticate, and cannot be assumed, until it is enabled again.

To remove one permanently instead, use
[`DROP SERVICE ACCOUNT`](/docs/query/sql/acl/drop-service-account/).

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app DISABLE;
```

Verify with
[`SHOW SERVICE ACCOUNTS`](/docs/query/sql/show/#show-service-accounts), which
reports `false` in its `enabled` column.

## See also

- [ALTER SERVICE ACCOUNT ENABLE](/docs/query/sql/acl/alter-service-account-enable/)
- [DROP SERVICE ACCOUNT](/docs/query/sql/acl/drop-service-account/)
