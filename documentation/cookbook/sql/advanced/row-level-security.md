---
title: Row-level security with views and RBAC
sidebar_label: Row-level security
description: Restrict which rows each group, user, or service account can read by combining filtered views with GRANT in QuestDB Enterprise.
---

QuestDB's `GRANT` controls access down to the column level, but not down to
individual rows. To restrict which rows an entity can read, filter the rows
inside a view and then `GRANT SELECT` on that view. A member of a granted group
reads the view without holding any permission on the underlying table, so they
only ever see the rows the view exposes.

:::note

This recipe uses role-based access control (`CREATE GROUP`, `GRANT`, service
accounts), which is available in **QuestDB Enterprise** only. The queries cannot
run on the public demo instance.

:::

## Problem

A single `fx_trades` table holds executions from every venue. Each trading desk
should only see its own ECN's trades, and no desk should be able to read the
full table or another desk's rows.

## Solution

Create one view per desk that filters `fx_trades` by `ecn`, then grant `SELECT`
on each view to the matching group.

```questdb-sql title="One filtered view per desk"
CREATE VIEW lmax_trades AS (
  SELECT timestamp, symbol, side, price, quantity, counterparty
  FROM fx_trades
  WHERE ecn = 'LMAX'
);

CREATE GROUP lmax_desk;
GRANT SELECT ON lmax_trades TO lmax_desk;
```

Members of `lmax_desk` can read `lmax_trades` but get "access denied" on
`fx_trades`. The grant covers the view only, and reading the view does not
require any permission on the base table:

```questdb-sql title="What the desk can and cannot read"
SELECT * FROM lmax_trades; -- works, LMAX rows only
SELECT * FROM fx_trades;   -- access denied
```

## Scale with a master view and an overridable filter

Repeating the column list and join logic in every desk view is hard to
maintain. Instead, define the filtering and column selection once in a master
view whose filter is an `OVERRIDABLE` parameter, then create thin per-desk views
that pin the parameter to a fixed value.

```questdb-sql title="Master view with an overridable filter"
CREATE VIEW desk_trades AS (
  DECLARE OVERRIDABLE @ecn := ''
  SELECT timestamp, symbol, side, price, quantity, counterparty
  FROM fx_trades
  WHERE ecn = @ecn
);
```

The empty-string default means the master view returns no rows unless a caller
supplies an ECN, so it fails closed. Each desk view overrides `@ecn` with a
fixed value, and because the override is a plain (non-`OVERRIDABLE`) `DECLARE`,
callers of the desk view cannot change it:

```questdb-sql title="Thin per-desk views that pin the filter"
CREATE VIEW lmax_trades AS (
  DECLARE @ecn := 'LMAX'
  SELECT * FROM desk_trades
);

CREATE VIEW ebs_trades AS (
  DECLARE @ecn := 'EBS'
  SELECT * FROM desk_trades
);
```

Now grant each desk view to its group. The master view is never granted to
anyone, so it is reachable only through the pinned per-desk views:

```questdb-sql title="Grant each desk its own view"
CREATE GROUP lmax_desk;
CREATE GROUP ebs_desk;

GRANT SELECT ON lmax_trades TO lmax_desk;
GRANT SELECT ON ebs_trades TO ebs_desk;

ADD USER trader_jane TO lmax_desk;
```

To change the exposed columns or add a join for every desk at once, edit
`desk_trades` only. The per-desk views inherit the change.

## Why callers cannot escape the filter

A member of `lmax_desk` holds `SELECT` on `lmax_trades` only. Attempting to
re-point the filter fails, because `lmax_trades` declares `@ecn` without
`OVERRIDABLE`:

```questdb-sql title="The filter cannot be overridden"
-- Fails with: variable is not overridable: @ecn
DECLARE @ecn := 'EBS' SELECT * FROM lmax_trades;
```

The overridable `@ecn` lives on the master view, which the desk never has access
to. Querying it directly is also denied, so there is no path to the unfiltered
rows.

## Grant to users and service accounts

`GRANT` targets any entity, so the same views work for a named user or for a
service account backing a BI tool or dashboard:

```questdb-sql title="Grant a view to a service account"
CREATE SERVICE ACCOUNT lmax_dashboard OWNED BY lmax_desk;
GRANT SELECT ON lmax_trades TO lmax_dashboard;
```

## Index the filter column with a posting index

These views filter on a SYMBOL column. When that column is high cardinality (for
example a per-account or per-tenant identifier) and each view returns only a
small slice of the table, a
[posting index](/docs/concepts/deep-dive/posting-index/) on it speeds up the
filter. Because each view also selects a fixed set of columns, listing those
columns in an `INCLUDE` clause makes it a covering query that is served from the
index sidecar without reading the base column files:

```questdb-sql title="Posting index covering the view's columns"
ALTER TABLE fx_trades
  ALTER COLUMN ecn ADD INDEX TYPE POSTING
  INCLUDE (symbol, side, price, quantity, counterparty);
```

The designated timestamp is appended to the `INCLUDE` list automatically. The
benefit depends on cardinality, selectivity, and the column set, so benchmark it
case by case rather than indexing by default.

:::info Related documentation

- [Views](/docs/concepts/views/)
- [CREATE VIEW](/docs/query/sql/create-view/)
- [DECLARE](/docs/query/sql/declare/)
- [GRANT](/docs/query/sql/acl/grant/)
- [Role-based access control (RBAC)](/docs/security/rbac/)
- [ALTER TABLE ADD INDEX](/docs/query/sql/alter-table-alter-column-add-index/)
- [Posting index](/docs/concepts/deep-dive/posting-index/)

:::
