# @insecur/auth Context

Scoped context for agents working in `packages/auth`. This file is a reading map,
not an independent glossary. Authoritative term definitions live in the per-domain slices under `../../docs/context/glossary/`, indexed by `../../CONTEXT.md`. Load only the slice your task needs.

## Role

This package owns human authentication session composition for the API Worker:
WorkOS sealed session validation, CLI ephemeral credential minting, CSRF posture
for browser session cookies, and typed User actor resolution for admitted Users.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/cli-and-sync.md`
- `../../docs/adr/0010-workos-authkit-for-human-authentication.md`
- `../../docs/adr/0032-agent-session-execution-and-step-up.md`

## Terms To Load

- User
- External Subject
- Ephemeral CLI Credential
- Actor
- High-Assurance Challenge

## Owns

- User actor context for admitted Users.
- WorkOS sealed session authentication port.
- CLI session exchange contract and ephemeral credential format.
- CSRF validation helpers for browser session mutations.

## Does Not Own

- Effective Access or Role expansion (`@insecur/access`).
- CLI command implementations (`@insecur/cli`).
- WorkOS hosted login UI or MFA enrollment flows.
- Machine Identity or GitHub OIDC exchange.
