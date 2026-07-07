# Security Notes

## macOS Keychain (`security`)

`add-generic-password` passes the machine root key through argv. A same-user
process can observe that value in `ps` during the brief store window. Local Mode
disclaims that adversary in ADR-0080; do not route the value through a shell
pipe or other string interpolation to "hide" it from argv, because that expands
the exposure surface without changing the disclaimed threat model.

## Process Output

Adapters may read key material from a child process stdout. The insecur process
must never log that stdout, include it in thrown errors, or emit it through
CLI/JSON output paths.

Sensitive argv commands (for example macOS `add-generic-password -w`) must not
attach raw child-process failures as `KeyStoreError.cause`, because Node can
embed the command argv in the error object.

## File Fallback

The `0600` key file stores raw hex key material on disk. It is selected only when
no OS keystore adapter is available. Callers should surface
`local_store.file_fallback_active` as metadata-only posture guidance.

## Local Audit Trail

`LocalAuditWriter` persists metadata-only events in the local SQLite store for
developer convenience. The trail is **tamperable**: any same-user process with
filesystem access can insert, modify, or delete rows. It is not a security
control and must not be used for custody or compliance claims.

## Local Store Ciphertext

Wrapped Current Versions persist as opaque ciphertext bytes plus key-version
metadata only. No Sensitive Value plaintext is written to the SQLite file,
temporary files, or error paths. Decrypt is exported only through
`decryptLocalSecretForInjection` for Local Mode `run` injection.
