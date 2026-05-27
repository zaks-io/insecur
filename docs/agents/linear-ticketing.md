# Linear Ticketing

This repo uses Linear as the implementation queue, state machine, and dependency graph. The repo
docs define the product and workflow; Linear tracks executable slices and human setup work.

## Projects

Use team `INS`.
Apply label `zaks-io/insecur` to every issue for this repo.

| Project | Purpose |
| --- | --- |
| `First Value Customer Validation` | Customer discovery, design-partner onboarding, evidence review, and scope gates. |
| `First Value Implementation` | Agent-build work for the First Value Milestone. |

The First Value implementation ticket graph lives in
`docs/specs/first-value-ticket-plan.md`.

## Issue Body Contract

Every child implementation issue must use this structure:

```md
## Outcome
One concrete implementation outcome.

## Context
- AGENTS.md
- CONTEXT-MAP.md
- docs/specs/product-spec.md
- docs/specs/agent-workstreams.md
- docs/first-value-milestone.md
- Local package/app CONTEXT.md files for this slice

## In scope
Explicit files, packages, routes, commands, tests, or setup.

## Out of scope
Adjacent product decisions, cleanup, provider sync, protected delivery, reveal/export paths.

## Acceptance criteria
- [ ] Locally verifiable criteria.

## Required checks
Named commands or setup evidence.

## Security invariants
No Sensitive Values in logs, output, telemetry, audit metadata, local config, fixtures,
screenshots, or Linear prose.

## Dependencies
Blocked by real Linear issue IDs.
```

Parent workstream issues may use a shorter body, but they must make clear that they are containers
and are not agent-ready implementation work.

## Publishing Checklist

1. Confirm team `INS`, project, labels, and statuses exist.
2. Create or update the project before creating workstream parents.
3. Create workstream parents in `Backlog` with label `zaks-io/insecur` and no readiness label.
4. Create child issues in dependency order so blockers have real issue IDs.
5. Set `parentId` to the matching workstream parent.
6. Use Linear `blockedBy` or `blocks` relationships for ordering.
7. Put blocked AFK issues in `Backlog` without `ready-for-agent`.
8. Put unblocked AFK issues in `Todo` with `ready-for-agent`.
9. Put HITL issues in `Backlog` with `ready-for-human`.
10. Preserve `zaks-io/insecur` when updating issue labels.
11. Add risk and type labels that match the work, such as `Feature`, `Tech Debt`,
    `risk-schema`, `risk-security-sensitive`, or `risk-cross-cutting`.

## Readiness Updates

When an implementation blocker reaches `Done`, update downstream issues one at a time:

- If all blockers are done and the issue still meets the Issue Body Contract, set it to `Todo` and
  add `ready-for-agent`.
- If a blocker was replaced by a mocked interface, the issue body must name that interface and the
  downstream issue must still be locally verifiable.
- If human setup, credentials, provider approval, product judgment, or an ADR decision is still
  needed, leave the issue without `ready-for-agent` and apply `ready-for-human` or `needs-info`.

## Validation Project Dependencies

Validation and implementation are separate projects but may depend on each other. Use Linear
relationships across projects when customer-validation work requires implementation proof:

- Design-partner onboarding is blocked by recruiting and by the final First Value Proof.
- Evidence review is blocked by design-partner onboarding and telemetry/feedback capture.
- Scope-gate decisions are blocked by evidence review.
- Public mechanism pages are blocked by the final First Value Proof.
