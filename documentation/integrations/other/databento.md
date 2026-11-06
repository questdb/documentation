---
title: Databento with Python
sidebar_label: Databento with Python
description:
  Ingest live Databento market data into QuestDB Open Source with the Databento
  and QuestDB Python clients, then query it and chart it on a live dashboard.
---

import Screenshot from "@theme/Screenshot"

:::tip QuestDB Enterprise

For QuestDB Enterprise, use the
[Databento connector](/docs/connect/connectors/databento/) for per-schema table
mappings, Historical backfills, and checkpointed recovery. This guide uses
Python to integrate Databento with QuestDB Open Source.

:::

[Databento](https://databento.com/) provides normalized market data from many
venues through a single API. This guide subscribes to Live top-of-book quotes
with the Databento Python client and writes them to QuestDB with the QuestDB
Python client over [QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/).
You can then query the quotes in SQL and chart them on a live dashboard in the
QuestDB Web Console.

For a longer walkthrough, see the
[Databento and QuestDB blog post](/blog/ingesting-live-market-data-data-bento/).
See [Databento's documentation](https://databento.com/docs/) for the available
datasets and schemas.

## Prerequisites

- [QuestDB](/download/) 10.0 or later, running and accessible on port 9000.
- Python 3.10 or later.
- The [Databento Python client](https://pypi.org/project/databento/).
- The [QuestDB Python client](/docs/connect/clients/python/).
- A Databento API key with Live access to `EQUS.MINI` for this example.

Install the Python libraries and set your API key:

```shell
python3 -m pip install -U questdb databento
export DATABENTO_API_KEY='<your-api-key>'
```

Databento access may incur charges. Review your dataset permissions and
[pricing](https://databento.com/pricing) before subscribing.

## Ingest data from Databento into QuestDB

### Create a Databento client

Create a Live client with your API key:

```python
import os
import databento as db

db_client = db.Live(key=os.environ["DATABENTO_API_KEY"])
```

### Subscribe to market data

Subscribe to top-of-book quotes for Apple in `EQUS.MINI`:

```python
db_client.subscribe(
    dataset="EQUS.MINI",
    schema="mbp-1",
    stype_in="raw_symbol",
    symbols=["AAPL"],
)
```

### Ingest data into QuestDB

Read the subscription and write quotes through a pooled sender from the
[QuestDB Python client](/docs/connect/clients/python/#row-ingestion). Databento
sends prices as fixed-point integers scaled by `1e9` and marks a missing quote
with `UNDEF_PRICE`, which the example writes as null. It labels every quote
`AAPL` because it subscribes to that symbol only.

As in the
[Databento connector](/docs/connect/connectors/databento/#timestamps), the
Databento receive time `ts_recv` is the designated timestamp, and `ts_event` is
stored as a regular `TIMESTAMP_NS` column. QuestDB creates the table on the
first row and names the designated timestamp column `timestamp`. Run these
snippets in the same script:

```python
import questdb
from questdb import TimestampNanos


def to_price(px):
    return None if px == db.UNDEF_PRICE else px / 1e9


try:
    with questdb.connect("ws::addr=localhost:9000;") as qdb:
        with qdb.sender() as sender:
            try:
                for record in db_client:
                    if isinstance(record, db.ErrorMsg):
                        raise RuntimeError(str(record))
                    if not isinstance(record, db.MBP1Msg):
                        continue
                    level = record.levels[0]
                    sender.row(
                        "top_of_book",
                        symbols={"symbol": "AAPL"},
                        columns={
                            "bid": to_price(level.bid_px),
                            "bid_size": level.bid_sz,
                            "ask": to_price(level.ask_px),
                            "ask_size": level.ask_sz,
                            "ts_event": TimestampNanos(record.ts_event),
                        },
                        at=TimestampNanos(record.ts_recv),
                    )
            except KeyboardInterrupt:
                sender.flush(wait=True)  # Wait until QuestDB accepts all rows
finally:
    db_client.stop()
```

The sender flushes automatically every 1,000 rows or 100 ms, checked as rows
arrive, without waiting for QuestDB to acknowledge them. Stop the script with
Ctrl+C: the example catches the interrupt, publishes the rows still buffered,
and waits until QuestDB has accepted every row before it exits. If the block
exits with any other exception, the rows still buffered are discarded.

:::note QuestDB before 10.0

QWP requires QuestDB 10.0 or later. On earlier versions, write the same rows
with the [legacy ILP `Sender`](/docs/connect/clients/python/#legacy-ilp-clients)
and an `http::addr=localhost:9000;` configuration string.

:::

## Query QuestDB

Open the QuestDB Web Console at `http://localhost:9000` and query the latest
quotes with their spread:

```questdb-sql title="Latest AAPL quotes"
SELECT timestamp, symbol, bid, ask, ask - bid AS spread
FROM top_of_book
WHERE symbol = 'AAPL'
ORDER BY timestamp DESC
LIMIT 10;
```

See the [SQL overview](/docs/query/overview/) for more queries.

## Materialized views and live views

To keep aggregates up to date as the script writes, without recomputing them on
every query, define them once in QuestDB. A
[materialized view](/docs/concepts/materialized-views/) maintains time-bucketed
results, such as 1-minute quotes with their average spread:

```questdb-sql title="1-minute quotes and average spread"
CREATE MATERIALIZED VIEW top_of_book_1m AS
SELECT
  timestamp,
  symbol,
  last(bid) AS bid,
  last(ask) AS ask,
  avg(ask - bid) AS avg_spread
FROM top_of_book
SAMPLE BY 1m;
```

A [live view](/docs/concepts/live-views/) maintains window-function results per
row, such as indicators that reset at the start of each trading session. The
[Databento connector](/docs/connect/connectors/databento/#materialized-views-and-live-views)
page shows a session VWAP example.

## Visualize the data

### In a Web Console notebook

Chart the quotes on a
[live dashboard](/docs/getting-started/web-console/notebooks/live-dashboards/)
in a Web Console notebook. Notebooks are built into QuestDB and run under the
same users and permissions as the Web Console, with no extra tool to install.

<Screenshot
  alt="A Web Console notebook charting 1-minute AAPL bid and ask for the last hour"
  title="AAPL quotes from the script on a live notebook dashboard."
  src="images/docs/databento/python-notebook-dashboard.webp"
  height={403}
  width={1116}
/>

1. Create a notebook and define two
   [variables](/docs/getting-started/web-console/notebooks/variables/):
   `@symbol := 'AAPL'` and `@window := '$now - 1h..$now'`.
2. Add a cell with the following query and press **Draw** to chart bid and ask
   as lines:

   ```questdb-sql title="1-minute bid and ask for the last hour"
   SELECT timestamp, last(bid) AS bid, last(ask) AS ask
   FROM top_of_book
   WHERE symbol = @symbol AND timestamp IN @window
   SAMPLE BY 1m;
   ```

3. Set the notebook's auto-refresh to **1s** to keep the chart live while the
   script runs.

### In Grafana

If you already use Grafana, chart the same data there. The `$__timeFilter` and
`$__sampleByInterval` macros follow the dashboard's time range.

1. Add the
   [QuestDB data source](/docs/integrations/visualization/grafana/) to Grafana.
2. Add a time series panel with the following query to chart bid and ask:

   ```questdb-sql title="Bid and ask for the Grafana time range"
   SELECT timestamp, last(bid) AS bid, last(ask) AS ask
   FROM top_of_book
   WHERE $__timeFilter(timestamp) AND symbol = 'AAPL'
   SAMPLE BY $__sampleByInterval;
   ```

3. Set the dashboard's refresh interval to keep the panel live while the script
   runs.
