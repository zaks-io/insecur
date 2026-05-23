# ADR-0004: Machine Identities And CI Auth

Date: 2026-05-23

Status: Accepted

Machine access will use organization-owned machine identities that exchange an auth method for short-lived access tokens. GitHub Actions OIDC is the preferred CI auth method because it avoids storing long-lived insecur tokens in GitHub; bootstrap client credentials are allowed only as a narrow fallback.

## Consequences

The existing long-lived machine token model remains a Phase 1 scaffold. The target model needs machine identity tables, auth method tables, scoped access tokens, credential rotation, trusted source constraints where practical, audit events for token exchange and reuse failures, and CLI support for non-interactive auth.
