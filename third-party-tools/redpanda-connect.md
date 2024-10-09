---
title: Redpanda Connect (Benthos)
description: Redpanda Connect, formerly known as Benthos, ships with a QuestDB
  output component that can be used as a sink for your stream processing data
---

import Screenshot from "@theme/Screenshot"

## Integration guide

Redpanda Connect is a stream processing tool that can be used to build data pipelines.
It's a lightweight alternative to [Apache Kafka Connect](/docs/third-party-tools/kafka/questdb-kafka/).
This guide shows the steps to use the Redpanda Connect to write JSON data
as rows into a QuestDB table. 

### Prerequisites

You will need the following:

- [Redpanda Connect](https://docs.redpanda.com/redpanda-connect/about/)
- A running QuestDB instance

### Download Redpanda Connect

The QuestDB output component was added to Redpanda Connect in version v4.37.0.

To download the latest version of Redpanda Connect, follow the [installation instructions](https://docs.redpanda.com/redpanda-connect/guides/getting_started/#install) in the official documentation.

### Configure Redpanda Connect

One of Redpanda Connect's strengths is the ability to configure an entire data pipeline in a single
yaml file. We will create a simple configuration to demonstrate the QuestDB connector's capabilities
by using a straightforward input source.

Create this file and name it `config.yaml` in your current directory

```yaml
input:
  stdin: {}

output:
  questdb:
    address: localhost:9000
    table: redpanda_connect_demo
    doubles:
      - price
    designated_timestamp_field: timestamp
```

This configuration will read lines from stdin and publish them to your running QuestDB instance

### Run Redpanda Connect and publish messages

Run the following command to send some messages to QuestDB through Redpanda Connect

```bash
echo \
'{"symbol": "AAPL", "price": 225.83, "timestamp": 1727294094}
{"symbol": "MSFT", "price": 431.78, "timestamp": 1727294142}' \
| rpk connect run config.yaml
```

The command above sends two JSON messages to Redpanda Connect standard input, which then writes them to QuestDB.

### Verify the integration

Navigate to the QuestDB Web Console at http://localhost:9000 and run the following query to see your data:

```sql
SELECT *
FROM redpanda_connect_demo
```

### Next steps

Explore Redpanda Connect's [official documentation](https://docs.redpanda.com/redpanda-connect/about/) to learn more
about its capabilities and how to use it in your projects.