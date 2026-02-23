---
title: Replication tuning
sidebar_label: Tuning
description:
  Tune QuestDB replication for lower latency or reduced network costs.
---

import Screenshot from "@theme/Screenshot"
import { EnterpriseNote } from "@site/src/components/EnterpriseNote"

<EnterpriseNote>
  Tune replication for lower latency or reduced network costs.
</EnterpriseNote>

Replication tuning lets you balance **latency** against **network costs**. By
default, QuestDB uses balanced settings. You can tune for lower latency or
reduced network traffic depending on your needs.

## When to tune

| Goal | Approach |
|------|----------|
| **Low latency** | Smaller WAL segments, shorter throttle windows. |
| **Lower network costs** | Larger WAL segments, longer throttle windows. |

## Quick reference

**For low latency (sub-200ms)**:
```ini
# Primary
cairo.wal.segment.rollover.size=262144
replication.primary.throttle.window.duration=50
replication.primary.sequencer.part.txn.count=5000

# Replica
replication.replica.poll.interval=50
```

**For low latency (sub-500ms)**:
```ini
# Primary
cairo.wal.segment.rollover.size=524288
replication.primary.throttle.window.duration=100
replication.primary.sequencer.part.txn.count=5000

# Replica
replication.replica.poll.interval=100
```

**For network efficiency**:
```ini
# Primary
cairo.wal.segment.rollover.size=2097152
replication.primary.throttle.window.duration=60000
replication.primary.sequencer.part.txn.count=1000
```

## How replication works

Understanding the data flow helps you tune effectively:

1. **Ingestion** - Data is written to Write-Ahead Log (WAL) segments
2. **Upload** - WAL segments are uploaded to object storage
3. **Download** - Replicas download and apply WAL segments

The key insight: **smaller, more frequent uploads = lower latency but more
network traffic**. Larger, less frequent uploads = higher latency but lower
costs.

<Screenshot
  alt="Network traffic with default settings"
  title="Default settings: optimized for latency"
  height={360}
  src="images/guides/replication-tuning/one_row_sec_defaults.webp"
  width={1072}
/>

<Screenshot
  alt="Network traffic with network efficiency settings"
  title="Tuned settings: optimized for network efficiency"
  height={360}
  src="images/guides/replication-tuning/one_row_sec_small.webp"
  width={1072}
/>

## Settings explained

### WAL segment size

```ini
cairo.wal.segment.rollover.size=2097152
```

Controls when WAL segments are closed and uploaded. Smaller segments upload
sooner (lower latency) but create more files.

| Value | Behavior |
|-------|----------|
| `262144` (256 KiB) | Lower latency, but more network traffic. |
| `2097152` (2 MiB) | Higher latency, but less network traffic. |

:::note
Some object stores have minimum file size requirements. AWS S3 Intelligent
Tiering requires files over 128 KiB.
:::

### Throttle window

```ini
replication.primary.throttle.window.duration=10000  # 10 seconds (default)
```

Maximum time before uploading incomplete segments. Longer windows let segments
fill up before upload, reducing redundant uploads (write amplification).

| Value | Behavior |
|-------|----------|
| `50` (50ms) | Ultra-low latency. Best with NFS transport. |
| `100` (100ms) | Low latency. Good balance for NFS transport. |
| `1000` (1s) | Low latency for object store transport. |
| `10000` (10s) | Default. Balanced. |
| `60000` (60s) | 1 minute delay OK. Fewer uploads. |
| `300000` (5 min) | Cost-sensitive. Batches more data. |

This is your **maximum replication latency tolerance**. QuestDB still actively
manages replication to prevent backlogs during bursts.

### Replica poll interval

```ini
replication.replica.poll.interval=1000  # 1 second (default)
```

How often the replica checks the transport layer for new data. This setting
is configured on the **replica** node.

| Value | Behavior |
|-------|----------|
| `50` (50ms) | Ultra-low latency. Pair with aggressive primary settings. |
| `100` (100ms) | Low latency. Good for NFS transport. |
| `1000` (1s) | Default. Balanced. |

:::note
Reducing the poll interval below the throttle window duration has diminishing
returns, since the replica cannot consume data faster than the primary produces it.
:::

### Sequencer part size

```ini
replication.primary.sequencer.part.txn.count=5000
```

Controls how many transactions are grouped into each sequencer part file.

Instead of uploading the entire transaction log on every replication cycle
(which grows indefinitely), the sequencer is split into fixed-size part files.
Only new or changed parts are uploaded, significantly reducing network overhead.

| Value | Effect |
|-------|--------|
| Lower (e.g. `1000`) | Smaller part files, more frequent new parts, more object storage requests, faster incremental uploads. |
| Higher (e.g. `5000`) | Larger part files, fewer parts, fewer object storage requests, larger per-upload size. |

Default is `5000` (each part ~34-68 KiB compressed).

:::warning
This setting is **fixed at table creation**. You cannot change it for existing
tables.
:::

## Compression (reference)

WAL data is compressed before upload. This isn't tunable, but useful for
estimating storage and network requirements:

| Data type | Compression ratio |
|-----------|-------------------|
| WAL segments | ~8x |
| Sequencer parts | ~6x |

For example, a 2 MiB WAL segment becomes ~256 KiB in object storage.

## Next steps

- [Replication overview](/docs/high-availability/overview/) - How replication works
- [Setup guide](/docs/high-availability/setup/) - Configure replication
- [Configuration reference](/docs/configuration/overview/) - All server settings
