---
title: Databento with Python
sidebar_label: Databento
description: Ingest live Databento market data into QuestDB Open Source with Python and visualize it in Grafana.
---

:::tip QuestDB Enterprise

For QuestDB Enterprise, use the [native Databento connector](/docs/connect/databento/)
for automatic table creation and checkpointed recovery. This guide
uses Python to integrate Databento with QuestDB Open Source.

:::

[Databento](https://databento.com/) is a market data aggregator that provides a single,
normalized feed covering multiple venues,
simplifying the process of ingesting live market data.
It interfaces well with QuestDB for real-time data analysis and visualization in Grafana.

This guide shows how to ingest live market data into QuestDB using the Databento
and QuestDB Python clients, then visualize it in Grafana.

For a deeper dive, see our [Databento & QuestDB blog](/blog/ingesting-live-market-data-data-bento/).

## Prerequisites

- [QuestDB](/download/)
- [Databento Python client](https://pypi.org/project/databento/)
- [QuestDB Python client](/docs/connect/clients/python/)
- [Grafana](/docs/integrations/visualization/grafana/) (Optional)
- A Databento API key with Live access to `EQUS.MINI` for this example.

Install the required Python libraries:

```shell
python3 -m pip install --upgrade questdb databento
export DATABENTO_API_KEY='<your-api-key>'
```

Databento access may incur charges; review your dataset permissions and
[pricing](https://databento.com/pricing) before subscribing.

## Ingest Data from Databento into QuestDB

### Create Databento Client

Set up a Databento client with your API key:

```python
import os
import databento as db

db_client = db.Live(key=os.environ["DATABENTO_API_KEY"])
```

### Subscribe to Market Data

Subscribe to top-of-book quotes for Apple in `EQUS.MINI`:

```python
db_client.subscribe(
    dataset="EQUS.MINI",
    schema="mbp-1",
    stype_in="raw_symbol",
    symbols=["AAPL"],
)
```

### Ingest Data into QuestDB

Read the subscription and write quotes using the QuestDB Python client's
[ILP over HTTP interface](/docs/connect/clients/python/#legacy-ilp-clients).
The example labels every quote `AAPL` because it subscribes to that symbol only.
Run these snippets in the same script:

```python
from questdb import Sender, TimestampNanos

questdb_conf = "http::addr=localhost:9000;"
try:
    with Sender.from_conf(questdb_conf) as sender:
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
                    "bid": None if level.bid_px == db.UNDEF_PRICE else level.bid_px / 1e9,
                    "ask": None if level.ask_px == db.UNDEF_PRICE else level.ask_px / 1e9,
                    "ask_size": level.ask_sz,
                },
                at=TimestampNanos(record.ts_event),
            )
            sender.flush()
finally:
    db_client.stop()
```

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
