---
title: Scanning for exposed secrets
description: Find likely plaintext secrets in your project, home directory, and agent transcripts, without printing values.
section: Guides
order: 4
---

# Scanning for exposed secrets

`insecur scan` produces a project-scoped exposure report: it finds likely plaintext secret files without printing their values. It runs offline and needs no account or auth, so it is safe to run anywhere, including as the first step of a migration or as a CI gate.

The report is metadata only. It tells you where likely secrets live, not what they are.

## Run a scan

```sh
insecur scan
```

The scan root defaults to the current project. Point it elsewhere with the global `--config-dir`:

```sh
insecur scan --config-dir /path/to/project
```

Get machine-readable output:

```sh
insecur scan --json
```

## Use it as a gate

`--strict` exits with code `7` when likely secrets or transcript exposures are found. Wire it into CI or a hook to block on exposure.

```sh
insecur scan --strict
```

See [Exit codes](/docs/reference/exit-codes) for the full list. Exit `7` is the action-required code.

## Widen the scan

By default the scan stays inside the project. These flags extend it.

| Flag                  | What it adds                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `--machine`           | Also scans well-known home-directory credential locations, read-only and opt-in                  |
| `--agent-transcripts` | Scans local agent conversation logs and exports for likely secrets                               |
| `--agent-projects`    | Discovers project directories agents touched, then inventories readable `.env`-style files there |

Agents are the reason `--agent-transcripts` and `--agent-projects` exist. A coding agent's conversation log or a directory it wandered into can hold a secret that was never in your repo.

```sh
insecur scan --agent-transcripts --agent-projects
```

## Target specific transcripts

Point the scan at exact transcript files or globs. Both flags repeat.

```sh
insecur scan --transcript-path ~/logs/session-1.json --transcript-path ~/logs/session-2.json
```

```sh
insecur scan --transcript-glob "~/logs/*.jsonl"
```

## Wire scan into agent hooks

Print offline recipes for wiring `insecur scan` into Claude Code and Codex hooks as a gate:

```sh
insecur guide hooks
```

The recipe runs `insecur scan --strict` before the agent proceeds, so a run stops when likely secrets are found.

## Related

- [Using insecur with coding agents](/docs/agents)
- [Migrating from .env files](/docs/migrate-dotenv)
- [Exit codes](/docs/reference/exit-codes)
- [Running commands with secrets](/docs/run)
