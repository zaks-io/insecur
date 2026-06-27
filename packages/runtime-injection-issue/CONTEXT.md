# @insecur/runtime-injection-issue Context

Scoped context for agents working in `packages/runtime-injection-issue`. This file is a reading
map, not an independent glossary. Authoritative term definitions live in the per-domain slices
under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task
needs.

## Role

This package owns the public-safe Injection Grant issue path and selector contracts. It performs
authorization and metadata-only grant creation without depending on the Runtime-only decrypt path or
crypto implementation.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/first-value-milestone.md`
- `../../docs/cli-and-sync.md`
- `../../docs/adr/0016-delivery-first-secret-egress.md`
- `../../docs/adr/0034-effective-access-resolver.md`
- `../../docs/adr/0038-protected-delivery-requires-machine-credential.md`
- `../../docs/adr/0074-injection-grant-lifecycle-and-revocation.md`

## Terms To Load

- Runtime Injection
- Injection Grant
- Runtime Injection Grant Service
- Runtime Injection Policy
- Runtime Injection Policy Version
- Command Fingerprint
- Forensic Traceability
- Secret Use
- Effective Access Resolver
- Authorization Scope

## Adjacent Terms

- Diskless Development Secret Use
- Runtime Trust Boundary
- Command Output Boundary
- Machine Identity
- Audit Event Writer

## Owns

- Injection Grant issue selectors and selector normalization.
- Issuance authorization checks for non-protected and protected coordinates.
- Grant binding resolution before consume.
- Metadata-only issue audit and denial behavior.
- Injection Grant error class for public-safe failures.

## Does Not Own

- Decrypt, Keyring access, or Runtime delivery (`@insecur/runtime-injection` and `apps/runtime`).
- CLI child process spawning or output handling.
- Secret Version append/current persistence.
- Provider sync or Protected Environment approval.
