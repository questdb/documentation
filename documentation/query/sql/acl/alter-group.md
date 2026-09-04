---
title: ALTER GROUP reference
sidebar_label: ALTER GROUP
description:
  "ALTER GROUP adds or removes external Identity Provider aliases from a
  QuestDB group for OIDC authorization in QuestDB Enterprise."
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  RBAC provides fine-grained database permissions management.
</EnterpriseNote>

`ALTER GROUP` adds or removes an external Identity Provider mapping on an
existing QuestDB group.

For an end-to-end OIDC example, see
[Mapping groups and permissions](/docs/security/oidc/group-mapping/).

---

## Syntax

```questdb-sql title="Add an external alias"
ALTER GROUP groupName WITH EXTERNAL ALIAS externalAlias;
```

```questdb-sql title="Remove an external alias"
ALTER GROUP groupName DROP EXTERNAL ALIAS externalAlias;
```

## Description

`WITH EXTERNAL ALIAS` maps the group name or identifier in an OIDC groups claim
to `groupName`. An external user receives the QuestDB group's permissions when
their claim contains that exact alias.

`DROP EXTERNAL ALIAS` removes the named mapping. It does not drop the QuestDB
group or change permissions granted to it.

## Examples

Map an Entra ID group identifier to the QuestDB group `analysts`:

```questdb-sql
ALTER GROUP analysts
WITH EXTERNAL ALIAS '87654321-1234-1234-1234-123456789abc';
```

Remove that mapping without dropping `analysts`:

```questdb-sql
ALTER GROUP analysts
DROP EXTERNAL ALIAS '87654321-1234-1234-1234-123456789abc';
```
