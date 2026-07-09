---
title: insecur run-policies
description: Manage Runtime Injection Policies (metadata only)
section: CLI reference
order: 17
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur run-policies

Manage Runtime Injection Policies (metadata only)

```sh
insecur run-policies [options] [command]
```

## `insecur run-policies create`

Create an immutable Runtime Injection Policy Version and set the active pointer

```sh
insecur run-policies create [options]
```

| Option                         | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `--policy-id <id>`             | client-minted runtime policy opaque id (required)  |
| `--env-id <id>`                | target environment opaque id                       |
| `--display-name-stdin`         | read the Display Name from stdin                   |
| `--command <cmd>`              | approved command shape (required)                  |
| `--command-fingerprint <hash>` | command fingerprint (sha256:...)                   |
| `--secret-ids <ids>`           | comma-separated exact secret opaque ids (required) |
| `--operation-id <id>`          | resume after High-Assurance Challenge clearance    |

## `insecur run-policies show`

Show runtime injection policy metadata

```sh
insecur run-policies show [options] <policy-id>
```

| Argument    | Description              |
| ----------- | ------------------------ |
| `policy-id` | runtime policy opaque id |

## `insecur run-policies disable`

Disable a runtime injection policy with audit

```sh
insecur run-policies disable [options] <policy-id>
```

| Argument    | Description              |
| ----------- | ------------------------ |
| `policy-id` | runtime policy opaque id |

| Option                | Description                                     |
| --------------------- | ----------------------------------------------- |
| `--env-id <id>`       | environment opaque id                           |
| `--comment <text>`    | audit comment (required)                        |
| `--operation-id <id>` | resume after High-Assurance Challenge clearance |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
