---
title: insecur local-files
description: Local plaintext secret file utilities (metadata-only; no secure erasure)
section: CLI reference
order: 11
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur local-files

Local plaintext secret file utilities (metadata-only; no secure erasure)

```sh
insecur local-files [options] [command]
```

## `insecur local-files rm`

Delete a local file after explicit confirmation (ordinary filesystem delete)

```sh
insecur local-files rm [options] <path>
```

| Argument | Description               |
| -------- | ------------------------- |
| `path`   | local file path to delete |

| Option  | Description                              |
| ------- | ---------------------------------------- |
| `--yes` | skip the interactive confirmation prompt |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
