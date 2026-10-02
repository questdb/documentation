---
title: Telemetry
description: Configuration settings for telemetry in QuestDB.
---

QuestDB collects usage telemetry that helps us improve the product. Telemetry
does not include the data stored in your tables, and metrics such as database
size and table count are sent as ranges rather than exact values. See our
[Privacy Notice](https://questdb.com/privacy-notice/) for details.

## telemetry.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable usage metrics collection.

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
