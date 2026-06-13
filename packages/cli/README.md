# @insecur/cli

Node CLI for local project configuration, safe sensitive input collection,
runtime injection command execution, and agent-safe metadata-only output.

The CLI composes server-side package Interfaces through HTTP or local command
helpers. It does not own server-side domain invariants.

## Owns

- Command parsing and help text.
- Safe stdin and masked prompt collection for CLI callers.
- Non-secret local project configuration such as `.insecur.json`.
- Local child process spawning for `insecur run`.
- Human and JSON output formatting.
- HTTP client behavior for the Worker API.

## Consumes

- Server-side Interfaces exposed by the public API Worker (`apps/api`).
- Shared result and output vocabulary from `@insecur/domain` when implementation
  begins.

## Does Not Own

- Effective Access decisions.
- Tenant-Scoped Store behavior.
- Encryption or Keyring behavior.
- Secret Version storage.
- Runtime Injection Grant state.
- Provider delivery decisions.

## Interface Tests

CLI tests should prove command flags, safe input paths, local config behavior,
metadata-only output, and child process execution behavior. Server-side domain
invariants should be tested in the owning package.

## Dependency Rule

This package may depend on shared domain packages for types and output shapes,
but must not bypass the Worker API for server-owned behavior.
