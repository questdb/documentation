---
title: Insert Data from PHP Using ILP
sidebar_label: Inserting via ILP
description: Send time-series data from PHP to QuestDB using the InfluxDB Line Protocol
---

QuestDB doesn't maintain an official PHP library, but since the ILP (InfluxDB Line Protocol) is text-based, you can easily send your data using PHP's built-in HTTP or socket functions, or use the official InfluxDB PHP client library.

## Available Approaches

This guide covers three methods for sending ILP data to QuestDB from PHP:

1. **HTTP with cURL** (recommended for most use cases)
   - Full control over ILP formatting and timestamps
   - No external dependencies beyond PHP's built-in cURL
   - Requires manual ILP string construction

2. **InfluxDB v2 PHP Client** (easiest to use)
   - Clean Point builder API
   - Automatic batching and error handling
   - **Limitation:** Cannot use custom timestamps with QuestDB (must use server timestamps)
   - Requires Composer packages: `influxdata/influxdb-client-php` and `guzzlehttp/guzzle`

3. **TCP Socket** (highest throughput)
   - Best performance for high-volume scenarios
   - No acknowledgments - data loss possible
   - Manual implementation required

## ILP Protocol Overview

The ILP protocol allows you to send data to QuestDB using a simple line-based text format:

```
table_name,comma_separated_symbols comma_separated_non_symbols optional_timestamp\n
```

Each line represents one row of data. For example, these two lines are well-formed ILP messages:

```
readings,city=London,make=Omron temperature=23.5,humidity=0.343 1465839830100400000\n
readings,city=Bristol,make=Honeywell temperature=23.2,humidity=0.443\n
```

The format consists of:
- **Table name**: The target table for the data
- **Symbols** (tags): Comma-separated key-value pairs for indexed categorical data
- **Columns** (fields): Space-separated, then comma-separated key-value pairs for numerical or string data
- **Timestamp** (optional): Nanosecond-precision timestamp; if omitted, QuestDB uses server time

For complete ILP specification, see the [ILP reference documentation](/docs/ingestion/ilp/overview/).

## ILP Over HTTP

QuestDB supports ILP data via HTTP or TCP. **HTTP is the recommended approach** for most use cases as it provides better reliability and easier debugging.

To send data via HTTP:
1. Send a POST request to `http://localhost:9000/write` (or your QuestDB instance endpoint)
2. Set `Content-Type: text/plain` header
3. Include ILP-formatted rows in the request body
4. For higher throughput, batch multiple rows in a single request

### HTTP Buffering Example

The following PHP class provides buffered insertion with automatic flushing based on either row count or elapsed time:

