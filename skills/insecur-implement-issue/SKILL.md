---
name: insecur-implement-issue
description: Use when implementing one insecur Linear issue, especially issues labeled ready-for-agent in team INS.
---

# Insecur Implement Issue

Implement exactly one Linear issue as one scoped PR.

## Required Context

Read these before editing:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/issue-tracker.md`
- the Linear issue body
- all context docs named by the issue
- local package or app `CONTEXT.md` files for touched code

## Claim

Only claim work that matches:

- team `INS`
- label `zaks-io/insecur`
- label `ready-for-agent`
- status `Todo`
- no unresolved blockers

When claiming:

1. Move the issue to `In Progress`.
2. Assign or delegate it if the environment supports that.
3. Comment with the plan from `docs/agents/autonomous-loop.md`.
4. Create a branch named `ins-<number>-<short-slug>`.

## Work Rules

- Keep the PR scoped to the issue.
- Preserve the domain language from `CONTEXT.md` and linked docs.
- Use existing package boundaries and local patterns.
- Add or update tests proportional to risk and blast radius.
- Create follow-up Linear issues for discovered adjacent work.
- Do not store, print, log, fixture, screenshot, or summarize Sensitive Values.
- Do not add reveal paths, plaintext exports, unsafe local secret files, or dev shortcuts.

## Handoff

Before opening a PR, run or request `skills/insecur-local-code-review/SKILL.md` on the local branch
or working-tree diff when the environment supports it. Address blocking findings before PR handoff.

Open a PR titled:

```text
INS-123: Short imperative summary
```

Use the PR body shape in `docs/agents/autonomous-loop.md`.

After opening the PR, add the Linear completion comment from
`docs/agents/autonomous-loop.md` and move the issue to `In Review`.

Move to `Ready to Merge` only after review feedback is addressed and required checks pass.

## Changes Requested

When resuming work after review feedback:

- Continue the same branch and PR.
- Read the PR review comments, failed checks, Linear issue, and linked context docs.
- Address only the requested changes and any directly required test/docs updates.
- Push fixes to the same PR and leave a short PR or Linear comment summarizing what changed and
  which checks were rerun.
- Move the issue back to `In Review` when fixes are ready for another review pass.
