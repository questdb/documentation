---
title: ALTER TABLE RENAME COLUMN
sidebar_label: RENAME COLUMN
description: RENAME COLUMN SQL keyword reference documentation.
---

Rename a column in an existing table.

:::caution

- New column names may only consist of letters, numbers and underscores `_`

:::

## Syntax

```questdb-sql
ALTER TABLE tableName RENAME COLUMN columnName TO newColumnName;
```

## Example

The following example renames an existing column called `sensor` to
`hum_sensor_1` from the table `measurements`:

```questdb-sql title="Renaming a column"
ALTER TABLE measurements RENAME COLUMN sensor TO hum_sensor_1;
```
