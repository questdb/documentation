---
title: Live dashboards
sidebar_label: Live dashboards
description:
  Turn a QuestDB notebook into a live dashboard with the grid layout,
  auto-refreshing charts, and notebook variables.
---

import Screenshot from "@theme/Screenshot"

import LazyVideo from "@theme/LazyVideo"

A notebook becomes a dashboard with three ingredients: the grid layout to
arrange cells, auto-refresh to keep charts live, and
[variables](/docs/getting-started/web-console/notebooks/variables) to parameterize the whole board.
Everything runs inside the console, no external dashboard tool required; for
dashboards outside it, see the
[Grafana integration](/docs/integrations/visualization/grafana/).

<Screenshot
  alt="A live trading dashboard built from notebook cells in the grid layout"
  src="images/docs/console/notebook-dashboard.webp"
  height={1012}
  width={1258}
/>

## Grid layout

The **List | Grid** toggle on the toolbar switches the notebook's layout. The
grid snaps cells to fixed columns. Drag a cell by its header to move it, and
resize it from its edges and corners. Cells pack upward to fill gaps, and new
cells land full-width at the bottom.

Two shortcuts: double-click a cell's header to expand it to the full width,
and double-click a side resize handle to expand the cell toward that side.

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Arranging and resizing notebook cells in grid layout"
  poster="images/docs/console/notebook-grid-arrange-poster.webp"
  src="images/docs/console/notebook-grid-arrange.mp4"
  width="100%"
/>

:::tip
For a clean dashboard, hide the SQL editors with
[Split/maximize view](/docs/getting-started/web-console/notebooks/cells#focus-modes) and use markdown cells for titles.
:::

## Auto-refresh

Chart cells refresh themselves on a schedule. The schedule has a notebook-wide
default, and any cell can override it.

### The notebook default

The **Refresh charts** split button on the toolbar refreshes every chart
immediately; it is disabled when the notebook has no chart cells. Its dropdown
sets the default interval: **Auto** (the default), **Off**, **1s**, **5s**,
**10s**, **30s**, or **1m**.

### Per-cell overrides

A chart cell's own interval dropdown (or **Auto-refresh** in its **⋮** menu)
offers the same options, plus **Notebook default** to remove the override. A
cell uses its own setting if set, otherwise the notebook default. Overridden
cells are marked with a pink dot, and so is the toolbar control; when
overrides exist, the toolbar dropdown gains **Reset cell overrides**.

<Screenshot
  alt="The notebook auto-refresh menu with an active cell override"
  src="images/docs/console/notebook-refresh-menu.webp"
  height={349}
  width={312}
/>

### How Auto works

**Auto** adapts the interval to how long your queries take: fast queries
refresh often, slow ones back off. Charts only poll while they are visible: scrolled into view and with
the browser tab in the foreground. They catch up as soon as you return. **Off**
still draws the chart once, and a manual refresh always goes through.

## Example: a live trading dashboard

The dashboard pictured above, built on the demo `trades` table:

1. Add a markdown cell as the title, and define `@symbol := 'BTC-USDT'` and
   `@window := '$now - 1h..$now'` under **Variables**.
2. Add the price cell. Two statements in one cell draw candles with volume
   bars behind them; assign the volume query to the right axis in
   [Chart settings](/docs/getting-started/web-console/notebooks/charts#chart-settings)
   and cap that axis so the bars stay low:

   ```questdb-sql title="1-minute candles and volume for the last hour"
   SELECT timestamp, first(price) AS open, max(price) AS high,
     min(price) AS low, last(price) AS close
   FROM trades
   WHERE symbol = @symbol AND timestamp IN @window
   SAMPLE BY 1m;

   SELECT timestamp, sum(amount) AS volume
   FROM trades
   WHERE symbol = @symbol AND timestamp IN @window
   SAMPLE BY 1m;
   ```

3. Add the supporting cells, pressing **Draw** on each: buy vs sell volume as
   a stacked bar (`sum(amount)` sampled by 5 minutes, partitioned by `side`),
   price vs a running session VWAP as two lines, and a per-symbol trade count
   partitioned by `symbol`.
4. Switch to the grid layout, arrange the cells, and hide the editors with
   the **Split/maximize view** toggle.
5. Set the notebook auto-refresh default to **1s**.

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  label="Live dashboard charts refreshing automatically"
  poster="images/docs/console/notebook-dashboard-live-poster.webp"
  src="images/docs/console/notebook-dashboard-live.mp4"
  width="75%"
  style={{ display: "block", margin: "0 auto" }}
/>

:::tip
A coding agent connected over
[MCP](/docs/getting-started/web-console/mcp-server) can build this whole
dashboard from a single prompt. So can the built-in
[AI Assistant](/docs/getting-started/web-console/questdb-ai), with no coding
agent needed.
:::

## Next steps

- [QuestDB MCP server](/docs/getting-started/web-console/mcp-server) lets a coding agent build this whole dashboard from a
  single prompt
- [Notebook charts](/docs/getting-started/web-console/notebooks/charts) covers chart types, settings, and combining queries
- [Managing and sharing notebooks](/docs/getting-started/web-console/notebooks/manage-share) covers exporting the dashboard to share it
