---
title: insecur run
description: Run a command with runtime injection from a CLI profile policy or one exact variable key
section: CLI reference
order: 17
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur run

Run a command with runtime injection from a CLI profile policy or one exact variable key

```sh
insecur run [options] [profile]
```

| Argument  | Description                                      |
| --------- | ------------------------------------------------ |
| `profile` | CLI profile slug or id (uses defaultRunPolicyId) |

| Option                 | Description                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `--variable-key <key>` | application variable key to inject (First Value path)                           |
| `--policy-id <id>`     | runtime injection policy id (overrides profile default)                         |
| `--watch`              | restart the child on file changes (development environment only)                |
| `--plan`               | resolve targets and prerequisites without issuing a grant or starting the child |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
