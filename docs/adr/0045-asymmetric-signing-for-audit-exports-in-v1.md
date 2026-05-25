# ADR-0045: Asymmetric Signing For Audit Exports In V1

Date: 2026-05-25
Status: Accepted

## Decision

V1 audit exports are asymmetrically signed in addition to ADR-0014's per-export hash chain and HMACed manifest. A public-key signature is computed over the canonicalized export so any holder of the public key can verify an export without a shared secret and without trusting insecur to run the check. This amends ADR-0014, which had deferred signing to a later separate decision.

The signing algorithm is Ed25519 via the libsodium WASM dependency already adopted in ADR-0024. The private signing key is an instance secret managed exactly like the root key under ADR-0028: generated offline, escrowed, write-only in Cloudflare Secrets Store, versioned, and rotated. The public key, current and historical versions, is published so exports stay verifiable across rotation. The manifest carries the signing key version alongside the existing HMAC key version.

The honest claim ceiling is "tamper-evident and independently verifiable." It is still not "tamper-proof," not "immutable," and not non-repudiable against insecur. Because the private signing key shares Cloudflare Secrets Store custody with the root key, any deploy or account-privileged identity that can decrypt can also produce valid signatures. Signing therefore delivers public verifiability against outside tampering, not non-repudiation against insecur-the-operator. Full non-repudiation, where the operator itself cannot forge, is bound to the same hardened-key-custody trigger as the root key: external KMS once a Hosted Instance has multiple Service Access operators (ADR-0044, ADR-0028).

## Options Considered

- **HMAC only, ADR-0014 status quo.** Rejected here. The verifier needs the secret HMAC key, so only insecur or a delegate it trusts with the key can verify, and sharing the key to enable customer verification also enables forgery. No independent customer-side or auditor-side verification.
- **Asymmetric signing with hardened key custody (HSM / external KMS) in V1.** Rejected for V1. It pulls in the external-KMS dependency, latency, and non-Cloudflare lock-in that ADR-0044 deferred, for a non-repudiation property no current customer requires.
- **Asymmetric signing with the private key in Secrets Store.** Accepted. It gives public, independent verifiability while staying Cloudflare-native, and the residual non-repudiation-vs-operator gap rides the existing root-key KMS trigger rather than creating a new one.

## Consequences

- A new instance secret exists: the audit-export signing private key, with the same offline-generation, escrow, write-only, versioned, and rotation lifecycle as the root key (ADR-0028). Losing it without escrow breaks verifiability of exports signed under that version.
- Public-key distribution is required: publish current and historical public keys so exports remain verifiable after rotation. Rotation re-publishes the new public key and records the new signing key version in subsequent manifests.
- `audit verify` checks the signature against the published public key in addition to recomputing the hash chain. The HMACed manifest stays for systems that already hold the verification key.
- Claim governance: customer-facing and contract language is "tamper-evident, independently verifiable," never "tamper-proof," "immutable," or "non-repudiable." Check copy against this ADR before publishing; see `docs/research/legal-liability.md`.
- Self-Hosted Instances sign with the customer's own signing key under the same custody model as their root key (ADR-0028).
- Revisit for non-repudiation against the operator at the same KMS trigger as the root key (ADR-0044).
