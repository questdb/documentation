---
title: VACUUM TABLE
sidebar_label: VACUUM TABLE
description: VACUUM TABLE SQL keyword reference documentation
---

`VACUUM TABLE` reclaims storage by scanning file systems and deleting duplicate
directories and files.

## Syntax

![Flow chart showing Vacuum Table syntax](/images/docs/diagrams/vacuumTable.svg)

## Description

This command provides a manual mechanism to reclaim the disk space. The
implementation scans file system to detect duplicate directories and files.
Frequent usage of the command can be relatively expensive. Thus, `VACUUM TABLE`
has to be executed sparingly.

When a table is appended in an out-of-order manner, the `VACUUM TABLE` command
writes a new partition version to the disk. The old partition version directory
is deleted once it is not read by `SELECT` queries. In the event of file system
errors, physical deletion of old files may be interrupted and an outdated
partition version may be left behind consuming the disk space.

When an `UPDATE` SQL statement is run, it copies column files of the selected
table. The old column files are automatically deleted but in certain
circumstances, they can be left behind. In this case, `VACUUM TABLE` can be used
to re-trigger the deletion process of the old column files.

The `VACUUM TABLE` command starts a new scan over table partition directories
and column files. It detects redundant, unused files consuming the disk space
and deletes them. `VACUUM TABLE` executes asynchronously, i.e. it may keep
scanning and deleting files after their response is returned to the SQL client.

## Example

```questdb-sql
VACUUM TABLE trades;
```
