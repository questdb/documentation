---
title: LLM Coding Assistants
sidebar_label: LLM Coding Assistants
description:
  Use LLM-powered coding assistants like Claude Code or OpenAI Codex to build applications, write queries, and work with QuestDB using natural language.
---

LLM-powered coding assistants like <a href="https://claude.ai/code" target="_blank">Claude Code</a> and <a href="https://openai.com/index/openai-codex/" target="_blank">OpenAI Codex</a> can help you build applications that use QuestDB.

These tools work with QuestDB out of the box. The REST API is useful for connecting, interacting with the web console, and prototyping queries via HTTP. For production workloads, ingestion is done via the official QuestDB clients and queries via the PostgreSQL wire protocol (PGWire).

## Try it with Claude Code

No setup required. Use the public QuestDB demo with Claude Code:

```
You: "Use QuestDB's REST API at https://demo.questdb.io/ to list all tables"

Claude Code: [Queries /exec endpoint and lists available tables including trades]

You: "Query the trades table and show me the last 10 trades. Data is time-ordered natively, no ORDER BY needed"

Claude Code: [Sends SQL via HTTP: SELECT * FROM trades LIMIT -10]

You: "What's the total volume traded per symbol, sampled by 1 hour? Use SAMPLE BY"

Claude Code: [Writes and executes SAMPLE BY 1h query grouped by symbol]

You: "Plot the price of BTC-USD over the last 30 days"

Claude Code: [Queries data and generates a chart using matplotlib]
```

## Connect to your own QuestDB

1. Install Claude Code: https://claude.ai/code
2. Start QuestDB (default port 9000)
3. Ask Claude Code to connect and explore

```
You: "Connect to my QuestDB at localhost:9000 and show me what tables I have"

Claude Code: I'll query the QuestDB REST API to list your tables.
[Executes curl command and shows results]
```

## Tips

- **Provide context** - Tell the assistant about your use case, data volume, and
  requirements
- **Ask follow-up questions** - Most assistants remember context within a session
- **Request explanations** - Ask "why?" to understand recommendations
- **Iterate on code** - Ask the assistant to modify or improve generated code

## Next steps

- [REST API reference](/docs/query/rest-api/) - API documentation
- [SQL overview](/docs/query/overview/) - QuestDB SQL syntax
- [Client libraries](/docs/ingestion/overview/) - Official client libraries
- [Sample datasets](https://github.com/questdb/sample-datasets) - Example data
  to try
