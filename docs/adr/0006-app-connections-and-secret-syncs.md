# ADR-0006: App Connections And Secret Syncs

Date: 2026-05-23

Status: Accepted

Provider access will be modeled as organization-owned app connections, while project-owned secret syncs map insecur secrets to provider destinations. App connections store encrypted provider credentials and a provider-specific connection method; secret syncs store source, target, mapping, and behavior metadata but never provider credentials.

## Consequences

This separates reusable provider authorization from per-project sync configuration. GitHub should use GitHub App installation tokens for Actions secrets, Vercel should use Vercel Integration OAuth for environment variables, and Cloudflare Worker secret sync should start with manually configured scoped Cloudflare API tokens unless Cloudflare exposes an install-style OAuth/provider app flow that supports Worker secret management.

Any scoped provider token method must be explicit, least-privileged, provider-revocable, encrypted as organization data, rotated through an audited workflow, and never use broad global API keys.
