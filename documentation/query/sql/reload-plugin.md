---
title: RELOAD PLUGIN
sidebar_label: RELOAD PLUGIN
description: RELOAD PLUGIN SQL keyword reference documentation.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Plugins are developed against the open-source <code>questdb</code> library
  and run only on QuestDB Enterprise.
</EnterpriseNote>

Unloads and immediately reloads a plugin in a single operation. Requires
`DATABASE ADMIN` permission.

## Syntax

```questdb-sql
RELOAD PLUGIN plugin_name;
```

- `plugin_name` — the JAR filename, with or without the `.jar` extension. May
  be quoted or unquoted.

## Description

`RELOAD PLUGIN` is equivalent to [`UNLOAD PLUGIN`](/docs/query/sql/unload-plugin/)
followed by [`LOAD PLUGIN`](/docs/query/sql/load-plugin/), but expressed as a
single command. The same dependency and `DATABASE ADMIN` permission checks apply.
The compiled query cache is flushed twice — once after unload, once after load.

If the reload fails during the load phase (for example because a dependency is
missing or the `onLoad` callback throws), the plugin is left in an unloaded
state. The error message indicates the original cause.

Use `RELOAD PLUGIN` to pick up an updated JAR without needing two commands. The
JAR file on disk is re-read on every load, so replacing the file and running
`RELOAD PLUGIN` is sufficient to apply an update.

## Example

```questdb-sql title="Reload a plugin after updating its JAR"
RELOAD PLUGIN 'my-plugin-1.0.0';
```

## See also

- [Plugin system guide](/docs/operations/plugins/)
- [LOAD PLUGIN](/docs/query/sql/load-plugin/)
- [UNLOAD PLUGIN](/docs/query/sql/unload-plugin/)
- [SCAN PLUGINS](/docs/query/sql/scan-plugins/)
- [SHOW PLUGINS](/docs/query/sql/show/#show-plugins)
