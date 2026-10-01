---
title: Agent quickstart
description: Adopt insecur in an existing project and verify its intended development credential in a fresh Git worktree.
section: Getting started
order: 3
---

# Agent quickstart

This page is written for you, the agent. It tells you how to use development secrets without reading them during the normal workflow. Runtime injection does not enforce unreadability: if you control the child process, you can inspect its environment. If you are a human wiring up an agent, copy the [AGENTS.md snippet](#tell-your-agents-about-insecur-agentsmd) at the bottom into your repo and your agent will find its way here.

## The rules

1. Never display, inspect, log, or ask the user to paste a secret value into the conversation. Let `insecur import` read an explicitly identified project dotenv file directly.
2. Use `--json` for product commands. Output is metadata only, by contract. `insecur guide` is the
   exception: it intentionally emits offline Markdown playbooks.
3. Secrets reach code through `insecur run`, which injects them into one child process. That is the only delivery path you need.
4. Branch on exit codes, not on message text. Messages change; codes and remediation commands do not.
5. If the intended credential is missing or rejected, stop. Do not search other projects, home-directory credentials, agent settings, history, or transcripts for a substitute. A matching variable name or token format does not establish the right account or permissions.
6. Never generate a replacement for a third-party API key. Random generation is only for application-owned secrets such as signing keys, when their creation or replacement is authorized.

## Implement in an existing project

Follow this procedure when the user hands you this page to adopt insecur. Local Mode needs no
account or hosted login. It stores encrypted values on this machine and supports one injected
variable per run. Use macOS or Linux: Windows runtime injection currently fails closed because
descendant-process containment is not implemented.

### Install and select the project

Install the [GitHub CLI](https://cli.github.com/) with `gh attestation` support first. The insecur
installer verifies the binary checksum and GitHub build attestation. See
[Installation](/docs/installation) for platform details and installer trust requirements.

```sh
curl -fsSL https://insecur.cloud/install.sh | sh
insecur --version
```

Start at the intended checkout's root. Inspect existing non-secret `.insecur.json` and application
configuration code, without reading dotenv contents. Check the resolved configuration:

```sh
insecur config show --json
```

Preserve an existing binding. Check `projectConfigPath`, project, and environment against this
checkout's config. Explicit flags and `INSECUR_*` scope variables can override project defaults;
stop on an unexpected selection instead of silently repointing the project.

If the project has no config, initialize Local Mode explicitly from its root:

```sh
insecur init --host local --json
```

Do not replace an existing hosted config with a local one. Follow the established authentication
and policy setup for a hosted project.

### Import the intended credential

The examples use `OPENROUTER_API_KEY`; substitute the exact variable your application uses.
Confirm the provider account, credential purpose, and source file with the user if unknown.
For a dotenv file the user has identified as belonging to this project:

```sh
insecur import .env --dry-run --json
insecur import .env --json
insecur secrets list --json
```

Review the metadata-only dry-run plan before importing. File arguments are relative to the
invocation directory. An approved source in the primary checkout can be passed by its exact
path while retaining this project's target config. Do not search for it, parse it with a shell
pipeline, or execute it with `source`.

Import is create-only. Preflight rejects conflicts before writes start; a later write failure
can leave partial progress, reported in the error. Reconcile that progress before retrying.
The source file is preserved.

Without an approved source file, ask the human to supply the intended credential in their own
terminal with `insecur secrets set OPENROUTER_API_KEY --value-stdin`. Do not receive the value.
A listed key without a current version still needs a value on this machine.

### Wrap the normal command

Prefix the project's existing application or evaluation command with `insecur run`. For example,
if its `eval` script currently runs `node scripts/evaluate.mjs`, update that same script:

```json
{
  "scripts": {
    "eval": "insecur run --variable-key OPENROUTER_API_KEY -- node scripts/evaluate.mjs"
  }
}
```

Keep the project's real executable and arguments. Do not recursively invoke the wrapped script
or give the provider key to the whole agent session. The application must require its selected
environment variable. Remove any application fallback that overrides it from another credential file.

Local Mode supports one variable per run. Multi-secret policy runs require hosted mode; nesting
`insecur run` does not combine keys. Each child gets a small OS environment baseline, including
`PATH` and `HOME`, plus the selected value. Other ambient variables, including non-secret settings,
are excluded. Supply necessary non-secret settings through normal application arguments or config.
The child retains filesystem access, so libraries that search `HOME` for credentials need explicit
configuration too.

### Verify the application and a fresh worktree

Plan the actual command first:

```sh
insecur run --variable-key OPENROUTER_API_KEY --plan --json -- node scripts/evaluate.mjs
```

Inspect `data.plan.ready`, `variableKeys`, `projectId`, and `environmentId`. A plan returns exit
`0` even when `ready` is false and issues no grant. Check `projectConfigPath` when provided;
`insecur config show --json` also reports the selected path. Respect each next action's `actor`:
`human` means hand off, not permission to obtain the value yourself.

Run the normal project command and its smallest meaningful provider-backed check:

```sh
npm run eval
```

Use the project's actual package manager and command. A ready plan proves a stored value exists,
not that the provider accepts its account, permissions, model access, or credit balance. If the
provider rejects it, ask the owner to correct this binding rather than trying another key.

Commit `.insecur.json`, the command change, and the agent instructions below. The config contains
references and secret names, not values. Never commit local stores, machine keys, or plaintext
credential files. Create a fresh worktree from a branch containing that commit, then repeat
`config show`, `secrets list`, the plan, and the real application check from its root.

On the same machine and OS user, the committed config selects the same encrypted local value.
Do not copy `.env` into the worktree or initialize a replacement project there. On another
machine, `insecur init --host local --json` adopts committed metadata; the owner must supply
the intended values on that machine.

Current source builds discover config from subdirectories within the current Git checkout.
For released CLIs without that behavior, run from the checkout root or pass `--config-dir` with
its exact config directory. See [Local Mode](/docs/local-mode) for discovery boundaries.

### Verify failure and finish cleanup

Choose a variable that `secrets list` confirms is absent. If `INSECUR_MISSING_PROOF` is absent:

```sh
insecur run --variable-key INSECUR_MISSING_PROOF --json -- node -e "console.error('CHILD_STARTED'); process.exit(99)"
```

Expect a nonzero missing-secret error and no `CHILD_STARTED` output. Ambient credentials and
same-named secrets in other projects must not satisfy this request. Do not delete a real value
to test failure.

After the real application check passes, follow [dotenv migration](/docs/migrate-dotenv) to remove
only the approved plaintext source. Preserve needed non-secret settings, obtain authorization
before deleting files, and do not create extra plaintext backups. Run `insecur scan --strict --json`
after cleanup; a clean scan covers its configured paths and detectors, not every copy on the machine.

### Done

Report the normal command, selected config path, successful application check from the fresh
worktree, missing-key failure without child execution, and cleanup result. Identify any remaining
human handoff. Never include values. A configuration-only check is not end-to-end verification.

## Orient yourself

Check whether a session exists and what scope is resolved:

```sh
insecur whoami --json
```

Exit `0` means the command resolved the context it could. In hosted mode, inspect the returned
session and scope fields instead of assuming organization, project, and environment are all present.
Local Mode has no hosted session and can also return `0`. Exit `3` in hosted mode means no session:
stop and ask the human to run `insecur login`, or run `insecur login --device` in a headless
environment where the human can approve the device code.

See what secrets the environment expects:

```sh
insecur secrets list --json
```

## Use a secret

Run any command with a secret injected into its environment:

```sh
insecur run --variable-key DATABASE_URL -- pnpm dev
```

The `--` separator is required. The CLI does not print the value or include it in the audit log. The child process receives it, so do not inspect, print, or log that process's environment. Each run consumes a fresh one-use grant and writes an audit event attributing it to you.

## Create a secret

For a new application-owned signing secret, generation avoids copying the value:

```sh
insecur secrets set WEBHOOK_SIGNING_SECRET --generate random --length 32 --json
```

If the value must come from a human (a third-party API key), ask the human to run the write themselves with `--value-stdin`. Do not accept the value into your own context.

## Handle failures

Every failure returns a stable error code, an RFC 9457 `type` URI you can fetch for details, and, when one exists, copy-pasteable remediation commands in the `--json` envelope. The short version:

| Exit | Meaning                | What you should do                                                                                                                                                        |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3`  | Auth required          | Ask the human to log in, or use `insecur login --device`                                                                                                                  |
| `4`  | Forbidden              | Stop; the session lacks scope. Report it, do not retry                                                                                                                    |
| `7`  | Action required        | Read the error; something external needs fixing first                                                                                                                     |
| `8`  | Retryable              | Back off and retry                                                                                                                                                        |
| `10` | Human step-up required | Take the `operationId` from the error and poll: `insecur operations wait <operation-id> --json`. A human clears it in the web console. Do not try to work around the gate |

The full tables are [exit codes](/docs/reference/exit-codes) and [error codes](/docs/reference/errors).

## Keep the project clean

Before and after you touch a project, you can check for plaintext secret exposure without an account:

```sh
insecur scan --json
```

`insecur scan --strict` exits `7` when it finds likely secrets, which makes it a usable gate in hooks and CI. `insecur guide hooks` prints ready-made hook recipes for Claude Code and Codex.

## Read the rest of these docs

Every page here is available as raw markdown: append `.md` to any docs URL, or start from [llms.txt](/llms.txt) for the index and [llms-full.txt](/llms-full.txt) for the entire documentation in one file.

## Tell your agents about insecur (AGENTS.md)

Humans: paste this into your repo's `AGENTS.md` (or `CLAUDE.md`), adjusted to taste.

```markdown
## Secrets

This project uses insecur for secrets. There are no readable secret values in
this repo and there should never be. A process launched with `insecur run` does
receive the selected values, so do not inspect, print, or log its environment.

- Never display `.env` contents or ask me to paste a secret value. Import only an
  explicitly identified project file with `insecur import`.
- Use this checkout's committed `.insecur.json`. Inspect selection with
  `insecur config show --json`; do not repoint it to fix a missing key.
- Never search other projects, home-directory credentials, agent settings,
  history, or transcripts for a substitute credential.
- Run anything that needs secrets through `insecur run --variable-key <KEY> -- <command>`.
- List available keys with `insecur secrets list --json`.
- If an API key is missing or rejected, stop and ask its owner to supply or correct
  it using `insecur secrets set <KEY> --value-stdin`. Never generate a substitute.
- Local Mode needs no login and injects one selected variable per run.
- On exit code 3, tell me to run `insecur login`. On exit code 10, poll
  `insecur operations wait <operation-id> --json` while I approve in the web console.
- Full agent instructions: https://insecur.cloud/docs/agent-quickstart.md
```

## Related

- [Using insecur with coding agents](/docs/agents): the human-facing view, attribution tiers, `agent shell`
- [Quickstart](/docs/quickstart): the human first-run loop
- [CLI reference](/docs/cli): every command and flag
