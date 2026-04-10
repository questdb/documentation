---
title: UNLOAD PLUGIN
sidebar_label: UNLOAD PLUGIN
description: UNLOAD PLUGIN SQL keyword reference documentation.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Plugins are developed against the open-source <code>questdb</code> library
  and run only on QuestDB Enterprise.
</EnterpriseNote>

Unloads a plugin, removing its SQL functions and closing its class loader.
Requires `PLUGIN ADMIN` permission.

## Syntax

```questdb-sql
UNLOAD PLUGIN [IF LOADED] plugin_name;
```

- `plugin_name` — the JAR filename, with or without the `.jar` extension. May
  be quoted or unquoted.
- `IF LOADED` — optional clause that makes the command idempotent: no error is
  raised if the plugin is not loaded.

## Description

`UNLOAD PLUGIN` performs the following steps:

1. Checks that no currently-loaded plugin depends on this plugin. If one does,
   the command fails with an error naming the blocking dependent.
2. Invokes `PluginLifecycle.onUnload()` if the plugin declared a lifecycle
   implementation.
3. Removes all SQL functions contributed by the plugin from the function cache.
4. Closes the plugin's `URLClassLoader`.

After a successful unload, the compiled query cache is flushed. Queries that
reference any of the plugin's functions will fail on re-execution until the
plugin is loaded again.

## Examples

```questdb-sql title="Unload a plugin"
UNLOAD PLUGIN 'questdb-plugin-example-1.0.0';
```

```questdb-sql title="Idempotent unload"
UNLOAD PLUGIN IF LOADED 'questdb-plugin-example-1.0.0';
```

```questdb-sql title="Unload with dependency ordering"
-- Unload the dependent plugin first
UNLOAD PLUGIN 'questdb-plugin-jsonl-1.0.0';
-- Then unload the base plugin
UNLOAD PLUGIN 'questdb-plugin-example-1.0.0';
```

## Error conditions

| Error | Cause |
| ----- | ----- |
| `Plugin not loaded` | The plugin is not currently loaded and `IF LOADED` was not specified. |
| `Cannot unload plugin X: plugin Y depends on it` | Plugin `Y` is loaded and depends on `X`. Unload `Y` first. |

## See also

- [Plugin system guide](/docs/operations/plugins/)
- [LOAD PLUGIN](/docs/query/sql/load-plugin/)
- [RELOAD PLUGIN](/docs/query/sql/reload-plugin/)
- [SCAN PLUGINS](/docs/query/sql/scan-plugins/)
- [SHOW PLUGINS](/docs/query/sql/show/#show-plugins)
