# Phasing

Last updated: 2026-05-25. Status: **sequencing is explicitly NOT decided.**

This doc is the home for one decision that has not been made: where the release cut-lines fall. What counts as the first shipped version, what waits for a second, and what is "later" is open. Do not infer the answer from the specs.

## The product is specified phase-free

The CONTEXT, architecture, security, and ADR docs describe the whole product. They are written so an implementing agent can build any slice without first being told which version it belongs to. That is intentional: define the product completely, decide what ships when as a separate, later pass.

## How to read the "V1" and "Milestone" language already in the specs

The specs use "V1," "First Value Milestone," and "Production Delivery Milestone" in many places (for example ADR-0015, ADR-0041, and the Build Order in [project-status.md](project-status.md)). Read those as **build-ordering within the currently-specified product**, not as a settled release plan:

- **First Value Milestone** and **Production Delivery Milestone** capture a dependency order (prove the non-protected development loop before custodying production secrets). That ordering is a real constraint and is decided. Whether both land in the same shipped release, or the first ships alone, is not.
- "V1" in the specs marks "the product as currently specified," distinguishing it from explicitly deferred or future-enterprise capabilities. It is not a commitment that everything tagged V1 ships in one release, nor that everything not tagged V1 is excluded from the first release.

When the release cut-lines are decided, this doc records them, and the "V1" language in the specs gets reconciled to match (tracked as a deferred language sweep).

## What is decided vs open

Decided (dependency order, not release boundaries):

- First Value (non-protected development Secret Use) precedes Production Delivery (Protected Environments, provider sync, approvals, audit, OIDC), gated by the Storage Security Gate. See ADR-0041.
- The Small-Group Production security baseline must be met before storing valuable production secrets. See ADR-0015, ADR-0021.

Open (the actual phasing decision):

- Which slice is the first shipped release.
- Whether First Value ships on its own before Production Delivery is ready, or they ship together.
- What is second-release versus "post-v1 hardening" (the current best-guess hardening bucket lives in the project-status.md Build Order and is non-binding).
- Sequencing of provider adapters (Cloudflare / Vercel / GitHub) relative to each other.

## Current non-binding sequencing

The Build Order and Recommended Next Steps in [project-status.md](project-status.md) are the current best-guess ordering for implementation. They are useful for "what to build next," not authoritative for "what version is this." Treat them as a working sequence until this doc sets real cut-lines.
