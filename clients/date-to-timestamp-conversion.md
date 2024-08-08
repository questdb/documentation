---
title: Date to Timestamp Conversion
sidebar_label: Date to Timestamp
description: Python, Go, JAVA, JavaScript, C/C++, Rust, .Net, PHP, or Ruby.
---


# Date to Timestamp Conversion in Different Programming Languages

Most languages have a dedicated type for dates or timestamps, with the notable exception of C. In this guide, we show how to  convert from a literal string representing a date into the native `Date` type, and then
into a `Timestamp` type using Python, Go, Java, C, C++, Rust, C#/.NET, JavaScript/Node.js, Ruby, and PHP.

QuestDB has clients for Python, Go, Java, C, C++, Rust, Rust, C#/dotnet, and JavaScript/Nodejs. Some of the clients
can directly use the `Timestamp` type when using the client, while others need to convert the timestamp into an
integer representing the epoch time in microseconds. On each of the snippets, we add the extra conversion if needed.

Please refer to the [ingestion overview](https://questdb.io/docs/ingestion-overview/) to learn more about the details of the client library for your language.

## Date to Timestamp in Python

The `datetime.date` type stores only date information, while `datetime.datetime` stores both date and time information.
The QuestDB Python client accepts either a `datetime.datetime` object, or a `pandas.timestamp`.

```python
from datetime import datetime, date
import pandas as pd
from questdb.ingress import Sender

date_str = '2024-08-05'

# Note that since we want the timestamp, we could directly parse into a Datetime object, but for
# reference purposes we want to first have a Date object, to illustrate how to convert Date to Datetime
date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
print(f"Date object: {date_obj}")

# Convert to datetime object. This object can be passed in the QuestDB Python API 'columns' dictionary
datetime_obj = datetime.combine(date_obj, datetime.min.time())
print(f"DateTime object: {datetime_obj}")

# Now you can pass the datetime_obj to the QuestDB sender, as in
# ...
# columns={'NonDesignatedTimestampColumnName': datetime_obj,
# ...


# Optionally convert to pandas Timestamp. The QuestDB python exposes a Dataframe API and accepts pd.Timestamp columns
pd_timestamp = pd.Timestamp(datetime_obj)
print(f"Pandas Timestamp: {pd_timestamp}")

```
Learn more about the [QuestDB Python Client](/docs/clients/ingest-python/)

## Date to Timestamp in Go

The `time.Time` type stores both date and time information. It is used for most time-related tasks in Go, such as
parsing dates, formatting dates, and time arithmetic.

The QuestDB Go client needs the timestamp as an `int64` in microseconds, so we will need to convert it.

```go
package main

import (
    "fmt"
    "time"
    "github.com/questdb/go-questdb-client/v3"
)

func main() {
    dateStr := "2024-08-05"

    // Layout string to match the format of dateStr
    layout := "2006-01-02"

    // Parse the date string into a time.Time object
    dateObj, err := time.Parse(layout, dateStr)
    if err != nil {
        fmt.Println("Error parsing date:", err)
        return
    }

    // Convert the dateObj to a timestamp in microseconds
    timestamp := dateObj.UnixNano() / int64(time.Microsecond)

    fmt.Println("Date:", dateObj)
    fmt.Println("Timestamp (microseconds):", timestamp)

    // Now you can call add the column to the QuestDB client, as in
    // ...
    // TimestampColumn("NonDesignatedTimestampColumnName", timestamp).
    // ...
}

```
Learn more about the [QuestDB Go Client](/docs/clients/ingest-go/)

## Date to Timestamp in Java

The `java.time.LocalDate` type stores only date information, while `java.time.LocalDateTim`e stores both date and time
information.

The QuestDB Java Client needs either an `java.time.Instant` or as a `long` number representing the Epoch. When using a `long`,
you need to provide the units via `java.time.temporal.ChronoUnit`.

Example using `Instant`

```java
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import io.questdb.client.Sender;

public class Main {
    public static void main(String[] args) {
        String dateStr = "2024-08-05";
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        // Note we are only converting to Date for educational purposes, but we really need the timestamp for QuestDB
        LocalDate date = LocalDate.parse(dateStr, formatter);

        // Convert LocalDate to Instant at the start of the day in the default time zone
        Instant instant = date.atStartOfDay(ZoneId.systemDefault()).toInstant();

        System.out.println("Date: " + date);
        System.out.println("Instant: " + instant);

        // Example method call using QuestDB API
        try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
            sender.table("trades")
                    .symbol("symbol", "ETH-USD")
                    .symbol("side", "sell")
                    .timestampColumn("NonDesignatedTimestampColumnName", instant)
                    .doubleColumn("price", 2615.54)
                    .doubleColumn("amount", 0.00044)
                    .atNow();
    }
}
```

Example using a `long` with Epoch in microseconds and `java.time.temporal.ChronoUnit`

```java
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import io.questdb.client.Sender;

public class Main {
    public static void main(String[] args) {
        String dateStr = "2024-08-05";
        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd");
        // Note we are only converting to Date for educational purposes, but we really need the timestamp for QuestDB
        LocalDate date = LocalDate.parse(dateStr, formatter);

        // Convert LocalDate to LocalDateTime at the start of the day
        LocalDateTime dateTime = date.atStartOfDay();

        // Convert LocalDateTime to epoch microseconds
        long epochMicro = dateTime.toInstant(ZoneOffset.UTC).toEpochMilli() * 1000;

        System.out.println("Epoch in Microseconds: " + epochMicro);

        // Example method call using QuestDB API
        try (Sender sender = Sender.fromConfig("http::addr=localhost:9000;")) {
            sender.table("trades")
                    .symbol("symbol", "ETH-USD")
                    .symbol("side", "sell")
                    .timestampColumn("NonDesignatedTimestampColumnName", epochMicro, ChronoUnit.MICROS)
                    .doubleColumn("price", 2615.54)
                    .doubleColumn("amount", 0.00044)
                    .atNow();

    }

}
```

Learn more about the [QuestDB Java Client](/docs/clients/java-ilp/)

##  Date to Timestamp in C

Standard C does not have a native `Date type`, but `struct tm` in `<time.h>` can store both date and time information.

The QuestDB C client needs the timestamp as an `int64_t` in microseconds, so we will need to convert it.

```c
#include <stdio.h>
#include <time.h>
#include <stdint.h>
#include <questdb/ingress/line_sender.hpp>


int main() {
    char dateStr[] = "2024-08-05";
    struct tm tm = {0};
    strptime(dateStr, "%Y-%m-%d", &tm);

    // Convert to time_t (seconds since Epoch)
    time_t seconds = mktime(&tm);

    // Convert to microseconds
    int64_t microseconds = (int64_t)seconds * 1000000;
    printf("Date: %s, Timestamp (microseconds): %ld
", dateStr, microseconds);

    // you can now pass the microseconds variable to the QuestDB client line_sender_buffer_column_ts_micros function

    return 0;
}
```

Learn more about the [QuestDB C Client](/docs/clients/ingest-c-and-cpp/#c-1)

## Date to Timestamp in C++

The `std::chrono::year_month_da`y type from C++20 stores only date information, while `std::chrono::time_point` stores
both date and time information.

The QuestDB C++ client accepts an int64_t as microseconds, but also a
`std::chrono::time_point<ClockT, std::chrono::nanoseconds>` or a `std::chrono::time_point<ClockT, DurationT>`.

```cpp
#include <iostream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <questdb/ingress/line_sender.hpp>


int main() {
    std::string dateStr = "2024-08-05";
    std::istringstream iss(dateStr);
    std::tm tm = {};
    iss >> std::get_time(&tm, "%Y-%m-%d");

    // Convert to time_point (timestamp)
    auto tp = std::chrono::system_clock::from_time_t(std::mktime(&tm));
    auto microseconds = std::chrono::duration_cast<std::chrono::microseconds>(tp.time_since_epoch()).count();

    std::cout << "Date: " << std::put_time(&tm, "%Y-%m-%d") << ", Timestamp (microseconds): " << microseconds << std::endl;

    // You can nos pass the microseconds variable to the QuestDB column function, converting to int64_t using the
    // timestamp_micros function
    // .column("NotDesignatedTimestampColumnName",questdb::ingress::timestamp_micros(microseconds)

    return 0;
}
```
Learn more about the [QuestDB C++ Client](/docs/clients/ingest-c-and-cpp/)

## Date to Timestamp in Rust

The `chrono::NaiveDate` type stores only date information, while `chrono::NaiveDateTime` stores both date and time
information.

The QuestDB Rust client accepts either a `i64` Epoch in microseconds, or a `chrono::Datetime`.

```rust
extern crate chrono;
use questdb::ingress::{Sender, Buffer, TimestampMicros}
use chrono::{NaiveDate, NaiveDateTime};

fn main() {
    let date_str = "2024-08-05";
    let date_obj = NaiveDate::parse_from_str(date_str, "%Y-%m-%d").expect("Failed to parse date");

    // Convert to NaiveDateTime for timestamp
    let datetime = date_obj.and_hms(0, 0, 0);
    let timestamp = datetime.timestamp_micros();

    println!("Date: {}", date_obj);
    println!("Timestamp (microseconds): {}", timestamp);

    // You can now use this timestamp to call the .column_ts QuestDB API
    // .column_ts("NonDesignatedTimestampColumnName", TimestampMicros::new(timestamp))?



}
```
Learn more about the [QuestDB Rust Client](/docs/clients/ingest-rust/)

## Date to Timestamp in C#/.Net

The `System.DateTime` type stores both date and time information. There is also `System.DateOnly` for only date information
in .NET 6 and later.

The QuestDB Dotnet client accepts `DateTime` or `DateTimeOffset` objects. Showing both options below.

```csharp
using System;
using QuestDB;


class Program
{
    static void Main()
    {
        string dateStr = "2024-08-05";

        // Parse the date string into a DateTime object
        DateTime date = DateTime.ParseExact(dateStr, "yyyy-MM-dd", null);
        Console.WriteLine("DateTime: " + date);

        // You can now call the QuestDB API adding a column, as in
        // sender.Column("NonDesignatedTimestampColumnName", date);


        // Parse the date string into a DateTimeOffset object
        DateTimeOffset dateOffset = DateTimeOffset.ParseExact(dateStr, "yyyy-MM-dd", null);
        Console.WriteLine("DateTimeOffset: " + dateOffset);

        // You can now call the QuestDB API adding a column, as in
        // sender.Column("NonDesignatedTimestampColumnName", dateOffset);
    }
}

```
Learn more about the [QuestDB .Net Client](/docs/clients/ingest-dotnet/)

## Date to Timestamp in Javascript/nodejs

The Date type stores both date and time information.

The QuestDB Nodejs client accepts an Epoch in microsecondsm which can be `number` or `bigint`.

```javascript
const { Sender } = require("@questdb/nodejs-client")

const dateStr = '2024-08-05';
const dateObj = new Date(dateStr + 'T00:00:00Z');

// Convert to timestamp (milliseconds since Epoch) then convert to microseconds
const timestamp = BigInt(dateObj.getTime()) * 1000n;
console.log("Date:", dateObj.toISOString().split('T')[0]);
console.log("Timestamp (microseconds):", timestamp.toString());

// You can now add the column using QuestDB client, as in
// .timestampColumn("NonDesignatedTimestampColumnName", timestamp)
```

Learn more about the [QuestDB Node.js Client](/docs/clients/ingest-node/)

## Date to Timestamp in Ruby

The `Date` class stores only date information, while the `DateTime` class stores both date and time information.

QuestDB does not have an official Ruby client, but you can send a request composing the ILP messages and passing
an Epoch in nanoseconds for the designated timestamp, or in microseconds for the rest of columns. An alternative
is using the [InfluxDB Ruby Client](https://github.com/influxdata/influxdb-client-ruby), which is compatible with
QuestDB ingestion.

```ruby
require 'date'

date_str = '2024-08-05'
date_obj = Date.parse(date_str)

# Convert to DateTime for timestamp in microseconds
datetime_obj = DateTime.parse(date_str)
timestamp = (datetime_obj.to_time.to_i * 1_000_000) + (datetime_obj.to_time.usec)

puts "Date: #{date_obj}"
puts "Timestamp (microseconds): #{timestamp}"
```

Learn more about the [Composing ILP Messages](/docs/reference/api/ilp/advanced-settings/)


## Date to Timestamp in PHP

The `DateTime` class stores both date and time information. The `DateTimeImmutable` class also stores both date and time
 information.

QuestDB does not have an official PHP client, but you can send a request composing the ILP messages and passing
an Epoch in nanoseconds for the designated timestamp, or in microseconds for the rest of columns. An alternative
is using the [InfluxDB PHP Client](https://github.com/influxdata/influxdb-client-php), which is compatible with
QuestDB ingestion.

```php
<?php
$date_str = '2024-08-05';
$date_obj = DateTime::createFromFormat('Y-m-d', $date_str);

// Timestamp in microseconds
$timestamp = $date_obj->getTimestamp() * 1000000;

echo "Date: " . $date_obj->format('Y-m-d') . "
";
echo "Timestamp (microseconds): " . $timestamp . "
";
?>
```

Learn more about the [Composing ILP Messages](/docs/reference/api/ilp/advanced-settings/)

