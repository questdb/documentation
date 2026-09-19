---
title: Audited views
sidebar_label: Audited views
description:
  Record every read of a QuestDB Enterprise view in sys.view_audit, with the
  principal, the time, and the parameter values each read resolved to.
---

import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Record who read a view, when, and with which parameters.
</EnterpriseNote>

An audited view records every read of it in the `sys.view_audit` table: the
principal that ran the query, when the read finished, how long it took, and the
values its parameters resolved to. Use it where you have to answer who looked
at which data, for example a view that exposes trades or positions for a symbol
and time range that the caller chooses.

A view created `WITH AUDIT` records one row per read. Each of its
[`DECLARE`](/docs/query/sql/declare/) variables marked `AUDITED` adds its
resolved value to the row's `params` column, as JSON. A caller's override, a
bind variable, or a default built on `now()` is recorded as the value that read
actually ran with, so the trail describes the data each read covered.

## Quick start

```questdb-sql title="Create an audited view"
CREATE VIEW trades_by_symbol AS (
  DECLARE
    OVERRIDABLE AUDITED @symbols := ('BTC-USDT', 'ETH-USDT'),
    AUDITED @since := dateadd('h', -1, now())
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol IN @symbols AND timestamp >= @since
) WITH AUDIT;
```

```questdb-sql title="Read it, overriding the symbols"
DECLARE @symbols := ('SOL-USDT',)
SELECT * FROM trades_by_symbol;
```

```questdb-sql title="Inspect the trail"
SELECT ts, principal, view_name, params, status
FROM 'sys.view_audit'
WHERE view_name = 'trades_by_symbol'
ORDER BY ts DESC
LIMIT 10;
```

| ts                          | principal | view_name        | params                                                        | status |
| --------------------------- | --------- | ---------------- | ------------------------------------------------------------- | ------ |
| 2026-09-19T10:15:02.418331Z | analyst   | trades_by_symbol | `{"since":"2026-09-19T09:15:02.417950Z","symbols":["SOL-USDT"]}` | ok     |

Rows are written in the background and appear in the table shortly after the
read.

## Syntax

```questdb-sql title="Create an audited view"
CREATE VIEW [ IF NOT EXISTS ] viewName AS ( query )
    WITH AUDIT [ OWNED BY ownerName ]
```

```questdb-sql title="Mark the parameters to record"
DECLARE [ OVERRIDABLE ] [ AUDITED ] @variable := expression
    [, [ OVERRIDABLE ] [ AUDITED ] @variable := expression ...]
```

