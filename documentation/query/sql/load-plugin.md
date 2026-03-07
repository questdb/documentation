---
title: LOAD PLUGIN
sidebar_label: LOAD PLUGIN
description: LOAD PLUGIN SQL keyword reference documentation.
---

Loads a plugin JAR from the plugin directory, making its SQL functions available
immediately. Requires `SYSTEM_ADMIN` permission.

:::note

**Deployment is enterprise-only.** Plugins are developed against the
open-source `questdb` library and run only on QuestDB Enterprise.

:::

## Syntax

```questdb-sql
LOAD PLUGIN [IF NOT LOADED] plugin_name;
```

- `plugin_name` — the JAR filename, with or without the `.jar` extension. May
  be quoted or unquoted.
- `IF NOT LOADED` — optional clause that makes the command idempotent: no error
  is raised if the plugin is already loaded.

## Description

`LOAD PLUGIN` performs the following steps:

1. Looks up `plugin_name` in the set of discovered plugins (populated by
   [`SCAN PLUGINS`](/docs/query/sql/scan-plugins/) or at startup).
2. Checks that all declared plugin dependencies are already loaded.
3. Creates an isolated `URLClassLoader` for the plugin JAR.
4. Scans the JAR for `FunctionFactory` implementations and registers them under
   the plugin namespace.
5. Invokes the `PluginLifecycle.onLoad()` callback if the plugin declares one.
6. If any step fails, the load is fully rolled back and the plugin remains
   unloaded.

After a successful load, the compiled query cache is flushed and plugin
functions are immediately available using qualified names:
`plugin_name.function_name(args)`. Quote the plugin name in SQL when it
contains hyphens or dots (e.g. `"my-plugin-1.0.0".my_func()`).

## Examples

```questdb-sql title="Load a plugin"
LOAD PLUGIN 'questdb-plugin-example-1.0.0';
```

```questdb-sql title="Idempotent load"
LOAD PLUGIN IF NOT LOADED 'questdb-plugin-example-1.0.0';
```

## Error conditions

| Error | Cause |
| ----- | ----- |
| `Plugin not found` | The plugin name was not discovered by `SCAN PLUGINS`. Run `SCAN PLUGINS` first. |
| `Plugin already loaded` | The plugin is already loaded and `IF NOT LOADED` was not specified. |
| `Plugin X requires plugin Y to be loaded first` | A declared dependency is not loaded. Load the dependency first. |

## See also

- [Plugin system guide](/docs/operations/plugins/)
- [UNLOAD PLUGIN](/docs/query/sql/unload-plugin/)
- [RELOAD PLUGIN](/docs/query/sql/reload-plugin/)
- [SCAN PLUGINS](/docs/query/sql/scan-plugins/)
- [SHOW PLUGINS](/docs/query/sql/show/#show-plugins)
