---
title: List of  QuestDB Error Codes
description:
  stub
---


# Error Code Summary

| Code                                    | Class        | Name                                      | Description                                                                        | Action                                                      |
|-----------------------------------------|--------------|-------------------------------------------|------------------------------------------------------------------------------------|-------------------------------------------------------------|
| <a id="ERR001" name="ERR001">ERR001</a> | Replication  | Could not complete point-in-time recovery | Could not start point-in-time recovered primary due to non-empty object store.     |                                                             |
| <a id="ERR002" name="ERR002">ERR002</a> | Replication  | Failed to read Local Sync Id              | Primary cannot start due to missing `_replication_sync_id.d` file.                 |                                                             |
| <a id="ERR003" name="ERR003">ERR003</a> | Replication  | Stale Local State                         | The local database state is too old, newer WALs are available in the object store. | Restore database from a newer snapshot so it is up to date. |
| <a id="ERR004" name="ERR004">ERR004</a> | Replication  | Table Corruption                          | The table is corrupted or out-of-sync.                                             | Restore database from a snapshot                            |
| <a id="ERR005" name="ERR005">ERR005</a> | Replication  | Cannot lock object store                  | The object store is in-use and owned by a different primary instance.              | Destroy instance, create replacement replica.               |
| <a id="ERR006" name="ERR006">ERR006</a> | Replication  | Primary instance has already migrated     | Another primary has taken over whilst this primary was disconnected.               | Destroy old primary instance, create replacement replica.   |


# Error Code Details

Below are extended descriptions for the error codes, with information about how they may occur and how you can
resolve the issues you are encountering.

## ERR001

## ERR002

## ERR003

## ERR004

## ERR005

## ERR006