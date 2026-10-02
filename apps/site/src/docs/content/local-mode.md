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

From the project root, select Local Mode explicitly. No login is needed:

```sh
insecur init --host local
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
- Profile-backed multi-secret injection policies; Local Mode runs one selected variable at a time

Windows can store local secrets, but `run` currently fails closed there until descendant-process
containment is implemented. Use macOS or Linux for runtime injection.

Any hosted-only command fails fast with a clear `local.cloud_feature_unavailable` error. The failure is deliberate, not a bug: those capabilities require the hosted API.

## Projects and Git worktrees

Commit the non-secret `.insecur.json` with the project's wrapped application command. A worktree
on the same machine and OS user selects the same encrypted local value through the committed
project and environment references. No dotenv copy is needed. The worktree's branch must contain
that config; do not initialize a replacement project when it is missing.

Current source builds find the nearest `.insecur.json` from the invocation directory up to the
first `.git` file or directory. Discovery never follows a worktree's Git pointer to the primary
checkout or crosses into a parent repository. Without a Git boundary, or without config inside
it, the invocation directory remains the target. Invalid config fails instead of falling back.

Reads and writes use that same selected config. Adding a secret from a subdirectory updates the
project manifest, not a new shadow config. `scan`, development watch, and `agent setup` also use
the discovered project directory. `init` is the exception: it targets the invocation directory
unless `--config-dir` explicitly selects another directory.

An explicit `--config-dir` always selects exactly that directory without ancestor discovery.
It does not change the launched child's working directory or the meaning of relative import/file
arguments. On released CLIs without discovery, run from the checkout root or use this explicit flag.

Use `insecur config show --json` to inspect `projectConfigPath` and resolved scope. Explicit flags
and scope environment variables can override the config, so verify them before using a key.
Missing values stop execution before the child starts; insecur does not substitute an ambient
key or search another project. This does not prevent the child itself from reading other files.

On another machine, run `insecur init --host local` against the committed config to adopt its
metadata. Values must be supplied there separately. The [agent quickstart](/docs/agent-quickstart)
contains the complete adoption and verification procedure.

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
