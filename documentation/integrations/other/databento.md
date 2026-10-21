---
title: Databento with Python
sidebar_label: Databento (Python)
description: Ingest live Databento market data into QuestDB Open Source with Python and visualize it in Grafana.
---

:::tip QuestDB Enterprise

For QuestDB Enterprise, use the [native Databento connector](/docs/connect/connectors/databento/)
for per-schema table mappings, Historical backfills, and checkpointed recovery.
This guide uses Python to integrate Databento with QuestDB Open Source.

:::

[Databento](https://databento.com/) is a market data aggregator that provides a single,
normalized feed covering multiple venues,
simplifying the process of ingesting live market data.
It interfaces well with QuestDB for real-time data analysis and visualization in Grafana.

This guide shows how to ingest live market data into QuestDB using the Databento
and QuestDB Python clients over
[QWP](/docs/connect/wire-protocols/qwp-ingress-websocket/), then visualize it in
Grafana.

For a deeper dive, see our [Databento & QuestDB blog](/blog/ingesting-live-market-data-data-bento/).

## Prerequisites

- [QuestDB](/download/) 10.0 or later, running and accessible on port 9000.
- Python 3.10 or later.
- [Databento Python client](https://pypi.org/project/databento/)
- [QuestDB Python client](/docs/connect/clients/python/)
- [Grafana](/docs/integrations/visualization/grafana/) (Optional)
- A Databento API key with Live access to `EQUS.MINI` for this example.

Install the required Python libraries:

```shell
python3 -m pip install -U questdb databento
export DATABENTO_API_KEY='<your-api-key>'
```

Databento access may incur charges; review your dataset permissions and
[pricing](https://databento.com/pricing) before subscribing.

## Ingest data from Databento into QuestDB

### Create a Databento client

Set up a Databento client with your API key:

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
`AAPL` because it subscribes to that symbol only. Run these snippets in the same
script:

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
                        symbols={"instrument": "AAPL"},
                        columns={
                            "bid_size": level.bid_sz,
                            "bid": to_price(level.bid_px),
                            "ask": to_price(level.ask_px),
                            "ask_size": level.ask_sz,
                        },
                        at=TimestampNanos(record.ts_event),
                    )
            except KeyboardInterrupt:
                pass  # Exit normally so the sender flushes buffered rows
finally:
    db_client.stop()
```

QuestDB creates the `top_of_book` table on the first row, with the event time in
its designated `timestamp` column (`TIMESTAMP_NS`). The sender flushes
automatically every 1,000 rows or 100 ms, checked as rows arrive. Stop the script
with Ctrl+C: the example catches the interrupt so the sender also flushes the
rows buffered since the last automatic flush. If the block exits with any other
exception, those buffered rows are discarded.

:::note QuestDB before 10.0

QWP requires QuestDB 10.0 or later. On earlier versions, write the same rows
with the [legacy ILP `Sender`](/docs/connect/clients/python/#legacy-ilp-clients)
and an `http::addr=localhost:9000;` configuration string.

:::

## Query QuestDB

Now that data is flowing, you can visit QuestDB at `http://localhost:9000` to try some queries.

Read our [SQL Overview](/docs/query/overview/) to learn more about the power and depth of querying.

## Visualize in Grafana

After ingesting the data, you can visualize it in Grafana by creating a dashboard with SQL queries such as:

```sql
SELECT timestamp, instrument, bid, ask
FROM top_of_book
WHERE $__timeFilter(timestamp) AND instrument = 'AAPL'
```

For more detailed analysis, create multiple charts using Grafana's variable and repeat options.

To learn the basics of QuestDB and Grafana, see [our blog](/blog/time-series-monitoring-dashboard-grafana-questdb/).

For more information, check out [Databento’s documentation](https://databento.com/docs/).
