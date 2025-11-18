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

:::info

This page focuses on our high-performance ingestion client, which is optimized for **writing** data to QuestDB.
For retrieving data, we recommend using a [PostgreSQL-compatible Go library](/docs/pgwire/go/) or our
[HTTP query endpoint](/docs/reference/sql/overview/#rest-http-api).

:::

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
	"github.com/questdb/go-questdb-client/v4"
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
       qdb "github.com/questdb/go-questdb-client/v4"
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
	"github.com/questdb/go-questdb-client/v4"
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
	"github.com/questdb/go-questdb-client/v4"
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

## Decimal insertion

:::note
Decimals are available when ILP protocol version 3 is active (QuestDB 9.2.0+, go-questdb-client v4.1.0+). The HTTP sender
negotiates v3 automatically; with TCP add `protocol_version=3;` to the configuration string.
:::

:::caution
Create the target decimal columns ahead of ingestion with an explicit `DECIMAL(precision, scale)`
definition so QuestDB knows how many digits to keep. See the
[decimal data type](/docs/concept/decimal/#creating-tables-with-decimals) page for details on
precision and scale.
:::

QuestDB decimal columns accept either validated string literals or pre-scaled binary payloads. The text path keeps things simple and lets the server parse the literal while preserving the scale you send:

```go
err = sender.
	Table("quotes").
	Symbol("ccy_pair", "EURUSD").
	DecimalColumnFromString("mid", "1.234500").
	AtNow(ctx)
```

`DecimalColumnFromString` checks the literal (digits, optional sign, decimal point, exponent, `NaN`/`Infinity`) and appends the d suffix that the ILP parser expects, so the value above lands with scale = 6.

For full control or when you already have a fixed-point value, build a `questdb.Decimal` and use the binary representation. The helpers keep you inside QuestDB’s limits (scale ≤ 76, unscaled payload ≤ 32 bytes) and avoid server-side parsing:

```go
price := qdb.NewDecimalFromInt64(12345, 2) // 123.45 with scale 2
commission, err := qdb.NewDecimal(big.NewInt(-750), 4)
if err != nil {
	log.Fatal(err)
}

err = sender.
	Table("trades").
	Symbol("symbol", "ETH-USD").
	DecimalColumn("price", price).
	DecimalColumn("commission", commission).
	AtNow(ctx)
```

If you already hold a two’s complement big-endian mantissa (for example, from another fixed-point library) call `NewDecimalUnsafe(rawBytes, scale)`, passing nil encodes a NULL and the client skips the field.

The client also understands [github.com/shopspring/decimal](https://github.com/shopspring/decimal) values:

```go
dec := decimal.NewFromFloat(2615.54)
err = sender.
	Table("trades").
	DecimalColumnShopspring("price", dec).
	AtNow(ctx)
```

`DecimalColumnShopspring` converts the coefficient/exponent pair into the same binary payload, so you can reuse existing business logic while still benefiting from precise wire formatting.

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
