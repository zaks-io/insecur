# ADR-0049: Vendor Ports And Adapters

Date: 2026-05-25
Status: Accepted

## Decision

insecur treats its three external infrastructure dependencies as named ports with swappable adapters, not as load-bearing product decisions. The product is specified in terms of the port's contract; the vendor behind it is the current binding, recorded but not assumed permanent. The decisions that matter are the contracts and the security properties they must uphold, not the vendor names.

The three ports and their current bindings:

- **Key Custody** holds the instance root key and rewraps the organization and project data keys (ADR-0005, ADR-0026, ADR-0031). Current binding: Cloudflare Secrets Store with offline escrow (ADR-0028). Documented alternate: an external KMS or HSM, for which ADR-0028 already records the migration trigger (a Hosted Instance with multiple Service Access operators) and the property it would buy (deploy/account-privileged access alone could no longer decrypt tenant data).
- **Human Identity** authenticates Users and is the source of the External Subject; insecur owns Membership and Organization Access regardless of the provider. The port is already named **Human Identity Provider** in CONTEXT.md. Current binding: WorkOS AuthKit (ADR-0010) with WorkOS MFA (ADR-0009). Documented alternate: another OIDC/SAML identity provider configured through Instance Identity Configuration.
- **Metadata Store** is the tenant-scoped source of truth for metadata, operation state, idempotency, and audit events; it never holds plaintext Sensitive Values, which stay behind the Keyring. Current binding: Neon Postgres reached through Cloudflare Hyperdrive with Row-Level Security (ADR-0036) behind the Tenant-Scoped Store (ADR-0037). Documented alternate: another managed or self-operated Postgres host reachable over the same driver contract.

A port boundary is honored when product code, specs, and ADRs depend on the port's contract and named abstraction rather than vendor-specific behavior. Where a vendor capability leaks into a security property, the leak is stated explicitly at the binding ADR rather than hidden (for example, ADR-0028's statement that Secrets Store has no per-secret binding ACL, so "deploy access cannot decrypt tenant data" is not a V1 guarantee).

## Options Considered

- Treat each vendor as a fixed assumption and write the product directly against it. Rejected: it couples the product to vendor specifics, makes the Self-Hosted Instance and the eventual external-KMS migration into rewrites, and buries security-relevant vendor properties inside implementation.
- Build full provider-agnostic abstraction layers now, with more than one live adapter per port. Rejected: it is speculative engineering ahead of demand. V1 ships one adapter per port; the contract is what keeps the second adapter cheap.
- Name the ports, ship one adapter each, and record alternates and migration triggers at the binding ADRs. Accepted: it captures the swappability the product needs (BYOC, external KMS later) without paying for unused adapters.

## Consequences

This ADR consolidates a pattern that already existed in pieces; it does not re-decide any binding. The Human Identity Provider abstraction, ADR-0028's external-KMS trigger, and ADR-0036's "Postgres on another host" option are the prior art. The Self-Hosted Instance (BYOC) relies on these ports directly: on a customer-operated Instance the customer holds the Key Custody material and may point the Human Identity and Metadata Store bindings at their own infrastructure, with no separate product codebase (CONTEXT.md, ADR-0020).

New work that touches a vendor must state which port it is behind and must not let vendor-specific behavior become an unstated product invariant. When a binding changes, update its binding ADR and leave this index of ports intact. Unit economics are sensitive to the binding choice per port; cost modeling lives in research/unit-economics.md and must be redone when a binding changes.
