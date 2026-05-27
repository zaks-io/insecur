# Linear Ticketing

This repo uses Linear as the implementation queue, state machine, and dependency graph. The repo
docs define the product and workflow; Linear tracks executable slices and human setup work.

## Projects

Use team `INS`.
Apply label `zaks-io/insecur` to every issue for this repo.

| Project                                | Purpose                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `Customer Discovery & Design Partners` | Customer discovery, design-partner onboarding, evidence review, and scope gates.         |
| `First Value Build`                    | Agent-build work for the First Value proof.                                              |
| `Production Delivery Foundation`       | Tenant, auth, key, storage, protected-environment, and Storage Security Gate foundation. |
| `Machine Access and CI Trust`          | Machine identities, deploy keys, GitHub Actions OIDC, and scoped CI access.              |
| `Runtime Injection Delivery`           | Profile-backed local and deploy Runtime Injection without secret reveal.                 |
| `Provider Sync: GitHub and Cloudflare` | GitHub Actions and direct Cloudflare Worker secret sync.                                 |
| `Approval UX and Delivery Policy`      | Human Approval Surface, High-Assurance Challenges, and Delivery Risk Policy Presets.     |
| `Audit, Runbooks, and Release Gates`   | Audit export, tested restore evidence, runbooks, and production release gates.           |

The First Value implementation ticket graph lives in
`docs/specs/first-value-ticket-plan.md`.

## Project Milestones

Use these Linear project milestones as tracking gates. Do not create milestones for deferred-scope
items unless they have first been promoted out of `docs/phasing.md#deferred-scope-parking-lot`.

| Project                                | Milestones                                                                                                                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Customer Discovery & Design Partners` | `Discovery Interviews Complete`; `Design Partners Recruited`; `Supported Repo Onboarding`; `Usage Evidence Review`; `Scope Gate Decision`                                                                         |
| `First Value Build`                    | `Tooling Baseline`; `Tenant and Security Foundation`; `Guided Onboarding Path`; `Secret Write Path`; `Runtime Injection Path`; `Copyable Proof Complete`                                                          |
| `Production Delivery Foundation`       | `Instance and Tenant Bootstrap`; `Human Auth and Authorization`; `Tenant-Bound Key Custody`; `Protected Environment Lifecycle`; `Storage Security Gate Ready`                                                     |
| `Machine Access and CI Trust`          | `Machine Identity Model`; `GitHub Actions OIDC Federation`; `Environment Deploy Keys`; `Short-Lived Access Tokens`; `Machine Access Audit Coverage`                                                               |
| `Runtime Injection Delivery`           | `Profile Model and Resolution`; `Profile-Backed CLI Run`; `Production Runtime Gate Enforcement`; `Deploy Runtime Injection`; `Metadata-Only Operation Output`                                                     |
| `Provider Sync: GitHub and Cloudflare` | `App Connections and Boundaries`; `Sync Model and Exact Bindings`; `Explicit Provider Lookup`; `Inline Operation Store`; `GitHub Actions Sync`; `Cloudflare Worker Secret Sync`; `Sync Verify Retry Resume Audit` |
| `Approval UX and Delivery Policy`      | `Approval State Machine`; `Human Approval Surface`; `High-Assurance Challenges`; `Protected Delivery Configuration Approval`; `Delivery Risk Policy Presets`; `Preview Automation Opt-In`                         |
| `Audit, Runbooks, and Release Gates`   | `Tenant-Qualified Audit Hardening`; `Tamper-Evident Audit Export`; `Tested Restore Evidence`; `Security Runbooks`; `Release Gate Automation`; `Production Readiness Signoff`                                      |

## Field Organization Model

Use Linear fields consistently so the project remains auditable as the roadmap grows:

- **Project** is the phase or major program, such as `First Value Build`.
- **Project milestone** is a delivery gate inside that project, such as `Tenant and Security
Foundation`.
- **Parent issue** is a workstream container, such as `W1 - Persistence, Tenant Boundary, and
Operations State`.
- **Child issue** is executable work or human/customer work that can move through the state machine.

Every non-container issue in an active project must have a project milestone. This includes AFK
implementation issues, HITL setup issues, customer-validation work, product-judgment work, and
public-facing mechanism/content work.

Parent workstream issues are intentionally different: keep them in `Backlog`, give them only the
repo routing label, do not add readiness labels, and do not assign them to a project milestone.
They are containers for navigation and ownership, not delivery gates. Do not create a catch-all
milestone such as `Workstream Containers`; that turns milestones into folders and makes progress
reporting less meaningful.

## Deferred Scope Exclusion

Before creating or updating Linear scaffolding, check
`docs/phasing.md#deferred-scope-parking-lot`.

Items in that section must not receive Linear projects, project milestones, parent issues,
implementation issues, or placeholder tickets. The repo docs are the deferred-scope parking lot. If
the work is now needed, promote it in the repo docs first by removing it from deferred scope and
adding a concrete product outcome to the decided scope or build order.

It is acceptable for an active issue to preserve a seam for deferred work, such as a provider port
that remains Vercel-ready. The issue must not implement, schedule, or track the deferred behavior.

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
and are not agent-ready implementation work. Parent containers should not have Type, risk,
readiness, or milestone fields; the child issues carry that execution metadata.

## Publishing Checklist

1. Confirm team `INS`, project, labels, and statuses exist.
2. Create or update the project before creating workstream parents.
3. Create workstream parents in `Backlog` with label `zaks-io/insecur`, no readiness label, no
   Type/risk label, and no milestone.
4. Create child issues in dependency order so blockers have real issue IDs.
5. Set `parentId` to the matching workstream parent.
6. Assign every non-container child issue to the appropriate project milestone.
7. Use Linear `blockedBy` or `blocks` relationships for ordering.
8. Put blocked AFK issues in `Backlog` without `ready-for-agent`.
9. Put unblocked AFK issues in `Todo` with `ready-for-agent`.
10. Put HITL issues in `Backlog` with `ready-for-human`.
11. Preserve `zaks-io/insecur` when updating issue labels.
12. Add risk and type labels that match the work, such as `Feature`, `Tech Debt`,
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
