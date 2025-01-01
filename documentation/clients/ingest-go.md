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
go get github.com/questdb/go-questdb-client/
```

## Authentication

Passing in a configuration string with HTTP basic authentication:

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/"
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
   export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
   ```
2. Then in your Go code:
   ```Go
   client, err := questdb.LineSenderFromEnv(context.TODO())
   ```

Alternatively, you can use the built-in Go API to specify the connection
options.

```go
package main

import (
       "context"
       qdb "github.com/questdb/go-questdb-client/"
)


func main() {
       ctx := context.TODO()

       client, err := qdb.NewLineSender(context.TODO(), qdb.WithHttp(), qdb.WithAddress("localhost:9000"), qdb.WithBasicAuth("admin", "quest"))
```

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more
info.

## Basic Insert

Example: inserting executed trades for cryptocurrencies.

Without authentication and using the current timestamp:

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/"
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

In this case, the designated timestamp will be the one at execution time. Let's
see now an example with an explicit timestamp, custom auto-flushing, and basic
auth.

```Go
package main

import (
	"context"
	"github.com/questdb/go-questdb-client/"
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
Using the current timestamp hinder the ability to deduplicate rows which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

## Configuration options

The minimal configuration string needs to have the protocol, host, and port, as
in:

```
http::addr=localhost:9000;
```

In the Go client, you can set the configuration options via the standard config
string, which is the same across all clients, or using
[the built-in API](https://pkg.go.dev/github.com/questdb/go-questdb-client/#LineSenderOption).

For all the extra options you can use, please check
[the client docs](https://pkg.go.dev/github.com/questdb/go-questdb-client/#LineSenderFromConf)

Alternatively, for a breakdown of Configuration string options available across
all clients, see the [Configuration string](/docs/configuration-string/) page.

## Next Steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
about transactions, error control, delivery guarantees, health check, or table
and column auto-creation.

Explore the full capabilities of the Go client via
[Go.dev](https://pkg.go.dev/github.com/questdb/go-questdb-client/).

With data flowing into QuestDB, now it's time to for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.com/).
