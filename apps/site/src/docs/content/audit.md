---
title: Audit and verification
description: Read the metadata-only audit feed and verify tamper-evident export bundles offline.
section: Guides
order: 6
---

# Audit and verification

Every meaningful action in insecur writes a tenant-scoped, metadata-only audit event: who acted, what resource, when, the event code, and the full principal chain including agent attribution. Audit events never contain secret values.

You read the feed live with `insecur audit tail`, and you produce signed, independently verifiable bundles with `insecur audit export`. Anyone can check a bundle offline with `insecur audit verify`.

## Tail recent events

```sh
insecur audit tail --limit 50
```

`audit tail` prints recent events, newest activity first. All fields are metadata.

| Flag                               | Purpose                                   |
| ---------------------------------- | ----------------------------------------- |
| `--limit <count>`                  | Number of events to return. Default `25`. |
| `--from <iso8601>`                 | Only events at or after this time.        |
| `--to <iso8601>`                   | Only events at or before this time.       |
| `--cursor <cursor>`                | Continue from a previous page.            |
| `--actor-user-id <id>`             | Filter to a human actor.                  |
| `--actor-machine-identity-id <id>` | Filter to a machine identity.             |
| `--project-id <id>`                | Filter to a project.                      |
| `--env-id <id>`                    | Filter to an environment.                 |
| `--event-code <code>`              | Filter to a single event code.            |

Example, filtering to one environment and event code:

```sh
insecur audit tail --env-id env_2b9 --event-code secret.version.promoted --json
```

A representative event, metadata only:

```json
{
  "eventCode": "secret.version.promoted",
  "occurredAt": "2026-07-09T14:02:11Z",
  "resource": { "type": "secret_version", "id": "sv_7c1" },
  "principalChain": [
    { "type": "user", "id": "usr_18a" },
    { "type": "agent", "tag": "release-bot" }
  ]
}
```

## Export a signed bundle

```sh
insecur audit export --from 2026-07-01T00:00:00Z --to 2026-07-09T00:00:00Z
```

Both `--from` and `--to` are required. The export produces JSONL events plus a signed manifest. Signing uses Ed25519, and the signing keys are custodied server-side in the private Runtime deploy. The bundle is tamper-evident and independently verifiable.

## Verify a bundle offline

```sh
insecur audit verify events.jsonl --manifest manifest.json
```

`audit verify` recomputes the bundle over the JSONL and checks it against the signed manifest, offline. You supply the verifying key material through one of these flags.

| Flag                                  | Purpose                                              |
| ------------------------------------- | ---------------------------------------------------- |
| `--published-signing-keys <path>`     | Path to the published signing-keys document.         |
| `--published-signing-keys-env <name>` | Env var holding the published signing-keys document. |
| `--signing-public-key-env <name>`     | Env var holding a single Ed25519 public key.         |
| `--hmac-secret-env <name>`            | Env var holding the HMAC secret for the bundle.      |

## Published signing keys

Current and historical Ed25519 public keys are published at:

```sh
https://insecur.cloud/.well-known/insecur/audit-export-signing-keys.json
```

This is a metadata-only document. It lets anyone verify a bundle without contacting the API, which is why the claim ceiling here is exactly this: exports are tamper-evident and independently verifiable.

Fetch the published keys and verify in one flow:

```sh
export INSECUR_AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS="$(cat published-keys.json)"
insecur audit verify events.jsonl \
  --manifest manifest.json \
  --published-signing-keys-env INSECUR_AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS
```

## The console audit view

The web console has a filterable audit view at the org level. The CLI and the console read the same events, so what you filter in one you can reproduce in the other.

## Related

- [Approvals and step-up](/docs/approvals)
- [Environment variables](/docs/reference/environment-variables)
- [API overview](/docs/reference/api)
- [Exit codes](/docs/reference/exit-codes)
