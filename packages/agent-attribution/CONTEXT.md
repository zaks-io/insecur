# @insecur/agent-attribution Context

Scoped context for agents working in `packages/agent-attribution`. This file is a
reading map, not an independent glossary.

## Role

This package owns Agent Session attribution: which harness an actor is running under,
which Agent Session a request belongs to, and what attribution tier that earns. It is
the source of the attribution fields on `whoami` and on audit actor context.

## Read First

- `../../docs/adr/0032-agent-session-execution-and-step-up.md`
- `../../docs/adr/0079-agent-context-plaintext-prohibition.md`
- `../../CONTEXT-MAP.md`
- `packages/auth/CONTEXT.md`
- `packages/access/CONTEXT.md`

## Terms To Load

- `../../docs/context/glossary/access-authorization.md`
- `../../docs/context/glossary/sensitive-data-safety.md`

## Adjacent Terms

- Audit Event authorship lives in `packages/audit/CONTEXT.md`.
- Step-up and challenge evidence live in `packages/high-assurance/CONTEXT.md`.

## Owns

- Known harness marker catalog and environment-based harness detection.
- Derived harness name validation for caller-supplied codes.
- Agent Session registration, lookup, and ancestry keys for nested runs.
- Attribution tier resolution and the `whoami` field projections.

## Does Not Own

- Human authentication or session minting (`@insecur/auth`).
- Effective Access resolution (`@insecur/access`).
- Audit event persistence (`@insecur/audit`).
- Any CLI or route surface that displays attribution.
