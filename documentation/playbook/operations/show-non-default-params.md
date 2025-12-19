---
title: Show Parameters with Non-Default Values
sidebar_label: Show non-default params
description: List all QuestDB configuration parameters that have been modified from their default values
---

When troubleshooting or auditing your QuestDB configuration, it's useful to see which parameters have been changed from their defaults.

## Problem

You need to identify which configuration parameters have been explicitly set via the configuration file or environment variables, filtering out all parameters that are still using their default values.

## Solution

Query the `SHOW PARAMETERS` command and filter by `value_source` to exclude defaults:

```questdb-sql demo title="Find which params where modified from default values"
-- Show all parameters modified from their defaults, via conf file or env variable
(SHOW PARAMETERS) WHERE value_source <> 'default';
```

This query returns only the parameters that have been explicitly configured, showing their current values and the source of the configuration (e.g., `conf` file or `env` variable).

:::info Related Documentation
- [SHOW PARAMETERS reference](/docs/reference/sql/show/#show-parameters)
- [Configuration reference](/docs/configuration/)
:::
