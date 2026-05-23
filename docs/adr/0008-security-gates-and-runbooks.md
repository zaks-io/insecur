# ADR-0008: Security Gates And Runbooks

Date: 2026-05-23

Status: Accepted

insecur will treat security runbooks and release gates as product requirements, not post-launch chores. Before v1 production use, the project needs threat model review, cross-tenant authorization tests, auth/session review, key rotation and restore drills, app connection revocation tests, audit export tests, CLI non-interactive flow tests, dependency scanning, and secret scanning.

## Consequences

Security work must be captured in docs and automation. Runbooks should include dry-run, execution, verification, expected audit events, and recovery notes. A future `pnpm security:check` should provide an agent-friendly local gate mapped to OWASP ASVS, OWASP API Security Top 10, and the project's own tenant/security invariants.
