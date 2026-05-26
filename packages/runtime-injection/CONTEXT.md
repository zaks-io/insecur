# @insecur/runtime-injection Context

Scoped context for agents working in `packages/runtime-injection`. This file is
a reading map, not an independent glossary. Authoritative term definitions live
in `../../CONTEXT.md`.

## Role

This package owns server-side Runtime Injection decisions and one-use Injection
Grant state. CLI child process execution stays in `@insecur/cli`.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/context-map.md`
- `../../docs/first-value-milestone.md`
- `../../docs/cli-and-sync.md`
- `../../docs/adr/0016-delivery-first-secret-egress.md`

## Terms To Load

- Runtime Injection
- Diskless Development Secret Use
- Runtime Injection Policy
- Runtime Injection Policy Version
- Runtime Policy Version Retention
- Runtime Policy Key
- Injection Grant
- Runtime Injection Grant Service
- Command Fingerprint
- Runtime Trust Boundary
- Command Output Boundary
- Forensic Traceability
- Secret Use
- First Value Proof

## Adjacent Terms

- Storage Security Gate
- Protected Environment
- Environment Deploy Key
- Machine Identity
- Delivery Risk Policy
- Agent-Reachable Channel

## Owns

- Injection Grant issue and consume rules.
- One-use grant invariants.
- Exact Variable Key delivery decisions.
- Runtime Injection Policy evaluation when implemented.
- Metadata-only run result and denial shapes.

## Does Not Own

- CLI child process spawning.
- Child stdout or stderr capture.
- Secret Version append behavior.
- Provider Secret Sync.
- Protected Environment approval.

