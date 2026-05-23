# ADR-0015: Production V1 Security Baseline

Date: 2026-05-23

Status: Accepted

V1 is the first production release of insecur, not a dev-only milestone. Even though the first real organization may be Isaac's own organization managing Isaac's own projects, v1 must be public multi-tenant-capable from day one because the product stores valuable secrets and should assume hostile tenants, hostile automation, compromised credentials, confused-deputy attempts, and prompt-injected agents. The current scaffold is pre-v1 learning infrastructure; production use requires the tenant-first authorization model, short-lived machine access, tenant-bound encryption and key versioning, audit/export integrity, and security release gates before valuable secrets are stored.

Production Secret Sync and Runtime Injection are additionally blocked by the Storage Security Gate. They must fail closed until root key material lives outside D1, organization and project data keys exist, provider credentials and Sensitive Metadata are encrypted under tenant-bound data keys, key versions are tracked, and AES-GCM authenticated data binds ciphertext to organization, project, environment, secret, version, app connection, provider credential, and sensitive metadata identity. Only opaque resource IDs may remain plaintext for lookup.

V1 does not include general search over Sensitive Metadata. User-friendly identification comes from authorized Scoped Lists, Configured Selectors, opaque IDs, and Sensitive Display Names decrypted only after authorization. Configured Selectors are opaque IDs, not plaintext names or slugs. Plaintext search indexes over secret names, provider target names, policy binding names, and security-relevant relationships are out of scope for v1.
