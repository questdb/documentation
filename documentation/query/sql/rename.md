---
title: RENAME TABLE keyword
sidebar_label: RENAME TABLE
description: RENAME TABLE SQL keyword reference documentation.
---

`RENAME TABLE` is used to change the name of a table.

## Syntax

```questdb-sql
RENAME TABLE oldName TO newName;
```

## Example

```questdb-sql
RENAME TABLE 'test.csv' TO 'myTable';
```
