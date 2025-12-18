---
title: Copy Data Between QuestDB Instances
sidebar_label: Copy data between instances
description: Copy tables and data between QuestDB instances using backup/restore, SQL export/import, and programmatic methods
---

Transfer data between QuestDB instances for migrations, backups, development environments, or multi-region deployments. This guide covers multiple methods with different trade-offs for speed, consistency, and ease of use.

## Problem: Move Data Between Instances

Common scenarios:
- **Migration**: Move from development to production
- **Backup/restore**: Copy data to backup instance
- **Testing**: Clone production data to staging
- **Multi-region**: Replicate data across regions
- **Disaster recovery**: Restore from backup

## Method 1: Filesystem Copy (Fastest)

Copy table directories directly between instances.

### Prerequisites

- Both instances must be **stopped**
- Same QuestDB version (or compatible)
- Same OS architecture recommended

### Steps

**On source instance:**
```bash
# Stop QuestDB
docker stop questdb-source
# or
systemctl stop questdb

# Navigate to QuestDB data directory
cd /var/lib/questdb/db

# List tables
ls -lh
```

**Copy table directory:**
```bash
# Copy to remote server
scp -r /var/lib/questdb/db/trades user@target-server:/var/lib/questdb/db/

# Or copy to local destination
cp -r /var/lib/questdb/db/trades /backup/questdb/db/

# Or use rsync for large tables
rsync -avz --progress /var/lib/questdb/db/trades/ user@target-server:/var/lib/questdb/db/trades/
```

**On target instance:**
```bash
# Ensure correct ownership
chown -R questdb:questdb /var/lib/questdb/db/trades

# Start QuestDB
docker start questdb-target
# or
systemctl start questdb
```

**Verify:**
```sql
SELECT count(*) FROM trades;
SELECT min(timestamp), max(timestamp) FROM trades;
```

### Pros and Cons

**Pros:**
- Fastest method (no serialization/deserialization)
- Preserves all metadata (symbols, indexes, partitions)
- Exact binary copy

**Cons:**
- Requires downtime (both instances must be stopped)
- Must copy entire table (no filtering)
- Version compatibility required
- No incremental updates

## Method 2: Backup and Restore

Use QuestDB's native backup/restore functionality.

### Create Backup

**SQL command:**
```sql
BACKUP TABLE trades;
```

This creates a backup in `<questdb_root>/backup/trades/<timestamp>/`.

**Backup all tables:**
```sql
BACKUP DATABASE;
```

### Copy Backup Files

```bash
# On source server
cd /var/lib/questdb/backup/trades/2025-01-15T10-30-00/
tar -czf trades_backup.tar.gz *

# Transfer to target server
scp trades_backup.tar.gz user@target-server:/tmp/

# On target server
mkdir -p /var/lib/questdb/backup/trades/2025-01-15T10-30-00/
cd /var/lib/questdb/backup/trades/2025-01-15T10-30-00/
tar -xzf /tmp/trades_backup.tar.gz
```

### Restore on Target

```sql
-- Drop existing table if needed
DROP TABLE IF EXISTS trades;

-- Restore from backup
RESTORE TABLE trades FROM '/var/lib/questdb/backup/trades/2025-01-15T10-30-00/';
```

### Pros and Cons

**Pros:**
- Clean, supported method
- Can backup while instance is running
- Verifiable backup integrity

**Cons:**
- Requires disk space for backup
- Two-step process (backup, then restore)
- No incremental backups

## Method 3: SQL Export and Import

Export as SQL inserts or CSV, then import on target.

### Export as CSV

**From source:**
```sql
COPY trades TO '/tmp/trades.csv' WITH HEADER true;
```

Or via psql:
```bash
psql -h source-host -p 8812 -U admin -d questdb -c \
  "COPY (SELECT * FROM trades WHERE timestamp >= '2025-01-01') TO STDOUT WITH CSV HEADER" \
  > trades.csv
```

### Import to Target

**Via Web Console:**
1. Navigate to http://target-host:9000
2. Click "Import"
3. Upload trades.csv
4. Configure schema and designated timestamp
5. Click "Import"

**Via REST API:**
```bash
curl -F data=@trades.csv \
  -F name=trades \
  -F timestamp=timestamp \
  -F partitionBy=DAY \
  http://target-host:9000/imp
```

