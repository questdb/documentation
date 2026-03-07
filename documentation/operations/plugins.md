---
title: Plugin system
sidebar_label: Plugins
description:
  How to install, manage, and write custom plugins that extend QuestDB Enterprise
  with BYOF (Bring Your Own Function) SQL functions and lifecycle hooks.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"
import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Plugins run on QuestDB Enterprise, but are developed and compiled against the
  open-source <code>questdb</code> library — no enterprise dependencies are
  required to build a plugin.
</EnterpriseNote>

QuestDB Enterprise supports a plugin system for extending the database with
custom behaviour, packaged as standard JAR files. Plugins are isolated from the
main classpath using their own class loaders, preventing version conflicts.

The two primary uses are:

- **BYOF (Bring Your Own Function)** — add custom scalar, aggregate, and string
  functions directly into QuestDB's SQL engine, callable from any query.
- **Lifecycle integrations** — use `onLoad`/`onUnload` hooks and full
  `CairoEngine` access to build arbitrarily rich integrations: background
  services, external data ingestion endpoints, schema initialisation, and more.

## Overview

A plugin is a JAR file placed in the configured plugin directory. Each plugin
can provide either or both of:

- **BYOF — custom SQL functions** — scalar, string, and aggregate (GROUP BY)
  functions registered into QuestDB's Griffin SQL engine, callable from any
  query using qualified names (`plugin_name.function_name`).
- **Lifecycle hooks** — `onLoad` and `onUnload` callbacks backed by full
  `CairoEngine` access. Plugins can create tables, execute SQL, start background
  threads, open network listeners, connect to external systems, and anything else
  the engine API allows.

Plugins are managed at runtime using SQL commands — no server restart is
required to load or unload a plugin.

## Setup

### Configure the plugin directory

Set the `cairo.plugin.root` configuration key to the directory where plugin
JARs are stored:

```ini title="server.conf"
cairo.plugin.root=/var/lib/questdb/plugins
```

Or via environment variable:

```shell
QDB_CAIRO_PLUGIN_ROOT=/var/lib/questdb/plugins
```

QuestDB scans this directory at startup and again whenever `SCAN PLUGINS` is
executed. Only files with a `.jar` extension are recognized.

### Install a plugin

Copy the plugin JAR into the plugin directory:

```shell
cp my-plugin-1.0.0.jar /var/lib/questdb/plugins/
```

Then tell the running server to pick it up:

```questdb-sql
SCAN PLUGINS;
LOAD PLUGIN 'my-plugin-1.0.0';
```

The plugin name is the JAR filename without the `.jar` extension. Passing the
full filename (including `.jar`) is also accepted — it is stripped automatically.

Plugin names may only contain letters (`a–z`, `A–Z`), digits (`0–9`), hyphens
(`-`), underscores (`_`), and dots (`.`). Path-traversal sequences (`..`) are
rejected. Names are limited to 64 characters.

## SQL commands

### SCAN PLUGINS

Rescans the plugin directory and updates the list of available plugins. Use
this after copying new JARs into the plugin directory without restarting the
server.

```questdb-sql
SCAN PLUGINS;
```

Requires `DATABASE ADMIN` permission.

### SHOW PLUGINS

Lists all discovered plugins and their metadata.

```questdb-sql
SHOW PLUGINS;
```

| name                           | loaded | version | description                                          | author  | functions |
| ------------------------------ | ------ | ------- | ---------------------------------------------------- | ------- | --------- |
| questdb-plugin-example-1.0.0   | true   | 1.0.0   | Example plugin demonstrating custom functions for QuestDB | QuestDB | 3    |
| questdb-plugin-jsonl-1.0.0     | false  | 1.0.0   | HTTP endpoint for JSON-lines data ingestion          | QuestDB | 0         |

`SHOW PLUGINS` can be used as a subquery for filtering:

```questdb-sql
SELECT * FROM (SHOW PLUGINS) WHERE loaded = true;
```

