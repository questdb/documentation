---
title: Query Tracing
sidebar_label: Query Tracing
description:
  Query tracing is a feature that helps you diagnose performance issues with
  queries by recording each query's execution time in a system table.
---

Query tracing is a feature that helps you diagnose performance issues with
queries by recording each query's execution time in a system table. You can
then analyze this data using the full power of QuestDB's SQL statements.

Query tracing is disabled by default. Enable it with this configuration
property:

```text
query.tracing.enabled=true
```

You don't need to restart the database server for this property to take effect;
just run the following query to reload the configuration:

```sql
select reload_config();
```

You can reach the contents of the query tracing table using the `query_trace()`
function:

```sql
query_trace();
```

For example, to get the text of all queries that took more than 100 ms, run:

```sql
select query_text from query_trace() where execution_micros > 100_000;
```

In order to limit the storage used by query tracing, the query tracing table
only holds the data on queries issued over the past 24 hours.
