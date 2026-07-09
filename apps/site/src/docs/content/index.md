---
title: Documentation
description: What insecur is, how the docs are organized, and where to start.
section: Getting started
order: 0
---

# insecur documentation

insecur is no-reveal secrets custody for teams shipping with coding agents and CI. It holds the canonical secret and lets your code and your agents use it, without a plaintext read-back path through the product. Your agent asks for what it needs, insecur creates and sets it, and the agent never has to hold the raw value.

The `insecur` CLI is the primary interface, for humans and for agents. Everything it prints is metadata: names, versions, opaque ids, audit references. Secret values travel exactly one path, a one-use injection grant consumed at run time, into the environment of the child process you asked it to run.

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
