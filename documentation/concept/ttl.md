---
title: Time To Live (TTL)
sidebar_label: Time To Live (TTL)
description: Use the time-to-live feature to limit data size
---

If you're interested in storing and analyzing only recent data with QuestDB, you
can configure a time-to-live for the table data. Both the `CREATE TABLE` and
`ALTER TABLE` commands support configuring this feature.

The age of the data is measured with respect to the most recent timestamp stored
in the table.

Keep in mind that the TTL feature is designed only to limit the stored data
size, and doesn't have strict semantics. It works at the granularity of
partitions, and a partition is eligible for eviction once the entire time period
it's responsible for falls behind the TTL deadline. QuestDB will take action and
remove stale partitions only during a data commit operation, so if you don't add
any new data, the stale data lingers on.
