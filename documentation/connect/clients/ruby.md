---
slug: /connect/clients/ruby
title: Ruby client for QuestDB
sidebar_label: Ruby
description: "Use the QuestDB Ruby client's connection pool for row, columnar, and Arrow ingestion plus SQL queries over QWP."
---

The QuestDB Ruby client uses one `QuestDB::Client` for ingestion and SQL
queries over [QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/).
Borrow a short-lived sender for each unit of row-building work, load whole
columns through the client, and run SQL with `query`.

The gem is a thin Ruby layer over the official
[C client](/docs/connect/clients/c-and-cpp/), so networking, TLS,
authentication, failover, and store-and-forward behave exactly as they do in
the other QWP clients.

:::note

`0.1.x` is the initial pre-1.0 release line. The API may change before 1.0;
changes are recorded in the
[changelog](https://github.com/questdb/ruby-questdb-client/blob/main/CHANGELOG.md).

:::

## Quick start

QuestDB 10.0 or newer and MRI Ruby 3.1 to 3.4 are required. Install the gem:

```bash
gem install questdb
```

or add it to your `Gemfile`:

```ruby
gem "questdb", "~> 0.1.0"
```

RubyGems installs a precompiled gem on x86-64 and ARM64 Linux (glibc 2.28+
and musl), x86-64 and ARM64 macOS, and x64 Windows. Linux variant selection
needs RubyGems 3.3.22 or newer, and musl users should use Bundler 2.5.6 or
newer. Other platforms build from source, which requires Rust 1.91.1 or
newer, a C compiler, and Make; all Rust dependencies are vendored, so the
build runs offline.

The following program writes one uniquely marked row through a pooled
sender, waits for the server to accept it, then polls for query visibility:

```ruby
require "questdb"

marker = "ruby-#{Process.pid}-#{Process.clock_gettime(Process::CLOCK_REALTIME, :nanosecond)}"

begin
  QuestDB.connect("ws::addr=localhost:9000;") do |client|
    client.sender do |sender|
      sender.row("ruby_quick_start",
                 symbols: { symbol: marker },
                 columns: { price: 2615.54 },
                 at: QuestDB::TimestampNanos.now)
      sender.flush(wait: true)
    end

    deadline = Process.clock_gettime(Process::CLOCK_MONOTONIC) + 10
    loop do
      rows = client.query("SELECT price FROM ruby_quick_start WHERE symbol = $1 LIMIT 1",
                          binds: [marker]).to_a
      if rows.any?
        puts "#{marker} #{rows.first["price"]}"
        break
      end
      raise "timed out waiting for query visibility" if Process.clock_gettime(Process::CLOCK_MONOTONIC) > deadline

      sleep 0.1
    end
  end
rescue QuestDB::Error => e
  warn "QuestDB error #{e.code} (in_doubt=#{e.in_doubt?}): #{e.message}"
  exit 1
end
```

`flush(wait: true)` confirms that QuestDB accepted the rows; query
visibility happens asynchronously, which is why the example polls.

Connection, protocol, and server failures raise `QuestDB::Error`; rescue it
and dispatch on `e.code` as shown. The [error taxonomy](#error-taxonomy)
describes the codes and the `in_doubt?` retry hazard.

## Connecting

Pass a `ws` (plain WebSocket) or `wss` (TLS) configuration string, or the
equivalent `host:` keywords:

```ruby
require "questdb"

client = QuestDB.connect("ws::addr=localhost:9000;")
client = QuestDB.connect(host: "localhost", port: 9000)
```

`port:` defaults to 9000 and `tls: true` selects `wss`. The two forms are
mutually exclusive. With either form, further configuration keys can be
passed as keyword arguments, for example `sender_pool_max: 8`; a keyword
cannot repeat a key already present in the string. IPv6 literals may be
passed to `host:` with or without brackets.

`QuestDB.connect` accepts only `ws`/`wss`; ILP schemes such as `http::` or
`tcp::` raise a `:config_error`. By default it also opens the pool's warm
sender connection (see `sender_pool_min` under
[Pool settings](#pool-settings)), so an unreachable server raises from
`QuestDB.connect` itself. Set `lazy_connect=on` to defer every connection to
the first operation that needs one. Later operations reuse pooled
connections.

With a block, `QuestDB.connect` yields the client and closes it when the
block exits. Without one, call `client.close` at shutdown.
`QuestDB::Client.from_conf(conf)` is the equivalent constructor.

To keep credentials out of code, put the configuration string in the
`QDB_CLIENT_CONF` environment variable and use `from_env`:

```ruby
client = QuestDB::Client.from_env
```

## Authentication and TLS

Put credentials and TLS settings in the configuration string, or pass them as
keywords:

```ruby
basic = QuestDB.connect(
  "wss::addr=db.example.com:9000;username=admin;password=#{ENV.fetch('QDB_PASSWORD')};"
)

token = QuestDB.connect(host: "db.example.com", tls: true,
                        token: ENV.fetch("QDB_TOKEN"))
```

Use either `username` and `password` (HTTP basic) or `token` (bearer), not
both. Authentication happens during the WebSocket upgrade, so bad credentials
raise `:auth_error` when the first connection opens: from `QuestDB.connect`
by default, or from the first operation with `lazy_connect=on`.

With `wss`, certificate and hostname verification are always on. Choose the
trust store with configuration keys:

| Setting | Meaning |
| --- | --- |
| `tls_ca=webpki_and_os_roots` | Bundled `webpki` roots plus the operating-system store. |
| `tls_ca=os_roots` | Use only the operating-system certificate store. |
| `tls_ca=webpki_roots` | Use only the bundled `webpki` root store. |
| `tls_roots=/path/to/ca.pem` | Use a private CA bundle; omit `tls_ca`. With `tls_roots_password`, JKS and PKCS#12 trust stores are accepted too. |

See the [connect string reference](/docs/connect/clients/connect-string/) for
the full grammar. Never commit credentials or log complete configuration
strings.

## The pool

A `QuestDB::Client` owns reusable QWP/WebSocket connections. Create one
client per process and share it across threads. Each operation borrows a
connection, opening one on demand, and returns it when the lease or result
closes; when every slot is busy, a borrow waits for a free one (see
[Pool settings](#pool-settings)).

Senders, readers, and query results are thread-affine leases: use each one on
the thread that borrowed it. The block forms return a lease exactly once,
even when the block raises, so prefer them:

```ruby
client.sender do |sender|
  # build and flush rows
end

client.reader do |reader|
  # run queries one after another
end

client.query("SELECT 1") do |result|
  # consume the result
end
```

`client.close` is idempotent and raises while any sender or reader lease is
still open. Clients and leases cannot be reused after `close` or after
`fork`; create a new client in the child process.

### Choose an API

| You have | Use | Why |
| --- | --- | --- |
| Events arriving one at a time | `client.sender` + `row` | Build rows field by field and flush them in batches. |
| Data already in Ruby arrays | `client.ingest_columns` | Send whole columns in one call, with commit and acknowledgement handled for you. |
| An Arrow stream, Polars frame, or Red Arrow table | `client.ingest_arrow` | Zero-copy Arrow ingestion; requires `require "questdb/arrow"`. |
| SQL to execute | `client.query(sql)` | Stream rows or batches, or materialize them. |
| Several queries in a row | `client.reader` | Lease one reader connection and run queries on it sequentially. |
| A statement to run (DDL, `INSERT`) | `client.execute(sql)` | Run, drain, and return the connection; output is discarded. |

Row senders use store-and-forward. `ingest_columns` and `ingest_arrow` use a
separate direct connection pool and block for an acknowledgement; they have
no ordering relationship with rows buffered on a sender.

## Row ingestion

Lease a sender for events that arrive one at a time. Build several rows, then
flush on your application's size or time boundary:

```ruby
require "questdb"

QuestDB.connect("ws::addr=localhost:9000;") do |client|
  client.sender do |sender|
    [["ETH-USDT", 2615.54, 0.00044], ["BTC-USDT", 65432.10, 0.00120]].each do |symbol, price, amount|
      sender.row("trades",
                 symbols: { symbol: symbol },
                 columns: { price: price, amount: amount },
                 at: QuestDB::TimestampNanos.now)
    end
    sender.flush
  end
end
```

`row` takes the table name, a `symbols:` hash for `SYMBOL` columns, a
`columns:` hash for everything else, and the mandatory `at:` designated
timestamp: a `QuestDB::TimestampNanos`, a `QuestDB::TimestampMicros`, a
`Time`, or `QuestDB::SERVER_TIMESTAMP` to let the server assign arrival time.
When QWP auto-creates a table, the designated timestamp column is named
`timestamp`: `TIMESTAMP_NS` for a `TimestampNanos` or a `Time`, and
`TIMESTAMP` (microseconds) for a `TimestampMicros` or `SERVER_TIMESTAMP`.
Column names may be strings or symbols.

Keep each timestamp's precision consistent within a batch. Mixing
`TimestampNanos` and `TimestampMicros` for `at:`, or for the same timestamp
column, in rows buffered together raises `:invalid_api_call` ("changes type
within a batched table").

A row append is atomic: if any value fails validation, the whole row is
discarded and earlier rows stay buffered. `sender.length` reports the number
of buffered, not yet published rows.

### Value types

The Ruby value type selects the QuestDB column type:

| Ruby value in `columns:` | QuestDB type |
| --- | --- |
| `true` / `false` | `BOOLEAN` |
| `Integer` (signed 64-bit) | `LONG` |
| `Float` | `DOUBLE` |
| `String` (UTF-8) | `VARCHAR` |
| `QuestDB::TimestampMicros`, `Time` | `TIMESTAMP` (microseconds) |
| `QuestDB::TimestampNanos` | `TIMESTAMP_NS` |
| `BigDecimal` | `DECIMAL`; an auto-created column is `DECIMAL(76, scale)` |
| `QuestDB::Float64Array` | `DOUBLE[]`, `DOUBLE[][]`, ... matching its shape |
| `nil` | Column omitted for this row, stored as null |

Strings in `symbols:` become interned `SYMBOL` values; strings in `columns:`
become `VARCHAR`. Plain Ruby arrays are rejected rather than guessed; wrap
array values in `QuestDB::Float64Array`. A `BigDecimal` value auto-creates a
`DECIMAL(76, scale)` column, using the value's scale. Create the table with
`CREATE TABLE` first when you want a smaller precision.

A `Time` used as a column value creates a `TIMESTAMP` (microsecond) column,
even though a `Time` used as `at:` creates a `TIMESTAMP_NS` designated
timestamp. Use `QuestDB::TimestampNanos.from_time(time)` for a nanosecond
column.

`UUID`, `IPv4`, `GEOHASH`, `LONG256`, `CHAR`, `DATE`, and `BINARY` have no
`row` value type. Write them with
[`ingest_columns`](#columnar-ingestion), which has explicit column kinds for
all of them, or with a SQL `INSERT` and binds.

QWP cannot preserve nulls for `BOOLEAN`, `BYTE`, `SHORT`, or `CHAR`: an
absent value is received as `false` or `0`. Use a wider nullable type when
the distinction matters.

:::note Auto-flush

The pooled sender auto-flushes at 1,000 rows, after 100 ms, or when its
estimated encoded size reaches 90% of the current QWP frame limit (8 MiB until
the server advertises one). The interval is checked only when you call `row`;
there is no background timer that flushes an idle buffer.

Override the thresholds with `auto_flush_rows`, `auto_flush_interval`, and
`auto_flush_bytes`, set one of them to `off` to disable it, or set
`auto_flush=off` to disable all of them. Auto-flush never waits for an
acknowledgement.

:::

`flush` publishes the buffered rows to the local queue and returns; delivery
continues in the background. `flush(wait: true)` additionally blocks until
the server acknowledges everything published on this lease, and
`wait(timeout_millis:)` is the standalone barrier with an explicit
no-progress timeout (`0`, the default, means no deadline). When the server
rejects data published on the lease, the wait raises
`QuestDB::ServerRejectionError`; see [Server rejections](#server-rejections).
When the block returns normally, the lease flushes remaining rows without
waiting. When the block raises, rows not yet flushed are discarded; rows
already flushed continue to be delivered.

For exact frame tracking, `flush_and_get_fsn` and
`flush_and_keep_and_get_fsn` return the published frame's sequence number,
`await_acked_fsn(fsn, timeout_millis:)` waits for its acknowledgement, and
`published_fsn` / `acked_fsn` report progress without blocking. FSNs belong
to the lease's pooled connection, so use them only while the lease is held.
Set `auto_flush=off` when `flush_and_get_fsn` must define exact batches.

### Arrays

`QuestDB::Float64Array` keeps its shape on the wire, so an N-dimensional
array lands in an N-dimensional `DOUBLE` column. Build one from nested
arrays with `from_nested`, or from flat values with
`Float64Array.new(values, shape: [rows, cols])`. This suits order book
snapshots, where one row carries a whole book:

```ruby
# shape [2, 2]: row 0 = prices, row 1 = sizes
bids = QuestDB::Float64Array.from_nested([[64901.6, 64901.5], [3.02, 0.06]])
asks = QuestDB::Float64Array.from_nested([[64901.7, 64901.8], [1.54, 0.21]])

client.sender do |sender|
  sender.row("order_book",
             symbols: { symbol: "BTC-USDT" },
             columns: { bids: bids, asks: asks },
             at: QuestDB::TimestampNanos.now)
  sender.flush(wait: true)
end
```

## Columnar ingestion

Use `client.ingest_columns` when the data already lives in columns. Each call
borrows a direct connection, publishes the columns in batches, blocks until
the server acknowledges the final batch, and returns the connection:

```ruby
client.ingest_columns(
  "trades",
  columns: {
    price: [2615.54, 65432.10],
    amount: QuestDB::ColumnVector.double([0.00044, nil])
  },
  symbols: { symbol: ["ETH-USDT", "BTC-USDT"] },
  at: [QuestDB::TimestampNanos.new(1_735_689_600_000_000_000),
       QuestDB::TimestampNanos.new(1_735_689_601_000_000_000)]
)
```

| Parameter | Meaning |
| --- | --- |
| `columns:` | Column name to an `Array` or `QuestDB::ColumnVector`; all columns must have the same length. |
| `symbols:` | Column name to an `Array` of strings, stored as `SYMBOL`. |
| `at:` | An `Array` of timestamps (one per row), one fixed timestamp for every row, or `QuestDB::SERVER_TIMESTAMP`. |
| `max_rows_per_batch:` | Rows per published batch, default 16,384. |
| `ack:` | `:ok` (default) or `:durable`; see [Delivery and durability](#delivery-and-durability). |

Homogeneous arrays are inferred conservatively: `Integer` becomes `LONG`,
`Float` becomes `DOUBLE`, and `String` becomes `VARCHAR`. Use
`QuestDB::ColumnVector` for an all-null column or to pick a specific type:
`byte`, `short`, `int`, `long`, `float`, `double`, `boolean`, `varchar`,
`binary`, `uuid`, `long256`, `ipv4`, `timestamp`, `timestamp_nanos`, `date`,
`char`, `geohash` (with `precision_bits:`), `decimal64` / `decimal128` /
`decimal256` (with `scale:`), and `double_array` (with `shape:`). For
example, `QuestDB::ColumnVector.int([1, 2, 3])`.

Geohash values are integers holding the geohash bits, 5 bits per base-32
character, not strings: `"u33d"` raises `ArgumentError`. The geohash `u33d`
is `QuestDB::ColumnVector.geohash([0xD0C6C], precision_bits: 20)`. To write
base-32 geohashes directly, use SQL, for example `INSERT ... VALUES (#u33d,
...)`.

Nullable kinds keep `nil` as SQL null. `BYTE`, `SHORT`, `BOOLEAN`, and `CHAR`
cannot store a distinct null, so their vectors reject `nil` instead of
silently writing a zero.

The input is validated and copied before any network work starts, so local
mistakes (mismatched lengths, bad UTF-8, wrong types) raise before a
connection is borrowed. The arrays are safe to modify once the call returns.

`ingest_columns` is not store-and-forward: it has no FSNs and no background
replay, and it commits once at the requested acknowledgement level. If it
fails after one or more batches were already sent, the raised error has
`in_doubt?` set to `true` and some rows may have been written. Do not retry
the whole input blindly; use a fixed `at:` timestamp and
[deduplication](/docs/concepts/deduplication/) when retries must be safe.

### Arrow and Polars

The optional Arrow adapter ingests anything that implements the Arrow C
Stream interface, including Polars data frames and Nanoarrow arrays, plus Red
Arrow tables and readers. It adds no dataframe gem dependency; install only
the library you use:

```ruby
require "polars-df"
require "questdb/arrow"

frame = Polars::DataFrame.new({
  "symbol" => ["ETH-USDT", "BTC-USDT"],
  "price" => [2615.54, 65432.10]
})

client.ingest_arrow("trades", frame,
                    at: QuestDB::TimestampNanos.now,
                    symbols: ["symbol"])
```

`at:` takes a timestamp column name or the same values as `ingest_columns`.
Arrow dictionary-encoded strings default to `SYMBOL` and plain strings to
`VARCHAR`; `symbols:` forces named string columns to `SYMBOL`, and
`schema_overrides:` covers QuestDB-specific types, for example
`{ address: :ipv4, grade: :char, location: [:geohash, 30] }`. The source is
consumed exactly once and committed with the same semantics as
`ingest_columns`.

## Querying

`client.query(sql)` returns a single-use `QueryResult` that streams result
batches from the server. With a block, the result is closed when the block
exits:

```ruby
client.query("SELECT timestamp, symbol, price FROM trades WHERE price > $1",
             binds: [2615.0]) do |result|
  result.each do |row|
    puts "#{row["symbol"]} #{row["price"]}"
  end
end
```

| Method | Yields or returns |
| --- | --- |
| `each` (the result is `Enumerable`) | One `Row` at a time. `row["price"]`, `row[:price]`, and `row[1]` all work; `to_h` and `to_a` convert it. |
| `each_values` | One frozen `Array` of values per row, without a `Row` wrapper. Use it for allocation-sensitive scans. |
| `each_batch` | One `ResultBatch` at a time, with `columns`, `rows`, and `row_count`. |
| `to_a` | Every `Row` in memory. |
| `to_polars`, `to_nanoarrow`, `to_red_arrow_table` | An Arrow-backed frame; requires `require "questdb/arrow"` and the matching gem. |

Every value is copied into ordinary Ruby objects before the next batch is
read, so rows stay valid after the result closes.

Fully draining a result returns its connection to the pool. Closing a
partially consumed result closes that connection instead, because unread
frames would corrupt the next query. `result.cancel` asks the server to stop
streaming an active query.

The Arrow methods drain the whole result into Arrow memory before returning,
so their peak memory is proportional to the result size. Use `each_batch` or
`each_values` when you need bounded memory.

### Bind parameters

`query` and `execute` bind positional parameters to `$1`..`$N`
placeholders. Always prefer binds over interpolating values into SQL:

```ruby
rows = client.query("SELECT * FROM trades WHERE symbol = $1 AND price > $2",
                    binds: ["ETH-USDT", 2615.0]).to_a
```

`binds:` must be an `Array`. Elements may be `nil`, `true`/`false`, a signed
64-bit `Integer`, `Float`, a UTF-8 `String`, `Time`,
`QuestDB::TimestampMicros`, `QuestDB::TimestampNanos`, or `BigDecimal`.
Wrapper classes cover the remaining types: `QuestDB::UUID`,
`QuestDB::Geohash`, `QuestDB::Long256`, `QuestDB::Char`,
`QuestDB::DateMillis`, and `QuestDB::TypedNull` for a null that SQL needs to
be of a specific type.

### Reader leases

`client.reader` leases one reader connection, the read-side twin of
`client.sender`. Run queries on it sequentially:

```ruby
client.reader do |reader|
  recent = reader.query("SELECT * FROM trades LIMIT 10").to_a
  count = reader.query("SELECT count() FROM trades").to_a.first[0]
end
```

A reader runs one query at a time: drain or close the previous result before
starting the next one.

### Result types

| QuestDB type | Ruby value |
| --- | --- |
| `BOOLEAN`, `BYTE`, `SHORT`, `INT`, `LONG` | `true`/`false` or `Integer` |
| `FLOAT`, `DOUBLE` | `Float` |
| `SYMBOL`, `VARCHAR` | UTF-8 `String` |
| `TIMESTAMP`, `TIMESTAMP_NS` | `QuestDB::TimestampMicros` / `QuestDB::TimestampNanos` (exact integer time; call `.value`) |
| `DATE` | `QuestDB::DateMillis` |
| `DECIMAL` | `QuestDB::DecimalValue`, keeping full precision |
| `UUID`, `IPv4`, `LONG256`, `GEOHASH`, `CHAR` | `QuestDB::UUID`, `QuestDB::IPv4`, `QuestDB::Long256`, `QuestDB::Geohash`, `QuestDB::Char` |
| `BINARY` | Binary (`ASCII-8BIT`) `String` |
| `DOUBLE[]` | `QuestDB::Float64Array` with the row's shape |

Reading a `DECIMAL` column with a precision of 9 or less fails: current
servers reject it with `:server_internal_error` ("QWP egress: unsupported
column type"). Precisions from 10 up to 76 read correctly. Cast a small
decimal to a wider type in the query when you need to read it, for example
`SELECT CAST(price AS DECIMAL(18, 2)) FROM ...`.

SQL null always becomes `nil`. `LONG[]` columns cannot be read yet and raise
an explicit unsupported-column error rather than returning wrong values.

### DDL and DML

Statements such as `CREATE`, `ALTER`, `INSERT`, `UPDATE`, and `DROP` go
through `execute`: it runs the statement, drains the result, and returns the
pooled connection in one call. Readers offer the same method:

```ruby
client.execute(<<~SQL)
  CREATE TABLE IF NOT EXISTS trades (
    timestamp TIMESTAMP, symbol SYMBOL, price DOUBLE, amount DOUBLE
  ) TIMESTAMP(timestamp) PARTITION BY DAY WAL
SQL
```

Whatever a statement returns is discarded; use `query` when you want the
result.

## Delivery and durability

Row senders always publish through a local store-and-forward queue. Without
`sf_dir` the queue is in memory. With `sf_dir`, each lease uses a disk slot,
and on restart the pool replays unacknowledged frames. Give each client that
shares an `sf_dir` a distinct `sender_id`. Disk mode protects against a
client process crash, but not against a host crash or power loss.

| Need | Use |
| --- | --- |
| Highest throughput | `flush`; delivery continues in the background |
| One-call delivery barrier | `flush(wait: true)` |
| Per-call deadline | `flush`, then `wait(timeout_millis:)` |

A `wait` timeout is a no-progress timeout: the data stays queued and
delivery continues, so retry `wait` rather than flushing the same rows again.

`flush(wait: true)` and `wait` observe the accepted (`OK`) acknowledgement:
the server has taken responsibility for the data, but it may not be
queryable yet. On QuestDB Enterprise with replication, `ack: :durable` waits
until the data has also been uploaded to object storage. It requires
`request_durable_ack=on` in the configuration string and works on `flush`,
`wait`, `ingest_columns`, and `ingest_arrow`. Without it, those calls raise
`:invalid_api_call` before sending anything.

Store-and-forward is bounded. When producers outrun the server, publication
waits for acknowledgements to free space, then fails with
`:server_flush_error`:

| Key | Default | Purpose |
| --- | --- | --- |
| `sf_max_segment_bytes` | `4 MiB` | Segment and single-payload size cap. |
| `sf_max_total_bytes` | `128 MiB` in memory, `10 GiB` on disk | Total queue budget per sender. |
| `sf_append_deadline_millis` | `30000` | Maximum no-progress wait for queue space. |
| `close_flush_timeout_millis` | `5000` | Best-effort drain window when a lease or the client closes. |

Columnar and Arrow ingestion use the direct connection pool and are not
affected by `sf_dir`.

## Concurrency and sizing

The client is thread-safe; share one per process. Each sender lease, reader
lease, and query result belongs to the thread that created it. Blocking
network work runs without the GVL, so ingestion threads genuinely overlap:

```ruby
client = QuestDB.connect("ws::addr=localhost:9000;sender_pool_min=4;sender_pool_max=16;")

threads = 4.times.map do |worker|
  Thread.new do
    client.sender do |sender|
      100.times do
        sender.row("trades",
                   symbols: { symbol: "ETH-USDT" },
                   columns: { price: 2615.54 + worker },
                   at: QuestDB::TimestampNanos.now)
      end
      sender.flush(wait: true)
    end
  end
end
threads.each(&:join)
client.close
```

### Pool settings

| Key | Default | Guidance |
| --- | --- | --- |
| `sender_pool_min` / `query_pool_min` | `1` | Warm minimum retained per pool after connections have been opened. |
| `sender_pool_max` / `query_pool_max` | `4` | Per-pool growth cap. Set it at or above peak concurrent leases. |
| `acquire_timeout_ms` | `5000` | How long a borrow waits for a free slot before failing. |
| `idle_timeout_ms` | `60000` | Idle lifetime for connections above the pool minimum. |
| `pool_reap` | `auto` | Use `manual` only if your application calls `client.reap_idle`. |

The sender and reader pools grow independently, and columnar ingestion uses a
third, direct pool. Keep leases short: a sender lease holds its slot until it
is returned, even while idle.

## Failover and errors

List every node of one deployment in a single `addr` list:

```ruby
client = QuestDB.connect("wss::addr=node-a:9000,node-b:9000,node-c:9000;target=primary;")
```

The client reconnects in the background and replays queued frames, within
these limits:

| Key | Default |
| --- | --- |
| `reconnect_max_duration_millis` | `300000` |
| `reconnect_initial_backoff_millis` | `100` |
| `reconnect_max_backoff_millis` | `5000` |

Authentication failures, protocol-version failures, and terminal data
rejections are not retried. When `flush(wait: true)` or `wait` makes no
progress within the budget it raises `:failover_retry`: the rows remain
queued and delivery continues, so retry the wait rather than sending the same
rows again.

Query failover restarts the query from the beginning. `to_a` and the Arrow
methods discard their partial result and replay transparently. The streaming
methods `each`, `each_values`, and `each_batch` raise
`:failover_would_duplicate` instead of repeating rows you have already
consumed; discard your partial state and rerun the query.

### Callbacks

Pass a `connection_listener` to observe connection state, and an
`error_handler` to receive [server rejections](#server-rejections):

```ruby
client = QuestDB.connect(
  "ws::addr=localhost:9000;",
  connection_listener: ->(event) { warn "#{event.kind} #{event.host}:#{event.port}" },
  error_handler: ->(error) { warn "rejected #{error.from_fsn}-#{error.to_fsn}: #{error.message}" }
)
```

Handlers run on dedicated Ruby threads, never on the client's network
threads, and receive frozen copies (`QuestDB::ConnectionEvent` and
`QuestDB::SenderError`). Each has a bounded, drop-oldest inbox, so a slow
handler cannot stall ingestion. Size the inboxes with the
`connection_event_inbox_capacity:` and `error_event_inbox_capacity:` keyword
arguments to `QuestDB.connect` (default 64). These are Ruby-only settings: in
the configuration string they are rejected with "Unknown config key". The
similarly named `error_inbox_capacity` is a different, native setting that
does belong in the configuration string; it sizes each connection's own
diagnostic ring, which `poll_error` on a sender lease reads. An exception in a handler is
printed with `warn` and dispatch continues. `client.poll_connection_event`
and `client.poll_error` return the same values without a handler, and
`connection_events_delivered`, `connection_events_dropped`,
`error_events_delivered`, and `error_events_dropped` report totals.

A handler that refers to its client keeps the client alive, so close it
explicitly.

### Server rejections

The server can reject published frames, for example after a schema mismatch,
once `flush` has already returned. Each rejection is sent to the
`error_handler` as a `QuestDB::SenderError` with `category`,
`applied_policy`, `status`, `message`, and the affected `from_fsn` /
`to_fsn` frame range. This covers every pooled connection, including
rejections for rows whose sender lease was already returned. Without a
handler, every rejection is logged, so rejections are never silent.

A terminal rejection, such as a schema mismatch, is also raised on the sender
lease that published the data: `flush(wait: true)` or `wait` raises
`QuestDB::ServerRejectionError` with code `:server_rejection`, and its
`sender_error` carries the same diagnostic. Plain `flush` does not wait, so
it does not raise.

Do not keep using a lease after a terminal rejection. It still remembers the
rejected row's column types, so the next `row` for that table can fail with
a misleading `:invalid_api_call` ("column ... changes type within a batched
table"). Let the lease go (leave the block, or call `close`) and borrow a new
one:

```ruby
begin
  client.sender do |sender|
    # trades.price is a DOUBLE column, so the server rejects a string
    sender.row("trades", columns: { price: "not-a-number" }, at: QuestDB::TimestampNanos.now)
    sender.flush(wait: true)
  end
rescue QuestDB::ServerRejectionError => e
  warn "rejected: #{e.sender_error&.category}: #{e.message}"
end

client.sender do |sender|
  # a fresh lease works normally
end
```

### Error taxonomy

Connection, protocol, and server failures raise `QuestDB::Error` (or its
subclass `QuestDB::ServerRejectionError`). Invalid Ruby arguments, such as a
plain array in `columns:` or `nil` in a `boolean` column vector, raise
`TypeError` or `ArgumentError` before anything is sent. Inspect a
`QuestDB::Error` with:

| Method | Meaning |
| --- | --- |
| `code` | A `Symbol` such as `:config_error` or `:failover_retry`. |
| `in_doubt?` | `true` when the failed operation may already have delivered its input; retrying can duplicate rows without deduplication. |
| `sender_error` | The structured server diagnostic (`QuestDB::SenderError`) for QWP sender failures, or `nil`. |

Codes you will most often dispatch on:

| Code | Raised when | Action |
| --- | --- | --- |
| `:config_error` | Malformed configuration, or a scheme other than `ws`/`wss`. | Fix the configuration. |
| `:socket_error` | No endpoint could be reached, for example from `QuestDB.connect` when the server is down. | Check the address and that the server is running, or use `lazy_connect=on` to connect on first use. |
| `:auth_error` | Credentials rejected during the WebSocket upgrade. | Fix or rotate the credentials. |
| `:tls_error`, `:handshake_error` | TLS or upgrade failure; for example the server does not support QWP. | Check the CA setup and that the server is QuestDB 10.0 or newer. |
| `:invalid_api_call` | Client-side misuse: a lease used from another thread, a closed client, an exhausted pool. | Fix the call pattern, or raise the pool limits. |
| `:invalid_timestamp` | A bad `at:` value. | Pass a timestamp wrapper, a `Time`, or `QuestDB::SERVER_TIMESTAMP`. |
| `:failover_retry` | `flush(wait: true)` or `wait` made no progress within the budget. | Retry the wait; do not send the rows again. |
| `:failover_would_duplicate` | Failover during a streaming query. | Discard partial state and rerun the query. |
| `:server_rejection` | `flush(wait: true)` or `wait` after the server terminally rejected published data, as `QuestDB::ServerRejectionError`. | Inspect `sender_error`, fix the data or the schema, and continue on a new sender lease. |
| `:protocol_version_error` | The server lacks a requested capability, such as durable acknowledgements. | Remove the option or upgrade the server. |

Message text is not a stable API: dispatch on `code` and
`sender_error.category`, not on message contents. Messages can contain table
names, column names, and SQL fragments, so sanitize them before showing them
to end users.

### Server information

`client.server_info` snapshots the server handshake: the cluster role
(`:standalone`, `:primary`, `:replica`, ...), the failover epoch,
capabilities, and cluster and node identifiers.

## Standalone sender

`QuestDB::Sender` owns a single QWP/WebSocket connection outside any pool.
Use it when you want manual control of one connection: explicit buffers,
frame sequence numbers, and, with `qwp_ws_progress=manual`, driving network
progress yourself through `drive_once`:

```ruby
QuestDB::Sender.from_conf("ws::addr=localhost:9000;auto_flush=off;").open do |sender|
  sender.row("metrics", columns: { value: 1 }, at: QuestDB::TimestampNanos.now)
  sender.flush(wait: true)
end
```

Its row API matches the pooled sender, but its auto-flush defaults are 600
rows and 1,000 ms. A standalone sender is thread-affine; close it explicitly
or use the `open` block form. For most applications, the pooled client is the
simpler choice.

## Production shape: TLS, token, multi-host

A production-shaped configuration combines TLS with operating-system trust
roots, a bearer token, two endpoints, and a disk-backed store-and-forward
spool:

```ruby
require "questdb"

conf = "wss::addr=db-primary.example.com:9000,db-replica.example.com:9000;" \
       "token=#{ENV.fetch('QDB_TOKEN')};" \
       "tls_ca=os_roots;" \
       "sf_dir=/var/spool/questdb;" \
       "sender_id=ingest-01;"

begin
  QuestDB.connect(conf) do |client|
    client.sender do |sender|
      sender.row("trades",
                 symbols: { symbol: "ETH-USDT" },
                 columns: { price: 2615.54, amount: 0.00044 },
                 at: QuestDB::TimestampNanos.now)
      sender.flush(wait: true)
    end
  end
rescue QuestDB::Error => e
  warn "ingest failed: #{e.message} (code=#{e.code}, in_doubt=#{e.in_doubt?})"
  exit 1
end
```

Flushed frames land in the `sf_dir` spool, so a process restart with the
same `sender_id` replays anything not yet acknowledged.

## Next steps

- [Ruby client on GitHub](https://github.com/questdb/ruby-questdb-client),
  with more guides and examples
- [Connect string reference](/docs/connect/clients/connect-string/)
- [QWP protocol](/docs/connect/wire-protocols/qwp-ingress-websocket/)
- [Python client](/docs/connect/clients/python/), which this client mirrors
- [Query overview](/docs/query/overview/)
