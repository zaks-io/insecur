---
title: insecur envs
description: Environment navigation and creation
section: CLI reference
order: 7
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur envs

Environment navigation and creation

```sh
insecur envs [options] [command]
```

## `insecur envs list`

List environments in the resolved project

```sh
insecur envs list [options]
```

## `insecur envs create`

Create a non-protected development environment

```sh
insecur envs create [options]
```

| Option                           | Description                                                          |
| -------------------------------- | -------------------------------------------------------------------- |
| `--env-id <id>`                  | client-minted environment opaque id                                  |
| `--display-name-stdin`           | read the Display Name from stdin                                     |
| `--copy-shapes-from-env-id <id>` | copy Secret Shapes only from another environment in the same project |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
