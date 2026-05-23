# ADR-0011: Provider Connection Method Matrix

Date: 2026-05-23

Status: Accepted

Provider sync connections will use the strongest revocable provider mechanism available for the target API: GitHub App installations for GitHub Actions secrets, Vercel Integration OAuth for Vercel environment variables, and scoped Cloudflare API tokens for Cloudflare Worker secrets until a suitable Cloudflare app/OAuth install flow exists for that API.

## Consequences

The product must not flatten all provider access into pasted API keys. Vercel should not start as a manual-token integration because Vercel supports integration OAuth and integration-owned environment-variable permissions. Cloudflare is the manual-token exception for now, so Cloudflare setup must include least-privilege token guidance, encrypted storage, rotation, revocation instructions, and audit events.

Cloudflare app connections may cover a Cloudflare account when provider token permissions cannot be narrowed further, but each connection must declare a connection boundary and each secret sync must pin explicit target Workers and environments. Sensitive projects should be able to require stricter per-Worker Cloudflare app connections.
