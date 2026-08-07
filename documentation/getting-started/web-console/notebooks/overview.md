---
title: Notebooks overview
sidebar_label: Overview
description:
  SQL notebooks in the QuestDB Web Console combine queries, markdown notes,
  and live charts in one tab. Create a notebook, run a query, and draw your
  first chart.
---

import Screenshot from "@theme/Screenshot"

import LazyVideo from "@theme/LazyVideo"

Notebooks are SQL notebooks built into the QuestDB Web Console: each combines
SQL cells, markdown notes, and live charts in a single tab. Use one to explore
a dataset step by step, keep queries and commentary together, or arrange cells
into an auto-refreshing dashboard.

<Screenshot
  alt="A dashboard notebook in the grid layout: a markdown header above candlestick, volume, VWAP, and per-symbol charts"
  src="images/docs/console/notebook-overview.webp"
  height={1062}
  width={1258}
/>

## Creating a notebook

Click the **+** button in the tab bar and choose **New notebook**. The new
notebook opens as its own tab beside your SQL editors, marked with a notebook
icon, and starts with a single empty SQL cell. Notebooks are named
"Notebook 1", "Notebook 2", and so on until you [rename them](/docs/getting-started/web-console/notebooks/manage-share).

The [AI Assistant](/docs/getting-started/web-console/questdb-ai) and coding
agents connected over [MCP](/docs/getting-started/web-console/mcp-server)
can also create notebooks for you. See [Notebooks and AI](#notebooks-and-ai).

## The notebook at a glance

<Screenshot
  alt="The notebook toolbar with numbered callouts for each control"
  src="images/docs/console/notebook-toolbar.webp"
  height={84}
  width={1350}
/>

1. **Notebook name**: click the pencil to rename, up to 100 characters.
2. **Build with AI**: opens an AI chat bound to this notebook. Disabled until
   an [AI provider](/docs/getting-started/web-console/questdb-ai) is
   configured.
3. **Duplicate notebook**: copies the notebook, including current results.
4. **Export notebook**: downloads the notebook as a JSON file. See
   [Managing and sharing](/docs/getting-started/web-console/notebooks/manage-share).
5. **Variables**: notebook-wide `@name` variables available to every cell. See
   [Variables](/docs/getting-started/web-console/notebooks/variables).
6. **Refresh charts**: refreshes every chart at once; the dropdown sets the
   notebook's auto-refresh default. See [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards).
7. **List | Grid** toggle: switch between the list layout and the grid layout
   used for dashboards.

Below the toolbar sits the cell stack, with **Add Cell** and **Add Markdown**
buttons at the end. The toolbar hides while a cell is
[maximized](/docs/getting-started/web-console/notebooks/cells#focus-modes).

## From query to chart

The fastest way to get a feel for notebooks:

1. Type a query into the empty cell, for example per-symbol trade counts over
   the last hour of `trades`, and press **Run** (or `Ctrl/Cmd+Enter`). The
   results appear as a table under the editor.
2. Press **Draw** instead, and the same query renders as a chart. The chart
   type is inferred from the result's shape.
3. Use the **Table | Chart** toggle to flip between the two views without
   re-running the query.

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Running a notebook query and switching between table and chart"
  poster="images/docs/console/notebook-draw-flow-poster.webp"
  src="images/docs/console/notebook-draw-flow.mp4"
  width="100%"
/>

[Notebook cells](/docs/getting-started/web-console/notebooks/cells) covers running SQL in depth, and [Charts](/docs/getting-started/web-console/notebooks/charts)
covers chart types and configuration.

## Notebooks and AI

Coding agents connected through the
**QuestDB MCP server** can build and
edit notebooks too. Agents work in the background without taking over your
tab: when an agent changes a notebook you are not looking at, a notification
appears above the MCP status pill with a **View** action that jumps to the
change. Until you connect the MCP server for the first time, new notebooks
show a dismissible card prompting you to set it up.

[Learn more about the QuestDB MCP server →](/docs/getting-started/web-console/mcp-server)

**Build with AI** on the toolbar opens an AI chat that knows this notebook: it
can add cells, write queries, and configure charts in place. Each notebook has
its own conversation. The button is disabled with an explanatory tooltip until
an AI provider and model are configured in
**AI Assistant settings**.

[Learn more about the AI Assistant →](/docs/getting-started/web-console/questdb-ai)

## Next steps

- [Notebook cells](/docs/getting-started/web-console/notebooks/cells) covers SQL and markdown cells, running queries, and
  organizing the notebook
- [Charts](/docs/getting-started/web-console/notebooks/charts) covers drawing and configuring charts
- [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards) covers the grid layout and auto-refresh
