# Specs

This directory is the implementation entry point for agents. The ADRs remain the decision history,
but agents should not have to rediscover the current product by reading every ADR in order.

Read in this order:

1. [Canonical Product Spec](product-spec.md) - the decided product shape, V1 boundary, and ADR trace
   links in one linear document.
2. [Agent Workstreams](agent-workstreams.md) - isolated implementation groups, seams, dependencies,
   and handoff contracts for autonomous agents.
3. [CONTEXT.md](../../CONTEXT.md) - domain vocabulary and exact term definitions.
4. Area docs only when the workstream calls for them, such as
   [First Value Milestone](../first-value-milestone.md),
   [Storage Security Gate](../storage-security-gate.md),
   [Protected Change Orchestration](../protected-change-orchestration.md),
   [Operation Store](../operation-store.md),
   [CLI And Sync Plan](../cli-and-sync.md), or
   [Security Runbooks And Release Gates](../security-runbooks-and-release-gates.md).

## Source Of Truth Rules

- The specs summarize accepted ADRs and the scope decisions in [phasing.md](../phasing.md).
- ADRs are still the rationale and traceability record. Each spec section links back to the ADRs
  that justify it.
- Superseded ADRs are linked only as "do not implement this older mechanism" evidence.
- If a spec and an ADR disagree, do not guess. Treat it as a documentation defect, reopen the
  decision, and update both the spec and the ADR trail.
- If a workstream needs a new architectural decision, add or amend an ADR first, then update these
  specs so future agents continue to start from one place.

## Current Implementation Status

There is no product implementation yet. The previous pre-V1 scaffold was removed as disposable
learning code. New work should implement the target product described here, not preserve or
compatibly emulate the removed scaffold.

Trace: [ADR-0018](../adr/0018-retire-unsafe-pre-v1-scaffold.md),
[project-status.md](../project-status.md).
