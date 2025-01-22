---
title: Query Tracing
sidebar_label: Query Tracing
description:
  Query tracing is a feature that helps you diagnose performance issues with
  queries by recording each query's execution time in a system table.
---

Query tracing is a feature that helps you diagnose performance issues with
queries by recording each query's execution time in a system table called
`_query_trace`. You can then analyze the data in this table using the full power
of QuestDB's SQL statements.

Query tracing is disabled by default. You can enable it using the following
configuration property:

```text
query.tracing.enabled=true
```

You don't need to restart the database server for this property to take effect;
just run the following query to reload the configuration:

```sql
select reload_config();
```

This is an example of what the `_query_trace` table may contain:

```sql
_query_trace;
```

|             ts              |        query_text         | execution_micros |
| --------------------------- | ------------------------- | ---------------- |
| 2025-01-15T08:52:56.600757Z | telemetry_config LIMIT -1 |             1206 |
| 2025-01-15T08:53:03.815732Z | tables()                  |             1523 |
| 2025-01-15T08:53:22.971239Z | 'sys.query_trace'         |             5384 |

As a simple performance debugging example, to get the text of all queries that
took more than 100 ms, run:

```sql
select query_text from query_trace() where execution_micros > 100_000;
```

The `_query_trace` table will drop data older than 24 hours in order to limit
how much storage query tracing uses.
