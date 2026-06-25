# @insecur/machine-auth

Machine Identity auth method exchange for CI trust boundaries.

## Owns

- GitHub Actions OIDC federation exchange for short-lived machine access tokens.
- Trusted source validation (repository, environment, audience).
- Exchange audit events with metadata-only denial facts.

## Does not own

- Effective Access resolution, human sessions, or Worker routes.
