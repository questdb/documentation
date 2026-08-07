---
title: AI Assistant (Bring Your Own Key)
sidebar_label: AI Assistant
slug: /getting-started/web-console/questdb-ai
description:
  QuestDB AI is the bring-your-own-key AI assistant built into the Web
  Console. Generate, explain, and fix SQL and build notebooks with your own
  OpenAI or Anthropic key, or a local model. No coding agent needed.
---

import Screenshot from "@theme/Screenshot"

**QuestDB AI** is the AI assistant built into the Web Console. It generates, explains, and fixes SQL, answers questions about your schema, and builds notebooks and dashboards from a prompt. It is bring-your-own-key: you connect models from OpenAI, Anthropic, or a custom provider — including local models such as Ollama — and your keys and data stay in your browser, under your control.

The Assistant matches everything a coding agent can do over the [QuestDB MCP server](/docs/getting-started/web-console/mcp-server): it builds [notebooks](/docs/getting-started/web-console/notebooks/overview) and live dashboards, explores your schema, and runs queries, with no coding agent involved.

<Screenshot
  alt="AI Assistant chat window in Web Console"
  src="images/docs/console/ai-assistant-hero.webp"
/>

## Configuration

Before using the AI Assistant, you need to configure at least one AI provider.

### Adding a model provider

