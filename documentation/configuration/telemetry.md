---
title: Telemetry
description: Configuration settings for telemetry in QuestDB.
---

The QuestDB Web Console sends usage telemetry to QuestDB. We use it to improve
the product, to understand which organizations use QuestDB and, for QuestDB
Enterprise, to check license compliance. Telemetry does not include the data
stored in your tables, and database size and table count are sent as ranges
rather than exact values. See our
[Privacy Notice](https://questdb.com/privacy-notice/#product-telemetry) for
details.

## telemetry.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable usage telemetry. When disabled, the Web Console stops sending
usage telemetry and the
[Metrics View](/docs/getting-started/web-console/metrics-view/) is unavailable.

## telemetry.hide.tables

- **Default**: `true`
- **Reloadable**: no

Hides telemetry tables from `select * from tables()` output. When enabled,
telemetry tables will not be visible in the Web Console table view.

## telemetry.queue.capacity

- **Default**: `512`
- **Reloadable**: no

Capacity of the internal telemetry queue, which is the gateway of all
telemetry events. This queue capacity does not require tweaking.
