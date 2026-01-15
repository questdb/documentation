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

### Key Features
- **Syntax Highlighting**: Color-coded SQL keywords, strings, comments, and functions specific to QuestDB SQL
- **Auto-Completion**: Intelligent suggestions for table names, columns, and SQL functions as you type
- **Visual Query Status**: Glyph icons in the editor margin show query execution status (success, error, running)
- **Error Markers**: Underlined error positions based on query results
- **Multiple Execution Modes**: Support for single query execution, selection-based execution, and batch execution
- **Query Planning**: Analyze query execution plans with EXPLAIN functionality

:::info
Error markers and the query log are dynamically updated based on cursor position. When you place your cursor within a query, the query log will display the status of that specific query, and error markers will appear if the query execution was previously unsuccessful.
:::

### Running a Query

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

#### Running a query with selection
Select a portion of the query in the editor and press `Ctrl/Cmd + Enter`, or click on the run icon to execute only the selected portion. This allows you to run specific parts of larger queries or test query fragments independently.

:::info
When a query is executed with a selection, the selected portion of text is highlighted with a green or red background to indicate the status. You can also track the status from the run icon of the parent query.
:::

#### Getting query plan
Right-click on a run icon to access the context menu and select "Get query plan" to see how QuestDB will execute your query. This runs an `EXPLAIN` command and displays the execution plan in the result grid. See [EXPLAIN](/docs/query/sql/explain) for details.

### Running Multiple Queries

The Code Editor supports executing multiple queries in sequence through batch execution. This feature provides two distinct approaches for running multiple queries efficiently.

The editor provides dedicated buttons on the top right for multiple query execution:

<Screenshot
  alt="Run query dropdown"
  src="images/docs/console/editor-run-query.webp"
  height={87}
  width={279}
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

#### Execution Modes

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

:::tip
Running multiple queries is ideal for data migration, bulk operations, or running complex multi-step procedures. The "Stop after failure" option helps prevent cascading errors in critical operations.
:::

## Tabs

The Code Editor supports multiple tabs to help you organize and manage different SQL queries simultaneously. Each tab represents a separate query buffer with its own content and execution state.

### Adding a New Tab
Click the `+` button to create a new tab for writing additional queries

### Renaming a Tab
Double-click on a tab name to rename it for better organization

### Tab History
Access previously closed tabs and manage your query history

<Screenshot
  alt="Tab history in the Web Console"
  src="images/docs/console/tab-history.webp"
  height={312}
  width={218}
  margin={false}
/>

- **Restore Tab**: Click on an item to restore a previously closed tab from the history
- **Clear History**: Remove all stored tab history to start fresh

:::info
Web Console maintains a separate query log for each tab. See [Query Log](/docs/getting-started/web-console/query-log) for details.
:::