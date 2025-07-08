---
title: Web Console Overview
sidebar_label: Overview
description: Learn how to use the QuestDB Web Console. Launch queries, create
  visualizations and more. Includes pictures and examples.
---

import Screenshot from "@theme/Screenshot"

Web Console is a client that allows you to interact with QuestDB. It
provides UI tools to query and explore the data, visualize the results in a table or plot.

<Screenshot
  alt="Screenshot of the Web Console"
  src="images/docs/console/overview.webp"
/>

### Accessing the Web Console

Web Console will be available at `http://[server-address]:9000`. When
running locally, this will be [http://localhost:9000](http://localhost:9000).

### Layout

<Screenshot
  alt="Preview of the different sections in the Web Console"
  height={375}
  src="images/docs/console/layout.webp"
  width={800}
/>

The Web Console is organized into the following main sections that work together to provide a complete workflow:

### Schema Explorer

The **Schema Explorer** is the navigation hub for exploring tables and materialized views. It provides detailed information about each database object including columns with data types, storage configuration (partitioning and WAL status), and for materialized views, their base tables.

[Learn more about Schema Explorer →](/docs/web-console/schema-explorer)

### Code Editor

The **Code Editor** is where you write and execute SQL queries with features like syntax highlighting, auto-completion, and error tracing. It supports executing queries by selection, multiple query execution, and query planning.

[Learn more about Code Editor →](/docs/web-console/code-editor)

### Metrics View

The **Metrics View** provides real-time monitoring and telemetry capabilities for your QuestDB instance. It displays interactive charts and widgets to track database performance, WAL operations, and table-specific metrics.

[Learn more about Metrics View →](/docs/web-console/metrics-view)

### Query Log

The **Query Log** monitors query execution status and performance metrics, providing real-time feedback and maintaining a history of recent operations. It shows execution times, row counts, and detailed error information to help optimize your queries.

[Learn more about Query Log →](/docs/web-console/query-log)

### Result Grid

The **Result Grid** displays your query results in an interactive table format with features for data navigation, export, and visualization.

[Learn more about Result Grid →](/docs/web-console/result-grid)

### Import CSV

The **Import CSV** interface allows you to upload and import CSV files into QuestDB with automatic schema detection, flexible configuration options, and detailed progress tracking. You can create new tables or append to existing ones with full control over the import process.

[Learn more about Import CSV →](/docs/web-console/import-csv)

### Create Table

The **Create Table** interface provides an interactive way to create new tables through an intuitive UI. You can define table structure, configure partition settings, enable WAL, and add columns with their data types and properties without writing SQL code.

[Learn more about Create Table →](/docs/web-console/create-table)

### Instance Naming

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
When using QuestDB Enterprise with Role-Based Access Control (RBAC), only the users with `SETTINGS` or `DATABASE ADMIN` permission can edit the instance information. See [Database Permissions](/docs/operations/rbac/#database-permissions) for more details.
:::
