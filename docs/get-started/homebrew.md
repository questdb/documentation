---
title: Get started with QuestDB via Homebrew (macOS)
sidebar_label: Homebrew
description:
  A short guide for getting started with installing and running QuestDB via
  Homebrew on macOS.
---

Each software release of QuestDB is distributed via the
[Homebrew](https://brew.sh/) package manager.

## Install Homebrew

Users who already have Homebrew installed may skip this section and proceed to
[Install QuestDB](#install-questdb). Otherwise, Homebrew can be installed by
running the official
[installation script](https://github.com/Homebrew/install/blob/master/install.sh)
via bash:

```shell
/bin/bash -c \
"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
```

## Install QuestDB

To install QuestDB via Homebrew, run the following command:

```shell
brew install questdb
```

On macOS, the location of the root directory of QuestDB and
[server configuration](/docs/reference/configuration/) files depending on the
chip:

- Path on Macs with Apple Silicon (M1 or M2) chip:

  ```shell
  /opt/homebrew/var/questdb
  ```

- Path on Macs with Intel chip:

  ```shell
  /usr/local/var/questdb
  ```

The file structure is as the following:

```bash

/questdb
├── conf
├── db
├── log
└── public
```

For information about the file structure, see
[root directory](/docs/concept/root-directory-structure/).

## Uninstall QuestDB

To remove QuestDB, use Homebrew's `uninstall` command:

```shell
brew uninstall questdb
```

## Troubleshooting Homebrew issues

It's recommended to first run `update` before trying to install packages or
diagnose errors:

```shell
brew update
```

Homebrew comes with a basic diagnostic command which can help find
inconsistencies with system settings and permissions. This command will exit
with a non-zero status if any potential problems are found:

```shell
brew doctor
```

## Upgrade QuestDB version

:::note

Check the [release note](https://github.com/questdb/questdb/releases) and ensure
that necessary [backup](/docs/operations/backup/) is completed.

:::

Once the latest QuestDB version is published on
[Homebrew](https://github.com/Homebrew/homebrew-core/blob/master/Formula/q/questdb.rb),
the command to upgrade QuestDB version is:

```shell
brew upgrade questdb
```

## Next steps

Once you installed the QuestDB with Homebrew, you can navigate to our
[command-line options](/docs/reference/command-line-options/) page to learn more
about its usage.
