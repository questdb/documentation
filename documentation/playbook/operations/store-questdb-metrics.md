---
title: Store QuestDB Metrics in QuestDB
sidebar_label: Store QuestDB metrics
description: Scrape QuestDB Prometheus metrics using Telegraf and store them in QuestDB
---

Store QuestDB's operational metrics in QuestDB itself by scraping Prometheus metrics using Telegraf.

## Solution: Telegraf Configuration

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
* I omit the hostname, so I don't end up with an extra column I don't need. If I was monitoring several QuestDB instances, it would be good to keep it.
* I set the `url_tag` to blank because of the same reason. By default the Prometheus plugin for Telegraf adds the url as an extra column and we don't need it.
* I am using `metric_version` 2 for the input plugin. This is to make sure I get all the metrics into a single table, rather than one table for each different metric, which I find annoying.
* I am using the aggregator so metrics get rolled-up into a single row per data point (with multiple columns), rather than one row per metric. Without the aggregator it works fine, but you end up with a very sparse table.
* On my config, I used a different hostname for the QuestDB output, so we can collect metrics on a different instance. For production this would be a best practice, but for development you can just use the same host you are monitoring.

:::info Related Documentation
- [QuestDB metrics](/docs/operations/logging-metrics/)
- [ILP ingestion](/docs/ingestion/overview/)
- [Telegraf documentation](https://docs.influxdata.com/telegraf/)
:::
