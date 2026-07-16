---
title: insecur projects
description: Project navigation and creation
section: CLI reference
order: 16
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur projects

Project navigation and creation

```sh
insecur projects [options] [command]
```

## `insecur projects list`

List projects in the resolved organization

```sh
insecur projects list [options]
```

## `insecur projects create`

Create a project with a client-minted opaque ID

```sh
insecur projects create [options]
```

| Option                 | Description                      |
| ---------------------- | -------------------------------- |
| `--project-id <id>`    | client-minted project opaque id  |
| `--display-name-stdin` | read the Display Name from stdin |

## `insecur projects migrate`

Migrate this Local Mode project to a Hosted Instance (one-way, verified-then-clean)

```sh
insecur projects migrate [options]
```

| Option                      | Description                                                                    |
| --------------------------- | ------------------------------------------------------------------------------ |
| `--org-id <id>`             | target organization opaque id                                                  |
| `--confirm-migrate`         | scoped confirmation: verify every value remotely, then delete local copies     |
| `--yes`                     | answers ordinary prompts only; it cannot confirm a migration                   |
| `--skip-key <variable-key>` | keep the remote value for a diverged Variable Key (repeatable) (default: `[]`) |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
