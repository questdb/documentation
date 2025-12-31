---
title: SQL execution order
sidebar_label: SQL execution order
description:
  Execution order for SQL clauses in QuestDB. This covers the SQL keywords you
  may already be familiar with as well as extensions to the language that are
  unique to QuestDB.
---

QuestDB attempts to implement standard ANSI SQL. We also try to be compatible
with PostgreSQL, although parts of this are a work in progress. QuestDB
implements these clauses which have the following execution order:

1. [FROM](/docs/query/sql/select/)
2. [ON](/docs/query/sql/join/)
3. [JOIN](/docs/query/sql/join/)
4. [WHERE](/docs/query/sql/where/)
5. [LATEST ON](/docs/query/sql/latest-on/)
6. [GROUP BY](/docs/query/sql/group-by/) (optional)
7. [WITH](/docs/query/sql/with/)
8. [HAVING](/docs/concepts/deep-dive/sql-extensions/#implicit-having) (implicit)
9. [SELECT](/docs/query/sql/select/)
10. [DISTINCT](/docs/query/sql/distinct/)
11. [ORDER BY](/docs/query/sql/order-by/)
12. [LIMIT](/docs/query/sql/limit/)

We have also implemented sub-queries that users may execute at any part of a
query that mentions a table name. The sub-query implementation adds almost zero
execution cost to SQL. We encourage the use of sub-queries as they add flavors
of functional language features to traditional SQL.

For more information on the SQL extensions in QuestDB which deviate from ANSI
SQL and PostgreSQL, see the
[SQL extensions documentation](/docs/concepts/deep-dive/sql-extensions/).
