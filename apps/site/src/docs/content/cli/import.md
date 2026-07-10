---
title: insecur import
description: Import secrets from a local dotenv file into a development environment (create-only; all-or-nothing preflight)
section: CLI reference
order: 9
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur import

Import secrets from a local dotenv file into a development environment (create-only; all-or-nothing preflight)

```sh
insecur import [options] <file>
```

| Argument | Description                 |
| -------- | --------------------------- |
| `file`   | local dotenv file to import |

| Option                           | Description                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| `--dry-run`                      | run Import Preflight and return a metadata-only Secret Import Plan |
| `--variable-key-prefix <prefix>` | prepend this prefix to every parsed dotenv key before validation   |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
