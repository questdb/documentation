---
title: List of  QuestDB Error Codes
description:
  stub
---





| Code                                 | Class        | Name                                      | Description                                                                        | Action                                                      |
|--------------------------------------|--------------|-------------------------------------------|------------------------------------------------------------------------------------|-------------------------------------------------------------|
| <a id="ERR01" name="ERR01">ERR01</a> | Replication  | Could not complete point-in-time recovery | Could not start point-in-time recovered primary due to non-empty object store.     |                                                             |
| <a id="ERR02" name="ERR02">ERR02</a> | Replication  | Failed to read Local Sync Id              | Primary cannot start due to missing `_replication_sync_id.d` file.                 |                                                             |
| <a id="ERR03" name="ERR03">ERR03</a> | Replication  | Stale Local State                         | The local database state is too old, newer WALs are available in the object store. | Restore database from a newer snapshot so it is up to date. |
| <a id="ERR04" name="ERR04">ERR04</a> | Replication  | Table Corruption                          | The table is corrupted or out-of-sync.                                             | Restore database from a snapshot                            |
| <a id="ERR05" name="ERR05">ERR05</a> | Replication  | Cannot lock object store                  | The object store is in-use and owned by a different primary instance.              | Destroy instance, create replacement replica.               |
| <a id="ERR06" name="ERR06">ERR06</a> | Replication  | Primary instance has already migrated     | Another primary has taken over whilst this primary was disconnected.               | Destroy old primary instance, create replacement replica.   |
