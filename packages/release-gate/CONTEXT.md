# @insecur/release-gate Context

Scoped context for agents working in `packages/release-gate`. This file is a
reading map, not an independent glossary.

## Role

This package owns Security Evidence Bundle assembly and the initial security
check skeleton consumed by release gates.

## Read First

- `../../CONTEXT-MAP.md`
- `../../docs/security-runbooks-and-release-gates.md`
- `../../docs/build-tooling.md`

## Terms To Load

- Security Release Gate
- Security Evidence Bundle
- Security Runbook

## Adjacent Terms

- Audit Export
- Secret-Free Logging

## Owns

- Bundle schema and control collectors.
- Metadata-only secret-scan summaries.
- Fail-closed verdict derivation for missing or failed evidence.

## Does Not Own

- Scanner tooling, CI job execution, or production signoff authority.
