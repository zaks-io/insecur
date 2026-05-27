---
name: insecur-goal-review-main-and-queue-fixes
description: Use when running the periodic insecur loop whose goal is to review new main-branch commits and queue fixes by filing actionable Linear issues for bugs, security regressions, or product-direction drift.
---

# Insecur Review Main And Queue Fixes

Run a sidecar quality loop for `main`. This is a review-and-ticketing agent, not an implementer and
not a PR reviewer.

## Review Model

Use the strongest available code-review-capable model and reasoning setting for this skill. Prefer
Opus-class, GPT-5.5 extra-high reasoning, or the current best equivalent. If only a lower-tier
reviewer is available, state that limitation in the run summary and do not advance security,
schema, or cross-cutting findings without either filing an issue or escalating.

## Required Context

Read these first:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/project-status.md`
- `docs/phasing.md`
- `docs/agents/workflow.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/linear-ticketing.md`
- `docs/agents/autonomous-loop.md`
- changed package or app `CONTEXT.md` files for the reviewed range

When the reviewed commits touch product direction, security posture, domain language, package
boundaries, or build order, also read the relevant docs named by `CONTEXT-MAP.md` or the changed
files.

## Loop

On each scheduled run:

1. Fetch the remote state for `main`.
2. Resolve the current remote head, usually `origin/main`.
3. Load the last-reviewed `origin/main` SHA from runtime-owned state outside the repo.
4. If no checkpoint exists, initialize it to the current `origin/main` SHA and stop unless the user
   explicitly asked for a backfill review.
5. If the current SHA matches the checkpoint, stop without creating issues.
6. If the checkpoint is not an ancestor of the current SHA, review the reachable commit range that
   is safe to reason about. If no reliable merge base exists, escalate instead of guessing.
7. Create a disposable worktree at the current `origin/main` SHA.
8. Review the diff from checkpoint to current SHA.
9. File Linear issues for actionable problems that should enter the implementation queue.
10. Advance the checkpoint only after the review and any required Linear issue creation complete.
11. Remove the disposable worktree before finishing, unless preserving it is needed for debugging.

Use a runtime-owned checkpoint path such as
`${CODEX_HOME:-$HOME/.codex}/automation-state/insecur-goal-review-main-and-queue-fixes/last-reviewed-origin-main`,
not a tracked repo file.

## Review Scope

Review the new commit range as merged product state, not as an individual PR handoff.

Check:

- correctness bugs, broken contracts, or regressions introduced by the range
- gaps between committed behavior and the Linear issue or PR intent when that context is visible
- security invariant violations from repo docs and changed package context files
- Sensitive Values leaking into code, tests, docs, logs, screenshots, examples, or Linear prose
- authorization shortcuts that bypass Effective Access, Tenant-Scoped Store, Keyring, Secret
  Version Store, Runtime Injection Grant Service, or Audit Event Writer boundaries
- drift from `docs/vision.md`, `docs/project-status.md`, specs, ADRs, or accepted domain language
- missing tests or verification for risky changes
- follow-up work that was discovered but not captured in Linear

Run local checks when they are meaningful for the changed range and cheap enough for the periodic
loop. If the current repo caveats make a check noisy, use the documented alternative, such as
`pnpm build --filter='!@insecur/worker'` while `@insecur/worker` lacks `wrangler.jsonc`.

## Linear Issue Creation

Create Linear issues only for real, actionable findings. Do not file low-confidence observations,
style preferences, duplicate work, or broad product questions as agent-ready implementation work.

Before creating a new issue, search existing INS issues with label `zaks-io/insecur` for a matching
problem, affected file, or commit range. If an existing issue covers it, comment with the new
evidence instead of creating a duplicate.

For each new issue:

- team: `INS`
- project: choose the closest active Linear project from `docs/agents/linear-ticketing.md`; if the
  project or parent workstream is unclear, use `Triage` instead of `ready-for-agent`
- label: `zaks-io/insecur`
- type label: usually `Bug`; use `Tech Debt` only for maintenance findings with no product defect
- risk label: choose `risk-normal`, `risk-security-sensitive`, `risk-schema`, or
  `risk-cross-cutting`
- status: `Todo` with `ready-for-agent` only when the body satisfies the full agent-ready
  contract and no blocker remains
- otherwise use `Triage` or `Backlog` with `needs-info` or `ready-for-human`, depending on what is
  missing

Issue bodies must include:

```md
## Outcome

Fix the reviewed-main finding in one concrete slice.

## Context

- AGENTS.md
- CONTEXT-MAP.md
- docs/project-status.md
- relevant local context/spec docs
- Reviewed main range: <old-sha>..<new-sha>

## Finding

What the review found, with file and line references when available.

## In scope

The smallest implementation surface that should fix the issue.

## Out of scope

Product decisions, unrelated cleanup, and any adjacent follow-up not needed for this fix.

## Acceptance criteria

- [ ] Locally verifiable criteria.

## Required checks

Named commands or evidence.

## Security invariants

Metadata-only, no Sensitive Values, and any relevant package-specific invariants.

## Dependencies

Known blockers or "None".
```

Keep Linear prose metadata-only. Never include Sensitive Values, raw secret material, provider
credential details, decrypted Sensitive Metadata, screenshots containing secrets, or logs that could
contain secrets.

## Output

Summarize each run with:

- reviewed range or "no new commits"
- non-linear history or checkpoint problems, if any
- checks run and meaningful failures
- Linear issues created or existing issues updated
- checkpoint advanced to the reviewed SHA
- residual risk or reason for escalation

## Guardrails

- Do not modify product code in this loop.
- Do not merge, revert, or force-push anything.
- Do not create `ready-for-agent` issues unless they satisfy `docs/agents/autonomous-loop.md`.
- Do not create Linear tickets for deferred-scope work still parked in `docs/phasing.md`.
- Escalate instead of ticketing when the finding needs product scope, security posture, credential,
  provider, ADR, or customer judgment.
- Treat review findings as queue input for the orchestrator; ordinary fixes should be handled by
  the normal implementation agent loop.
