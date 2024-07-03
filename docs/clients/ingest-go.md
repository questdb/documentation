---
title: Go Client Documentation
description:
  "Dive into QuestDB using the Go ingestion client for high-performance,
  insert-only operations. Unlock peak time series data ingestion."
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB supports the Go ecosystem, offering a Go client designed for
high-performance data ingestion, tailored specifically for insert-only
operations. This combination of QuestDB and its Go client provides exceptional
time series data ingestion and analytical capabilities.

The Go client introduces several advantages:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

This quick start guide will help you get up and running with the basic
functionalities of the Go client, covering connection setup, authentication, and
some common insert patterns.

<ILPClientsTable language="Golang" />

## Requirements

- Requires Go 1.19 or later.
- Assumes QuestDB is running. If it's not, refer to
  [the general quick start](/docs/quick-start/).

## Client Installation

To add the QuestDB client to your Go project:

```toml
go get github.com/questdb/go-questdb-client/v3
```

## Authentication

Passing in a configuration string with HTTP basic authentication:

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/v3"
)

func main() {
	ctx := context.TODO()

	client, err := questdb.LineSenderFromConf(ctx, "http::addr=localhost:9000;username=admin;password=quest;")
	if err != nil {
		panic("Failed to create client")
	}

	// Utilize the client for your operations...
}
```

Or, set the QDB_CLIENT_CONF environment variable and call
`questdb.LineSenderFromEnv()`.

1. Export the configuration string as an environment variable:
   ```bash
   export QDB_CLIENT_CONF="addr=localhost:9000;username=admin;password=quest;"
   ```
2. Then in your Go code:
   ```Go
   client, err := questdb.LineSenderFromEnv(context.TODO())
   ```

## Basic Insert

Example: inserting data from a temperature sensor.

Without authentication:

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/v3"
	"time"
)

func main() {
	ctx := context.TODO()

	client, err := questdb.LineSenderFromConf(ctx, "http::addr=localhost:9000;")
	if err != nil {
		panic("Failed to create client")
	}

	timestamp := time.Now()
	err = client.Table("sensors").
		Symbol("id", "toronto1").
		Float64Column("temperature", 20.0).
		Float64Column("humidity", 0.5).
		At(ctx, timestamp)

	if err != nil {
		panic("Failed to insert data")
	}

	err = client.Flush(ctx)
	if err != nil {
		panic("Failed to flush data")
	}
}
```

## Limitations

### Transactionality

The Go client does not support full transactionality:

- Data for the first table in an HTTP request will be committed even if the
  second table's commit fails.
- An implicit commit occurs each time a new column is added to a table. This
  action cannot be rolled back if the request is aborted or encounters parse
  errors.

### Timestamp column

QuestDB's underlying InfluxDB Line Protocol (ILP) does not name timestamps,
leading to an automatic column name of timestamp. To use a custom name,
pre-create the table with the desired timestamp column name:

```sql
CREATE TABLE temperatures (
    ts timestamp,
    sensorID symbol,
    sensorLocation symbol,
    reading double
) timestamp(my_ts);
```

## Health check

To monitor your active connection, there is a `ping` endpoint:

```shell
curl -I http://localhost:9000/ping
```

Returns (pong!):

```shell
HTTP/1.1 204 OK
Server: questDB/1.0
Date: Fri, 2 Feb 2024 17:09:38 GMT
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
X-Influxdb-Version: v2.7.4
```

Determine whether an instance is active and confirm the version of InfluxDB Line
Protocol with which you are interacting.

## Next Steps

Explore the full capabilities of the Go client via
[Go.dev](https://pkg.go.dev/github.com/questdb/go-questdb-client/v3).

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.io/).
