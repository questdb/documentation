---
title: Telemetry
description: Configuration settings for anonymous telemetry in QuestDB.
---

QuestDB sends anonymous telemetry data with information about usage which helps
us improve the product over time. We do not collect any personally-identifying
information, and we do not share any of this data with third parties.

## telemetry.enabled

- **Default**: `true`
- **Reloadable**: no

Enable or disable anonymous usage metrics collection.

## telemetry.hide.tables

- **Default**: `false`
- **Reloadable**: no

Hides telemetry tables from `select * from tables()` output. When enabled,
telemetry tables will not be visible in the Web Console table view.

## telemetry.queue.capacity

- **Default**: `512`
- **Reloadable**: no

Capacity of the internal telemetry queue, which is the gateway of all
telemetry events. This queue capacity does not require tweaking.
