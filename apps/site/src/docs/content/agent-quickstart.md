---
title: Agent quickstart
description: Instructions written for a coding agent: the exact command loop, JSON output, exit-code handling, and a copy-paste AGENTS.md snippet.
section: Getting started
order: 3
---

# Agent quickstart

This page is written for you, the agent. It tells you how to use secrets in this project without ever holding one. If you are a human wiring up an agent, copy the [AGENTS.md snippet](#tell-your-agents-about-insecur-agentsmd) at the bottom into your repo and your agent will find its way here.

## The rules

1. Never read, write, or ask for a plaintext secret value. Not from `.env` files, not from the user, not from command output.
2. Every command supports `--json`. Use it. Output is metadata only, by contract.
3. Secrets reach code through `insecur run`, which injects them into one child process. That is the only delivery path you need.
4. Branch on exit codes, not on message text. Messages change; codes and remediation commands do not.

## Orient yourself

Check whether a session exists and what scope is resolved:

```sh
insecur whoami --json
```

Exit `0` means you have a session and resolved org, project, and environment context (the project's committed `.insecur.json` supplies scope). Exit `3` means no session: stop and ask the human to run `insecur login`, or run `insecur login --device` if you are in a headless environment and the human can approve the device code.

See what secrets the environment expects:

```sh
insecur secrets list --json
```

## Use a secret

Run any command with a secret injected into its environment:

```sh
insecur run --variable-key DATABASE_URL -- pnpm dev
```

The `--` separator is required. The value lands only in the child process env; it never appears in your transcript, the CLI output, or the audit log. Each run consumes a fresh one-use grant and writes an audit event attributing it to you.

## Create a secret

If a variable key is missing, prefer service-side generation so no one ever sees the value:

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
this repo and there should never be.

- Never read or create `.env` files, and never ask me to paste a secret value.
- Run anything that needs secrets through `insecur run --variable-key <KEY> -- <command>`.
- List available keys with `insecur secrets list --json`.
- Create missing secrets with `insecur secrets set <KEY> --generate random --json`;
  if a value must come from me, tell me to run `insecur secrets set <KEY> --value-stdin` myself.
- On exit code 3, tell me to run `insecur login`. On exit code 10, poll
  `insecur operations wait <operation-id> --json` while I approve in the web console.
- Full agent instructions: https://insecur.cloud/docs/agent-quickstart.md
```

## Related

- [Using insecur with coding agents](/docs/agents): the human-facing view, attribution tiers, `agent shell`
- [Quickstart](/docs/quickstart): the human first-run loop
- [CLI reference](/docs/cli): every command and flag
