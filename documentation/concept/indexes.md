---
title: Indexes
sidebar_label: Indexes
description:
  Explanation on how indexes work as well as the pros and cons that you need to
  be aware of when using them.
---

An index stores the row locations for each value of the target column in order
to provide faster read access. It allows you to bypass full table scans by
directly accessing the relevant rows during queries with `WHERE` conditions.

Indexing is available for [symbol](/docs/concept/symbol/) columns in both tables
and [materialized views](/docs/concept/mat-views). Index support
for other types will be added over time.

## Index creation and deletion

The following are ways to index a `symbol` column:

- At table creation time using
  [CREATE TABLE](/docs/reference/sql/create-table/#column-indexes)
- Using
  [ALTER TABLE ALTER COLUMN ADD INDEX](/docs/reference/sql/alter-table-alter-column-add-index/)
  to index an existing `symbol` column in a table.
- Using
  [ALTER MATERIALIZED VIEW ALTER COLUMN ADD INDEX](/docs/reference/sql/alter-mat-view-alter-column-add-index/)
  to index an existing `symbol` column in a materialized view.

To delete an index:

- From a table: [ALTER TABLE ALTER COLUMN DROP INDEX](/docs/reference/sql/alter-table-alter-column-drop-index/)
- From a materialized view: [ALTER MATERIALIZED VIEW ALTER COLUMN DROP INDEX](/docs/reference/sql/alter-mat-view-alter-column-drop-index/)

## How indexes work

Index creates a table of row locations for each distinct value for the target
[symbol](/docs/concept/symbol/). Once the index is created, inserting data into
the table (or materialized view) will update the index. Lookups on indexed values will be performed in
the index table directly which will provide the memory locations of the items,
thus avoiding unnecessary table scans.

Here is an example of a table and its index table.

```shell
Table                                       Index
|Row ID | Symbol    | Value |             | Symbol     | Row IDs       |
| 1     | A         | 1     |             | A          | 1, 2, 4       |
| 2     | A         | 0     |             | B          | 3             |
| 3     | B         | 1     |             | C          | 5             |
| 4     | A         | 1     |
| 5     | C         | 0     |
```

`INSERT INTO Table values(B, 1);` would trigger two updates: one for the Table,
and one for the Index.

```shell
Table                                       Index
|Row ID | Symbol    | Value |             | Symbol     | Row IDs       |
| 1     | A         | 1     |             | A          | 1, 2, 4       |
| 2     | A         | 0     |             | B          | 3, 6          |
| 3     | B         | 1     |             | C          | 5             |
| 4     | A         | 1     |
| 5     | C         | 0     |
| 6     | B         | 1     |
```

## Advantages

Index allows you to greatly reduce the complexity of queries that span a subset
of an indexed column, typically when using `WHERE` clauses.

Consider the following query applied to the above table
`SELECT sum(Value) FROM Table WHERE Symbol='A';`

- **Without Index**, the query engine would scan the whole table in order to
  perform the query. It will need to perform 6 operations (read each of the 6
  rows once).
- **With Index**, the query engine will first scan the index table, which is
  considerably smaller. In our example, it will find A in the first row. Then,
  the query engine would check the values at the specific locations 1, 2, 4 in
  the table to read the corresponding values. As a result, it would only scan
  the relevant rows in the table and leave irrelevant rows untouched.

## Trade-offs

- **Storage space**: The index will maintain a table with each distinct symbol
  value and the locations where these symbols can be found. As a result, there
  is a small cost of storage associated with indexing a symbol field.

- **Ingestion performance**: Each new entry in the table or materialized view will trigger an entry
  in the Index table. This means that any write will now require two write
  operations, and therefore take twice as long.

## Index capacity

:::warning

We strongly recommend to rely on the default index capacity. Misconfiguring this property might
lead to worse performance and increased disk usage.

When in doubt, reach out via the QuestDB support channels for advice.

:::

:::note

- The **index capacity** and
  [**symbol capacity**](/docs/concept/symbol/) are different
  settings.
- The index capacity value should not be changed, unless a user is aware of all
  the implications.

:::

When a symbol column is indexed, an additional **index capacity** can be defined
to specify how many row IDs to store in a single storage block on disk:

- Server-wide setting: `cairo.index.value.block.size` with a default of `256`
- Column-wide setting: The
  [`index` option](/docs/reference/sql/create-table/#column-indexes) for
  `CREATE TABLE`
- Column-wide setting for a table:
  [ALTER TABLE COLUMN ADD INDEX](/docs/reference/sql/alter-table-alter-column-add-index/)
- Column-wide setting for a materialized view:
  [ALTER MATERIALIZED VIEW COLUMN ADD INDEX](/docs/reference/sql/alter-mat-view-alter-column-add-index/)

Fewer blocks used to store row IDs achieves better performance. At the same time
over-sizing the setting will result in higher than necessary disk space usage.


Consider an example table with 200 unique stock symbols and 1,000,000,000
records over time stored in a single partition. The index will have to store
1,000,000,000 / 200 row IDs for each symbol, i.e. 5,000,000 per symbol.

Since indexes are per-partition, spreading data across multiple partitions
reduces the row IDs stored in each partition's index.

- If the index capacity is set to 1,048,576 in this case, QuestDB will use 5
  blocks to store the row IDs.
- If the index capacity is set to 1,024 in this case, the block count will be
  4,883.


## Examples

### Table with index

An example of `CREATE TABLE` command:

```questdb-sql
CREATE TABLE my_table(symb SYMBOL, price DOUBLE, ts TIMESTAMP),
  INDEX (symb) timestamp(ts);
```
