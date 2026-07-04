# Open Questions and Deferred Decisions

Living backlog of product, business, and operational gaps that are intentionally not decided
yet. Started 2026-05-25.

Decision-level architectural open questions also live in the ADR index under "Open Questions To
Grill" (`adr/README.md`). This file is the broader product/business/ops backlog. When an item
here is decided, move it into the relevant spec (CONTEXT, an ADR, or a design doc) and delete it
here.

## Business

- **Unit economics / COGS: rough model exists.** The first model supports the $25/seat price for
  normal Team usage, but depends on Free-tier quotas, fair-use automation limits, and measured
  runtime-injection costs once implemented. See
  [research/unit-economics.md](research/unit-economics.md).
- **Demand validation.** The founder is the design partner and first user. Broaden validation
  before heavy go-to-market spend.
- **Team seat minimum / platform floor:** open (from pricing-strategy.md).
- **Annual discount percentage and billing mechanics** (annual up front vs monthly-with-commit):
  open.
- **Multi-org under one account + billing entity** for Enterprise: undefined.
- **Whether to surface a starting Enterprise price** or keep it fully sales-led: open.

## Security and operations

- **Secret rotation must be first-class and easy** (UX + runbook). SOC 2 likely depends on it.
- **SOC 2:** plan for it from the start; pursue certification once customers arrive.
- **External telemetry sink vendor:** see ADR "Open Questions To Grill".
- **Root-key custody operational controls (ADR-0044):** minimize Cloudflare account administrators,
  separate the deploy principal from day-to-day human access, and record escrow-key access and
  Secrets Store binding/role changes out of band. Launch tasks, not yet implemented.
- **Breach forensic record (ADR-0048):** design the durable, integrity-protected forensic archive
  (audit plus signed export to R2) on a fixed retention floor independent of product audit tiers,
  and wire the Incident Response runbook escalation path (ADR-0059) to collect Cloudflare
  infrastructure logs and the escrow-access log, not just the product audit log, which cannot see
  root-key extraction.

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

- **CLI human login UX: resolved.** `insecur login --device` (OAuth device authorization for
  remote shells, with the cross-device consent-phishing treatment) is decided in ADR-0010's
  2026-07-04 amendment; loopback PKCE stays the default on browser-reachable machines. The
  implemented INS-31 login (a WorkOS cookie-exchange bridge in
  `packages/cli/src/commands/login.ts`) does not realize the device flow yet. The
  memory/session-only token posture is decided (ADR-0007).
- **Approval notification channels are decided in ADR-0017** (browser/mobile push primary,
  in-app and email fallback, email alert-only). Open: timing of the Capacitor-wrapped mobile app
  for native push (reference: the founder's existing Capacitor project). Push Device Registration
  covers browser push as well as that future app. The web app is the single approval surface;
  mobile is a wrapper, not a separate native approval path.
- **Approval state-machine edge cases:** largely specified; keep grilling (Partial Approvals,
  staleness, supersession, draft discard) while building.

## Self-Hosted Instance (BYOC)

- **insecur-the-company's access boundary** on a customer-operated Instance: telemetry, Service
  Access, and support must degrade to zero or explicit opt-in. Define this precisely.
- **Release / update model** for self-hosted Instances: undefined.
- Key Custody and Identity bindings are customer-controlled in this mode (see the vendor ports in [adr/0049-vendor-ports-and-adapters.md](adr/0049-vendor-ports-and-adapters.md)).

## Limits to finalize (proposed defaults, confirm)

- **Rollback Retention Window:** 90 days of prior encrypted Published Versions.
- **Injection Grant TTL default:** proposed 300 seconds for policy-less First Value runs; recorded
  as the First Value default in [first-value-milestone.md](first-value-milestone.md) (Runtime
  Injection Grant Service seam) and implemented in
  `packages/runtime-injection/src/injection-grant-ttl.ts`. Open: confirm 300s as the final default.
- **High-Assurance Challenge validity window:** no proposed value yet.
- **Audit retention:** Free 7d, Team 90d, Enterprise custom (set in pricing-strategy.md).
- **Free-tier caps:** 1 org / 3 projects / 3 members (set in pricing-strategy.md).
- **Rate limits:** deferred to the public-onboarding abuse-control work.

## Phasing

- **V1 scope and provider order are decided** (2026-05-25 scope review; see
  [phasing.md](phasing.md)). Still open is only the finer cut inside V1: whether First Value ships
  alone, and which hardening lands in a second release versus post-V1.
