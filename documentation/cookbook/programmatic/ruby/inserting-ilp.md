---
title: Insert Data from Ruby Using ILP
sidebar_label: Inserting via ILP
description: Send time-series data from Ruby to QuestDB using the InfluxDB Line Protocol over HTTP
---

Send time-series data from Ruby to QuestDB using the InfluxDB Line Protocol (ILP). While QuestDB doesn't maintain an official Ruby client, you can easily use the official InfluxDB Ruby gem to send data via ILP over HTTP, which QuestDB fully supports.

## Available Approaches

Two methods for sending ILP data from Ruby:

1. **InfluxDB v2 Ruby Client** (recommended)
   - Official InfluxDB gem with clean API
   - Automatic batching and error handling
   - Compatible with QuestDB's ILP endpoint
   - Requires: `influxdb-client` gem

2. **TCP Socket** (for custom implementations)
   - Direct socket communication
   - Manual ILP message formatting
   - Higher throughput, no dependencies
   - Requires: Built-in Ruby socket library

## Using the InfluxDB v2 Ruby Client

The InfluxDB v2 client provides a convenient Point builder API that works with QuestDB.

### Installation

```bash
gem install influxdb-client
```

Or add to your `Gemfile`:

```ruby
gem 'influxdb-client', '~> 3.1'
```

### Example Code

```ruby
require 'influxdb-client'

# Create client
client = InfluxDB2::Client.new(
  'http://localhost:9000',
  'ignore-token',  # Token not required for QuestDB
  bucket: 'ignore-bucket',  # Bucket not used by QuestDB
  org: 'ignore-org',  # Organization not used by QuestDB
  precision: InfluxDB2::WritePrecision::NANOSECOND,
  use_ssl: false
)

write_api = client.create_write_api

# Write a single point
point = InfluxDB2::Point.new(name: 'readings')
  .add_tag('city', 'London')
  .add_tag('make', 'Omron')
  .add_field('temperature', 23.5)
  .add_field('humidity', 0.343)

write_api.write(data: point)

# Write multiple points
points = [
  InfluxDB2::Point.new(name: 'readings')
    .add_tag('city', 'Madrid')
    .add_tag('make', 'Sony')
    .add_field('temperature', 25.5)
    .add_field('humidity', 0.360),

  InfluxDB2::Point.new(name: 'readings')
    .add_tag('city', 'New York')
    .add_tag('make', 'Philips')
    .add_field('temperature', 20.5)
    .add_field('humidity', 0.330)
]

write_api.write(data: points)

# Always close the client
client.close!
```

### Configuration Notes

When using the InfluxDB client with QuestDB:

- **`token`**: Not required - can be empty string or any value
- **`bucket`**: Ignored by QuestDB - can be any string
- **`org`**: Ignored by QuestDB - can be any string
- **`precision`**: Use `NANOSECOND` for compatibility (QuestDB's native precision)
- **`use_ssl`**: Set to `false` for local development, `true` for production with TLS

### Data Types

The InfluxDB client automatically handles type conversions:

```ruby
point = InfluxDB2::Point.new(name: 'measurements')
  .add_tag('sensor_id', '001')                    # SYMBOL in QuestDB
  .add_field('temperature', 23.5)                  # DOUBLE
  .add_field('humidity', 0.343)                    # DOUBLE
  .add_field('pressure', 1013)                     # LONG (integer)
  .add_field('status', 'active')                   # STRING
  .add_field('online', true)                       # BOOLEAN
```

## TCP Socket Approach

For maximum control and performance, send ILP messages directly via TCP sockets.

### Basic TCP Example

```ruby
require 'socket'

HOST = 'localhost'
PORT = 9009

# Helper method to get current time in nanoseconds
def time_in_nsec
  now = Time.now
  return now.to_i * (10 ** 9) + now.nsec
end

begin
  s = TCPSocket.new(HOST, PORT)

  # Single record with timestamp
  s.puts "trades,symbol=BTC-USDT,side=buy price=37779.62,amount=0.5 #{time_in_nsec}\n"

  # Omitting timestamp - server assigns one
  s.puts "trades,symbol=ETH-USDT,side=sell price=2615.54,amount=1.2\n"

  # Multiple records (newline-delimited)
  s.puts "trades,symbol=SOL-USDT,side=buy price=98.23,amount=10.0\n" +
         "trades,symbol=BTC-USDT,side=sell price=37800.00,amount=0.3\n"

rescue SocketError => ex
  puts "Socket error: #{ex.inspect}"
ensure
  s.close if s
end
```

### ILP Message Format

The ILP format is:

```
table_name,tag1=value1,tag2=value2 field1=value1,field2=value2 timestamp\n
```

Breaking it down:
- **Table name**: Target table (created automatically if doesn't exist)
- **Tags** (symbols): Comma-separated key=value pairs for indexed categorical data
- **Space separator**: Separates tags from fields
- **Fields** (columns): Comma-separated key=value pairs for numerical or string data
- **Space separator**: Separates fields from timestamp
- **Timestamp** (optional): Nanosecond-precision timestamp; if omitted, server assigns

**Example:**
```
readings,city=London,make=Omron temperature=23.5,humidity=0.343 1465839830100400000\n
```

### Escaping Special Characters

ILP requires escaping for certain characters:

```ruby
def escape_ilp(value)
  value.to_s
    .gsub(' ', '\\ ')     # Space
    .gsub(',', '\\,')     # Comma
    .gsub('=', '\\=')     # Equals
    .gsub("\n", '\\n')    # Newline
end

# Usage
tag_value = "London, UK"
escaped = escape_ilp(tag_value)  # "London\\, UK"

s.puts "readings,city=#{escaped} temperature=23.5\n"
```

### Batching for Performance

Send multiple rows in a single TCP write:

```ruby
require 'socket'

HOST = 'localhost'
PORT = 9009

def time_in_nsec
  now = Time.now
  return now.to_i * (10 ** 9) + now.nsec
end

begin
  s = TCPSocket.new(HOST, PORT)

  # Build batch of rows
  batch = []
  (1..1000).each do |i|
    timestamp = time_in_nsec + i * 1000000  # 1ms apart
    batch << "readings,sensor_id=#{i} value=#{rand(100.0)},status=\"ok\" #{timestamp}"
  end

  # Send entire batch at once
  s.puts batch.join("\n") + "\n"
  s.flush

rescue SocketError => ex
  puts "Socket error: #{ex.inspect}"
ensure
  s.close if s
end
```

## Comparison: InfluxDB Client vs TCP Socket

| Feature | InfluxDB Client | TCP Socket |
|---------|----------------|------------|
| **Ease of use** | High - Point builder API | Medium - Manual ILP formatting |
| **Dependencies** | Requires `influxdb-client` gem | None (stdlib only) |
| **Error handling** | Automatic with retries | Manual implementation |
| **Batching** | Automatic | Manual |
| **Performance** | Good | Excellent (direct TCP) |
| **Type safety** | Automatic type conversion | Manual string formatting |
| **Reliability** | HTTP with acknowledgments | No acknowledgments (fire and forget) |
| **Escaping** | Automatic | Manual implementation required |
| **Recommended for** | Most applications | High-throughput scenarios, custom needs |

## Best Practices

### Connection Management

**InfluxDB Client:**
```ruby
# Reuse client for multiple writes
client = InfluxDB2::Client.new(...)
write_api = client.create_write_api

# ... perform many writes ...

client.close!  # Always close when done
```

**TCP Socket:**
```ruby
# Keep connection open for multiple writes
socket = TCPSocket.new(HOST, PORT)

begin
  # ... send multiple batches ...
ensure
  socket.close if socket
end
```

### Error Handling

**InfluxDB Client:**
```ruby
begin
  write_api.write(data: points)
rescue InfluxDB2::InfluxError => e
  puts "Failed to write to QuestDB: #{e.message}"
  # Implement retry logic or logging
end
```

**TCP Socket:**
```ruby
begin
  socket.puts(ilp_messages)
  socket.flush
rescue Errno::EPIPE, Errno::ECONNRESET => e
  puts "Connection lost: #{e.message}"
  # Reconnect and retry
rescue StandardError => e
  puts "Unexpected error: #{e.message}"
end
```

### Timestamp Generation

Use nanosecond precision for maximum compatibility:

```ruby
# Current time in nanoseconds
def current_nanos
  now = Time.now
  now.to_i * 1_000_000_000 + now.nsec
end

# Specific time to nanoseconds
def time_to_nanos(time)
  time.to_i * 1_000_000_000 + time.nsec
end

# Usage
timestamp = current_nanos
# or
timestamp = time_to_nanos(Time.parse("2024-09-05 14:30:00 UTC"))
```

### Batching Strategy

For high-throughput scenarios:

```ruby
BATCH_SIZE = 1000
FLUSH_INTERVAL = 5  # seconds

batch = []
last_flush = Time.now

data_stream.each do |record|
  batch << format_ilp_message(record)

  if batch.size >= BATCH_SIZE || (Time.now - last_flush) >= FLUSH_INTERVAL
    socket.puts batch.join("\n") + "\n"
    socket.flush
    batch.clear
    last_flush = Time.now
  end
end

# Flush remaining records
socket.puts batch.join("\n") + "\n" unless batch.empty?
```

:::tip Choosing an Approach
- **Use InfluxDB client** for most Ruby applications - it's easier, safer, and handles edge cases
- **Use TCP sockets** only when you need maximum throughput and can handle reliability concerns
:::

:::warning Data Loss with TCP
TCP ILP has no acknowledgments. If the connection drops, data may be lost silently. For critical data, use HTTP (via the InfluxDB client) which provides delivery confirmation.
:::

:::info Related Documentation
- [ILP reference](/docs/ingestion/ilp/overview/)
- [ILP over HTTP](/docs/ingestion/ilp/overview/#transport-selection)
- [ILP over TCP](/docs/ingestion/ilp/overview/#transport-selection)
- [InfluxDB Ruby client](https://github.com/influxdata/influxdb-client-ruby)
:::