No special permission required.

### LOAD PLUGIN

Loads a plugin, making its SQL functions available immediately.

```questdb-sql
LOAD PLUGIN 'my-plugin-1.0.0';
```

The optional `IF NOT LOADED` clause makes the command idempotent — it succeeds
silently if the plugin is already loaded:

```questdb-sql
LOAD PLUGIN IF NOT LOADED 'my-plugin-1.0.0';
```

Requires `DATABASE ADMIN` permission.

If the plugin declares a `PluginLifecycle` implementation, its `onLoad` callback
is invoked after the SQL functions are registered. If `onLoad` throws, the load
is rolled back and the plugin is left in an unloaded state. On success, the
compiled query cache is flushed so subsequent queries can reference the new
functions immediately.

### UNLOAD PLUGIN

Unloads a plugin and removes its SQL functions. Queries using plugin functions
will fail after unloading.

```questdb-sql
UNLOAD PLUGIN 'my-plugin-1.0.0';
```

The optional `IF LOADED` clause makes the command idempotent:

```questdb-sql
UNLOAD PLUGIN IF LOADED 'my-plugin-1.0.0';
```

Requires `DATABASE ADMIN` permission.

A plugin cannot be unloaded if another currently-loaded plugin depends on it.
Unload the dependent plugin first. On success, the compiled query cache is
flushed — any cached plans that used the plugin's functions will be
re-evaluated on next execution and will fail until the plugin is loaded again.

### RELOAD PLUGIN

Unloads and then reloads a plugin in one operation. Useful for picking up an
updated JAR without two separate commands.

```questdb-sql
RELOAD PLUGIN 'my-plugin-1.0.0';
```

Requires `DATABASE ADMIN` permission.

If the reload fails during the load phase, the plugin is left unloaded and the
error message indicates the original failure cause.

## Calling plugin functions

Plugin functions are namespaced under the plugin name using dot notation:
`plugin_name.function_name(args)`. Quote the plugin name when it contains
hyphens or dots:

```questdb-sql
SELECT "questdb-plugin-example-1.0.0".example_square(price) FROM trades;
```

To discover what functions a loaded plugin provides, query `functions()`:

```questdb-sql
SELECT name, signature FROM functions()
WHERE name LIKE 'questdb-plugin-example-1.0.0.%';
```

| name                                              | signature                   |
| ------------------------------------------------- | --------------------------- |
| questdb-plugin-example-1.0.0.example_reverse      | example_reverse(S)          |
| questdb-plugin-example-1.0.0.example_square       | example_square(D)           |
| questdb-plugin-example-1.0.0.example_weighted_avg | example_weighted_avg(DD)    |

## Plugin configuration

Plugins receive configuration through `PluginContext.getProperty()`. Values are
resolved in this order:

1. **Environment variable** — `QDB_PLUGIN_<PLUGIN_NAME>_<KEY>` (uppercased,
   with `-` and `.` replaced by `_`)
2. **Configuration file** — `<plugin_root>/<plugin-name>.conf` (Java properties
   format)
3. **Default value** — the fallback provided by the plugin

For example, for a plugin named `questdb-plugin-jsonl-1.0.0` and a property key
`port`:

| Source       | Name                                     |
| ------------ | ---------------------------------------- |
| Env var      | `QDB_PLUGIN_QUESTDB_PLUGIN_JSONL_1_0_0_PORT` |
| Config file  | `/var/lib/questdb/plugins/questdb-plugin-jsonl-1.0.0.conf` containing `port=9100` |

```ini title="questdb-plugin-jsonl-1.0.0.conf"
bind.address=0.0.0.0
port=9100
```

## Auto-loading plugins

Set `Plugin-Auto-Load: true` in the JAR manifest to have QuestDB load the
plugin automatically at startup (after the initial `SCAN PLUGINS` run). This
removes the need for a manual `LOAD PLUGIN` command.

