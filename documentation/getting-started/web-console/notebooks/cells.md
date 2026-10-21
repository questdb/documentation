---
title: Notebook cells
sidebar_label: Cells
description:
  Working with cells in QuestDB Web Console notebooks. SQL and markdown cells,
  running multi-statement queries, result tabs, naming, organizing, and
  resizing.
---

import Screenshot from "@theme/Screenshot"

import LazyVideo from "@theme/LazyVideo"

A notebook is a stack of cells. SQL cells hold queries and their results;
markdown cells hold notes, titles, and commentary. Every cell has a header with
its name and controls, and cells can be named, reordered, resized, duplicated,
and focused individually.

<Screenshot
  alt="A chart cell with numbered callouts for each header control"
  src="images/docs/console/notebook-cell-anatomy.webp"
  height={656}
  width={1226}
/>

1. **Cell name**: doubles as the chart title. See [Naming cells](#naming-cells).
2. **Refresh now**: re-runs the chart on demand.
3. **Auto-refresh interval**: this cell's refresh schedule; the dot marks an
   override of the notebook default. See
   [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards#auto-refresh).
4. **Table | Chart**: flip between the two views of the same result.
5. **Split/maximize view**: shows or hides the editor within the cell.
6. **Maximize**: expands the cell to fill the whole notebook.
7. **More actions**: see the
   [cell menu reference](#cell-menu-reference).

## Adding cells

Use **Add Cell** for a SQL cell or **Add Markdown** for a markdown cell. Both
buttons sit at the end of the notebook, and in the list layout they also appear
between cells when you hover over the gap.

## Running SQL

### Running a statement

Press **Run** in the cell header, or `Ctrl/Cmd+Enter` inside the editor, to
run the statement under the cursor. If text is selected and the
[Run with selection](/docs/getting-started/web-console/code-editor/) editor
setting is on, the selection runs instead. `Ctrl/Cmd+Shift+Enter` runs every
statement in the cell. A running query shows a **Stop** button in its status
line, and you can keep editing while it runs.

### Multiple statements

A cell can hold several statements. In table mode they run sequentially, top
to bottom, and stop at the first error; in chart mode they run in parallel and
do not block each other (see [Table and chart views](#table-and-chart-views)).

When a cell has more than one statement, each gets its own result tab with a
status icon: queued, running, success, error, or cancelled. While a run is in
progress the active tab follows the executing statement until you click a tab
yourself.

<Screenshot
  alt="A three-statement cell after a successful run, with one result tab per statement"
  src="images/docs/console/notebook-statement-tabs.webp"
  height={884}
  width={1222}
/>

## Results in a cell

Results render in the same grid as the editor's
[Result Grid](/docs/getting-started/web-console/result-grid), with the same
column resizing, reordering, freezing, and keyboard navigation. The actions
bar above the grid offers: copy the result as a markdown table, freeze the
left column, move the selected column to the front, reset the grid layout,
re-run the active tab's query, and **Download as Parquet / CSV**.

Each statement fetches up to the per-statement row cap (see
[Storage and limits](/docs/getting-started/web-console/notebooks/manage-share#storage-and-limits));
larger results show "N of M rows (truncated)". Results and your grid layout
are saved with the notebook and restored when you come back to it.

## Table and chart views

Before a cell has a result, its header shows **Run** and **Draw**. Once a
result exists, a **Table | Chart** toggle replaces them. Clicking the already-active view clears the result and collapses the cell
back to just the editor.

The same query, in each view:

<Screenshot
  alt="A SAMPLE BY query shown as a result grid in Table view"
  src="images/docs/console/notebook-table-view.webp"
  height={447}
  width={1222}
/>

<Screenshot
  alt="The same SAMPLE BY query rendered as a line chart in Chart view"
  src="images/docs/console/notebook-chart-view.webp"
  height={506}
  width={1222}
/>

Drawing charts is covered on the
[Charts](/docs/getting-started/web-console/notebooks/charts) page.

## Markdown cells

Double-click a markdown cell (or use its **Edit** button) to edit the source.
Save with **Apply**, `Ctrl/Cmd+Enter`, or by clicking elsewhere.
Markdown cells render headings, lists, links, code, tables, quotes, and emojis. Use them for dashboard titles and commentary.

<Screenshot
  alt="A rendered markdown cell with headings, a list, links, and emoji"
  src="images/docs/console/notebook-markdown-preview.webp"
  height={233}
  width={1222}
/>

## Naming cells

The label on the left of the cell header reads "Untitled" until you name the
cell. Double-click it (or press Enter with the label focused) to rename, up to
100 characters. Pressing Enter or clicking away saves; Escape cancels; an
empty name clears it.

<Screenshot
  alt="A cell header with the name in its editable state"
  src="images/docs/console/notebook-cell-name-edit.webp"
  height={50}
  width={1222}
/>

## Organizing cells

In the list layout, reorder cells with **Move up** / **Move down** in the cell
menu, or press the arrow keys with the cell focused. In the grid layout you
drag cells by their headers instead:

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Reordering notebook cells in list view"
  poster="images/docs/console/notebook-cell-reorder-poster.webp"
  src="images/docs/console/notebook-cell-reorder.mp4"
  width="100%"
/>

## Resizing a cell

In the list layout, drag the divider between the editor and the result to
rebalance them, or drag the cell's bottom edge to change its overall height.
Double-click a handle to reset it. The editor grows with your SQL until you
resize it manually; after that, your chosen height sticks and the editor
scrolls internally.

In the grid layout, cells resize from their edges and corners instead, and
neighboring cells reflow to make room. Double-click a left or right edge
handle to expand the cell as far as it can go toward that side, or
double-click the cell's header to make it full-width:

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Resizing notebook cells in list and grid layouts"
  poster="images/docs/console/notebook-cell-resize-poster.webp"
  src="images/docs/console/notebook-cell-resize.mp4"
  width="100%"
/>

## Focus modes

### Maximize a cell

The **Maximize** button expands the cell to fill the entire notebook, hiding
the toolbar and all other cells, which is useful for working on one query
without distraction. **Restore** brings the notebook back.

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Maximizing and restoring a notebook cell"
  poster="images/docs/console/notebook-cell-maximize-poster.webp"
  src="images/docs/console/notebook-cell-maximize.mp4"
  width="75%"
  style={{ display: "block", margin: "0 auto" }}
/>

### Split/maximize view

The small arrows icon beside the **Table | Chart** toggle (tooltip
**Maximize view**) hides the SQL editor so the table or chart fills the cell.
Unlike [maximizing a cell](#maximize-a-cell), the cell's footprint in the
notebook does not change. Click it again (**Split view**) to bring the editor
back. This is the main tool for clean dashboards, where cells show only their
charts.

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Hiding the SQL editor to maximize a cell result"
  poster="images/docs/console/notebook-result-only-poster.webp"
  src="images/docs/console/notebook-result-only.mp4"
  width="100%"
/>

:::info
Narrow cells collapse the editor automatically and move their actions into the
**⋮** menu. Use **View SQL** there to reveal the editor.
:::

## Cell menu reference

The **⋮** menu on each cell shows the actions that are not already visible as
buttons at the cell's current width:

<Screenshot
  alt="The cell menu opened on a chart cell"
  src="images/docs/console/notebook-cell-menu.webp"
  height={252}
  width={1326}
/>

| Item | Purpose |
| --- | --- |
| View SQL / View table / View chart | Switch what a narrow cell displays |
| Reset zoom | Reset a zoomed chart. See [Charts](/docs/getting-started/web-console/notebooks/charts#zooming) |
| Auto-refresh | Per-cell refresh interval. See [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards#auto-refresh) |
| Refresh now | Re-run the cell or refresh its chart |
| Chart settings | Open the chart configuration drawer. See [Charts](/docs/getting-started/web-console/notebooks/charts#chart-settings) |
| Move up / Move down | Reorder the cell (list layout) |
| Duplicate | Copy the cell below the original |
| Delete | Remove the cell |

## Next steps

- [Notebook charts](/docs/getting-started/web-console/notebooks/charts) covers drawing and configuring charts
- [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards) arranges cells into an auto-refreshing grid
- [Managing and sharing notebooks](/docs/getting-started/web-console/notebooks/manage-share) covers renaming, duplicating, and
  exporting notebooks