- `WITH AUDIT` and `OWNED BY` may appear in either order. `WITH AUDIT` requires
  the [`AUDIT VIEW`](#permissions) permission.
- `AUDITED` and `OVERRIDABLE` are independent and may appear in either order.
  `AUDITED` takes effect only in the body of a view created `WITH AUDIT`.
  Elsewhere it is accepted and has no effect.
- A view created `WITH AUDIT` with no `AUDITED` variables still records every
  read, with `{}` in `params`.

## Choose what a read records

Mark a variable `AUDITED` when its value describes which data a read covered:

- **`OVERRIDABLE AUDITED`**: a parameter the caller can set. The row records the
  caller's value, or the view's default when the caller sets nothing.
- **`AUDITED` only**: a parameter the caller cannot change. Worth recording when
  its value changes between reads, such as a window built on `now()`, because
  the trail is otherwise the only place that value is kept.

Only the view's own declarations count. A caller cannot add a parameter to the
row, or remove one, by declaring variables of their own, `AUDITED` or not.

Values are evaluated for each execution. A prepared statement that binds a
view parameter to a bind variable records the values bound on each execution:

```questdb-sql title="One plan, a row per execution with its own values"
DECLARE @symbols := ($1, $2)
SELECT * FROM trades_by_symbol;
```

:::tip

Record resolved values rather than text that resolves later. A
[TICK](/docs/query/operators/tick/) string such as `'$now-1h..$now'` is recorded
as that text, not as the time range it resolved to. To keep the range in the
trail, declare the bounds as timestamps, as `@since` does above.

:::

## The audit table

The server creates `sys.view_audit` at startup. The `sys.` prefix follows
[`cairo.system.table.prefix`](/docs/configuration/cairo-engine/#cairosystemtableprefix).
It is a WAL table partitioned by day, with this schema:

| Column           | Type        | Description                                                                                                  |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `ts`             | `TIMESTAMP` | When the read finished and the row was recorded. The designated timestamp.                                   |
| `principal`      | `SYMBOL`    | The user or service account that ran the query.                                                              |
| `view_name`      | `SYMBOL`    | The name of the audited view.                                                                                |
| `params`         | `VARCHAR`   | The resolved values of the view's `AUDITED` variables, as a JSON object.                                     |
| `latency_micros` | `LONG`      | How long the read took, from opening it to closing it, in microseconds.                                      |
| `status`         | `SYMBOL`    | `ok`, or `error` when the read failed or was cancelled. A failed read is recorded because it was attempted. |
| `view_id`        | `INT`       | The view's internal id. A view that is dropped and created again under the same name gets a new id.          |

Reads that stream page frames, such as Parquet export, record the row when the
read starts, so their `latency_micros` covers only opening the read.

### The params column

`params` is canonical JSON, so two reads with the same values produce the same
text and a report can group on the column directly:

- Keys are the variable names without the `@`, sorted by name.
- A declared list renders as a JSON array, in the order it was written. Declare
  a one-member list with a trailing comma, `('SOL-USDT',)`, so that the value
  stays an array. Without the comma it is a scalar.
- A `NULL` value renders as JSON `null`.

| SQL type                                          | JSON                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| `BOOLEAN`                                         | `true` or `false`                                                      |
| `BYTE`, `SHORT`, `INT`, `LONG`, `FLOAT`, `DOUBLE` | Number                                                                 |
| `CHAR`, `STRING`, `SYMBOL`, `VARCHAR`             | String                                                                 |
| `TIMESTAMP`                                       | ISO 8601 string, in the timestamp's own precision (micro or nanosecond) |
| `DATE`                                            | ISO 8601 string, with microseconds                                     |
| `UUID`, `IPv4`                                    | String                                                                 |

A read whose `AUDITED` variable resolves to any other type, such as an array,
fails with `audited view parameter has a type that cannot be audited`, rather
than record a row with a value missing.

### Query the trail

```questdb-sql title="Reads per principal and parameter set, today"
SELECT principal, view_name, params, count() AS reads
FROM 'sys.view_audit'
WHERE ts IN '$today'
GROUP BY principal, view_name, params
ORDER BY reads DESC;
```

```questdb-sql title="Extract one parameter"
SELECT ts, principal, json_extract(params, '$.since')::timestamp AS since
FROM 'sys.view_audit'
WHERE view_name = 'trades_by_symbol' AND ts IN '$today';
```

See [`json_extract()`](/docs/query/functions/json/#json_extract) for the path
syntax.

### Retention

The table is created with the storage policy that
[`view.audit.storage.policy`](/docs/configuration/audited-views/#viewauditstoragepolicy)
sets, `TO PARQUET 1d` by default, so older partitions of the trail move to
Parquet. The setting applies only when the server creates the table. After
that, change the policy with
[`ALTER TABLE SET STORAGE POLICY`](/docs/query/sql/alter-table-set-storage-policy/).

The table cannot be dropped, so the trail cannot be erased by whoever holds
`DROP TABLE`. It can be truncated with
[`TRUNCATE TABLE`](/docs/query/sql/truncate/), which keeps retention the
operator's to manage.

The server writes to the table by column name, so you can add columns of your
own. The seven columns above must keep their names and types. If one is missing
or has another type, the server logs an error and discards audit rows until the
table is repaired and the server restarted.

## What counts as a read

A read is one execution of a statement that reads rows through an audited view:
`SELECT`, `INSERT INTO ... SELECT`, `CREATE TABLE AS SELECT`, or an `UPDATE` of a
non-WAL table that reads the view in its `FROM` clause or in a sub-query. Each
execution records its own rows, including every execution of a cached or
prepared statement.

When one statement mentions the same view more than once, in a join, a union,
or a sub-query, the view records one row for each distinct set of parameter
values. References that resolve to the same values are one read and share a
row. Values are compared as rendered, so `1` and `1.0` count as different
values.

These record nothing:

- `CREATE VIEW`, `CREATE MATERIALIZED VIEW`, `ALTER VIEW` and
  `CREATE OR REPLACE VIEW` whose query reads an audited view. Each opens its
  query only to check it, and hands no rows to anyone.
- Reads the database runs on its own behalf: materialized view refreshes and
  WAL apply. No principal is reading data there.
- An `UPDATE` of a WAL table. See [Limitations](#limitations).

## Audited views that read other audited views

An audited view read inside the body of another audited view records no row of
its own when the outer view's row covers it. The outer view covers the inner
one when every variable the inner view declares `OVERRIDABLE AUDITED` is also
declared `AUDITED` in the outer view, by name, overridable or not. Those are the
only values a caller can change through the outer view, so the outer row then
shows everything the caller chose.

An inner view with no `OVERRIDABLE AUDITED` variables is always covered. So an
audited view that unions several audited views with fixed or no audited
parameters records one row, for itself.

An inner view that is not covered keeps its row, because a caller's value can
reach it through the outer view without appearing on the outer row:

```questdb-sql title="The inner view has a parameter the caller can set"
CREATE VIEW symbol_trades AS (
  DECLARE OVERRIDABLE AUDITED @sym := 'BTC-USDT'
  SELECT timestamp, symbol, side, price, amount
  FROM trades
  WHERE symbol = @sym
) WITH AUDIT;

CREATE VIEW buy_trades AS (
  SELECT * FROM symbol_trades WHERE side = 'buy'
) WITH AUDIT;
```

```questdb-sql title="The caller's @sym passes through buy_trades"
DECLARE @sym := 'ETH-USDT' SELECT * FROM buy_trades;
```

| view_name       | params               |
| --------------- | -------------------- |
| `buy_trades`    | `{}`                 |
| `symbol_trades` | `{"sym":"ETH-USDT"}` |

To record one row, re-declare the parameter in the outer view. The view stays
audited through `ALTER VIEW`:

```questdb-sql title="The outer view records @sym itself"
ALTER VIEW buy_trades AS (
  DECLARE OVERRIDABLE AUDITED @sym := 'BTC-USDT'
  SELECT * FROM symbol_trades WHERE side = 'buy'
);
```

The same read now records one row, `buy_trades` with `{"sym":"ETH-USDT"}`.
Declare it `AUDITED` without `OVERRIDABLE` instead to fix the value for every
caller.

The rule in full:

- Coverage is checked against the outermost audited view around the read,
  through any views between them, audited or not.
- A view that is not audited never covers another. An audited view read
  through a plain view always records its row.
- A reference to the inner view outside the outer view, in the same statement,
  records as usual. If it resolves the same values as an inner read that is not
  covered, the two share one row.
- When an inner view is covered, its `AUDITED` variables that are not
  `OVERRIDABLE` are not recorded. Read directly, the view records them.
- Coverage depends only on the view definitions, so a given statement always
  records the same set of views.

## Delivery

Recording never makes a read wait. A read puts its rows on a bounded in-memory
queue, and a background job writes them to the table. The queue holds
[`view.audit.queue.capacity`](/docs/configuration/audited-views/#viewauditqueuecapacity)
rows, 4096 by default.

If audited reads outpace the job and the queue fills, the read still runs and
its row is dropped. The server logs `view audit queue is full, dropping rows`
with a running total, on the first drop and every 1024th after that. Raise the
capacity if this appears during bursts of audited reads.

## Permissions

| Action                                                              | Permissions                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Create a view `WITH AUDIT`                                          | `CREATE VIEW` and `AUDIT VIEW`                            |
| Drop an audited view, with `DROP VIEW` or `DROP ALL TABLES`         | `DROP VIEW` on the view and `AUDIT VIEW`                  |
| Change an audited view with `ALTER VIEW` or `CREATE OR REPLACE VIEW` | `ALTER VIEW` on the view. The view stays audited          |
| Read an audited view                                                | `SELECT` on the view, as for any [view](/docs/concepts/views/#definer-security-model-enterprise) |
| Read or truncate the trail                                          | `SELECT` or `TRUNCATE TABLE` on `sys.view_audit`          |

`AUDIT VIEW` is a database-level permission, included in `ALL` and
`DATABASE ADMIN`. It guards the two statements that bind a view to the trail or
release it, so that a principal who can drop and recreate a view cannot shed
its auditing unremarked.

A view's auditing is set when it is created. `ALTER VIEW` and
`CREATE OR REPLACE VIEW` over an existing view keep it, and do not accept
`WITH AUDIT`. To audit an existing view, or to stop auditing one, drop it and
create it again.

`sys.view_audit` takes ordinary table permissions. Grant `SELECT` on it to the
people who review the trail, and keep write permissions such as `INSERT`,
`UPDATE` and `TRUNCATE TABLE` to the operators who manage it.

## Replication and read-only instances

Every node records the reads it serves, replicas included, into its own
`sys.view_audit`. The rows are not replicated between nodes, so the complete
trail is the union of the tables on all nodes.

An instance started with `readonly=true` cannot write the trail, so it refuses
reads of audited views with
`cannot read an audited view on a read-only instance`. Views that are not
audited are unaffected.

## Limitations

- **A materialized view over an audited view is not audited.** Its refreshes
  record nothing, reads of the materialized view are not audited, and
  `CREATE MATERIALIZED VIEW` records nothing either. A principal who can read an
  audited view and create materialized views can therefore make its data
  readable with no audit row. Grant `CREATE MATERIALIZED VIEW` with that in
  mind. A [live view](/docs/concepts/live-views/) cannot be defined over a
  view, so it cannot be used this way.
- **An `UPDATE` of a WAL table records nothing** when it reads an audited view.
  Its read happens during WAL apply, on every node, rather than in the session
  that submitted it. A WAL table's `UPDATE` can read no other table and use no
  join, so the only such statement that compiles reads, in a sub-query, an
  audited view whose query reads only the updated table. The same statement on
  a non-WAL table is recorded.
- **Copies are recorded once.** `INSERT INTO ... SELECT` and
  `CREATE TABLE AS SELECT` record the read that made the copy. Reads of the copy
  are not audited.
- **Rows can be dropped** when the queue is full. See [Delivery](#delivery).

## See also

- [Views](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [DECLARE](/docs/query/sql/declare/)
- [Role-based access control](/docs/security/rbac/)
- [Audited views configuration](/docs/configuration/audited-views/)
- [Storage policy](/docs/concepts/storage-policy/)
