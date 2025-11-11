---
title: C & C++ Client Documentation
description:
  "Dive into QuestDB using the C & C++ ingestion client for high-performance,
  insert-only operations. Unlock peak time series data ingestion."
test: "foo"
---

import { ILPClientsTable } from "@theme/ILPClientsTable"

QuestDB supports the C & C++ programming languages, providing a high-performance
ingestion client tailored for insert-only operations. This integration ensures
peak efficiency in time series data ingestion and analysis, perfectly suited for
systems which require top performance and minimal latency.

Key features of the QuestDB C & C++ client include:

- **Automatic table creation**: No need to define your schema upfront.
- **Concurrent schema changes**: Seamlessly handle multiple data streams with
  on-the-fly schema modifications
- **Optimized batching**: Use strong defaults or curate the size of your batches
- **Health checks and feedback**: Ensure your system's integrity with built-in
  health monitoring
- **Automatic write retries**: Reuse connections and retry after interruptions

### Requirements

- Requires a C/C++ compiler and standard libraries.
- Assumes QuestDB is running. If it's not, refer to
  [the general quick start](/docs/quick-start/).

### Client Installation

You need to add the client as a dependency to your project. Depending on your
environment, you can do this in different ways. Please check the documentation
at the
[client's repository](https://github.com/questdb/c-questdb-client/blob/main/doc/DEPENDENCY.md).

## C++

:::note

This section is for the QuestDB C++ client.

For the QuestDB C Client, see the below seciton.

:::

<ILPClientsTable language="C++" />

Explore the full capabilities of the C++ client via the
[C++ README](https://github.com/questdb/c-questdb-client/blob/main/doc/CPP.md).

## Authentication

The QuestDB C++ client supports basic connection and authentication
configurations.

Here is an example of how to configure and use the client for data ingestion:

```c
#include <questdb/ingress/line_sender.hpp>

...

auto sender = questdb::ingress::line_sender::from_conf(
    "http::addr=localhost:9000;");
```

You can also pass the connection configuration via the `QDB_CLIENT_CONF`
environment variable:

```bash
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

Then you use it like this:

```cpp
auto sender = questdb::ingress::line_sender::from_env();
```

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more
info.

### Basic data insertion

Basic insertion (no-auth):

```cpp
// main.cpp
#include <questdb/ingress/line_sender.hpp>

int main()
{
    auto sender = questdb::ingress::line_sender::from_conf(
        "http::addr=localhost:9000;");

    questdb::ingress::line_sender_buffer buffer;
    buffer
        .table("trades")
        .symbol("symbol","ETH-USD")
        .symbol("side","sell")
        .column("price", 2615.54)
        .column("amount", 0.00044)
        .at(questdb::ingress::timestamp_nanos::now());

    // To insert more records, call `buffer.table(..)...` again.

    sender.flush(buffer);
    return 0;
}
```

These are the main steps it takes:

- Use `questdb::ingress::line_sender::from_conf` to get the `sender` object
- Populate a `Buffer` with one or more rows of data
- Send the buffer using `sender.flush()`(`Sender::flush`)

In this case, we call `at()`, with the current timestamp.

Let's see now an example with explicit timestamps, custom timeout, basic auth,
and error control.

```cpp
#include <questdb/ingress/line_sender.hpp>
#include <iostream>
#include <chrono>

int main()
{
    try
    {
        // Create a sender using HTTP protocol
        auto sender = questdb::ingress::line_sender::from_conf(
            "http::addr=localhost:9000;username=admin;password=quest;retry_timeout=20000;");

        // Get the current time as a timestamp
        auto now = std::chrono::system_clock::now();
        auto duration = now.time_since_epoch();
        auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(duration).count();

        // Add rows to the buffer of the sender with the same timestamp
        questdb::ingress::line_sender_buffer buffer;
        buffer
            .table("trades")
            .symbol("symbol", "ETH-USD")
            .symbol("side", "sell")
            .column("price", 2615.54)
            .column("amount", 0.00044)
            .at(questdb::ingress::timestamp_nanos(nanos));

        buffer
            .table("trades")
            .symbol("symbol", "BTC-USD")
            .symbol("side", "sell")
            .column("price", 39269.98)
            .column("amount", 0.001)
            .at(questdb::ingress::timestamp_nanos(nanos));

        // Transactionality check
        if (!buffer.transactional()) {
            std::cerr << "Buffer is not transactional" << std::endl;
            sender.close();
            return 1;
        }

        // Flush and clear the buffer, sending the data to QuestDB
        sender.flush(buffer);

        // Close the connection after all rows ingested
        sender.close();
        return 0;
    }
    catch (const questdb::ingress::line_sender_error& err)
    {
        std::cerr << "Error running example: " << err.what() << std::endl;
        return 1;
    }
}
```

Now, both events use the same timestamp. We recommend using the event's
original timestamp when ingesting data into QuestDB. Using ingestion-time
timestamps precludes the ability to deduplicate rows, which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

### Array Insertion

QuestDB can accept N-dimensional arrays. For now these are limited to the
`double` element type. The easiest way is to insert an `std::array`, but the
database can also support `std::vector`, `std::span` (C++20) and additional
custom array types via a [customization point](https://github.com/questdb/c-questdb-client/blob/main/examples/line_sender_cpp_example_array_custom.cpp).

The customization point can be used to integrate your own (or third party)
n-dimensional array types by providing `shape` and, optionally if not row-major,
`strides`.

Please refer to the [Concepts section on n-dimensional arrays](/docs/concept/array),
where this is explained in more detail.

:::note
Arrays are supported from QuestDB version 9.0.0, and require updated
client libraries.
:::

In this example, we insert some FX order book data.
* `bids` and `asks`: 2D arrays of L2 order book depth. Each level contains price and volume.
* `bids_exec_probs` and `asks_exec_probs`: 1D arrays of calculated execution probabilities for the next minute.

```cpp
#include <questdb/ingress/line_sender.hpp>
#include <iostream>
#include <vector>
#include <array>

using namespace std::literals::string_view_literals;
using namespace questdb::ingress::literals;

struct tensor {
    std::vector<double> data;
    std::vector<uintptr_t> shape;
};

// Customization point for the QuestDB array API (discovered via ADL lookup)
inline auto to_array_view_state_impl(const tensor& t)
{
    return questdb::ingress::array::row_major_view<double>{
        t.shape.size(), // rank
        t.shape.data(), // shape
        t.data.data(), t.data.size() // array data
    };
}

int main()
{
    try
    {
        auto sender = questdb::ingress::line_sender::from_conf(
            "http::addr=127.0.0.1:9000;");

        questdb::ingress::line_sender_buffer buffer = sender.new_buffer();

        buffer
            .table("fx_order_book"_tn)
            .symbol("symbol"_cn, "EUR/USD"_utf8)
            .column("bids"_cn, tensor{
                {
                    1.0850, 600000,
                    1.0849, 300000,
                    1.0848, 150000
                },
                {3, 2}
            })
            .column("asks"_cn, tensor{
                {
                    1.0853, 500000,
                    1.0854, 250000,
                    1.0855, 125000
                },
                {3, 2}
            })
            .column("bids_exec_probs"_cn, std::array<double, 3>{
                0.85, 0.50, 0.25})
            .column("asks_exec_probs"_cn, std::vector<double>{
                0.90, 0.55, 0.20})
            .at(questdb::ingress::timestamp_nanos::now());

        sender.flush(buffer);
        return true;
    }
    catch (const questdb::ingress::line_sender_error& err)
    {
        std::cerr << "[ERROR] " << err.what() << std::endl;
        return false;
    }
}
```

If your type also supports strides, use the
`questdb::ingress::array::strided_view` instead.

:::note
The example above uses ILP/HTTP. If instead you're using ILP/TCP you'll need
to explicity opt into the newer protocol version 2 that supports sending arrays.

```
tcp::addr=127.0.0.1:9009;protocol_version=2;
```

Protocol Version 2 along with its support for arrays is available from QuestDB
version 9.0.0.
:::

### Decimal insertion

:::note
Decimals are supported from QuestDB version 9.3.0, and require updated
client libraries.
:::

Decimals can be written either as strings or in the binary ILP format. Import
the decimal literals (`using namespace questdb::ingress::decimal;`) and send a
validated UTF-8 string when you want QuestDB to parse the value for you:

```cpp
buffer.column("price"_cn, "2615.54"_decimal);
```

When you already have a fixed-point representation, construct a
`questdb::ingress::decimal::decimal_view` with the column scale (digits to the
right of the decimal point) and the unscaled value encoded as big-endian two's
complement bytes. This preserves full precision and lets you reach the protocol
limits (scale ≤ 76, mantissa ≤ 32 bytes):

```cpp
const uint8_t price_unscaled[] = {123};      // 12.3 -> scale 1, unscaled 123
auto price_value = questdb::ingress::decimal::decimal_view(1, price_unscaled);
buffer.column("price"_cn, price_value);
```

For custom fixed-point types, provide a `to_decimal_view_state_impl` overload
that returns a struct exposing `.view()` so the sender can transform it into a
`decimal_view`.

You can find more examples in the [c-questdb-client repository](https://github.com/questdb/c-questdb-client/tree/main/examples).


## C

:::note

This section is for the QuestDB C client.

Skip to the bottom of this page for information relating to both the C and C++
clients.

:::

<ILPClientsTable language="C" />

Explore the full capabilities of the C client via the
[C README](https://github.com/questdb/c-questdb-client/blob/main/doc/C.md).

### Connection

The QuestDB C client supports basic connection and authentication
configurations. Here is an example of how to configure and use the client for
data ingestion:

```c
#include <questdb/ingress/line_sender.h>

...

line_sender_utf8 conf = QDB_UTF8_LITERAL(
    "http::addr=localhost:9000;");

line_sender_error *error = NULL;
line_sender *sender = line_sender_from_conf(
    line_sender_utf8, &error);
if (!sender) {
    /* ... handle error ... */
}
```

You can also pass the connection configuration via the `QDB_CLIENT_CONF`
environment variable:

```bash
export QDB_CLIENT_CONF="http::addr=localhost:9000;username=admin;password=quest;"
```

Then you use it like this:

```c
#include <questdb/ingress/line_sender.h>
...
line_sender *sender = line_sender_from_env(&error);
```

### Basic data insertion

```c
// line_sender_trades_example.c
#include <questdb/ingress/line_sender.h>
#include <stdio.h>
#include <stdint.h>

int main() {
    // Initialize line sender
    line_sender_error *error = NULL;
    line_sender *sender = line_sender_from_conf(
        QDB_UTF8_LITERAL("http::addr=localhost:9000;username=admin;password=quest;"), &error);

    if (error != NULL) {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Failed to create line sender: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        return 1;
    }

    // Print success message
    printf("Line sender created successfully\n");

    // Initialize line sender buffer
    line_sender_buffer *buffer = line_sender_buffer_new();
    if (buffer == NULL) {
        fprintf(stderr, "Failed to create line sender buffer\n");
        line_sender_close(sender);
        return 1;
    }

    // Add data to buffer for ETH-USD trade
    if (!line_sender_buffer_table(buffer,
        QDB_TABLE_NAME_LITERAL("trades"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("symbol"), QDB_UTF8_LITERAL("ETH-USD"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("amount"), 0.00044, &error)) goto error;
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
        goto on_error;

    // Flush the buffer to QuestDB
    if (!line_sender_flush(sender, buffer, &error)) {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Failed to flush data: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        line_sender_buffer_free(buffer);
        line_sender_close(sender);
        return 1;
    }

    // Print success message
    printf("Data flushed successfully\n");

    // Free resources
    line_sender_buffer_free(buffer);
    line_sender_close(sender);

    return 0;

error:
    {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Error: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        line_sender_buffer_free(buffer);
        line_sender_close(sender);
        return 1;
    }
}
```

In this case, we call `line_sender_buffer_at_nanos()` and pass the current
timestamp. The value returned by `line_sender_now_nanos()` is nanoseconds
from unix epoch (UTC).

Let's see now an example with timestamps, custom timeout, basic auth, error
control, and transactional awareness.

```c
// line_sender_trades_example.c
#include <questdb/ingress/line_sender.h>
#include <stdio.h>
#include <time.h>
#include <stdint.h>

int main() {
    // Initialize line sender
    line_sender_error *error = NULL;
    line_sender *sender = line_sender_from_conf(
        QDB_UTF8_LITERAL(
          "http::addr=localhost:9000;username=admin;password=quest;retry_timeout=20000;"
          ), &error);

    if (error != NULL) {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Failed to create line sender: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        return 1;
    }

    // Print success message
    printf("Line sender created successfully\n");

    // Initialize line sender buffer
    line_sender_buffer *buffer = line_sender_buffer_new();
    if (buffer == NULL) {
        fprintf(stderr, "Failed to create line sender buffer\n");
        line_sender_close(sender);
        return 1;
    }

    // Get current time in nanoseconds
    int64_t nanos = line_sender_now_nanos();

    // Add data to buffer for ETH-USD trade
    if (!line_sender_buffer_table(buffer,
        QDB_TABLE_NAME_LITERAL("trades"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("symbol"), QDB_UTF8_LITERAL("ETH-USD"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("amount"), 0.00044, &error))
        goto error;
    if (!line_sender_buffer_at_nanos(buffer, nanos, &error))
        goto error;

    // Add data to buffer for BTC-USD trade
    if (!line_sender_buffer_table(buffer,
        QDB_TABLE_NAME_LITERAL("trades"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("symbol"),
        QDB_UTF8_LITERAL("BTC-USD"), &error))
        goto error;
    if (!line_sender_buffer_symbol(buffer,
        QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("price"), 39269.98, &error))
        goto error;
    if (!line_sender_buffer_column_f64(buffer,
        QDB_COLUMN_NAME_LITERAL("amount"), 0.001, &error))
        goto error;
    if (!line_sender_buffer_at_nanos(buffer, nanos, &error))
        goto error;

    // If we detect multiple tables within the same buffer, we abort to avoid potential
    // inconsistency issues. Read below in this page for transaction details
    if (!line_sender_buffer_transactional(buffer)) {
        fprintf(stderr, "Buffer is not transactional\n");
        line_sender_buffer_free(buffer);
        line_sender_close(sender);
        return 1;
    }

    // Flush the buffer to QuestDB
    if (!line_sender_flush(sender, buffer, &error)) {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Failed to flush data: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        line_sender_buffer_free(buffer);
        line_sender_close(sender);
        return 1;
    }

    // Print success message
    printf("Data flushed successfully\n");

    // Free resources
    line_sender_buffer_free(buffer);
    line_sender_close(sender);

    return 0;

error:
    {
        size_t len;
        const char *msg = line_sender_error_msg(error, &len);
        fprintf(stderr, "Error: %.*s\n", (int)len, msg);
        line_sender_error_free(error);
        line_sender_buffer_free(buffer);
        line_sender_close(sender);
        return 1;
    }
}
```

Now, both events use the same timestamp. We recommend using the event's
original timestamp when ingesting data into QuestDB. Using ingestion-time
timestamps precludes the ability to deduplicate rows, which is
[important for exactly-once processing](/docs/reference/api/ilp/overview/#exactly-once-delivery-vs-at-least-once-delivery).

### Array Insertion

The sender uses a plain 1-dimensional C array to insert an array of any
dimensionality. It contains the elements laid out flat in row-major order.
The shape describes the rank and dimensions of the array.

:::note
Arrays are supported from QuestDB version 9.0.0, and require updated
client libraries.
:::

In this example,  we insert arrays of `double` values for some FX order book data.
* `bids` and `asks`: 2D arrays of L2 order book depth. Each level contains price and volume.
* `bids_exec_probs` and `asks_exec_probs`: 1D arrays of calculated execution probabilities for the next minute.

```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <questdb/ingress/line_sender.h>

int main()
{
    line_sender_error* err = NULL;
    line_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;

    // or "tcp::addr=127.0.0.1:9009;protocol_version=2;"
    const char* conf_str = "http::addr=127.0.0.1:9000;";

    line_sender_utf8 conf_str_utf8 = {0, NULL};
    if (!line_sender_utf8_init(
            &conf_str_utf8, strlen(conf_str), conf_str, &err))
        goto on_error;

    sender = line_sender_from_conf(conf_str_utf8, &err);
    if (!sender)
        goto on_error;

    buffer = line_sender_buffer_new_for_sender(sender);
    line_sender_buffer_reserve(buffer, 64 * 1024);

    line_sender_table_name table_name = QDB_TABLE_NAME_LITERAL("fx_order_book");
    line_sender_column_name symbol_col = QDB_COLUMN_NAME_LITERAL("symbol");
    line_sender_column_name bids_col = QDB_COLUMN_NAME_LITERAL("bids");
    line_sender_column_name asks_col = QDB_COLUMN_NAME_LITERAL("asks");

    if (!line_sender_buffer_table(buffer, table_name, &err))
        goto on_error;

    line_sender_utf8 symbol_val = QDB_UTF8_LITERAL("EUR/USD");
    if (!line_sender_buffer_symbol(buffer, symbol_col, symbol_val, &err))
        goto on_error;

    // bids: 3 rows (levels), 2 columns (price, volume)
    uintptr_t bids_rank = 2;
    uintptr_t bids_shape[] = {3, 2};
    double bids_data[] = {
        1.0850, 600000,
        1.0849, 300000,
        1.0848, 150000
    };

    if (!line_sender_buffer_column_f64_arr_c_major(
            buffer,
            bids_col,
            bids_rank,
            bids_shape,
            (const uint8_t*)bids_data,
            sizeof(bids_data),
            &err))
        goto on_error;

    // asks: 3 rows (levels), 2 columns (price, volume)
    uintptr_t asks_rank = 2;
    uintptr_t asks_shape[] = {3, 2};
    double asks_data[] = {
        1.0853, 500000,
        1.0854, 250000,
        1.0855, 125000
    };

    if (!line_sender_buffer_column_f64_arr_c_major(
            buffer,
            asks_col,
            asks_rank,
            asks_shape,
            (const uint8_t*)asks_data,
            sizeof(asks_data),
            &err))
        goto on_error;

    // Timestamp, leave as-is (similar to your example)
    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
        goto on_error;

    if (!line_sender_flush(sender, buffer, &err))
        goto on_error;

    line_sender_close(sender);
    return 0;

on_error:;
    size_t err_len = 0;
    const char* err_msg = line_sender_error_msg(err, &err_len);
    fprintf(stderr, "Error: %.*s\n", (int)err_len, err_msg);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    line_sender_close(sender);
    return 1;
}
```

If you need to specify strides, you can do this via either the 
`line_sender_buffer_column_f64_arr_byte_strides` or the
`line_sender_buffer_column_f64_arr_elem_strides` functions.

Please refer to the
[Concepts section on n-dimensional arrays](/docs/concept/array), where this is
explained in more detail.

### Decimal insertion

:::note
Decimals are supported from QuestDB version 9.3.0, and require updated
client libraries.
:::

:::caution
Create your decimal columns up front with `DECIMAL(precision, scale)` before ingesting values so
QuestDB knows the desired precision and scale. See the
[decimal data type](/docs/concept/decimal/#creating-tables-with-decimals) guide for details.
:::

QuestDB decimal columns can be populated in two ways. The simplest is to send a
validated UTF-8 decimal string, which the server parses and stores using the
column's precision:

```c
line_sender_utf8 price_value = QDB_UTF8_LITERAL("2615.54");
if (!line_sender_buffer_column_dec_str(buffer, price_name, price_value, &err))
    goto on_error;
```

For better performance you can format the unscaled value and send it in
binary form. Pass the column scale (digits to the right of the decimal point)
alongside the mantissa encoded as big-endian two's complement bytes. This
allows you to reach the full range supported by QuestDB (scale ≤ 76, mantissa ≤
32 bytes) and avoids loss of precision when you already have a fixed-point
representation:

```c
// 12.3 -> scale 1, unscaled value 123 (0x7B)
const uint8_t price_unscaled_value[] = {123};
if (!line_sender_buffer_column_dec(
        buffer, price_name, 1, price_unscaled_value, sizeof(price_unscaled_value), &err))
    goto on_error;
```

Negative values follow the same rules—encode the unscaled value using two's
complement with the most significant byte first.

You can find more examples in the [c-questdb-client repository](https://github.com/questdb/c-questdb-client/tree/main/examples).

## Other Considerations for both C and C++

### Configuration options

The easiest way to configure the line sender is the configuration string. The
general structure is:

```plain
<transport>::addr=host:port;param1=val1;param2=val2;...
```

`transport` can be `http`, `https`, `tcp`, or `tcps`. The C/C++ and Rust clients
share the same codebase. Please refer to the
[Rust client's documentation](https://docs.rs/questdb-rs/latest/questdb/ingress)
for the full details on configuration.

Alternatively, for a breakdown of Configuration string options available across
all clients, see the [Configuration string](/docs/configuration-string/) page.

### Don't forget to flush

The sender and buffer objects are entirely decoupled. This means that the sender
won't get access to the data in the buffer until you explicitly call
`sender.flush` or `line_sender_flush`. This may lead to a pitfall where you drop
a buffer that still has some data in it, resulting in permanent data loss.

A common technique is to flush periodically on a timer and/or once the buffer
exceeds a certain size. You can check the buffer's size by calling
`buffer.size()` or `line_sender_buffer_size(...)`.

The default `flush()` method clears the buffer after sending its data. If you
want to preserve its contents (for example, to send the same data to multiple
QuestDB instances), call `sender.flush_and_keep(&buffer)` or
`line_sender_flush_and_keep(...)` instead.

### Transactional flush

As described in
[ILP overview](/docs/reference/api/ilp/overview#http-transaction-semantics), the
HTTP transport has some support for transactions.

To ensure in advance that a flush will not affect more than one table, call
`buffer.transactional()` or `line_sender_buffer_transactional(buffer)`, as shown
in the examples above. This call will return false if the flush wouldn't be
data-transactional.

### Protocol Version

To enhance data ingestion performance, QuestDB introduced an upgrade to the
text-based InfluxDB Line Protocol which encodes arrays and `double` values in
binary form. Arrays are supported only in this upgraded protocol version.

You can select the protocol version with the `protocol_version` setting in the
configuration string.

HTTP transport automatically negotiates the protocol version by default. In order
to avoid the slight latency cost at connection time, you can explicitly configure
the protocol version by setting `protocol_version=2|1;`.

TCP transport does not negotiate the protocol version and uses version 1 by
default. You must explicitly set `protocol_version=2;` in order to ingest
arrays, as in this example:

```text
tcp::addr=localhost:9009;protocol_version=2;
```

Protocol Version 2 along with its support for arrays is available from QuestDB
version 9.0.0.

## Next Steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
about transactions, error control, delivery guarantees, health check, or table
and column auto-creation.

With data flowing into QuestDB, now it's time for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.com/).