```php title="Buffered ILP insertion via HTTP"
<?php
class DataInserter {
    private $endpoint = 'http://localhost:9000/write';
    private $buffer = [];
    private $bufferSize = 10;
    private $flushInterval = 30; // time in seconds
    private $lastFlushTime;

    public function __construct($bufferSize = 10, $flushInterval = 30) {
        $this->bufferSize = $bufferSize;
        $this->flushInterval = $flushInterval;
        $this->lastFlushTime = time();
    }

    public function __destruct() {
        // Attempt to flush any remaining data when script is terminating
        $this->flush();
    }

    public function insertRow($tableName, $symbols, $columns, $timestamp = null) {
        $row = $this->formatRow($tableName, $symbols, $columns, $timestamp);
        $this->buffer[] = $row;
        $this->checkFlushConditions();
    }

    private function formatRow($tableName, $symbols, $columns, $timestamp) {
        $escape = function($value) {
            return str_replace([' ', ',', "\n"], ['\ ', '\,', '\n'], $value);
        };

        $symbolString = implode(',', array_map(
            function($k, $v) use ($escape) { return "$k={$escape($v)}"; },
            array_keys($symbols), $symbols
        ));

        $columnString = implode(',', array_map(
            function($k, $v) use ($escape) { return "$k={$escape($v)}"; },
            array_keys($columns), $columns
        ));

        // Check if timestamp is provided
        $timestampPart = is_null($timestamp) ? '' : " $timestamp";

        return "$tableName,$symbolString $columnString$timestampPart";
    }

    private function checkFlushConditions() {
        if (count($this->buffer) >= $this->bufferSize || (time() - $this->lastFlushTime) >= $this->flushInterval) {
            $this->flush();
        }
    }

    private function flush() {
        if (empty($this->buffer)) {
            return; // Nothing to flush
        }
        $data = implode("\n", $this->buffer);
        $this->buffer = [];
        $this->lastFlushTime = time();

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->endpoint);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: text/plain']);
        curl_exec($ch);
        curl_close($ch);
    }
}

// Usage example:
$inserter = new DataInserter(10, 30);

// Inserting rows for London
$inserter->insertRow("test_readings", ["city" => "London", "make" => "Omron"], ["temperature" => 23.5, "humidity" => 0.343], "1650573480100400000");
$inserter->insertRow("test_readings", ["city" => "London", "make" => "Sony"], ["temperature" => 21.0, "humidity" => 0.310]);
$inserter->insertRow("test_readings", ["city" => "London", "make" => "Philips"], ["temperature" => 22.5, "humidity" => 0.333], "1650573480100500000");
$inserter->insertRow("test_readings", ["city" => "London", "make" => "Samsung"], ["temperature" => 24.0, "humidity" => 0.350]);

// Inserting rows for Madrid
$inserter->insertRow("test_readings", ["city" => "Madrid", "make" => "Omron"], ["temperature" => 25.5, "humidity" => 0.360], "1650573480100600000");
$inserter->insertRow("test_readings", ["city" => "Madrid", "make" => "Sony"], ["temperature" => 23.0, "humidity" => 0.340]);
$inserter->insertRow("test_readings", ["city" => "Madrid", "make" => "Philips"], ["temperature" => 26.0, "humidity" => 0.370], "1650573480100700000");
$inserter->insertRow("test_readings", ["city" => "Madrid", "make" => "Samsung"], ["temperature" => 22.0, "humidity" => 0.355]);

// Inserting rows for New York
$inserter->insertRow("test_readings", ["city" => "New York", "make" => "Omron"], ["temperature" => 20.5, "humidity" => 0.330], "1650573480100800000");
$inserter->insertRow("test_readings", ["city" => "New York", "make" => "Sony"], ["temperature" => 19.0, "humidity" => 0.320]);
$inserter->insertRow("test_readings", ["city" => "New York", "make" => "Philips"], ["temperature" => 21.0, "humidity" => 0.340], "1650573480100900000");
$inserter->insertRow("test_readings", ["city" => "New York", "make" => "Samsung"], ["temperature" => 18.5, "humidity" => 0.335]);
?>
```

This class:
- Buffers rows until either 10 rows are accumulated or 30 seconds have elapsed
- Properly escapes special characters (spaces, commas, newlines) in values
- Automatically flushes remaining data when the script terminates
- Uses cURL for HTTP communication

:::tip
For production use, consider adding error handling to check the HTTP response status and implement retry logic for failed requests.
:::

## Using the InfluxDB v2 PHP Client

