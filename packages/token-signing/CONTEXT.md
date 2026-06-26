# @insecur/token-signing Context

Scoped context for agents working in `packages/token-signing`. This file is a
reading map, not an independent glossary. Authoritative term definitions live in
`../../CONTEXT.md`.

## Role

This package owns the shared HS256/HMAC signed-token codec used by human-auth and
machine-auth token minting. It encodes payloads, verifies signatures, and
decodes JSON object payloads. Claim validation stays in the owning auth modules.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../auth/CONTEXT.md`
- `../machine-auth/CONTEXT.md`

## Owns

- HS256-shaped `header.body.signature` token encoding.
- HMAC-SHA256 signature verification.
- Safe base64url and JSON object payload decoding.
- Fail-closed handling for malformed token structure.

## Does Not Own

- Ephemeral CLI credential or scoped hop-token claim validation (`@insecur/auth`).
- Machine Access Token claim validation (`@insecur/machine-auth`).
- Root-key custody or tenant encryption (`@insecur/crypto`).