**Via COPY (QuestDB 8.0+):**
```sql
COPY trades FROM '/tmp/trades.csv'
WITH HEADER true
TIMESTAMP timestamp
PARTITION BY DAY;
```

### Pros and Cons

**Pros:**
- Works across different QuestDB versions
- Can filter data during export
- Human-readable format (CSV)
- No downtime required

**Cons:**
- Slower (serialization overhead)
- Larger file sizes
- Symbol dictionaries not preserved
- Need to recreate indexes

## Method 4: ILP Streaming (Incremental)

Stream data via InfluxDB Line Protocol for continuous replication.

### Python Example

```python
import psycopg2
from questdb.ingress import Sender

# Connect to source
source_conn = psycopg2.connect(
    host="source-host", port=8812,
    user="admin", password="quest", database="questdb"
)

# Stream to target via ILP
with Sender('target-host', 9009) as sender:
    cursor = source_conn.cursor()
    cursor.execute("""
        SELECT timestamp, symbol, price, amount
        FROM trades
        WHERE timestamp >= now() - interval '1' day
        ORDER BY timestamp
    """)

    for row in cursor:
        timestamp, symbol, price, amount = row
        sender.row(
            'trades',
            symbols={'symbol': symbol},
            columns={'price': price, 'amount': amount},
            at=int(timestamp.timestamp() * 1_000_000)  # Convert to microseconds
        )

    sender.flush()

source_conn.close()
```

### Real-Time Replication

For ongoing replication, query new data periodically:

```python
import time
from datetime import datetime, timedelta

last_sync = datetime.now() - timedelta(days=1)

while True:
    cursor.execute("""
        SELECT timestamp, symbol, price, amount
        FROM trades
        WHERE timestamp > %s
        ORDER BY timestamp
    """, (last_sync,))

    rows = cursor.fetchall()
    if rows:
        for row in rows:
            # Send via ILP as above
            sender.row(...)

        last_sync = rows[-1][0]  # Update to latest timestamp
        sender.flush()

    time.sleep(60)  # Check every minute
```

### Pros and Cons

**Pros:**
- Incremental updates possible
- Works while both instances are running
- Can transform data during transfer
- Can replicate to multiple targets

**Cons:**
- Requires programming
- Network overhead
- Must handle connection failures
- Need to track last synced position

## Method 5: PostgreSQL Logical Replication (Advanced)

Use external tools that support PostgreSQL wire protocol.

### Using Debezium

Not directly supported, but can use CDC patterns with polling:

**Source query (periodic):**
```sql
SELECT *
FROM trades
WHERE timestamp > :last_checkpoint
ORDER BY timestamp
LIMIT 10000;
```

Stream results to target via ILP or PostgreSQL COPY.

### Pros and Cons

**Pros:**
- Can integrate with data pipelines
- Near real-time replication
- Works with heterogeneous targets

**Cons:**
- Complex setup
- External dependencies
- Requires checkpoint management

## Comparison Matrix

| Method | Speed | Downtime | Incremental | Filtering | Complexity |
|--------|-------|----------|-------------|-----------|------------|
| **Filesystem Copy** | ⭐⭐⭐⭐⭐ | Required | ❌ | ❌ | ⭐ |
| **Backup/Restore** | ⭐⭐⭐⭐ | Partial | ❌ | ❌ | ⭐⭐ |
| **SQL Export/Import** | ⭐⭐ | None | ❌ | ✅ | ⭐⭐ |
| **ILP Streaming** | ⭐⭐⭐ | None | ✅ | ✅ | ⭐⭐⭐⭐ |
| **Logical Replication** | ⭐⭐⭐ | None | ✅ | ✅ | ⭐⭐⭐⭐⭐ |

## Large Table Considerations

For tables > 100GB:

### Parallel Export/Import

```bash
# Export partitions in parallel
for partition in 2025-01-{01..31}; do
  psql -h source -c "COPY (SELECT * FROM trades WHERE timestamp::date = '$partition') TO STDOUT" | \
  psql -h target -c "COPY trades FROM STDIN" &
done
wait
```

### Compression

```bash
# Compress during transfer
pg_dump -h source -t trades | gzip | ssh target "gunzip | psql"

# Or use pigz for parallel compression
pg_dump -h source -t trades | pigz -9 | ssh target "unpigz | psql"
```

### Split by Partition

```bash
# Copy one partition at a time (filesystem method)
for partition in /var/lib/questdb/db/trades/2025-01-*; do
  rsync -avz "$partition" target:/var/lib/questdb/db/trades/
done
```

