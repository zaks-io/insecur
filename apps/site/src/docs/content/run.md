---
title: Running commands with secrets
description: Inject secrets into a child process at runtime with a fresh one-use grant, never touching CLI output or logs.
section: Guides
order: 2
---

# Running commands with secrets

`insecur run` starts a command with the secrets it needs injected into the child process environment, and nothing more. The value is never printed, never logged, and never written to an audit event. Each run requests a fresh one-use grant, so a leaked run leaves a small, recoverable blast radius rather than a standing secret on disk.

This is development-secret custody. The injected value does reach the child process. What you gain is no plaintext at rest, a single-use short-lived grant per run, and cheap rotation.

## Run with a single variable

Inject one exact variable key and run your command. The `--` separator is required.

```sh
insecur run --variable-key DATABASE_URL -- node server.js
```

The child process sees `DATABASE_URL` in its environment. Your terminal does not.

## Run from a profile policy

A profile's default Runtime Injection Policy binds an exact set of secrets to a command. Run it by naming the profile:

```sh
insecur run my-profile -- node server.js
```

Override the profile's default policy for a single run:

```sh
insecur run my-profile --policy-id pol_example -- node server.js
```

Restart the child on file changes during development:

```sh
insecur run --variable-key DATABASE_URL --watch -- node server.js
```

`--watch` is for development environments only.

## How injection works

1. The CLI requests a fresh one-use Runtime Injection Grant for the exact secret bindings.
2. Decrypt happens inside the private Runtime service, never in the CLI.
3. The value is injected into the child process environment only.
4. Run completion is recorded as metadata.

The grant lifecycle is: issued, then consumed. An unconsumed grant expires or can be revoked. At no point does the value appear in CLI output, `--json`, logs, or audit events.

## Set secrets first

Secrets must exist before you inject them. Writes are blind: the value is never echoed back.

```sh
insecur secrets set DATABASE_URL --value-stdin
```

Generate a value instead of supplying one:

```sh
insecur secrets set API_TOKEN --generate --length 32
```

| Flag                | Effect                                              |
| ------------------- | --------------------------------------------------- |
| `--value-stdin`     | Read the value from stdin                           |
| `--generate [mode]` | Service-generates the value; default mode is random |
| `--length <bytes>`  | Generated length in bytes, default 32               |
| `--allow-empty`     | Permit an empty value                               |

See [the quickstart](/docs/quickstart) for the full setup path.

## Runtime Injection Policies

A policy pins exact secret bindings to a command. Bindings are exact only, never wildcards or prefixes.

Create a policy:

```sh
insecur run-policies create --policy-id pol_example --command "node server.js" --secret-ids sec_a,sec_b
```

Additional creation flags: `--env-id`, `--display-name-stdin`, `--command-fingerprint sha256:...`, `--operation`.

Inspect and retire policies:

```sh
insecur run-policies show pol_example
insecur run-policies disable pol_example --comment "rotated out"
```

## The `--` separator

Use `--` when injecting with `--variable-key` and no profile, or whenever the child command could be mistaken for a profile slug. It marks the boundary between insecur flags and the command to run.

## Related

- [Using insecur with coding agents](/docs/agents)
- [Migrating from .env files](/docs/migrate-dotenv)
- [Scanning for exposed secrets](/docs/scan)
- [Exit codes](/docs/reference/exit-codes)
