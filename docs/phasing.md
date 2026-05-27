# Phasing

Last updated: 2026-05-27. Status: **V1 scope is decided; deferred scope is parked here until explicitly promoted; finer release-splitting within V1 is still a working sequence.**

The 2026-05-25 scope review (see [V1 scope decisions](#v1-scope-decisions-2026-05-25-scope-review) below) settled what V1 contains: the reduced production spine, Cloudflare + GitHub providers, Vercel and several heavier layers deferred. What remains open is the finer cut inside V1: whether First Value ships on its own before Production Delivery, and what counts as second-release versus post-v1 hardening. Do not infer those finer boundaries from the specs.

## The product is specified phase-free

The CONTEXT, architecture, security, and ADR docs describe the whole product. They are written so an implementing agent can build any slice without first being told which version it belongs to. That is intentional: define the product completely, decide what ships when as a separate, later pass.

## How to read the "V1" and "Milestone" language already in the specs

The specs use "V1," "First Value Milestone," and "Production Delivery Milestone" in many places (for example ADR-0015, ADR-0041, and the Build Order in [project-status.md](project-status.md)). Read those as **build-ordering within the currently-specified product**, not as a settled release plan:

- **First Value Milestone** and **Production Delivery Milestone** capture a dependency order (prove the non-protected development loop before custodying production secrets). That ordering is a real constraint and is decided. Whether both land in the same shipped release, or the first ships alone, is not.
- "V1" in the specs marks "the product as currently specified," distinguishing it from explicitly deferred or future-enterprise capabilities. It is not a commitment that everything tagged V1 ships in one release, nor that everything not tagged V1 is excluded from the first release.

The V1 content cut-line is now recorded in [V1 scope decisions](#v1-scope-decisions-2026-05-25-scope-review) below. Reconciling the "V1" language across the specs to match it is a tracked language sweep.

## What is decided vs open

Decided:

- **V1 = the reduced production spine** (2026-05-25 scope review). Full kept/deferred list in the [V1 scope decisions](#v1-scope-decisions-2026-05-25-scope-review) section below.
- **Provider order: Cloudflare + GitHub in V1; Vercel deferred.** Both V1 providers are required for the insecur stack itself; Vercel is additive behind the ADR-0049 vendor ports.
- First Value (non-protected development Secret Use) precedes Production Delivery (Protected Environments, provider sync, approvals, audit, OIDC), gated by the Storage Security Gate. See ADR-0041.
- The Small-Group Production security baseline must be met before storing valuable production secrets. See ADR-0015, ADR-0021.

Open (the finer cut inside V1, not the V1 contents):

- Whether First Value ships on its own before Production Delivery is ready, or they ship together.
- What is second-release versus "post-v1 hardening" (the current best-guess hardening bucket lives in the project-status.md Build Order and is non-binding).

## V1 scope decisions (2026-05-25 scope review)

A CEO-style scope review on 2026-05-25 committed to the production spine as direction, then reduced V1 to the minimum that ships that spine safely. The build-actionable tasks from that review live in [../TODOS.md](../TODOS.md); this section is the cut-line of record.

The reduction is deliberately **additive**: every deferred layer is reversibility 4-5 because the vendor ports (ADR-0049), versioned policy, the operation/audit model, and the `key_version` schema seams already exist. Deferring is a sequencing choice, not a design lock-out.

### Kept in V1 (the reduced spine)

- Tenant-first schema on Hyperdrive-backed Neon Postgres with Row-Level Security and the Tenant-Scoped Store (ADR-0037 triple-redundant isolation), tested against real Postgres RLS.
- Envelope encryption with AES-256-GCM and ciphertext identity binding; org/project data keys and `key_version` on every record.
- WorkOS AuthKit + MFA (no SMS), scope-first authorization, the Effective Access Resolver.
- The Storage Security Gate (all controls, fail-closed before production delivery), no-plaintext-persistence, and the secret-free logging allowlist.
- Protected Change Orchestrator with promotion/publish/rollback, single-approver Human Approval Surface, the staleness transitions, and Delivery Risk Policy Presets.
- Machine identities and GitHub Actions OIDC for short-lived CI access.
- Cloudflare + GitHub provider sync; profile-based `insecur run` for local and deploy injection.
- BFF / session-cookie web security model; the web surface is read-only metadata browsing plus the Human Approval Surface.
- Full CI / supply-chain rig.

### Deferred scope parking lot

This section is the source of truth for work that is intentionally deferred. While an item remains
here, do **not** create Linear projects, project milestones, parent issues, implementation issues, or
placeholder tickets for it. The repo docs are the parking lot.

Active-scope issues may preserve seams that keep deferred work additive, but they must not build the
deferred behavior. For example, a provider port can stay Vercel-ready while Vercel sync itself
remains unticketed.

To promote a deferred item, update this section first: remove the item from the table below, add it
to the appropriate decided scope or build-order section with a concrete product outcome, and only
then create Linear scaffolding.

| Deferred item | Current boundary | Promotion trigger |
| --- | --- | --- |
| Vercel sync adapter | Keep the provider port model additive, but do not build Vercel sync or create Vercel Linear work. | Promote only after Cloudflare + GitHub delivery proves the provider sync spine or customer validation makes Vercel the next highest-confidence provider. |
| Cloudflare Queues + Durable Objects for sync execution | Inline sync with Postgres lease rows, fencing tokens, and compare-and-set invariants is the current execution model. | Promote only if inline sync or Postgres-backed serialization shows operational limits that justify queue/DO complexity. |
| Automated key-rotation engine | Keep `key_version`, rewrap primitives, and manual rotation/runbook seams; do not build a scheduler or autonomous rotation workflow. | Promote after the core key custody path and production runbooks exist and repeated manual rotation evidence shows automation is worth the added control surface. |
| Service Access surface | No Service Access product surface, permissions, or workflows are in active scope. | Promote after Production Delivery proves human, machine, sync, and runtime-injection access paths and a concrete service-to-service use case needs first-class support. |
| Staged Change Set / batch publish | Use the per-Protected-Environment Promotion Change Set path; do not build batch publish. | Promote when real approval workflows show repeated approval fatigue or multi-secret staging needs that cannot be handled by the narrower publish path. |
| Multi-approver and Partial Approvals | Keep policy data model seams generalizable, but fix the active approval threshold at one approver. | Promote when small-team production use requires multi-party approval as a product requirement, not just as an enterprise-shaped future option. |
| Full web management parity and broader UI | The active web surface is read-only metadata browsing plus the Human Approval Surface; mutating management flows stay CLI/API-first. | Promote after CLI/API workflows are proven and the next UI surface has a narrow, validated operator workflow. |
| Broader recovery and disaster-recovery hardening | Minimal encrypted backup and tested restore remain pre-production gates; separate backup keys, tighter RPO, cross-region copies, and broader drills stay deferred. | Promote after the first tested restore path is operational and production reliability goals require additional recovery coverage. |
| Better token revocation workflows | Build the required credential lifecycle and audit paths, but do not broaden revocation UX or automation beyond the active production-delivery need. | Promote after machine identity, deploy key, and provider credential flows produce concrete revocation pain. |
| Public onboarding hardening for unrelated tenants | Bounded onboarding and controlled organization creation are active; broad public hostile-tenant signup is not. | Promote before enabling broad public signup or operating the Hosted Instance for unrelated external tenants. |

## Current non-binding sequencing

The Build Order and Recommended Next Steps in [project-status.md](project-status.md) are the current best-guess ordering for implementation within the V1 scope set above. They are useful for "what to build next," not authoritative for the finer release boundaries, which stay open. Treat them as a working sequence.
They do not authorize Linear scaffolding for anything still listed in the deferred scope parking lot.
