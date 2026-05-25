# ADR-0011: Provider Connection Method Matrix

Date: 2026-05-23

Status: Accepted

> Superseded in part: the Cloudflare **Connection Method** (scoped API token) still holds, but the Cloudflare sync target is now direct per-Worker secrets on explicit Worker scripts (ADR-0039). ADR-0023's account-level Cloudflare Secrets Store target is superseded. The per-Instance app-registration mechanism behind GitHub App installations and Vercel Integration OAuth is recorded in ADR-0022.

Provider sync connections will use the strongest revocable provider mechanism available for the target API: GitHub App installations for GitHub Actions secrets, Vercel Integration OAuth for Vercel environment variables, and scoped Cloudflare API tokens for direct Worker secrets until a suitable Cloudflare app/OAuth install flow exists for that API.

GitHub Actions syncs are project-specific in insecur and normally target one GitHub repository. Protected Environment syncs target existing GitHub Environment secrets inside that repository by default. insecur must not auto-create GitHub Environments for protected syncs, and protected syncs block when the target GitHub Environment has no visible protection rules. Repository-wide GitHub Actions secrets are allowed only when the workflow genuinely needs repository-wide availability or does not use GitHub Environments.

## Consequences

The product must not flatten all provider access into pasted API keys. Vercel should not start as a manual-token integration because Vercel supports integration OAuth and integration-owned environment-variable permissions. Cloudflare is the manual-token exception for now, so Cloudflare setup must include least-privilege token guidance, encrypted storage, rotation, revocation instructions, and audit events.

Cloudflare app connections may cover a Cloudflare account when provider token permissions cannot be narrowed further, but each connection must declare a connection boundary and each secret sync must pin explicit target Workers and environments. Sensitive projects should be able to require stricter per-Worker Cloudflare app connections.
