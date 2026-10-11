---
title: VisuaLeaf
description: Guide for querying QuestDB using VisuaLeaf
---

import Screenshot from "@theme/Screenshot"

[VisuaLeaf](https://visualeaf.com/database/questdb/) is a cross-platform desktop
database client for Windows, macOS, and Linux. It lets you browse tables, run SQL
scripts, view results in a grid, and build charts from query results.

VisuaLeaf has a dedicated QuestDB connection type that connects over the
[PostgreSQL wire protocol](/docs/connect/compatibility/pgwire/overview/) and fills
in QuestDB's default port, database, and user. It offers a free Community Edition
as well as paid editions.

## Prerequisites

- A running QuestDB instance (See [Getting Started](/docs/getting-started/quick-start/))

## Configure QuestDB connection

1. [Download VisuaLeaf](https://visualeaf.com/download) for your OS
2. Launch VisuaLeaf and click `New Connection`
3. Search for `QuestDB` and select it
4. Check the connection settings. For a local QuestDB with default credentials:

   ```
   host:localhost
   port:8812
   database:qdb
   user:admin
   password:quest
   ```

export const connectionTitle = "Screenshot of the VisuaLeaf QuestDB connection settings"

<Screenshot
  alt={connectionTitle}
  title={connectionTitle}
  src="images/guides/visualeaf/visualeaf-connection.webp"
  width={600}
  height={511}
/>

5. Click `Test Connection` to check the settings, then `Save & Connect`

export const testTitle = "Screenshot of a successful VisuaLeaf connection test"

<Screenshot
  alt={testTitle}
  title={testTitle}
  src="images/guides/visualeaf/visualeaf-test-connection.webp"
  width={600}
  height={511}
/>

The connection appears in the `Connections` sidebar. Expand it to browse the
tables in the `qdb` database.

export const tablesTitle = "Screenshot of QuestDB tables in the VisuaLeaf sidebar"

<Screenshot
  alt={tablesTitle}
  title={tablesTitle}
  src="images/guides/visualeaf/visualeaf-tables.webp"
  width={308}
  height={241}
/>

## Sending Queries

Right-click the database and choose `New SQL Editor`, then run queries with:

- `Run All` (<kbd>F5</kbd>) to run the whole script, or
- `Run` (<kbd>F9</kbd>) to run the current statement.

QuestDB-specific SQL such as `SAMPLE BY` works as written:

export const queryTitle = "Screenshot of the VisuaLeaf UI running a QuestDB SAMPLE BY query"

<Screenshot
  alt={queryTitle}
  title={queryTitle}
  src="images/guides/visualeaf/visualeaf-query.webp"
  width={820}
  height={482}
/>

## See also

- [QuestDB Postgres wire protocol](/docs/connect/compatibility/pgwire/overview/)
