# Packages

This directory contains domain packages for insecur. The package map lives in
`../docs/context-map.md`; the glossary lives in `../CONTEXT.md`.

Packages are cut around deep modules with explicit Interfaces, not around
database tables, routes, or every heading in the glossary.

Each package has a local `CONTEXT.md` file. Use it as the first package-local
reading map before loading slices of the root `../CONTEXT.md`.

## Current Scaffold

- `@insecur/domain` - shared domain primitives and stable vocabulary shapes
- `@insecur/auth` - WorkOS session composition, User actor context, and CLI exchange contract
- `@insecur/access` - Effective Access Resolver and scope-first authorization
- `@insecur/tenant-store` - Tenant-Scoped Store and RLS adapter contract
- `@insecur/crypto` - Keyring and Encryption Envelope
- `@insecur/audit` - Audit Event Writer
- `@insecur/release-gate` - Security Evidence Bundle assembly and release-gate skeleton
- `@insecur/secret-store` - Secret Version Store and Blind Secret Write rules
- `@insecur/runtime-injection` - Runtime Injection Grant Service
- `@insecur/onboarding` - Guided Organization Provisioning
- `@insecur/cli` - local CLI composition and command execution

## Package README Checklist

Each package README should keep these sections current:

- Owns
- Consumes
- Does Not Own
- Interface Tests
- Dependency Rule

Each package `CONTEXT.md` should keep these sections current:

- Role
- Read First
- Terms To Load
- Adjacent Terms
- Owns
- Does Not Own

When implementation starts, add concrete exported Interface docs before adding
callers. The README is the contract reviewers should check first.