```
Manifest-Version: 1.0
Plugin-Auto-Load: true
```

## Plugin dependencies

Plugins can declare dependencies on other plugins using the
`Plugin-Dependencies` manifest attribute. Dependencies must be loaded before the
dependent plugin and cannot be unloaded while a dependent plugin is loaded.

```
Plugin-Dependencies: questdb-plugin-core-1.0.0, questdb-plugin-util-2.0.0
```

On server shutdown, plugins are unloaded in reverse dependency order
(dependents first, then their dependencies).

## Permissions

| Operation      | Required permission |
| -------------- | ------------------- |
| `SCAN PLUGINS` | `DATABASE ADMIN`      |
| `LOAD PLUGIN`  | `DATABASE ADMIN`      |
| `UNLOAD PLUGIN`| `DATABASE ADMIN`      |
| `RELOAD PLUGIN`| `DATABASE ADMIN`      |
| `SHOW PLUGINS` | None                   |

## Writing a plugin

This section covers how to build a plugin JAR from scratch.

### Project setup

Plugins are compiled against the open-source `questdb` library, published to
Maven Central under `org.questdb:questdb`. No enterprise-specific dependencies
are needed. At runtime, the enterprise server supplies these classes, so the
dependency must be declared as `provided` scope and must **not** be bundled into
the plugin JAR.

Plugin JARs must target **Java 11** or higher.

A minimal Maven `pom.xml`:

```xml title="pom.xml"
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>my-plugin</artifactId>
  <version>1.0.0</version>

  <properties>
    <maven.compiler.source>11</maven.compiler.source>
    <maven.compiler.target>11</maven.compiler.target>
    <questdb.version>9.3.4</questdb.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.questdb</groupId>
      <artifactId>questdb</artifactId>
      <version>${questdb.version}</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-jar-plugin</artifactId>
        <version>3.3.0</version>
        <configuration>
          <archive>
            <manifest>
              <addDefaultImplementationEntries>true</addDefaultImplementationEntries>
            </manifest>
            <manifestEntries>
              <Plugin-Description>My custom plugin</Plugin-Description>
              <Plugin-Author>My Team</Plugin-Author>
              <Plugin-License>Apache-2.0</Plugin-License>
              <Plugin-Auto-Load>false</Plugin-Auto-Load>
            </manifestEntries>
          </archive>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

Build the JAR with:

```shell
mvn package
```

Then copy `target/my-plugin-1.0.0.jar` to the plugin directory.

### JAR manifest attributes

| Attribute               | Required | Description |
| ----------------------- | -------- | ----------- |
| `Implementation-Version`| No       | Plugin version shown in `SHOW PLUGINS` |
| `Plugin-Description`    | No       | Human-readable description |
| `Plugin-Author`         | No       | Author name |
| `Plugin-Url`            | No       | Plugin homepage URL |
| `Plugin-License`        | No       | License identifier (e.g. `Apache-2.0`) |
| `Plugin-Auto-Load`      | No       | Set to `true` to load automatically at startup |
| `Plugin-Dependencies`   | No       | Comma-separated list of plugin names that must be loaded first |
| `Plugin-Add-Modules`    | No       | Comma-separated JDK module names to make available to this plugin (e.g. `jdk.httpserver`) |

### BYOF: Custom SQL functions

Implement `io.questdb.griffin.FunctionFactory` to add functions directly into
the Griffin SQL engine. QuestDB discovers implementations automatically by
scanning every `.class` file in the JAR — no service file registration is
needed. Functions are namespaced under the plugin name and available immediately
after `LOAD PLUGIN`.

#### Scalar functions

Override `getSignature()` and `newInstance()`. The signature format is
`function_name(arg_types)` where argument types are single-character codes:
`D` = DOUBLE, `S` = STRING, `I` = INT, `L` = LONG, etc.

<Tabs>
<TabItem value="factory" label="FunctionFactory">

```java
package io.questdb.plugin.example;

