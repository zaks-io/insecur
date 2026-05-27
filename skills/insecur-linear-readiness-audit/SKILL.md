---
name: insecur-linear-readiness-audit
description: Use when auditing insecur Linear issues for repo label coverage, agent readiness, blocked work, status correctness, dependency consistency, and issue body completeness.
---

# Insecur Linear Readiness Audit

Audit Linear workflow data against the repo's autonomous-agent contract.

## Required Context

Read these first:

- `AGENTS.md`
- `docs/agents/issue-tracker.md`
- `docs/agents/linear-ticketing.md`
- `docs/agents/autonomous-loop.md`
- `docs/agents/triage-labels.md`

## Audit Checks

For each relevant INS issue, check:

- It has label `zaks-io/insecur`.
- Parent workstream issues are containers in `Backlog` and have only the repo routing label: no
  readiness label, no Type/risk label, and no project milestone.
- Every non-container issue in an active project has a project milestone.
- Agent-ready implementation issues are `Todo`, have `ready-for-agent`, are unblocked, and satisfy
  the issue body contract.
- Blocked implementation issues are `Backlog` or `Blocked` and do not have `ready-for-agent`.
- Human setup, product judgment, vendor, credential, or ADR work uses `ready-for-human` or
  `needs-info`, not `ready-for-agent`.
- Implementation issues have one Type label and one risk label.
- Dependency order is encoded with Linear relationships.
- Issue bodies do not contain Sensitive Values.

## Output

Lead with actionable findings:

- issue ID and title
- problem
- recommended status/label/body/dependency change

When explicitly asked to fix issues, update Linear directly and summarize changed issue IDs.

## Guardrails

- Do not remove existing labels unless the user asked for cleanup and the replacement is clear.
- When adding `zaks-io/insecur`, preserve all existing labels.
- Do not promote an issue to `ready-for-agent` if any required contract field is missing.
