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

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more info.

## Basic Insert

Example: inserting executed trades for cryptocurrencies.

Without authentication and using the current timestamp:

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/v3"
)

func main() {
	ctx := context.TODO()

	client, err := questdb.LineSenderFromConf(ctx, "http::addr=localhost:9000;")
	if err != nil {
		panic("Failed to create client")
	}

	err = client.Table("trades").
		Symbol("symbol", "ETH-USD").
		Symbol("side", "sell").
		Float64Column("price", 2615.54).
		Float64Column("amount", 0.00044).
		AtNow(ctx)

	if err != nil {
		panic("Failed to insert data")
	}

	err = client.Flush(ctx)
	if err != nil {
		panic("Failed to flush data")
	}
}
```

In this case, the designated timestamp will be the one at execution time. Let's see now an example with an explicit timestamp, custom auto-flushing, and basic auth.

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/v3"
	"time"
)

func main() {
	ctx := context.TODO()

	client, err := questdb.LineSenderFromConf(ctx, "http::addr=localhost:9000;username=admin;password=quest;auto_flush_rows=100;auto_flush_interval=1000;")
	if err != nil {
		panic("Failed to create client")
	}

	timestamp := time.Now()
	err = client.Table("trades").
		Symbol("symbol", "ETH-USD").
		Symbol("side", "sell").
		Float64Column("price", 2615.54).
		Float64Column("amount", 0.00044).
		At(ctx, timestamp)

	if err != nil {
		panic("Failed to insert data")
	}

	err = client.Flush(ctx)
	// You can flush manually at any point.
	// If you don't flush manually, the client will flush automatically
	// when a row is added and either:
	//   * The buffer contains 75000 rows (if HTTP) or 600 rows (if TCP)
	//   * The last flush was more than 1000ms ago.
	// Auto-flushing can be customized via the `auto_flush_..` params.

	if err != nil {
		panic("Failed to flush data")
	}
}
```
We recommended to use User-assigned timestamps when ingesting data into QuestDB.
Using Server-assigned hinder the ability to deduplicate rows which is
[important for exactly-once processing](/docs/clients/java_ilp/#exactly-once-delivery-vs-at-least-once-delivery).

## Configuration options

The minimal configuration string needs to have the protocol, host, and port, as in:

```
http::addr=localhost:9000;
```

For all the extra options you can use, please check [the client docs](https://pkg.go.dev/github.com/questdb/go-questdb-client/v3#LineSenderFromConf)


## Limitations

### Transactionality

The Go client does not support full transactionality:

- Data for the first table in an HTTP request will be committed even if the
  second table's commit fails.
- An implicit commit occurs each time a new column is added to a table. This
  action cannot be rolled back if the request is aborted or encounters parse
  errors.

### Timestamp column

QuestDB's underlying ILP protocol sends timestamps to QuestDB without a name.

If your table has been created beforehand, the designated timestamp will be correctly
assigned based on the information provided using `At`. But if your table does not
exist, it will be automatically created and the timestamp column will be named
`timestamp`. To use a custom name, say `my_ts`, pre-create the table with the desired
timestamp column name:

```questdb-sql title="Creating a timestamp named my_ts"
CREATE TABLE IF NOT EXISTS 'trades' (
  symbol SYMBOL capacity 256 CACHE,
  side SYMBOL capacity 256 CACHE,
  price DOUBLE,
  amount DOUBLE,
  my_ts TIMESTAMP
) timestamp (my_ts) PARTITION BY DAY WAL;
```

You can use the `CREATE TABLE IF NOT EXISTS` construct to make sure the table is
created, but without raising an error if the table already existed.


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