import io.questdb.cairo.CairoConfiguration;
import io.questdb.cairo.sql.Function;
import io.questdb.cairo.sql.Record;
import io.questdb.griffin.FunctionFactory;
import io.questdb.griffin.SqlExecutionContext;
import io.questdb.griffin.engine.functions.DoubleFunction;
import io.questdb.griffin.engine.functions.UnaryFunction;
import io.questdb.std.IntList;
import io.questdb.std.ObjList;

public class SquareFunctionFactory implements FunctionFactory {

    @Override
    public String getSignature() {
        return "my_square(D)";  // one DOUBLE argument
    }

    @Override
    public Function newInstance(
            int position,
            ObjList<Function> args,
            IntList argPositions,
            CairoConfiguration configuration,
            SqlExecutionContext sqlExecutionContext
    ) {
        return new SquareFunction(args.getQuick(0));
    }

    static class SquareFunction extends DoubleFunction implements UnaryFunction {
        private final Function arg;

        SquareFunction(Function arg) { this.arg = arg; }

        @Override public Function getArg() { return arg; }
        @Override public String getName() { return "my_square"; }

        @Override
        public double getDouble(Record rec) {
            double v = arg.getDouble(rec);
            return Double.isNaN(v) ? Double.NaN : v * v;
        }
    }
}
```

</TabItem>
<TabItem value="usage" label="SQL usage">

```questdb-sql
SELECT "my-plugin-1.0.0".my_square(price) FROM trades;
```

</TabItem>
</Tabs>

#### Aggregate (GROUP BY) functions

Override `isGroupBy()` to return `true` and implement `GroupByFunction`.

```java
public class WeightedAvgFactory implements FunctionFactory {

    @Override
    public String getSignature() {
        return "my_wavg(DD)";  // value DOUBLE, weight DOUBLE
    }

    @Override
    public boolean isGroupBy() { return true; }

    @Override
    public Function newInstance(int position, ObjList<Function> args,
            IntList argPositions, CairoConfiguration cfg,
            SqlExecutionContext ctx) {
        return new WeightedAvgFunction(args.getQuick(0), args.getQuick(1));
    }
}
```

The `GroupByFunction` interface requires you to implement `computeFirst`,
`computeNext`, `merge` (for parallel query support), and the return-type getter
(e.g. `getDouble` for a double-valued aggregate). Use `initValueTypes` to claim
slots in the group-by map and `initValueIndex` to record their positions.

### Lifecycle hooks

Implement `io.questdb.plugin.PluginLifecycle` to receive `onLoad` and `onUnload`
callbacks. Register the implementation via the Java `ServiceLoader` mechanism by
creating a service file:

```
META-INF/services/io.questdb.plugin.PluginLifecycle
```

containing the fully qualified class name of your implementation:

```
io.questdb.plugin.example.MyPluginLifecycle
```

```java
package io.questdb.plugin.example;

import io.questdb.plugin.PluginContext;
import io.questdb.plugin.PluginLifecycle;

public class MyPluginLifecycle implements PluginLifecycle {

    @Override
    public void onLoad(PluginContext context) throws Exception {
        String port = context.getProperty("port", "9100");

        // Execute SQL — create tables, views, etc.
        context.executeSql(
            "CREATE TABLE IF NOT EXISTS my_plugin_log (" +
            "  ts TIMESTAMP, event SYMBOL" +
            ") TIMESTAMP(ts) PARTITION BY DAY WAL"
        );

        // Access the engine directly
        // context.getEngine() returns a CairoEngine
    }

