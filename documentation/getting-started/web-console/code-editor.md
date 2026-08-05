---
title: Code Editor
description: Write and execute SQL queries with the powerful Code Editor in QuestDB Web Console
---

import Screenshot from "@theme/Screenshot"

The **Code Editor** is the main workspace where you write and execute SQL queries in the QuestDB Web Console. It provides a modern, feature-rich editing experience with syntax highlighting, auto-completion, and multiple query execution mechanisms.

<Screenshot
  alt="Code Editor in the Web Console"
  src="images/docs/console/code-editor.webp"
/>

## Editor

The Monaco-based editor provides a powerful development environment for writing SQL queries with professional IDE features. It offers syntax highlighting, intelligent auto-completion for database objects, and multiple execution modes to suit different query workflows.

### Key features
- **Syntax Highlighting**: Color-coded SQL keywords, strings, comments, and functions specific to QuestDB SQL
- **Auto-Completion**: Intelligent suggestions for table names, columns, and SQL functions as you type
- **Visual Query Status**: Glyph icons in the editor margin show query execution status (success, error, running)
- **Error Markers**: Underlined error positions based on query results
- **Multiple Execution Modes**: Support for single query execution, selection-based execution, and batch execution
- **Query Planning**: Analyze query execution plans with EXPLAIN functionality

:::info
Error markers and the query log are dynamically updated based on cursor position. When you place your cursor within a query, the query log will display the status of that specific query, and error markers will appear if the query execution was previously unsuccessful.
:::

### Running a query

Individual query execution offers flexible options for running specific SQL statements within your editor content.

#### Running a query from the icon

Click the icon in the left margin next to any SQL query to execute it.
<Screenshot
  alt="Run icon variants in the editor"
  src="images/docs/console/editor-glyphs.webp"
  height={97}
  width={307}
  margin={false}
/>

The icon provides visual feedback:
- **Hollow play icon**: Ready to execute
- **Success icon**: Query executed successfully  
- **Error icon**: Query failed with errors
- **Cancel icon**: Currently running, click to cancel

When multiple queries exist on the same line, a dropdown menu appears with execution options for each query.

:::info
Only one query runs at a time. If you start a new query while another one is running, the Web Console asks for confirmation before cancelling the running query.
:::

#### Running a query with selection

Select a portion of the query in the editor and press `Ctrl/Cmd + Enter`, or click on the run icon to execute only the selected portion. This allows you to run specific parts of larger queries or test query fragments independently.

You can turn off selection-based execution with the **Run with selection** setting. See [Editor settings](#editor-settings) for details.

:::info
When a query is executed with a selection, the selected portion of text is highlighted with a green or red background to indicate the status. You can also track the status from the run icon of the parent query.
:::

#### Getting query plan

Right-click on a run icon to access the context menu and select "Get query plan" to see how QuestDB will execute your query. This runs an `EXPLAIN` command and displays the execution plan in the result grid. See [EXPLAIN](/docs/query/sql/explain) for details.

### Running multiple queries

The Code Editor supports executing multiple queries in sequence through batch execution. This feature provides two distinct approaches for running multiple queries efficiently.

The editor provides dedicated buttons on the top right for multiple query execution:

<Screenshot
  alt="Run query dropdown"
  src="images/docs/console/editor-run-query.webp"
  height={111}
  width={273}
  margin={false}
/>

**Run Query Button**:
- Dynamically adapts based on your current selection and context
- For single query: Shows "Run query" or "Run selected query"
- For multiple selected queries: Shows "Run N selected queries"
- **Keyboard shortcut**: `Ctrl/Cmd + Enter`

**Run All Queries Button**:
- Executes every query in the current tab sequentially
- **Keyboard shortcut**: `Ctrl/Cmd + Shift + Enter`

#### Execution modes

**Selected Queries Mode**:
When you have multiple queries selected (partially or fully), the system runs only the selected portions of each query in sequence. This allows you to:
- Run specific parts of larger queries
- Execute a subset of queries from your tab
- Test query fragments before running the complete set

**All Queries Mode**:
When you choose "Run all queries", the system executes every query in the tab from top to bottom. This mode includes:
- **Confirmation dialog**: Prevents accidental execution of all queries
- **Stop after failure option**: Checkbox to halt execution when a query fails (enabled by default)
- **Progress tracking**: Real-time feedback showing successful and failed query counts
- **Execution summary**: Shows the summary in the query log, including timing and the number of failed/successful queries
- **Read-only editor**: The editor is locked until the run completes

:::tip
Running multiple queries is ideal for data migration, bulk operations, or running complex multi-step procedures. The "Stop after failure" option helps prevent cascading errors in critical operations.
:::

### Sharing queries

You can copy a link to a query and share it with others. Opening the link loads the query into the editor and runs it. If the current tab does not contain the query, the Web Console opens it in a new tab named "Shared Query".

- **Copy query link**: Press `Alt/Option + L` to copy a link to the query under the cursor. If you have a selection, the link points to the selected portion.
- **Copy queries link**: Press `Alt/Option + Shift + L` to copy a link to all queries in the tab.

You can also right-click a run icon and select **Copy link to**, followed by the query text, for a specific query.

## Tabs

The Code Editor supports multiple tabs to help you organize and manage different SQL queries simultaneously. Each tab represents a separate query buffer with its own content and execution state.

### Adding a new tab

Click the `+` button and choose **New editor** for another SQL tab, or **New notebook** to open a [notebook](/docs/getting-started/web-console/notebooks/overview) as a tab beside your editors.

### Renaming a tab

Double-click on a tab name to rename it for better organization.

### Tab history

Access previously closed tabs and manage your query history.

<Screenshot
  alt="Tab history in the Web Console"
  src="images/docs/console/tab-history.webp"
  height={205}
  width={175}
  margin={false}
/>

- **Restore Tab**: Click on an item to restore a previously closed tab from the history
- **Clear History**: Remove all stored tab history to start fresh

### Importing and exporting tabs

Click the menu button (three dots) in the tab bar to import or export tabs:

- **Export tabs**: Downloads all tabs as a file
- **Import tabs**: Restores tabs from an exported file. A summary dialog lists the imported and skipped tabs.

:::info
Web Console maintains a separate query log for each tab. See [Query Log](/docs/getting-started/web-console/query-log) for details.
:::

## Editor settings

Click the menu button (three dots) in the tab bar and select **Editor settings**.

<Screenshot
  alt="Editor settings modal in the Web Console"
  src="images/docs/console/editor-settings.webp"
  height={286}
  width={480}
  margin={false}
/>

The following settings are available:

- **Run with selection**: Run actions respect your text selection. Enabled by default. When disabled, run actions always execute the whole query under the cursor.
- **Maximum column width**: The maximum column width of the [Result Grid](/docs/getting-started/web-console/result-grid), in pixels. Accepts values between 60 and 4000. Leave empty to size columns based on their content.
