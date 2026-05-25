# ADR-0015: Production V1 Security Baseline

Date: 2026-05-23

Status: Accepted, amended by [ADR-0021](0021-small-group-production-first.md) and [ADR-0040](0040-guided-personal-organization-provisioning.md)

V1 is the first production release of insecur, not a dev-only milestone or single-owner secret store. V1 targets Small-Group Production because the primary near-term use case is personal projects and relatively small trusted groups; production use still requires the tenant-first authorization model, short-lived machine access, tenant-bound encryption and key versioning, audit/export integrity, and security release gates before valuable secrets are stored. Public abuse controls are required before broad public signup is enabled.

Production Secret Delivery and Secret Sync are additionally blocked by the [Storage Security Gate](../storage-security-gate.md). They must fail closed until root key material lives outside the Postgres metadata store, tenant data keys and key versions exist, Tenant-Scoped Store/RLS is active, Provider Credentials and Sensitive Metadata are encrypted under tenant-bound data keys, ciphertext identity binding is verified, and no-plaintext persistence tests pass. Only opaque resource IDs and Display Names may remain plaintext for lookup.

V1 does not include general search over Sensitive Metadata. User-friendly identification comes from authorized Scoped Lists, Configured Selectors, opaque IDs, and Display Names shown after authorization. Configured Selectors are opaque IDs, not plaintext names or slugs. Plaintext search indexes over Approval Context Notes, Push Device Registrations, provider target names, policy binding names, and security-relevant relationships are out of scope for v1.

Provider authorization callbacks for App Connections are part of the multi-tenant security baseline. They must use one-time tenant-bound state, re-check Organization Access after the provider returns, verify the returned provider account or installation against the intended Connection Boundary, and fail closed rather than linking provider resources across organizations.
