# Agent Experience (AX)

Design decisions for the agent-first product experience, resolved 2026-07-04. This doc owns the
AX strategy choices; the CLI surface details they imply are owned by
[docs/cli-and-sync.md](cli-and-sync.md) (envelopes, flags, commands, Agent Attribution, the
`AGENTS.md` onboarding artifact), the execution model by
[ADR-0032](adr/0032-agent-session-execution-and-step-up.md) and its amendments, and the
context-safety invariant by [ADR-0079](adr/0079-agent-context-plaintext-prohibition.md).

## Strategy: The CLI Is The Agent Surface

V1's only Agent-Reachable Channel product surface is the CLI (plus the API it fronts). An MCP
server is **deferred past V1**. When it ships, it is a thin projection of the same command core:
same credential resolution, same metadata-only envelopes as tool results, same exit-10 semantics
as structured tool errors, and transcript-safe write inputs only (ADR-0079). Nothing in the CLI
design may preclude that projection.

## The Four AX Pillars

1. **Errors are prompts.** Every actionable error carries a `remediation` block (deep-link URL,
   exact poll argv, exact resume argv) and a message written as next-step instructions, so an
   agent with zero prior insecur knowledge completes the exit-10 handoff from the error alone.
   Owned by the Output Shape and registry sections of docs/cli-and-sync.md.
2. **Context safety by construction.** No surface asks an agent to place plaintext in its own
   context: generate mode, piped stdin, and server-side source refs are the write paths; metadata-
   only envelopes are the read paths (ADR-0079).
3. **Attribution without effort.** Three tiers (ADR-0032 amendment 2026-07-04): Derived Agent
   Sessions (`insecur agent shell`, `insecur login --device --agent`) are token-accurate;
   automatic registration upgrades any detected harness on a bare human token to a
   session-persistent Agent Session keyed to process ancestry, zero agent effort; the
   self-reported Agent Attribution Tag is the per-request fallback. Feeds the console's
   per-agent-session activity view (docs/web-console-ux.md).
4. **Taught, not assumed.** `insecur init` writes the "Using secrets (for agents)" `AGENTS.md`
   section — the primary agent-facing docs, kept in lockstep with docs/cli-and-sync.md. Its first
   instruction is `insecur whoami --json`: the agent entry point that reports auth state, context,
   and attribution tier, auto-registers when applicable, and remediates when unauthenticated.

## Remote And Headless Agents

Cloud agents (Claude Code on web, Cursor cloud, Codespaces, devcontainers) get sessions via the
OAuth device-authorization flow: `insecur login --device [--agent]` prints a short code and URL,
the human approves from any browser, and the session (the human's own, or agent-marked) lands in
the remote process. CI remains OIDC/deploy-key territory; a cloud dev agent is a human-session
actor, not a Machine Identity.

## Unattended Behavior

Agents never block forever: `operations wait --timeout` exits `9` with current state and
remediation. Approval round trips close automatically — the staging command polls and resumes per
the ADR-0032 resume contract; the human never copies anything back to the terminal.

## Open Branches (not yet designed)

- MCP server surface detail (tool naming, handshake-based attribution) — deferred with the surface.
- Delivery Risk Policy preset UX from the agent's side (what Balanced/Automation-Friendly feel
  like at the CLI when a gate is closed vs open).
- The known-harness marker registry contents and update cadence.
