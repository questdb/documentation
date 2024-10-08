---
title: Redpanda Connect (Benthos) Component
description:
    Redpanda Connect, formerly known as Benthos, ships with a QuestDB
    output component that can be used as a sink for your stream processing data
---

import Screenshot from "@theme/Screenshot"

## Integration guide

This guide shows the steps to use the QuestDB Kafka connector to read JSON data
from Kafka topics and write them as rows into a QuestDB table. For Confluent
users, please check the instructions in the
[Confluent Docker images](https://github.com/questdb/kafka-questdb-connector/tree/main/kafka-questdb-connector-samples/confluent-docker-images).

### Prerequisites

You will need the following:

- [Redpanda Connect](https://docs.redpanda.com/redpanda-connect/about/)
- A running QuestDB instance

### Download Redpanda Connect

The QuestDB output component was added to Redpanda Connect in version X.X.X

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

Run the following command to send some messages over Influx Line Protocol to QuestDB through Redpanda Connect

```bash
echo '{"symbol": "AAPL", "price": 225.83, "timestamp": 1727294094}
{"symbol": "MSFT", "price": 431.78, "timestamp": 1727294142}` | rpk connect run config.yaml
```

### Verify the integration

Navigate to the QuestDB Web Console at http://localhost:9000 and run the following query to see your data:

```sql
SELECT *
FROM redpanda_connect_demo
```