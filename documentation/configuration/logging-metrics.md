---
title: Logging & Metrics
description: Configuration settings for logging and metrics in QuestDB.
---

These settings control log output format and timezone. Additional log
configuration is available in `log.conf`.

For more information and details of Prometheus metrics, see the
[Logging & Metrics](/docs/operations/logging-metrics/) documentation.

## log.level.verbose

- **Default**: `false`
- **Reloadable**: no

Converts short-hand log level indicators (`E`, `C`, `I`) into long-hand
(`ERROR`, `CRITICAL`, `INFO`).

## log.timezone

- **Default**: `UTC`
- **Reloadable**: no

Sets the timezone for log timestamps. Can be a timezone ID such as
`Antarctica/McMurdo`, `SystemDefault` to use the system timezone, or the
default UTC with `Z` suffix.
