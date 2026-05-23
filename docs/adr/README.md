# ADR Index

Architectural decisions for insecur live here. ADRs are intentionally short records of decisions that are costly to reverse, surprising without context, or likely to be re-litigated.

## Accepted

- [ADR-0001: Tenant-First Control Plane](0001-tenant-first-control-plane.md)
- [ADR-0002: Cloudflare-Native Focused Stack](0002-cloudflare-native-focused-stack.md)
- [ADR-0003: Human Authentication And Authorization](0003-human-authentication-and-authorization.md)
- [ADR-0004: Machine Identities And CI Auth](0004-machine-identities-and-ci-auth.md)
- [ADR-0005: Key Hierarchy And Rotation](0005-key-hierarchy-and-rotation.md)
- [ADR-0006: App Connections And Secret Syncs](0006-app-connections-and-secret-syncs.md)
- [ADR-0007: Developer-First CLI Contract](0007-developer-first-cli-contract.md)
- [ADR-0008: Security Gates And Runbooks](0008-security-gates-and-runbooks.md)

## Open Questions To Grill

- Whether human MFA should be delegated entirely to GitHub/identity provider policy or implemented directly with WebAuthn/TOTP.
- Whether Cloudflare Worker secret sync can use an OAuth/provider app flow for all required API calls or must start with scoped API tokens.
- Whether sync execution should run entirely in Workers or use Durable Objects/Queues for locking and retries.
- Whether audit export needs tamper-evident chaining in Phase 2 or can wait until after tenant and sync implementation.
- Whether `.insecur.json` should use slugs only or include stable IDs after first resolution.
