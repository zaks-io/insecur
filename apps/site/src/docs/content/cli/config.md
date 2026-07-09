---
title: insecur config
description: Local CLI configuration
section: CLI reference
order: 4
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur config

Local CLI configuration

```sh
insecur config [options] [command]
```

## `insecur config show`

Show resolved local CLI configuration (metadata-only)

```sh
insecur config show [options]
```

## `insecur config set`

Write durable local CLI configuration

```sh
insecur config set [options] <key> <value>
```

| Argument | Description                                                        |
| -------- | ------------------------------------------------------------------ |
| `key`    | config key (default-env-id, branch-env.<branch>, or crash-reports) |
| `value`  | config value                                                       |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
