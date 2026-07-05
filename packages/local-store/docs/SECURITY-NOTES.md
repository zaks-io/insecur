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

## File Fallback

The `0600` key file stores raw hex key material on disk. It is selected only when
no OS keystore adapter is available. Callers should surface
`local_store.file_fallback_active` as metadata-only posture guidance.
