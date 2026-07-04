# ADR-0079: Agent-Context Plaintext Prohibition

Date: 2026-07-04

Status: Accepted

## Decision

No insecur surface asks an agent to place a plaintext Sensitive Value into its own context. The
existing safe-input rules ban Sensitive Values in CLI arguments and shell-visible flags
(docs/cli-and-sync.md); this record generalizes the rule to every current and future
Agent-Reachable Channel, because an agent's context is itself an egress path: whatever enters an
agent's command line, tool arguments, or transcript is logged, cached, replayed, and potentially
trained on by systems entirely outside insecur's custody.

Concretely:

- CLI: agents write provider-issued values by piping to `--value-stdin`
  (`printenv NAME | insecur secrets set --variable-key NAME --value-stdin`), so only the variable
  name appears in the agent's command; self-chosen values use `--generate`, so plaintext never
  exists client-side at all. No new value-bearing flags or named local value files are added; the
  existing prohibition stands.
- MCP (deferred past V1 as a product surface): when built, it is a thin projection of the same
  command core, and its secret-write tools accept only transcript-safe sources — generate mode, or
  a server-side source reference (environment variable name or file path resolved by the MCP
  server process, never by the model). An inline plaintext `value` argument is rejected with a
  structured error naming the safe modes. Tool results are the same metadata-only envelopes as the
  CLI, so the prohibition holds on both input and output.
- Agent-facing guidance (the `AGENTS.md` section written by `insecur init`,
  docs/cli-and-sync.md) never instructs an agent to echo, read, or interpolate a secret value;
  taught patterns keep values out of agent context by construction.

## Options Considered

- **Full input parity on every surface (inline values allowed).** Rejected. An MCP tool argument
  or pasted CLI flag lands the plaintext in the agent transcript and host logs — recreating the
  exposure the product exists to eliminate, one layer up from disk.
- **No agent-driven secret writes at all.** Rejected. It breaks CLI/console/MCP functional parity
  and blocks legitimate flows that never expose anything (generate mode, piped stdin).
- **Transcript-safe input modes only.** Accepted. Agents keep full write capability through paths
  where the value provably bypasses their context.

## Consequences

- The product claim is categorical and matches the no-reveal posture: secrets neither come from
  nor return to an agent's context on any insecur surface.
- The MCP surface, whenever it ships, inherits this constraint by design; "functionally the same
  as the CLI" means the same command core and envelopes, not inline value arguments.
- An agent that was handed a plaintext value out-of-band can still store it (pipe from its
  environment), but insecur never widens that exposure and never requires it.
- This extends the Safe Sensitive Input Path family (docs/context/glossary/runtime-injection.md):
  an agent-context transit is not a safe input path.
