---
title: insecur connections
description: Manage org-scoped App Connections (metadata only)
section: CLI reference
order: 5
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur connections

Manage org-scoped App Connections (metadata only)

```sh
insecur connections [options] [command]
```

## `insecur connections list`

List App Connections for the selected organization

```sh
insecur connections list [options]
```

## `insecur connections create`

Create an App Connection via provider authorization or scoped token input

```sh
insecur connections create [options] <provider>
```

| Argument   | Description                                |
| ---------- | ------------------------------------------ |
| `provider` | provider slug (github, cloudflare, vercel) |

| Option                           | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| `--connection-id <id>`           | client-minted app connection opaque id (required)                |
| `--method <method>`              | connection method (github-app, scoped-api-token, ...) (required) |
| `--display-name-stdin`           | read the Display Name from stdin                                 |
| `--value-stdin`                  | read provider token from stdin (credential-backed methods)       |
| `--token <value>`                | REJECTED: provider tokens must not be passed on argv             |
| `--allow-account-id <id>`        | Cloudflare allowed account id (boundary)                         |
| `--allow-worker-script <name>`   | Cloudflare allowed Worker script (boundary)                      |
| `--installation-id <id>`         | GitHub App installation id (boundary)                            |
| `--owner <name>`                 | GitHub owner login (boundary)                                    |
| `--allowed-repositories <repos>` | comma-separated GitHub repository names (boundary)               |
| `--operation-id <id>`            | resume after High-Assurance Challenge clearance                  |

## `insecur connections status`

Show metadata-only App Connection status

```sh
insecur connections status [options] <connection-id>
```

| Argument        | Description              |
| --------------- | ------------------------ |
| `connection-id` | app connection opaque id |

## `insecur connections rotate`

Rotate credential-backed App Connection provider credentials

```sh
insecur connections rotate [options] <connection-id>
```

| Argument        | Description              |
| --------------- | ------------------------ |
| `connection-id` | app connection opaque id |

| Option                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| `--dry-run`           | validate the active credential without replacing it  |
| `--value-stdin`       | read replacement provider token from stdin           |
| `--token <value>`     | REJECTED: provider tokens must not be passed on argv |
| `--operation-id <id>` | resume after High-Assurance Challenge clearance      |

## `insecur connections reauth`

Reauthorize an App Connection with audit

```sh
insecur connections reauth [options] <connection-id>
```

| Argument        | Description              |
| --------------- | ------------------------ |
| `connection-id` | app connection opaque id |

| Option                           | Description                                        |
| -------------------------------- | -------------------------------------------------- |
| `--installation-id <id>`         | GitHub App installation id (boundary override)     |
| `--owner <name>`                 | GitHub owner login (boundary override)             |
| `--allowed-repositories <repos>` | comma-separated GitHub repository names (boundary) |
| `--operation-id <id>`            | resume after High-Assurance Challenge clearance    |

## `insecur connections disconnect`

Disconnect an App Connection with audit

```sh
insecur connections disconnect [options] <connection-id>
```

| Argument        | Description              |
| --------------- | ------------------------ |
| `connection-id` | app connection opaque id |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
