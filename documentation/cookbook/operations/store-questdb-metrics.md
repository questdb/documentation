---
title: Store QuestDB metrics in QuestDB
sidebar_label: Store QuestDB metrics
description: Scrape QuestDB Prometheus metrics using Telegraf and store them in QuestDB
---

Store QuestDB's operational metrics in QuestDB itself by scraping Prometheus metrics using Telegraf.

## Solution: Telegraf configuration

You could use Prometheus to scrape those metrics, but you can also use any server agent that understands the Prometheus format. It turns out Telegraf has input plugins for Prometheus and output plugins for QuestDB, so you can use it to get the metrics from the endpoint and insert them into a QuestDB table.

This is a `telegraf.conf` configuration which works (using default ports):

```toml
# Configuration for Telegraf agent
[agent]
  ## Default data collection interval for all inputs
  interval = "5s"
  omit_hostname = true
  precision = "1ms"
  flush_interval = "5s"

# -- INPUT PLUGINS ------------------------------------------------------ #
[[inputs.prometheus]]
  ## An array of urls to scrape metrics from.
  urls = ["http://questdb-origin:9003/metrics"]
  url_tag=""
  metric_version = 2 # all entries will be on a single table
  ignore_timestamp = false

# -- AGGREGATOR PLUGINS ------------------------------------------------- #
# Merge metrics into multifield metrics by series key
[[aggregators.merge]]
  ## If true, the original metric will be dropped by the
  ## aggregator and will not get sent to the output plugins.
  drop_original = true


# -- OUTPUT PLUGINS ----------------------------------------------------- #
[[outputs.socket_writer]]
  # Write metrics to a local QuestDB instance over TCP
  address = "tcp://questdb-target:9009"
```

A few things to note:
* `omit_hostname` avoids an extra column. When monitoring multiple QuestDB instances, keep it enabled.
* `url_tag` is set to blank for the same reason - by default the Prometheus plugin adds the URL as an extra column.
* `metric_version = 2` ensures all metrics go into a single table, rather than one table per metric.
* The `aggregators.merge` plugin rolls up metrics into a single row per data point (with multiple columns), rather than one row per metric. Without it, the table becomes very sparse.
* The config uses a different hostname for the QuestDB output to collect metrics on a separate instance. This is recommended for production, but for development the same host can be used.

:::info Related Documentation
- [QuestDB metrics](/docs/operations/logging-metrics/)
- [ILP ingestion](/docs/ingestion/overview/)
- [Telegraf documentation](https://docs.influxdata.com/telegraf/)
:::
