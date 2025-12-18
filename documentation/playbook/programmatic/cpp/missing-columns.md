---
title: Handle Missing Columns in C++ Client
sidebar_label: Missing columns
description: Send rows with optional columns using the QuestDB C++ client by conditionally calling column methods
---

Handle rows with missing or optional columns when using the QuestDB C++ client. Unlike Python's dictionary-based approach where you can simply omit keys, the C++ client requires explicit method calls for each column. This guide shows how to conditionally include columns based on data availability.

## Problem: Ragged Rows with Optional Fields

You have data where some columns may be missing for certain rows. In Python, you can use dictionaries with `None` values or omit keys entirely:

```python
# Python - easy to handle missing data
{"price": 10.0, "volume": 100}     # Both columns
{"price": 10.0, "volume": None}     # Volume missing
{"price": 10.0}                     # Volume omitted (equivalent to None)
```

In C++, the buffer-based API requires explicit method calls:

```cpp
buffer
    .table("trades")
    .symbol("symbol", "ETH-USD")
    .column("price", 2615.54)
    .column("volume", 0.00044)    // What if volume is missing?
    .at(timestamp);
```

## Solution: Conditional Column Calls

Use `std::optional<T>` (C++17) or nullable types, then conditionally call `.column()` only when data is present.

### Complete Example

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

        // Define structure with optional price
        struct Trade {
            std::string symbol;
            std::string side;
            std::optional<double> price;  // May be missing
            double amount;
        };

        // Sample data - some trades missing price
        std::vector<Trade> trades = {
            {"ETH-USD", "sell", 2615.54, 0.00044},
            {"BTC-USD", "sell", 39269.98, 0.001},
            {"SOL-USD", "sell", std::nullopt, 5.5}  // Missing price
        };

        questdb::ingress::line_sender_buffer buffer;

        // Iterate and conditionally add columns
        for (const auto& trade : trades) {
            buffer.table("trades")
                .symbol("symbol", trade.symbol)
                .symbol("side", trade.side);

            // Only add price column if value exists
            if (trade.price.has_value()) {
                buffer.column("price", trade.price.value());
            }

            buffer.column("amount", trade.amount)
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

### How It Works

1. **`std::optional<T>`**: Represents a value that may or may not be present
   - `std::nullopt`: Indicates missing value
   - `.has_value()`: Checks if value is present
   - `.value()`: Retrieves the value (only call if `.has_value()` is true)

2. **Conditional column call**: Skip `.column()` when value is missing
   ```cpp
   if (trade.price.has_value()) {
       buffer.column("price", trade.price.value());
   }
   ```

3. **Buffer accumulation**: Each call to `.table()...at()` adds one row to the buffer
   - The buffer accumulates all rows
   - Call `.flush()` once to send all rows together

## Compilation

```bash
# Basic compilation with C++17
g++ -std=c++17 -o trades trades.cpp -lquestdb_client

# With optimization
g++ -std=c++17 -O3 -o trades trades.cpp -lquestdb_client

# Using CMake
cmake -DCMAKE_BUILD_TYPE=Release ..
make
```

Ensure you have:
- C++17 or later compiler
- QuestDB C++ client library installed
- Linker flag `-lquestdb_client`

## Multiple Optional Columns

Handle multiple optional fields by checking each one:

```cpp
struct SensorReading {
    std::string sensor_id;
    std::optional<double> temperature;
    std::optional<double> humidity;
    std::optional<double> pressure;
    std::optional<std::string> status;
};

// Add to buffer
for (const auto& reading : readings) {
    buffer.table("sensor_data")
        .symbol("sensor_id", reading.sensor_id);

    if (reading.temperature.has_value()) {
        buffer.column("temperature", reading.temperature.value());
    }

    if (reading.humidity.has_value()) {
        buffer.column("humidity", reading.humidity.value());
    }

    if (reading.pressure.has_value()) {
        buffer.column("pressure", reading.pressure.value());
    }

    if (reading.status.has_value()) {
        buffer.column("status", reading.status.value());
    }

    buffer.at(questdb::ingress::timestamp_nanos::now());
}
```

## C++11/14 Alternative (Without std::optional)

If you can't use C++17, use pointers or sentinel values:

### Using Pointers

```cpp
struct Trade {
    std::string symbol;
    std::string side;
    double* price;  // nullptr if missing
    double amount;
};

// Usage
double btc_price = 39269.98;
std::vector<Trade> trades = {
    {"BTC-USD", "sell", &btc_price, 0.001},
    {"SOL-USD", "sell", nullptr, 5.5}  // Missing price
};

for (const auto& trade : trades) {
    buffer.table("trades")
        .symbol("symbol", trade.symbol)
        .symbol("side", trade.side);

    if (trade.price != nullptr) {
        buffer.column("price", *trade.price);
    }

    buffer.column("amount", trade.amount)
        .at(questdb::ingress::timestamp_nanos::now());
}
```

### Using Sentinel Values

```cpp
const double MISSING_VALUE = std::numeric_limits<double>::quiet_NaN();

struct Trade {
    std::string symbol;
    std::string side;
    double price;    // NaN if missing
    double amount;
};

// Usage
for (const auto& trade : trades) {
    buffer.table("trades")
        .symbol("symbol", trade.symbol)
        .symbol("side", trade.side);

    if (!std::isnan(trade.price)) {
        buffer.column("price", trade.price);
    }

    buffer.column("amount", trade.amount)
        .at(questdb::ingress::timestamp_nanos::now());
}
```

## Symbol vs Column

Remember the distinction in ILP:
- **Symbols** (`.symbol()`): Categorical data, indexed automatically by QuestDB (e.g., instrument, side, category)
- **Columns** (`.column()`): Numerical, string, or boolean values (e.g., price, amount, status)

Both can be optional and use the same conditional pattern:

```cpp
// Optional symbol
if (trade.exchange.has_value()) {
    buffer.symbol("exchange", trade.exchange.value());
}

// Optional column
if (trade.price.has_value()) {
    buffer.column("price", trade.price.value());
}
```

## Type-Specific Column Methods

The C++ client provides type-specific methods for clarity and performance:

```cpp
// Explicit type methods (recommended)
buffer.column_f64("price", 2615.54);          // 64-bit float
buffer.column_i64("count", 100);              // 64-bit integer
buffer.column_bool("active", true);           // Boolean
buffer.column_str("status", "ok");            // String

// Generic column (uses template deduction)
buffer.column("price", 2615.54);              // Also works
```

Use type-specific methods when handling optional values for better clarity:

```cpp
if (trade.price.has_value()) {
    buffer.column_f64("price", trade.price.value());
}

if (trade.volume.has_value()) {
    buffer.column_i64("volume", trade.volume.value());
}
```

## Batching and Flushing

For better performance, accumulate multiple rows before flushing:

```cpp
constexpr size_t BATCH_SIZE = 1000;

questdb::ingress::line_sender_buffer buffer;
size_t row_count = 0;

for (const auto& trade : large_dataset) {
    buffer.table("trades")
        .symbol("symbol", trade.symbol);

    if (trade.price.has_value()) {
        buffer.column("price", trade.price.value());
    }

    buffer.column("amount", trade.amount)
        .at(questdb::ingress::timestamp_nanos::now());

    row_count++;

    // Flush when batch is full
    if (row_count >= BATCH_SIZE) {
        sender.flush(buffer);
        buffer.clear();  // Reset buffer for next batch
        row_count = 0;
    }
}

// Flush remaining rows
if (row_count > 0) {
    sender.flush(buffer);
}
```

## Error Handling

Always handle potential errors:

```cpp
try {
    sender.flush(buffer);
} catch (const questdb::ingress::line_sender_error& err) {
    std::cerr << "Failed to send data: " << err.what() << std::endl;

    // Implement retry logic or save to disk
    if (should_retry(err)) {
        retry_with_backoff(buffer);
    } else {
        save_to_disk(buffer);
    }
}
```

## Performance Considerations

**Minimize optional checks in hot paths:**
```cpp
// Good: Check once, process many
if (all_prices_present) {
    for (const auto& trade : trades) {
        buffer.table("trades")
            .symbol("symbol", trade.symbol)
            .column("price", trade.price)  // No conditional
            .column("amount", trade.amount)
            .at(timestamp);
    }
} else {
    // Slower path with conditionals
    for (const auto& trade : trades) {
        buffer.table("trades")
            .symbol("symbol", trade.symbol);

        if (trade.price.has_value()) {
            buffer.column("price", trade.price.value());
        }

        buffer.column("amount", trade.amount)
            .at(timestamp);
    }
}
```

**Batch sizing:**
- Larger batches (1000-10000 rows) reduce network overhead
- Smaller batches (100-500 rows) reduce memory usage and improve latency
- Tune based on your data rate and memory constraints

:::tip Schema Evolution
QuestDB automatically creates missing columns when you first send data with that column name. This means:
- You can add new optional columns at any time
- Existing rows will have NULL for new columns
- No schema migration required
:::

:::warning Thread Safety
The `line_sender_buffer` is NOT thread-safe. Either:
1. Use one buffer per thread
2. Protect shared buffer with mutex
3. Use a queue pattern with single sender thread
:::

:::info Related Documentation
- [QuestDB C++ client documentation](https://github.com/questdb/c-questdb-client)
- [ILP reference](/docs/reference/api/ilp/overview/)
- [C++ client examples](https://github.com/questdb/c-questdb-client/tree/main/examples)
- [std::optional reference](https://en.cppreference.com/w/cpp/utility/optional)
:::
