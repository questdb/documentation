---
title: CANCEL QUERY
sidebar_label: CANCEL QUERY
description: CANCEL QUERY keyword reference documentation.
---

Gracefully stops the execution of a running query.

## Syntax

![Flow chart showing the syntax of the CANCEL QUERY keyword](/img/docs/diagrams/cancelQuery.svg)

## Description

The `CANCEL QUERY` command sets a flag that is periodically checked by the
running target query. Cancelling depends on how often the flag is checked. It
may not be immediate.

The `query_id` is the unique non-negative identification number of a running
query in query registry.

`CANCEL QUERY` returns an error if:

1. The given `query_id` is negative
2. The query can't be found in registry

A `query_id` is found via the
[`query_activity()`](/docs/reference/function/meta#query_activity)
meta-function.

## Examples

Consider we have two open tabs of the QuestDB [Web Console](/docs/web-console/).

If we execute the following command in the first tab:

```questdb-sql
CREATE TABLE test AS (SELECT x FROM long_sequence(1000000000));
```

We can then check that the query is running in the second tab with the
[`query_activity()`](/docs/reference/function/meta#query_activity)
meta-function:

```questdb-sql
SELECT * FROM query_activity();
```

| query_id | worker_id | worker_pool | username | query_start                 | state_change                | state  | query                                                                |
| -------- | --------- | ----------- | -------- | --------------------------- | --------------------------- | ------ | -------------------------------------------------------------------- |
| 29       | 1         | shared      | joe      | 2024-01-09T10:51:05.878627Z | 2024-01-09T10:51:05.878627Z | active | CREATE TABLE test_tab AS (SELECT x FROM long_sequence(10000000000)); |
| 30       | 21        | shared      | joe      | 2024-01-09T10:51:10.661032Z | 2024-01-09T10:51:10.661032Z | active | SELECT \* FROM query_activity();                                     |

We see that the two latest queries have `query_id`'s of 29 and 30, respectively.

Want to cancel it?

There are two methods:

```questdb-sql
CANCEL QUERY 29;
```

Or:

```questdb-sql
SELECT cancel_query(29)
```

After execution, the query then gets interrupted and returns a
`cancelled by user` error in the first tab where the query was launched.

The `cancel_query()` function may cancel multiple queries at the same time or
cancel without the need to lookup a specific `query_id`. You can do so by
chaining with a [`LIKE`](/docs/reference/function/pattern-matching/#likeilike)
operator:

```questdb-sql
SELECT cancel_query(query_id)
FROM query_activity()
WHERE query LIKE 'CREATE TABLE test_tab%'
```

This expression returns `true` if query was found in the registry and if the
cancellation was set. Otherwise, it returns `false`.
