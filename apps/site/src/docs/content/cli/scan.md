---
title: insecur scan
description: Offline project-scoped secret exposure report (metadata only)
section: CLI reference
order: 18
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur scan

Offline project-scoped secret exposure report (metadata only)

```sh
insecur scan [options]
```

| Option                        | Description                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `--strict`                    | exit with code 7 when likely secrets or transcript exposures are found                     |
| `--machine`                   | also scan documented well-known home-directory credential locations (read-only, opt-in)    |
| `--agent-transcripts`         | scan local agent conversation logs and transcript exports for secret exposure evidence     |
| `--agent-projects`            | discover agent-touched code directories from local conversations, then scan those projects |
| `--transcript-path <path>`    | explicit transcript or log file to scan (repeatable)                                       |
| `--transcript-glob <pattern>` | glob pattern for exported transcript files (repeatable)                                    |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
