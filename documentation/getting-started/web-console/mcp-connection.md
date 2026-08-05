---
title: MCP connection
sidebar_label: MCP connection
description:
  Connect AI coding agents like Claude Code or OpenAI Codex to the QuestDB Web
  Console with the MCP bridge. Covers setup, pairing, permission levels, and
  the available tools.
---

import Screenshot from "@theme/Screenshot"

import LazyVideo from "@theme/LazyVideo"

import Tabs from "@theme/Tabs"

import TabItem from "@theme/TabItem"

The <a href="https://github.com/questdb/mcp-bridge" target="_blank">QuestDB MCP bridge</a> (`@questdb/mcp-bridge`) is a local stdio MCP server that connects coding agents to a running Web Console. The agent gets tools to explore your database schema, run SQL, and build [notebooks](/docs/getting-started/web-console/notebooks/overview) with charts and live dashboards. Every action executes in the browser through your already-authenticated console session: the bridge runs on your machine, listens on loopback only, and never handles credentials.

The setup wizard detects and configures Claude Code, Codex, Cursor, OpenCode, and Gemini CLI. Any other MCP client works with the manual configuration.

:::tip
No coding agent? The built-in [AI Assistant](/docs/getting-started/web-console/questdb-ai) has the same capabilities: it builds notebooks and dashboards from a prompt right inside the console, using your own API keys or a local model.
:::

## Setup

One command configures the bridge for every supported agent on your machine; the only prerequisite is Node.js, which provides `npx`. Each Web Console version expects a specific bridge version: click the **MCP status pill** at the bottom of the Web Console to see the setup command for your console, already pinned to the expected version.

<Tabs defaultValue="wizard" values={[
  { label: "Setup wizard (recommended)", value: "wizard" },
  { label: "Manual configuration", value: "manual" },
]}>

<TabItem value="wizard">

Copy the setup command from the MCP status pill and run it in your terminal:

```shell
npx @questdb/mcp-bridge@<expected-version> setup
```

The wizard detects your installed coding agents, lets you pick which ones to configure, and writes the bridge into each agent's MCP config, pinned to that version.

</TabItem>

<TabItem value="manual">

Add the bridge to your MCP client's config file by hand, pinning the version shown in the MCP status pill. For Claude Code that file is `.mcp.json` in the project root; other clients name their own location:

```json
{
  "mcpServers": {
    "questdb": {
      "command": "npx",
      "args": ["-y", "@questdb/mcp-bridge@<expected-version>"]
    }
  }
}
```

</TabItem>

</Tabs>

The bridge reads these environment variables:

| Variable | Default | Description |
|---|---|---|
| `CONSOLE_ORIGIN` | `http://127.0.0.1:9000` | Web Console origin to pair with. |
| `MCP_BRIDGE_PORT` | auto-allocated | Fixed WebSocket port for the bridge. |
| `LOG_PATH` | `/tmp/questdb-mcp-bridge/…` | Log file location. |
| `LOG_LEVEL` | `INFO` | `DEBUG` adds heartbeats and full tool payloads. |

## Pairing

Before any tool works, your browser has to pair with the bridge. The agent drives the flow, and you do not need the Web Console open beforehand: when the agent needs to pair, the bridge opens a pairing link in your default browser, and the Web Console shows a consent prompt where you review the connection, pick a permission level, and connect.

If the automatic open does not reach the right browser, the agent also shows the pairing credentials so you can pair yourself:

- Click the deep link it surfaces to open the pairing prompt in your browser.
- Or paste the WebSocket URL and token into the MCP status pill at the bottom of the console.

<Screenshot
  alt="The MCP bridge pairing consent prompt in the Web Console"
  src="images/docs/console/mcp-pairing-consent.webp"
  height={518}
  width={500}
/>

Each bridge run generates a fresh pairing token, held only in memory. By
default, the bridge also auto-allocates a port; when `MCP_BRIDGE_PORT` is set,
it uses that fixed port instead. If the console and bridge versions do not
match, the consent prompt tells you which bridge version to run.

## Permission levels

You choose what the agent is allowed to see and do when you accept the pairing, and you can change it at any time from the MCP status pill in the footer.

