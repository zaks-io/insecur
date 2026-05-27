---
name: insecur-local-code-review
description: Use when reviewing local insecur changes, an implementation branch, or uncommitted diff before opening a PR, especially before Linear issue handoff.
---

# Insecur Local Code Review

Review local changes before a PR exists. This is a pre-PR quality gate, not a substitute for PR
review.

## Review Model

Use the strongest available code-review-capable model and reasoning setting for this skill. Prefer
Opus-class, GPT-5.5 extra-high reasoning, or the current best equivalent. If only a lower-tier
reviewer is available, state that limitation in the output.

## Required Context

Read these first:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- the Linear issue body when the local changes correspond to an issue
- context docs named by the issue
- changed package or app `CONTEXT.md` files

## Diff Scope

Determine the review scope before reading code:

1. Check the current branch and working tree.
2. Identify the base branch, usually `main`.
3. Review committed branch changes against the merge base.
4. Include uncommitted changes only when the user asked for a working-tree review or the
   implementation agent is doing a final self-check before PR.

If the intended issue or base branch is unclear, state the assumption in the output.

## Review Checks

Check:

- The diff is scoped to one Linear issue when issue context is available.
- The branch name matches `ins-<number>-<short-slug>` for Linear work.
- The implementation satisfies the issue acceptance criteria.
- Required checks are present or there is a clear reason they have not run yet.
- Security invariants from the issue and repo docs still hold.
- Sensitive Values are not logged, stored, tested as fixtures, screenshotted, or exposed.
- Authorization uses the documented seams and does not infer access from actor type, role name, or
  owner shortcuts.
- Tests cover risky behavior and tenant/security boundaries for the slice.
- Docs changed only when the contract changed or the issue required it.
- The diff has no leftover TODOs, debug output, commented dead code, unrelated cleanup, or broad
  refactors outside the issue scope.

## Output

Lead with findings, ordered by severity, with file and line references when available.

Use this verdict:

- `READY FOR PR`: no blocking findings remain.
- `NEEDS REVISION`: blocking findings or missing required checks remain.

If findings require implementation changes, keep the Linear issue in `In Progress`. The assigned
implementation agent should fix the same branch before opening a PR.

## Guardrails

- Do not make code changes unless the user explicitly asks for fixes.
- Do not move Linear to `In Review`; that happens after the PR is opened.
- Do not broaden scope or create product/security decisions during review.
- Create follow-up Linear issues for adjacent work instead of requesting unrelated changes in this
  branch.
- Never include Sensitive Values in review output, examples, comments, logs, or screenshots.
