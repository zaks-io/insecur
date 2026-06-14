# @insecur/cli Context

Scoped context for agents working in `packages/cli`. This file is a reading map,
not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

The CLI owns local command ergonomics, safe input collection, non-secret local
configuration, child process spawning, and metadata-only output. Server-side
domain decisions stay in the Worker and domain packages.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/cli-and-sync.md`
- `../../docs/first-value-milestone.md`

## Terms To Load

- CLI Profile
- CLI Profile Slug
- Runtime Injection
- Runtime Injection Policy
- Injection Grant
- Runtime Trust Boundary
- Command Output Boundary
- Safe Sensitive Input Path
- Exact Stdin Value Input
- Masked Secret Prompt
- Resolved Target Echo
- First Value Proof

## Adjacent Terms

- Local Secret File
- Local Secret File Migration
- Import Preflight
- Secret Import Plan
- Variable Key Prefix

## Owns

- Command parsing.
- Safe CLI input paths.
- Non-secret local project configuration.
- Child process spawning for `insecur run`.
- Human and JSON output formatting.

## Does Not Own

- Effective Access decisions.
- Secret Version storage.
- Encryption.
- Runtime Injection Grant persistence.
- Provider delivery decisions.
