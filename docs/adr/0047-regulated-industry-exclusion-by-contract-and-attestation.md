# ADR-0047: Regulated-Industry Exclusion By Contract And Attestation, No Content Inspection

Date: 2026-05-25
Status: Accepted

## Decision

Regulated industries (healthcare and HIPAA, finance and GLBA and PCI, government and FedRAMP) are excluded by contract, not by data-layer enforcement. The mechanism has three parts: an Acceptable Use Policy clickwrap that prohibits PHI, cardholder data, and government-classified data and states that no BAA is offered; an onboarding attestation that the customer will not store regulated data; and a deliberate decision not to market to or build features for regulated verticals.

insecur does not and cannot inspect secret contents to enforce this. The no-reveal posture and No Plaintext Persistence mean the platform has no read path to secret plaintext, and adding content scanning would both break that custody model and create new liability by making insecur a reader of customer secrets. The exclusion is therefore enforced at the contract and onboarding layer, never at the data layer.

The exclusion carries a duty to act on actual knowledge. If insecur gains actual knowledge that a customer is storing regulated data, for example through a BAA request or a support disclosure, it must respond by declining the BAA and enforcing the AUP. Ignoring such knowledge is the willful blindness that undoes a contractual exclusion.

## Options Considered

- **Contract-only (AUP plus no BAA), no attestation.** Rejected. Weaker against a willful-blindness argument and gives no signal at signup.
- **Technical content screening of secret values.** Rejected. Infeasible under no-reveal and No Plaintext Persistence, breaks the custody model, and creates new liability by making insecur read customer secrets.
- **Contract plus onboarding attestation plus no regulated marketing plus act-on-knowledge, with no content inspection.** Accepted. Cheap, honest, and it closes the willful-blindness gap without touching the data layer.

## Consequences

- Onboarding must include an attestation step, and the AUP must be clickwrap and enforced; the exclusion only holds if insecur does not knowingly onboard the customers it forbids.
- Marketing must not target regulated verticals or make HIPAA, PCI, or FedRAMP claims; check copy against this ADR before publishing, alongside ADR-0044, ADR-0045, and ADR-0046.
- An operational path must route actual-knowledge signals (BAA requests, support disclosures) to enforcement rather than silent acceptance.
- No engineering work scans secret contents; future proposals to do so are out of scope and contradict the custody model.
- HIPAA, GLBA, PCI, and FedRAMP features and BAAs stay out of scope; revisiting means a different product posture and a fresh legal review.
