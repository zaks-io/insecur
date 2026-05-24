# ADR-0015: Production V1 Security Baseline

Date: 2026-05-23

Status: Accepted

V1 is the first production release of insecur, not a dev-only milestone, single-organization stepping stone, self-hosted shortcut, or closed bootstrap deployment. V1 is public multi-tenant production from day one because the product stores valuable secrets and must assume unrelated hostile tenants, hostile automation, compromised credentials, confused-deputy attempts, prompt-injected agents, quota abuse, tenant enumeration, and hostile onboarding attempts. The current scaffold is disposable learning infrastructure; production use requires the tenant-first authorization model, short-lived machine access, tenant-bound encryption and key versioning, audit/export integrity, public abuse controls, and security release gates before valuable secrets are stored.

Production Secret Sync and Runtime Injection are additionally blocked by the Storage Security Gate. They must fail closed until root key material lives outside D1, organization and project data keys exist, provider credentials and Sensitive Metadata are encrypted under tenant-bound data keys, key versions are tracked, and AES-GCM authenticated data binds ciphertext to organization, project, environment, secret, version, app connection, provider credential, and sensitive metadata identity. Only opaque resource IDs and Display Names may remain plaintext for lookup.

V1 does not include general search over Sensitive Metadata. User-friendly identification comes from authorized Scoped Lists, Configured Selectors, opaque IDs, and Display Names shown after authorization. Configured Selectors are opaque IDs, not plaintext names or slugs. Plaintext search indexes over Approval Context Notes, Push Device Registrations, provider target names, policy binding names, and security-relevant relationships are out of scope for v1.

Provider authorization callbacks for App Connections are part of the multi-tenant security baseline. They must use one-time tenant-bound state, re-check Organization Access after the provider returns, verify the returned provider account or installation against the intended Connection Boundary, and fail closed rather than linking provider resources across organizations.
