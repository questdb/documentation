---
title: SCAN PLUGINS
sidebar_label: SCAN PLUGINS
description: SCAN PLUGINS SQL keyword reference documentation.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Plugins are developed against the open-source <code>questdb</code> library
  and run only on QuestDB Enterprise.
</EnterpriseNote>

Rescans the plugin directory and refreshes the list of available plugins.
Requires `PLUGIN ADMIN` permission.

## Syntax

```questdb-sql
SCAN PLUGINS;
```

## Description

`SCAN PLUGINS` walks the directory configured by `cairo.plugin.root` and
registers any new `.jar` files it finds. It also removes stale entries for
plugins that are no longer in the directory and are not currently loaded.

The scan runs automatically at server startup. Run it manually after copying a
new plugin JAR into the plugin directory while the server is running. After
scanning, use [`LOAD PLUGIN`](/docs/query/sql/load-plugin/) to activate the
newly discovered plugin.

Already-loaded plugins are not affected by a rescan.

## Example

```questdb-sql title="Discover and load a newly copied plugin"
SCAN PLUGINS;
SHOW PLUGINS;
LOAD PLUGIN 'my-plugin-1.0.0';
```

## See also

- [Plugin system guide](/docs/operations/plugins/)
- [LOAD PLUGIN](/docs/query/sql/load-plugin/)
- [SHOW PLUGINS](/docs/query/sql/show/#show-plugins)
