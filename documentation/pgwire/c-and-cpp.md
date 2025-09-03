---
title: C/C++ PGWire Guide
description:
  C and C++ clients for QuestDB over the PostgreSQL wire protocol (PGWire).
  Learn how to connect and query time-series data from C and C++.
---

QuestDB speaks the PostgreSQL wire protocol (PGWire), so standard PostgreSQL
clients for C and C++ work for querying.

We test and recommend:

- **C**: [`libpq`](https://www.postgresql.org/docs/current/libpq.html) (the official PostgreSQL C client library)
- **C++**: [`libpqxx`](https://github.com/jtv/libpqxx) (a modern C++ wrapper over `libpq`)

Other PGWire-compatible clients may also work, but we don’t test them. If you find
a client that doesn’t work, please
[open an issue](https://github.com/questdb/questdb/issues/new?template=bug_report.yaml).

:::tip
For **data ingestion**, use QuestDB’s high-throughput
[InfluxDB Line Protocol (ILP)](/docs/ingestion-overview/) instead of PGWire.
PGWire is best for **querying**.
:::




## Connection Parameters

All C/C++ PostgreSQL clients use the same parameters:

- **Host**: QuestDB server (default: `localhost`)
- **Port**: PGWire port (default: `8812`)
- **Username**: (default: `admin`)
- **Password**: (default: `quest`)
- **Database**: (default: `qdb`)


---

## C with libpq


### Basic Connection

```c
// c_pgwire_basic.c
#include <stdio.h>
#include <stdlib.h>
#include <libpq-fe.h>

static void die(PGconn *conn, const char *msg) {
  fprintf(stderr, "%s: %s\n", msg, PQerrorMessage(conn));
  PQfinish(conn);
  exit(1);
}

int main(void) {
  const char *conninfo =
    "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest ";

  PGconn *conn = PQconnectdb(conninfo);
  if (PQstatus(conn) != CONNECTION_OK) die(conn, "Connection failed");

  PGresult *res = PQexec(conn, "SELECT version()");
  if (PQresultStatus(res) != PGRES_TUPLES_OK) die(conn, "Query failed");

  printf("Connected. Server reports: %s\n", PQgetvalue(res, 0, 0));
  PQclear(res);

  PQfinish(conn);
  return 0;
}
```

### Querying Data

```c
// c_pgwire_query.c
#include <stdio.h>
#include <stdlib.h>
#include <libpq-fe.h>

static void die(PGconn *conn, const char *msg) {
  fprintf(stderr, "%s: %s\n", msg, PQerrorMessage(conn));
  PQfinish(conn);
  exit(1);
}

int main(void) {
  PGconn *conn = PQconnectdb(
    "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest ");

  if (PQstatus(conn) != CONNECTION_OK) die(conn, "Connection failed");

  PGresult *res = PQexec(conn,
    "SELECT timestamp, symbol, price FROM trades ORDER BY timestamp DESC LIMIT 10");
  if (PQresultStatus(res) != PGRES_TUPLES_OK) die(conn, "Query failed");

  int rows = PQntuples(res);
  for (int i = 0; i < rows; ++i) {
    const char *ts     = PQgetvalue(res, i, 0);
    const char *symbol = PQgetvalue(res, i, 1);
    const char *price  = PQgetvalue(res, i, 2);
    printf("%s  %-10s  %s\n", ts, symbol, price);
  }

  PQclear(res);
  PQfinish(conn);
  return 0;
}
```

### Parameterized Queries (Prepared Statements)

```c
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <libpq-fe.h>

static void die(PGconn *conn, const char *msg) {
  fprintf(stderr, "%s: %s\n", msg, PQerrorMessage(conn));
  PQfinish(conn);
  exit(1);
}

int main(void) {
  PGconn *conn = PQconnectdb(
    "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest ");

  if (PQstatus(conn) != CONNECTION_OK) die(conn, "Connection failed");

  const char *sql =
    "SELECT timestamp, symbol, price "
    "FROM trades "
    "WHERE symbol = $1 AND timestamp >= $2 "
    "ORDER BY timestamp "
    "LIMIT 10";

  PGresult *prep = PQprepare(conn, "q1", sql, 2, NULL);
  if (PQresultStatus(prep) != PGRES_COMMAND_OK) die(conn, "Prepare failed");
  PQclear(prep);

  // Compute 7 days ago in UTC and format as ISO-8601 with microseconds + Z
  time_t now = time(NULL);
  time_t seven_days_ago = now - 7 * 24 * 60 * 60;

  struct tm gmt;
  gmtime_r(&seven_days_ago, &gmt);

  char iso[40];
  strftime(iso, sizeof iso, "%Y-%m-%dT%H:%M:%S", &gmt);

  char ts_param[64];
  // QuestDB parses e.g. 2025-08-27T12:34:56.000000Z
  snprintf(ts_param, sizeof ts_param, "%s.000000Z", iso);

  const char *paramValues[2] = { "BTC-USD", ts_param };

  PGresult *res = PQexecPrepared(conn, "q1", 2, paramValues, NULL, NULL, 0);
  if (PQresultStatus(res) != PGRES_TUPLES_OK) die(conn, "Exec prepared failed");

  int rows = PQntuples(res);
  for (int i = 0; i < rows; ++i) {
    printf("%s  %s  %s\n",
      PQgetvalue(res, i, 0), // "timestamp" (UTC text)
      PQgetvalue(res, i, 1), // symbol
      PQgetvalue(res, i, 2)  // price
    );
  }

  PQclear(res);
  PQfinish(conn);
  return 0;
}
```

### Time-Series Helpers (SAMPLE BY, LATEST ON)

```c
// c_pgwire_timeseries.c
#include <stdio.h>
#include <stdlib.h>
#include <libpq-fe.h>

static void die(PGconn *conn, const char *msg) {
  fprintf(stderr, "%s: %s\n", msg, PQerrorMessage(conn));
  PQfinish(conn);
  exit(1);
}

int main(void) {
  PGconn *conn = PQconnectdb(
    "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest ");

  if (PQstatus(conn) != CONNECTION_OK) die(conn, "Connection failed");

  const char *q1 =
    "SELECT timestamp, symbol, avg(price) AS avg_price, min(price) AS min_price, max(price) AS max_price "
    "FROM trades WHERE timestamp >= dateadd('d', -7, now()) SAMPLE BY 1h";

  PGresult *r1 = PQexec(conn, q1);
  if (PQresultStatus(r1) != PGRES_TUPLES_OK) die(conn, "SAMPLE BY failed");

  int rows = PQntuples(r1);
  for (int i = 0; i < rows; ++i) {
    printf("%s  %-10s  avg=%s  range=%s..%s\n",
      PQgetvalue(r1, i, 0),
      PQgetvalue(r1, i, 1),
      PQgetvalue(r1, i, 2),
      PQgetvalue(r1, i, 3),
      PQgetvalue(r1, i, 4));
  }
  PQclear(r1);

  PGresult *r2 = PQexec(conn, "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol");
  if (PQresultStatus(r2) != PGRES_TUPLES_OK) die(conn, "LATEST ON failed");

  rows = PQntuples(r2);
  for (int i = 0; i < rows; ++i) {
    printf("symbol=%-10s  price=%s  timestamp=%s\n",
      PQgetvalue(r2, i, 1), // symbol
      PQgetvalue(r2, i, 2), // price
      PQgetvalue(r2, i, 0)  // timestamp (UTC text)
    );
  }
  PQclear(r2);

  PQfinish(conn);
  return 0;
}
```

---

## C++ with libpqxx


### Basic Connection and Query

```cpp
// cpp_pqxx_basic.cpp
#include <pqxx/pqxx>
#include <iostream>

int main() {
  try {
    std::string conninfo =
      "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest ";

    pqxx::connection c{conninfo};
    if (!c.is_open()) {
      std::cerr << "Connection failed\n";
      return 1;
    }

    pqxx::work tx{c};
    auto r = tx.exec("SELECT timestamp, symbol, price FROM trades ORDER BY timestamp DESC LIMIT 5");
    for (const auto &row : r) {
      std::cout << row["timestamp"].c_str() << "  "
                << row["symbol"].c_str() << "  "
                << row["price"].c_str() << "\n";
    }
    tx.commit();
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }
  return 0;
}
```

### Prepared Statements

```cpp
// cpp_pqxx_prepared.cpp (fixed)
#include <pqxx/pqxx>
#include <iostream>
#include <ctime>
#include <iomanip>
#include <sstream>

int main() {
  try {
    pqxx::connection c{
      "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest"
    };
    pqxx::work tx{c};


    // --- compute 7 days ago in UTC ---
    std::time_t now = std::time(nullptr);
    std::time_t seven_days_ago = now - 7 * 24 * 60 * 60;
    std::tm gmt{};
    gmtime_r(&seven_days_ago, &gmt);

    std::ostringstream oss;
    oss << std::put_time(&gmt, "%Y-%m-%dT%H:%M:%S") << ".000000Z";
    std::string start = oss.str();

    const std::string sym = "BTC-USD";

    pqxx::params p;
    p.append(sym);
    p.append(start);

    pqxx::result r = tx.exec(
    "SELECT timestamp, symbol, price "
    "FROM trades WHERE symbol=$1 AND timestamp >= $2 "
    "ORDER BY timestamp LIMIT 10",
    p
    );

    for (const auto &row : r) {
      std::cout << row["timestamp"].c_str() << "  "
                << row["symbol"].c_str() << "  "
                << row["price"].c_str() << "\n";
    }

    tx.commit();
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }
  return 0;
}
```

### Time-Series Queries (SAMPLE BY, LATEST ON)

```cpp
// cpp_pqxx_timeseries.cpp
#include <pqxx/pqxx>
#include <iostream>

int main() {
  try {
    pqxx::connection c{
      "host=127.0.0.1 port=8812 dbname=qdb user=admin password=quest "
    };
    pqxx::work tx{c};

    auto q1 =
      "SELECT timestamp, symbol, avg(price) AS avg_price, min(price) AS min_price, max(price) AS max_price "
      "FROM trades WHERE timestamp >= dateadd('d', -7, now()) SAMPLE BY 1h";

    for (auto const &row : tx.exec(q1)) {
      std::cout << row["timestamp"].c_str() << "  "
                << row["symbol"].c_str() << "  "
                << "avg=" << row["avg_price"].c_str()
                << "  range=" << row["min_price"].c_str()
                << ".." << row["max_price"].c_str() << "\n";
    }

    std::cout << "\nLATEST ON per symbol\n";
    for (auto const &row : tx.exec("SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol")) {
      std::cout << "symbol=" << row["symbol"].c_str()
                << "  price=" << row["price"].c_str()
                << "  timestamp=" << row["timestamp"].c_str() << "\n";
    }

    tx.commit();
  } catch (const std::exception &e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }
  return 0;
}
```

---

## Known Limitations with QuestDB

- Some PostgreSQL-specific features (complex transaction semantics, exotic data types, certain metadata calls) may not be fully supported.
- Cursors/scrollable result sets and some ORM expectations may behave differently than in PostgreSQL.
- Prefer **querying** via PGWire and **ingestion** via ILP for best throughput.

## Troubleshooting

**Connection issues**
1. Verify QuestDB is running and listening on port **8812**.
2. Check credentials and network access.
3. Try a minimal query: `SELECT 1`.
4. Inspect QuestDB server logs for connection or auth errors.

**Timestamp confusion**
- Remember: **QuestDB stores and encodes timestamps always as UTC**.

## Conclusion

Using `libpq` (C) or `libpqxx` (C++) you can query QuestDB over PGWire with minimal friction.
Leverage time-series SQL like `SAMPLE BY` and `LATEST ON` for efficient queries. For ingestion,
use ILP for maximum throughput.
