---
name: insecur-review-pr
description: Use when reviewing an insecur PR against a Linear issue, acceptance criteria, security invariants, test coverage, and repo agent workflow.
---

# Insecur Review PR

Review PRs for correctness, security posture, and issue fit. Use a bug-focused review stance.

## Review Model

Use the strongest available code-review-capable model and reasoning setting for this skill. Prefer
Opus-class, GPT-5.5 extra-high reasoning, or the current best equivalent. Do not use the fast
implementation workhorse as the default reviewer when a stronger review tier is available.

If only a lower-tier reviewer is available, state that limitation in the review output. Do not move
`risk-security-sensitive`, `risk-schema`, or `risk-cross-cutting` PRs to `Ready to Merge` without a
strong review pass or explicit human approval.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/project-status.md`
- `CONTEXT-MAP.md`
- `CONTEXT.md`
- `docs/agents/workflow.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- `docs/specs/README.md`
- `docs/adr/README.md`
- the PR description, commits, changed files, and checks
- the linked Linear issue
- context docs named by the issue
- changed package or app `README.md` or `CONTEXT.md` files

Also use `skills/insecur-code-review/SKILL.md` and its checklist for the bug taxonomy.

## Review Checks

Check:

- The PR is scoped to one Linear issue.
- The PR title starts with the issue ID.
- The implementation satisfies the issue acceptance criteria.
- Required checks were run or the gap is clearly stated.
- Security invariants from the issue and repo docs still hold.
- Sensitive Values are not logged, stored, tested as fixtures, screenshotted, or exposed.
- Authorization uses the documented seams and does not infer access from actor type, role name, or
  owner shortcuts.
- Tests cover the risky behavior and tenant/security boundaries for the slice.
- Docs changed only when the contract changed or the issue required it.

## Output

Lead with findings, ordered by severity, with file and line references when available.

If no blocking findings remain, say so clearly and identify any residual risk or test gap. Move the
Linear issue to `Ready to Merge` only when the user asked you to manage Linear state and required
checks are passing.

When running under the orchestrator and findings require author changes, post the detailed feedback
on the PR and have the orchestrator move Linear to `Changes Requested`. The orchestrator should send
the feedback back to the original implementation agent thread rather than fixing the PR locally.
