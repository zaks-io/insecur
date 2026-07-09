---
title: Environment variables
description: Every environment variable the insecur CLI reads, grouped by purpose.
section: Reference
order: 1
---

# Environment variables

The `insecur` CLI reads these environment variables. They are grouped by what they affect. Where scope is concerned, precedence runs flags first, then environment, then project config (`.insecur.json`), then profile.

## Scope resolution

These select which host, org, project, environment, and profile the CLI operates against. A matching command-line flag always overrides the environment value.

| Variable          | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `INSECUR_HOST`    | API base URL. Default `https://api.insecur.cloud`. |
| `INSECUR_ORG`     | Organization to operate in (opaque id).            |
| `INSECUR_PROJECT` | Project to operate in (opaque id).                 |
| `INSECUR_ENV`     | Environment to operate in (opaque id).             |
| `INSECUR_PROFILE` | Named profile to resolve scope and auth from.      |

## Authentication

These carry credentials for non-interactive use, such as CI or an agent session.

| Variable                        | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `INSECUR_SESSION_TOKEN`         | Session credential supplied directly in the environment. |
| `INSECUR_AGENT_CREDENTIAL_FILE` | Path to a sealed derived-agent credential file.          |
| `INSECUR_AGENT_TAG`             | Agent attribution tag recorded in the principal chain.   |

## Config location

These control where the CLI reads and writes its own configuration. The user config lives at `~/.insecur/config.json`. Project config lives at `.insecur.json`, which is committed, non-secret, and holds opaque ids only.

| Variable              | Purpose                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `INSECUR_CONFIG_HOME` | Base directory for user config. Falls back to `HOME` or `USERPROFILE`. |

## Crash reporting and output

| Variable                | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `INSECUR_CRASH_REPORTS` | Set to `off` to disable crash reporting. |
| `INSECUR_ASCII`         | Force ASCII glyphs in output.            |

## Audit export verification

These hold key material for `insecur audit verify`. You do not read them directly; you pass their names to the matching `--*-env` flags of `audit verify`.

| Variable                                      | Purpose                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `INSECUR_AUDIT_EXPORT_HMAC_SECRET`            | HMAC secret, passed via `--hmac-secret-env`.                                |
| `INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY`     | Single Ed25519 public key, passed via `--signing-public-key-env`.           |
| `INSECUR_AUDIT_EXPORT_PUBLISHED_SIGNING_KEYS` | Published signing-keys document, passed via `--published-signing-keys-env`. |

## Installer

These are read by the install scripts, not by the CLI at runtime.

| Variable                   | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `INSECUR_CLI_VERSION`      | Release tag to install, for example `cli-v0.1.0`. |
| `INSECUR_INSTALL_DIR`      | Install destination directory.                    |
| `INSECUR_INSTALL_BASE_URL` | Base URL for the binary and checksums.            |

## Example

Non-interactive scope plus a session token for CI:

```sh
export INSECUR_HOST=https://api.insecur.cloud
export INSECUR_ORG=org_1a2
export INSECUR_PROJECT=prj_3c4
export INSECUR_ENV=env_5d6
export INSECUR_SESSION_TOKEN=... # supplied by your CI secret store
insecur whoami --json
```

Values shown are opaque ids. Secret values never appear in configuration or CLI output.

## Related

- [Installation](/docs/installation)
- [Audit and verification](/docs/audit)
- [Exit codes](/docs/reference/exit-codes)
- [API overview](/docs/reference/api)
