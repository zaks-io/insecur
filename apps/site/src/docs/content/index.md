---
title: Documentation
description: Try insecur as an experimental tool for encrypted development secrets and runtime injection.
section: Getting started
order: 0
---

# insecur documentation

insecur is an experimental developer tool for keeping secrets out of plaintext project `.env` files. It stores development secrets encrypted and injects the variables you select into a child process when you run a command.

The `insecur` CLI is the primary interface, for humans and for agents. Product output is metadata: names, versions, opaque ids, and audit references. Secret values travel through a one-use injection grant into the environment of the child process you asked it to run. A process controlled by an agent can inspect its own environment, so runtime injection reduces routine exposure and plaintext storage rather than making a secret unreadable to that agent.

The hosted service and its production no-reveal design are still prelaunch and are not approved for valuable production secrets. Automatic provider rotation and one-button recovery after an exposure are goals, not available features today.

## Start here

1. [Install the CLI](/docs/installation)
2. [Quickstart](/docs/quickstart): store a secret and run a command with it in about five minutes
3. [How insecur works](/docs/how-it-works): the custody model and its honest boundaries

## Reading these docs as an agent

Every page is served in two formats at the same path: rendered HTML at `/docs/<slug>` and raw markdown at `/docs/<slug>.md`. [llms.txt](/llms.txt) is the index of every page with its markdown URL. The [CLI reference](/docs/cli) is generated from the CLI source on every change, so it never disagrees with `--help`. Error responses carry RFC 9457 `type` URIs that resolve to the [error reference](/errors), and `--json` error output includes copy-pasteable remediation commands.

## Sections

| Section         | What it covers                                                     |
| --------------- | ------------------------------------------------------------------ |
| Getting started | Install, first secret, first injected run                          |
| Concepts        | The custody model, the domain vocabulary, the security boundaries  |
| Guides          | Task-oriented walkthroughs: agents, CI, migration, scanning, audit |
| Reference       | Environment variables, API overview, exit codes, error codes       |
| CLI reference   | Every command and flag, generated from source                      |
