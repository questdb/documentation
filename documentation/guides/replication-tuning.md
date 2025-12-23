---
title: Replication tuning
sidebar_label: Tuning
description:
  Tune QuestDB replication for lower latency or reduced network costs.
---

import Screenshot from "@theme/Screenshot"

Replication tuning lets you balance **latency** against **network costs**. By
default, QuestDB optimizes for low latency. If network bandwidth or cloud
storage costs are a concern, you can tune for efficiency instead.

## When to tune

| Goal | Approach |
|------|----------|
| **Low latency** (default) | Keep defaults. Replicas stay up-to-date within seconds. |
| **Lower network costs** | Increase batch sizes and throttle windows. Trades latency for efficiency. |
| **High-throughput ingestion** | Larger WAL segments reduce overhead during bursts. |

## Quick reference

**For low latency** (default):
```ini
cairo.wal.segment.rollover.size=2097152
replication.primary.throttle.window.duration=10000
replication.primary.sequencer.part.txn.count=5000
```

**For network efficiency** (57% less network traffic):
```ini
cairo.wal.segment.rollover.size=262144
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
cairo.wal.segment.rollover.size=2097152  # 2 MiB (default)
```

Controls when WAL segments are closed and uploaded. Smaller segments upload
sooner (lower latency) but create more files.

| Value | Behavior |
|-------|----------|
| `2097152` (2 MiB) | Default. Good balance for most cases. |
| `262144` (256 KiB) | Smaller files, less network overhead. |

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
| `10000` (10s) | Default. Low latency, more uploads. |
| `60000` (60s) | 1 minute delay OK. Fewer uploads. |
| `300000` (5 min) | Cost-sensitive. Batches more data. |

This is your **maximum replication latency tolerance**. QuestDB still actively
manages replication to prevent backlogs during bursts.

### Sequencer part size

```ini
replication.primary.sequencer.part.txn.count=5000  # transactions (default)
```

Transactions are grouped into "parts" for upload. Smaller parts = smaller files.

| Value | Approx. compressed size |
|-------|-------------------------|
| `5000` | ~23 KiB |
| `1000` | ~4.5 KiB |

:::warning
This setting is **fixed once replication is enabled**. You cannot change it
later for existing tables.
:::

## Compression impact

WAL data is compressed before upload. Expect roughly:

| Data type | Compression ratio |
|-----------|-------------------|
| WAL segments | ~8x |
| Sequencer parts | ~6x |

For example, a 2 MiB WAL segment becomes ~256 KiB in object storage.

## Next steps

- [Replication overview](/docs/concept/replication/) - How replication works
- [Setup guide](/docs/operations/replication/) - Configure replication
- [Configuration reference](/docs/configuration/) - All server settings
