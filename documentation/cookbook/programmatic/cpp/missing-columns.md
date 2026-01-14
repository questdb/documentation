---
title: Handle missing columns in C++ client
sidebar_label: Missing columns
description: Send rows with optional columns using the QuestDB C++ client by conditionally calling column methods
---

Send rows with missing or optional columns to QuestDB using the C++ client.

## Problem

In Python, you can handle missing columns easily with dictionaries:

```python
{"price1": 10.0, "price2": 10.1}
```

And if price2 is not available:

```python
{"price1": 10.0, "price2": None}
```

Which is equivalent to:

```python
{"price1": 10.0}
```

You can pass the dict as the columns argument to `sender.rows` and it transparently sends the rows, with or without missing columns, to the server.

In C++, the buffer API requires explicit method calls:

```cpp
buffer
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .symbol("side", "sell")
    .column("price", 2615.54)
    .column("amount", 0.00044)
    .at(questdb::ingress::timestamp_nanos::now());

sender.flush(buffer);
```

How do you handle "ragged" rows with missing columns in C++?

## Solution

You need to call `at` at the end of the buffer so the data gets queued to be sent, but you can call `symbol` and `column` as many times as needed for each row, and you can do this conditionally.

The example below builds a vector with three rows, one of them with an empty column, then it iterates over the vector and checks if the optional `price` column is null. If it is, it skips invoking `column` for the buffer on that column.

```cpp
#include <questdb/ingress/line_sender.hpp>
#include <iostream>
#include <chrono>
#include <vector>
#include <optional>
#include <string>

int main()
{
    try
    {
        auto sender = questdb::ingress::line_sender::from_conf(
            "http::addr=localhost:9000;username=admin;password=quest;retry_timeout=20000;");

        auto now = std::chrono::system_clock::now();
        auto duration = now.time_since_epoch();
        auto nanos = std::chrono::duration_cast<std::chrono::nanoseconds>(duration).count();

        struct Row {
            std::string symbol;
            std::string side;
            std::optional<double> price;
            double amount;
        };

        std::vector<Row> rows = {
            {"ETH-USD", "sell", 2615.54, 0.00044},
            {"BTC-USD", "sell", 39269.98, 0.001},
            {"SOL-USD", "sell", std::nullopt, 5.5} // Missing price
        };

        questdb::ingress::line_sender_buffer buffer;

        for (const auto& row : rows) {
            buffer.table("trades")
                .symbol("symbol", row.symbol)
                .symbol("side", row.side);

            if (row.price.has_value()) {
                buffer.column("price", row.price.value());
            }

            buffer.column("amount", row.amount)
                .at(questdb::ingress::timestamp_nanos(nanos));
        }

        sender.flush(buffer);
        sender.close();

        std::cout << "Data successfully sent!" << std::endl;
        return 0;
    }
    catch (const questdb::ingress::line_sender_error& err)
    {
        std::cerr << "Error running example: " << err.what() << std::endl;
        return 1;
    }
}
```

:::info Related Documentation
- [QuestDB C++ client documentation](https://github.com/questdb/c-questdb-client)
- [ILP reference](/docs/ingestion/ilp/overview/)
:::
