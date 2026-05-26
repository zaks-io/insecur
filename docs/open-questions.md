# Open Questions and Deferred Decisions

Living backlog of product, business, and operational gaps that are intentionally not decided
yet. Started 2026-05-25.

Decision-level architectural open questions also live in the ADR index under "Open Questions To
Grill" (`adr/README.md`). This file is the broader product/business/ops backlog. When an item
here is decided, move it into the relevant spec (CONTEXT, an ADR, or a design doc) and delete it
here.

## Business

- **Unit economics / COGS: not modeled.** The $25/seat price has no cost basis yet. See
  [research/unit-economics.md](research/unit-economics.md). Blocks defending the price.
- **Demand validation.** The founder is the design partner and first user. Broaden validation
  before heavy go-to-market spend.
- **Team seat minimum / platform floor:** open (from pricing-strategy.md).
- **Annual discount percentage and billing mechanics** (annual up front vs monthly-with-commit):
  open.
- **Multi-org under one account + billing entity** for Enterprise: undefined.
- **Whether to surface a starting Enterprise price** or keep it fully sales-led: open.

## Security and operations

- **Incident Response runbook: not thought through.** Needed for SOC 2 and table stakes for a
  secrets custodian. Write the "tenant reports a compromised secret" path.
- **Secret rotation must be first-class and easy** (UX + runbook). SOC 2 likely depends on it.
- **SOC 2:** plan for it from the start; pursue certification once customers arrive.
- **Root-key rotation window mechanics:** see ADR "Open Questions To Grill".
- **External telemetry sink vendor:** see ADR "Open Questions To Grill".
- **Root-key custody operational controls (ADR-0044):** minimize Cloudflare account administrators,
  separate the deploy principal from day-to-day human access, and record escrow-key access and
  Secrets Store binding/role changes out of band. Launch tasks, not yet implemented.
- **Breach forensic record (ADR-0048):** design the durable, integrity-protected forensic archive
  (audit plus signed export to R2) on a fixed retention floor independent of product audit tiers,
  and ensure the future Incident Response runbook collects Cloudflare infrastructure logs and the
  escrow-access log, not just the product audit log, which cannot see root-key extraction.

## Legal, claims, and contracts

These came out of the legal-liability grill (2026-05-25). The decisions are recorded in ADR-0044
through ADR-0048; the items below are the confirmations and copy still owed before the claims can
ship. Full counsel punch list in [research/legal-liability.md](research/legal-liability.md).

- **Subprocessor US-residency confirmation (ADR-0046):** confirm Cloudflare Secrets Store, WorkOS,
  and Axiom are US-pinnable before publishing any residency copy. If one cannot be pinned, narrow
  the claim or disclose the exception. The vendor ports in
  [adr/0049-vendor-ports-and-adapters.md](adr/0049-vendor-ports-and-adapters.md) are the lever for
  swapping a non-pinnable subprocessor.
- **Forensic retention floor value (ADR-0048):** confirm the target 12-month floor against counsel
  and the cyber and tech E&O insurer. It is a legal and insurance input, not just an engineering
  choice.
- **AUP and onboarding attestation (ADR-0047):** draft the Acceptable Use Policy clickwrap (prohibit
  PHI, cardholder, and government-classified data; state no BAA is offered) and the onboarding
  attestation. Counsel work; the exclusion only holds if it is enforced and not knowingly undercut.
- **Claim-wording governance (ADR-0044, 0045, 0046, 0047):** no claims register (decided ADRs-only).
  Marketing and contract copy for no-reveal custody, tamper-evident audit, US residency, and the
  regulated-industry exclusion must be checked against the governing ADR before publishing. Use
  [security-and-privacy-posture-record.md](security-and-privacy-posture-record.md) as the internal
  private source record for high-level external security/privacy documentation, not as publishable
  copy or a public-documentation draft.

## Privacy

- **Build privacy-by-default** regardless of target market: data export, data erasure, retention
  windows, and a maintained subprocessor list.
- **GDPR:** do not commit now; revisit on EU demand. The system should already support deletion
  and export so a later commitment is configuration, not a refactor.

## Product and UX

- **CLI human login UX:** proposed OAuth device authorization flow, memory/session-only token.
  Confirm.
- **Approval notification channel:** email + web app now; a Capacitor-wrapped mobile app later
  (reference: the founder's existing Capacitor project) for native push. "Push Device
  Registration" maps to that future app. The web app is the single approval surface; mobile is a
  wrapper, not a separate native approval path.
- **Structured / multi-field secrets:** deferred. The core Secret value is a single UTF-8 string;
  structured is a later additive type, not a v1 noun.
- **Provider read-back bulk import:** rejected for now (conflicts with the no-readback
  principle). Adoption is manual entry plus local `.env`/file import. Revisit only on real demand.
- **Approval state-machine edge cases:** largely specified; keep grilling (Partial Approvals,
  staleness, supersession, draft discard) while building.

## Self-Hosted Instance (BYOC)

- **insecur-the-company's access boundary** on a customer-operated Instance: telemetry, Service
  Access, and support must degrade to zero or explicit opt-in. Define this precisely.
- **Release / update model** for self-hosted Instances: undefined.
- Key Custody and Identity bindings are customer-controlled in this mode (see the vendor ports in [adr/0049-vendor-ports-and-adapters.md](adr/0049-vendor-ports-and-adapters.md)).

## Limits to finalize (proposed defaults, confirm)

- **Rollback Retention Window:** 90 days of prior encrypted Published Versions.
- **Audit retention:** Free 7d, Team 90d, Enterprise custom (set in pricing-strategy.md).
- **Free-tier caps:** 1 org / 3 projects / 3 members (set in pricing-strategy.md).
- **Rate limits:** deferred to the public-onboarding abuse-control work.

## Phasing

- **V1/V2 sequencing is explicitly NOT decided.** See [phasing.md](phasing.md). The product is
  specified phase-free; sequencing is a separate, later pass.
