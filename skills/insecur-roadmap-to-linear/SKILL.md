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

1. Inventory the docs and extract capabilities, decisions, constraints, and explicit not-yet-done
   work.
2. Group work by product milestone project, then by parent workstream issue.
3. Create or update parent workstream issues as containers in `Backlog` without readiness labels.
4. Create implementation issues as one-PR slices with the body contract in
   `docs/agents/linear-ticketing.md`.
5. Encode ordering with Linear `blockedBy` and `blocks` relationships, not labels.
6. Put unblocked agent-ready implementation issues in `Todo` with `ready-for-agent`.
7. Put blocked implementation issues in `Backlog` without `ready-for-agent`.
8. Put human setup, product judgment, provider approval, credential, or ADR work in `Backlog` with
   `ready-for-human` or `needs-info`.
9. Add one Type label and one risk label to implementation issues.
10. Summarize created or changed issue IDs, dependencies, and remaining gaps.

## Guardrails

- Do not put Sensitive Values in Linear issue bodies, comments, examples, attachments, or logs.
- Do not create workstream labels. Use parent issues or project milestones.
- Do not make agent-ready issues that require new product, security, credential, vendor, or
  architecture judgment.
- Do not mark an issue `ready-for-agent` unless it satisfies the full contract in
  `docs/agents/autonomous-loop.md`.
