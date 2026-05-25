# ADR-0046: US Residency Claim Scoped To Data At Rest

Date: 2026-05-25
Status: Accepted

## Decision

insecur's residency promise is scoped to durable data at rest, not to compute location. Customer secret ciphertext, Sensitive Metadata, and audit records are stored in the United States: the Neon Postgres region is pinned to the US at project creation (ADR-0036) and the R2 bucket is created in a US location.

Request processing runs on Cloudflare's global edge (ADR-0002). Workers execute at the point of presence nearest the caller, where Sensitive Values are decrypted and delivered in memory and never durably stored. The residency claim therefore covers durable stores, not edge execution location. The honest public statement is: customer secret data and metadata are stored at rest in the United States, and request processing runs on Cloudflare's global edge and is transient, with no customer secret durably stored outside the US. We do not claim "your data never leaves the US" or an unscoped "US-only."

Before any residency wording is published, the region or residency posture of three subprocessors whose location is not yet verified must be confirmed and pinned: Cloudflare Secrets Store for the root and instance keys (ADR-0028), WorkOS for account PII (ADR-0010), and Axiom for operational telemetry (ADR-0030). If any cannot be pinned to the US, the claim narrows or that flow is disclosed as an exception.

## Options Considered

- **Blanket "your data never leaves the US."** Rejected. It is false under global edge compute and three unconfirmed subprocessor regions, and is the same FTC Act Section 5 / UDAP claim-reality gap as overclaiming zero-knowledge (see `docs/research/legal-liability.md`).
- **No residency claim in V1.** Rejected. US data-at-rest is already supported by ADR-0036 and is a real selling point for US buyers; silence forfeits it for no safety gain.
- **Scope the claim to data at rest, carve out transient edge compute, gate wording on subprocessor confirmation.** Accepted. It is honest, defensible, and preserves the Cloudflare-native posture.

## Consequences

- Marketing and contract residency language is bounded to data at rest with an explicit edge-compute carve-out, and must be checked against this ADR before publishing, alongside the no-reveal (ADR-0044) and tamper-evident (ADR-0045) claim decisions.
- Three subprocessor region confirmations (Secrets Store, WorkOS, Axiom) are prerequisites before publishing residency language; track them as open items.
- R2 bucket location must be provisioned in a US region and the Neon region pinned US (ADR-0036); these belong in provisioning and the Storage Security Gate checks.
- Non-US or multi-region residency (for example EU) is out of scope for V1 and would revisit this ADR and ADR-0036.
