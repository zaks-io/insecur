# Security And Privacy Posture Record

This is the private source record for future customer-facing security and privacy documentation. It is not public copy, a public-documentation draft, a claims register, or a substitute for the governing ADRs. The eventual public doc is a separate controlled artifact that must be shorter, less stack-specific, and checked against the ADRs linked here before publishing. If the repository or core code is ever made public, this file and the surrounding docs require a separate disclosure review before publication.

## Disclosure Principles

- Be clear about the major controls insecur uses and the limits of those controls.
- Prefer capability-level descriptions over stack topology, account layout, exact provider configuration, or operational runbook details.
- Do not publish details that would make targeting easier, such as exact infrastructure bindings, account-role arrangements, key-version mechanics, queue/retry topology, rate-limit primitives, log collection paths, or break-glass procedures.
- Do not imply zero-knowledge, technical inability, immutable audit, US-only processing, secure local deletion, provider-side readback, or regulated-data suitability unless a governing ADR explicitly allows that exact wording.
- Present stronger options as security choices with explicit limits, not as broad privacy promises.

## Public-Level Controls We Can Explain

- **Sensitive Values** are encrypted before durable persistence and are not intentionally logged or stored as plaintext on insecur-controlled durable systems.
- **Sensitive Metadata** is sensitive by default and encrypted at rest unless it is on the narrow **Plaintext Metadata Allowlist** needed for routing, lookup, audit, and basic navigation.
- **Display Names** are a usability exception: they help humans reason about systems, can reveal architectural hints, and can be hidden from lower-assurance surfaces by **Metadata Visibility Policy**.
- **Organization Access** and object-level authorization guard every customer-scoped action; public behavior should not reveal whether a cross-tenant object exists.
- **Protected Environments** do not support Secret Reveal. Delivery for protected values is controlled through approved delivery paths and machine-held credentials.
- **Runtime Injection** avoids plaintext local secret files, but the approved destination process receives plaintext and can read it.
- **Secret Sync** is one-way delivery to an external provider secret store. It intentionally creates a provider-side copy and verification must not read provider-side values back.
- **Service Access** supports support, abuse, and incident work without Secret Reveal, Secret Delivery, or Sensitive Values. (Deferred past V1; see the docs/phasing.md parking lot and the ADR-0019 deferral amendment.)
- **Customer-Managed Key Custody** lets an Organization make future decrypting operations depend on a customer-controlled active custody grant. (Deferred past V1; see the docs/phasing.md parking lot and ADR-0050.)
- **Self-Hosted Instances** let the customer operate the Instance and hold infrastructure and Key Custody themselves. (Deferred past V1; see the docs/phasing.md parking lot.)
- **Audit Export** is tamper-evident and independently verifiable where ADR-0045 applies, not tamper-proof or non-repudiable against insecur under default hosted custody.

## Limits We Must Say Plainly

- The default Hosted Instance custody posture (ADR-0044) is not zero-knowledge. insecur-controlled infrastructure can technically decrypt under the accepted V1 custody model, even though the product surface removes casual and unsupported read paths.
- Customer-Managed Key Custody (deferred past V1) is not zero-knowledge while the customer grant is active. It means future decrypting operations fail after the customer revokes or disables the grant.
- If Customer-Managed Key Custody is unavailable or revoked, the Organization becomes **Custody-Locked** (deferred with that mode): decrypting operations fail closed while non-decrypting navigation, status, audit, and recovery surfaces remain available.
- Runtime Injection is a read boundary: any approved child process can inspect its delivered environment after delivery.
- Secret Sync creates a persistent provider-side copy until overwritten, rotated, disabled with copies left in place, or deleted through the managed cleanup flow.
- Display Names and other plaintext-allowlisted fields can reveal hints. They exist because making every workflow ID-only is error-prone; customers can tighten visibility through Metadata Visibility Policy.

## Stronger Security Options

- **Metadata Visibility Policy** can reduce what lower-assurance surfaces and Agent-Reachable Channels see without per-field sensitivity classification.
- **Metadata Viewer Role** grants scoped metadata visibility to humans or teams without granting Sensitive Values, delivery, mutation, or approval authority.
- **Delivery Risk Policy Presets** control how much non-protected automation is allowed through Agent-Reachable Channels.
- **Customer-Managed Key Custody** (deferred past V1) moves the custody grant for one Organization to customer-controlled infrastructure and makes revocation an effective future-decrypt boundary.
- **Self-Hosted Instance** (deferred past V1) moves Instance operation and Key Custody to the customer.

## Review Rules For External Copy

- Treat this file as private source material; do not publish it directly.
- The Public Site security page should be an open-security index, not a sanitized trust blurb: state
  the intended posture, point to public implementation and deeper threat-model/security-design
  material once public, and keep claims tied to what the governing ADRs/specs and shipped code
  support.
- Check no-reveal and technical-inability language against ADR-0044.
- Check Customer-Managed Key Custody language against ADR-0050.
- Check audit-integrity language against ADR-0045.
- Check residency language against ADR-0046.
- Check regulated-data language against ADR-0047.
- Check Service Access language against ADR-0019, including its deferral amendment.
- Check every capability claim against the docs/phasing.md deferred-scope parking lot before
  publishing; deferred capabilities must not appear in external copy as available.
- Check public implementation details against this document's disclosure principles before publishing.
