# @insecur/local-store

Local Mode machine root key custody for insecur CLI workflows.

This package exposes a substitutable `KeyStore` seam that stores the machine root
key in OS keystores when available and falls back to a `0600` key file when no OS
adapter is present.

## Owns

- `KeyStore` interface and factory (`createKeyStore`).
- macOS Keychain adapter via `/usr/bin/security`.
- Windows DPAPI adapter via built-in `powershell.exe`.
- Linux `secret-tool` adapter when the binary is on `PATH`.
- Documented `0600` file fallback under the insecur user config directory.
- Metadata-only file-fallback notice (`local_store.file_fallback_active`).

## Consumes

- Node.js built-ins only (`node:child_process`, `node:crypto`, `node:fs`).

## Does Not Own

- Encrypted local secret storage (next slice).
- CLI command wiring.
- Passphrase or daemon unlock modes (rejected in ADR-0080).
- Instance or tenant key hierarchy above the machine root key.

## Security Notes

See `docs/SECURITY-NOTES.md` for adapter-specific threat boundaries, including
the macOS `add-generic-password` argv visibility window.

## Dependency Rule

This package must not add bundled native keychain libraries or production
dependencies with lifecycle scripts.
