---
title: insecur secrets
description: Blind secret writes and metadata-only management
section: CLI reference
order: 20
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur secrets

Blind secret writes and metadata-only management

```sh
insecur secrets [options] [command]
```

## `insecur secrets list`

List Secret Shapes in the resolved environment (metadata only)

```sh
insecur secrets list [options]
```

## `insecur secrets versions`

List version metadata for one Secret (metadata only)

```sh
insecur secrets versions [options] <secret-id>
```

| Argument    | Description      |
| ----------- | ---------------- |
| `secret-id` | opaque Secret ID |

## `insecur secrets set`

Create or update a non-protected secret by variable key

```sh
insecur secrets set [options] <variable-key>
```

| Argument       | Description |
| -------------- | ----------- |
| `variable-key` |             |

| Option              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `--generate [mode]` | service-generate a secret value (default mode: random)             |
| `--length <bytes>`  | random byte length for --generate random (default: `32`)           |
| `--value-stdin`     | read the secret value from stdin                                   |
| `--allow-empty`     | allow an intentionally empty secret value                          |
| `--dry-run`         | plan the metadata-only write without collecting or sending a value |

## `insecur secrets promote`

Request protected promotion for exact draft versions (metadata only)

```sh
insecur secrets promote [options] <draft-version-id...>
```

| Argument           | Description |
| ------------------ | ----------- |
| `draft-version-id` |             |

| Option                               | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| `--env-id <id>`                      | target environment opaque id                    |
| `--comment <text>`                   | audit comment                                   |
| `--impact-review-fingerprint <hash>` | resume fingerprint from prior review            |
| `--operation <id>`                   | resume after High-Assurance Challenge clearance |

## `insecur secrets rollback`

Rollback a secret from a retained published version (metadata only)

```sh
insecur secrets rollback [options] <secret-id>
```

| Argument    | Description |
| ----------- | ----------- |
| `secret-id` |             |

| Option                 | Description                                            |
| ---------------------- | ------------------------------------------------------ |
| `--env-id <id>`        | target environment opaque id                           |
| `--to-version-id <id>` | retained published secret version opaque id (required) |
| `--promote`            | create draft and request promotion approval            |
| `--comment <text>`     | audit comment                                          |
| `--operation <id>`     | resume after High-Assurance Challenge clearance        |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
