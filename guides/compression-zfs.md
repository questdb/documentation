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
