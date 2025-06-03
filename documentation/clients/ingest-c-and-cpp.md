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

```c
auto sender = questdb::ingress::line_sender::from_env();
```

When using QuestDB Enterprise, authentication can also be done via REST token.
Please check the [RBAC docs](/docs/operations/rbac/#authentication) for more
info.

### Basic data insertion

Basic insertion (no-auth):

```c
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
    .at_now());

    // To insert more records, call `buffer.table(..)...` again.

    sender.flush(buffer);
    return 0;
}
```

These are the main steps it takes:

- Use `questdb::ingress::line_sender::from_conf` to get the `sender` object
- Populate a `Buffer` with one or more rows of data
- Send the buffer using `sender.flush()`(`Sender::flush`)

In this case, we call `at_now()`, letting the server assign the timestamp to the
row.

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

        // Flush the buffer of the sender, sending the data to QuestDB
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

The sender uses an `std::array` to insert an array of any dimensionality. It
contains the elements laid out flat in row-major order, while the separate
vectors `shape` and `strides` describe its higher-dimensional structure. Please
refer to the [Concepts section on n-dimensional arrays](/docs/concept/array),
where this is explained in more detail.

In this example, we insert a 3D array of `double` values:

```cpp
#include <questdb/ingress/line_sender.hpp>
#include <iostream>
#include <vector>

using namespace std::literals::string_view_literals;
using namespace questdb::ingress::literals;

int main()
{
    try
    {
        auto sender = questdb::ingress::line_sender::from_conf(
            "tcp::addr=127.0.0.1:9000;protocol_version=2;");
        const auto table_name = "cpp_market_orders_byte_strides"_tn;
        const auto symbol_col = "symbol"_cn;
        const auto book_col = "order_book"_cn;
        size_t rank = 3;
        std::vector<uintptr_t> shape{2, 3, 2};
        std::vector<intptr_t> strides{6, 2, 1};
        std::array<double, 12> arr_data = {
            48123.5,
            2.4,
            48124.0,
            1.8,
            48124.5,
            0.9,
            48122.5,
            3.1,
            48122.0,
            2.7,
            48121.5,
            4.3};

        questdb::ingress::line_sender_buffer buffer = sender.new_buffer();
        buffer.table(table_name)
            .symbol(symbol_col, "BTC-USD"_utf8)
            .column<false>(book_col, 3, shape, strides, arr_data)
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

In the example, we provide the strides in terms of the number of elements. You
can also provide them in terms of bytes, by using `<false>` for the template
argument, like this: `column<false>(book_col, 3, shape, strides, arr_data)`.

## C

:::note

This sectioni s for the QuestDB C client.

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
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"), QDB_UTF8_LITERAL("ETH-USD"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("amount"), 0.00044, &error)) goto error;
    if (!line_sender_buffer_at_now(buffer, &error)) goto error;


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

In this case, we call `line_sender_buffer_at_now()`, letting the server assign
the timestamp to the row.

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
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"), QDB_UTF8_LITERAL("ETH-USD"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 2615.54, &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("amount"), 0.00044, &error)) goto error;
    if (!line_sender_buffer_at_nanos(buffer, nanos, &error)) goto error;

    // Add data to buffer for BTC-USD trade
    if (!line_sender_buffer_table(buffer, QDB_TABLE_NAME_LITERAL("trades"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("symbol"), QDB_UTF8_LITERAL("BTC-USD"), &error)) goto error;
    if (!line_sender_buffer_symbol(buffer, QDB_COLUMN_NAME_LITERAL("side"), QDB_UTF8_LITERAL("sell"), &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("price"), 39269.98, &error)) goto error;
    if (!line_sender_buffer_column_f64(buffer, QDB_COLUMN_NAME_LITERAL("amount"), 0.001, &error)) goto error;
    if (!line_sender_buffer_at_nanos(buffer, nanos, &error)) goto error;

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
dimensionality. It contains the elements laid out flat in row-major order, while
the separate arrays `shape` and `strides` describe its higher-dimensional
structure. Please refer to the
[Concepts section on n-dimensional arrays](/docs/concept/array), where this is
explained in more detail.

In this example, we insert a 3D array of `double` values:

```c
int main()
{
    line_sender_error* err = NULL;
    line_sender* sender = NULL;
    line_sender_buffer* buffer = NULL;
    char* conf_str = concat("tcp::addr=", host, ":", port, ";protocol_version=2;");
    if (!conf_str)
    {
        fprintf(stderr, "Could not concatenate configuration string.\n");
        return false;
    }

    line_sender_utf8 conf_str_utf8 = {0, NULL};
    if (!line_sender_utf8_init(
            &conf_str_utf8, strlen(conf_str), conf_str, &err))
        goto on_error;

    sender = line_sender_from_conf(conf_str_utf8, &err);
    if (!sender)
        goto on_error;

    free(conf_str);
    conf_str = NULL;

    buffer = line_sender_buffer_new_for_sender(sender);
    line_sender_buffer_reserve(buffer, 64 * 1024);

    line_sender_table_name table_name = QDB_TABLE_NAME_LITERAL("market_orders_byte_strides");
    line_sender_column_name symbol_col = QDB_COLUMN_NAME_LITERAL("symbol");
    line_sender_column_name book_col = QDB_COLUMN_NAME_LITERAL("order_book");

    if (!line_sender_buffer_table(buffer, table_name, &err))
        goto on_error;

    line_sender_utf8 symbol_val = QDB_UTF8_LITERAL("BTC-USD");
    if (!line_sender_buffer_symbol(buffer, symbol_col, symbol_val, &err))
        goto on_error;

    size_t array_rank = 3;
    uintptr_t array_shape[] = {2, 3, 2};
    intptr_t array_strides[] = {6, 2, 1};

    double array_data[] = {
        48123.5,
        2.4,
        48124.0,
        1.8,
        48124.5,
        0.9,
        48122.5,
        3.1,
        48122.0,
        2.7,
        48121.5,
        4.3};

    if (!line_sender_buffer_column_f64_arr_elem_strides(
            buffer,
            book_col,
            array_rank,
            array_shape,
            array_strides,
            (const uint8_t*)array_data,
            sizeof(array_data),
            &err))
        goto on_error;

    if (!line_sender_buffer_at_nanos(buffer, line_sender_now_nanos(), &err))
        goto on_error;

    if (!line_sender_flush(sender, buffer, &err))
        goto on_error;

    line_sender_close(sender);
    return true;

on_error:;
    size_t err_len = 0;
    const char* err_msg = line_sender_error_msg(err, &err_len);
    fprintf(stderr, "Error: %.*s\n", (int)err_len, err_msg);
    free(conf_str);
    line_sender_error_free(err);
    line_sender_buffer_free(buffer);
    line_sender_close(sender);
    return false;
}
```

If you want to provide strides in terms of bytes, call
`line_sender_buffer_column_f64_arr_byte_strides` instead.

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
tcp::addr=localhost:9000;protocol_version=2;
```

## Next Steps

Please refer to the [ILP overview](/docs/reference/api/ilp/overview) for details
about transactions, error control, delivery guarantees, health check, or table
and column auto-creation.

With data flowing into QuestDB, now it's time for analysis.

To learn _The Way_ of QuestDB SQL, see the
[Query & SQL Overview](/docs/reference/sql/overview/).

Alone? Stuck? Want help? Visit us in our
[Community Forum](https://community.questdb.com/).
