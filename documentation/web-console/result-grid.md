---
title: Result Grid
description: View, analyze, and export query results with the interactive Result Grid in QuestDB Web Console
---

import Screenshot from "@theme/Screenshot"

The **Result Grid** displays your query results in an interactive table format that makes it easy to explore, analyze, and export data. It provides a clean, organized view of your query results with powerful features for data navigation and manipulation.

<Screenshot
  alt="Result Grid in the Web Console"
  src="images/docs/console/result-grid.webp"
/>

## Actions

The Result Grid provides several action buttons in the toolbar to help you work with your data:

- **Copy result to Markdown**: Copies the grid contents to your clipboard in Markdown table format for easy sharing and documentation
- **Freeze left column**: Freezes the leftmost column in place while scrolling horizontally through the rest of the data
- **Move selected column to the front**: Moves the currently selected column to the leftmost position for better visibility
- **Reset grid layout**: Resets the grid to its default column arrangement and removes all customizations including frozen columns and column reordering
- **Refresh**: Re-executes the last query to update the results with fresh data
- **Download result as CSV**: Downloads all data in the current result set as a CSV file for external analysis

## Grid

The Result Grid utilizes vertical and horizontal virtualization to efficiently handle large datasets while providing comprehensive interaction capabilities.

### Column Features

- **Column headers**: Display both column names and [data types](/docs/reference/sql/datatypes/)
- **Column resizing**: Drag the column borders to adjust width for better readability
- **Copying column name**: Click on any column header to copy the column name directly to the [Code Editor](/docs/web-console/code-editor) for quick query building

### Cell Interaction

- **Cell selection**: Click on any cell to select and highlight it
- **Cell copying**: Select a cell and press `Ctrl+C` (or `Cmd+C` on Mac) to copy the cell value to your clipboard
- **Keyboard navigation**: The grid supports comprehensive keyboard navigation for efficient data exploration
  - **Arrow keys**: Navigate between cells in all directions
  - **Page Up/Page Down**: Focus the first/last cell in the view
  - **Home**: Jump to the first column of the current row
  - **End**: Jump to the last column of the current row


### Performance Features

- **Virtual rendering**: The Result Grid only renders visible cells by using horizontal and vertical virtualization
- **Lazy loading**: Data is loaded in pages of 1000 rows as you scroll to minimize memory usage

The Result Grid seamlessly integrates with other Web Console components, providing immediate visual feedback for your queries and supporting the complete data analysis workflow from query execution to data export. 