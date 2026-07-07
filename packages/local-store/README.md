# @insecur/local-store

Local Mode machine root key custody and encrypted local Secret Version Store
for insecur CLI workflows.

## Owns

- `KeyStore` interface and factory (`createKeyStore`).
- macOS Keychain adapter via `/usr/bin/security`.
- Windows DPAPI adapter via built-in `powershell.exe`.
- Linux `secret-tool` adapter when the binary is on `PATH`.
- Documented `0600` file fallback under the insecur user config directory.
- Metadata-only file-fallback notice (`local_store.file_fallback_active`).
- SQLite local store (`local-store.sqlite`) for Projects, Environments, Secret Shapes, and wrapped Current Versions only.
- Local contract seams (`LocalSecretVersionStore`, `LocalInjectionGrantStore`, `LocalProjectMetadataStore`, `LocalAuditWriter`).
- `createLocalStore` factory wiring the machine root key into the standard encryption envelope.
- `decryptLocalSecretForInjection` for Local Mode `run` injection reads only.

## Consumes

- Node.js built-ins (`node:child_process`, `node:crypto`, `node:fs`, `node:sqlite`).
- `@insecur/crypto` for envelope encryption and keyring construction.
- `@insecur/domain` for opaque resource IDs.

## Does Not Own

- CLI command wiring.
- Passphrase or daemon unlock modes (rejected in ADR-0080).
- Version history, backup, or export.
- Hosted tenant store or network paths.

## Security Notes

See `docs/SECURITY-NOTES.md` for adapter-specific threat boundaries, including
the macOS `add-generic-password` argv visibility window and the tamperable local
audit trail.

## Dependency Rule

This package must not add bundled native keychain libraries or production
dependencies with lifecycle scripts.

## Integration Tests

The OS keychain integration test is opt-in only. Set
`INSECUR_LOCAL_STORE_OS_INTEGRATION=1` to run it locally; routine `pnpm test`
skips it. The test uses dedicated service/account identifiers and an isolated
config directory so it never touches production Local Mode custody slots.
