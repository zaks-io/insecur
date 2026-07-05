# @insecur/local-store Context

Scoped context for agents working in `packages/local-store`. This file is a
reading map, not an independent glossary.

## Role

This package owns Local Mode machine root key custody behind a substitutable
`KeyStore` seam. It provides OS keychain adapters without bundled native
dependencies and a documented weaker file fallback.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/adr/0080-local-mode-accountless-development-custody.md`
- `docs/SECURITY-NOTES.md`

## Terms To Load

- Local Mode

## Adjacent Terms

- Keyring
- Instance root key conventions in `packages/crypto/CONTEXT.md`

## Owns

- `KeyStore` get-or-create machine root key seam.
- macOS, Windows DPAPI, Linux `secret-tool`, and file-fallback adapters.
- Stable service/account naming for machine root key storage.
- Metadata-only file-fallback notice.

## Does Not Own

- Encrypted local store persistence.
- CLI command wiring.
- Secret Version lifecycle or encryption envelopes.
