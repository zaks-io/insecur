# ADR-0044: No-Reveal Custody Is A Product-Surface Guarantee, Not Infrastructure Zero-Knowledge

Date: 2026-05-25
Status: Accepted

## Decision

insecur's "no-reveal custody" claim is a guarantee about the product surface, not a claim of cryptographic inability at the infrastructure layer. The product guarantee is that agents and ordinary human sessions have no read path (no Secret Reveal) to Protected Environment Sensitive Values, and that Service Access excludes Secret Reveal (ADR-0019). It is not a claim that the operator is technically incapable of decryption.

For V1 the instance accepts ADR-0028 as written: the root key lives in Cloudflare Secrets Store with no per-secret binding ACL, so any identity that can deploy a Worker in the account can bind and read the root key at runtime. "Deploy access cannot decrypt tenant data" is therefore explicitly not a V1 guarantee, and the company can technically decrypt tenant data.

Because the operator is not cryptographically blind, V1 marketing and contracts must not claim "zero-knowledge," "we cannot access your secrets," or "technically incapable of access." The honest, defensible claim is strong encryption with no product read path and no casual access, not cryptographic inability. The same posture sets the law-enforcement answer: faced with a valid warrant the operator is not technically unable to comply, and customers must not be told otherwise.

To keep the gap between claim and reality small without leaving the Cloudflare-native posture, V1 adds cheap operational controls: minimize the set of Cloudflare account administrators, separate the deploy principal from day-to-day human access, and record out-of-band access to the offline escrow copy and changes to Secrets Store bindings and roles.

External KMS, which would let the operator truthfully say deploy access alone cannot decrypt, is deferred to the trigger already named in ADR-0028: a Hosted Instance with multiple Service Access operators.

## Options Considered

- **Market zero-knowledge / "we can't see your secrets" now.** Rejected. It is false in V1 under ADR-0028, is the textbook FTC Act Section 5 and state UDAP deceptive-security claim, and is exactly the misrepresentation a plaintiff cites to reach the owner personally past the LLC shield. See `docs/research/legal-liability.md` surprise 1.
- **Move the root key to external KMS now to back a stronger claim.** Rejected for V1. It breaks the Cloudflare-native posture (ADR-0002) and adds latency, egress, and a hard non-Cloudflare dependency for a control that is only forced once multiple operators exist.
- **Accept ADR-0028, scope the claim precisely, and add cheap operational controls.** Accepted. It keeps the architecture and the marketing honest at near-zero cost and preserves the documented KMS upgrade path.

## Consequences

- Customer-facing language is bounded. Use "no-reveal custody," "no product read path," and "strong encryption with no casual access." Never use "zero-knowledge," "we cannot decrypt," or "technically incapable." Marketing and contract copy must be checked against this ADR before publishing.
- Three operational controls become launch tasks: Cloudflare account-admin minimization, deploy-principal separation, and out-of-band logging of escrow-key access plus Secrets Store binding and role changes.
- Self-Hosted Instances shift this custody to the customer, who generates, loads, and escrows their own root key per ADR-0028; the hosted instance is where operator custody liability concentrates.
- The KMS migration is a known future decision, not a V1 deliverable. Revisit when a Hosted Instance gains multiple Service Access operators.
