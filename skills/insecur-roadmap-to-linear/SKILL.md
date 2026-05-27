---
name: insecur-roadmap-to-linear
description: Use when turning insecur docs, specs, ADRs, or project status into Linear projects, milestones, parent issues, implementation issues, dependencies, and labels.
---

# Insecur Roadmap To Linear

Create executable Linear roadmap structure from repo docs. Do not invent product scope beyond the
docs unless the user explicitly asks for a proposal.

## Required Context

Read these first:

- `AGENTS.md`
- `CONTEXT-MAP.md`
- `docs/project-status.md`
- `docs/phasing.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/linear-ticketing.md`
- `docs/agents/autonomous-loop.md`
- source docs named by the user or by `docs/project-status.md`

## Linear Contract

Use team `INS`. Apply label `zaks-io/insecur` to every issue for this repo.

Use current INS statuses:

- `Triage`
- `Backlog`
- `Todo`
- `In Progress`
- `Blocked`
- `In Review`
- `Changes Requested`
- `Ready to Merge`
- `Done`
- `Canceled`
- `Duplicate`

Use current readiness labels:

- `needs-triage`
- `needs-info`
- `ready-for-agent`
- `ready-for-human`
- `wontfix`

Use current risk labels:

- `risk-normal`
- `risk-security-sensitive`
- `risk-schema`
- `risk-cross-cutting`

Use current Type labels:

- `Bug`
- `Feature`
- `Improvement`
- `Tech Debt`
- `Spike`
- `Hotfix`

## Workflow

1. Inventory the docs and extract capabilities, decisions, constraints, explicit not-yet-done work,
   and anything listed in `docs/phasing.md#deferred-scope-parking-lot`.
2. Group work by project, project milestone delivery gate, and parent workstream issue.
3. Create or update parent workstream issues as containers in `Backlog` with only the repo routing
   label: no readiness label, no Type/risk label, and no project milestone.
4. Create implementation issues as one-PR slices with the body contract in
   `docs/agents/linear-ticketing.md`.
5. Assign every non-container issue to the appropriate project milestone.
6. Encode ordering with Linear `blockedBy` and `blocks` relationships, not labels.
7. Put unblocked agent-ready implementation issues in `Todo` with `ready-for-agent`.
8. Put blocked implementation issues in `Backlog` without `ready-for-agent`.
9. Put human setup, product judgment, provider approval, credential, or ADR work in `Backlog` with
   `ready-for-human` or `needs-info`.
10. Add one Type label and one risk label to implementation issues; use human/customer labels such
    as `ready-for-human` or `research` where they better describe non-implementation work.
11. Summarize created or changed issue IDs, dependencies, and remaining gaps.

## Guardrails

- Do not put Sensitive Values in Linear issue bodies, comments, examples, attachments, or logs.
- Do not create Linear projects, project milestones, parent issues, implementation issues, or
  placeholder tickets for anything still listed in
  `docs/phasing.md#deferred-scope-parking-lot`. Promote the work in repo docs first.
- Do not create workstream labels. Use parent issues for workstream grouping, project milestones
  for delivery gates, and issue relationships for execution order.
- Do not make agent-ready issues that require new product, security, credential, vendor, or
  architecture judgment.
- Do not mark an issue `ready-for-agent` unless it satisfies the full contract in
  `docs/agents/autonomous-loop.md`.
