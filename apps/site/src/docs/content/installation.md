---
title: Installation
description: Install the insecur CLI on macOS, Linux, or Windows with verified binaries.
section: Getting started
order: 2
---

# Installation

The `insecur` CLI is the supported way to work with insecur from a terminal, a coding agent, or CI. Install it with a one-line script, verify the binary, then log in.

## Install on macOS or Linux

```sh
curl -fsSL https://insecur.cloud/install.sh | sh
```

## Install on Windows

Run this in PowerShell:

```sh
irm https://insecur.cloud/install.ps1 | iex
```

## What the installer does

The install scripts download the platform binary from the published `cli-v*` GitHub Release. They refuse to install anything that fails SHA-256 verification against the release's `SHA256SUMS` file, so a corrupted or tampered download never lands on your machine.

The binary is placed in:

| Platform     | Install destination          |
| ------------ | ---------------------------- |
| macOS, Linux | `~/.local/bin`               |
| Windows      | `%LOCALAPPDATA%\insecur\bin` |

Make sure the install destination is on your `PATH`. If `insecur --version` fails right after install, add the directory to `PATH` and open a new shell.

## Installer overrides

Set these environment variables before running the script to change what gets installed and where.

| Variable                   | Purpose                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| `INSECUR_CLI_VERSION`      | Pin a release tag, for example `cli-v0.1.0`. Defaults to the latest release. |
| `INSECUR_INSTALL_DIR`      | Override the install destination directory.                                  |
| `INSECUR_INSTALL_BASE_URL` | Override the base URL the binary and checksums are fetched from.             |

Example, pinning a version and directory:

```sh
INSECUR_CLI_VERSION=cli-v0.1.0 INSECUR_INSTALL_DIR="$HOME/bin" \
  curl -fsSL https://insecur.cloud/install.sh | sh
```

## Verify the install

Confirm the binary runs:

```sh
insecur --version
```

After you log in, confirm your identity and scope:

```sh
insecur whoami
```

`whoami` returns metadata only: your principal, memberships, and resolved scope. It never prints a secret value.

## Crash reporting

Crash reporting is on by default for unexpected CLI failures. Reports are metadata-only: they never include your argv, environment, or any secret value. They exist to make real bugs fixable.

Turn crash reporting off in any of these ways:

```sh
insecur --no-crash-reports whoami
```

```sh
export INSECUR_CRASH_REPORTS=off
```

```sh
insecur config set crash-reports off
```

## Next step

With the CLI installed and verified, continue to the quickstart to log in, resolve your scope, and complete your first value loop.

## Related

- [Quickstart](/docs/quickstart)
- [Environment variables](/docs/reference/environment-variables)
- [Exit codes](/docs/reference/exit-codes)
