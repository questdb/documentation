---
title: qStudio
description: Guide for querying QuestDB using qStudio
---

import Screenshot from "@theme/Screenshot"

[qStudio](https://www.timestored.com/qstudio/) is a free SQL GUI. It allows to
run SQL scripts, browse tables easily, chart and export results.

qStudio includes charting functionality including time-series charting which is
particularly useful with QuestDB. It works on every operating system and with
every database including QuestDB via the PostgreSQL driver.

## Prerequisites

- A running QuestDB instance (See [Getting Started](/docs/#getting-started))

## Configure QuestDB connection

1. [Download qStudio](https://www.timestored.com/qstudio/download) for your OS
2. Launch qStudio
3. Go to `Server` -> `Add Server`
4. Click `Add data source`
5. Choose the `PostgreSQL` plugin and configure it with the following settings:

   ```
   host:localhost
   port:8812
   database:qdb
   user:admin
   password:quest
   ```

## Sending Queries

Run queries with:

- <kbd>Ctrl+Enter</kbd> to run the current line, or
- <kbd>Ctrl+E</kbd> to run the highlighted code.

export const screenshotTitle =
  "Screenshot of the qStudio UI running QuestDB query"

<Screenshot
  alt={screenshotTitle}
  title={screenshotTitle}
  src="/img/guides/qstudio/qstudio-query.png"
  width={820}
  height={460}
/>

## See also

- [QuestDB Postgres wire protocol](/docs/reference/api/postgres/)
