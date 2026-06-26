# @insecur/token-signing

Shared HS256/HMAC signed-token codec for insecur auth modules.

This package owns token encoding, signature verification, and safe JSON object
payload decoding. Callers validate concrete `typ`, `aud`, `exp`, and scope claims.

## Owns

- HS256-shaped `header.body.signature` token encoding.
- HMAC-SHA256 signature verification.
- Safe base64url and JSON object payload decoding.

## Consumes

- `@insecur/domain` for base64url helpers.

## Does Not Own

- Human session or scoped hop-token claim validation (`@insecur/auth`).
- Machine Access Token claim validation (`@insecur/machine-auth`).
- Root-key or Encryption Envelope behavior (`@insecur/crypto`).

## Dependency Rule

This package may depend on `@insecur/domain`. It must not depend on
`@insecur/auth`, `@insecur/machine-auth`, or `@insecur/crypto`.
