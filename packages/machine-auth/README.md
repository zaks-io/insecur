# @insecur/machine-auth

Machine Identity auth method exchange for CI trust boundaries.

## Owns

- GitHub Actions OIDC federation exchange for short-lived machine access tokens.
- Trusted source validation (repository, environment, audience).
- Machine access token minting and verification.
- Exchange audit events with metadata-only denial facts.

## Consumes

- `@insecur/domain` for shared identifiers and vocabulary.
- `@insecur/access` for the Effective Access resolution it defers to.
- `@insecur/tenant-store` for Machine Identity and trusted-source persistence.
- `@insecur/token-signing` for minting and verifying machine access tokens.
- `@insecur/audit` for exchange audit events.

## Does Not Own

- Effective Access resolution, human sessions, Machine Identity membership persistence, Worker
  route/API composition, or Environment Deploy Keys.