## Verification

After copying, verify data integrity:

**Row counts:**
```sql
-- On source
SELECT count(*) FROM trades;

-- On target (should match)
SELECT count(*) FROM trades;
```

**Timestamp range:**
```sql
SELECT min(timestamp), max(timestamp) FROM trades;
```

**Checksums:**
```sql
-- On both instances
SELECT
  symbol,
  count(*) as row_count,
  sum(cast(price AS LONG)) as price_checksum,
  sum(cast(amount AS LONG)) as amount_checksum
FROM trades
GROUP BY symbol
ORDER BY symbol;
```

**Sample verification:**
```sql
-- Compare random samples
SELECT * FROM trades WHERE timestamp = '2025-01-15T12:34:56.789012Z';
```

## Automating Backups

### Daily Backup Script

```bash
#!/bin/bash
# backup-questdb.sh

BACKUP_DIR="/backup/questdb/$(date +%Y-%m-%d)"
SOURCE_DB="/var/lib/questdb/db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Stop QuestDB (optional, for consistent backup)
# systemctl stop questdb

# Copy tables
for table in "$SOURCE_DB"/*; do
  if [ -d "$table" ]; then
    table_name=$(basename "$table")
    echo "Backing up $table_name..."
    tar -czf "$BACKUP_DIR/${table_name}.tar.gz" -C "$SOURCE_DB" "$table_name"
  fi
done

# Start QuestDB
# systemctl start questdb

# Cleanup old backups (keep last 7 days)
find /backup/questdb/ -type d -mtime +7 -exec rm -rf {} \;

echo "Backup complete: $BACKUP_DIR"
```

**Add to crontab:**
```bash
# Run daily at 2 AM
0 2 * * * /usr/local/bin/backup-questdb.sh >> /var/log/questdb-backup.log 2>&1
```

## Multi-Region Replication

For active-active or active-passive setups:

```python
# Continuous replication with conflict resolution
def replicate_to_regions(source_host, target_hosts):
    with psycopg2.connect(host=source_host, ...) as source:
        senders = [Sender(host, 9009) for host in target_hosts]

        last_ts = get_last_checkpoint()

        while True:
            cursor = source.cursor()
            cursor.execute("""
                SELECT * FROM trades
                WHERE timestamp > %s
                ORDER BY timestamp
                LIMIT 10000
            """, (last_ts,))

            batch = cursor.fetchall()
            if not batch:
                time.sleep(10)
                continue

            # Replicate to all regions
            for sender in senders:
                for row in batch:
                    sender.row('trades', ...)
                sender.flush()

            last_ts = batch[-1][0]
            save_checkpoint(last_ts)
```

## Troubleshooting

### "Table already exists"

```sql
-- Drop and recreate
DROP TABLE IF EXISTS trades;

-- Or truncate and append
TRUNCATE TABLE trades;
```

### Permission Denied

```bash
# Fix ownership
chown -R questdb:questdb /var/lib/questdb/db/trades

# Fix permissions
chmod -R 755 /var/lib/questdb/db/trades
```

### Incomplete Transfer

```sql
-- Check for gaps in time-series
SELECT
  timestamp,
  lag(timestamp) OVER (ORDER BY timestamp) as prev_timestamp,
  timestamp - lag(timestamp) OVER (ORDER BY timestamp) as gap_micros
FROM trades
WHERE timestamp - lag(timestamp) OVER (ORDER BY timestamp) > 3600000000  -- Gaps > 1 hour
ORDER BY timestamp;
```

:::tip Best Practices
1. **Test first**: Always test your copy method on a small table
2. **Verify after**: Check row counts, timestamps, and sample data
3. **Monitor during**: Watch disk space, memory, and network usage
4. **Backup before**: Keep a backup before major data operations
5. **Automate**: Script and schedule regular backups
:::

:::warning Downtime Planning
Methods requiring downtime:
- **Filesystem copy**: Both instances must be stopped
- **Backup** (optional): Source can run, target stopped during restore

Methods with no downtime:
- **SQL export/import**: Both instances can run
- **ILP streaming**: Both instances remain operational
:::

:::info Related Documentation
- [Backup command](/docs/operations/backup/)
- [COPY command](/docs/reference/sql/copy/)
- [ILP ingestion](/docs/ingestion-overview/)
- [PostgreSQL wire protocol](/docs/reference/api/postgres/)
:::
