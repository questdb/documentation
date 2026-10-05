---
title: ALTER SERVICE ACCOUNT ENABLE reference
sidebar_label: ENABLE
description:
  "ALTER SERVICE ACCOUNT ENABLE turns a disabled service account back on.
  Applies to RBAC in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER SERVICE ACCOUNT ... ENABLE` turns a disabled service account back on.

---

## Syntax

```questdb-sql
ALTER SERVICE ACCOUNT serviceAccountName ENABLE;
```

## Description

The service account can authenticate and be assumed again, with the permissions
and tokens it had before it was disabled.

A service account is enabled when created, so this is only needed after
[`DISABLE`](/docs/query/sql/acl/alter-service-account-disable/).

## Examples

```questdb-sql
ALTER SERVICE ACCOUNT client_app ENABLE;
```

Verify with
[`SHOW SERVICE ACCOUNTS`](/docs/query/sql/show/#show-service-accounts), which
reports `true` in its `enabled` column.

## See also

- [ALTER SERVICE ACCOUNT DISABLE](/docs/query/sql/acl/alter-service-account-disable/)
- [CREATE SERVICE ACCOUNT](/docs/query/sql/acl/create-service-account/)
