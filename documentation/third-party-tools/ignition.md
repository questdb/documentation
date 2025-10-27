---
title: Ignition 8.3
description:
  Guide for using Ignition 8.3 with QuestDB
---

import Screenshot from "@theme/Screenshot"

[Inductive Automation Ignition](https://inductiveautomation.com/ignition/) is a software suite for industrial automation,
deployed by hundreds of companies worldwide. The platform includes a variety of tools, including a SCADA system, IIoT integrations, 
and monitoring and reporting capabilities.

The release of [Ignition 8.3](https://inductiveautomation.com/ignition/whatsnew) integrates QuestDB in the new [Core Historian](https://inductiveautomation.com/ignition/modules/historian) module,
replacing the legacy `SQLite` based historian. This module raises the performance ceiling, making the `Core Historian` a viable turnkey
solution for industrial time-series data, without the need to invest in (and configure) an external traditional RBDMS.

## Prerequisites

- [Ignition 8.3](https://inductiveautomation.com/ignition/whatsnew)
- [Core Historian module](https://inductiveautomation.com/ignition/modules/historian)

## Getting started

For initial configuration of the Core Historian, please follow the Inductive University introductory video.

<a href="https://inductiveuniversity.com/videos/core-historian/8.3" rel="noopener nofollow">
    <Screenshot
        alt="Core Historian Introduction"
        src="/images/guides/ignition/core-historian-tutorial.png"
    />
</a>

QuestDB is fully-integrated behind the scenes, and all tag historian actions can be performed via the UI.

## UI properties

Additional configuration settings can be found in the [Core Historian documentation](https://docs.inductiveautomation.com/docs/8.3/ignition-modules/tag-historian/tag-history-providers/internal-historian-questdb).

Some of the properties correspond to specific QuestDB features:

- `Partition Interval`
  - This corresponds to the `PARTITION BY` clause of a [`CREATE TABLE`](/docs/reference/sql/create-table/) statement. 
  - Data will be vertically partitioned according to the provided unit. 
  - See [partition concepts](/concept/partitions) for more information.
- `Data Deduplication`
  - This corresponds to the `DEDUP` clause of a [`CREATE TABLE`](/docs/reference/sql/create-table/#deduplication) statement.
  - New rows which match the deduplication keys will be replaced instead of inserted as new rows. 
  - See [dedup concepts](/concept/deduplication/) for more information.

## Gateway configuration

Additional settings can be configured in the gateway to control the backing QuestDB instance's behaviour. These are specified
in the [Gateway and Gateway and Gateway Network Parameters](https://www.docs.inductiveautomation.com/docs/8.3/appendix/reference-pages/gateway-configuration-file-reference/gateway-and-gateway-network-parameters#core-historian)
documentation.

### Direct queries

Ignition can be configured to expose QuestDB's Postgres wire server, allowing for read queries to be run directly against the underlying database.

- `historian.questdb.pgwireServerEnabled` 
    - Corresponds to `pg.enabled` in QuestDB's `server.conf`
    - Enables the PG Wire server on the default port (8812).
- `historian.questdb.pgwireServerPort`
    - Corresponds to the port half of `pg.net.bind.to` in QuestDB's `server.conf`.
    - Changes the server port from the default (8812) to the specified integer. 

### Resource usage

Ignition also exposes settings to control the amount of memory allocated to the underlying database.

- `historian.questdb.ramUsageLimitBytes`
  - Corresponds to `ram.usage.limit.bytes` in QuestDB's `server.conf`.
  - Controls the amount of RAM allocated to the database in bytes.
- `historian.questdb.ramUsageLimitPercent`
  - Corresponds to `ram.usage.limit.percent` in QuestDB's `server.conf`.
  - Control the amount of RAM allocated to the database as a percentage of system memory.
