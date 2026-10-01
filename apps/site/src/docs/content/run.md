---
title: Running commands with secrets
description: Inject encrypted development secrets into a child process with a fresh one-use grant.
section: Guides
order: 2
---

# Running commands with secrets

`insecur run` starts a command with the selected secrets injected into the child process environment. The CLI does not print or log the value, and audit events do not contain it. Each run requests a fresh one-use grant instead of reading a standing secret from a project file.

This is development-secret custody. The injected value reaches the child process, and an agent controlling that process can inspect or print it. What you gain is no plaintext project `.env` file, a single-use short-lived grant per run, and an audit record. Automatic provider rotation is not available today.

## Run with a single variable

Inject one exact variable key and run your command. The `--` separator is required.

```sh
insecur run --variable-key DATABASE_URL -- node server.js
```

The child process sees `DATABASE_URL` in its environment. The CLI does not display it, though the child process can.

The child starts in the invocation directory with an OS environment baseline plus the selected
value. Unrelated shell credentials and other ambient application settings are excluded. Supply
required non-secret settings through application arguments or configuration. Libraries can still
read files under `HOME`; this is not filesystem isolation.

Check selection and availability without issuing a grant:

```sh
insecur config show --json
insecur run --variable-key DATABASE_URL --plan --json -- node server.js
```

Inspect `data.plan.ready`; exit `0` alone does not mean a plan is ready. Current source builds
also include `data.projectConfigPath` when project config was loaded. A ready plan proves a value
exists, not its provider permissions. Missing values must be supplied by their owner, never borrowed
from another project. See the [agent implementation guide](/docs/agent-quickstart).

## Run from a profile policy

This requires hosted mode. Local Mode supports only single-variable runs. A hosted profile's
default Runtime Injection Policy binds an exact set of secrets to a command. Run it by naming the profile:

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
2. Hosted decryption happens inside the private Runtime service. Local Mode decrypts on this machine using its machine key.
3. The value is injected into the child process environment. Code controlling that process can read it.
4. Run completion is recorded as metadata.

The grant lifecycle is: issued, then consumed. An unconsumed grant expires or can be revoked. At no point does the value appear in CLI output, `--json`, logs, or audit events.

## Set secrets first

Secrets must exist before you inject them. Writes are blind: the value is never echoed back.

```sh
insecur secrets set DATABASE_URL --value-stdin
```

For an application-owned secret, generate a value instead of supplying one. Never generate a
substitute for a third-party API key:

```sh
insecur secrets set SESSION_SIGNING_KEY --generate --length 32
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
