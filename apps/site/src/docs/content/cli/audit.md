---
title: insecur audit
description: Audit event feed and export verification
section: CLI reference
order: 3
---

<!-- GENERATED — do not hand-edit. Regenerate with `pnpm docs:cli`. -->

# insecur audit

Audit event feed and export verification

```sh
insecur audit [options] [command]
```

## `insecur audit tail`

Show recent tenant-bounded audit events (metadata-only)

```sh
insecur audit tail [options]
```

| Option                             | Description                               |
| ---------------------------------- | ----------------------------------------- |
| `--limit <count>`                  | maximum events to return (default 25)     |
| `--from <iso8601>`                 | include events at or after this timestamp |
| `--to <iso8601>`                   | include events before this timestamp      |
| `--cursor <cursor>`                | pagination cursor from a prior response   |
| `--actor-user-id <id>`             | filter by actor user id                   |
| `--actor-machine-identity-id <id>` | filter by actor machine identity id       |
| `--project-id <id>`                | filter by project id                      |
| `--env-id <id>`                    | filter by environment id                  |
| `--event-code <code>`              | filter by audit event code                |

## `insecur audit export`

Export tenant-bounded audit events as JSONL with a signed manifest

```sh
insecur audit export [options]
```

| Option             | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `--from <iso8601>` | include events at or after this timestamp (required)  |
| `--to <iso8601>`   | include events at or before this timestamp (required) |

## `insecur audit verify`

Verify a tamper-evident audit export JSONL bundle and manifest

```sh
insecur audit verify [options] <jsonl>
```

| Argument | Description                |
| -------- | -------------------------- |
| `jsonl`  | path to audit export JSONL |

| Option                                | Description                                                        |
| ------------------------------------- | ------------------------------------------------------------------ |
| `--manifest <path>`                   | path to audit export manifest JSON (required)                      |
| `--hmac-secret-env <name>`            | env var holding the audit export HMAC secret                       |
| `--signing-public-key-env <name>`     | env var holding the published audit export signing public key      |
| `--published-signing-keys <path>`     | path or URL to the published audit export signing public keys JSON |
| `--published-signing-keys-env <name>` | env var holding the path or URL to published signing public keys   |

## Related

- [CLI overview and global flags](/docs/cli)
- [Exit codes](/docs/reference/exit-codes)
- [Error codes](/docs/reference/errors)
