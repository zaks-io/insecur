---
title: Local Mode
description: Run insecur accountless with an encrypted machine-local store, then move to hosted custody later.
section: Guides
order: 5
---

# Local Mode

Local Mode is the simplest way to try insecur's current development workflow. An unauthenticated `insecur init` creates a local project config and uses an encrypted machine-local store instead of the hosted API. You get encrypted storage and the core run loop with no login, organization, or network dependency.

Be clear about the boundary: Local Mode is encrypted custody on your machine. It is not no-reveal. The machine key lives on the same machine as the encrypted store, so anyone who fully controls that machine can reach the values. A child process receiving an injected value can also read it. Local Mode buys you no plaintext project `.env` file and an auditable local run loop, not unreadability.

## Start Local Mode

Run `init` without logging in:

```sh
insecur init
```

This writes a local project config `.insecur.json` with `"host": "local"`. From there the store is encrypted and machine-local.

## What Local Mode delivers

- An encrypted SQLite store holding projects, environments, secret shapes, current wrapped versions, one-use injection grants, and metadata-only local audit events.
- Machine root-key custody via the OS keystore: macOS Keychain, Windows DPAPI, or Linux `secret-tool`, with a documented `0600` fallback file where no keystore is available.
- The core commands: `secrets set`, `secrets list`, `secrets versions`, and `run --variable-key`.
- Local `.env` import with a dry-run plan.
- The local plaintext file removal helper.

A minimal local loop:

```sh
insecur secrets set DATABASE_URL --value-stdin
insecur secrets list
insecur run --variable-key DATABASE_URL -- node server.js
```

## The ceiling

Local Mode is intentionally limited to projects and non-protected development environments. These features are hosted-only and do not exist locally:

- Organizations, teams, and memberships
- Protected environments
- Machine access and app connections
- Sync and production delivery

Any hosted-only command fails fast with a clear `local.cloud_feature_unavailable` error. The failure is deliberate, not a bug: those capabilities require the hosted API.

## Moving to hosted later

When you are ready to try the hosted prelaunch service, log in and migrate the current Local Mode project. The migration verifies every hosted write before it removes the corresponding local value. If the hosted project already exists, the CLI adopts it and reports any values that still exist only on this machine. The hosted protected-environment path is not approved for valuable production secrets yet.

```sh
insecur login
insecur projects migrate
```

## Related

- [Migrating from .env files](/docs/migrate-dotenv)
- [Running commands with secrets](/docs/run)
- [Scanning for exposed secrets](/docs/scan)
- [Using insecur with coding agents](/docs/agents)
