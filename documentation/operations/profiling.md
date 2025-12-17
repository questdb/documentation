---
title: Profiling
sidebar_label: Profiling
description: How to profile QuestDB using async-profiler to diagnose performance issues and analyze CPU usage, memory allocation, and other runtime behaviors.
---

import Tabs from "@theme/Tabs"
import TabItem from "@theme/TabItem"

QuestDB supports profiling via [async-profiler](https://github.com/async-profiler/async-profiler), a low-overhead sampling profiler for Java applications. Profiling helps diagnose performance issues by analyzing CPU usage, memory allocation, lock contention, and other runtime behaviors.

This page covers the two profiling modes available through the `questdb.sh` script:

- [Attach to a running instance](#attach-to-a-running-instance) - Profile an already running QuestDB server
- [Continuous profiling](#continuous-profiling) - Start QuestDB with the profiler agent loaded from startup

## Prerequisites

Profiling requires [async-profiler](https://github.com/async-profiler/async-profiler). QuestDB ships with async-profiler bundled in the **Linux x86_64** distribution only. For other platforms, you must install async-profiler separately.

### Linux kernel settings

Profiling works without any kernel configuration changes, but for best accuracy on Linux, configure the following kernel parameters:

```shell
# Allow unrestricted access to perf events
sudo sysctl kernel.perf_event_paranoid=-1

# Expose kernel symbols for complete stack traces
sudo sysctl kernel.kptr_restrict=0
```

To make these settings permanent, add them to `/etc/sysctl.conf` or create a file in `/etc/sysctl.d/`:

```shell
# /etc/sysctl.d/99-profiling.conf
kernel.perf_event_paranoid=-1
kernel.kptr_restrict=0
```

| Setting | Recommended Value | Description |
| ------- | ----------------- | ----------- |
| `perf_event_paranoid` | `-1` | Controls access to performance events. Value `-1` allows unrestricted access to perf events, providing the most accurate profiling results. |
| `kptr_restrict` | `0` | Controls kernel pointer visibility. Value `0` exposes kernel symbols, enabling complete stack traces including kernel frames. |

Without these settings, profiling still works but may have reduced accuracy.

:::warning

These settings have security implications as they expose performance counters and kernel addresses. On production systems, consider enabling them only during profiling sessions, or use more restrictive values based on your security requirements. See the [Linux kernel perf security documentation](https://www.kernel.org/doc/html/v6.0/admin-guide/perf-security.html) for details.

:::

## Attach to a running instance

Use the `profile` command to attach async-profiler to an already running QuestDB instance. This mode is useful for ad-hoc profiling of production systems without requiring a restart.

### Syntax

```shell
./questdb.sh profile [-t tag] -- [profiler-args]
```

| Option | Description |
| ------ | ----------- |
| `-t`   | Process tag to identify which QuestDB instance to profile. Defaults to `questdb` if omitted. |
| `--`   | Separator between questdb.sh options and async-profiler arguments. |

All arguments after `--` are passed directly to the `asprof` command-line tool.

### Examples

Profile CPU usage for 30 seconds and generate an HTML flame graph:

```shell
./questdb.sh profile -- -e cpu -d 30 -f /tmp/cpu-profile.html
```

Profile memory allocations:

```shell
./questdb.sh profile -- -e alloc -d 60 -f /tmp/alloc-profile.html
```

Profile a specific tagged instance:

```shell
./questdb.sh profile -t mydb -- -e cpu -d 30 -f /tmp/profile.html
```

Profile lock contention:

```shell
./questdb.sh profile -- -e lock -d 30 -f /tmp/lock-profile.html
```

Generate a JFR (Java Flight Recorder) file instead of HTML:

```shell
./questdb.sh profile -- -e cpu -d 60 -f /tmp/profile.jfr
```

### Common profiler arguments

| Argument | Description |
| -------- | ----------- |
| `-e <event>` | Event to profile: `cpu`, `alloc`, `lock`, `wall`, `itimer`, etc. |
| `-d <seconds>` | Duration of profiling in seconds. |
| `-f <file>` | Output file. Extension determines format: `.html` for flame graph, `.jfr` for JFR, `.svg` for SVG. |
| `-i <interval>` | Sampling interval (e.g., `10ms`, `1us`). |
| `-t` | Profile only specific threads. |
| `--all-user` | Include only user-mode events. |

For a complete list of options, see the [async-profiler documentation](https://github.com/async-profiler/async-profiler).

## Continuous profiling

Use the `-p` flag with the `start` command to launch QuestDB with the profiler agent loaded from startup. This mode enables continuous profiling, which is useful for capturing events that occur during server initialization or for long-running profile sessions.

### Syntax

```shell
./questdb.sh start -p [-d dir] [-f] [-n] [-t tag] [-- agent-params]
```

| Option | Description |
| ------ | ----------- |
| `-p`   | Enable async-profiler agent at startup. |
| `-d`   | QuestDB root directory. |
| `-f`   | Force overwrite of the public (Web Console) directory. |
| `-n`   | Disable HUP signal handler (keeps QuestDB running after terminal closes). |
| `-t`   | Process tag for identification. |
| `--`   | Separator between questdb.sh options and JVM agent parameters. |

Arguments after `--` are passed as JVM agent parameters to async-profiler.

### Examples

Start QuestDB with continuous CPU profiling, writing to a JFR file:

```shell
./questdb.sh start -p -- start,event=cpu,file=/tmp/profile.jfr,interval=10ms
```

Start with memory allocation profiling:

```shell
./questdb.sh start -p -- start,event=alloc,file=/tmp/alloc.jfr
```

Start with wall-clock profiling (useful for detecting I/O wait times):

```shell
./questdb.sh start -p -- start,event=wall,file=/tmp/wall.jfr,interval=5ms
```

### Agent parameters

When using continuous profiling, parameters are passed in a comma-separated format:

| Parameter | Description |
| --------- | ----------- |
| `start` | Begin profiling immediately on JVM startup. |
| `event=<type>` | Event type to profile: `cpu`, `alloc`, `lock`, `wall`, etc. |
| `file=<path>` | Output file path. |
| `interval=<time>` | Sampling interval (e.g., `10ms`, `1us`). |
| `jfr` | Force JFR output format. |
| `collapsed` | Output in collapsed stack format (for custom flame graphs). |

## Interpreting results

### HTML flame graphs

HTML flame graphs provide an interactive visualization of the call stack:

- **Width** of each box represents the proportion of time spent in that function
- **Color** typically indicates the type of code (Java, native, kernel)
- **Click** on a box to zoom in on that portion of the stack
- **Search** functionality helps locate specific methods

### JFR files

JFR (Java Flight Recorder) files can be analyzed using:

- **JDK Mission Control (JMC)** - Oracle's profiling tool
- **IntelliJ IDEA** - Built-in JFR viewer
- **VisualVM** - With JFR plugin
- **async-profiler's converter** - Convert to other formats

To convert JFR to HTML flame graph:

```shell
java -cp /path/to/converter.jar jfr2flame profile.jfr output.html
```

To convert JFR to a heatmap (useful for spotting patterns and infrequent hiccups/outliers):

```shell
java -cp /path/to/converter.jar jfr2heat profile.jfr output.html
```

Heatmaps visualize samples over time, making it easier to identify periodic patterns, latency spikes, and rare events that might be hidden in aggregated flame graphs.

## Common profiling scenarios

### Diagnosing high CPU usage

Profile CPU to identify hot methods:

```shell
./questdb.sh profile -- -e cpu -d 60 -f /tmp/cpu.html
```

Look for wide boxes at the top of the flame graph, which indicate methods consuming the most CPU time.

### Investigating slow queries

Use wall-clock profiling to capture time spent waiting (I/O, locks, etc.):

```shell
./questdb.sh profile -- -e wall -d 30 -f /tmp/wall.html
```

### Memory allocation analysis

Profile allocations to find memory-intensive operations:

```shell
./questdb.sh profile -- -e alloc -d 60 -f /tmp/alloc.html
```

### Lock contention

Identify synchronization bottlenecks:

```shell
./questdb.sh profile -- -e lock -d 30 -f /tmp/lock.html
```

## Troubleshooting

### Profiler fails to attach

If the profiler cannot attach to a running instance:

1. Verify QuestDB is running: `./questdb.sh status`
2. Check that you're using the correct tag if running multiple instances
3. Ensure you have sufficient permissions (may require running as the same user)

### Missing symbols in flame graph

If the flame graph shows `[unknown]` frames:

1. Ensure debug symbols are available for native libraries
2. On Linux, install `perf-map-agent` for JIT-compiled code symbols
3. Use the `--all-user` flag to exclude kernel frames if not needed

### High overhead

If profiling causes noticeable performance impact:

1. Increase the sampling interval: `-i 20ms` instead of the default
2. Profile for shorter durations
3. Use CPU profiling instead of allocation profiling for lower overhead

## See also

- [Logging and metrics](/docs/operations/logging-metrics/) - Configure logging and Prometheus metrics
- [Monitoring and alerting](/docs/operations/monitoring-alerting/) - Set up health checks and alerts
- [Design for performance](/docs/operations/design-for-performance/) - Performance optimization guidelines