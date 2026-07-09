---
title: Using insecur with coding agents
description: Give a coding agent an attributed, deny-by-default session so secrets stay off the readable table.
section: Guides
order: 1
---

# Using insecur with coding agents

Coding agents read your repo and your `.env` files at machine speed. Any plaintext secret sitting on disk is one prompt away from a transcript, a log, or a paste. The fix is structural: take the readable secret off the table, and give the agent a session that is attributed and deny-by-default.

With insecur, an agent never needs a static secret in its environment. Every `insecur run` mints a fresh one-use audited injection grant, and every audit event carries the principal chain: which human, which agent, which command. You get a small, recoverable blast radius instead of a standing liability.

This is development-secret custody, not unreadability. The injected value does reach the child process the agent runs. What you get is no plaintext at rest, one short-lived single-use grant per run, and cheap rotation.

## Launch an agent in a deny-by-default session

Wrap your agent harness in `insecur agent shell`. The child starts with a derived agent session and an environment that grants nothing by default.

```sh
insecur agent shell -- claude
```

The `--` separator is required. Everything after it is the command to run. The agent inside sees an attributed session, not your ambient credentials.

To run a different harness, swap the command:

```sh
insecur agent shell -- codex
```

## Attribution tiers

Attribution shows up in `insecur whoami` and in every audit event. Higher tiers give tighter, more trustworthy provenance.

| Tier       | How it happens                                                               | What it means                                                         |
| ---------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Derived    | Child credential minted from a live human session (`agent shell`)            | Strongest: the agent's actions chain back to a specific human session |
| Registered | Tier-2 structural registration when a harness is detected (`agent register`) | Structural agent session recorded for audit                           |
| Tag-only   | `--agent <name>` or `INSECUR_AGENT_TAG`                                      | A label with no cryptographic backing                                 |
| None       | No attribution provided                                                      | Actions attribute to the raw principal only                           |

Prefer derived attribution. Use `agent shell` so the agent's session descends from your live human session.

## Wire an agent launched separately

If your harness launches outside `agent shell`, hand it a session two ways.

Print metadata-only shell exports for the harness to source:

```sh
insecur agent env
```

Register a structural agent session for audit attribution:

```sh
insecur agent register
```

For a headless machine, use device-authorization login that mints an agent-marked session:

```sh
insecur login --device --agent-session
```

## Environment variables a harness may see

An agent harness may observe these. None of them is a secret value your product reads back.

| Variable                        | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `INSECUR_SESSION_TOKEN`         | Session credential, in the environment only    |
| `INSECUR_AGENT_CREDENTIAL_FILE` | Path to a sealed derived-agent credential file |
| `INSECUR_AGENT_TAG`             | Tag-only attribution label                     |

## Gate agents with a scan hook

Print offline recipes for wiring a scan gate into Claude Code and Codex. No auth required.

```sh
insecur guide hooks
```

The hook runs `insecur scan --strict` so a run stops when likely secrets or transcript exposures are found. See [Scanning for exposed secrets](/docs/scan) for what it catches.

## Related

- [Running commands with secrets](/docs/run)
- [Scanning for exposed secrets](/docs/scan)
- [Migrating from .env files](/docs/migrate-dotenv)
- [Local Mode](/docs/local-mode)
