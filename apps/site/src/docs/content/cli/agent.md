---
title: insecur agent
description: Agent harness attribution and child sessions
section: CLI reference
order: 1
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur agent

Agent harness attribution and child sessions

```sh
insecur agent [options] [command]
```

## `insecur agent status`

Report agent readiness, resolved context, capabilities, and exact next actions

```sh
insecur agent status [options]
```

## `insecur agent setup`

Install or verify project-local agent instructions and scan hooks

```sh
insecur agent setup [options]
```

| Option             | Description                                              |
| ------------------ | -------------------------------------------------------- |
| `--harness <name>` | agent harness: codex or claude (required)                |
| `--mode <mode>`    | scan hook mode: advisory or strict (default: `advisory`) |
| `--dry-run`        | report the files that would change                       |
| `--check`          | exit 7 when managed agent setup has drifted              |

## `insecur agent shell`

Run a command in a deny-by-default child environment with a derived agent session

```sh
insecur agent shell [options]
```

| Option                   | Description                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `--allow <capabilities>` | comma-separated task capabilities: secrets:list, secrets:set, run, operations:cancel |
| `--ttl <seconds>`        | derived session lifetime from 60 to 86400 seconds                                    |

## `insecur agent env`

Print metadata-only shell exports for a separately launched agent harness

```sh
insecur agent env [options]
```

| Option                   | Description                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `--allow <capabilities>` | comma-separated task capabilities: secrets:list, secrets:set, run, operations:cancel |
| `--ttl <seconds>`        | derived session lifetime from 60 to 86400 seconds                                    |

## `insecur agent register`

Register a structural agent session for audit attribution

```sh
insecur agent register [options]
```

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