    @Override
    public void onUnload() throws Exception {
        // Release resources: stop servers, close connections, etc.
    }
}
```

`PluginContext` methods:

| Method | Description |
| ------ | ----------- |
| `getPluginName()` | Returns the canonical plugin name |
| `getEngine()` | Returns the `CairoEngine` for direct database access |
| `executeSql(CharSequence)` | Convenience method to run a SQL statement |
| `getProperty(String key, String defaultValue)` | Reads plugin configuration (env var → .conf file → default) |

### Using non-default JDK modules

If your plugin requires JDK modules that are not part of the default QuestDB
module set (for example `jdk.httpserver`), declare them in the manifest:

```
Plugin-Add-Modules: jdk.httpserver
```

QuestDB resolves the named modules into a child `ModuleLayer` and uses its class
loader as the parent for the plugin's `URLClassLoader`. Modules already present
in the boot layer are ignored.

## Example: JSONL HTTP ingestion plugin

The following example demonstrates a lifecycle-only plugin that starts an HTTP
server accepting JSON-lines data and writes rows to a QuestDB table.

**Manifest:**
```
Plugin-Description: HTTP endpoint for JSON-lines data ingestion
Plugin-Author: QuestDB
Plugin-License: Apache-2.0
Plugin-Add-Modules: jdk.httpserver
Plugin-Dependencies: questdb-plugin-example-1.0.0
```

**Lifecycle:**
```java
public class JsonlPluginLifecycle implements PluginLifecycle {

    private volatile HttpServer server;

    @Override
    public void onLoad(PluginContext context) throws Exception {
        context.executeSql(
            "CREATE TABLE IF NOT EXISTS jsonl_ingestion_log (" +
            "  ts TIMESTAMP, table_name SYMBOL, rows_inserted INT, status SYMBOL" +
            ") TIMESTAMP(ts) PARTITION BY DAY WAL"
        );

        String bindAddress = context.getProperty("bind.address", "127.0.0.1");
        int port = Integer.parseInt(context.getProperty("port", "0"));

        server = HttpServer.create(new InetSocketAddress(bindAddress, port), 0);
        server.createContext("/jsonl", this::handleJsonl);
        server.start();
    }

    @Override
    public void onUnload() throws Exception {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }
}
```

The plugin starts its own HTTP server on a configurable port — this is
completely separate from QuestDB's built-in HTTP server. The default `port=0`
binds to a random ephemeral port. Set a fixed port for production use:

```ini title="questdb-plugin-jsonl-1.0.0.conf"
bind.address=0.0.0.0
port=9100
```

Send data to the plugin's endpoint (not the QuestDB HTTP port):

```shell
curl -X POST "http://localhost:9100/jsonl?table=sensors" \
  -d '{"name": "temp", "value": 23.5}
{"name": "humidity", "value": 67.2}'
```

## Troubleshooting

### Plugin not found after SCAN PLUGINS

- Verify `cairo.plugin.root` points to the correct directory.
- Confirm the file has a `.jar` extension.
- Duplicate JAR names (same name, different path) are rejected — check the
  server log for `Duplicate plugin name` entries.

### Load fails with "requires plugin X to be loaded first"

Load the dependency first:

```questdb-sql
LOAD PLUGIN 'plugin-x-1.0.0';
LOAD PLUGIN 'my-plugin-1.0.0';
```

### Cannot unload — another plugin depends on it

Unload the dependent plugin before its dependency:

```questdb-sql
UNLOAD PLUGIN 'dependent-plugin';
UNLOAD PLUGIN 'base-plugin';
```

### ClassNotFoundException at load time

The plugin JAR is loading classes not present in the QuestDB classpath. Shade
(bundle) these dependencies into your JAR or declare the required JDK module
via `Plugin-Add-Modules`.

## See also

- [LOAD PLUGIN](/docs/query/sql/load-plugin/)
- [UNLOAD PLUGIN](/docs/query/sql/unload-plugin/)
- [RELOAD PLUGIN](/docs/query/sql/reload-plugin/)
- [SCAN PLUGINS](/docs/query/sql/scan-plugins/)
- [SHOW PLUGINS](/docs/query/sql/show/#show-plugins)
- [Configuration reference](/docs/configuration/overview/#cairo-engine)