The AI Assistant follows a Bring Your Own Key (BYOK) model for security and privacy. **OpenAI** and **Anthropic** are available as built-in providers. You can also [add a custom provider](#adding-a-custom-provider).

<Screenshot
  alt="Configuration modal first step"
  src="images/docs/console/configure.webp"
  width={420}
  height={433}
/>

To add a model provider:

1. Click the **Configure** button in the top bar
2. Select your preferred AI provider
3. Enter your API key from the provider's platform:
   - [OpenAI Platform](https://platform.openai.com/api-keys)
   - [Anthropic Console](https://console.anthropic.com/settings/keys)
4. Click **Next** to validate your key

:::info
Your API keys are stored only in your browser's local storage and are never transmitted to QuestDB servers. They are sent directly to your chosen AI provider when making requests.
:::

### Setting up model preferences

After validating your API key, you can configure the provider settings:

<Screenshot
  alt="Model selection interface with toggle switches"
  src="images/docs/console/configure-step-2.webp"
  width={477}
  height={549}
/>

- Enable individual models based on your needs. You can switch between enabled models at any time after setup.
- Select a permission level for the provider.

The permission level controls what the AI Assistant can access. The levels are
the same as the
[MCP permission levels](/docs/getting-started/web-console/mcp-server#permission-levels):

- **None**: Notebook, query-validation, and documentation tools. Direct database
  schema tools and query-result rows are unavailable; existing notebook SQL
  and markdown remain visible to the AI.
- **Schema access**: The table list, column definitions, and table statistics.
- **Read**: Schema access, plus ad-hoc DQL queries that return result rows to the AI.
- **Write**: Read, plus DDL and DML execution (`CREATE`, `INSERT`, `UPDATE`, `DROP`).

At every level, the AI can still run read-only cells inside a notebook. The
results render in your console, but the rows are never sent to the provider.

:::info
With the **None** and **Schema access** levels, QuestDB query-result rows are
never sent to the AI provider. Selecting at least the **Schema access** level
helps the AI Assistant generate more accurate queries.
:::

### Adding a custom provider

You can connect any provider that exposes an OpenAI-compatible or Anthropic-compatible API. This includes local providers such as Ollama.

<Screenshot
  alt="Custom provider connection form with OpenRouter as an example"
  src="images/docs/console/custom-provider.webp"
  width={480}
  height={492}
/>

To add a custom provider:

1. Select **Custom** in the configuration modal, or click **Add custom provider** in the settings
2. Enter a provider name and a base URL
3. Select the API format: OpenAI Chat Completions, OpenAI Responses, or Anthropic Messages
4. Enter an API key. This is optional for local providers.
5. Select the models to enable. The model list is fetched from the provider. If the list cannot be fetched, enter model IDs manually.
6. Set the context window size for the models. The minimum is 100,000 tokens.
7. Select a [permission level](#setting-up-model-preferences) for the provider.

<Screenshot
  alt="Model selection for a custom provider"
  src="images/docs/console/custom-provider-models.webp"
  width={480}
  height={523}
/>

:::info
The AI Assistant relies on tool calling, so enable only models that support it.
:::

After setup, use **Manage models** in the settings to add or remove models, or to change the context window size.

### Settings

After initial setup, you can modify settings or remove API keys using the **AI Settings** button in the top bar.

<Screenshot
  alt="Settings modal for configuring the providers after initial setup"
  src="images/docs/console/settings.webp"
  width={548}
  height={586}
/>

## Chat window

The chat window is the primary interface for interacting with the AI Assistant.

### Opening the chat

Access the AI Assistant through multiple methods:

- Clicking the AI icon in the right sidebar opens the latest chat

<Screenshot
  alt="Sidebar item for opening AI chat window"
  src="images/docs/console/sidebar-ai.webp"
  width={168}
  height={200}
  shadow={false}
/>

- Clicking the AI icon next to a query in the Code Editor opens a chat for that query. An icon with a border indicates an existing chat for the query.

<Screenshot
  alt="AI Icons in editor"
  src="images/docs/console/ai-gutter-icons.webp"
  width={331}
  height={277}
  shadow={false}
/>

- Clicking **Explain schema with AI** in the table context menu opens a chat with a schema explanation for the selected table, materialized view, or view.

<Screenshot
  alt="Explain schema with AI"
  src="images/docs/console/explain-schema.webp"
  width={381}
  height={193}
  shadow={false}
/>

### Chat interface

The chat window provides a complete conversation interface:

- **Header**: Shows the conversation name with action buttons
- **Messages**: Displays the conversation between you and the AI. Responses stream in as they are generated.
- **Input Area**: Text area for submitting your questions, with a context badge showing the connected entity

SQL code blocks in responses include copy and **Open in editor** buttons. If a message fails, you can retry it from the error message.

:::info
Chats are connected to a single query to improve response accuracy. The context badge in the input area shows which query or table the conversation is focused on. You can click on the context badge to see the related query in the editor.
:::

### Managing conversations

- **Create a new chat**: Click the **+** button in the chat header
- **View chat history**: Click the history icon in the chat header to see all past chats

<Screenshot
  alt="Chat history view"
  src="images/docs/console/chat-history.webp"
  width={315}
  height={371}
/>

Chats are displayed in a timeline. You can:

- **Rename a chat**: Click the edit icon next to a conversation name
- **Delete a chat**: Click the delete icon next to a conversation
- **Search chats**: Use the text input to search conversations by name

Each [notebook](/docs/getting-started/web-console/notebooks/overview) also has its own conversation, opened with the **Build with AI** button on the notebook toolbar.

### Quick actions

When opening a chat for a query with no conversation history, quick actions are available:

<Screenshot
  alt="Empty chat window showing Explain Query button"
  src="images/docs/console/quick-actions.webp"
  width={500}
  height={316}
/>

- **Explain Query**: Provides an explanation of the query logic
- **Fix Query**: Appears when a query has an execution error. The AI Assistant analyzes the error and suggests a corrected version.

### SQL suggestions

The AI Assistant can provide query suggestions when you prompt it to generate, refine, or fix a query. A diff editor is shown when a query is suggested:

<Screenshot
  alt="AI suggestion showing diff view with original and modified SQL"
  src="images/docs/console/ai-query-suggestion.webp"
  width={500}
  height={624}
/>

The diff editor provides several actions:

- **Run**: Execute the suggested query using the Run icon in the header. While the query runs, the same button cancels it.
- **Accept**: Apply the suggestion and mark it as accepted. The AI Assistant uses accepted queries as the basis for future suggestions.
- **Reject**: Reject the suggestion and notify the model
- **Apply to Editor**: Insert the suggestion into your editor. Available for all queries in the history.
- **Open in editor**: Expand the diff view to a full editor tab where you can accept or reject the suggestion

### Status indicators

The AI Assistant shows its reasoning process in expandable sections. You can investigate the reviewed documentation and tables by expanding individual status indicators. Reasoning and tool calls appear in the order they happened, and are kept in the conversation history.

### Aborting generation

Click the red stop button during AI operations to cancel the current response. The conversation and message history are preserved, and you can continue the conversation or start a new operation.

## Working with notebooks

The Assistant builds and edits
[notebooks](/docs/getting-started/web-console/notebooks/overview) directly.
**Build with AI** on the notebook toolbar opens a chat bound to that notebook,
and each notebook keeps its own conversation. From a prompt, the Assistant can
add SQL and markdown cells, run them, draw charts with any of the
[nine chart types](/docs/getting-started/web-console/notebooks/charts), arrange
the grid layout, and set auto-refresh. A request like "build a live dashboard
for BTC-USDT trades over the last hour" produces a working
[live dashboard](/docs/getting-started/web-console/notebooks/live-dashboards).

Notebook building works at every
[permission level](#setting-up-model-preferences): the Assistant can always
author and arrange cells, and read-only cells it runs render their results in
your console without the rows being sent to the provider.

## Tips for using the AI Assistant

- Keep conversations focused on a single query or table for better contextual accuracy
- Use the Explain feature to understand complex SQL patterns and QuestDB-specific syntax
- Use the Fix feature when queries fail to get immediate troubleshooting assistance
- Select at least the **Schema access** permission level for more accurate suggestions about your specific tables
- Rename conversations with descriptive titles for easier navigation in history
- Review AI suggestions carefully before accepting them into your editor

## Privacy and data security

### Data flow

Queries and conversation context are sent directly from your browser to your chosen AI provider. QuestDB does not receive, store, or process your conversations.

:::info
Web Console does not send any data to a model provider unless a provider is configured explicitly by the user.
:::

### Bring your own key (BYOK)

Your API keys and conversations are stored in your browser. They are never transmitted to QuestDB servers and remain under your complete control.

You can edit or remove your API keys at any time through the Settings modal. Keys are sent only to your chosen AI provider when you make requests.

### Schema vs data

The **Schema access** permission level grants the AI visibility to your database structure (table names, column names, data types) but never includes actual data records or values from your tables. Your data is shared with a provider only when you explicitly select the **Read** or **Write** permission level.

You control the permission level independently for each provider. With schema access, the AI only sees metadata about your database structure, not the data itself.

Different AI providers have different data handling practices. Consult your provider's documentation to understand their data retention, usage, and privacy policies.
