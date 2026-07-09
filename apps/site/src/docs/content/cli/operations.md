---
title: insecur operations
description: Poll, wait on, and cancel long-running operations
section: CLI reference
order: 13
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur operations

Poll, wait on, and cancel long-running operations

```sh
insecur operations [options] [command]
```

## `insecur operations get`

Read metadata-only operation state

```sh
insecur operations get [options] <operation-id>
```

| Argument       | Description         |
| -------------- | ------------------- |
| `operation-id` | operation opaque id |

## `insecur operations wait`

Poll until the operation reaches a terminal state

```sh
insecur operations wait [options] <operation-id>
```

| Argument       | Description         |
| -------------- | ------------------- |
| `operation-id` | operation opaque id |

| Option                | Description                                    |
| --------------------- | ---------------------------------------------- |
| `--timeout <seconds>` | fail with operation.wait_timeout when exceeded |

## `insecur operations cancel`

Cancel a cancelable operation

```sh
insecur operations cancel [options] <operation-id>
```

| Argument       | Description         |
| -------------- | ------------------- |
| `operation-id` | operation opaque id |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
