---
title: Web Console overview
sidebar_label: Overview
description: "Tour of the QuestDB Web Console: the SQL editor, notebooks with
  charts and live dashboards, the AI Assistant, the QuestDB MCP server for
  coding agents, and monitoring."
---

import Screenshot from "@theme/Screenshot"

The QuestDB Web Console is a browser-based SQL client bundled with every
QuestDB instance. Write and run SQL, explore your schema, build notebook
dashboards with live charts, bring in AI assistance, and monitor ingestion,
all without installing anything.

<Screenshot
  alt="The Web Console: schema explorer, a live dashboard notebook, and the monitoring panel"
  src="images/docs/console/overview.webp"
/>

## Accessing the Web Console

The Web Console is available at `http://[server-address]:9000`. When
running locally, this is `http://localhost:9000`.

## Layout

<Screenshot
  alt="Preview of the different sections in the Web Console"
  height={375}
  src="images/docs/console/layout.webp"
  width={800}
/>

The Schema Explorer sits on the left, the editor and notebook tabs in the
center with the Result Grid and Query Log below them, and the right sidebar
holds quick tools such as the AI Assistant and Table Details.

The Web Console is organized into the following main sections that work together to provide a complete workflow:

## Code Editor

The **Code Editor** is where you write and execute SQL queries with features like syntax highlighting, auto-completion, and error tracing. It supports executing queries by selection, multiple query execution, and query planning.

[Learn more about the Code Editor →](/docs/getting-started/web-console/code-editor)

## Notebooks

**Notebooks** combine SQL cells, markdown notes, and live charts in a single tab. Use them to explore data step by step, or flip to the grid layout and arrange cells into an auto-refreshing dashboard.

[Learn more about Notebooks →](/docs/getting-started/web-console/notebooks/overview)

## QuestDB MCP Server

The official **QuestDB MCP server** links AI coding agents such as Claude Code or Codex to your running Web Console. Agents explore schemas, run SQL, and build notebook dashboards through your browser session, with a four-level permission model controlling what they can see and do.

[Learn more about the QuestDB MCP server →](/docs/getting-started/web-console/mcp-server)

## AI Assistant

**QuestDB AI** is the AI assistant built into the Web Console. It generates, explains, and fixes SQL and builds notebooks from a prompt. It is bring-your-own-key: you use your own OpenAI or Anthropic key, or a local model, and your keys and data stay under your control.

[Learn more about the AI Assistant →](/docs/getting-started/web-console/questdb-ai)

## Metrics View

The **Metrics View** provides real-time monitoring and telemetry capabilities for your QuestDB instance. It displays interactive charts and widgets to track database performance, WAL operations, and table-specific metrics.

[Learn more about the Metrics View →](/docs/getting-started/web-console/metrics-view)

## Schema Explorer

The **Schema Explorer** is the navigation hub for exploring tables and materialized views. It provides detailed information about each database object including columns with data types, storage configuration (partitioning and WAL status), and for materialized views, their base tables.

[Learn more about the Schema Explorer →](/docs/getting-started/web-console/schema-explorer)

## Table Details

The **Table Details** panel provides real-time monitoring and detailed metadata for any table or materialized view. It includes health status indicators, WAL ingestion metrics such as pending rows and transaction lag, performance alerts, and a full view of the table's DDL, columns, and storage configuration.

[Learn more about Table Details →](/docs/getting-started/web-console/table-details)

## Result Grid

The **Result Grid** displays your query results in an interactive table format with features for data navigation, export, and visualization.

[Learn more about the Result Grid →](/docs/getting-started/web-console/result-grid)

## Query Log

The **Query Log** monitors query execution status and performance metrics, providing real-time feedback and maintaining a history of recent operations. It shows execution times, row counts, and detailed error information to help optimize your queries.

[Learn more about the Query Log →](/docs/getting-started/web-console/query-log)

## Import CSV

The **Import CSV** interface allows you to upload and import CSV files into QuestDB with automatic schema detection, flexible configuration options, and detailed progress tracking. You can create new tables or append to existing ones with full control over the import process.

[Learn more about Import CSV →](/docs/getting-started/web-console/import-csv)

## Right Sidebar

The **Right Sidebar** provides quick access to essential tools and information:
- **Help**: Access quick links and contact options through a convenient help menu
- **AI Assistant**: Open AI Assistant chat window and manage conversations
- **QuestDB News**: Stay up-to-date with the latest QuestDB announcements and updates
- **Table Details**: Monitor real-time ingestion metrics and health status, view metadata for any table or materialized view.

## Instance naming

Web Console allows you to set the instance name, type, and color. This functionality is particularly useful for production users who manage multiple deployments and frequently navigate between them. This feature makes it easier to keep track of instance information and label instances with meaningful names for their users.<br/>
The instance name, instance type, and description are displayed when hovering over the icon in the instance information badge.

Instance information can be modified through the dialog that opens when clicking the edit icon:

<Screenshot
  alt="Instance information edit popper in Web Console"
  height={470}
  src="images/docs/console/instance-naming.webp"
  width={672}
/>

:::info
If `http.settings.readonly` configuration is set to true, instance information is not editable.
:::

:::info
When using QuestDB Enterprise with Role-Based Access Control (RBAC), only the users with `SETTINGS` or `DATABASE ADMIN` permission can edit the instance information. See [Database Permissions](/docs/security/rbac/#database-permissions) for more details.
:::
