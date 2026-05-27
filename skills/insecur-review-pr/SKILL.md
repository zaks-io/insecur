---
name: insecur-review-pr
description: Use when reviewing an insecur PR against a Linear issue, acceptance criteria, security invariants, test coverage, and repo agent workflow.
---

# Insecur Review PR

Review PRs for correctness, security posture, and issue fit. Use a bug-focused review stance.

## Required Context

Read these first:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- the linked Linear issue
- context docs named by the issue
- changed package or app `CONTEXT.md` files

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
