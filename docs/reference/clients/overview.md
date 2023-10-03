---
title: Client Libraries
description: Introducing QuestDB Client Libraries for different languages
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

Current Client Libraries only
[implement InfluxDB Line Protocol](/docs/reference/api/ilp/overview/) for now.
They are suitable only for data ingestion. Follow this
[guide for querying data](/docs/develop/query-data/).

InfluxDB Line Protocol Client Libraries allow fast data ingestion while
abstracting you away from the details of the wire protocol. It's the recommended
way to ingest data into QuestDB. Clients also support authentication and TLS
encryption.

<ILPClientsTable />

For other languages, we have examples and a
[protocol reference](/docs/reference/api/ilp/overview). Please
[let us know](https://github.com/questdb/questdb/issues/new/) if you cannot find
a client for your favourite language!

:::note InfluxDB Line Protocol clients are for data ingestion only. You cannot
use a client to query database. If you are looking for ways to query QuestDB
then see [this page](/docs/develop/query-data/). :::
