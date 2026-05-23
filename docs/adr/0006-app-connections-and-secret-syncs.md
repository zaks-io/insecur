# ADR-0006: App Connections And Secret Syncs

Date: 2026-05-23

Status: Accepted

Provider access will be modeled as organization-owned app connections, while project-owned secret syncs map insecur secrets to provider destinations. App connections store encrypted provider credentials and a provider-specific connection method; secret syncs store source, target, mapping, and behavior metadata but never provider credentials.

## Consequences

This separates reusable provider authorization from per-project sync configuration. GitHub should prefer GitHub App installation, Vercel should prefer integration OAuth, and Cloudflare should prefer OAuth/provider app flows where supported. If a provider endpoint requires scoped API tokens, that method must be explicit, least-privileged, provider-revocable, encrypted as organization data, and never use broad global API keys.
