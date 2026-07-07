# @insecur/local-store Context

Scoped context for agents working in `packages/local-store`. This file is a
reading map, not an independent glossary.

## Role

This package owns Local Mode machine root key custody behind a substitutable
`KeyStore` seam and the encrypted local Secret Version Store behind the same
contract seams as hosted storage (current versions only).

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0080-local-mode-accountless-development-custody.md`
- `docs/SECURITY-NOTES.md`

## Terms To Load

- Local Mode

## Adjacent Terms

- Keyring
- Secret Version Store
- Injection Grant
- Instance root key conventions in `packages/crypto/CONTEXT.md`

## Owns

- `KeyStore` get-or-create machine root key seam.
- macOS, Windows DPAPI, Linux `secret-tool`, and file-fallback adapters.
- Encrypted SQLite local store for Projects, Environments, Secret Shapes, and wrapped Current Versions.
- Local contract seams: `LocalSecretVersionStore`, `LocalInjectionGrantStore`, `LocalProjectMetadataStore`, `LocalAuditWriter`.
- Machine-scoped organization sentinel for ciphertext identity binding.
- `decryptLocalSecretForInjection` (injection read path only).

## Does Not Own

- CLI command wiring.
- Passphrase or daemon unlock modes (rejected in ADR-0080).
- Version history, backup, or export.
