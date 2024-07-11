---
title: Enable compression with ZFS
description:
  "This guide demonstrates how to install ZFS and enable system-level compression within QuestDB."
---

Compression requires the
[Zettabyte File System (ZFS)](https://openzfs.org/wiki/Main_Page).

We'll assume Ubuntu, and demonstrate the basics CLI commands which you'd apply
in something like an AWS EC2 to enable ZFS:

```bash title="Ubuntu - Install ZFS"
sudo apt update
sudo apt install zfsutils-linux
```

To enable compression, create a ZPool with compression enabled:

```shell title="Ubuntu - Enable compression"
zpool create -m legacy -o feature@lz4_compress=enabled autoexpand=on -O compression=lz4 -t volume1 questdb-pool sdf
```

The exact commands depend on which version of ZFS you are running. Use the
[ZFS docs](https://openzfs.github.io/openzfs-docs/man/master/8/zpool-create.8.html)
to customize your ZFS to meet your requirements.

Once created, ZFS provides system-level compression.

## Compression choices, LZ4 and zstd

ZFS offers a number of compression choices when constructing the volume.

[LZ4](https://github.com/lz4/lz4) offers a good balance of compression ratio versus increased CPU usage, and slowed performance. For general usage, we recommend using LZ4.

[zstd](https://github.com/facebook/zstd) is another strong option. This will provide higher compression ratios, but take longer to decompress. We recommend this when storage size is an absolute priority, or for embedded-style deployments (i.e. Raspberry Pi, home IoT setups).

As always, it is best to benchmark your choice to ensure that the performance matches your use case.

:::note 

We regularly run tests using *ZFS* with *LZ4* compression. If you encounter issues with other compression algorithms, please let us know.

:::
