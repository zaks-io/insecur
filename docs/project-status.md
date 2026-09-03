# Project Status

Last updated: 2026-09-03

This document owns live implementation, verification, and launch status. It does not redefine
product behavior. When it disagrees with an owning spec, ADR, generated route inventory, or current
code, follow the owner and treat this file as stale. The concise delivered-capability map is
[features.md](features.md); the authoritative route-to-deploy table is
[specs/deploy-route-inventory.md](specs/deploy-route-inventory.md).

## Current state

insecur is a working prelaunch product, not a scaffold. The repository contains four Cloudflare
Worker apps and 33 packages on Node 24 and pnpm 10. The latest published native CLI release is
`cli-v0.2.0`.

The implemented product surface includes:

- encrypted Local Mode with OS-keystore-backed machine custody and Local Mode-to-hosted migration
- the hosted First Value loop for blind write and one-run secret injection
- WorkOS web and CLI authentication, tenant onboarding, membership, and agent attribution
- the metadata-only web console, audit feed/export, approvals, and high-assurance step-up
- protected change, Runtime Injection policy, operation, backup/export, and restore foundations
- alpha GitHub Actions and Cloudflare Worker Secret Sync adapters
- capability-isolated API, Runtime, Web, and Site Worker deploys

Provider sync is alpha. The adapters, planning, API/RPC seams, and execution tests exist, but the
feature does not yet have enough provider-level and hosted end-to-end evidence to be described as
reliable or production-ready.

## Verification snapshot

Evidence refreshed on 2026-09-03:

- `main` was `b104afae486b9b367bdac676e1e36e7a5a84f1a4` when this snapshot was written.
- The public repository, `insecur.cloud` site/docs/install script, and production API, Web, Site,
  and preview health endpoints all responded successfully.
- `cli-v0.2.0` is a published, immutable GitHub Release.
- Daily Release run `33800180656` deployed commit `66558277` to Preview and its full Preview proof
  job passed, including the deployed web/CLI/API paths and R2 backup no-plaintext evidence.
- That Daily Release did not promote to Production because its separate proof-result handoff gate
  failed. The handoff fix is on `main`, but a successful exact-head Daily Release has not yet proved
  it. Do not infer Production deployment from the successful Preview job.
- The `production` release ledger still points to `130d5c4a5eccf1331ee849572793aa4a7b93f093`
  from 2026-07-17. Public liveness is healthy, but Production is not current with `main`.

This documentation audit passed `pnpm verify`, including policy, generated-documentation,
formatting, lint, typecheck, and unit-test gates.

## Launch blockers and known limits

The service is not approved for valuable production secrets. Remaining proof or implementation
gaps include:

- The Storage Security Gate still lacks complete delivery-path wiring and evidence composition.
  Its readiness audit marks `storage.delivery_fail_closed` missing and several controls partial.
- Production has not been promoted from the current `main` through a fully green exact-SHA Daily
  Release.
- Provider sync needs substantially more provider-level and hosted end-to-end testing.
- GitHub App installation verification is not provider-backed and continues to fail closed.
- Approval notification delivery ports are not wired into Runtime composition.
- The complete protected machine Runtime Injection and Environment Deploy Key path is not launch
  proven.
- Customer-validation evidence and the `small_group_production` acceptance profile are incomplete.
- Customer-managed key custody, self-hosted instances, Service Access, Vercel sync, and broad public
  signup remain deferred.

Protected Environment Secret Reveal is intentionally absent. It is not a launch blocker or a future
read path.

## Next build order

1. Make the Daily Release train green for one current exact `main` SHA and reconcile the Production
   ledger only after the Production deploy and smoke pass.
2. Complete Storage Security Gate fact composition and fail-closed enforcement on every production
   delivery path.
3. Harden provider sync with real provider authorization, writes, metadata-only verification,
   retries, and partial-failure evidence before calling it reliable.
4. Wire metadata-safe approval notifications and finish the protected machine delivery path.
5. Complete the customer-validation and `small_group_production` acceptance evidence.

The milestone sequence and exit gates are in [roadmap.md](roadmap.md). Production acceptance is
owned by [production-mvp-acceptance.md](production-mvp-acceptance.md).

## Source pointers

- [features.md](features.md): delivered capability map
- [specs/deploy-route-inventory.md](specs/deploy-route-inventory.md): generated route ownership
- [storage-security-gate.md](storage-security-gate.md): production storage gate contract
- [packages/storage-security-gate/docs/readiness-fact-audit.md](../packages/storage-security-gate/docs/readiness-fact-audit.md): current gate fact coverage
- [production-mvp-acceptance.md](production-mvp-acceptance.md): launch profiles and evidence rules
- [agents/testing.md](agents/testing.md): local, integration/RLS, and preview proof layers
- [roadmap.md](roadmap.md): milestone order and exit gates
