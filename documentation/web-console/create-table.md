---
title: Create Table
description: Create a new table using QuestDB Web Console
---

import Screenshot from "@theme/Screenshot"

The Web Console provides an interactive interface for creating new tables through the "Create table" tab that can be opened from the right-hand side bar.

<Screenshot
  alt="Screenshot of the create table tab"
  small
  src="images/docs/console/create-table-tab.webp"
  width={300}
/>

The Create table tab allows you to define the table structure, partition settings, WAL configuration, and add columns using an intuitive UI.

<Screenshot
  alt="Screenshot of the create table panel"
  height={495}
  small
  src="images/docs/console/create-table.webp"
  width={455}
/>


## Actions
- **Remove column**: Removes the last focused column from the schema
- **Insert column above**: Inserts a new column above the last focused column
- **Insert column below**: Inserts a new column below the last focused column
- **Create**: Creates the table with the specified storage details and columns

## Table settings
You can set the table name from the name input, select the partitioning type, and specify whether WAL is enabled using the respective dropdowns.

See [WAL](/docs/concept/write-ahead-log/) and [Partitions](/docs/concept/partitions/) concepts for more details.

## Column settings
You can specify the name and [data type](/docs/reference/sql/datatypes/) for a column.
- For columns with type `timestamp`, you can specify if the column will be the designated timestamp.
- For columns with type `geohash`, you can specify the [precision](/docs/concept/geohashes/#specifying-geohash-precision) of the column.

