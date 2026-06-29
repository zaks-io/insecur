# @insecur/auth

Human authentication session composition for the insecur API Worker.

## Owns

- WorkOS sealed session validation behind `WorkOSSessionPort`.
- Memory-only CLI ephemeral session credentials (HMAC-signed, short-lived).
- `UserActor` resolution for admitted Users.
- CSRF helpers for browser session cookie mutations.
- CLI PKCE authorization-code exchange contract (`exchangeCliPkceSession`).

## Consumes

- `@insecur/domain` for stable auth error codes, envelopes, and `UserId`.

## Does Not Own

- Effective Access (`@insecur/access`).
- CLI login/shell commands (`@insecur/cli`).
- User persistence and admission workflows (callers supply `AdmittedUserResolver`).

## Interface Tests

Tests cover authenticated, missing, expired, and invalid credential paths without
logging or persisting session material.

## Dependency Rule

This package may depend on `@insecur/domain` and `@workos-inc/node`. It must not
depend on `@insecur/access`, `@insecur/tenant-store`, or route handlers.