Another approach is to use the official [InfluxDB PHP client library](https://github.com/influxdata/influxdb-client-php), which supports the InfluxDB v2 write API. QuestDB is compatible with this API, making the client library a convenient option.

### Installation

Install the required packages via Composer:

```bash
composer require influxdata/influxdb-client-php guzzlehttp/guzzle
```

**Required dependencies:**
- `influxdata/influxdb-client-php` - The InfluxDB v2 PHP client library
- `guzzlehttp/guzzle` - A PSR-18 compatible HTTP client (required by the InfluxDB client)

:::info Alternative HTTP Clients
The InfluxDB client requires a PSR-18 compatible HTTP client. While we recommend Guzzle, you can use alternatives like `php-http/guzzle7-adapter` or `symfony/http-client` if preferred.
:::

### Configuration

When using the InfluxDB client with QuestDB:

- **URL**: Use your QuestDB HTTP endpoint (default: `http://localhost:9000`)
- **Token**: Not required - can be left empty or use any string
- **Bucket**: Not required - can be any string (ignored by QuestDB)
- **Organization**: Not required - can be any string (ignored by QuestDB)

:::warning Write API Only
QuestDB only supports the **InfluxDB v2 write API** when using this client. Query operations are not supported through the InfluxDB client - use QuestDB's PostgreSQL wire protocol or REST API for queries instead.
:::

### Example Code

```php title="Using InfluxDB v2 PHP client with QuestDB"
<?php
require __DIR__ . '/vendor/autoload.php';

use InfluxDB2\Client;
use InfluxDB2\Model\WritePrecision;
use InfluxDB2\Point;

// Create client - token, bucket, and org are not used by QuestDB
$client = new Client([
    "url" => "http://localhost:9000",
    "token" => "",  // Not required for QuestDB
    "bucket" => "default",  // Not used by QuestDB
    "org" => "default",  // Not used by QuestDB
    "precision" => WritePrecision::NS
]);

$writeApi = $client->createWriteApi();

// Write points using the Point builder
// Note: Omit ->time() to let QuestDB assign server timestamps
$point = Point::measurement("readings")
    ->addTag("city", "London")
    ->addTag("make", "Omron")
    ->addField("temperature", 23.5)
    ->addField("humidity", 0.343);

$writeApi->write($point);

// Write multiple points
$points = [
    Point::measurement("readings")
        ->addTag("city", "Madrid")
        ->addTag("make", "Sony")
        ->addField("temperature", 25.5)
        ->addField("humidity", 0.360),

    Point::measurement("readings")
        ->addTag("city", "New York")
        ->addTag("make", "Philips")
        ->addField("temperature", 20.5)
        ->addField("humidity", 0.330)
];

$writeApi->write($points);

// Always close the client
$client->close();
?>
```

### Benefits and Limitations

The Point builder provides several advantages:
- **Automatic ILP formatting and escaping** - No need to manually construct ILP strings
- **Built-in error handling** - The client handles HTTP errors and retries
- **Batching support** - Automatically batches writes for better performance
- **Clean API** - Fluent Point builder interface is easy to use

:::warning Timestamp Limitation
The InfluxDB PHP client **cannot be used with custom timestamps** when writing to QuestDB. When you call `->time()` with a nanosecond timestamp, the client serializes it in scientific notation (e.g., `1.76607297E+18`), which QuestDB's ILP parser rejects.

**Solution:** Always omit the `->time()` call and let QuestDB assign server-side timestamps automatically. This is the only reliable way to use the InfluxDB PHP client with QuestDB.

**If you need client-side timestamps:** Use the raw HTTP cURL approach (documented above) where you manually format the ILP string with full control over timestamp formatting.
:::

## ILP Over TCP Socket

TCP over socket provides higher throughput but is less reliable than HTTP. The message format is identical - only the transport changes.

Use TCP when:
- You need maximum ingestion throughput
- Your application can handle potential data loss on connection failures
- You're willing to implement your own connection management and error handling

### TCP Socket Example

Here's a basic example using PHP's socket functions:

```php title="Send ILP data via TCP socket"
<?php
error_reporting(E_ALL);

/* Allow the script to hang around waiting for connections. */
set_time_limit(0);

/* Turn on implicit output flushing so we see what we're getting
 * as it comes in. */
ob_implicit_flush();

$address = 'localhost';
$port = 9009;

/* Create a TCP/IP socket. */
$socket = socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
if ($socket === false) {
    echo "socket_create() failed: reason: " . socket_strerror(socket_last_error()) . "\n";
} else {
    echo "OK.\n";
}

echo "Attempting to connect to '$address' on port '$port'...";
$result = socket_connect($socket, $address, $port);
if ($result === false) {
    echo "socket_connect() failed.\nReason: ($result) " . socket_strerror(socket_last_error($socket)) . "\n";
} else {
    echo "OK.\n";
}

$row=utf8_encode("test_readings,city=London,make=Omron temperature=23.5,humidity=0.343 1465839830100400000\n");
echo "$row";
socket_write($socket, $row);
echo "\n";
socket_close($socket);

?>
```

This basic example:
- Connects to QuestDB's ILP port (default 9009)
- Sends a single row of data
- Closes the connection

For production use with TCP, you should:
- Keep connections open and reuse them for multiple rows
- Implement batching to reduce network overhead
- Add proper error handling and reconnection logic
- Consider using a connection pool for concurrent writes

:::warning TCP Considerations
TCP ILP does not provide acknowledgments for successful writes. If the connection drops, you may lose data without notification. For critical data, use HTTP ILP instead.
:::

## Choosing the Right Approach

| Feature | HTTP (cURL) | HTTP (InfluxDB Client) | TCP Socket |
|---------|-------------|------------------------|------------|
| **Reliability** | High - responses indicate success/failure | High - responses indicate success/failure | Low - no acknowledgment |
| **Throughput** | Good | Good | Excellent |
| **Error handling** | Manual via cURL | Built-in via client library | Manual implementation required |
| **Ease of use** | Medium - manual ILP formatting | High - Point builder API | Low - manual everything |
| **Custom timestamps** | ✅ Full control | ❌ Must use server timestamps | ✅ Full control |
| **Dependencies** | None (cURL built-in) | `influxdb-client-php`<br/>`guzzlehttp/guzzle` | None (sockets built-in) |
| **Authentication** | Standard HTTP auth | Standard HTTP auth | Limited options |
| **Recommended for** | Custom timestamps required | Ease of development, server timestamps acceptable | High-volume, loss-tolerant scenarios |

:::info Related Documentation
- [ILP reference documentation](/docs/ingestion/ilp/overview/)
- [HTTP REST API](/docs/query/rest-api/)
- [Authentication and security](/docs/security/rbac/)
:::
