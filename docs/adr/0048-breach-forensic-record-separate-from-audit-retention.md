# ADR-0048: Breach Forensic Record Separate From Product Audit Retention

Date: 2026-05-25
Status: Accepted

## Decision

The breach forensic record is a separate concern from product-facing audit retention tiers. Product audit retention (Free 7 days, Team 90 days, Enterprise custom) is a product feature and is not the system of record for breach investigation.

insecur maintains a durable, integrity-protected forensic copy: tenant-qualified audit entries plus their signed export (ADR-0045) archived to durable storage (R2) on a fixed retention floor independent of tier, targeting 12 months and confirmed against counsel and the cyber and tech E&O insurer. This keeps the record needed to scope a breach alive longer than the product-visible window and longer than typical detection lag, which often exceeds 90 days.

The breach forensic record spans three sources, because no single one is sufficient. First, the product audit log, which covers tenant-scoped product actions and supports notification scoping. Second, Cloudflare account and Secrets Store logs, which cover Worker deploys and Secrets Store binding and role changes and are the only place a root-key extraction (ADR-0028) is visible. Third, the out-of-band escrow-access log (ADR-0044). Breach response collects and correlates all three.

This boundary is designed now to avoid migration debt. The full collection, streaming, and runbook work builds later.

## Options Considered

- **Product audit log is the forensic record, tier retention only.** Rejected. The 90-day Team window can be shorter than detection lag, and the product audit log is blind to infrastructure compromise such as root-key extraction.
- **Full breach program (detection, SIEM streaming, runbooks, defined response times) in V1.** Rejected. Over-scoped for the current proof stage; defer the heavy operational build.
- **Separate forensic record plus a retention floor, designed now and built later.** Accepted. It closes both gaps and matches the principle of running the system without creating migration debt.

## Consequences

- A durable forensic archive (R2) on a fixed retention floor becomes a design requirement. Its schema must carry tenant qualification and the signed-export linkage so archived entries stay independently verifiable (ADR-0045).
- The deferred breach runbooks must pull Cloudflare infrastructure logs and the escrow-access log, not just the product audit log.
- The retention-floor value (target 12 months) is confirmed against counsel and the insurer before launch; it is a legal and insurance input, not just an engineering choice.
- Free-tier 7-day product retention is unaffected; free holds no production secrets, so its forensic exposure is low.
- This forensic and legal retention concept is distinct from the Rollback Retention Window (proposed 90-day default, still open per docs/open-questions.md) and from indefinite Runtime Injection Policy Version metadata retention.

## Amendment (2026-06-12): Minimal custody-material compromise runbook required; full program stays deferred

This record deferred the full breach program, and that holds. What it left implicit is the boundary with ADR-0059, which names the custody-material compromise runbook (root key, Provider Credentials, the Cloudflare account) as the escalation target its triage hands off to: that runbook appeared in no required inventory, so the `runbook.catalog` control (docs/production-mvp-acceptance.md) could pass while the only escalation path for a Cloudflare or Secrets Store log anomaly pointed at a document nobody was required to write. The required-vs-deferred split is now recorded: the minimal runbook at [docs/runbooks/custody-material-compromise.md](../runbooks/custody-material-compromise.md) — containment, manual three-source log pull (the product audit log, Cloudflare account and Secrets Store logs, and the escrow-access log, per the consequence above), and tenant notification — is required pre-production at the `small_group_production` profile, the same minimal bar the Runbook Catalog applies to every other required incident runbook. The full detection, SIEM streaming, and defined-response-time program stays deferred exactly as decided above; the runbook's collection steps are manual log-pull guidance, not the deferred collection and streaming build.