| Level | What the agent gets |
|---|---|
| None | Notebook, query-validation, and documentation tools. Direct database schema tools and query-result rows are unavailable; existing notebook SQL and markdown remain visible to the agent. |
| Schema access | The table list, column definitions, and table statistics. |
| Read | Schema access, plus ad-hoc DQL queries that return result rows to the agent. |
| Write | Read, plus DDL and DML execution (`CREATE`, `INSERT`, `UPDATE`, `DROP`). |

<Screenshot
  alt="The four MCP bridge permission levels in the pairing prompt"
  src="images/docs/console/mcp-permission-levels.webp"
  height={337}
  width={600}
/>

Permissions are enforced by the Web Console, not by the bridge or the agent. The console classifies every SQL statement before execution and does not let DDL/DML run unless the Write permission is given.

At every level, the agent can still run read-only cells inside a notebook. The results render in your console, but the rows are never returned to the agent.

## What agents can do

Once paired, the agent has tools covering several areas:

- **Schema exploration**: list tables and materialized views, fetch DDL, and read runtime table statistics.
- **SQL execution**: run ad-hoc queries with results returned to the agent (100 rows by default, up to 10,000, capped at about 1 MB per response), and validate query syntax without executing.
- **Documentation lookup**: built-in reference for QuestDB functions, operators, and SQL keywords, so generated SQL uses correct QuestDB syntax without web searches.
- **Notebooks**: create, duplicate, and archive notebooks; add, edit, move, and run SQL and markdown cells; switch cells to chart mode with nine chart types (line, area, step line, step area, bar, stacked bar, scatter, pie, candlestick); arrange cells into a grid dashboard; and set per-cell or notebook-wide chart auto-refresh.
- **Two-way handoff**: hand analysis back and forth with the agent; it snapshots the workspace and fetches a digest of your recent edits, so you can both work on the same notebook without conflicts.

## Background edits

The agent builds and edits notebooks without taking over the console. New notebooks are created as background tabs, and when an agent changes a notebook you are not looking at, the console shows a "New changes from the agent" notification with a **View** action that jumps to the change, while the MCP status pill signals the pending changes.

<Screenshot
  alt="The 'New changes from the agent' notification in the Web Console"
  src="images/docs/console/background-edits.webp"
  height={115}
  width={360}
/>

## Example: An FX dashboard from one prompt

With the bridge configured and QuestDB running, a single prompt is enough for
a full technical-analysis dashboard:

```text
Build an FX technical-analysis dashboard for FX symbols ('GBPUSD' by default) for the last 12 hours in my QuestDB Web Console.

Use the fx_trades and market_data tables, along with the related
materialized views.

The charts I'd like to have in the dashboard:

1. Price (OHLC @interval) & Volume: Full-width candlestick and volume chart.
Add the necessary min/max values to the axes so that volume occupies only the bottom ~20% of the chart.
2. Trend: SMA20 vs SMA50: Line chart showing the 20-bar and 50-bar moving averages of the close price, ordered properly.
3. Bollinger Bands (20, 2σ): Line chart showing close, mid (SMA20), upper, and lower bands.
4. VWAP vs Close
5. Volume by Side: Stacked bar chart showing volumes categorized by side.
6. RSI (14)
7. MACD (12, 26, 9)
8. ATR (14, bps)

The dashboard should auto-refresh every second.
```

The agent [pairs](#pairing) with the console, loads its QuestDB SQL guidance,
validates each indicator query, and builds the whole dashboard in a
[background tab](#background-edits). You approve the connection once, then
click the notification when it is ready:

<LazyVideo
  autoPlay
  muted
  loop
  playsInline
  controls
  label="Coding agent building a live foreign-exchange dashboard through MCP"
  poster="images/docs/console/mcp-fx-dashboard-poster.webp"
  src="images/docs/console/mcp-fx-dashboard.mp4"
  width="100%"
/>

## Next steps

- The bridge is open source at <a href="https://github.com/questdb/mcp-bridge" target="_blank">github.com/questdb/mcp-bridge</a>: issues and contributions welcome
- [AI coding agents](/docs/getting-started/ai-coding-agents/) covers agent skills and REST API access
- [Live dashboards](/docs/getting-started/web-console/notebooks/live-dashboards) shows how to build the same dashboards by hand
- [Web Console overview](/docs/getting-started/web-console/overview/) tours the console surfaces
