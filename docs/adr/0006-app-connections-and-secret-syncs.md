# ADR-0006: App Connections And Secret Syncs

Date: 2026-05-23

Status: Accepted

Provider access will be modeled as organization-owned app connections, while project-owned secret syncs map insecur secrets to provider destinations. App connections store encrypted provider credentials and a provider-specific connection method; secret syncs store source, target, mapping, and behavior metadata but never provider credentials.

Secret Sync destinations are derived provider copies. insecur remains the Secret Source of Truth for rotation, replacement, rollback, and audit.

Production Secret Sync depends on the Storage Security Gate. Sync models and provider adapters may be built before the gate for scaffold validation, but production sync must fail closed until tenant-bound encryption for source Secrets, App Connection Provider Credentials, and Sensitive Metadata is implemented and verified.

## Consequences

This separates reusable provider authorization from per-project sync configuration. GitHub should use GitHub App installation tokens for Actions secrets, and Protected Environment syncs should target existing GitHub Environment secrets inside the selected repository by default. insecur must not auto-create GitHub Environments for protected syncs because that could bypass expected provider-side approval or deployment protection rules. Protected Environment GitHub Actions syncs block when the target GitHub Environment has no visible protection rules. Vercel should use Vercel Integration OAuth for environment variables, and Cloudflare Worker secret sync should start with manually configured scoped Cloudflare API tokens unless Cloudflare exposes an install-style OAuth/provider app flow that supports Worker secret management. All provider credentials are organization-owned sensitive data encrypted under organization data keys with key version metadata and authenticated-data binding. Provider target names, policy binding names, and other security-relevant sync relationship names are Sensitive Metadata and must be encrypted at rest; plaintext lookup fields are limited to opaque resource IDs.

Any scoped provider token method must be explicit, least-privileged, provider-revocable, encrypted as organization data, rotated through an audited workflow, and never use broad global API keys.
